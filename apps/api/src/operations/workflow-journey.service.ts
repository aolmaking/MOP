import { Injectable, NotFoundException } from "@nestjs/common";
import { WORK_ORDER_GRAPH, workflowJourney, type JourneyStage } from "@mop/shared";
import { PrismaService } from "../database/prisma.service";
import { CapabilityResolutionService } from "../capabilities/capability-resolution.service";
import { PolicyResolutionService } from "../policies/policy-resolution.service";
import { JourneyFactsService, type JourneyFacts, type StageFact } from "./journey-facts.service";

/** Who is looking. The same journey reads differently to each of them. */
export type JourneyAudience = "CUSTOMER" | "TECHNICIAN" | "MANAGER";

export interface PresentedStage extends JourneyStage {
  /** Plain words for this audience. Never the enum. */
  readonly label: string;
  /** One line of real detail, or null when there is nothing true to add. */
  readonly detail: string | null;
  /** Progressive disclosure: the facts behind the line. */
  readonly facts: readonly StageFact[];
}

export interface PresentedJourney {
  readonly stages: readonly PresentedStage[];
  readonly finished: boolean;
  readonly waiting: boolean;
  readonly blocked: boolean;
  /** Where are we, and why. */
  readonly headline: string;
  /** What happened to get here. Null at the very start. */
  readonly happened: string | null;
  /** What happens next. Null once terminal. */
  readonly next: string | null;
  /** Who owes the move, in this audience's words. Null when nobody does. */
  readonly waitingOn: { readonly who: string; readonly since: string | null } | null;
  /** Real events, safe for this audience. */
  readonly history: readonly { readonly at: string; readonly message: string }[];
}

/**
 * The stage names each audience reads.
 *
 * Three vocabularies over one underlying state, which is the point:
 * `AWAITING_CUSTOMER_APPROVAL` is "Waiting for your approval" to the
 * customer, "Waiting on the customer" to the technician who cannot
 * proceed, and "Awaiting customer approval" to the manager counting how
 * many jobs are stuck there. Same fact, three different things to know.
 *
 * Every status in `WORK_ORDER_GRAPH.states` must appear in all three,
 * and a test asserts it -- the fallback would print a lowercased enum at
 * a paying customer, which is the bug this file exists to prevent.
 */
export const JOURNEY_LABELS: Record<JourneyAudience, Record<string, string>> = {
  CUSTOMER: {
    DRAFT: "Being set up",
    REGISTERED: "Vehicle received",
    UNDER_INSPECTION: "Inspection",
    AWAITING_CUSTOMER_APPROVAL: "Your approval",
    APPROVED_FOR_WORK: "Approved",
    IN_PROGRESS: "Repair",
    WAITING_PARTS: "Waiting for a part",
    WAITING_CUSTOMER: "Waiting for your answer",
    BLOCKED: "On hold",
    READY_FOR_TEAM_REVIEW: "Being checked",
    READY_FOR_QC: "Quality check",
    QC_FAILED: "Being corrected",
    READY_FOR_DELIVERY: "Ready for pickup",
    PAYMENT_PENDING: "Payment",
    CLOSED: "Completed",
    CANCELLED: "Cancelled",
  },
  TECHNICIAN: {
    DRAFT: "Being set up",
    REGISTERED: "Checked in",
    UNDER_INSPECTION: "Inspection",
    AWAITING_CUSTOMER_APPROVAL: "Waiting on the customer",
    APPROVED_FOR_WORK: "Approved to start",
    IN_PROGRESS: "Work",
    WAITING_PARTS: "Waiting on the store",
    WAITING_CUSTOMER: "Waiting on the customer",
    BLOCKED: "Blocked",
    READY_FOR_TEAM_REVIEW: "Team review",
    READY_FOR_QC: "QC",
    QC_FAILED: "Rework",
    READY_FOR_DELIVERY: "Ready to hand over",
    PAYMENT_PENDING: "Payment",
    CLOSED: "Closed",
    CANCELLED: "Cancelled",
  },
  MANAGER: {
    DRAFT: "Draft",
    REGISTERED: "Registered",
    UNDER_INSPECTION: "Under inspection",
    AWAITING_CUSTOMER_APPROVAL: "Awaiting customer approval",
    APPROVED_FOR_WORK: "Approved for work",
    IN_PROGRESS: "In progress",
    WAITING_PARTS: "Waiting for parts",
    WAITING_CUSTOMER: "Waiting for customer",
    BLOCKED: "Blocked",
    READY_FOR_TEAM_REVIEW: "Team review",
    READY_FOR_QC: "Quality check",
    QC_FAILED: "QC failed",
    READY_FOR_DELIVERY: "Ready for delivery",
    PAYMENT_PENDING: "Payment pending",
    CLOSED: "Closed",
    CANCELLED: "Cancelled",
  },
};

