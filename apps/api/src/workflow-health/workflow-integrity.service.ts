import { Injectable } from "@nestjs/common";
import { DEFAULT_ROLE_PERMISSIONS } from "@mop/shared";
import { PrismaService } from "../database/prisma.service";

export type IntegrityIssueType =
  | "PART_ARRIVAL_UNCONFIRMED"
  | "CUSTOMER_RESPONSE_NOT_REFLECTED"
  | "RETURN_PENDING_REVIEW"
  | "TEAM_LEADER_MISSING_REPORT_ACCESS"
  | "WORK_ORDER_TASK_STATUS_CONFLICT"
  | "ORPHANED_STATUS_CHANGE";

export interface IntegrityIssue {
  readonly type: IntegrityIssueType;
  readonly severity: "INFO" | "WARNING" | "CRITICAL";
  readonly description: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly link: string;
  readonly ownerFixable: boolean;
  readonly detectedAt: string;
}

export interface MissingCapabilityNote {
  readonly issueType: string;
  readonly reason: string;
}

export interface IntegrityReport {
  readonly issues: readonly IntegrityIssue[];
  /**
   * Checks the spec names that this service deliberately does NOT run,
   * and why -- per the brief: "if a metric cannot currently be computed
   * correctly, identify the missing underlying capability/data instead
   * of producing a fake approximation."
   */
  readonly notComputable: readonly MissingCapabilityNote[];
}

const PART_ARRIVAL_THRESHOLD_HOURS = 24;
const RETURN_REVIEW_THRESHOLD_HOURS = 48;

/**
 * Workflow Health -- consistency checks (docs/detailed-specs/tenant-owner.md,
 * "Workflow Health / Operations Integrity"). Each row in that spec's own
 * table is one method here, computed against the real schema -- not
 * illustrative. Two of the spec's seven checks are not run, and say so:
 *
 * - The Customer-Portal-policy-vs-module contradiction needs
 *   `TenantConfiguration.workflowPolicy` to hold real, structured data.
 *   It is currently written as `{}` at tenant creation
 *   (platform.service.ts) and read by nothing anywhere in the product --
 *   there is no actual "portal enabled in workflow policy" flag to
 *   compare against the module flag. Faking a comparison against an
 *   always-empty object would silently report "no contradiction" forever,
 *   which is worse than not running the check.
 */
@Injectable()
export class WorkflowIntegrityService {
  constructor(private readonly prisma: PrismaService) {}

  async build(tenantId: string): Promise<IntegrityReport> {
    const [partArrival, customerResponse, returnPending, teamLeaderAccess, statusConflict, orphaned] =
      await Promise.all([
        this.partArrivalUnconfirmed(tenantId),
        this.customerResponseNotReflected(tenantId),
        this.returnPendingReview(tenantId),
        this.teamLeaderMissingReportAccess(tenantId),
        this.workOrderTaskStatusConflict(tenantId),
        this.orphanedStatusChange(tenantId),
      ]);

    return {
      issues: [...partArrival, ...customerResponse, ...returnPending, ...teamLeaderAccess, ...statusConflict, ...orphaned],
      notComputable: [
        {
          issueType: "CUSTOMER_PORTAL_POLICY_MODULE_CONTRADICTION",
          reason:
            "TenantConfiguration.workflowPolicy carries no real schema yet -- it is written empty at tenant creation and read by nothing. There is no stored 'portal enabled in workflow policy' flag to compare against the module flag.",
        },
      ],
    };
  }

  /** IssuedItem.arrivedAt still null, beyond the configured threshold since issuedAt. */
  private async partArrivalUnconfirmed(tenantId: string): Promise<IntegrityIssue[]> {
    const cutoff = new Date(Date.now() - PART_ARRIVAL_THRESHOLD_HOURS * 60 * 60 * 1000);
    const rows = await this.prisma.issuedItem.findMany({
      where: { tenantId, arrivedAt: null, issuedAt: { lt: cutoff } },
      select: { id: true, issuedAt: true, partRequest: { select: { workOrderId: true } } },
      take: 200,
    });

    return rows.map((row) => ({
      type: "PART_ARRIVAL_UNCONFIRMED" as const,
      severity: "WARNING" as const,
      description: `A part issued on ${row.issuedAt.toISOString().slice(0, 10)} has not been confirmed as arrived.`,
      entityType: "IssuedItem",
      entityId: row.id,
      link: `/branch/work-orders/${row.partRequest.workOrderId}`,
      ownerFixable: false,
      detectedAt: new Date().toISOString(),
    }));
  }

  /** Every item on a decision request has been decided, but the work order is still waiting. */
  private async customerResponseNotReflected(tenantId: string): Promise<IntegrityIssue[]> {
    const pending = await this.prisma.customerDecisionRequest.findMany({
      where: {
        tenantId,
        status: { in: ["PENDING", "SENT", "VIEWED", "PARTIALLY_RESPONDED"] },
        workOrder: { status: "AWAITING_CUSTOMER_APPROVAL" },
      },
      select: { id: true, workOrderId: true, items: { select: { decision: true } } },
    });

    return pending
      .filter((request) => request.items.length > 0 && request.items.every((item) => item.decision !== "PENDING"))
      .map((request) => ({
        type: "CUSTOMER_RESPONSE_NOT_REFLECTED" as const,
        severity: "WARNING" as const,
        description: "The customer has answered every item on this decision request, but the work order is still waiting on them.",
        entityType: "CustomerDecisionRequest",
        entityId: request.id,
        link: `/branch/work-orders/${request.workOrderId}`,
        ownerFixable: false,
        detectedAt: new Date().toISOString(),
      }));
  }

