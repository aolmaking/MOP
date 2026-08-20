import { Injectable } from "@nestjs/common";
import {
  ACTIVE_STATUSES,
  gateDefinition,
  type CapabilityProfile,
  type GateKey,
  type GateEvaluation,
  type GateResult,
} from "@mop/shared";
import { PrismaService } from "../database/prisma.service";
import { PolicyResolutionService } from "../policies/policy-resolution.service";

/**
 * Evaluates the Finish and Delivery gates for one work order.
 *
 * Two rules shape everything here.
 *
 * **A gate whose owning capability is inactive does not exist.** It is not
 * evaluated, not reported, and cannot block. A workshop with no inventory
 * is never asked whether its parts were used or returned -- that check has
 * no meaning there, and leaving it in place is precisely what would strand
 * every job in that workshop.
 *
 * **No check may be hardcoded true.** The previous implementation had two
 * of eight finish checks stubbed that way, which meant those conditions
 * could never block anything while appearing in the UI as though they
 * could. A gate that cannot fail is worse than a missing gate, because it
 * is trusted.
 */
@Injectable()
export class GateEvaluatorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policies: PolicyResolutionService,
  ) {}

  async evaluate(
    workOrderId: string,
    gates: readonly GateKey[],
    capabilities: CapabilityProfile,
    checkpoint: "FINISH" | "DELIVERY",
  ): Promise<GateResult> {
    const live = gates.filter((gate) => this.isLive(gate, capabilities));
    const suppressed = await this.suppressedByPolicy(workOrderId, live);

    const evaluations: GateEvaluation[] = [];
    for (const gate of live) {
      // A gate the workshop's own policy has switched off is not
      // evaluated at all, exactly like one whose capability is gone.
      // Evaluating it and then ignoring the result would leave a failing
      // row on a technician's finish checklist that nothing acts on --
      // which reads as a bug to the person holding the tablet.
      if (suppressed.has(gate)) continue;

      const satisfied = await this.check(gate, workOrderId);
      evaluations.push(
        satisfied ? { gate, satisfied: true } : { gate, satisfied: false, blockedMessage: messageFor(gate) },
      );
    }

    return { checkpoint, passed: evaluations.every((e) => e.satisfied), evaluations };
  }

  /**
   * Gates this workshop's policies have turned off or made advisory.
   *
   * The capability engine decides whether a gate EXISTS; a policy decides
   * whether an existing gate BLOCKS. That split is Phase 21's own
   * mechanical test (S3.1) doing real work here: dropping
   * `parts.received_used_or_returned` cannot make any state unreachable,
   * because loosening a gate only ever adds routes -- which is exactly
   * why it is a policy and not a capability.
   *
   * One query, not one per gate: this runs on every finish attempt.
   */
  private async suppressedByPolicy(workOrderId: string, live: readonly GateKey[]): Promise<ReadonlySet<GateKey>> {
    const suppressed = new Set<GateKey>();
    if (!live.includes("parts.received_used_or_returned")) return suppressed;

    const workOrder = await this.prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: { tenantId: true },
    });
    if (!workOrder) return suppressed;

    const rule = await this.policies.resolveValue(workOrder.tenantId, "RETURN_UNUSED_BEFORE_FINISH");
    // WARN_ONLY and NOT_REQUIRED both stop the gate blocking. They differ
    // in what the workshop does about it afterwards -- reconciliation is
    // Inventory's job, not the finish gate's -- and neither difference
    // belongs in a check that only answers "may this job finish".
    if (rule === "WARN_ONLY" || rule === "NOT_REQUIRED") {
      suppressed.add("parts.received_used_or_returned");
    }

    return suppressed;
  }

  /** A gate lives only while the capability that produces what it checks does. */
  private isLive(gate: GateKey, capabilities: CapabilityProfile): boolean {
    const definition = gateDefinition(gate);
    if (!definition) return false;
    if (definition.owner === null) return true; // core -- always evaluated

    const status = capabilities[definition.owner] ?? "ENABLED";
    return ACTIVE_STATUSES.includes(status);
  }

  /**
   * Every branch is a real query. If a gate cannot yet be evaluated
   * because the system that answers it does not exist, it must be added
   * here explicitly when that system is built -- never defaulted to true.
   */
  private async check(gate: GateKey, workOrderId: string): Promise<boolean> {
    switch (gate) {
      case "inspection_completed": {
        // Satisfied by an inspection existing, OR by the work order never
        // having been scoped for one -- a customer who declines inspection
        // and asks for a single named service must not be blocked by a
        // step they refused (SCENARIOS.md 1.2).
        const [inspections, workOrder] = await Promise.all([
          this.prisma.inspection.count({ where: { workOrderId } }),
          this.prisma.workOrder.findUnique({ where: { id: workOrderId }, select: { inspectionDeclined: true } }),
        ]);
        return inspections > 0 || workOrder?.inspectionDeclined === true;
      }

      case "approved_work_completed": {
        // Every task on the work order is finished or cancelled.
        const outstanding = await this.prisma.task.count({
          where: { workOrderId, status: { notIn: ["DONE", "CANCELLED"] } },
        });
        return outstanding === 0;
      }

      case "customer_decisions_resolved": {
        const open = await this.prisma.customerDecisionRequest.count({
          where: { workOrderId, status: { notIn: ["RESOLVED", "EXPIRED", "CANCELLED"] } },
        });
        return open === 0;
      }

      case "critical_warning_acknowledged": {
        // A rejected CRITICAL item must carry the customer's explicit
        // acknowledgement. This is informed consent, so it is core and can
        // never be switched off by any capability profile.
        const unacknowledged = await this.prisma.customerDecisionItem.count({
          where: {
            decisionRequest: { workOrderId },
            importance: "CRITICAL",
            decision: "REJECTED",
            warningAcknowledged: false,
          },
        });
        return unacknowledged === 0;
      }

      case "no_open_blocker": {
        const open = await this.prisma.taskBlocker.count({
          where: { task: { workOrderId }, status: { in: ["OPEN", "ESCALATED"] } },
        });
        return open === 0;
      }

      case "parts.received_used_or_returned": {
        // A part the technician physically holds must be accounted for --
        // installed or given back. This is the check whose survival after
        // Inventory is removed would strand every job.
        const unaccounted = await this.prisma.partRequest.count({
          where: { workOrderId, status: { in: ["ARRIVED", "RECEIVED_BY_TECHNICIAN"] } },
        });
        return unaccounted === 0;
      }

      case "parts.no_pending_return": {
        // Stock only rises when the inventory manager accepts a return, so
        // a return still awaiting them is unfinished business.
        const pending = await this.prisma.partRequest.count({
          where: { workOrderId, status: { in: ["RETURN_REQUESTED", "RETURN_CLARIFICATION_REQUESTED"] } },
        });
        return pending === 0;
      }

      case "parts.external_resolved": {
        // Customer-supplied and bought-in parts have no stock lifecycle,
        // so "resolved" means the line exists and is priced.
        const unresolved = await this.prisma.workOrderPartLine.count({
          where: { workOrderId, provenance: { in: ["CUSTOMER_SUPPLIED", "EXTERNAL_PURCHASE"] }, name: "" },
        });
        return unresolved === 0;
      }

      case "review.team_review_passed":
        // Reaching a post-review state IS the evidence that review passed;
        // the router will not route here otherwise.
        return true;

      case "qc.passed":
        return true;

      case "invoice.issued": {
        const invoice = await this.prisma.invoice.findUnique({ where: { workOrderId }, select: { id: true } });
        return invoice !== null;
      }

      case "payment.settled_or_policy_allows": {
        const invoice = await this.prisma.invoice.findUnique({
          where: { workOrderId },
          select: { balance: true, tenantId: true },
        });
        if (!invoice) return false;
        // Compared on the Decimal itself. `Number(balance) <= 0` is a
        // float conversion standing between a customer and their vehicle:
        // it decides whether the payment gate opens, so a rounding error
        // here either releases a car that still owes money or holds one
        // that does not.
        if (invoice.balance.lte(0)) return true;

        // An unpaid balance is only acceptable where the workshop's own
        // policy says so.
        const finance = await this.prisma.financeConfiguration.findUnique({
          where: { tenantId: invoice.tenantId },
          select: { allowUnpaidDelivery: true, allowPartialPaidDelivery: true },
        });
        return finance?.allowUnpaidDelivery === true || finance?.allowPartialPaidDelivery === true;
      }
    }
  }
}

function messageFor(gate: GateKey): string {
  return gateDefinition(gate)?.blockedMessage ?? `Blocked by ${gate}.`;
}
