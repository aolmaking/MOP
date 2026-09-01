import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { routeForBlocker, type BlockerReasonKey } from "@mop/shared";
import type { InspectionType, Prisma, SeverityLevel } from "@mop/database";
import { PrismaService } from "../../runtime/database/prisma.service";
import { OperationEventsService } from "./operation-events.service";
import { WorkOrderLifecycleService, type LifecycleActor } from "./work-order-lifecycle.service";
import { PolicyResolutionService } from "../../control/policies/policy-resolution.service";

export interface RecordInspectionInput {
  readonly workOrderId: string;
  readonly technicianId: string;
  readonly type: InspectionType;
  readonly odometerOrHours?: number;
  /** Category-specific answers, shaped by the tenant's form configuration. */
  readonly fields: Record<string, unknown>;
  readonly note?: string;
}

export interface CreateFaultInput {
  readonly workOrderId: string;
  readonly inspectionId?: string;
  readonly code?: string;
  readonly description: string;
  readonly severity: SeverityLevel;
  readonly recommendedService?: string;
  readonly customerApprovalRequired?: boolean;
}

export interface ReportBlockerInput {
  readonly taskId: string;
  readonly reason: BlockerReasonKey;
  readonly note?: string;
}

/**
 * The records a technician produces during a job: tasks, inspections,
 * faults and blockers.
 *
 * None of these writes a work-order status. Where a record should move the
 * job -- reporting a blocker, clearing one -- this asks
 * WorkOrderLifecycleService for the intent and lets the graph decide,
 * which is what keeps a workshop without some capability from ending up in
 * a state its configuration does not contain.
 */