  /** PartReturnRequest open beyond the threshold with no Inventory Manager action. */
  private async returnPendingReview(tenantId: string): Promise<IntegrityIssue[]> {
    const cutoff = new Date(Date.now() - RETURN_REVIEW_THRESHOLD_HOURS * 60 * 60 * 1000);
    const rows = await this.prisma.partReturnRequest.findMany({
      where: { tenantId, resolvedAt: null, createdAt: { lt: cutoff } },
      select: { id: true, createdAt: true, partRequest: { select: { workOrderId: true } } },
      take: 200,
    });

    return rows.map((row) => ({
      type: "RETURN_PENDING_REVIEW" as const,
      severity: "WARNING" as const,
      description: `A part return requested on ${row.createdAt.toISOString().slice(0, 10)} has not been reviewed.`,
      entityType: "PartReturnRequest",
      entityId: row.id,
      link: `/inventory/returns`,
      ownerFixable: false,
      detectedAt: new Date().toISOString(),
    }));
  }

  /**
   * A Team Leader role that actually leads at least one active team, but
   * whose role template does not grant `reports.team.view` -- checks the
   * tenant's RolePermission override, falling back to the platform
   * default the same way RolePermissionTemplateLayer does. Deliberately
   * does not also check platform locks or per-user overrides: this is a
   * role-level configuration gap, not a specific person's access.
   */
  private async teamLeaderMissingReportAccess(tenantId: string): Promise<IntegrityIssue[]> {
    const leadersWithActiveTeams = await this.prisma.staffUser.findMany({
      where: { tenantId, role: "TEAM_LEADER", ledTeams: { some: { isActive: true } } },
      select: { id: true, fullName: true },
    });
    if (leadersWithActiveTeams.length === 0) return [];

    const override = await this.prisma.rolePermission.findUnique({
      where: { tenantId_role_permissionKey: { tenantId, role: "TEAM_LEADER", permissionKey: "reports.team.view" } },
      select: { allowed: true },
    });
    const effectiveAllowed = override?.allowed ?? DEFAULT_ROLE_PERMISSIONS.TEAM_LEADER?.["reports.team.view"] ?? false;
    if (effectiveAllowed) return [];

    return leadersWithActiveTeams.map((leader) => ({
      type: "TEAM_LEADER_MISSING_REPORT_ACCESS" as const,
      severity: "INFO" as const,
      description: `${leader.fullName} manages an active team but the Team Leader role cannot view Technician Performance Reports -- their reports page will render empty with no explanation.`,
      entityType: "StaffUser",
      entityId: leader.id,
      link: "/owner/organization",
      ownerFixable: true,
      detectedAt: new Date().toISOString(),
    }));
  }

  /** e.g. WorkOrder shows IN_PROGRESS while every Task under it is DONE -- should have advanced and didn't. */
  private async workOrderTaskStatusConflict(tenantId: string): Promise<IntegrityIssue[]> {
    const candidates = await this.prisma.workOrder.findMany({
      where: { tenantId, status: { in: ["IN_PROGRESS", "READY_FOR_TEAM_REVIEW"] } },
      select: { id: true, status: true, tasks: { select: { status: true } } },
    });

    return candidates
      .filter((wo) => wo.tasks.length > 0 && wo.tasks.every((task) => task.status === "DONE"))
      .map((wo) => ({
        type: "WORK_ORDER_TASK_STATUS_CONFLICT" as const,
        severity: "WARNING" as const,
        description: `This work order is still "${wo.status}" but every task under it is done -- it should have advanced.`,
        entityType: "WorkOrder",
        entityId: wo.id,
        link: `/branch/work-orders/${wo.id}`,
        ownerFixable: false,
        detectedAt: new Date().toISOString(),
      }));
  }

  /**
   * A work order past DRAFT with zero `work_order.status_changed` events
   * -- WorkOrderLifecycleService is the only thing that may change
   * status, and it always emits one in the same transaction. A work
   * order in this state moved through a path that bypassed it entirely.
   */
  private async orphanedStatusChange(tenantId: string): Promise<IntegrityIssue[]> {
    const movedWorkOrders = await this.prisma.workOrder.findMany({
      where: { tenantId, status: { not: "DRAFT" } },
      select: { id: true, status: true },
    });
    if (movedWorkOrders.length === 0) return [];

    const events = await this.prisma.operationEvent.findMany({
      where: { tenantId, eventKey: "work_order.status_changed" },
      select: { payload: true },
    });
    const withHistory = new Set(
      events.map((e) => (e.payload as { workOrderId?: string }).workOrderId).filter((id): id is string => Boolean(id)),
    );

    return movedWorkOrders
      .filter((wo) => !withHistory.has(wo.id))
      .map((wo) => ({
        type: "ORPHANED_STATUS_CHANGE" as const,
        severity: "CRITICAL" as const,
        description: `This work order is "${wo.status}" but has no recorded status-change history -- it was moved by something other than the lifecycle service.`,
        entityType: "WorkOrder",
        entityId: wo.id,
        link: `/branch/work-orders/${wo.id}`,
        ownerFixable: false,
        detectedAt: new Date().toISOString(),
      }));
  }
}
