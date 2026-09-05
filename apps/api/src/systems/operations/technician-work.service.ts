import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { routeForBlocker, type BlockerReasonKey } from "@mop/shared";
import type { Inspection, InspectionType, Prisma, SeverityLevel, TaskReworkReason } from "@mop/database";
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
  /**
   * Minutes the diagnosis took, under the same TIME_TRACKING policy that
   * governs Task.actualMinutes. Diagnostic labour is labour; a workshop
   * that measures repair time but not diagnosis time cannot see what its
   * inspections cost.
   */
  readonly actualMinutes?: number;
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
    decisionItemId?: string,
  ) {
    const workOrder = await this.requireWorkOrder(workOrderId);

    // A Task IS authorized work -- that is the whole meaning of the type,
    // so one must not exist before the job's own effective workflow has
    // authorized any. Planning was the quietest of the bypasses: nothing
    // here consulted the work order's state, so a full repair could be
    // written onto a REGISTERED job, handed to a technician, started,
    // parted, completed and billed, with the finish gate as the first and
    // only objection -- raised after the money was already spent.
    //
    // Diagnostic work needs no task and is not blocked by this: it is an
    // Inspection, which is the one work vehicle a pre-authorization job
    // legitimately has.
    await this.lifecycle.assertOperationalWorkAuthorized(workOrderId);

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

    // Planning work AGAINST an approved recommendation is what makes
    // "was this recommendation performed?" answerable later from domain
    // evidence rather than from a string comparison. Three things are
    // checked, and each of them is a different lie the history would
    // otherwise be able to tell:
    //
    //   - the item must belong to THIS work order, or a job could claim
    //     to be carrying out a recommendation made on another vehicle;
    //   - it must be APPROVED, because planning work against something
    //     the customer declined or has not answered would show up in
    //     history as work they agreed to;
    //   - it must exist in this tenant, for the usual reason.
    if (decisionItemId) {
      const item = await this.prisma.customerDecisionItem.findFirst({
        where: {
          id: decisionItemId,
          tenantId: workOrder.tenantId,
          decisionRequest: { workOrderId },
        },
        select: { decision: true },
      });
      if (!item) {
        throw new BadRequestException({
          code: "recommendation_not_on_this_job",
          message: "That recommendation does not belong to this job.",
        });
      }
      if (item.decision !== "APPROVED") {
        throw new BadRequestException({
          code: "recommendation_not_approved",
          message: "That recommendation has not been approved by the customer.",
        });
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          tenantId: workOrder.tenantId,
          workOrderId,
          title,
          serviceKey: serviceKey ?? null,
          decisionItemId: decisionItemId ?? null,
        },
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
      select: { id: true, tenantId: true, workOrderId: true, status: true, serviceKey: true, startedAt: true },
    });
    if (!task) throw new NotFoundException({ code: "task_not_found", message: "Task not found." });

    if (task.status === "DONE" || task.status === "CANCELLED") {
      throw new BadRequestException({ code: "task_finished", message: "That task is already finished." });
    }

    // Asked again at the press, not only when the task was planned. A job
    // authorized this morning can be back in AWAITING_CUSTOMER_APPROVAL
    // this afternoon, and a task created while it was legal must not stay
    // startable through the change.
    await this.lifecycle.assertOperationalWorkAuthorized(task.workOrderId);

    const executionPolicy = await this.policies.resolveValue(task.tenantId, "UNAPPROVED_WORK_EXECUTION");
    if (executionPolicy === "BLOCKED") {
      const pendingApproval = await this.prisma.customerDecisionRequest.count({
        where: {
          workOrderId: task.workOrderId,
          status: { in: ["SENT", "VIEWED", "PARTIALLY_RESPONDED"] },
        },
      });
      if (pendingApproval > 0) {
        throw new ConflictException({
          code: "work_not_authorized",
          message: "Customer approval is pending for this job. Work cannot start until customer approval is granted.",
        });
      }
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
      // `startedAt` is stamped once and never overwritten: a task paused
      // by a blocker and resumed later still started when it started, and
      // the ordering check compares against the FIRST time work happened.
      await tx.task.update({
        where: { id: taskId },
        data: { status: "IN_PROGRESS", ...(task.startedAt ? {} : { startedAt: new Date() }) },
      });
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

    // Completion is the moment work becomes a charge: chargeable-items
    // reads DONE tasks. Authorization is therefore checked here too, so a
    // task that slipped through before this boundary existed cannot be
    // completed into an invoice line for work nobody agreed to.
    await this.lifecycle.assertOperationalWorkAuthorized(task.workOrderId);

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
      await tx.task.update({ where: { id: taskId }, data: { status: "DONE", actualMinutes, completedAt: new Date() } });
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
   * Transitions a task to RETURNED_FOR_REWORK.
   * Preserves current assignment and records structured reason and optional note.
   */
  async returnTaskForRework(
    taskId: string,
    actor: LifecycleActor,
    input: { reason?: TaskReworkReason; note?: string } = {},
  ) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, tenantId: true, workOrderId: true, status: true, serviceKey: true },
    });
    if (!task) throw new NotFoundException({ code: "task_not_found", message: "Task not found." });

    if (task.status === "CANCELLED") {
      throw new BadRequestException({ code: "task_cancelled", message: "Cancelled task cannot be returned for rework." });
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id: taskId },
        data: {
          status: "RETURNED_FOR_REWORK",
          reworkReason: input.reason ?? null,
          reworkNote: input.note ?? null,
        },
      });

      await this.events.emit(
        {
          tenantId: task.tenantId,
          eventKey: "task.returned_for_rework",
          actorId: actor.accountId,
          actorName: actor.displayName,
          actorType: actor.actorType,
          targetType: "Task",
          targetId: taskId,
          riskLevel: "LOW",
          payload: {
            taskId,
            workOrderId: task.workOrderId,
            serviceKey: task.serviceKey,
            reason: input.reason ?? null,
            note: input.note ?? null,
          },
        },
        tx,
      );

      return updated;
    });
  }

  /**
   * Creates a dedicated rework task linked explicitly to an original task.
   * Copies workOrderId, tenantId, and serviceKey from the original task,
   * while recording the structured rework reason and optional note.
   */
  async createReworkTask(
    input: {
      originalTaskId: string;
      title?: string;
      reason: TaskReworkReason;
      note?: string;
      assignToStaffUserId?: string;
    },
    actor: LifecycleActor,
  ) {
    const original = await this.prisma.task.findUnique({
      where: { id: input.originalTaskId },
      select: {
        id: true,
        tenantId: true,
        workOrderId: true,
        title: true,
        serviceKey: true,
        decisionItemId: true,
        status: true,
      },
    });
    if (!original) {
      throw new NotFoundException({ code: "original_task_not_found", message: "Original task not found." });
    }

    // Work order must still be authorized for operational work
    await this.lifecycle.assertOperationalWorkAuthorized(original.workOrderId);

    const taskTitle = input.title ?? `Rework: ${original.title}`;

    return this.prisma.$transaction(async (tx) => {
      const reworkTask = await tx.task.create({
        data: {
          tenantId: original.tenantId,
          workOrderId: original.workOrderId,
          title: taskTitle,
          serviceKey: original.serviceKey,
          decisionItemId: original.decisionItemId,
          originalTaskId: original.id,
          reworkReason: input.reason,
          reworkNote: input.note ?? null,
        },
      });

      if (input.assignToStaffUserId) {
        await tx.taskAssignment.create({
          data: {
            tenantId: original.tenantId,
            taskId: reworkTask.id,
            staffUserId: input.assignToStaffUserId,
          },
        });
      }

      await this.events.emit(
        {
          tenantId: original.tenantId,
          eventKey: "task.rework_created",
          actorId: actor.accountId,
          actorName: actor.displayName,
          actorType: actor.actorType,
          targetType: "Task",
          targetId: reworkTask.id,
          riskLevel: "LOW",
          payload: {
            taskId: reworkTask.id,
            originalTaskId: original.id,
            workOrderId: original.workOrderId,
            serviceKey: original.serviceKey,
            reason: input.reason,
            note: input.note ?? null,
          },
        },
        tx,
      );

      return reworkTask;
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

  /**
   * Begins a vehicle inspection.
   *
   * The lifecycle transition and the Inspection row are atomic: if either
   * write fails, neither persists. The WorkOrder row is locked first
   * (`FOR UPDATE`) so that two concurrent presses on the same job cannot
   * both observe "no open inspection" and each create one.
   *
   * Idempotent by design:
   *   - WorkOrder already `UNDER_INSPECTION` + open Inspection row exists
   *     → returns the existing inspection without retrying the transition.
   *   - WorkOrder already `UNDER_INSPECTION` + no open row
   *     → creates the missing row (backward-compat for jobs that reached
   *       UNDER_INSPECTION before this column existed).
   *   - WorkOrder in any state where `START_INSPECTION` is not an allowed
   *     intent → lifecycle.apply throws; transaction rolls back; nothing
   *     persists.
   */
  async startInspection(workOrderId: string, actor: LifecycleActor) {
    const workOrder = await this.requireWorkOrder(workOrderId);

    return this.prisma.$transaction(async (tx) => {
      // Serialize all concurrent startInspection calls on the WorkOrder
      // row. A second caller either sees the row after the first committed
      // (and finds an existing open Inspection below) or waits for the
      // first to finish -- in either case only one Inspection is created.
      await tx.$queryRaw`SELECT id FROM "work_orders" WHERE id = ${workOrderId} FOR UPDATE`;

      // Idempotency check. An existing open row means this call is a
      // replay or a double-tap; return the existing row rather than
      // creating a second one.
      const existing = await tx.inspection.findFirst({
        where: { workOrderId, completedAt: null },
        select: { id: true },
      });

      if (existing && workOrder.status === "UNDER_INSPECTION") {
        // Already in the right state with a live inspection row -- nothing
        // to do. Return what already exists.
        return {
          workOrderId,
          from: "UNDER_INSPECTION" as const,
          to: "UNDER_INSPECTION" as const,
          inspectionId: existing.id,
        };
      }

      const inspection = existing ?? (await tx.inspection.create({
        data: {
          tenantId: workOrder.tenantId,
          workOrderId,
          // The technician's account is the closest available identity at
          // this point. recordInspection() will carry the same staffUserId.
          technicianId: actor.accountId,
          // The type is filled in by recordInspection(); QUICK is a
          // placeholder that will be overwritten when the findings land.
          type: "QUICK",
          fields: {},
          startedAt: new Date(),
          // completedAt intentionally null -- marks this as in-progress.
        },
        select: { id: true },
      }));

      // The lifecycle write is folded into this transaction via options.tx.
      // If the graph refuses (wrong state, policy, capability) the whole
      // transaction rolls back and neither write persists.
      const result = await this.lifecycle.apply(workOrderId, "START_INSPECTION", actor, { tx });

      return { ...result, inspectionId: inspection.id };
    });
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

    // A WorkOrderPartLine is billable on creation and never passes through
    // inventory, which made this the shortest route from "unauthorized
    // job" to "charge on an invoice" in the whole product.
    await this.lifecycle.assertOperationalWorkAuthorized(workOrderId);

    if (input.provenance === "CUSTOMER_SUPPLIED") {
      const policy = await this.policies.resolveValue(workOrder.tenantId, "CUSTOMER_SUPPLIED_PARTS");
      if (policy === "REFUSED") {
        throw new BadRequestException({
          code: "customer_parts_refused",
          message: "Customer-supplied parts are not accepted by this workshop.",
        });
      }
    } else if (input.provenance === "EXTERNAL_PURCHASE") {
      const policy = await this.policies.resolveValue(workOrder.tenantId, "DIRECT_PART_PURCHASE");
      if (policy === "NEVER") {
        throw new BadRequestException({
          code: "direct_purchase_forbidden",
          message: "Direct part purchases are not allowed; parts must be received into and issued from inventory.",
        });
      }
      if (policy === "ONLY_IF_OUT_OF_STOCK") {
        const inStock = await this.prisma.inventoryItem.findFirst({
          where: {
            tenantId: workOrder.tenantId,
            name: { equals: input.name, mode: "insensitive" },
            stockBalances: { some: { availableQty: { gt: 0 } } },
          },
          select: { id: true },
        });
        if (inStock) {
          throw new BadRequestException({
            code: "warehouse_stock_available",
            message: `Stock is available in the warehouse for "${input.name}". Issue from inventory instead of purchasing directly.`,
          });
        }
      }
    }

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

  /**
   * Records a completed inspection.
   *
   * Finds the open (completedAt = null) Inspection row created by
   * `startInspection()` and stamps it with `completedAt` and the
   * technician's findings. If no open row exists -- because this job
   * reached UNDER_INSPECTION before this column existed -- a completed
   * row is created directly (backward-compatible fallback).
   *
   * The stamped time is what the `inspection_completed` gate reads. It
   * comes from the server so that "when was this inspected" cannot be
   * supplied by a client: that timestamp decides whether work that
   * already happened was legal, and a client-supplied answer is not
   * evidence.
   *
   * After the inspection row is committed, this method attempts to
   * advance the work order to APPROVED_FOR_WORK based on the workshop's
   * APPROVAL_REQUIRED_SCOPE policy:
   *
   *   BEYOND_INITIAL_SCOPE  -- always attempt APPROVE via moveIfPossible.
   *   CRITICAL_ONLY         -- attempt APPROVE only when no CRITICAL fault
   *                           exists without a linked CustomerDecisionItem;
   *                           otherwise remain at UNDER_INSPECTION and
   *                           return pendingCriticalDecisions: true.
   *   ALL_WORK              -- never attempt APPROVE; the customer-decision
   *                           flow is the sole authority for progression.
   */
  async recordInspection(input: RecordInspectionInput, actor: LifecycleActor) {
    const workOrder = await this.requireWorkOrder(input.workOrderId);
    const owner = await this.prisma.workOrder.findUnique({
      where: { id: input.workOrderId },
      select: { customerId: true, tenantId: true },
    });

    // Resolve before the transaction -- policy lookups are read-only and
    // adding them inside the write transaction would extend its duration
    // unnecessarily.
    const approvalScope = await this.policies.resolveValue(workOrder.tenantId, "APPROVAL_REQUIRED_SCOPE");

    const completedAt = new Date();

    const inspection = await this.prisma.$transaction(async (tx) => {
      // Find an in-progress row created by startInspection().
      const open = await tx.inspection.findFirst({
        where: { workOrderId: input.workOrderId, completedAt: null },
        select: { id: true },
      });

      let row: Inspection;
      if (open) {
        // Complete the existing in-progress row.
        row = await tx.inspection.update({
          where: { id: open.id },
          data: {
            completedAt,
            actualMinutes: input.actualMinutes ?? null,
            technicianId: input.technicianId,
            type: input.type,
            odometerOrHours: input.odometerOrHours,
            fields: input.fields as Prisma.InputJsonValue,
            note: input.note,
          },
        });
      } else {
        // Backward-compatible fallback: job reached UNDER_INSPECTION before
        // the open-row pattern existed. Create a completed row directly.
        row = await tx.inspection.create({
          data: {
            completedAt,
            actualMinutes: input.actualMinutes ?? null,
            tenantId: workOrder.tenantId,
            workOrderId: input.workOrderId,
            technicianId: input.technicianId,
            type: input.type,
            odometerOrHours: input.odometerOrHours,
            fields: input.fields as Prisma.InputJsonValue,
            note: input.note,
            startedAt: completedAt,
          },
        });
      }

      await this.events.emit(
        {
          tenantId: workOrder.tenantId,
          eventKey: "inspection.saved",
          actorId: actor.accountId,
          actorName: actor.displayName,
          actorType: actor.actorType,
          targetType: "Inspection",
          targetId: row.id,
          riskLevel: "LOW",
          payload: { inspectionId: row.id, workOrderId: input.workOrderId, type: input.type },
          ...(owner ? { customer: { customerId: owner.customerId, workOrderId: input.workOrderId } } : {}),
        },
        tx,
      );

      return row;
    });

    // Post-commit: attempt to advance the work order. Done outside the
    // inspection transaction so that a lifecycle refusal (e.g. graph does
    // not allow APPROVE from the current state) does not roll back the
    // completed inspection row -- the finding is durable regardless.
    let pendingCriticalDecisions = false;

    if (approvalScope === "ALL_WORK") {
      // Customer-decision flow is the sole authority. Do not attempt APPROVE.
    } else if (approvalScope === "CRITICAL_ONLY") {
      const evaluation = await this.evaluateCriticalFaultProgression(input.workOrderId);
      pendingCriticalDecisions = evaluation.pendingCriticalDecisions;
      if (evaluation.canAutoApprove) {
        // Case A: no CRITICAL faults exist. Attempt APPROVE; graph and gate decide.
        await this.moveIfPossible(input.workOrderId, "APPROVE", actor);
      }
      // Case B: at least one CRITICAL fault has no linked item -- remain
      // UNDER_INSPECTION. pendingCriticalDecisions: true is returned.
      // Case C: all CRITICAL faults are covered by a CustomerDecisionItem.
      // CustomerDecisionService owns the APPROVE transition once the
      // customer answers (decision.service.ts line 717), so we do not call
      // moveIfPossible here. pendingCriticalDecisions is false.
    } else {
      // BEYOND_INITIAL_SCOPE (default): scope-delta comparison is not yet
      // built (registry.ts enforcement.where). Attempt APPROVE -- the
      // graph's own gate (inspection_completed) is the enforcer.
      await this.moveIfPossible(input.workOrderId, "APPROVE", actor);
    }

    return { ...inspection, pendingCriticalDecisions };
  }

  /**
   * Evaluates whether a job with CRITICAL_ONLY policy can auto-advance to
   * APPROVED_FOR_WORK after inspection.
   *
   * The check is per-fault, per-item via the lineage FK (CustomerDecisionItem.faultId).
   *
   *   Case A: No CRITICAL faults exist -> canAutoApprove: true, pendingCriticalDecisions: false
   *   Case B: CRITICAL faults exist, >=1 without linked item -> canAutoApprove: false, pendingCriticalDecisions: true
   *   Case C: CRITICAL faults exist, all linked to items -> canAutoApprove: false, pendingCriticalDecisions: false
   *           (CustomerDecisionService owns APPROVE when the customer responds)
   */
  private async evaluateCriticalFaultProgression(
    workOrderId: string,
  ): Promise<{ canAutoApprove: boolean; pendingCriticalDecisions: boolean }> {
    const criticalFaults = await this.prisma.fault.findMany({
      where: { workOrderId, severity: "CRITICAL" },
      select: { id: true },
    });

    if (criticalFaults.length === 0) {
      return { canAutoApprove: true, pendingCriticalDecisions: false };
    }

    const criticalFaultIds = criticalFaults.map((f) => f.id);

    const linkedItems = await this.prisma.customerDecisionItem.findMany({
      where: { faultId: { in: criticalFaultIds } },
      select: { faultId: true },
    });

    const coveredIds = new Set(linkedItems.map((i) => i.faultId).filter((id): id is string => id !== null));
    const hasUncovered = criticalFaults.some((f) => !coveredIds.has(f.id));

    if (hasUncovered) {
      return { canAutoApprove: false, pendingCriticalDecisions: true };
    }

    return { canAutoApprove: false, pendingCriticalDecisions: false };
  }

  /**
   * A fault is a finding, not a decision. Whether the customer must
   * approve the work it implies is recorded here; asking them is the
   * customer-decision flow's job.
   *
   * When `inspectionId` is supplied, it is validated to belong to this
   * work order before the row is written. A fault citing an inspection
   * from another job would let a technician attach a finding to evidence
   * that does not belong to this vehicle, which is the same lie
   * Task.decisionItemId's own check exists to prevent -- one step earlier
   * in the Inspection → Fault → Recommendation → Task chain.
   */
  async createFault(input: CreateFaultInput, actor: LifecycleActor) {
    const workOrder = await this.requireWorkOrder(input.workOrderId);

    if (input.inspectionId) {
      const inspection = await this.prisma.inspection.findFirst({
        where: { id: input.inspectionId, workOrderId: input.workOrderId },
        select: { id: true },
      });
      if (!inspection) {
        throw new BadRequestException({
          code: "inspection_not_on_this_job",
          message: "That inspection does not belong to this job.",
        });
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const fault = await tx.fault.create({
        data: {
          tenantId: workOrder.tenantId,
          workOrderId: input.workOrderId,
          inspectionId: input.inspectionId ?? null,
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
   * Used in three contexts:
   *   - REPORT_BLOCKER / RESOLVE_BLOCKER: called inside a FOR-UPDATE
   *     transaction; `tx` is passed so the status write is atomic with
   *     the blocker record.
   *   - APPROVE: called after recordInspection() commits; `tx` is absent
   *     so the lifecycle opens its own transaction. A refusal here does
   *     not roll back the completed inspection row.
   *
   * Swallowing the error is safe precisely because WorkOrderLifecycleService
   * is the thing that decides whether a move is legal; this never assumes
   * it. A second blocker on an already-blocked work order is legitimate,
   * not a failure. An APPROVE on a job the graph cannot move is likewise
   * a non-error: the inspection is still durable.
   */
  private async moveIfPossible(
    workOrderId: string,
    intent: "REPORT_BLOCKER" | "RESOLVE_BLOCKER" | "APPROVE",
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
