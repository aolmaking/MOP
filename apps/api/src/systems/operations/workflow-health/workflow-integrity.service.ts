import { BadRequestException, Injectable } from "@nestjs/common";
import { DEFAULT_ROLE_PERMISSIONS } from "@mop/shared";
import { PrismaService } from "../../../runtime/database/prisma.service";

export type IntegrityIssueType =
  | "PART_ARRIVAL_UNCONFIRMED"
  | "CUSTOMER_RESPONSE_NOT_REFLECTED"
  | "RETURN_PENDING_REVIEW"
  | "TEAM_LEADER_MISSING_REPORT_ACCESS"
  | "WORK_ORDER_TASK_STATUS_CONFLICT"
  | "ORPHANED_STATUS_CHANGE";

export type IntegrityIssueSeverity = "INFO" | "WARNING" | "CRITICAL";

/** What a person has decided about an issue. Absent means nobody has looked yet. */
export type IntegrityIssueStatus = "OPEN" | "ACKNOWLEDGED" | "INVESTIGATING" | "ESCALATED";

/**
 * What a detector produces: the fact, with no human decision attached.
 * `build()` joins the acknowledgement to turn this into an IntegrityIssue.
 */
export interface DetectedIssue {
  readonly id: string;
  readonly type: IntegrityIssueType;
  readonly severity: IntegrityIssueSeverity;
  readonly description: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly link: string;
  readonly ownerFixable: boolean;
  readonly detectedAt: string;
}

export interface IntegrityIssue extends DetectedIssue {
  /** OPEN until somebody acknowledges it. */
  readonly status: IntegrityIssueStatus;
  readonly note: string | null;
  readonly handledBy: string | null;
  readonly handledAt: string | null;
}

/**
 * One row per issue TYPE rather than per occurrence.
 *
 * Seven identical CRITICAL rows tell an Owner far less than "seven work
 * orders share one integrity fault", because the second phrasing names
 * the thing to fix. The list stays available underneath; this is what the
 * page leads with.
 */
export interface IntegrityGroup {
  readonly type: IntegrityIssueType;
  readonly severity: IntegrityIssueSeverity;
  readonly total: number;
  readonly open: number;
  readonly handled: number;
  readonly ownerFixable: boolean;
  /** Plain-language cause and consequence, so the group explains itself. */
  readonly whatItMeans: string;
  readonly recommendedAction: string;
  readonly fixableBy: string;
}

export interface IntegrityFilters {
  readonly severity?: IntegrityIssueSeverity;
  readonly type?: string;
  readonly status?: "open" | "handled";
}

export interface MissingCapabilityNote {
  readonly issueType: string;
  readonly reason: string;
}

export interface IntegrityReport {
  readonly issues: readonly IntegrityIssue[];
  readonly groups: readonly IntegrityGroup[];
  /** Counts BEFORE filtering, so the filter chips can show what they would reveal. */
  readonly totals: { all: number; critical: number; warning: number; info: number; open: number; handled: number };
  /** When this scan ran. An integrity page that cannot say how fresh it is invites acting on stale facts. */
  readonly scannedAt: string;
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

  async build(tenantId: string, filters: IntegrityFilters = {}): Promise<IntegrityReport> {
    const [partArrival, customerResponse, returnPending, teamLeaderAccess, statusConflict, orphaned] =
      await Promise.all([
        this.partArrivalUnconfirmed(tenantId),
        this.customerResponseNotReflected(tenantId),
        this.returnPendingReview(tenantId),
        this.teamLeaderMissingReportAccess(tenantId),
        this.workOrderTaskStatusConflict(tenantId),
        this.orphanedStatusChange(tenantId),
      ]);

    const detected = [
      ...partArrival,
      ...customerResponse,
      ...returnPending,
      ...teamLeaderAccess,
      ...statusConflict,
      ...orphaned,
    ];

    // What a person decided is the only part that cannot be recomputed, so
    // it is the only part that was stored. Joining it here means an issue
    // that stops being detected simply stops appearing -- resolved by the
    // records themselves rather than by anyone remembering to close it.
    const acks = await this.prisma.workflowIssueAcknowledgement.findMany({
      where: { tenantId, fingerprint: { in: detected.map((i) => i.id) } },
      select: { fingerprint: true, status: true, note: true, actorName: true, updatedAt: true },
    });
    const ackByFingerprint = new Map(acks.map((a) => [a.fingerprint, a]));

    const withStatus: IntegrityIssue[] = detected.map((issue) => {
      const ack = ackByFingerprint.get(issue.id);
      return {
        ...issue,
        status: (ack?.status ?? "OPEN") as IntegrityIssueStatus,
        note: ack?.note ?? null,
        handledBy: ack?.actorName ?? null,
        handledAt: ack?.updatedAt.toISOString() ?? null,
      };
    });

    // Totals describe everything detected, not the filtered view, so the
    // filter controls can show what they would reveal rather than
    // collapsing to whatever is currently on screen.
    const totals = {
      all: withStatus.length,
      critical: withStatus.filter((i) => i.severity === "CRITICAL").length,
      warning: withStatus.filter((i) => i.severity === "WARNING").length,
      info: withStatus.filter((i) => i.severity === "INFO").length,
      open: withStatus.filter((i) => i.status === "OPEN").length,
      handled: withStatus.filter((i) => i.status !== "OPEN").length,
    };

    const groups = this.group(withStatus);

    const visible = withStatus.filter((issue) => {
      if (filters.severity && issue.severity !== filters.severity) return false;
      if (filters.type && issue.type !== filters.type) return false;
      if (filters.status === "open" && issue.status !== "OPEN") return false;
      if (filters.status === "handled" && issue.status === "OPEN") return false;
      return true;
    });

    // Most severe first, then oldest -- the order they should be worked.
    const rank: Record<IntegrityIssueSeverity, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };
    const sorted = [...visible].sort(
      (a, b) => rank[a.severity] - rank[b.severity] || a.detectedAt.localeCompare(b.detectedAt),
    );

