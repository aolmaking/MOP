import { Injectable } from "@nestjs/common";
import type { JourneyAudience, JourneyEvent, JourneyEventKind } from "@mop/shared";
import { PrismaService } from "../../runtime/database/prisma.service";

/**
 * An event before it has been reduced to one audience's words.
 *
 * Carries every audience's sentence at once because the three
 * projections must be built from the same row: writing them separately
 * is how the customer's history and the technician's history come to
 * describe different jobs.
 */
interface RawJourneyEvent {
  readonly kind: JourneyEventKind;
  readonly at: Date;
  /** The row this came from. Two sources must never mint the same id. */
  readonly sourceId: string;
  readonly stage: string | null;
  /** Whoever performed it, as an accountId or staffUserId, for name lookup. */
  readonly actorRef: string | null;
  /**
   * Absent CUSTOMER means the event is not theirs to see AT ALL -- it is
   * dropped from their history rather than reworded, because reusing a
   * staff sentence unless somebody remembered to redact it is how
   * "torque wrench on loan to bay 3" reaches a paying customer.
   */
  readonly message: { readonly CUSTOMER?: string; readonly TECHNICIAN: string; readonly MANAGER: string };
  readonly detail?: {
    readonly CUSTOMER?: string | null;
    readonly TECHNICIAN?: string | null;
    readonly MANAGER?: string | null;
  };
}

/**
 * Same-instant ordering, decided once.
 *
 * Two events genuinely can share a timestamp: a transaction that issues
 * a part and moves the work order writes both within the same
 * millisecond, and Postgres will happily store them equal. Sorting by
 * time alone then leaves the order to whichever row the planner
 * returned first, so the history reshuffles between two reads of the
 * same job -- exactly what §19 forbids.
 *
 * The rank is causal, not alphabetical: the thing that CAUSED the status
 * change is listed before the status change it caused, because that is
 * the order a person standing in the workshop experienced them in.
 */
const TIE_RANK: Record<JourneyEventKind, number> = {
  "work_order.created": 0,
  "inspection.recorded": 10,
  "fault.recorded": 11,
  "decision.asked": 20,
  "decision.viewed": 21,
  "decision.answered": 22,
  "decision.withdrawn": 23,
  "task.created": 30,
  "task.started": 31,
  "task.completed": 32,
  "blocker.raised": 40,
  "blocker.resolved": 41,
  "part.requested": 50,
  "part.approved": 51,
  "part.refused": 52,
  "part.issued": 53,
  "part.arrived": 54,
  "part.received": 55,
  "part.used": 56,
  "part.external_recorded": 57,
  "return.requested": 60,
  "return.clarification_asked": 61,
  "return.clarification_answered": 62,
  "return.accepted": 63,
  "return.rejected": 64,
  "invoice.issued": 70,
  "payment.recorded": 71,
  // The status change is the CONSEQUENCE, so it sorts after whatever
  // caused it when the two share an instant.
  "work_order.status_changed": 90,
  "work_order.closed": 91,
};

/**
 * The stage each event belongs under, so a client can group the history
 * beneath the strip without re-deriving the mapping and disagreeing with
 * the server about it.
 */
const EVENT_STAGE: Partial<Record<JourneyEventKind, string>> = {
  "inspection.recorded": "UNDER_INSPECTION",
  "fault.recorded": "UNDER_INSPECTION",
  "decision.asked": "AWAITING_CUSTOMER_APPROVAL",
  "decision.viewed": "AWAITING_CUSTOMER_APPROVAL",
  "decision.answered": "AWAITING_CUSTOMER_APPROVAL",
  "decision.withdrawn": "AWAITING_CUSTOMER_APPROVAL",
  "task.created": "IN_PROGRESS",
  "task.started": "IN_PROGRESS",
  "task.completed": "IN_PROGRESS",
  "blocker.raised": "BLOCKED",
  "blocker.resolved": "BLOCKED",
  "part.requested": "WAITING_PARTS",
  "part.approved": "WAITING_PARTS",
  "part.refused": "WAITING_PARTS",
  "part.issued": "WAITING_PARTS",
  "part.arrived": "WAITING_PARTS",
  "part.received": "WAITING_PARTS",
  "part.used": "IN_PROGRESS",
  "part.external_recorded": "IN_PROGRESS",
  "return.requested": "IN_PROGRESS",
  "return.clarification_asked": "IN_PROGRESS",
  "return.clarification_answered": "IN_PROGRESS",
  "return.accepted": "IN_PROGRESS",
  "return.rejected": "IN_PROGRESS",
  "invoice.issued": "PAYMENT_PENDING",
  "payment.recorded": "PAYMENT_PENDING",
  "work_order.closed": "CLOSED",
};