/** Whose move it is, per state, per audience. */
const OWNER: Record<string, Record<JourneyAudience, string>> = {
  AWAITING_CUSTOMER_APPROVAL: { CUSTOMER: "you", TECHNICIAN: "the customer", MANAGER: "the customer" },
  WAITING_CUSTOMER: { CUSTOMER: "you", TECHNICIAN: "the customer", MANAGER: "the customer" },
  WAITING_PARTS: { CUSTOMER: "the parts supplier", TECHNICIAN: "the store", MANAGER: "inventory" },
  BLOCKED: { CUSTOMER: "the workshop", TECHNICIAN: "your branch manager", MANAGER: "you" },
  QC_FAILED: { CUSTOMER: "the workshop", TECHNICIAN: "you", MANAGER: "the technician" },
  READY_FOR_TEAM_REVIEW: { CUSTOMER: "the workshop", TECHNICIAN: "your team leader", MANAGER: "you" },
  READY_FOR_QC: { CUSTOMER: "the workshop", TECHNICIAN: "QC", MANAGER: "you" },
  PAYMENT_PENDING: { CUSTOMER: "you", TECHNICIAN: "the counter", MANAGER: "the customer" },
  READY_FOR_DELIVERY: { CUSTOMER: "you", TECHNICIAN: "the counter", MANAGER: "you" },
};

const MOVING: Record<JourneyAudience, string> = {
  CUSTOMER: "Your vehicle is being worked on.",
  TECHNICIAN: "This job is yours to move.",
  MANAGER: "Moving normally.",
};

/**
 * The workflow journey: which stages exist, where the job is, what is
 * true at each stage, and whose move it is.
 *
 * Three rules make this a subsystem rather than a decoration.
 *
 * **Nothing here is authored.** Stages behind come from real
 * `work_order.status_changed` events; stages ahead from the route this
 * workshop's own effective graph allows. Removing a capability removes
 * its stage from every strip because the edge is gone.
 *
 * **Optional stages are only drawn when this JOB needs them.** The graph
 * alone would route every job through customer approval, because the
 * edge exists; whether this job needs it is a question about policy and
 * about whether a decision actually exists, and it is answered here.
 *
 * **The words differ by audience, the state does not.** One projection,
 * three vocabularies -- so a customer and the technician looking at the
 * same blocked job are never told two different stories.
 */