@Injectable()
export class TechnicianWorkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: OperationEventsService,
    private readonly lifecycle: WorkOrderLifecycleService,
    private readonly policies: PolicyResolutionService,
  ) {}

  /**
   * `serviceKey` names a row in the workshop's own Service Catalog, and is
   * what connects the work a technician does to the price the Owner set
   * for it. Without it a task is free text, so "Replace battery" on a job
   * card and "Replace battery" on the Pricing page were two unrelated
   * strings that happened to match, and nothing could bill the labour, or
   * answer how much battery work the branch did last month.
   *
   * Optional, because a workshop must still be able to do something it has
   * never catalogued; `title` stays the human label either way.
   */
  async createTask(
    workOrderId: string,
    title: string,
    actor: LifecycleActor,
    assignToStaffUserId?: string,
    serviceKey?: string,
  ) {
    const workOrder = await this.requireWorkOrder(workOrderId);

    // Refuse a key the workshop does not actually have. A task pointing at
    // a service that was never priced would bill nothing and report under
    // a service that does not exist, which is worse than plain free text
    // because it looks connected.
    if (serviceKey) {
      const priced = await this.prisma.priceCatalogEntry.findFirst({
        where: { tenantId: workOrder.tenantId, itemKey: serviceKey, effectiveTo: null, isActive: true },
        select: { id: true },
      });
      if (!priced) {
        throw new BadRequestException({
          code: "service_not_in_catalog",
          message: `"${serviceKey}" is not a live service in this workshop's Service Catalog.`,
        });
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: { tenantId: workOrder.tenantId, workOrderId, title, serviceKey: serviceKey ?? null },
      });

      if (assignToStaffUserId) {
        await tx.taskAssignment.create({
          data: { tenantId: workOrder.tenantId, taskId: task.id, staffUserId: assignToStaffUserId },
        });
      }

      return task;
    });
  }

  /**
   * Marking a task done does not finish the work order -- the Finish Gate
   * decides that, and only once every task is accounted for.
   */
  /**
   * A technician picks the task up.
   *
   * Task status only -- this deliberately does NOT move the work order.
   * Whether starting a task also starts the JOB depends on where the job
   * is and what the workshop's profile allows, and that decision belongs
   * to the lifecycle service. Nothing here may shortcut it.
   *
   * Refuses while a blocker is open, for the same reason completing does:
   * a task someone has declared un-workable must not silently become
   * workable because a different button was pressed.
   */
  async startTask(taskId: string, actor: LifecycleActor) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, tenantId: true, workOrderId: true, status: true, serviceKey: true },
    });
    if (!task) throw new NotFoundException({ code: "task_not_found", message: "Task not found." });

    if (task.status === "DONE" || task.status === "CANCELLED") {
      throw new BadRequestException({ code: "task_finished", message: "That task is already finished." });
    }

    const openBlockers = await this.prisma.taskBlocker.count({
      where: { taskId, status: { in: ["OPEN", "ESCALATED"] } },
    });
    if (openBlockers > 0) {
      throw new BadRequestException({
        code: "task_blocked",
        message: "Resolve the blocker on this task before starting it.",
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({ where: { id: taskId }, data: { status: "IN_PROGRESS" } });
      await this.events.emit(
        {
          tenantId: task.tenantId,
          eventKey: "task.started",
          actorId: actor.accountId,
          actorName: actor.displayName,
          actorType: actor.actorType,
          targetType: "Task",
          targetId: taskId,
          riskLevel: "LOW",
          // serviceKey rides along so the billing and reporting sides can
          // tell WHICH catalogued service was performed without re-reading
          // the operations tables. Finance owning the charge and
          // Operations owning the work is the boundary; the event is how
          // they agree on what happened.
          payload: { taskId, workOrderId: task.workOrderId, serviceKey: task.serviceKey },
        },
        tx,
      );
    });
  }

  /**
   * `minutesSpent` is TIME_TRACKING's own input, read once (before the
   * transaction, the same reason enforceDiscountAuthority and
   * countryBillingRule are resolved before FinanceService's) so a policy
   * lookup never adds latency inside the write.
   */
  async completeTask(taskId: string, actor: LifecycleActor, minutesSpent?: number) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      // serviceKey is loaded so the completion event can name the
      // catalogued service that was performed.
      select: { id: true, tenantId: true, workOrderId: true, status: true, serviceKey: true },
    });
    if (!task) throw new NotFoundException({ code: "task_not_found", message: "Task not found." });

    const openBlockers = await this.prisma.taskBlocker.count({
      where: { taskId, status: { in: ["OPEN", "ESCALATED"] } },
    });
    if (openBlockers > 0) {
      throw new BadRequestException({
        code: "task_blocked",
        message: "Resolve the blocker on this task before completing it.",
      });
    }

    const timeTracking = await this.policies.resolveValue(task.tenantId, "TIME_TRACKING");
    if (timeTracking === "REQUIRED" && minutesSpent === undefined) {
      throw new BadRequestException({
        code: "time_not_recorded",
        message: "Record how long this task took before completing it.",
      });
    }
    // OFF: the control is absent from the Work Card, so the value is
    // never persisted even if a caller sent one anyway.
    const actualMinutes = timeTracking === "OFF" ? null : minutesSpent ?? null;

    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({ where: { id: taskId }, data: { status: "DONE", actualMinutes } });
      await this.events.emit(
        {
          tenantId: task.tenantId,
          eventKey: "task.completed",
          actorId: actor.accountId,
          actorName: actor.displayName,
          actorType: actor.actorType,
          targetType: "Task",
          targetId: taskId,
          riskLevel: "LOW",
          // serviceKey rides along so the billing and reporting sides can
          // tell WHICH catalogued service was performed without reaching
          // into operations tables. Finance owning the charge and
          // Operations owning the work is the boundary; the event is how
          // they agree on what happened.
          payload: { taskId, workOrderId: task.workOrderId, serviceKey: task.serviceKey, actualMinutes },
        },
        tx,
      );
    });
  }

  /**
   * The technician's own press of "Ready to finish" -- the FINISH intent,
   * asked for real rather than only previewed.
   *
   * `finishCheck` (technician-work-view.service.ts) shows the same gates
   * beforehand so a refusal here should never surprise anyone, but the
   * check is a preview and this is the write: the lifecycle service
   * re-evaluates the gates itself and throws if anything closed between
   * the preview and the press, which is the only way this stays correct
   * under a technician who leaves the tablet open.
   */
  async finishWorkOrder(workOrderId: string, actor: LifecycleActor) {
    return this.lifecycle.apply(workOrderId, "FINISH", actor);
  }

  async startInspection(workOrderId: string, actor: LifecycleActor) {
    return this.lifecycle.apply(workOrderId, "START_INSPECTION", actor);
  }

  async startWork(workOrderId: string, actor: LifecycleActor) {
    return this.lifecycle.apply(workOrderId, "START_WORK", actor);
  }

  async addExternalPartLine(
    workOrderId: string,
    input: { name: string; provenance: "CUSTOMER_SUPPLIED" | "EXTERNAL_PURCHASE"; quantity?: number },
    actor: LifecycleActor,
  ) {
    const workOrder = await this.requireWorkOrder(workOrderId);
    const quantity = input.quantity ?? 1;
    return this.prisma.$transaction(async (tx) => {
      const line = await tx.workOrderPartLine.create({
        data: {
          tenantId: workOrder.tenantId,
          workOrderId,
          name: input.name,
          provenance: input.provenance,
          quantity,
          // Customer-supplied: zero cost, not warranted by workshop.
          // External purchase: cost unknown at this point; sellingPrice set by finance later via catalog? For now zero cost/sellingPrice, finance will snapshot.
          sellingPrice: 0,
          cost: null,
          workshopWarranted: input.provenance === "CUSTOMER_SUPPLIED" ? false : true,
          addedById: actor.accountId,
        },
      });
      await this.events.emit(
        {
          tenantId: workOrder.tenantId,
          eventKey: "work_order.external_part_added",
          actorId: actor.accountId,
          actorName: actor.displayName,
          actorType: actor.actorType,
          targetType: "WorkOrderPartLine",
          targetId: line.id,
          riskLevel: "LOW",
          payload: { workOrderId, name: input.name, provenance: input.provenance, quantity },
        },
        tx,
      );
      return line;
    });
  }

  /**
   * Which catalogued services were actually performed on this job, and by
   * whom.
   *
   * This is the question billing asks before issuing ("what labour do we
   * charge for") and the one History and reports ask afterwards ("what did
   * we actually do"). It exists here, in the system that owns Task, so
   * neither of those has to reach into operations tables to answer it.
   *
   * Only DONE tasks count. Work that is still open is not something a
   * customer should be billed for or a report should claim as output.
   */
  async performedServices(
    workOrderId: string,
  ): Promise<readonly { taskId: string; serviceKey: string; title: string; technicianIds: readonly string[] }[]> {
    const tasks = await this.prisma.task.findMany({
      where: { workOrderId, status: "DONE", serviceKey: { not: null } },
      select: {
        id: true,
        title: true,
        serviceKey: true,
        assignments: { where: { unassignedAt: null }, select: { staffUserId: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return tasks.map((task) => ({
      taskId: task.id,
      serviceKey: task.serviceKey as string,
      title: task.title,
      technicianIds: task.assignments.map((a) => a.staffUserId),
    }));
  }

  async recordInspection(input: RecordInspectionInput, actor: LifecycleActor) {
    const workOrder = await this.requireWorkOrder(input.workOrderId);
    const owner = await this.prisma.workOrder.findUnique({
      where: { id: input.workOrderId },
      select: { customerId: true },
    });

    return this.prisma.$transaction(async (tx) => {
      const inspection = await tx.inspection.create({
        data: {
          tenantId: workOrder.tenantId,
          workOrderId: input.workOrderId,
          technicianId: input.technicianId,
          type: input.type,
          odometerOrHours: input.odometerOrHours,
          fields: input.fields as Prisma.InputJsonValue,
          note: input.note,
        },
      });

      await this.events.emit(
        {
          tenantId: workOrder.tenantId,
          eventKey: "inspection.saved",
          actorId: actor.accountId,
          actorName: actor.displayName,
          actorType: actor.actorType,
          targetType: "Inspection",
          targetId: inspection.id,
          riskLevel: "LOW",
          payload: { inspectionId: inspection.id, workOrderId: input.workOrderId, type: input.type },
          // "Your vehicle is being inspected." -- another sentence that
          // existed in CustomerSafeProjectionService and was unreachable
          // because nothing passed a customer.
          ...(owner ? { customer: { customerId: owner.customerId, workOrderId: input.workOrderId } } : {}),
        },
        tx,
      );

      return inspection;
    });
  }

  /**
   * A fault is a finding, not a decision. Whether the customer must
   * approve the work it implies is recorded here; asking them is the
   * customer-decision flow's job.
   */
  async createFault(input: CreateFaultInput, actor: LifecycleActor) {
    const workOrder = await this.requireWorkOrder(input.workOrderId);

    return this.prisma.$transaction(async (tx) => {
      const fault = await tx.fault.create({
        data: {
          tenantId: workOrder.tenantId,
          workOrderId: input.workOrderId,
          inspectionId: input.inspectionId,
          code: input.code,
          description: input.description,
          severity: input.severity,
          recommendedService: input.recommendedService,
          customerApprovalRequired: input.customerApprovalRequired ?? true,
        },
      });

      await this.events.emit(
        {
          tenantId: workOrder.tenantId,
          eventKey: "fault.created",
          actorId: actor.accountId,
          actorName: actor.displayName,
          actorType: actor.actorType,
          targetType: "Fault",
          targetId: fault.id,
          // A CRITICAL finding is a safety matter and should stand out in
          // the audit trail rather than sitting among routine entries.
          riskLevel: input.severity === "CRITICAL" ? "HIGH" : "LOW",
          payload: {
            faultId: fault.id,
            workOrderId: input.workOrderId,
            severity: input.severity,
            code: input.code ?? null,
          },
          // Deliberately no customer projection: a raw fault is internal
          // until it becomes a priced decision the customer can answer.
        },
        tx,
      );

      return fault;
    });
  }

  /**
   * Reporting a blocker records it, moves the work order to BLOCKED
   * through the lifecycle, and carries its audience on the event so the
   * right roles can surface it.
   *
   * Locks the WorkOrder row before writing (H1,
   * `docs/scenarios3/EDGE_CASE_REGISTER.md`): a technician reporting a new
   * blocker and a storekeeper resolving the work order's last open one can
   * race so that `resolveBlocker`'s "is anything still blocking this"
   * count reads before this create has committed, wrongly unblocking a
   * work order that, a moment later, turns out to still have an open
   * blocker on it. Both methods take the same `FOR UPDATE` lock on the
   * work order first, so whichever one runs first is fully visible to
   * the other before it decides anything -- same discipline as the
   * stock-balance lock, H6/E16.
   */
  async reportBlocker(input: ReportBlockerInput, actor: LifecycleActor) {
    const task = await this.prisma.task.findUnique({
      where: { id: input.taskId },
      select: { id: true, tenantId: true, workOrderId: true },
    });
    if (!task) throw new NotFoundException({ code: "task_not_found", message: "Task not found." });

    const route = routeForBlocker(input.reason);

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "work_orders" WHERE id = ${task.workOrderId} FOR UPDATE`;

      const created = await tx.taskBlocker.create({
        data: {
          tenantId: task.tenantId,
          taskId: input.taskId,
          reason: input.reason,
          note: input.note,
          reportedBy: actor.accountId,
          status: route.urgency === "URGENT" ? "ESCALATED" : "OPEN",
        },
      });

      await tx.task.update({ where: { id: input.taskId }, data: { status: "BLOCKED" } });

      await this.events.emit(
        {
          tenantId: task.tenantId,
          eventKey: "blocker.reported",
          actorId: actor.accountId,
          actorName: actor.displayName,
          actorType: actor.actorType,
          targetType: "TaskBlocker",
          targetId: created.id,
          riskLevel: route.urgency === "URGENT" ? "HIGH" : "LOW",
          payload: {
            blockerId: created.id,
            taskId: input.taskId,
            workOrderId: task.workOrderId,
            reason: input.reason,
            // Carried on the event so a consumer never has to re-derive
            // who cares about this reason.
            notify: route.notify,
            urgency: route.urgency,
          },
        },
        tx,
      );

      // Still inside the same locked transaction, so this decision and
      // the create above are one atomic unit against a concurrent
      // resolveBlocker's own decision. The work order may already be
      // BLOCKED from another task, in which case the graph refuses --
      // correctly, and it is not an error.
      await this.moveIfPossible(task.workOrderId, "REPORT_BLOCKER", actor, input.reason, tx);

      return created;
    });
  }

  async resolveBlocker(blockerId: string, actor: LifecycleActor) {
    const blocker = await this.prisma.taskBlocker.findUnique({
      where: { id: blockerId },
      select: { id: true, tenantId: true, taskId: true, task: { select: { workOrderId: true } } },
    });
    if (!blocker) throw new NotFoundException({ code: "blocker_not_found", message: "Blocker not found." });

    // "Still blocked", and the resulting decision to unblock the work
    // order, both happen inside the same transaction, after the same
    // FOR UPDATE lock reportBlocker takes and while still holding it --
    // not as separate queries/writes afterward. A concurrent
    // reportBlocker either committed its new blocker before this
    // transaction acquired the lock (so the count below sees it and
    // correctly does not unblock) or is still waiting on the lock (so it
    // genuinely did not exist yet when this decided, and will re-block
    // the work order itself once it proceeds).
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "work_orders" WHERE id = ${blocker.task.workOrderId} FOR UPDATE`;

      await tx.taskBlocker.update({
        where: { id: blockerId },
        data: { status: "RESOLVED", resolvedAt: new Date() },
      });
      await tx.task.update({ where: { id: blocker.taskId }, data: { status: "IN_PROGRESS" } });

      await this.events.emit(
        {
          tenantId: blocker.tenantId,
          eventKey: "blocker.resolved",
          actorId: actor.accountId,
          actorName: actor.displayName,
          actorType: actor.actorType,
          targetType: "TaskBlocker",
          targetId: blockerId,
          riskLevel: "LOW",
          payload: { blockerId, taskId: blocker.taskId, workOrderId: blocker.task.workOrderId },
        },
        tx,
      );

      const stillBlocked = await tx.taskBlocker.count({
        where: { task: { workOrderId: blocker.task.workOrderId }, status: { in: ["OPEN", "ESCALATED"] } },
      });

      // Only unblock the work order once nothing else is holding it.
      if (stillBlocked === 0) {
        await this.moveIfPossible(blocker.task.workOrderId, "RESOLVE_BLOCKER", actor, undefined, tx);
      }
    });
  }

  /**
   * Applies a lifecycle intent where the graph allows it, and stays quiet
   * where it does not.
   *
   * A second blocker on an already-blocked work order is a legitimate
   * situation, not a failure -- the record is still created, the job is
   * simply already where it needs to be. Swallowing the refusal here is
   * safe precisely because the lifecycle service is the thing that decides
   * whether a move is legal; this never assumes it.
   */
  private async moveIfPossible(
    workOrderId: string,
    intent: "REPORT_BLOCKER" | "RESOLVE_BLOCKER",
    actor: LifecycleActor,
    reason?: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    try {
      await this.lifecycle.apply(workOrderId, intent, actor, { reason, tx });
    } catch {
      // Not available from the work order's current state; the record
      // stands on its own.
    }
  }

  private async requireWorkOrder(workOrderId: string) {
    const workOrder = await this.prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: { id: true, tenantId: true, status: true },
    });
    if (!workOrder) {
      throw new NotFoundException({ code: "work_order_not_found", message: "Work order not found." });
    }
    return workOrder;
  }
}