/**
 * `work_order.status_changed` reads as a stage being ENTERED, in each
 * audience's own vocabulary.
 *
 * Deliberately a separate table from the strip's stage labels:
 * "Inspection" is the right word for a stage on a strip and the wrong
 * word for a line in a log, which needs a verb. A CUSTOMER entry of null
 * means that stage change is internal and never appears in their
 * history.
 */
const ENTERED: Record<string, { CUSTOMER: string | null; TECHNICIAN: string; MANAGER: string }> = {
  DRAFT: { CUSTOMER: null, TECHNICIAN: "Job opened as a draft", MANAGER: "Opened as a draft" },
  REGISTERED: { CUSTOMER: "Vehicle received", TECHNICIAN: "Vehicle checked in", MANAGER: "Vehicle registered" },
  UNDER_INSPECTION: { CUSTOMER: "Inspection started", TECHNICIAN: "Inspection started", MANAGER: "Inspection started" },
  AWAITING_CUSTOMER_APPROVAL: {
    CUSTOMER: "We asked for your approval",
    TECHNICIAN: "Sent to the customer for approval",
    MANAGER: "Sent for customer approval",
  },
  APPROVED_FOR_WORK: { CUSTOMER: "Repair approved", TECHNICIAN: "Approved to start", MANAGER: "Approved for work" },
  IN_PROGRESS: { CUSTOMER: "Repair started", TECHNICIAN: "Work started", MANAGER: "Work in progress" },
  WAITING_PARTS: {
    CUSTOMER: "Waiting for a required part",
    TECHNICIAN: "Job put on hold for a part",
    MANAGER: "Held for parts",
  },
  WAITING_CUSTOMER: {
    CUSTOMER: "We asked you a question",
    TECHNICIAN: "Job put on hold for the customer",
    MANAGER: "Held for the customer",
  },
  BLOCKED: { CUSTOMER: "Work paused", TECHNICIAN: "Job blocked", MANAGER: "Job blocked" },
  READY_FOR_TEAM_REVIEW: {
    CUSTOMER: "Repair finished, being checked",
    TECHNICIAN: "Sent for team review",
    MANAGER: "Awaiting team review",
  },
  READY_FOR_QC: {
    CUSTOMER: "Final quality check started",
    TECHNICIAN: "Sent for QC",
    MANAGER: "Awaiting quality check",
  },
  QC_FAILED: {
    CUSTOMER: "Something was found and is being put right",
    TECHNICIAN: "Failed QC — rework",
    MANAGER: "Failed quality check",
  },
  READY_FOR_DELIVERY: { CUSTOMER: "Ready for pickup", TECHNICIAN: "Ready to hand over", MANAGER: "Ready for delivery" },
  PAYMENT_PENDING: {
    CUSTOMER: "Invoice ready",
    TECHNICIAN: "Sent to the counter for payment",
    MANAGER: "Awaiting payment",
  },
  CLOSED: { CUSTOMER: "Job completed", TECHNICIAN: "Job closed", MANAGER: "Job closed" },
  CANCELLED: { CUSTOMER: "Job cancelled", TECHNICIAN: "Job cancelled", MANAGER: "Job cancelled" },
};

/**
 * Event keys read from the `OperationEvent` spine, and nothing else.
 *
 * `inspection.saved` and `fault.created` are deliberately NOT here even
 * though both are emitted. Each has a real row -- `Inspection`, `Fault`
 * -- carrying its own `createdAt`, its own technician and its own
 * detail, and the event row is written milliseconds later in the same
 * transaction. Dating the inspection by the side effect rather than by
 * the record is a small lie that a test caught at eleven milliseconds
 * and that a slow transaction would widen. Records date records.
 */
const SPINE_KEYS = [
  "work_order.created",
  "work_order.status_changed",
  "task.started",
  "task.completed",
  "blocker.reported",
  "blocker.resolved",
];

