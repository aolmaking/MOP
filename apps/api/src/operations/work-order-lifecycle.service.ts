import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import {
  WORK_ORDER_GRAPH,
  canTransition,
  resolveIntent,
  type GateResult,
  type WorkflowIntent,
} from "@mop/shared";
import type { Prisma, WorkOrderStatus } from "@mop/database";
import { PrismaService } from "../database/prisma.service";
import { CapabilityResolutionService } from "../capabilities/capability-resolution.service";
import { OperationEventsService } from "./operation-events.service";
import { GateEvaluatorService } from "./gate-evaluator.service";

export interface LifecycleActor {
  readonly accountId: string;
  readonly displayName: string;
  readonly actorType: "SYSTEM" | "PLATFORM" | "TENANT_STAFF" | "CUSTOMER";
}

export interface TransitionResult {
  readonly workOrderId: string;
  readonly from: WorkOrderStatus;
  readonly to: WorkOrderStatus;
  /** Present when the transition was gated; useful for showing what was checked. */
  readonly gates?: GateResult;
}

/**
 * The only thing in MOP that changes a work order's status.
 *
 * That exclusivity is the point. Every other service asks for an INTENT --
 * "finish", "approve", "deliver" -- and this decides where that lands by
 * consulting the capability-aware graph. No service anywhere contains
 * `status: "READY_FOR_QC"`, so a workshop without QC cannot end up there
 * by accident, and adding a capability later does not mean hunting through
 * services for hardcoded transitions.
 *
 * The previous implementation's lifecycle was spread across the services
 * that happened to need it, which is why it drifted: six of sixteen
 * statuses had no code path that set them, and one was set by a free-text
 * label while the real enum stayed behind.
 */
@Injectable()
export class WorkOrderLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capabilities: CapabilityResolutionService,
    private readonly events: OperationEventsService,
    private readonly gates: GateEvaluatorService,
  ) {}

  /**
   * Moves a work order by intent. Refuses anything the graph does not
   * allow, and anything a gate blocks.
   *
   * `options.tx` lets a caller that already holds a row lock on this work
   * order (see `TechnicianWorkService`'s blocker methods, H1 in
   * `docs/scenarios3/EDGE_CASE_REGISTER.md`) fold the actual status write
   * into that same transaction instead of opening a second one afterward
   * -- otherwise the decision to move ("nothing else is blocking this
   * anymore") and the write that acts on it are two different
   * transactions, and a second caller's own decision can land in the gap
   * between them. Every other caller omits it and gets the original
   * self-contained transaction, unchanged.
   */
  async apply(
    workOrderId: string,
    intent: WorkflowIntent,
    actor: LifecycleActor,
    options: { readonly reason?: string; readonly tx?: Prisma.TransactionClient } = {},
  ): Promise<TransitionResult> {
    const workOrder = await this.prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: { id: true, tenantId: true, status: true },
    });
    if (!workOrder) {
      throw new NotFoundException({ code: "work_order_not_found", message: "Work order not found." });
    }

    const profile = await this.capabilities.resolveCurrent(workOrder.tenantId);
    const routed = resolveIntent(WORK_ORDER_GRAPH, profile, workOrder.status, intent);

    if (!routed.ok) {
      throw new ConflictException({
        code: "transition_not_allowed",
        message: routed.failure.message,
      });
    }

    const target = routed.transition.to as WorkOrderStatus;

    // Gates are evaluated against the same capability profile, so a check
    // whose owning capability is gone is never even asked.
    let gateResult: GateResult | undefined;
    if (routed.transition.gates?.length) {
      gateResult = await this.gates.evaluate(
        workOrderId,
        routed.transition.gates,
        profile,
        target === "CLOSED" ? "DELIVERY" : "FINISH",
      );

      if (!gateResult.passed) {
        const blocked = gateResult.evaluations.filter((evaluation) => !evaluation.satisfied);
        throw new ConflictException({
          code: "gate_blocked",
          message: blocked[0]?.blockedMessage ?? "This step is blocked.",
          // Every unsatisfied gate, so the UI can show the full checklist
          // rather than making the user fix one thing at a time.
          details: blocked.map((evaluation) => ({ gate: evaluation.gate, message: evaluation.blockedMessage })),
        });
      }
    }

    const run = async (tx: Prisma.TransactionClient): Promise<void> => {
      // Conditional on the status we routed from: if something else moved
      // this work order in the meantime, our decision was made against a
      // state that no longer exists and must not be applied.
      const updated = await tx.workOrder.updateMany({
        where: { id: workOrderId, status: workOrder.status },
        data: { status: target, closedAt: target === "CLOSED" ? new Date() : undefined },
      });

      if (updated.count === 0) {
        throw new ConflictException({
          code: "concurrent_transition",
          message: "This work order changed while you were working on it. Reload and try again.",
        });
      }

      await this.events.emit(
        {
          tenantId: workOrder.tenantId,
          eventKey: "work_order.status_changed",
          actorId: actor.accountId,
          actorName: actor.displayName,
          actorType: actor.actorType,
          targetType: "WorkOrder",
          targetId: workOrderId,
          // Ordinary shop-floor movement. Money and governance events
          // carry higher risk levels; this one is the normal case.
          riskLevel: "LOW",
          reason: options.reason,
          before: { status: workOrder.status },
          after: { status: target },
          payload: {
            workOrderId,
            from: workOrder.status,
            to: target,
            intent,
            reason: options.reason ?? null,
          },
        },
        tx,
      );
    };

    if (options.tx) {
      await run(options.tx);
    } else {
      await this.prisma.$transaction(run);
    }

    return { workOrderId, from: workOrder.status, to: target, gates: gateResult };
  }

  /**
   * What this work order could do next, for building a UI that offers only
   * real options rather than showing buttons that fail on click.
   */
  async availableIntents(workOrderId: string): Promise<readonly WorkflowIntent[]> {
    const workOrder = await this.prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: { tenantId: true, status: true },
    });
    if (!workOrder) return [];

    const profile = await this.capabilities.resolveCurrent(workOrder.tenantId);
    const intents = new Set<WorkflowIntent>();

    for (const transition of WORK_ORDER_GRAPH.transitions) {
      if (transition.from !== workOrder.status || !transition.intent) continue;
      if (!canTransition(WORK_ORDER_GRAPH, profile, workOrder.status, transition.to)) continue;
      intents.add(transition.intent);
    }

    return [...intents];
  }

  /**
   * Runs the gates for a work order's current finish step without moving
   * it -- the technician's finish checklist, which must show why it is
   * blocked before they press anything.
   */
  async previewGates(workOrderId: string, intent: WorkflowIntent): Promise<GateResult | null> {
    const workOrder = await this.prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: { tenantId: true, status: true },
    });
    if (!workOrder) return null;

    const profile = await this.capabilities.resolveCurrent(workOrder.tenantId);
    const routed = resolveIntent(WORK_ORDER_GRAPH, profile, workOrder.status, intent);
    if (!routed.ok || !routed.transition.gates?.length) return null;

    return this.gates.evaluate(
      workOrderId,
      routed.transition.gates,
      profile,
      routed.transition.to === "CLOSED" ? "DELIVERY" : "FINISH",
    );
  }
}
