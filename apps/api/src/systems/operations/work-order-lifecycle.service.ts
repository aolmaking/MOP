import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import {
  WORK_ORDER_GRAPH,
  canStillReach,
  canTransition,
  isTerminal,
  resolveIntent,
  type GateResult,
  type WorkflowIntent,
  type WorkOrderFacts,
  relevantPolicyAnswers,
} from "@mop/shared";
import type { Prisma, WorkOrderStatus } from "@mop/database";
import { PrismaService } from "../../runtime/database/prisma.service";
import { PolicyResolutionService } from "../../control/policies/policy-resolution.service";
import { CapabilityResolutionService } from "../../control/capabilities/capability-resolution.service";
import { OperationEventsService } from "./operation-events.service";
import { GateEvaluatorService } from "./gate-evaluator.service";

export interface LifecycleActor {
  readonly accountId: string;
  readonly displayName: string;
  readonly actorType: "SYSTEM" | "PLATFORM" | "TENANT_STAFF" | "CUSTOMER";
}

/**
 * What to tell someone whose job is not authorized for work yet, keyed by
 * the move that would authorize it.
 *
 * Ordered by how early the move sits in the journey, because a job can
 * legitimately offer more than one (REGISTERED under CUSTOMER_MAY_DECLINE
 * offers both START_INSPECTION and REQUEST_APPROVAL) and the first
 * unfinished step is the one the person in front of the car should hear
 * about. Written here rather than derived from the intent name for the
 * same reason the technician's part wording is: an enum is not a sentence.
 */