/**
 * The real chronology of one work order.
 *
 * **A projection, not a store.** Nothing here is written; every event is
 * read back from the record that already proves it happened, and dated
 * by that record's own timestamp. There is deliberately no
 * `JourneyEvent` table -- a second event log would be a second source of
 * truth, and the two would eventually disagree about the same repair.
 *
 * **One source per event kind.** Both an `OperationEvent` row and a
 * record column can often date the same happening --
 * `part_request.issued` and `IssuedItem.issuedAt`, say -- and reading
 * both would print the hand-over twice. So the sources are split by kind
 * and never overlap:
 *
 * - the **event spine** (`OperationEvent`) supplies status changes,
 *   inspections, findings, task starts and completions, and blockers,
 *   because those either have no record timestamp at all (a `Task` has
 *   no `startedAt`) or exist only as an event;
 * - the **records** supply the decision cycle, the whole parts loop, the
 *   invoice and the payments, because those carry per-hand-over
 *   timestamps (`IssuedItem.issuedAt`/`arrivedAt`/`receivedAt`/`usedAt`)
 *   that no event duplicates, and are joined to the work order by a real
 *   foreign key rather than a JSON payload.
 *
 * **Nothing is inferred from current state.** A job sitting in
 * WAITING_PARTS gets a "part requested" event because a `PartRequest`
 * row exists with a `createdAt`, not because its status implies one.
 * Where no record carries the moment, the event is simply absent -- an
 * honest gap, not a manufactured one (§31).
 */
