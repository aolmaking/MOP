import { randomBytes } from "node:crypto";
import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, SeverityLevel } from "@mop/database";
import { WORK_ORDER_GRAPH, add } from "@mop/shared";
import { PrismaService } from "../../runtime/database/prisma.service";
import { OperationEventsService } from "../operations/operation-events.service";
import { PolicyResolutionService } from "../../control/policies/policy-resolution.service";
import { WorkOrderLifecycleService } from "../operations/work-order-lifecycle.service";

/** What the public page is allowed to know. Nothing internal appears here. */
export interface PublicDecisionItem {
  readonly id: string;
  readonly name: string;
  readonly explanation: string;
  /** Plain words, never the internal severity enum. */
  readonly importance: "Low" | "Medium" | "High" | "Critical";
  readonly decision: "PENDING" | "APPROVED" | "REJECTED";
  /** Null when the workshop withholds pricing from customers. */
  readonly price: string | null;
  readonly labour: string | null;
  readonly total: string | null;
  /**
   * APPROVAL_WEIGHT, resolved server-side: whether declining THIS item
   * needs the explicit acknowledgement modal before the rejection is
   * recorded. The client reflects this; it never decides it -- the same
   * gate is re-checked from the tenant's live policy value in
   * `applyAnswers`, so a client that lies about this flag changes nothing.
   */
  readonly requiresAcknowledgement: boolean;
}

export type DecisionLinkState = "OPEN" | "EXPIRED" | "ANSWERED";

export interface PublicDecision {
  readonly state: DecisionLinkState;
  readonly workshopName: string;
  readonly vehicle: string | null;
  /** Absent while pricing is withheld, so the page can say so. */
  readonly pricingVisible: boolean;
  readonly respondedAt: string | null;
  readonly items: readonly PublicDecisionItem[];
  readonly criticalWarning: string;
}

/** Exactly what a client may send. Anything else is not read. */
export interface SubmittedAnswer {
  readonly itemId: string;
  readonly decision: "APPROVED" | "REJECTED";
  readonly warningAcknowledged?: boolean;
  readonly note?: string;
}

const IMPORTANCE: Record<string, PublicDecisionItem["importance"]> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};

/**
 * The one shape every resolver below reads.
 *
 * Extracted when the authenticated portal became a third way into the
 * same request -- token, staff id, and now the customer's own session.
 * Three hand-copied selects would drift, and the one that drifted would
 * be the one that quietly started leaking a field to the public page.
 */
const DECISION_SELECT = {
  id: true,
  tenantId: true,
  customerId: true,
  workOrderId: true,
  status: true,
  expiresAt: true,
  respondedAt: true,
  tenant: { select: { name: true } },
  workOrder: {
    select: {
      status: true,
      asset: { select: { plateNumber: true, serialNumber: true, currentOwnerCustomerId: true } },
    },
  },
  items: {
    select: {
      id: true,
      name: true,
      explanation: true,
      importance: true,
      decision: true,
      price: true,
      laborPrice: true,
      total: true,
    },
    orderBy: { importance: "desc" },
  },
} satisfies Prisma.CustomerDecisionRequestSelect;

/**
 * The states in which a decision is genuinely waiting on the customer.
 *
 * Three exclusions, each deliberate:
 *
 * `PENDING` means drafted and **not sent**. Those are the workshop's own
 * unfinished business -- the Approvals page has a "Not sent yet" band for
 * them -- and showing one to a customer would ask them about work nobody
 * has decided to ask about yet.
 *
 * `RESOLVED`/`EXPIRED`/`CANCELLED` are settled, matching exactly what the
 * `customer_decisions_resolved` gate treats as closed.
 *
 * Exported because the portal's home count and the portal's list must
 * agree by construction. They did not: `home()` counted `PENDING` alone,
 * so the count on the customer's home page was of the one set they are
 * not allowed to see, and was zero for every decision actually sent to
 * them.
 */
export const AWAITING_CUSTOMER_STATUSES = ["SENT", "VIEWED", "PARTIALLY_RESPONDED"] as const;

const DEFAULT_CRITICAL_WARNING =
  "This repair affects the safety of the vehicle. If you decline it, the workshop will record that you were told, " +
  "and the vehicle may not be safe to drive.";

