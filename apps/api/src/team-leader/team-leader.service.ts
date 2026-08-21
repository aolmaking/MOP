import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../runtime/database/prisma.service";
import { AssetHistoryService } from "../systems/operations/vehicle-history/asset-history.service";

export interface TeamLeaderHome {
  readonly managedCount: number;
  readonly activeWork: number;
  readonly blockedTechnicians: number;
  readonly waitingParts: number;
  readonly waitingCustomer: number;
  readonly reworkIssues: number;
  readonly recentActivity: readonly {
    id: string;
    eventKey: string;
    actorId: string;
    createdAt: Date;
  }[];
}

export interface TechnicianRow {
  readonly staffUserId: string;
  readonly fullName: string;
  readonly currentTask: { id: string; title: string; workOrderId: string } | null;
  readonly openBlockers: number;
  readonly tasksCompletedToday: number;
}

export interface TechnicianDetail extends TechnicianRow {
  readonly recentTasks: readonly { id: string; title: string; status: string; workOrderId: string }[];
  readonly supervisionNotes: readonly { id: string; body: string; escalated: boolean; authorId: string; createdAt: Date }[];
}

export interface ManagedWorkOrder {
  readonly workOrderId: string;
  readonly identifier: string | null;
  readonly status: string;
  readonly technicianId: string;
  readonly technicianName: string;
  readonly taskCount: number;
  readonly openBlockers: number;
}

export interface TechnicianPerformanceRow {
  readonly staffUserId: string;
  readonly fullName: string;
  readonly tasksCompleted: number;
  readonly activeTasks: number;
  readonly blockers: number;
  readonly reworkCount: number;
}

/**
 * Team Leader -- every read here is scoped to `managedTechnicianIds`,
 * never `branchScope`. That array is computed fresh per request by
 * AuthService from real TeamMembership rows, so a Team Leader managing
 * technicians across two branches correctly sees both, and a technician
 * on someone else's team, anywhere, is invisible -- not filtered
 * client-side, absent from every query below by construction.
 *
 * No method here can complete a task, issue a part, record a payment,
 * or decide a review. Those permissions simply do not exist in this
 * role's RolePermission set (see default-role-permissions.ts); this
 * service does not additionally need to check for their absence,
 * because it never calls the services that would perform them.
 */
