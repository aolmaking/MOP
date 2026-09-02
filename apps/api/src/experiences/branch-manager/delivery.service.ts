import { Injectable } from "@nestjs/common";
import type { GateEvaluation } from "@mop/shared";
import { PrismaService } from "../../runtime/database/prisma.service";
import { WorkOrderLifecycleService } from "../../systems/operations/work-order-lifecycle.service";
import { FinanceService } from "../../systems/finance/finance.service";

export interface DeliveryCandidate {
  readonly workOrderId: string;
  readonly identifier: string | null;
  readonly customerName: string;
  readonly customerPhone: string;
  readonly status: string;
  readonly waitingHours: number;
  /** True only when every live gate passes. Never assumed from status. */
  readonly canLeave: boolean;
  /**
   * The invoice to take money against, when one exists and is not yet
   * settled. Null otherwise.
   *
   * Here so the board can offer a way OUT of the held state rather than
   * only naming it (M-4). Whether an invoice is settled is
   * `FinanceService`'s answer, not this service's: settlement is derived
   * from confirmed payments net of completed refunds through the money
   * helpers, and re-deriving it here from `balance` would be a second
   * source of truth for the one question the delivery gate turns on.
   */
  readonly unsettledInvoiceId: string | null;
  /** Exactly what is stopping it. Empty when it can go. */
  readonly blockedBy: readonly string[];
}

export interface DeliveryBoard {
  readonly ready: readonly DeliveryCandidate[];
  readonly held: readonly DeliveryCandidate[];
}

/**
 * "What is leaving today, and can it?"
 *
 * The reason this is a page rather than a filter on the board: the answer
 * to "why can't this go" must be exact, and it cannot be read off a
 * status. A car in READY_FOR_DELIVERY may still be held by an unpaid
 * balance, an unreturned part, or an unacknowledged safety rejection --
 * and which of those apply depends on the workshop's capability profile.
 *
 * So the gates are actually run, by the same evaluator that would refuse
 * the transition. Nothing here re-implements a check; a page that decided
 * for itself what "ready" means would eventually disagree with the engine,
 * and the manager would be told a car could leave when it could not.
 */
@Injectable()
export class DeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: WorkOrderLifecycleService,
    private readonly finance: FinanceService,
  ) {}

  async board(scope: { tenantId: string; branchScope: readonly string[] }): Promise<DeliveryBoard> {
    const rows = await this.prisma.workOrder.findMany({
      where: {
        tenantId: scope.tenantId,
        ...(scope.branchScope.length > 0 ? { branchId: { in: [...scope.branchScope] } } : {}),
        status: { in: ["READY_FOR_DELIVERY", "PAYMENT_PENDING"] },
      },
      select: {
        id: true,
        status: true,
        updatedAt: true,
        asset: { select: { plateNumber: true, serialNumber: true } },
        customer: { select: { fullName: true, phone: true } },
        // Only the id. The amounts are Decimal and stay in Finance's
        // hands; this service never does money arithmetic.
        invoice: { select: { id: true } },
      },
      orderBy: { updatedAt: "asc" },
    });

    const now = Date.now();
    const candidates: DeliveryCandidate[] = [];

    for (const row of rows) {
      const blockedBy = await this.whatIsHoldingIt(row.id, row.status, row.invoice !== null);
      const unsettledInvoiceId = await this.unsettledInvoice(row.invoice?.id ?? null);

      candidates.push({
        workOrderId: row.id,
        identifier: row.asset.plateNumber ?? row.asset.serialNumber,
        customerName: row.customer.fullName,
        customerPhone: row.customer.phone,
        status: row.status,
        waitingHours: (now - row.updatedAt.getTime()) / 3_600_000,
        // No gates at all means nothing is configured to block it, which
        // is a pass. A workshop with every capability removed still has to
        // be able to hand a car back.
        canLeave: blockedBy.length === 0,
        blockedBy,
        unsettledInvoiceId,
      });
    }

    return {
      ready: candidates.filter((candidate) => candidate.canLeave),
      held: candidates.filter((candidate) => !candidate.canLeave),
    };
  }

  /**
   * The invoice id when there is still money owed on it, null otherwise.
   *
   * Asks Finance rather than reading `Invoice.balance`: settlement is
   * confirmed payments minus completed refunds, compared through the
   * money helpers, and a job whose refund landed after payment is
   * exactly the case a cached column gets wrong.
   */
  private async unsettledInvoice(invoiceId: string | null): Promise<string | null> {
    if (!invoiceId) return null;
    const settlement = await this.finance.settlement(invoiceId);
    return settlement.settled ? null : invoiceId;
  }

  /**
   * Everything stopping this car, in the customer-facing words the gate
   * registry already defines. Empty means it can go.
   *
   * Two separate questions, and conflating them is what made the first
   * version of this wrong. First: is DELIVER even reachable from here? A
   * job in PAYMENT_PENDING has no DELIVER edge at all, so asking the gate
   * evaluator about it returns "no gates", which reads identically to
   * "nothing is blocking it" -- and the page would have cheerfully told a
   * manager to hand back a car nobody had paid for. Only once DELIVER is
   * actually reachable do the gates decide.
   */
  private async whatIsHoldingIt(workOrderId: string, status: string, hasInvoice: boolean): Promise<string[]> {
    const intents = await this.lifecycle.availableIntents(workOrderId);

    if (!intents.includes("DELIVER")) {
      if (status !== "PAYMENT_PENDING") return ["This job has not reached handover yet."];

      // Two different jobs for two different people, and saying "not
      // settled" for both sent a manager hunting for a payment that
      // cannot be taken: there is nothing to pay against until somebody
      // issues the invoice.
      return [
        hasInvoice
          ? "The invoice has not been settled."
          : "The final invoice has not been issued.",
      ];
    }

    const gates = await this.lifecycle.previewGates(workOrderId, "DELIVER");

    // No gates is a genuine pass, not a missing answer: a workshop with
    // every optional capability removed still has to be able to hand a
    // car back, and its delivery gates legitimately do not exist.
    return (gates?.evaluations ?? [])
      .filter((evaluation): evaluation is GateEvaluation & { satisfied: false; blockedMessage: string } =>
        !evaluation.satisfied,
      )
      .map((evaluation) => evaluation.blockedMessage);
  }
}