const NEXT_STEP = {
  START_INSPECTION: "Start and record the inspection before any repair work.",
  REQUEST_APPROVAL: "Ask the customer to approve the work before starting it.",
  APPROVE: "This job still needs approval before work can start.",
} as const;

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
    private readonly policies: PolicyResolutionService,
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

    const { profile, policies, facts } = await this.routingContext(workOrder.tenantId, workOrderId);
    const routed = resolveIntent(WORK_ORDER_GRAPH, profile, workOrder.status, intent, policies, facts);

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
        target === "CLOSED" ? "DELIVERY" : target === "APPROVED_FOR_WORK" ? "AUTHORIZATION" : "FINISH",
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
  /**
   * The workshop's shape and its rules, together, as the router needs them.
   *
   * `relevantPolicyAnswers` is not optional politeness here: a stored
   * answer whose capability has since been removed must not narrow the
   * graph, or a job sticks for a question the workshop is no longer
   * asked. Every routing call in this service goes through this one
   * method so no call site can forget.
   *
   * `facts` is this one work order's own data, computed fresh on every
   * call rather than cached anywhere -- see WorkflowTransition.
   * requiresFact's own doc for why this is a separate input from the
   * tenant-wide policy answers.
   */
  private async routingContext(tenantId: string, workOrderId: string) {
    const [profile, stored, facts] = await Promise.all([
      this.capabilities.resolveCurrent(tenantId),
      this.policies.resolveCurrent(tenantId),
      this.workOrderFacts(workOrderId),
    ]);
    return { profile, policies: relevantPolicyAnswers(profile, stored), facts };
  }

  /**
   * QC_MANDATORY's RISK_FLAGGED_ONLY option reads this: a job carrying a
   * CRITICAL-severity fault is risk-flagged, whatever else is true of it.
   */
  private async workOrderFacts(workOrderId: string): Promise<WorkOrderFacts> {
    const criticalFault = await this.prisma.fault.findFirst({
      where: { workOrderId, severity: "CRITICAL" },
      select: { id: true },
    });
    const facts = new Set<string>();
    if (criticalFault) facts.add("work_order.has_critical_fault");
    return facts;
  }

  /**
   * The one answer to "may operational work happen on this job right now".
   *
   * Every write that has a real operational or financial consequence --
   * planning a task, starting one, asking the store for a part, adding an
   * external part line -- asks this before it writes. Before it existed,
   * each of those paths checked its own record's status and nothing else,
   * so a technician could plan, start, part-fit, complete and bill a
   * repair while the job was still REGISTERED and the customer had agreed
   * to nothing. The finish gate was the only thing in the way, and it
   * fires when the labour is already spent.
   *
   * **The answer is derived, never listed.** A workshop's authorization
   * boundary is wherever its own effective graph puts APPROVED_FOR_WORK,
   * so the question asked here is structural: can this job still *arrive*
   * at APPROVED_FOR_WORK? If it can, it has not passed the boundary yet
   * and no repair may run. That single question carries every policy
   * branch for free, because the branches are already edges:
   *
   *   - ALWAYS_INSPECT darkens REGISTERED -> AWAITING_CUSTOMER_APPROVAL,
   *     so the only route to authorization runs through UNDER_INSPECTION.
   *   - CUSTOMER_MAY_DECLINE keeps that route, and a declined inspection
   *     reaches authorization without one -- which stays legal here,
   *     exactly as it already does at the finish gate.
   *   - APPROVAL_REQUIRED_SCOPE's BEYOND_INITIAL_SCOPE and CRITICAL_ONLY
   *     open UNDER_INSPECTION -> APPROVED_FOR_WORK directly, so work
   *     that legitimately needs no customer decision is not made to
   *     invent one. ALL_WORK darkens that edge and forces the approval
   *     route instead.
   *
   * This is why the check is not `status === "IN_PROGRESS"` and not
   * `task.decisionItemId != null`. The first is wrong for every profile
   * that reroutes; the second would forbid legitimate work under two
   * shipped approval scopes. Neither can express "this workshop's own
   * rule", and that is the only thing worth enforcing.
   */
  async assertOperationalWorkAuthorized(workOrderId: string): Promise<void> {
    const workOrder = await this.prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: { id: true, tenantId: true, status: true },
    });
    if (!workOrder) {
      throw new NotFoundException({ code: "work_order_not_found", message: "Work order not found." });
    }

    if (isTerminal(WORK_ORDER_GRAPH, workOrder.status)) {
      throw new ConflictException({
        code: "work_order_closed",
        message: "This job is already closed. No further work can be recorded against it.",
      });
    }

    const { profile, policies, facts } = await this.routingContext(workOrder.tenantId, workOrderId);

    // "Still ahead of this job", not "reachable from it". A job sitting
    // exactly ON the boundary has arrived at it -- APPROVED_FOR_WORK is
    // the state that means authorized-but-not-started, and reading its
    // own reflexive reachability as "not yet authorized" would refuse
    // every task at the moment the customer had just agreed to it.
    const authorizationPending =
      workOrder.status !== "APPROVED_FOR_WORK" &&
      canStillReach(WORK_ORDER_GRAPH, profile, workOrder.status, "APPROVED_FOR_WORK", policies, facts);
    if (!authorizationPending) return;

    // Naming the move that would unblock them, rather than the state they
    // are in. A technician holding a tablet needs the next action, and the
    // set of next actions is already something the graph can answer.
    const intents = new Set(await this.availableIntents(workOrderId));
    const step = (Object.keys(NEXT_STEP) as (keyof typeof NEXT_STEP)[]).find((intent) => intents.has(intent));

    throw new ConflictException({
      code: "work_not_authorized",
      message: step ? NEXT_STEP[step] : "This job has not been authorized for work yet.",
    });
  }

  async availableIntents(workOrderId: string): Promise<readonly WorkflowIntent[]> {
    const workOrder = await this.prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: { tenantId: true, status: true },
    });
    if (!workOrder) return [];

    const { profile, policies, facts } = await this.routingContext(workOrder.tenantId, workOrderId);
    const intents = new Set<WorkflowIntent>();

    for (const transition of WORK_ORDER_GRAPH.transitions) {
      if (transition.from !== workOrder.status || !transition.intent) continue;
      if (!canTransition(WORK_ORDER_GRAPH, profile, workOrder.status, transition.to, policies, facts)) continue;
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

    const { profile, policies, facts } = await this.routingContext(workOrder.tenantId, workOrderId);
    const routed = resolveIntent(WORK_ORDER_GRAPH, profile, workOrder.status, intent, policies, facts);
    if (!routed.ok || !routed.transition.gates?.length) return null;

    return this.gates.evaluate(
      workOrderId,
      routed.transition.gates,
      profile,
      routed.transition.to === "CLOSED"
        ? "DELIVERY"
        : routed.transition.to === "APPROVED_FOR_WORK"
          ? "AUTHORIZATION"
          : "FINISH",
    );
  }
}
