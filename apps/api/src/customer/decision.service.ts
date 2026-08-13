import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@mop/database";
import { WORK_ORDER_GRAPH } from "@mop/shared";
import { PrismaService } from "../database/prisma.service";
import { OperationEventsService } from "../operations/operation-events.service";

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
@Injectable()
export class CustomerDecisionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: OperationEventsService,
  ) {}

  async read(token: string): Promise<PublicDecision> {
    const request = await this.resolve(token);

    const pricingVisible = await this.pricingVisible(request.tenantId);
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
      items: state === "EXPIRED" ? [] : request.items.map((item) => this.toPublic(item, pricingVisible)),
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
      // shape as an honest one and is refused just the same.
      if (item.importance === "CRITICAL" && answer.decision === "REJECTED" && answer.warningAcknowledged !== true) {
        throw new BadRequestException({
          code: "critical_warning_not_acknowledged",
          message: "Declining a safety-critical repair has to be acknowledged before it can be recorded.",
        });
      }
    }

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
          actorId: request.customerId,
          actorName: "Customer",
          actorType: "CUSTOMER",
          targetType: "CustomerDecisionRequest",
          targetId: request.id,
          riskLevel: "MEDIUM",
          payload: {
            workOrderId: request.workOrderId,
            answered: answers.length,
            fullyResolved: remaining === 0,
          },
        },
        tx,
      );
    });

    return this.read(token);
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
      select: {
        id: true,
        tenantId: true,
        customerId: true,
        workOrderId: true,
        status: true,
        expiresAt: true,
        respondedAt: true,
        tenant: { select: { name: true } },
        workOrder: { select: { status: true, asset: { select: { plateNumber: true, serialNumber: true } } } },
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
      },
    });

    if (!request || request.status === "CANCELLED") throw this.notFound();
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
    };
  }

  private notFound(): NotFoundException {
    return new NotFoundException({
      code: "decision_not_found",
      message: "This link is not valid. Please contact the workshop.",
    });
  }
}