@Injectable()
export class WorkflowJourneyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capabilities: CapabilityResolutionService,
    private readonly policies: PolicyResolutionService,
    private readonly facts: JourneyFactsService,
  ) {}

  async forWorkOrder(tenantId: string, workOrderId: string, audience: JourneyAudience): Promise<PresentedJourney> {
    const workOrder = await this.prisma.workOrder.findFirst({
      where: { id: workOrderId, tenantId },
      select: { status: true },
    });
    if (!workOrder) {
      throw new NotFoundException({ code: "work_order_not_found", message: "Work order not found." });
    }

    const [profile, history, facts, approvalScope] = await Promise.all([
      this.capabilities.resolveCurrent(tenantId),
      this.statusHistory(tenantId, workOrderId),
      this.facts.gather(tenantId, workOrderId),
      this.policies.resolveValue(tenantId, "APPROVAL_REQUIRED_SCOPE"),
    ]);

    const journey = workflowJourney(WORK_ORDER_GRAPH, profile, workOrder.status, history, {
      skipAhead: this.optionalStagesThisJobDoesNotNeed(facts, approvalScope),
    });

    const stages = journey.stages
      .map((stage) => this.correctForOpenWork(stage, facts))
      .map((stage) => this.present(stage, audience, facts));
    const status = workOrder.status;

    return {
      stages,
      finished: journey.finished,
      waiting: journey.waiting,
      blocked: journey.blocked,
      headline: this.headline(status, audience, facts) ?? this.movingHeadline(audience, facts),
      happened: this.happened(journey.stages, audience, facts),
      next: journey.finished ? null : this.next(journey.stages, status, audience, facts),
      waitingOn: this.waitingOn(status, audience, facts),
      history: await this.safeHistory(tenantId, workOrderId, audience),
    };
  }

  /**
   * A stage the job has moved PAST but which is not actually finished.
   *
   * A technician can raise a decision mid-repair: the work order carries
   * on and the customer still owes an answer, so the graph legitimately
   * shows AWAITING_CUSTOMER_APPROVAL behind the current stage while the
   * decision is open. Drawn naively that produced "Your approval — done"
   * directly above "2 items still need your answer", which is a lie by
   * juxtaposition even though both halves are individually true.
   *
   * The honest reading is that the stage is not done, because the thing
   * it stands for has not happened. Marking it WAITING also keeps the
   * strip consistent with the portal's own "Needs you" flag, which reads
   * the same open decisions.
   */
  private correctForOpenWork(stage: JourneyStage, facts: JourneyFacts): JourneyStage {
    const stillOwed =
      (stage.status === "AWAITING_CUSTOMER_APPROVAL" || stage.status === "WAITING_CUSTOMER") &&
      facts.decisionsOpen > 0;

    return stillOwed && stage.state === "DONE" ? { ...stage, state: "WAITING" } : stage;
  }

  /**
   * Stages the graph offers that this particular job has no need of.
   *
   * Customer approval is the one that matters. Under `ALL_WORK` every
   * job needs it, so it is always on the route. Under the other scopes
   * it depends on what the inspection turns up, so it is drawn only once
   * a decision genuinely exists -- otherwise every job would be shown to
   * its customer as "we will be asking you something", which is a
   * promise about work nobody has found yet.
   */
  private optionalStagesThisJobDoesNotNeed(facts: JourneyFacts, approvalScope: string): readonly string[] {
    const approvalCertain = approvalScope === "ALL_WORK" || facts.decisionsTotal > 0;
    return approvalCertain ? [] : ["AWAITING_CUSTOMER_APPROVAL"];
  }

  /**
   * One stage, with whatever is actually true about it.
   *
   * `detail` is null rather than a filler phrase when nothing is known:
   * an empty line is honest, and "no information" printed under every
   * upcoming stage is noise that teaches people to stop reading.
   */
  private present(stage: JourneyStage, audience: JourneyAudience, facts: JourneyFacts): PresentedStage {
    const label = JOURNEY_LABELS[audience][stage.status] ?? stage.status;
    const reached = stage.state !== "AHEAD";

    return { ...stage, label, detail: reached ? this.detail(stage, audience, facts) : null, facts: reached ? this.stageFacts(stage, audience, facts) : [] };
  }

  private detail(stage: JourneyStage, audience: JourneyAudience, facts: JourneyFacts): string | null {
    switch (stage.status) {
      case "UNDER_INSPECTION":
        if (facts.inspectionCount === 0) return null;
        if (audience === "CUSTOMER") {
          return facts.faultCount === 0
            ? "Nothing of concern found."
            : `${facts.faultCount} thing${facts.faultCount === 1 ? "" : "s"} found that we wanted to tell you about.`;
        }
        return `${facts.inspectionCount} recorded · ${facts.faultCount} finding${facts.faultCount === 1 ? "" : "s"}`;

      case "AWAITING_CUSTOMER_APPROVAL":
      case "WAITING_CUSTOMER": {
        if (facts.decisionsTotal === 0) return null;
        // money-lint-ok: a count of decision items, not a currency amount.
        const outstandingItems = facts.decisionsTotal - facts.decisionsAnswered;
        if (audience === "CUSTOMER") {
          return outstandingItems === 0
            ? "You've answered everything we asked."
            : `${outstandingItems} item${outstandingItems === 1 ? "" : "s"} still need your answer.`;
        }
        return `${facts.decisionsAnswered}/${facts.decisionsTotal} answered · ${facts.decisionsApproved} approved, ${facts.decisionsRejected} declined`;
      }

      case "WAITING_PARTS": {
        const waiting = facts.partsOutstanding;
        if (waiting.length === 0) return null;
        if (audience === "CUSTOMER") {
          return `Waiting for ${waiting.length} part${waiting.length === 1 ? "" : "s"} to arrive.`;
        }
        return waiting
          .map((part) => `${part.name} ×${part.quantity}${part.warehouse ? ` — ${part.warehouse}` : ""}`)
          .join(" · ");
      }

      case "BLOCKED": {
        if (facts.blockers.length === 0) return null;
        const first = facts.blockers[0];
        const reason = first.note ?? first.reason.toLowerCase().replace(/_/g, " ");
        // A customer is told there IS a hold, never the shop-floor reason
        // for it -- "tool missing" is our problem, not theirs.
        return audience === "CUSTOMER" ? "We've paused work while we sort something out." : reason;
      }

      case "IN_PROGRESS":
      case "APPROVED_FOR_WORK": {
        if (facts.tasksTotal === 0) return null;
        if (audience === "CUSTOMER") return null;
        const who =
          audience === "MANAGER" && facts.technicianNames.length > 0
            ? ` · ${facts.technicianNames.join(", ")}`
            : "";
        return `${facts.tasksDone}/${facts.tasksTotal} task${facts.tasksTotal === 1 ? "" : "s"} done${who}`;
      }

      case "PAYMENT_PENDING":
      case "READY_FOR_DELIVERY":
      case "CLOSED": {
        const invoice = facts.invoice;
        if (!invoice) {
          if (facts.runningTotal === null || audience === "CUSTOMER") return null;
          return `${facts.runningTotal} to bill, not yet invoiced`;
        }
        if (invoice.settled) {
          return audience === "CUSTOMER" ? `Paid in full — ${invoice.total}` : `${invoice.number} · paid ${invoice.total}`;
        }
        return audience === "CUSTOMER"
          ? `${invoice.outstanding} still to pay of ${invoice.total}`
          : `${invoice.number} · ${invoice.outstanding} outstanding of ${invoice.total}`;
      }

      default:
        return null;
    }
  }

  /**
   * The facts behind the line, for the drawer.
   *
   * Cost, margin and staff identity never reach a customer -- restricted
   * data is ABSENT from the response, not hidden by the client.
   */
  private stageFacts(stage: JourneyStage, audience: JourneyAudience, facts: JourneyFacts): readonly StageFact[] {
    const out: StageFact[] = [];

    switch (stage.status) {
      case "UNDER_INSPECTION":
        if (facts.inspectionCount > 0) out.push({ label: "Inspections recorded", value: String(facts.inspectionCount) });
        if (facts.faultCount > 0) out.push({ label: "Findings", value: String(facts.faultCount) });
        break;

      case "AWAITING_CUSTOMER_APPROVAL":
      case "WAITING_CUSTOMER":
        if (facts.decisionsTotal > 0) {
          out.push({ label: "Items asked", value: String(facts.decisionsTotal) });
          out.push({ label: "Approved", value: String(facts.decisionsApproved) });
          out.push({ label: "Declined", value: String(facts.decisionsRejected) });
        }
        break;

      case "WAITING_PARTS":
        for (const part of facts.partsOutstanding) {
          out.push({
            label: part.name,
            value:
              audience === "CUSTOMER"
                ? "on order"
                : `${part.issued}/${part.quantity} issued · ${part.status.toLowerCase().replace(/_/g, " ")}`,
          });
        }
        break;

      case "IN_PROGRESS":
      case "APPROVED_FOR_WORK":
        if (facts.tasksTotal > 0) out.push({ label: "Tasks", value: `${facts.tasksDone} of ${facts.tasksTotal} done` });
        // Staff identity is operational information, not the customer's.
        if (audience !== "CUSTOMER" && facts.technicianNames.length > 0) {
          out.push({ label: "Technician", value: facts.technicianNames.join(", ") });
        }
        if (facts.partsUsed > 0) out.push({ label: "Parts fitted", value: String(facts.partsUsed) });
        break;

      case "BLOCKED":
        for (const blocker of facts.blockers) {
          if (audience === "CUSTOMER") continue;
          out.push({ label: blocker.reason.toLowerCase().replace(/_/g, " "), value: blocker.note ?? "no note" });
        }
        break;

      case "PAYMENT_PENDING":
      case "READY_FOR_DELIVERY":
      case "CLOSED":
        if (facts.invoice) {
          out.push({ label: "Invoice", value: facts.invoice.number });
          out.push({ label: "Total", value: facts.invoice.total });
          out.push({ label: "Paid", value: facts.invoice.paid });
          if (!facts.invoice.settled) out.push({ label: "Outstanding", value: facts.invoice.outstanding });
        }
        break;
    }

    return out;
  }

  /**
   * "Moving normally" is only true if nothing is quietly outstanding. A
   * job progressing with an unanswered customer decision behind it is
   * not moving normally, and saying so is the difference between a
   * status label and a useful one.
   */
  private movingHeadline(audience: JourneyAudience, facts: JourneyFacts): string {
    if (facts.decisionsOpen === 0) return MOVING[audience];
    return audience === "CUSTOMER"
      ? "Work is under way, and we're still waiting on your answer to something."
      : "Moving, but a customer decision is still outstanding.";
  }

  private headline(status: string, audience: JourneyAudience, facts: JourneyFacts): string | null {
    const owner = OWNER[status]?.[audience];

    switch (status) {
      case "AWAITING_CUSTOMER_APPROVAL":
      case "WAITING_CUSTOMER":
        return audience === "CUSTOMER"
          ? "We're waiting for your approval before work can continue."
          : `Waiting on ${owner}. Work cannot continue until they answer.`;

      case "WAITING_PARTS": {
        const names = facts.partsOutstanding.map((part) => part.name).join(", ");
        if (audience === "CUSTOMER") return "We're waiting for a required part before continuing the repair.";
        return names ? `Waiting on ${owner} for ${names}.` : `Waiting on ${owner} for a part.`;
      }

      case "BLOCKED":
        return audience === "CUSTOMER"
          ? "Your job is on hold while we sort something out."
          : `Blocked. ${owner === "you" ? "You have" : `${owner} has`} to clear it.`;

      case "QC_FAILED":
        return audience === "CUSTOMER"
          ? "We found something in our final check and are putting it right."
          : "Failed QC and is back with the technician.";

      case "READY_FOR_TEAM_REVIEW":
        return audience === "CUSTOMER" ? "Your vehicle is being checked over." : `Finished. Waiting on ${owner}.`;

      case "READY_FOR_QC":
        return audience === "CUSTOMER" ? "Your vehicle is having its final quality check." : `Waiting on ${owner}.`;

      case "PAYMENT_PENDING": {
        const due = facts.invoice?.outstanding;
        if (audience === "CUSTOMER") {
          return due ? `Your invoice is ready. ${due} is outstanding.` : "Your invoice is being prepared.";
        }
        return due ? `Invoiced. ${due} outstanding.` : "Ready to invoice.";
      }

      case "READY_FOR_DELIVERY":
        return audience === "CUSTOMER" ? "Your vehicle is ready to collect." : "Ready for handover.";

      case "CLOSED":
        return audience === "CUSTOMER" ? "This job is finished." : "Closed.";

      case "CANCELLED":
        return audience === "CUSTOMER" ? "This job was cancelled." : "Cancelled.";

      default:
        return null;
    }
  }

  /** What got us here, from the last stage actually completed. */
  private happened(
    stages: readonly JourneyStage[],
    audience: JourneyAudience,
    facts: JourneyFacts,
  ): string | null {
    const done = stages.filter((stage) => stage.state === "DONE");
    const last = done[done.length - 1];
    if (!last) return null;

    switch (last.status) {
      case "UNDER_INSPECTION":
        return facts.faultCount > 0
          ? `Inspection found ${facts.faultCount} thing${facts.faultCount === 1 ? "" : "s"} worth raising.`
          : "Inspection completed with nothing of concern.";
      case "AWAITING_CUSTOMER_APPROVAL":
        return facts.decisionsRejected > 0
          ? `The customer approved ${facts.decisionsApproved} item${facts.decisionsApproved === 1 ? "" : "s"} and declined ${facts.decisionsRejected}.`
          : audience === "CUSTOMER"
            ? "You approved the recommended work."
            : "The customer approved the recommended work.";
      case "WAITING_PARTS":
        return "The requested part was issued and work resumed.";
      case "READY_FOR_QC":
        return "The job passed its quality check.";
      case "READY_FOR_TEAM_REVIEW":
        return "The job passed team review.";
      case "PAYMENT_PENDING":
        return facts.invoice?.settled ? "The invoice was paid in full." : "The invoice was issued.";
      case "READY_FOR_DELIVERY":
        return audience === "CUSTOMER" ? "Your vehicle was released." : "The vehicle was handed over.";
      case "APPROVED_FOR_WORK":
        return audience === "CUSTOMER" ? "The work was approved and started." : "Work was approved and started.";
      case "REGISTERED":
        return audience === "CUSTOMER" ? "We received your vehicle." : "The vehicle was checked in.";
      case "BLOCKED":
        return "The hold was cleared and work resumed.";
      case "QC_FAILED":
        return "The rework was done.";
      default:
        // Deliberately vague rather than wrong: gluing "completed" onto
        // a label produces things like "Approved to start completed."
        return `Moved on from ${(JOURNEY_LABELS[audience][last.status] ?? last.status).toLowerCase()}.`;
    }
  }

  /** The very next stage, named, so nobody has to read the strip to guess. */
  private next(
    stages: readonly JourneyStage[],
    status: string,
    audience: JourneyAudience,
    facts: JourneyFacts,
  ): string | null {
    const ahead = stages.find((stage) => stage.state === "AHEAD");
    if (!ahead) return null;
    const label = JOURNEY_LABELS[audience][ahead.status] ?? ahead.status;

    if (status === "WAITING_PARTS") {
      const first = facts.partsOutstanding[0];
      return audience === "CUSTOMER"
        ? "As soon as the part is here, the repair continues."
        : first
          ? `Once ${first.name} is issued, work continues.`
          : `Next: ${label}.`;
    }
    if (status === "AWAITING_CUSTOMER_APPROVAL" || status === "WAITING_CUSTOMER") {
      return audience === "CUSTOMER" ? "Once you answer, work continues." : "Once the customer answers, work continues.";
    }
    if (status === "PAYMENT_PENDING") {
      return audience === "CUSTOMER" ? "Once payment clears, your vehicle is ready to collect." : `Next: ${label}.`;
    }

    return `Next: ${label}.`;
  }

  private waitingOn(
    status: string,
    audience: JourneyAudience,
    facts: JourneyFacts,
  ): { who: string; since: string | null } | null {
    const who = OWNER[status]?.[audience];
    if (!who) return null;

    const since =
      status === "AWAITING_CUSTOMER_APPROVAL" || status === "WAITING_CUSTOMER"
        ? facts.decisionWaitingSince
        : status === "WAITING_PARTS"
          ? (facts.partsOutstanding[0]?.requestedAt ?? null)
          : status === "BLOCKED"
            ? (facts.blockers[0]?.since ?? null)
            : null;

    return { who, since };
  }

  /**
   * The real event stream, reduced to what this audience may read.
   *
   * A customer gets their own safe timeline -- the one
   * `CustomerSafeProjectionService` already writes -- rather than a
   * filtered view of internal events, because "filter the internal log"
   * is exactly how internal words eventually leak. Staff get the
   * operational events.
   */
  private async safeHistory(
    tenantId: string,
    workOrderId: string,
    audience: JourneyAudience,
  ): Promise<readonly { at: string; message: string }[]> {
    if (audience === "CUSTOMER") {
      // TWO real sources, merged.
      //
      // `CustomerTimelineEvent` carries the milestones that are not
      // status changes -- a decision answered, an invoice issued, a
      // payment taken -- already written through
      // CustomerSafeProjectionService. The status changes themselves
      // carry the shape of the repair, and are projected through the
      // CUSTOMER label table, which is curated vocabulary a test already
      // refuses to let become an enum in disguise.
      //
      // Neither alone tells the story: timeline events know nothing
      // about the vehicle moving through the workshop, and status events
      // know nothing about the customer's own decision landing.
      const [timeline, statuses] = await Promise.all([
        this.prisma.customerTimelineEvent.findMany({
          where: { tenantId, workOrderId },
          select: { message: true, createdAt: true },
          orderBy: { createdAt: "asc" },
          take: 50,
        }),
        this.statusEvents(tenantId, workOrderId),
      ]);

      const merged = [
        ...timeline.map((row) => ({ at: row.createdAt.toISOString(), message: row.message })),
        ...statuses.map((event) => ({
          at: event.at,
          message: JOURNEY_LABELS.CUSTOMER[event.status] ?? event.status,
        })),
      ];
      return merged.sort((a, b) => a.at.localeCompare(b.at));
    }

    const events = await this.statusEvents(tenantId, workOrderId);

    // `OperationEvent` carries actorId but not a name, and joining
    // AuditLog purely to decorate a timeline is not worth the read --
    // the manager already sees who is on the job on the stage itself.
    return events.map((event) => ({
      at: event.at,
      message: JOURNEY_LABELS[audience][event.status] ?? event.status,
    }));
  }

  /**
   * Every stage this job actually reached, oldest first.
   *
   * Read from the event stream rather than a column, because a status
   * column knows only where a job is now. `payload.to` is the stage that
   * was entered.
   */
  private statusHistory(tenantId: string, workOrderId: string): Promise<readonly { status: string; at: string }[]> {
    return this.statusEvents(tenantId, workOrderId);
  }

  /**
   * Every `work_order.status_changed` for THIS job, oldest first.
   *
   * The filter is in the QUERY, on the JSON payload, and that is
   * load-bearing twice over. Correctness: an earlier version read the
   * tenant's events with `take: 200` and filtered afterwards, so on a
   * busy workshop it took the oldest two hundred events in the whole
   * tenant and this job's were simply not among them -- the timeline
   * came back empty. Performance: a manager's board draws a strip per
   * row, and reading every status event in the tenant per row is how one
   * screen becomes a table scan per work order.
   */
  private async statusEvents(
    tenantId: string,
    workOrderId: string,
  ): Promise<readonly { status: string; at: string }[]> {
    const events = await this.prisma.operationEvent.findMany({
      where: {
        tenantId,
        eventKey: "work_order.status_changed",
        payload: { path: ["workOrderId"], equals: workOrderId },
      },
      select: { payload: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    const mine: { status: string; at: string }[] = [];
    for (const event of events) {
      const to = (event.payload as { to?: string } | null)?.to;
      if (!to) continue;
      mine.push({ status: to, at: event.createdAt.toISOString() });
    }
    return mine;
  }
}
