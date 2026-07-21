import { BadRequestException, Injectable } from "@nestjs/common";
import type {
  WorkflowHealthIssueDto,
  WorkflowHealthResultDto,
  WorkflowHealthSeverity
} from "@mop/shared";
import { PrismaService } from "../database/prisma.service";
import type { RequestSessionContext } from "../tenancy/session-context";

@Injectable()
export class WorkflowHealthService {
  constructor(private readonly prisma: PrismaService) {}

  async inspect(session: RequestSessionContext): Promise<WorkflowHealthResultDto> {
    if (!session.tenantId) throw new BadRequestException("Tenant scope is required for workflow health.");
    const tenantId = session.tenantId;
    const staleBefore = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [issuedItems, returns, decisions, tasks, workOrders, branches, warehouseLinks, audits] = await Promise.all([
      this.prisma.issuedItem.findMany({
        where: { tenantId },
        select: { id: true, status: true, taskId: true, workOrderId: true, updatedAt: true },
        take: 300
      }),
      this.prisma.partReturnRequest.findMany({
        where: { tenantId },
        select: { id: true, status: true, taskId: true, workOrderId: true, updatedAt: true },
        take: 300
      }),
      this.prisma.customerDecisionRequest.findMany({
        where: { tenantId },
        select: { id: true, status: true, taskId: true, workOrderId: true, respondedAt: true, updatedAt: true },
        take: 300
      }),
      this.prisma.task.findMany({
        where: { tenantId },
        select: { id: true, status: true, workOrderId: true, updatedAt: true },
        take: 500
      }),
      this.prisma.workOrder.findMany({
        where: { tenantId },
        select: {
          id: true,
          status: true,
          branchId: true,
          updatedAt: true,
          partRequests: { select: { id: true, status: true } }
        },
        take: 500
      }),
      this.prisma.branch.findMany({ where: { tenantId }, select: { id: true, name: true } }),
      this.prisma.branchWarehouseAccess.findMany({
        where: { tenantId, active: true },
        select: { branchId: true, warehouseId: true }
      }),
      this.prisma.auditLog.findMany({
        where: { tenantId, createdAt: { gte: recentSince }, action: { startsWith: "operation.event." } },
        select: { targetId: true, action: true, createdAt: true },
        take: 1000
      })
    ]);

    const issues: WorkflowHealthIssueDto[] = [];
    const taskById = new Map(tasks.map((task) => [task.id, task]));
    const workOrderById = new Map(workOrders.map((workOrder) => [workOrder.id, workOrder]));
    const auditedTargets = new Set(audits.map((audit) => audit.targetId).filter(Boolean));

    for (const item of issuedItems) {
      if (["ISSUED", "IN_TRANSIT", "ARRIVED"].includes(String(item.status)) && item.updatedAt < staleBefore) {
        issues.push(this.issue(
          "PART_ISSUED_NOT_CONFIRMED",
          "high",
          "Issued part is waiting for technician confirmation",
          `Issued item ${item.id} has not reached the received, used, or return flow.`,
          "Part lifecycle",
          "issued_item",
          item.id,
          "Contact the assigned technician and confirm Arrived or start the unused return flow."
        ));
      }
    }

    for (const item of returns) {
      if (String(item.status) === "PENDING_INVENTORY_REVIEW" && item.updatedAt < staleBefore) {
        issues.push(this.issue(
          "RETURN_NOT_REVIEWED",
          "high",
          "Unused part return is waiting for inventory review",
          `Return ${item.id} has remained pending for more than 24 hours.`,
          "Return lifecycle",
          "return_request",
          item.id,
          "Inventory Manager should accept, reject, or request clarification."
        ));
      }
    }

    for (const decision of decisions) {
      const task = decision.taskId ? taskById.get(decision.taskId) : undefined;
      if (decision.respondedAt && task && String(task.status) === "AWAITING_CUSTOMER_APPROVAL") {
        issues.push(this.issue(
          "DECISION_RESPONDED_TASK_STILL_WAITING",
          "critical",
          "Customer responded but the task is still waiting",
          `Decision ${decision.id} has a response while task ${task.id} is still Awaiting Customer Approval.`,
          "Customer decision",
          "task",
          task.id,
          "Replay the customer_decision.responded event through WorkflowStatusResolver."
        ));
      }
    }

    for (const workOrder of workOrders) {
      const relatedTasks = tasks.filter((task) => task.workOrderId === workOrder.id);
      if (String(workOrder.status) === "READY_FOR_QC" && relatedTasks.some((task) => !["READY_FOR_QC", "COMPLETED"].includes(String(task.status)))) {
        issues.push(this.issue(
          "WORK_ORDER_TASK_STATUS_CONFLICT",
          "critical",
          "Work Order and task statuses conflict",
          `Work Order ${workOrder.id} is Ready for QC while at least one task is not ready.`,
          "Work Order lifecycle",
          "work_order",
          workOrder.id,
          "Resolve unfinished tasks before allowing the Work Order to remain Ready for QC."
        ));
      }

      const unresolvedPart = workOrder.partRequests.some((request) =>
        !["USED", "RETURNED_TO_STOCK", "REJECTED", "CANCELLED"].includes(String(request.status))
      );
      if (String(workOrder.status) === "WAITING_FOR_PARTS" && !unresolvedPart) {
        issues.push(this.issue(
          "WAITING_PARTS_WITHOUT_PENDING_PART",
          "medium",
          "Work Order is waiting for parts with no unresolved request",
          `Work Order ${workOrder.id} has no open part lifecycle that explains its status.`,
          "Work Order lifecycle",
          "work_order",
          workOrder.id,
          "Run WorkflowStatusResolver and move the Work Order to the next valid state."
        ));
      }

      if (workOrder.updatedAt >= recentSince && !auditedTargets.has(workOrder.id)) {
        issues.push(this.issue(
          "ACTIVE_WORKFLOW_MISSING_OPERATION_AUDIT",
          "medium",
          "Recent workflow has no operation event",
          `Work Order ${workOrder.id} changed recently but no matching operation event targets it.`,
          "Operations event stream",
          "work_order",
          workOrder.id,
          "Ensure the mutation emits an OperationEvent after the transaction commits."
        ));
      }
    }

    const linkedBranches = new Set(warehouseLinks.map((link) => link.branchId));
    for (const branch of branches) {
      if (!linkedBranches.has(branch.id)) {
        issues.push(this.issue(
          "BRANCH_WITHOUT_WAREHOUSE",
          "high",
          "Branch has no active warehouse link",
          `${branch.name} cannot safely fulfill technician part requests.`,
          "Inventory routing",
          "branch",
          branch.id,
          "Link a primary, shared, or backup warehouse before enabling inventory requests."
        ));
      }
    }

    return this.result(issues);
  }

