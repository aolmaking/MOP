import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditActorType, TaskStatus, WorkOrderStatus } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { OperationEventsService } from "../../operations/operation-events.service";
import type { RequestSessionContext } from "../../tenancy/session-context";

@Injectable()
export class TeamLeaderService {
  constructor(private readonly prisma: PrismaService, private readonly operations: OperationEventsService) {}

  async reviewQueue(session: RequestSessionContext) {
    if (!session.managedTechnicianIds.length) {
      return { counts: { awaiting: 0, rework: 0, readyQc: 0 }, rows: [] };
    }
    const tasks = await this.prisma.task.findMany({
      where: {
        tenantId: session.tenantId,
        assignments: { some: { staffUserId: { in: session.managedTechnicianIds } } },
        OR: [
          { status: TaskStatus.READY_FOR_QC },
          { workOrder: { statusLabel: { contains: "Rework", mode: "insensitive" } } }
        ]
      },
      include: {
        workOrder: { include: { customer: true, asset: true, branch: true } },
        assignments: { include: { staffUser: true } },
        subtasks: true,
        blockers: true,
        partRequests: true,
        decisionRequests: { include: { items: true } }
      },
      orderBy: { updatedAt: "asc" }
    });
    const rows = tasks.map((task) => ({
      taskId: task.id,
      workOrderId: task.workOrderId,
      workOrderNumber: task.workOrder.number,
      title: task.title,
      status: task.workOrder.statusLabel,
      customerName: task.workOrder.customer.fullName,
      assetName: task.workOrder.asset.name,
      assetIdentifier: task.workOrder.asset.primaryIdentifier,
      branchName: task.workOrder.branch?.name || "Branch",
      technicians: task.assignments.map((assignment) => assignment.staffUser.name),
      checklist: {
        subtasksComplete: task.subtasks.every((subtask) => subtask.done),
        noOpenBlockers: task.blockers.every((blocker) => blocker.resolved),
        partsResolved: task.partRequests.every((request) => ["USED", "RETURNED_TO_STOCK", "RETURN_ACCEPTED", "CANCELLED"].includes(request.status)),
        decisionsResolved: task.decisionRequests.every((request) => request.status === "RESPONDED")
      },
      updatedAt: task.updatedAt.toISOString()
    }));
    return {
      counts: {
        awaiting: rows.filter((row) => row.status.toLowerCase().includes("awaiting team")).length,
        rework: rows.filter((row) => row.status.toLowerCase().includes("rework")).length,
        readyQc: rows.filter((row) => row.status.toLowerCase() === "ready for qc").length
      },
      rows
    };
  }

  async reviewAction(session: RequestSessionContext, taskId: string, body: any) {
    const action = String(body?.action || "");
    const reason = String(body?.reason || "").trim();
    const task = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        tenantId: session.tenantId,
        assignments: { some: { staffUserId: { in: session.managedTechnicianIds } } }
      },
      include: { workOrder: true, assignments: true }
    });
    if (!task) throw new NotFoundException("Task is outside the managed technician scope.");
    if (task.status !== TaskStatus.READY_FOR_QC && !task.workOrder.statusLabel.toLowerCase().includes("rework")) {
      throw new BadRequestException("Task is not awaiting Team Leader review.");
    }

    if (action === "approve_qc") {
      await this.prisma.workOrder.update({
        where: { id: task.workOrderId },
        data: { status: WorkOrderStatus.READY_FOR_QC, statusLabel: "Ready for QC" }
      });
      await this.audit(session, task.id, "team_review.approved", reason || "Team Leader approved task for QC.");
      await this.emit(session, task, "task.sent_to_qc", "READY_FOR_QC", reason || "Team Leader approved task for QC.");
      return { status: "ready_for_qc", taskId };
    }
    if (action === "return_rework") {
      if (reason.length < 5) throw new BadRequestException("Rework requires a clear reason.");
      await this.prisma.$transaction([
        this.prisma.task.update({ where: { id: task.id }, data: { status: TaskStatus.IN_PROGRESS } }),
        this.prisma.workOrder.update({
          where: { id: task.workOrderId },
          data: { status: WorkOrderStatus.IN_PROGRESS, statusLabel: "Returned for Rework", internalNotes: reason }
        })
      ]);
      await this.audit(session, task.id, "team_review.returned_for_rework", reason);
      await this.emit(session, task, "task.returned_for_rework", "IN_PROGRESS", reason);
      return { status: "returned_for_rework", taskId };
    }
    throw new BadRequestException("Unsupported Team Leader review action.");
  }

  private audit(session: RequestSessionContext, taskId: string, action: string, reason: string) {
    return this.prisma.auditLog.create({
      data: {
        tenantId: session.tenantId,
        actorType: AuditActorType.TENANT_STAFF,
        actorId: session.userId,
        actorName: session.displayName,
        action,
        targetType: "task",
        targetId: taskId,
        reason
      }
    });
  }

  private emit(session: RequestSessionContext, task: any, eventKey: string, toStatus: string, reason: string) {
    return this.operations.emitFromSession(session, {
      eventKey,
      tenantId: task.tenantId,
      branchId: task.branchId || undefined,
      workOrderId: task.workOrderId,
      taskId: task.id,
      statusChanges: [{ entityType: "task", entityId: task.id, fromStatus: task.status, toStatus, label: reason }],
      notificationTargets: ["technician", "branch_manager", "team_leader", "qc_queue", "reports_engine"],
      pageUpdates: ["work-card", "branch-workspace", "team-review", "reports"],
      reportHooks: [{ reportKey: "reports.team.technician_performance.view", metric: eventKey, delta: 1, scope: ["team", "branch"] }],
      auditAction: eventKey,
      canUndo: false,
      payload: { managed_technician_ids: session.managedTechnicianIds },
      reason,
      targetType: "task",
      targetId: task.id
    });
  }
}