@Injectable()
export class TeamLeaderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assetHistory: AssetHistoryService,
  ) {}

  async home(tenantId: string, managedTechnicianIds: readonly string[]): Promise<TeamLeaderHome> {
    if (managedTechnicianIds.length === 0) {
      return {
        managedCount: 0,
        activeWork: 0,
        blockedTechnicians: 0,
        waitingParts: 0,
        waitingCustomer: 0,
        reworkIssues: 0,
        recentActivity: [],
      };
    }

    const ids = [...managedTechnicianIds];

    const [activeTasks, blockedTaskAssignments, workOrders, reworkTasks, recentActivity] = await Promise.all([
      this.prisma.taskAssignment.count({
        where: { tenantId, staffUserId: { in: ids }, unassignedAt: null, task: { status: "IN_PROGRESS" } },
      }),
      this.prisma.taskAssignment.findMany({
        where: {
          tenantId,
          staffUserId: { in: ids },
          unassignedAt: null,
          task: { blockers: { some: { status: { in: ["OPEN", "ESCALATED"] } } } },
        },
        select: { staffUserId: true },
        distinct: ["staffUserId"],
      }),
      this.managedWorkOrderIds(tenantId, ids),
      this.prisma.taskAssignment.count({
        where: { tenantId, staffUserId: { in: ids }, unassignedAt: null, task: { status: "RETURNED_FOR_REWORK" } },
      }),
      this.prisma.operationEvent.findMany({
        where: { tenantId, actorId: { in: ids } },
        orderBy: { createdAt: "desc" },
        take: 15,
        select: { id: true, eventKey: true, actorId: true, createdAt: true },
      }),
    ]);

    const [waitingParts, waitingCustomer, qcFailed] = await Promise.all([
      this.prisma.workOrder.count({ where: { tenantId, id: { in: workOrders }, status: "WAITING_PARTS" } }),
      this.prisma.workOrder.count({ where: { tenantId, id: { in: workOrders }, status: "WAITING_CUSTOMER" } }),
      this.prisma.workOrder.count({ where: { tenantId, id: { in: workOrders }, status: "QC_FAILED" } }),
    ]);

    return {
      managedCount: ids.length,
      activeWork: activeTasks,
      blockedTechnicians: blockedTaskAssignments.length,
      waitingParts,
      waitingCustomer,
      // Visible, never actionable -- the pass/reject decision was made
      // elsewhere and stays elsewhere (docs/detailed-specs/team-leader.md).
      reworkIssues: reworkTasks + qcFailed,
      recentActivity: recentActivity,
    };
  }

  async technicians(tenantId: string, managedTechnicianIds: readonly string[]): Promise<readonly TechnicianRow[]> {
    if (managedTechnicianIds.length === 0) return [];
    const ids = [...managedTechnicianIds];

    const staff = await this.prisma.staffUser.findMany({
      where: { tenantId, id: { in: ids } },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    });

    const rows = await Promise.all(
      staff.map(async (person) => {
        const [current, openBlockers, completedToday] = await Promise.all([
          this.prisma.taskAssignment.findFirst({
            where: { tenantId, staffUserId: person.id, unassignedAt: null, task: { status: "IN_PROGRESS" } },
            select: { task: { select: { id: true, title: true, workOrderId: true } } },
            orderBy: { assignedAt: "desc" },
          }),
          this.prisma.taskBlocker.count({
            where: {
              tenantId,
              status: { in: ["OPEN", "ESCALATED"] },
              task: { assignments: { some: { staffUserId: person.id, unassignedAt: null } } },
            },
          }),
          this.prisma.taskAssignment.count({
            where: {
              tenantId,
              staffUserId: person.id,
              task: { status: "DONE", updatedAt: { gte: this.startOfToday() } },
            },
          }),
        ]);

        return {
          staffUserId: person.id,
          fullName: person.fullName,
          currentTask: current?.task ?? null,
          openBlockers,
          tasksCompletedToday: completedToday,
        };
      }),
    );

    return rows;
  }

  async technicianDetail(
    tenantId: string,
    managedTechnicianIds: readonly string[],
    technicianId: string,
  ): Promise<TechnicianDetail> {
    this.requireManaged(managedTechnicianIds, technicianId);

    const [rows, recentTasks, notes] = await Promise.all([
      this.technicians(tenantId, [technicianId]),
      this.prisma.task.findMany({
        where: { tenantId, assignments: { some: { staffUserId: technicianId } } },
        orderBy: { updatedAt: "desc" },
        take: 20,
        select: { id: true, title: true, status: true, workOrderId: true },
      }),
      this.prisma.supervisionNote.findMany({
        where: { tenantId, technicianId },
        orderBy: { createdAt: "desc" },
        select: { id: true, body: true, escalated: true, authorId: true, createdAt: true },
      }),
    ]);

    const row = rows[0];
    if (!row) throw new NotFoundException({ code: "technician_not_found", message: "That technician is not on your team." });

    return { ...row, recentTasks, supervisionNotes: notes };
  }

  /**
   * The one place a note is deliberately hidden from the person it's
   * about. `escalate` is a lightweight flag, not a state change -- it
   * never touches the Task or WorkOrder it's about.
   */
  async addSupervisionNote(
    tenantId: string,
    managedTechnicianIds: readonly string[],
    technicianId: string,
    authorId: string,
    body: string,
    escalate: boolean,
  ): Promise<{ id: string }> {
    this.requireManaged(managedTechnicianIds, technicianId);
    if (!body.trim()) {
      throw new NotFoundException({ code: "note_empty", message: "Write something before saving." });
    }

    const note = await this.prisma.supervisionNote.create({
      data: { tenantId, technicianId, authorId, body: body.trim(), escalated: escalate },
      select: { id: true },
    });
    return note;
  }

  async workOrders(tenantId: string, managedTechnicianIds: readonly string[]): Promise<readonly ManagedWorkOrder[]> {
    if (managedTechnicianIds.length === 0) return [];
    const ids = [...managedTechnicianIds];

    const assignments = await this.prisma.taskAssignment.findMany({
      where: { tenantId, staffUserId: { in: ids }, unassignedAt: null },
      select: {
        staffUserId: true,
        task: { select: { workOrderId: true } },
      },
    });

    const byWorkOrder = new Map<string, string>();
    for (const assignment of assignments) byWorkOrder.set(assignment.task.workOrderId, assignment.staffUserId);
    if (byWorkOrder.size === 0) return [];

    const [orders, staff] = await Promise.all([
      this.prisma.workOrder.findMany({
        where: { tenantId, id: { in: [...byWorkOrder.keys()] } },
        select: {
          id: true,
          status: true,
          asset: { select: { plateNumber: true, serialNumber: true } },
          tasks: { select: { id: true, blockers: { where: { status: { in: ["OPEN", "ESCALATED"] } } } } },
        },
      }),
      this.prisma.staffUser.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, fullName: true } }),
    ]);
    const nameById = new Map(staff.map((s) => [s.id, s.fullName]));

    return orders.map((order) => ({
      workOrderId: order.id,
      identifier: order.asset.plateNumber ?? order.asset.serialNumber,
      status: order.status,
      technicianId: byWorkOrder.get(order.id) ?? "",
      technicianName: nameById.get(byWorkOrder.get(order.id) ?? "") ?? "",
      taskCount: order.tasks.length,
      openBlockers: order.tasks.reduce((sum, task) => sum + task.blockers.length, 0),
    }));
  }

  /**
   * The Team Leader's broader view of vehicle history -- any work order
   * touching one of their managed technicians, not just their own
   * assignments (P-81, docs/POLICY_DECISION_INVENTORY.md §8.B).
   */
  async vehicleHistory(tenantId: string, managedTechnicianIds: readonly string[], workOrderId: string) {
    if (managedTechnicianIds.length === 0) {
      throw new NotFoundException({ code: "work_order_not_found", message: "That job is not in your team." });
    }

    const covered = await this.prisma.task.findFirst({
      where: {
        tenantId,
        workOrderId,
        assignments: { some: { staffUserId: { in: [...managedTechnicianIds] } } },
      },
      select: { workOrderId: true },
    });
    if (!covered) {
      throw new NotFoundException({ code: "work_order_not_found", message: "That job is not in your team." });
    }

    const workOrder = await this.prisma.workOrder.findFirst({
      where: { id: workOrderId, tenantId },
      select: { assetId: true },
    });
    if (!workOrder) {
      throw new NotFoundException({ code: "work_order_not_found", message: "That job is not in your team." });
    }

    return this.assetHistory.build(tenantId, workOrder.assetId, workOrderId);
  }

  /** Team Leader's own report, never the company-wide version (Phase 12). */
  async reports(tenantId: string, managedTechnicianIds: readonly string[]): Promise<readonly TechnicianPerformanceRow[]> {
    if (managedTechnicianIds.length === 0) return [];
    const ids = [...managedTechnicianIds];

    const staff = await this.prisma.staffUser.findMany({
      where: { tenantId, id: { in: ids } },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    });

    const rows = await Promise.all(
      staff.map(async (person) => {
        const [tasksCompleted, activeTasks, blockers, reworkCount] = await Promise.all([
          this.prisma.taskAssignment.count({ where: { tenantId, staffUserId: person.id, task: { status: "DONE" } } }),
          this.prisma.taskAssignment.count({
            where: { tenantId, staffUserId: person.id, unassignedAt: null, task: { status: "IN_PROGRESS" } },
          }),
          this.prisma.taskBlocker.count({
            where: { tenantId, task: { assignments: { some: { staffUserId: person.id } } } },
          }),
          this.prisma.taskAssignment.count({
            where: { tenantId, staffUserId: person.id, task: { status: "RETURNED_FOR_REWORK" } },
          }),
        ]);

        return { staffUserId: person.id, fullName: person.fullName, tasksCompleted, activeTasks, blockers, reworkCount };
      }),
    );

    return rows;
  }

  // --- internals -----------------------------------------------------

  private async managedWorkOrderIds(tenantId: string, staffIds: readonly string[]): Promise<string[]> {
    const assignments = await this.prisma.taskAssignment.findMany({
      where: { tenantId, staffUserId: { in: [...staffIds] }, unassignedAt: null },
      select: { task: { select: { workOrderId: true } } },
    });
    return [...new Set(assignments.map((a) => a.task.workOrderId))];
  }

  /** Never trust the client's technicianId -- it must already be managed. */
  private requireManaged(managedTechnicianIds: readonly string[], technicianId: string): void {
    if (!managedTechnicianIds.includes(technicianId)) {
      throw new ForbiddenException({ code: "not_your_technician", message: "That technician is not on your team." });
    }
  }

  private startOfToday(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
}