  private issue(
    code: string,
    severity: WorkflowHealthSeverity,
    title: string,
    detail: string,
    affectedWorkflow: string,
    affectedEntityType: string,
    affectedEntityId: string,
    suggestedFix: string
  ): WorkflowHealthIssueDto {
    return {
      id: `health_${code.toLowerCase()}_${affectedEntityId}`,
      code,
      severity,
      title,
      detail,
      affectedWorkflow,
      affectedEntityType,
      affectedEntityId,
      suggestedFix,
      ownerLocked: false,
      platformLocked: false,
      detectedAt: new Date().toISOString()
    };
  }

  private result(issues: WorkflowHealthIssueDto[]): WorkflowHealthResultDto {
    const summary = {
      critical: issues.filter((issue) => issue.severity === "critical").length,
      high: issues.filter((issue) => issue.severity === "high").length,
      medium: issues.filter((issue) => issue.severity === "medium").length,
      low: issues.filter((issue) => issue.severity === "low").length
    };
    const penalty = summary.critical * 25 + summary.high * 12 + summary.medium * 5 + summary.low * 2;
    return {
      checkedAt: new Date().toISOString(),
      status: summary.critical ? "critical" : summary.high || summary.medium ? "attention" : "healthy",
      score: Math.max(0, 100 - penalty),
      summary,
      issues
    };
  }
}
