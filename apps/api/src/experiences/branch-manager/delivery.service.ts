import { Injectable } from "@nestjs/common";
import type { GateEvaluation } from "@mop/shared";
import { PrismaService } from "../../runtime/database/prisma.service";
import { WorkOrderLifecycleService } from "../../systems/operations/work-order-lifecycle.service";

export interface DeliveryCandidate {
  readonly workOrderId: string;
  readonly identifier: string | null;
  readonly customerName: string;
  readonly customerPhone: string;
  readonly status: string;
  readonly waitingHours: number;
  /** True only when every live gate passes. Never assumed from status. */
  readonly canLeave: boolean;
  /** Exactly what is stopping it. Empty when it can go. */
  readonly blockedBy: readonly string[];
  /** M-4: set only when an unsettled invoice is what's actually holding this car. */
  readonly invoiceId: string | null;
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
        // The invoice, if one has been issued -- what "Take payment" on a
        // held row actually opens. Only relevant with an outstanding
        // balance; a settled invoice is not what is holding this car.
        invoice: { select: { id: true, balance: true } },
      },
      orderBy: { updatedAt: "asc" },
    });

    const now = Date.now();
    const candidates: DeliveryCandidate[] = [];

    for (const row of rows) {
      const blockedBy = await this.whatIsHoldingIt(row.id, row.status);

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
        // money-lint-ok: Decimal.greaterThan, never coerced to a number.
        invoiceId: row.invoice && row.invoice.balance.greaterThan(0) ? row.invoice.id : null,
      });
    }

    return {
      ready: candidates.filter((candidate) => candidate.canLeave),
      held: candidates.filter((candidate) => !candidate.canLeave),
    };
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
  private async whatIsHoldingIt(workOrderId: string, status: string): Promise<string[]> {
    const intents = await this.lifecycle.availableIntents(workOrderId);

    if (!intents.includes("DELIVER")) {
      return [
        status === "PAYMENT_PENDING"
          ? "The invoice has not been settled."
          : "This job has not reached handover yet.",
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