/**
 * The customer decision link.
 *
 * The only public, unauthenticated surface in the product, and the one
 * that has been missing since Phase 4: `secureToken` was written on every
 * request and read by nothing, so the entire approval flow -- items,
 * critical warnings, the safe projection -- had no way to be answered.
 *
 * Three rules, all of them security rather than convenience.
 *
 * **The token scopes everything.** It resolves to exactly one request and
 * grants nothing else. There is no session, no tenant context, and no way
 * to widen it: every query below is keyed by the request the token
 * resolved to.
 *
 * **The client sends four fields and the server reads four fields.**
 * Price, quantity, item identity and work order are re-read from the
 * stored row by id. A modified client cannot alter what it is agreeing
 * to, because nothing it sends about those things is ever looked at.
 *
 * **A critical rejection is re-validated server-side.** The modal in the
 * browser is a courtesy; this check is the actual gate, and it exists
 * because a replayed or hand-built request must not be able to skip it.
 */
export interface StaffActor {
  readonly accountId: string;
  readonly displayName: string;
}

@Injectable()
export class CustomerDecisionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: OperationEventsService,
    private readonly policies: PolicyResolutionService,
    private readonly lifecycle: WorkOrderLifecycleService,
  ) {}

  async read(token: string): Promise<PublicDecision> {
    const request = await this.resolve(token);
    if (request.status === "SENT") {
      await this.prisma.customerDecisionRequest.update({ where: { id: request.id }, data: { status: "VIEWED" } });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (request as any).status = "VIEWED";
    }
    return this.present(request, await this.pricingVisible(request.tenantId), await this.approvalWeight(request.tenantId));
  }

  /**
   * A staff member's own read of one request, before recording an answer
   * on the customer's behalf (P-18). Reuses `resolveById` -- the same
   * branch-scoped lookup `recordOnBehalf` uses -- and `present`, so a
   * manager sees exactly what the customer would have seen on the token
   * link: same items, same prices, same critical warning. A second,
   * looser projection here is exactly how a manager reading the phone
   * script could end up seeing a different price than the one being
   * recorded.
   */
  async detailForStaff(
    tenantId: string,
    branchScope: readonly string[],
    requestId: string,
  ): Promise<PublicDecision> {
    const request = await this.resolveById(tenantId, branchScope, requestId);
    return this.present(request, await this.pricingVisible(tenantId), await this.approvalWeight(tenantId));
  }

  /**
   * One resolved request, rendered as what a customer may see.
   *
   * Shared by the token link and the authenticated portal so the two can
   * never disagree about state, expiry, or which fields are safe.
   * `pricingVisible` and `approvalWeight` are resolved once by the caller
   * rather than inside here, because `listForCustomer` calls this once per
   * request for the same tenant -- resolving either policy per-item would
   * be a redundant lookup for a value that cannot differ between them.
   */
  private present(
    request: Prisma.CustomerDecisionRequestGetPayload<{ select: typeof DECISION_SELECT }>,
    pricingVisible: boolean,
    approvalWeight: string,
  ): PublicDecision {
    // `length > 0` is load-bearing. `[].every()` is vacuously true, so a
    // request with no items would report ANSWERED and the page would tell
    // a customer "you already replied" when they never did. Found against
    // real seeded data, not by reading the code.
    const answered = request.items.length > 0 && request.items.every((item) => item.decision !== "PENDING");
    const expired = request.expiresAt !== null && request.expiresAt.getTime() <= Date.now();

    // Expired wins over answered: a link that has both lapsed and been
    // used should say the simpler, truer thing.
    const state: DecisionLinkState = expired && !answered ? "EXPIRED" : answered ? "ANSWERED" : "OPEN";

    return {
      state,
      workshopName: request.tenant.name,
      vehicle: request.workOrder.asset.plateNumber ?? request.workOrder.asset.serialNumber,
      pricingVisible,
      respondedAt: request.respondedAt?.toISOString() ?? null,
      // An expired link shows NO items. The spec is explicit: never a
      // confusing empty decision list, and never a priced list somebody
      // can no longer act on.
      items: state === "EXPIRED" ? [] : request.items.map((item) => this.toPublic(item, pricingVisible, approvalWeight)),
      criticalWarning: DEFAULT_CRITICAL_WARNING,
    };
  }

  /**
   * Record the customer's answers.
   *
   * Every answer is matched to a stored item by id and re-read from it.
   * The submitted object contributes a decision, an acknowledgement and a
   * note -- nothing else is consulted, so there is no field a modified
   * client could add that would change a price or a quantity.
   */
  async respond(token: string, answers: readonly SubmittedAnswer[]): Promise<PublicDecision> {
    const request = await this.resolve(token);
    await this.applyAnswers(request, answers, {
      actorId: request.customerId,
      actorName: "Customer",
      actorType: "CUSTOMER",
    });
    return this.read(token);
  }

  // --- the authenticated portal's own way in ---------------------------

  /**
   * Every decision waiting on this customer, across all their jobs.
   *
   * The gap this closes: the portal counted `pendingDecisions` on its
   * home page and listed them nowhere, and `current-service` showed a
   * "Needs you" flag with no click-through. A logged-in customer could
   * see that they were being asked something and had no way to answer it
   * without the separate WhatsApp-style link -- which is the one channel
   * the portal exists to make optional.
   *
   * Returns the same `PublicDecision` shape the token page renders, so
   * both ends of this feature agree on what a customer may see by
   * construction rather than by two developers remembering to match.
   */
  async listForCustomer(
    tenantId: string,
    customerId: string,
  ): Promise<readonly (PublicDecision & { readonly requestId: string })[]> {
    const requests = await this.prisma.customerDecisionRequest.findMany({
      // Scoped by the session's customerId, never a parameter -- same
      // rule as every other query in the portal.
      where: { tenantId, customerId, status: { in: [...AWAITING_CUSTOMER_STATUSES] } },
      select: DECISION_SELECT,
      orderBy: { createdAt: "asc" },
    });

    const pricingVisible = await this.pricingVisible(tenantId);
    const approvalWeight = await this.approvalWeight(tenantId);
    return requests.map((request) => ({
      requestId: request.id,
      ...this.present(request, pricingVisible, approvalWeight),
    }));
  }

  /**
   * The customer answers from inside their own session.
   *
   * Reuses `applyAnswers` verbatim, so the server-side re-validation of a
   * critical rejection, the re-read of price and identity from stored
   * rows, and the downstream workflow move are identical whether the
   * answer arrived through a token link or a login. A second
   * implementation here is exactly how the two paths would drift into
   * disagreeing about what a customer is allowed to decline.
   */
  async respondAsCustomer(
    tenantId: string,
    customerId: string,
    requestId: string,
    answers: readonly SubmittedAnswer[],
  ): Promise<PublicDecision> {
    const request = await this.resolveForCustomer(tenantId, customerId, requestId);
    await this.applyAnswers(request, answers, {
      actorId: customerId,
      actorName: "Customer",
      actorType: "CUSTOMER",
    });

    const after = await this.resolveForCustomer(tenantId, customerId, requestId);
    return this.present(after, await this.pricingVisible(tenantId), await this.approvalWeight(tenantId));
  }

  /**
   * A technician (or anyone else holding both `customer_decision.create`
   * and `customer_decision.send`) asks the customer something, and the
   * link goes out in the same action -- one tap, matching the Work Card's
   * own rule that anything costing somebody else's time needs a reason,
   * not a multi-step form (PHASE_6.md §4).
   *
   * A fresh `CustomerDecisionRequest` every time, deliberately not
   * batched onto an existing unsent one: the `customer_decisions_resolved`
   * gate already counts every open request for the work order, so two
   * separate asks are exactly as correct as one request with two items,
   * and not batching avoids a second technician's press racing the first
   * request's own send. Drafting-then-batching-then-sending later is a
   * real, different feature (the Approvals page's "Not sent yet" band
   * already has a reader for it) -- this is the technician's own path,
   * not that one.
   */
  async raiseAndSend(
    tenantId: string,
    workOrderId: string,
    item: { readonly name: string; readonly explanation: string; readonly importance: string; readonly price: string; readonly laborPrice?: string },
    actor: StaffActor,
  ): Promise<{ readonly requestId: string; readonly secureToken: string }> {
    const workOrder = await this.prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: { id: true, tenantId: true, customerId: true, status: true },
    });
    if (!workOrder || workOrder.tenantId !== tenantId) {
      throw new NotFoundException({ code: "work_order_not_found", message: "Work order not found." });
    }
    if (WORK_ORDER_GRAPH.terminal.includes(workOrder.status)) {
      throw new ConflictException({
        code: "work_order_already_closed",
        message: "This job has already been completed or cancelled.",
      });
    }

    const laborPrice = item.laborPrice ?? "0.00";
    const total = add(item.price, laborPrice);
    const secureToken = randomBytes(24).toString("hex");

    const result = await this.prisma.$transaction(async (tx) => {
      const request = await tx.customerDecisionRequest.create({
        data: {
          tenantId,
          workOrderId,
          customerId: workOrder.customerId,
          secureToken,
          createdById: actor.accountId,
          status: "SENT",
          sentAt: new Date(),
        },
        select: { id: true, secureToken: true },
      });

      await tx.customerDecisionItem.create({
        data: {
          tenantId,
          decisionRequestId: request.id,
          name: item.name,
          explanation: item.explanation,
          importance: item.importance as SeverityLevel,
          price: item.price,
          laborPrice,
          total,
        },
      });

      await this.events.emit(
        {
          tenantId,
          eventKey: "customer_decision.requested",
          actorId: actor.accountId,
          actorName: actor.displayName,
          actorType: "TENANT_STAFF",
          targetType: "CustomerDecisionRequest",
          targetId: request.id,
          riskLevel: "MEDIUM",
          payload: { workOrderId, name: item.name, total },
          customer: { customerId: workOrder.customerId, workOrderId },
        },
        tx,
      );

      return { requestId: request.id, secureToken: request.secureToken };
    });

    // Best-effort work-order move: asking the customer may advance the job
    // from UNDER_INSPECTION or REGISTERED (when inspection declined) to
    // AWAITING_CUSTOMER_APPROVAL. Swallowed if the graph does not allow it
    // from the job's current state — the request itself is the durable fact.
    try {
      await this.lifecycle.apply(workOrderId, "REQUEST_APPROVAL", {
        accountId: actor.accountId,
        displayName: actor.displayName,
        actorType: "TENANT_STAFF",
      });
    } catch {
      // Intent not available from current status; request stands alone.
    }

    return result;
  }

  /**
   * Record a decision the customer gave verbally or in person, per
   * `PORTAL_COUNTER_APPROVAL` (P-18, docs/POLICY_DECISION_INVENTORY.md).
   * `CAPABILITY_MODEL.md` Rule 3 promises removing the portal moves
   * approval to the counter without deleting consent -- this is that
   * promise, finally implemented.
   *
   * The actor is ALWAYS the recording staff member, never the customer.
   * `respond()`'s own event/audit trail records `actorType: "CUSTOMER"`
   * because the customer genuinely acted; here `actorType` is
   * `"TENANT_STAFF"` for the same reason in reverse -- a branch manager
   * reading the audit trail must never be told the customer clicked
   * something they did not.
   */
  async recordOnBehalf(
    tenantId: string,
    branchScope: readonly string[],
    requestId: string,
    answers: readonly SubmittedAnswer[],
    staff: StaffActor,
    evidenceReference?: string,
  ): Promise<void> {
    const policyValue = await this.policies.resolveValue(tenantId, "PORTAL_COUNTER_APPROVAL");

    if (policyValue === "PORTAL_ONLY") {
      throw new ConflictException({
        code: "counter_approval_not_allowed",
        message: "This workshop requires the customer to answer through their own portal or decision link.",
      });
    }
    if (policyValue === "ALLOWED_WITH_EVIDENCE" && !evidenceReference?.trim()) {
      throw new BadRequestException({
        code: "evidence_required",
        message: "This workshop requires a reference (a call note, a signature) before recording an answer on the customer's behalf.",
      });
    }

    const request = await this.resolveById(tenantId, branchScope, requestId);

    await this.applyAnswers(request, answers, {
      actorId: staff.accountId,
      actorName: staff.displayName,
      actorType: "TENANT_STAFF",
      recordedOnBehalf: true,
      evidenceReference: evidenceReference?.trim(),
    });
  }

  async cancel(tenantId: string, branchScope: readonly string[], requestId: string, actor: StaffActor): Promise<void> {
    const request = await this.prisma.customerDecisionRequest.findFirst({
      where: {
        id: requestId,
        tenantId,
        workOrder: branchScope.length > 0 ? { branchId: { in: [...branchScope] } } : {},
      },
      select: DECISION_SELECT,
    });
    if (!request) {
      throw new NotFoundException({ code: "decision_not_found", message: "That decision request was not found." });
    }
    if (["RESOLVED", "EXPIRED", "CANCELLED"].includes(request.status)) {
      throw new ConflictException({ code: "decision_already_final", message: "That decision is already final and cannot be cancelled." });
    }
    await this.prisma.customerDecisionRequest.update({ where: { id: request.id }, data: { status: "CANCELLED" } });
    await this.events.emit(
      {
        tenantId,
        eventKey: "customer_decision.cancelled",
        actorId: actor.accountId,
        actorName: actor.displayName,
        actorType: "TENANT_STAFF",
        targetType: "CustomerDecisionRequest",
        targetId: request.id,
        riskLevel: "MEDIUM",
        payload: { workOrderId: request.workOrderId },
      },
      undefined,
    );
  }

  private async applyAnswers(
    request: Awaited<ReturnType<CustomerDecisionService["resolve"]>>,
    answers: readonly SubmittedAnswer[],
    actor: {
      readonly actorId: string;
      readonly actorName: string;
      readonly actorType: "CUSTOMER" | "TENANT_STAFF";
      readonly recordedOnBehalf?: boolean;
      readonly evidenceReference?: string;
    },
  ): Promise<void> {
    // H4, docs/scenarios3/EDGE_CASE_REGISTER.md -- a decision request can
    // sit unanswered while the work order it belongs to reaches CLOSED or
    // CANCELLED through some other path (e.g. the branch manager resolves
    // it at the counter instead of waiting on the link). The whole point
    // of this flow is proving informed consent BEFORE work proceeds;
    // recording an answer after the job is already finished would create
    // exactly the record this flow exists to prevent -- one that implies
    // the customer was asked and answered ahead of the work, when the
    // answer actually arrived after. Refused here rather than silently
    // accepted, with a message the branch manager should read directly to
    // the customer rather than leaving them to resubmit into the same
    // wall.
    if (WORK_ORDER_GRAPH.terminal.includes(request.workOrder.status)) {
      throw new ConflictException({
        code: "work_order_already_closed",
        message: "This job has already been completed or cancelled. Please contact the workshop directly.",
      });
    }

    if (request.expiresAt !== null && request.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException({
        code: "decision_expired",
        message: "This link has expired. Please contact the workshop for a new one.",
      });
    }

    if (answers.length === 0) {
      throw new BadRequestException({ code: "nothing_submitted", message: "Choose approve or reject for each item." });
    }

    const byId = new Map(request.items.map((item) => [item.id, item]));

    // APPROVAL_WEIGHT: resolved once per submission, not per item -- the
    // policy is a tenant-wide setting, not something that can differ
    // between two items on the same request.
    const approvalWeight = await this.policies.resolveValue(request.tenantId, "APPROVAL_WEIGHT");

    for (const answer of answers) {
      const item = byId.get(answer.itemId);

      // An id that is not on THIS request is refused rather than ignored.
      // Ignoring it would let somebody answer another customer's item by
      // pasting its id into a request they do hold a token for.
      if (!item) {
        throw new BadRequestException({
          code: "item_not_on_request",
          message: "That item is not part of this request.",
        });
      }

      if (item.decision !== "PENDING") {
        throw new BadRequestException({
          code: "already_answered",
          message: "You have already responded to this request.",
        });
      }

      // THE GATE. The browser shows a modal; this is what actually stops
      // it. A replayed or hand-built request reaches here with the same
      // shape as an honest one and is refused just the same. Which items
      // this applies to comes from APPROVAL_WEIGHT, re-resolved here
      // rather than trusted from `requiresAcknowledgement` on the
      // request body -- that field is not even part of SubmittedAnswer.
      if (
        this.requiresFormalAcknowledgement(approvalWeight, item.importance) &&
        answer.decision === "REJECTED" &&
        answer.warningAcknowledged !== true
      ) {
        throw new BadRequestException({
          code: "critical_warning_not_acknowledged",
          message: "Declining this repair has to be acknowledged before it can be recorded.",
        });
      }
    }

    // E19, docs/scenarios3/EDGE_CASE_REGISTER.md: the token is scoped to
    // the request, not re-derived from current ownership, and that stays
    // correct -- the link was legitimately sent to `request.customerId`,
    // and the fix this scenario names is explicitly NOT to block or
    // silently re-scope the answer. It's to make sure a branch manager
    // reading this response later can see, plainly, that the asset
    // changed hands after the request went out and before it was
    // answered -- a fact this codebase had no way to surface until now.
    const ownershipChangedSinceRequest =
      request.workOrder.asset.currentOwnerCustomerId !== null &&
      request.workOrder.asset.currentOwnerCustomerId !== request.customerId;

    await this.prisma.$transaction(async (tx) => {
      for (const answer of answers) {
        await tx.customerDecisionItem.update({
          where: { id: answer.itemId },
          data: {
            decision: answer.decision,
            // Stored for critical rejections specifically, because the
            // Finish Gate and the attention queue both read it later.
            warningAcknowledged: answer.warningAcknowledged === true,
            note: answer.note?.slice(0, 1000),
            decidedAt: new Date(),
          },
        });
      }

      const remaining = await tx.customerDecisionItem.count({
        where: { decisionRequestId: request.id, decision: "PENDING" },
      });

      await tx.customerDecisionRequest.update({
        where: { id: request.id },
        data: {
          status: remaining === 0 ? "RESOLVED" : "PARTIALLY_RESPONDED",
          respondedAt: new Date(),
        },
      });

      // Fans out through the same pipeline as any staff action. A
      // customer's decision is exactly as consequential, and the branch
      // manager's Approvals view reads the result of this.
      await this.events.emit(
        {
          tenantId: request.tenantId,
          eventKey: "customer_decision.responded",
          actorId: actor.actorId,
          actorName: actor.actorName,
          actorType: actor.actorType,
          targetType: "CustomerDecisionRequest",
          targetId: request.id,
          // Bumped to HIGH for a stale-ownership answer OR a staff-
          // recorded one -- both are exactly the kind of thing that
          // should stand out in the audit trail rather than blend into
          // routine MEDIUM noise. P-18, docs/POLICY_DECISION_INVENTORY.md:
          // recordedOnBehalf is never merged into the actor fields above
          // -- the actor IS the staff member, in full, and this flag is
          // what tells a reader the customer never touched a keyboard.
          riskLevel: ownershipChangedSinceRequest || actor.recordedOnBehalf ? "HIGH" : "MEDIUM",
          after:
            ownershipChangedSinceRequest || actor.recordedOnBehalf
              ? { ownershipChangedSinceRequest, recordedOnBehalf: actor.recordedOnBehalf ?? false }
              : undefined,
          payload: {
            workOrderId: request.workOrderId,
            answered: answers.length,
            fullyResolved: remaining === 0,
            // Named so a branch manager reading the audit trail sees the
            // fact directly, not just a risk-level color. The system
            // never decides this invalidates the answer -- per the
            // scenario's own fix direction, that judgment call stays
            // human.
            ownershipChangedSinceRequest,
            recordedOnBehalf: actor.recordedOnBehalf ?? false,
            evidenceReference: actor.evidenceReference ?? null,
          },
          // "Thanks -- we've received your decision." That sentence has
          // existed in CustomerSafeProjectionService since Phase 4 and
          // was unreachable: only `customer_decision.requested` ever
          // passed a customer, so a customer saw the workshop ask and
          // never saw their own answer land.
          customer: { customerId: request.customerId, workOrderId: request.workOrderId },
        },
        tx,
      );
    });

    // Best-effort lifecycle advances: a resolved approval may move the job
    // from AWAITING_CUSTOMER_APPROVAL → APPROVED_FOR_WORK (APPROVE) and a
    // mid-job answer may move WAITING_CUSTOMER → IN_PROGRESS
    // (CUSTOMER_RESPONDED). Outside the transaction and swallowed if the
    // graph does not allow it from the job's current state.
    const lifecycleActor = {
      accountId: actor.actorId,
      displayName: actor.actorName,
      actorType: actor.actorType as "TENANT_STAFF" | "CUSTOMER",
    };
    try {
      await this.lifecycle.apply(request.workOrderId, "APPROVE", lifecycleActor);
    } catch {
      // Not available from current status; the answer itself is the durable fact.
    }
    try {
      await this.lifecycle.apply(request.workOrderId, "CUSTOMER_RESPONDED", lifecycleActor);
    } catch {
      // Likewise best-effort.
    }
  }

  // --- internals -----------------------------------------------------

  /**
   * Token to request. One query, one failure message.
   *
   * A token that does not exist and one that does are the same answer, so
   * this cannot be used to discover whether a link was ever real.
   */
  private async resolve(token: string) {
    const trimmed = token?.trim();
    if (!trimmed) throw this.notFound();

    const request = await this.prisma.customerDecisionRequest.findUnique({
      where: { secureToken: trimmed },
      select: DECISION_SELECT,
    });

    if (!request || request.status === "CANCELLED") throw this.notFound();
    return request;
  }

  /**
   * The customer's own counterpart to `resolve(token)`.
   *
   * Scoped by `customerId` from the session as well as tenant, so a
   * customer passing another customer's request id gets the same "not
   * found" as a made-up one -- the id is not a capability here, the
   * session is.
   */
  private async resolveForCustomer(tenantId: string, customerId: string, requestId: string) {
    const request = await this.prisma.customerDecisionRequest.findFirst({
      where: { id: requestId, tenantId, customerId },
      select: DECISION_SELECT,
    });

    if (!request || request.status === "CANCELLED") throw this.notFound();
    return request;
  }

  /**
   * A staff member's counterpart to `resolve(token)`: looked up by id and
   * tenant, scoped to the acting branch manager's branches exactly like
   * `ApprovalsService.list()` scopes its own read of the same table --
   * writes get no less scoping than the read that led staff here.
   */
  private async resolveById(tenantId: string, branchScope: readonly string[], requestId: string) {
    const request = await this.prisma.customerDecisionRequest.findFirst({
      where: {
        id: requestId,
        tenantId,
        workOrder: branchScope.length > 0 ? { branchId: { in: [...branchScope] } } : {},
      },
      select: DECISION_SELECT,
    });

    // Deliberately the same "not found" a wrong id or an out-of-scope one
    // gets -- a manager probing another branch's request ids should not
    // be able to tell a real id from a made-up one by the error shape.
    if (!request || request.status === "CANCELLED") {
      throw new NotFoundException({ code: "decision_not_found", message: "That decision request was not found." });
    }
    return request;
  }

  /**
   * A workshop may withhold pricing from customers. The page must not
   * break when it does -- the item still appears, without numbers.
   */
  private async pricingVisible(tenantId: string): Promise<boolean> {
    const config = await this.prisma.financeConfiguration.findUnique({
      where: { tenantId },
      select: { customerInvoiceVisible: true },
    });
    // Absent configuration means the default, which is visible.
    return config?.customerInvoiceVisible ?? true;
  }

  /** APPROVAL_WEIGHT, resolved once per request rather than once per item -- see `present`'s own note. */
  private async approvalWeight(tenantId: string): Promise<string> {
    return this.policies.resolveValue(tenantId, "APPROVAL_WEIGHT");
  }

  private toPublic(
    item: {
      id: string;
      name: string;
      explanation: string;
      importance: string;
      decision: string;
      price: Prisma.Decimal;
      laborPrice: Prisma.Decimal;
      total: Prisma.Decimal;
    },
    pricingVisible: boolean,
    approvalWeight: string,
  ): PublicDecisionItem {
    return {
      id: item.id,
      name: item.name,
      explanation: item.explanation,
      importance: IMPORTANCE[item.importance] ?? "Medium",
      decision: item.decision as PublicDecisionItem["decision"],
      // Absent, not zeroed. A withheld price must not look like a free
      // item -- money is a string across the API, and null means "not
      // shown" rather than "nothing".
      price: pricingVisible ? item.price.toFixed(2) : null,
      labour: pricingVisible ? item.laborPrice.toFixed(2) : null,
      total: pricingVisible ? item.total.toFixed(2) : null,
      requiresAcknowledgement: this.requiresFormalAcknowledgement(approvalWeight, item.importance),
    };
  }

  /**
   * APPROVAL_WEIGHT's actual behaviour. TWO_TIER (the default) only asks
   * for the formal acknowledgement on HIGH/CRITICAL items; SINGLE_WEIGHT
   * asks for it on every item, however minor. CRITICAL is required under
   * both -- the one floor this policy cannot lower.
   */
  private requiresFormalAcknowledgement(approvalWeight: string, importance: string): boolean {
    if (approvalWeight === "SINGLE_WEIGHT") return true;
    return importance === "CRITICAL" || importance === "HIGH";
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: "decision_not_found",
      message: "This link is not valid. Please contact the workshop.",
    });
  }
}