    return {
      issues: sorted,
      groups,
      totals,
      scannedAt: new Date().toISOString(),
      notComputable: [
        {
          issueType: "CUSTOMER_PORTAL_POLICY_MODULE_CONTRADICTION",
          reason:
            "TenantConfiguration.workflowPolicy carries no real schema yet -- it is written empty at tenant creation and read by nothing. There is no stored 'portal enabled in workflow policy' flag to compare against the module flag.",
        },
      ],
    };
  }


  /**
   * Records what a person decided about one detected issue.
   *
   * Upserted on the fingerprint, so acknowledging the same problem twice
   * updates the decision rather than accumulating rows, and so a decision
   * survives every later rescan. There is deliberately no "resolve": an
   * issue is resolved by the underlying records no longer producing it,
   * which is the only definition that cannot go stale.
   */
  async acknowledge(
    tenantId: string,
    fingerprint: string,
    input: { status: "ACKNOWLEDGED" | "INVESTIGATING" | "ESCALATED"; note: string },
    actor: { accountId: string; displayName: string },
  ): Promise<{ fingerprint: string; status: string }> {
    const note = input.note?.trim() ?? "";
    if (note.length < 3) {
      throw new BadRequestException({
        code: "note_required",
        message: "Say what you found or what you are doing about it.",
      });
    }

    // The fingerprint encodes what the issue is about, so it can be split
    // back into its parts rather than trusting a client to resend them.
    const [issueType, entityType, ...rest] = fingerprint.split(":");
    const entityId = rest.join(":");
    if (!issueType || !entityType || !entityId) {
      throw new BadRequestException({ code: "unknown_issue", message: "That is not a recognisable issue." });
    }

    return this.prisma.workflowIssueAcknowledgement.upsert({
      where: { tenantId_fingerprint: { tenantId, fingerprint } },
      create: {
        tenantId,
        fingerprint,
        issueType,
        entityType,
        entityId,
        status: input.status,
        note,
        actorId: actor.accountId,
        actorName: actor.displayName,
      },
      update: { status: input.status, note, actorId: actor.accountId, actorName: actor.displayName },
      select: { fingerprint: true, status: true },
    });
  }

  /**
   * Plain-language meaning for each fault class.
   *
   * The detector's own description says what is wrong with one record.
   * This says why it matters and who can act, which is the part an Owner
   * needs and cannot infer from a row that reads like a diagnostic.
   */
  private guidance(type: IntegrityIssueType): { whatItMeans: string; recommendedAction: string; fixableBy: string } {
    switch (type) {
      case "ORPHANED_STATUS_CHANGE":
        return {
          whatItMeans:
            "The job holds a status with no matching lifecycle record, so it did not reach that status through any path the product offers. Stage timings and SLA figures that read this history may be wrong for these jobs.",
          recommendedAction:
            "A platform administrator should compare the work order against its event history and reconcile the two before trusting its timings.",
          fixableBy: "Platform Super Admin",
        };
      case "WORK_ORDER_TASK_STATUS_CONFLICT":
        return {
          whatItMeans:
            "Every task on the job is finished but the job itself has not moved, so it is sitting still while looking active.",
          recommendedAction: "Open the job and advance it, or reopen the task that still has work in it.",
          fixableBy: "Branch Manager",
        };
      case "CUSTOMER_RESPONSE_NOT_REFLECTED":
        return {
          whatItMeans:
            "The customer has answered every item, but the job is still waiting on them -- so nobody is chasing work the customer already approved.",
          recommendedAction: "Open the job and move it on now that the decision is in.",
          fixableBy: "Branch Manager",
        };
      case "PART_ARRIVAL_UNCONFIRMED":
        return {
          whatItMeans:
            "A part was issued but never confirmed as arrived, so stock says it left the shelf while the job cannot prove it was received.",
          recommendedAction: "Confirm arrival against the job, or raise it with the warehouse if it never came.",
          fixableBy: "Inventory Manager",
        };
      case "RETURN_PENDING_REVIEW":
        return {
          whatItMeans:
            "A returned part has been waiting for a decision long enough that its value is effectively frozen.",
          recommendedAction: "Review the return and either restock it or write it off.",
          fixableBy: "Inventory Manager",
        };
      case "TEAM_LEADER_MISSING_REPORT_ACCESS":
        return {
          whatItMeans:
            "A Team Leader supervises technicians but cannot see the report covering them, so they are accountable for work they cannot review.",
          recommendedAction: "Grant the reporting permission under Organization & Access.",
          fixableBy: "Owner",
        };
    }
  }

  private group(issues: readonly IntegrityIssue[]): IntegrityGroup[] {
    const byType = new Map<IntegrityIssueType, IntegrityIssue[]>();
    for (const issue of issues) {
      const list = byType.get(issue.type) ?? [];
      list.push(issue);
      byType.set(issue.type, list);
    }

    const rank: Record<IntegrityIssueSeverity, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };

    return [...byType.entries()]
      .map(([type, list]) => ({
        type,
        severity: list[0].severity,
        total: list.length,
        open: list.filter((i) => i.status === "OPEN").length,
        handled: list.filter((i) => i.status !== "OPEN").length,
        ownerFixable: list[0].ownerFixable,
        ...this.guidance(type),
      }))
      .sort((a, b) => rank[a.severity] - rank[b.severity] || b.total - a.total);
  }

  /** IssuedItem.arrivedAt still null, beyond the configured threshold since issuedAt. */
  private async partArrivalUnconfirmed(tenantId: string): Promise<DetectedIssue[]> {
    const cutoff = new Date(Date.now() - PART_ARRIVAL_THRESHOLD_HOURS * 60 * 60 * 1000);
    const rows = await this.prisma.issuedItem.findMany({
      where: { tenantId, arrivedAt: null, issuedAt: { lt: cutoff } },
      select: { id: true, issuedAt: true, partRequest: { select: { workOrderId: true } } },
      take: 200,
    });

    return rows.map((row) => ({
      id: `PART_ARRIVAL_UNCONFIRMED:IssuedItem:${row.id}`,
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
  private async customerResponseNotReflected(tenantId: string): Promise<DetectedIssue[]> {
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
        id: `CUSTOMER_RESPONSE_NOT_REFLECTED:CustomerDecisionRequest:${request.id}`,
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
  private async returnPendingReview(tenantId: string): Promise<DetectedIssue[]> {
    const cutoff = new Date(Date.now() - RETURN_REVIEW_THRESHOLD_HOURS * 60 * 60 * 1000);
    const rows = await this.prisma.partReturnRequest.findMany({
      where: { tenantId, resolvedAt: null, createdAt: { lt: cutoff } },
      select: { id: true, createdAt: true, partRequest: { select: { workOrderId: true } } },
      take: 200,
    });

    return rows.map((row) => ({
      id: `RETURN_PENDING_REVIEW:PartReturnRequest:${row.id}`,
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
  private async teamLeaderMissingReportAccess(tenantId: string): Promise<DetectedIssue[]> {
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
      id: `TEAM_LEADER_MISSING_REPORT_ACCESS:StaffUser:${leader.id}`,
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
  private async workOrderTaskStatusConflict(tenantId: string): Promise<DetectedIssue[]> {
    const candidates = await this.prisma.workOrder.findMany({
      where: { tenantId, status: { in: ["IN_PROGRESS", "READY_FOR_TEAM_REVIEW"] } },
      select: { id: true, status: true, tasks: { select: { status: true } } },
    });

    return candidates
      .filter((wo) => wo.tasks.length > 0 && wo.tasks.every((task) => task.status === "DONE"))
      .map((wo) => ({
        id: `WORK_ORDER_TASK_STATUS_CONFLICT:WorkOrder:${wo.id}`,
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
  private async orphanedStatusChange(tenantId: string): Promise<DetectedIssue[]> {
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
        id: `ORPHANED_STATUS_CHANGE:WorkOrder:${wo.id}`,
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