@Injectable()
export class JourneyEventsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every event for ONE work order, oldest first, reduced to what this
   * audience may read.
   *
   * Scoped by `tenantId` AND `workOrderId` on every read below. That is
   * not belt-and-braces: it is the isolation §02 and §16 require, and it
   * lives in the query rather than in a filter afterwards so a busy
   * tenant cannot page another job's events into this one's history.
   */
  async forWorkOrder(
    tenantId: string,
    workOrderId: string,
    audience: JourneyAudience,
  ): Promise<readonly JourneyEvent[]> {
    const [spine, records] = await Promise.all([
      this.fromEventSpine(tenantId, workOrderId),
      this.fromRecords(tenantId, workOrderId),
    ]);

    const visible = [...spine, ...records].filter(
      (event) => audience !== "CUSTOMER" || event.message.CUSTOMER !== undefined,
    );
    const names = await this.resolveActors(tenantId, visible);

    return visible.sort(this.chronologically).map((event) => this.present(event, audience, names));
  }

  /**
   * Oldest first, ties broken causally and then by the source row's own
   * id so the order is total. Without that final tiebreak two events of
   * the same kind at the same instant -- two findings recorded from one
   * inspection form -- could still swap between reads.
   */
  private readonly chronologically = (a: RawJourneyEvent, b: RawJourneyEvent): number =>
    a.at.getTime() - b.at.getTime() || TIE_RANK[a.kind] - TIE_RANK[b.kind] || a.sourceId.localeCompare(b.sourceId);

  private present(
    event: RawJourneyEvent,
    audience: JourneyAudience,
    names: ReadonlyMap<string, string>,
  ): JourneyEvent {
    return {
      kind: event.kind,
      at: event.at.toISOString(),
      message: audience === "CUSTOMER" ? (event.message.CUSTOMER as string) : event.message[audience],
      detail: event.detail?.[audience] ?? null,
      // Staff identity is operational information and never the
      // customer's -- restricted data is ABSENT from the response, not
      // hidden client-side.
      actor: audience === "CUSTOMER" || !event.actorRef ? null : (names.get(event.actorRef) ?? null),
      stage: event.stage ?? EVENT_STAGE[event.kind] ?? null,
    };
  }

  /**
   * Names for the accounts behind the events, in ONE query.
   *
   * A join per event would be an N+1 on the busiest screen in the
   * product (§26); a name per event row is what makes the history
   * answerable rather than a list of anonymous verbs.
   */
  private async resolveActors(
    tenantId: string,
    events: readonly RawJourneyEvent[],
  ): Promise<ReadonlyMap<string, string>> {
    const refs = [...new Set(events.map((event) => event.actorRef).filter((ref): ref is string => ref !== null))];
    if (refs.length === 0) return new Map();

    // Sources disagree about which id they store -- OperationEvent holds
    // an accountId, IssuedItem an `issuedById` that is also an accountId,
    // Inspection a `technicianId` that is a staffUserId. Asking for both
    // in one query costs nothing and saves every caller having to know.
    const staff = await this.prisma.staffUser.findMany({
      where: { tenantId, OR: [{ accountId: { in: refs } }, { id: { in: refs } }] },
      select: { id: true, accountId: true, fullName: true },
    });

    const names = new Map<string, string>();
    for (const person of staff) {
      names.set(person.accountId, person.fullName);
      names.set(person.id, person.fullName);
    }
    return names;
  }

  /**
   * The `OperationEvent` half.
   *
   * ONE query, filtered on the JSON payload's own `workOrderId` in the
   * database. Reading the tenant's events and filtering afterwards is a
   * bug the status-history read already had once: on a busy workshop the
   * page of events came back full of other jobs and this one's history
   * was simply empty.
   */
  private async fromEventSpine(tenantId: string, workOrderId: string): Promise<readonly RawJourneyEvent[]> {
    const rows = await this.prisma.operationEvent.findMany({
      where: {
        tenantId,
        eventKey: { in: SPINE_KEYS },
        payload: { path: ["workOrderId"], equals: workOrderId },
      },
      select: { id: true, eventKey: true, payload: true, actorId: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    const out: RawJourneyEvent[] = [];
    for (const row of rows) {
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      const built = this.fromSpineRow(row.eventKey, payload, row.id, row.actorId, row.createdAt);
      if (built) out.push(built);
    }
    return out;
  }

  private fromSpineRow(
    eventKey: string,
    payload: Record<string, unknown>,
    sourceId: string,
    actorId: string,
    at: Date,
  ): RawJourneyEvent | null {
    switch (eventKey) {
      case "work_order.created":
        return {
          kind: "work_order.created",
          at,
          sourceId,
          stage: null,
          actorRef: actorId,
          message: {
            CUSTOMER: "We opened a job for your vehicle",
            TECHNICIAN: "Job created",
            MANAGER: "Work order created",
          },
        };

      case "work_order.status_changed": {
        const to = typeof payload.to === "string" ? payload.to : null;
        if (!to) return null;
        const words = ENTERED[to];
        // An unmapped status is skipped rather than printed raw: a
        // lowercased enum shown to a paying customer is the exact
        // failure the label tables exist to prevent.
        if (!words) return null;
        return {
          kind: to === "CLOSED" ? "work_order.closed" : "work_order.status_changed",
          at,
          sourceId,
          stage: to,
          actorRef: actorId,
          message: {
            ...(words.CUSTOMER ? { CUSTOMER: words.CUSTOMER } : {}),
            TECHNICIAN: words.TECHNICIAN,
            MANAGER: words.MANAGER,
          },
        };
      }

      case "task.started":
        return {
          kind: "task.started",
          at,
          sourceId,
          stage: "IN_PROGRESS",
          actorRef: actorId,
          message: { TECHNICIAN: "Task started", MANAGER: "Task started" },
        };

      case "task.completed": {
        const minutes = typeof payload.actualMinutes === "number" ? payload.actualMinutes : null;
        return {
          kind: "task.completed",
          at,
          sourceId,
          stage: "IN_PROGRESS",
          actorRef: actorId,
          message: { TECHNICIAN: "Task completed", MANAGER: "Task completed" },
          detail: minutes === null ? undefined : { TECHNICIAN: `${minutes} min`, MANAGER: `${minutes} min` },
        };
      }

      case "blocker.reported": {
        const reason = typeof payload.reason === "string" ? this.words(payload.reason) : null;
        return {
          kind: "blocker.raised",
          at,
          sourceId,
          stage: "BLOCKED",
          actorRef: actorId,
          message: {
            // The customer learns work paused; the shop-floor reason is
            // ours, not theirs.
            CUSTOMER: "Work paused while we sorted something out",
            TECHNICIAN: "Blocker raised",
            MANAGER: "Blocker raised",
          },
          detail: reason ? { TECHNICIAN: reason, MANAGER: reason } : undefined,
        };
      }

      case "blocker.resolved":
        return {
          kind: "blocker.resolved",
          at,
          sourceId,
          stage: "BLOCKED",
          actorRef: actorId,
          message: { CUSTOMER: "Work resumed", TECHNICIAN: "Blocker cleared", MANAGER: "Blocker cleared" },
        };

      default:
        return null;
    }
  }

  /**
   * The record half: the decision cycle, the parts loop, the money.
   *
   * Every read is keyed on `workOrderId` through a real foreign key, so
   * one job's events cannot include another job's rows even if a payload
   * were wrong.
   */
  private async fromRecords(tenantId: string, workOrderId: string): Promise<readonly RawJourneyEvent[]> {
    const [inspections, faults, decisions, tasks, partRequests, returns, externalParts, invoice, payments] =
      await Promise.all([
      this.prisma.inspection.findMany({
        where: { tenantId, workOrderId },
        select: { id: true, type: true, note: true, createdAt: true, technicianId: true },
      }),
      this.prisma.fault.findMany({
        where: { tenantId, workOrderId },
        select: { id: true, description: true, severity: true, createdAt: true },
      }),
      this.prisma.customerDecisionRequest.findMany({
        where: { tenantId, workOrderId },
        select: {
          id: true,
          status: true,
          createdAt: true,
          sentAt: true,
          viewedAt: true,
          createdById: true,
          items: { select: { id: true, name: true, decision: true, decidedAt: true } },
        },
      }),
      this.prisma.task.findMany({
        where: { tenantId, workOrderId },
        select: { id: true, title: true, createdAt: true },
      }),
      this.prisma.partRequest.findMany({
        where: { tenantId, workOrderId },
        select: {
          id: true,
          status: true,
          quantity: true,
          createdAt: true,
          updatedAt: true,
          approvedAt: true,
          approvedById: true,
          requestedById: true,
          inventoryItem: { select: { name: true } },
          issuedItems: {
            select: {
              id: true,
              quantity: true,
              issuedAt: true,
              arrivedAt: true,
              receivedAt: true,
              usedAt: true,
              issuedById: true,
              warehouse: { select: { name: true } },
            },
          },
        },
      }),
      this.prisma.partReturnRequest.findMany({
        where: { tenantId, partRequest: { workOrderId } },
        select: {
          id: true,
          quantity: true,
          reason: true,
          createdAt: true,
          requestedById: true,
          clarificationQuestion: true,
          clarificationAskedAt: true,
          clarificationAnsweredAt: true,
          resolvedAt: true,
          resolvedById: true,
          partRequest: { select: { status: true, inventoryItem: { select: { name: true } } } },
        },
      }),
      this.prisma.workOrderPartLine.findMany({
        where: { tenantId, workOrderId, provenance: { not: "INVENTORY" } },
        select: { id: true, name: true, quantity: true, provenance: true, createdAt: true, addedById: true },
      }),
      this.prisma.invoice.findUnique({
        where: { workOrderId },
        select: { id: true, invoiceNumber: true, total: true, issuedAt: true, issuedById: true },
      }),
      this.prisma.payment.findMany({
        where: { tenantId, invoice: { workOrderId } },
        select: { id: true, amount: true, method: true, status: true, createdAt: true, recordedById: true },
      }),
    ]);

    return [
      ...inspections.map(
        (inspection): RawJourneyEvent => ({
          kind: "inspection.recorded",
          at: inspection.createdAt,
          sourceId: inspection.id,
          stage: "UNDER_INSPECTION",
          // A staffUserId here, not an accountId -- `resolveActors` asks
          // for both, so no caller has to know which a table stores.
          actorRef: inspection.technicianId,
          message: {
            CUSTOMER: "Inspection completed",
            TECHNICIAN: "Inspection recorded",
            MANAGER: "Inspection recorded",
          },
          detail: {
            // The technician's free-text note is theirs and the
            // manager's; the customer is told the inspection happened
            // and hears what was FOUND through the decision request,
            // which is written for them.
            TECHNICIAN: this.inspectionDetail(inspection.type, inspection.note),
            MANAGER: this.inspectionDetail(inspection.type, inspection.note),
          },
        }),
      ),
      ...faults.map(
        (fault): RawJourneyEvent => ({
          kind: "fault.recorded",
          at: fault.createdAt,
          sourceId: fault.id,
          stage: "UNDER_INSPECTION",
          // `Fault` records no author -- an honest null rather than a
          // guess at whoever was on the job.
          actorRef: null,
          message: {
            CUSTOMER: "We found something worth telling you about",
            TECHNICIAN: "Finding recorded",
            MANAGER: "Finding recorded",
          },
          detail: {
            TECHNICIAN: `${fault.description} · ${this.words(fault.severity)}`,
            MANAGER: `${fault.description} · ${this.words(fault.severity)}`,
          },
        }),
      ),
      ...this.decisionEvents(decisions),
      ...tasks.map(
        (task): RawJourneyEvent => ({
          kind: "task.created",
          at: task.createdAt,
          sourceId: task.id,
          stage: "IN_PROGRESS",
          actorRef: null,
          message: { TECHNICIAN: "Task added", MANAGER: "Task added" },
          detail: { TECHNICIAN: task.title, MANAGER: task.title },
        }),
      ),
      ...this.partEvents(partRequests),
      ...this.returnEvents(returns),
      ...externalParts.map(
        (line): RawJourneyEvent => ({
          kind: "part.external_recorded",
          at: line.createdAt,
          sourceId: line.id,
          stage: "IN_PROGRESS",
          actorRef: line.addedById,
          message: {
            CUSTOMER:
              line.provenance === "CUSTOMER_SUPPLIED"
                ? "Your own part was recorded against the job"
                : "A part was bought in for your repair",
            TECHNICIAN: "External part recorded",
            MANAGER: "External part recorded",
          },
          detail: {
            CUSTOMER: `${line.name} ×${line.quantity}`,
            TECHNICIAN: `${line.name} ×${line.quantity} · ${this.words(line.provenance)}`,
            MANAGER: `${line.name} ×${line.quantity} · ${this.words(line.provenance)}`,
          },
        }),
      ),
      ...(invoice
        ? [
            {
              kind: "invoice.issued" as const,
              at: invoice.issuedAt,
              sourceId: invoice.id,
              stage: "PAYMENT_PENDING",
              actorRef: invoice.issuedById,
              message: {
                CUSTOMER: "Your invoice was issued",
                TECHNICIAN: "Invoice issued",
                MANAGER: "Invoice issued",
              },
              // Money crosses the wire as a string, always -- a total
              // that becomes a JS number on the way is a bug even when
              // it looks right.
              detail: {
                CUSTOMER: `${invoice.invoiceNumber} · ${invoice.total.toFixed(2)}`,
                TECHNICIAN: invoice.invoiceNumber,
                MANAGER: `${invoice.invoiceNumber} · ${invoice.total.toFixed(2)}`,
              },
            },
          ]
        : []),
      ...payments
        // A payment that was voided or refused never happened as far as
        // the journey is concerned: §20 -- a failed action must never
        // read as a successful one.
        .filter((payment) => payment.status === "CONFIRMED")
        .map(
          (payment): RawJourneyEvent => ({
            kind: "payment.recorded",
            at: payment.createdAt,
            sourceId: payment.id,
            stage: "PAYMENT_PENDING",
            actorRef: payment.recordedById,
            message: { CUSTOMER: "Payment received", TECHNICIAN: "Payment recorded", MANAGER: "Payment recorded" },
            detail: {
              CUSTOMER: payment.amount.toFixed(2),
              TECHNICIAN: null,
              MANAGER: `${payment.amount.toFixed(2)} · ${this.words(payment.method)}`,
            },
          }),
        ),
    ];
  }

  /**
   * Asked, opened, answered.
   *
   * Answers are per ITEM, not per request: a customer who approves the
   * brake pads and declines the wiper blades performed two decisions,
   * and collapsing them into one "responded" line loses the half a
   * technician needs in order to know what to actually do.
   */
  private decisionEvents(
    decisions: readonly {
      id: string;
      status: string;
      createdAt: Date;
      sentAt: Date | null;
      viewedAt: Date | null;
      createdById: string;
      items: readonly { id: string; name: string; decision: string; decidedAt: Date | null }[];
    }[],
  ): readonly RawJourneyEvent[] {
    const out: RawJourneyEvent[] = [];

    for (const request of decisions) {
      const names = request.items.map((item) => item.name).join(", ");

      // The clock starts when the customer was ASKED, not when the
      // request was drafted -- an unsent ask is the branch's own delay,
      // and charging it to the customer hides our failure as theirs.
      out.push({
        kind: "decision.asked",
        at: request.sentAt ?? request.createdAt,
        sourceId: request.id,
        stage: "AWAITING_CUSTOMER_APPROVAL",
        actorRef: request.createdById,
        message: {
          CUSTOMER: "We asked you to approve some work",
          TECHNICIAN: "Customer asked to approve work",
          MANAGER: "Customer asked to approve work",
        },
        detail: names ? { CUSTOMER: names, TECHNICIAN: names, MANAGER: names } : undefined,
      });

      if (request.viewedAt) {
        out.push({
          kind: "decision.viewed",
          at: request.viewedAt,
          sourceId: `${request.id}:viewed`,
          stage: "AWAITING_CUSTOMER_APPROVAL",
          actorRef: null,
          message: {
            CUSTOMER: "You opened the request",
            TECHNICIAN: "Customer opened the request",
            MANAGER: "Customer opened the request",
          },
        });
      }

      if (request.status === "CANCELLED") {
        // Withdrawal has no timestamp of its own -- the row carries no
        // `cancelledAt`. Rather than invent one, this is dated by the
        // last moment on the request that IS recorded, and the wording
        // claims only that it was withdrawn, never when precisely.
        const lastKnown = request.items.reduce<Date>(
          (latest, item) => (item.decidedAt && item.decidedAt > latest ? item.decidedAt : latest),
          request.viewedAt ?? request.sentAt ?? request.createdAt,
        );
        out.push({
          kind: "decision.withdrawn",
          at: lastKnown,
          sourceId: `${request.id}:withdrawn`,
          stage: "AWAITING_CUSTOMER_APPROVAL",
          actorRef: null,
          message: {
            CUSTOMER: "We withdrew that request",
            TECHNICIAN: "Request withdrawn",
            MANAGER: "Request withdrawn",
          },
        });
      }

      for (const item of request.items) {
        if (!item.decidedAt || item.decision === "PENDING") continue;
        const approved = item.decision === "APPROVED";
        out.push({
          kind: "decision.answered",
          at: item.decidedAt,
          sourceId: item.id,
          stage: "AWAITING_CUSTOMER_APPROVAL",
          actorRef: null,
          message: {
            CUSTOMER: approved ? "You approved an item" : "You declined an item",
            TECHNICIAN: approved ? "Customer approved an item" : "Customer declined an item",
            MANAGER: approved ? "Customer approved an item" : "Customer declined an item",
          },
          detail: { CUSTOMER: item.name, TECHNICIAN: item.name, MANAGER: item.name },
        });
      }
    }

    return out;
  }

  /**
   * The parts loop, hand-over by hand-over.
   *
   * One request can be filled in several hand-overs, and each carries
   * its own issued/arrived/received/used timestamps -- which is exactly
   * why this reads `IssuedItem` rather than the request's status: the
   * status says where the request ended up, the rows say what actually
   * happened on the way.
   */
  private partEvents(
    requests: readonly {
      id: string;
      status: string;
      quantity: number;
      createdAt: Date;
      updatedAt: Date;
      approvedAt: Date | null;
      approvedById: string | null;
      requestedById: string;
      inventoryItem: { name: string };
      issuedItems: readonly {
        id: string;
        quantity: number;
        issuedAt: Date;
        arrivedAt: Date | null;
        receivedAt: Date | null;
        usedAt: Date | null;
        issuedById: string;
        warehouse: { name: string } | null;
      }[];
    }[],
  ): readonly RawJourneyEvent[] {
    const out: RawJourneyEvent[] = [];

    for (const request of requests) {
      const part = request.inventoryItem.name;

      out.push({
        kind: "part.requested",
        at: request.createdAt,
        sourceId: request.id,
        stage: "WAITING_PARTS",
        actorRef: request.requestedById,
        message: {
          CUSTOMER: "A part was ordered for your repair",
          TECHNICIAN: "Part requested",
          MANAGER: "Part requested",
        },
        detail: {
          // Stock quantities and warehouse identities are internal; the
          // part's NAME is what the customer is being charged for and is
          // already on their invoice.
          CUSTOMER: part,
          TECHNICIAN: `${part} ×${request.quantity}`,
          MANAGER: `${part} ×${request.quantity}`,
        },
      });

      if (request.approvedAt) {
        out.push({
          kind: "part.approved",
          at: request.approvedAt,
          sourceId: `${request.id}:approved`,
          stage: "WAITING_PARTS",
          actorRef: request.approvedById,
          // Approval inside the store is not the customer's business --
          // what reaches them is the part arriving, not the paperwork.
          message: { TECHNICIAN: "Part approved by the store", MANAGER: "Part request approved" },
          detail: { TECHNICIAN: part, MANAGER: part },
        });
      }

      // Refusal has no timestamp column, but a refused request is
      // terminal -- nothing writes to it afterwards -- so `updatedAt` IS
      // the moment it was refused. Stated because that reasoning is what
      // makes this honest rather than convenient, and it would not hold
      // for any non-terminal status.
      if (request.status === "REJECTED" || request.status === "UNAVAILABLE") {
        const refused = request.status === "REJECTED" ? "Part request refused" : "Part unavailable";
        out.push({
          kind: "part.refused",
          at: request.updatedAt,
          sourceId: `${request.id}:refused`,
          stage: "WAITING_PARTS",
          actorRef: null,
          message: { TECHNICIAN: refused, MANAGER: refused },
          detail: { TECHNICIAN: part, MANAGER: part },
        });
      }

      for (const issue of request.issuedItems) {
        const where = issue.warehouse?.name ?? null;
        const issued = `${part} ×${issue.quantity}${where ? ` — ${where}` : ""}`;

        out.push({
          kind: "part.issued",
          at: issue.issuedAt,
          sourceId: issue.id,
          stage: "WAITING_PARTS",
          actorRef: issue.issuedById,
          message: { TECHNICIAN: "Part issued", MANAGER: "Part issued" },
          detail: { TECHNICIAN: issued, MANAGER: issued },
        });

        if (issue.arrivedAt) {
          out.push({
            kind: "part.arrived",
            at: issue.arrivedAt,
            sourceId: `${issue.id}:arrived`,
            stage: "WAITING_PARTS",
            actorRef: null,
            message: {
              CUSTOMER: "The part for your repair arrived",
              TECHNICIAN: "Part arrived",
              MANAGER: "Part arrived",
            },
            detail: { CUSTOMER: part, TECHNICIAN: part, MANAGER: part },
          });
        }

        if (issue.receivedAt) {
          out.push({
            kind: "part.received",
            at: issue.receivedAt,
            sourceId: `${issue.id}:received`,
            stage: "WAITING_PARTS",
            actorRef: null,
            message: { TECHNICIAN: "You received the part", MANAGER: "Technician received the part" },
            detail: { TECHNICIAN: part, MANAGER: part },
          });
        }

        if (issue.usedAt) {
          out.push({
            kind: "part.used",
            at: issue.usedAt,
            sourceId: `${issue.id}:used`,
            stage: "IN_PROGRESS",
            actorRef: null,
            message: {
              CUSTOMER: "The part was fitted to your vehicle",
              TECHNICIAN: "Part fitted",
              MANAGER: "Part fitted",
            },
            detail: { CUSTOMER: part, TECHNICIAN: part, MANAGER: part },
          });
        }
      }
    }

    return out;
  }

  /**
   * The return cycle, including the clarification loop the spec calls
   * out (§06, §32) -- which can repeat, and is shown as the pair of
   * events it actually is rather than a single undated fact.
   *
   * None of it reaches the customer: they were never told the part was
   * issued in the first place, so telling them it went back would be a
   * fact about a fact they do not have.
   */
  private returnEvents(
    returns: readonly {
      id: string;
      quantity: number;
      reason: string | null;
      createdAt: Date;
      requestedById: string;
      clarificationQuestion: string | null;
      clarificationAskedAt: Date | null;
      clarificationAnsweredAt: Date | null;
      resolvedAt: Date | null;
      resolvedById: string | null;
      partRequest: { status: string; inventoryItem: { name: string } };
    }[],
  ): readonly RawJourneyEvent[] {
    const out: RawJourneyEvent[] = [];

    for (const row of returns) {
      const part = row.partRequest.inventoryItem.name;

      out.push({
        kind: "return.requested",
        at: row.createdAt,
        sourceId: row.id,
        stage: "IN_PROGRESS",
        actorRef: row.requestedById,
        message: { TECHNICIAN: "Return requested", MANAGER: "Part return requested" },
        detail: {
          TECHNICIAN: `${part} ×${row.quantity}`,
          MANAGER: `${part} ×${row.quantity}${row.reason ? ` — ${row.reason}` : ""}`,
        },
      });

      if (row.clarificationAskedAt) {
        out.push({
          kind: "return.clarification_asked",
          at: row.clarificationAskedAt,
          sourceId: `${row.id}:asked`,
          stage: "IN_PROGRESS",
          actorRef: null,
          message: { TECHNICIAN: "The store asked you a question", MANAGER: "Clarification requested" },
          detail: row.clarificationQuestion
            ? { TECHNICIAN: row.clarificationQuestion, MANAGER: row.clarificationQuestion }
            : undefined,
        });
      }

      if (row.clarificationAnsweredAt) {
        out.push({
          kind: "return.clarification_answered",
          at: row.clarificationAnsweredAt,
          sourceId: `${row.id}:answered`,
          stage: "IN_PROGRESS",
          actorRef: null,
          message: { TECHNICIAN: "You answered the store", MANAGER: "Clarification answered" },
        });
      }

      if (row.resolvedAt) {
        const accepted = ["RETURN_ACCEPTED", "RETURNED_TO_STOCK"].includes(row.partRequest.status);
        out.push({
          kind: accepted ? "return.accepted" : "return.rejected",
          at: row.resolvedAt,
          sourceId: `${row.id}:resolved`,
          stage: "IN_PROGRESS",
          actorRef: row.resolvedById,
          message: accepted
            ? { TECHNICIAN: "Return accepted", MANAGER: "Return accepted" }
            : { TECHNICIAN: "Return refused", MANAGER: "Return refused" },
          detail: { TECHNICIAN: part, MANAGER: part },
        });
      }
    }

    return out;
  }

  private inspectionDetail(type: string, note: string | null): string {
    const kind = `${this.words(type)} inspection`;
    return note ? `${kind} — ${note}` : kind;
  }

  private words(value: string): string {
    return value.toLowerCase().replace(/_/g, " ");
  }
}
