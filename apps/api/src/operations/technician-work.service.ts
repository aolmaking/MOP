import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { routeForBlocker, type BlockerReasonKey } from "@mop/shared";
import type { InspectionType, Prisma, SeverityLevel } from "@mop/database";
import { PrismaService } from "../database/prisma.service";
import { OperationEventsService } from "./operation-events.service";
import { WorkOrderLifecycleService, type LifecycleActor } from "./work-order-lifecycle.service";

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
  ) {}

  async createTask(workOrderId: string, title: string, actor: LifecycleActor, assignToStaffUserId?: string) {
    const workOrder = await this.requireWorkOrder(workOrderId);

    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: { tenantId: workOrder.tenantId, workOrderId, title },
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
      select: { id: true, tenantId: true, workOrderId: true, status: true },
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
          payload: { taskId, workOrderId: task.workOrderId },
        },
        tx,
      );
    });
  }

  async completeTask(taskId: string, actor: LifecycleActor) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, tenantId: true, workOrderId: true, status: true },
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

    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({ where: { id: taskId }, data: { status: "DONE" } });
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
          payload: { taskId, workOrderId: task.workOrderId },
        },
        tx,
      );
    });
  }

  async recordInspection(input: RecordInspectionInput, actor: LifecycleActor) {
    const workOrder = await this.requireWorkOrder(input.workOrderId);

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
   */
  async reportBlocker(input: ReportBlockerInput, actor: LifecycleActor) {
    const task = await this.prisma.task.findUnique({
      where: { id: input.taskId },
      select: { id: true, tenantId: true, workOrderId: true },
    });
    if (!task) throw new NotFoundException({ code: "task_not_found", message: "Task not found." });

    const route = routeForBlocker(input.reason);

    const blocker = await this.prisma.$transaction(async (tx) => {
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

      return created;
    });

    // The work order may already be BLOCKED from another task, in which
    // case the graph refuses -- correctly, and it is not an error.
    await this.moveIfPossible(task.workOrderId, "REPORT_BLOCKER", actor, input.reason);

    return blocker;
  }

  async resolveBlocker(blockerId: string, actor: LifecycleActor) {
    const blocker = await this.prisma.taskBlocker.findUnique({
      where: { id: blockerId },
      select: { id: true, tenantId: true, taskId: true, task: { select: { workOrderId: true } } },
    });
    if (!blocker) throw new NotFoundException({ code: "blocker_not_found", message: "Blocker not found." });

    await this.prisma.$transaction(async (tx) => {
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
    });

    // Only unblock the work order once nothing else is holding it.
    const stillBlocked = await this.prisma.taskBlocker.count({
      where: { task: { workOrderId: blocker.task.workOrderId }, status: { in: ["OPEN", "ESCALATED"] } },
    });
    if (stillBlocked === 0) {
      await this.moveIfPossible(blocker.task.workOrderId, "RESOLVE_BLOCKER", actor);
    }
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
  ): Promise<void> {
    try {
      await this.lifecycle.apply(workOrderId, intent, actor, { reason });
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
