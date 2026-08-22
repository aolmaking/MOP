import { Injectable, NotFoundException } from "@nestjs/common";
import {
  CAPABILITY_KEYS,
  isCapabilityActive,
  type CapabilityKey,
  type CapabilityProfile,
  type CapabilityStatus,
} from "@mop/shared";
import { PrismaService } from "../../../runtime/database/prisma.service";
import { WorkshopsService } from "../workshops/workshops.service";
import { WorkshopHealthService, type HealthStatus, type HealthWarning } from "../workshops/workshop-health.service";
import type { ListWorkshopsQueryDto } from "../workshops/list-workshops.dto";

export interface PlatformTotals {
  readonly totalWorkshops: number;
  readonly activeWorkshops: number;
  readonly totalStaffUsers: number;
  readonly totalCustomers: number;
  /** Not backed by real billing yet -- same disclosed gap as the Workshops table's own Subscription column. */
  readonly aggregateMrr: null;
}

export interface WorkshopReportCard {
  readonly id: string;
  readonly name: string;
  readonly health: HealthStatus;
  readonly planName: string;
  readonly status: string;
  readonly lastActivityAt: string | null;
  readonly staffUserCount: number;
  readonly customerCount: number;
  readonly activeUserCount: number;
  readonly usageScore: number;
  readonly featureAdoptionPercent: number | null;
  readonly builderAdoptionPercent: number;
}

export interface PlatformReportsOverview {
  readonly totals: PlatformTotals;
  readonly workshops: { readonly items: readonly WorkshopReportCard[]; readonly total: number; readonly page: number; readonly pageSize: number };
}

export interface UsageOverview {
  readonly activeUsers: { readonly staff: number; readonly customer: number };
  /** Sessions started per day within the window -- a login-frequency proxy, not a distinct-active-account count (that needs a raw SQL DISTINCT-per-day query this pass doesn't add). Labelled honestly on the page as "logins per day". */
  readonly loginsByDay: readonly { readonly date: string; readonly count: number }[];
  readonly ownerLastLogin: { readonly at: string | null; readonly staleDays: number | null; readonly isStale: boolean };
  readonly staffActivity: readonly {
    readonly staffUserId: string;
    readonly fullName: string;
    readonly role: string;
    readonly lastAction: string | null;
    readonly lastActionAt: string | null;
  }[];
  readonly customerPortal: { readonly sessions: number; readonly distinctCustomers: number; readonly decisionResponseRate: number | null };
}

export type UsageTrend = "UP" | "DOWN" | "FLAT" | "NEW";

export interface PlatformFeatureUsageRow {
  readonly key: string;
  readonly label: string;
  readonly capabilityKey: CapabilityKey | null;
  readonly enabled: boolean;
  readonly enablementStatus: CapabilityStatus | "ENABLED" | "NOT_CAPABILITY_BACKED";
  readonly currentUsage: number;
  readonly previousUsage: number;
  readonly trend: UsageTrend;
  readonly adoptionSignal: "DISABLED" | "USED" | "ENABLED_UNUSED";
  readonly metric: string;
}

export interface PlatformFeatureUsage {
  readonly windowDays: 30 | 90;
  readonly from: string;
  readonly to: string;
  readonly rows: readonly PlatformFeatureUsageRow[];
  readonly enabledFeatureCount: number;
  readonly enabledUsedFeatureCount: number;
  readonly adoptionPercent: number | null;
}

export interface BuilderAdoption {
  readonly themeCustomized: boolean;
  readonly pagesCustomized: number;
  readonly formsCustomized: number;
  readonly messagesCustomized: number;
  readonly lastPublish: { readonly at: string; readonly by: string; readonly version: number } | null;
  readonly rollbackCount: number;
  readonly validationFailures: number;
  readonly highRiskChanges: readonly { readonly id: string; readonly action: string; readonly at: string; readonly riskLevel: string }[];
  readonly adoptionPercent: number;
}

export interface OperationalActivity {
  readonly workOrders: { readonly created: number; readonly completed: number; readonly completionRate: number | null };
  readonly activeTasks: number;
  readonly waiting: { readonly customer: number; readonly parts: number };
  readonly blockers: { readonly open: number; readonly resolvedThisPeriod: number };
  readonly inventoryMovements: readonly { readonly type: string; readonly count: number }[];
  readonly paymentsRecorded: { readonly count: number; readonly totalAmount: number; readonly currency: string };
  readonly invoicesIssued: number;
}

export interface CommercialSnapshot {
  readonly plan: string;
  readonly subscriptionStatus: string;
  readonly paidStatus: null;
  readonly renewalDate: null;
  readonly overdueAmount: null;
  readonly mrrContribution: null;
  readonly note: string;
}

export interface HealthRisk {
  readonly status: HealthStatus;
  readonly warnings: readonly HealthWarning[];
  readonly ownerInactivityDays: number | null;
  readonly lowStaffUsageCount: number;
  readonly failedLogins: { readonly count: number; readonly spike: boolean | null };
  readonly builderValidationErrors: number;
  readonly paymentRisk: null;
  readonly frozenOrSuspendedHistory: readonly { readonly at: string; readonly action: string }[];
  readonly lowFeatureAdoptionCount: number;
}

export interface PlatformReportDetail {
  readonly workshop: { readonly id: string; readonly name: string; readonly planName: string; readonly status: string; readonly currency: string };
  readonly usageOverview: UsageOverview;
  readonly featureUsage: PlatformFeatureUsage;
  readonly builderAdoption: BuilderAdoption;
  readonly operationalActivity: OperationalActivity;
  readonly commercialSnapshot: CommercialSnapshot;
  readonly healthRisk: HealthRisk;
}

/** Past this many days with no recorded activity, an owner's last login is flagged stale on the page. */
const STALE_OWNER_LOGIN_DAYS = 14;
/** Bounded scan for "staff last activity" -- see the same CANDIDATE_CAP reasoning in WorkshopsService.list(). A real background summary table is Phase 13's eventual job, not this pass's. */
const AUDIT_SCAN_LIMIT = 300;
const DAY_MS = 24 * 60 * 60 * 1000;

type ReportRange = { readonly from: Date; readonly to: Date; readonly previousFrom: Date; readonly previousTo: Date };

const FEATURE_DEFINITIONS: readonly {
  readonly key: string;
  readonly label: string;
  readonly capabilityKey: CapabilityKey | null;
  readonly metric: string;
}[] = [
  { key: "technician_work_card", label: "Technician Work Card", capabilityKey: null, metric: "Tasks completed" },
  { key: "customer_decisions", label: "Customer Decision Requests", capabilityKey: "CUSTOMER_PORTAL", metric: "Decision requests opened" },
  { key: "inventory_requests", label: "Inventory Requests", capabilityKey: "INVENTORY", metric: "Part requests opened" },
  { key: "parts_used_returned", label: "Parts Used / Returned", capabilityKey: "PART_RETURNS", metric: "Parts used or returned" },
  { key: "quick_inspection", label: "Quick Inspection", capabilityKey: "QUICK_INSPECTION", metric: "Quick inspections recorded" },
  { key: "quick_service", label: "Quick Service", capabilityKey: null, metric: "Inspection-declined work orders" },
  { key: "builder", label: "Builder", capabilityKey: null, metric: "Governed configuration changes" },
  { key: "reports", label: "Reports", capabilityKey: null, metric: "Saved analytical views created" },
  { key: "team_leader", label: "Team Leader", capabilityKey: "TEAMS", metric: "Supervision notes written" },
  { key: "finance", label: "Finance", capabilityKey: "FINANCE_CORE", metric: "Payments recorded plus invoices issued" },
];

const BUILDER_AUDIT_ACTIONS = [
  "capability.changed",
  "governance.role_permission_lock.set",
  "governance.role_permission_lock.removed",
  "governance.entitlement_override.set",
  "governance.entitlement_override.removed",
];

/**
 * Platform Reports -- Level 1 (aggregated view) and Level 2's six
 * per-workshop sections from `docs/detailed-specs/platform-super-admin.md`.
 * Every value is derived from existing product rows; the platform
 * subscription money fields remain explicit nulls because no platform
 * billing table exists yet.
 *
 * `usageScore` is this project's own defined composite -- the source
 * spec calls for "a composite" without pinning a formula. It is a plain
 * recency bucket derived from `lastActivityAt`, the same field
 * `WorkshopHealthService` already treats as the best available activity
 * signal, chosen so the number is real and re-derivable rather than an
 * invented weighting of metrics this pass doesn't compute.
 */
@Injectable()
export class PlatformReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workshops: WorkshopsService,
    private readonly health: WorkshopHealthService,
  ) {}

  async overview(query: ListWorkshopsQueryDto): Promise<PlatformReportsOverview> {
    const [workshopPage, totals] = await Promise.all([this.workshops.list(query), this.platformTotals()]);
    const customerCounts = await this.customerCountsFor(workshopPage.items.map((w) => w.id));
    const signalRows = await Promise.all(workshopPage.items.map(async (w) => [w.id, await this.cardSignals(w.id)] as const));
    const signals = new Map(signalRows);

    const items: WorkshopReportCard[] = workshopPage.items.map((row) => ({
      id: row.id,
      name: row.name,
      health: row.health,
      planName: row.plan.name,
      status: row.status,
      lastActivityAt: row.lastActivityAt?.toISOString() ?? null,
      staffUserCount: row.userCount,
      customerCount: customerCounts.get(row.id) ?? 0,
      activeUserCount: signals.get(row.id)?.activeUserCount ?? 0,
      usageScore: this.usageScore(row.lastActivityAt),
      featureAdoptionPercent: signals.get(row.id)?.featureAdoptionPercent ?? null,
      builderAdoptionPercent: signals.get(row.id)?.builderAdoptionPercent ?? 0,
    }));

    return {
      totals,
      workshops: { items, total: workshopPage.total, page: workshopPage.page, pageSize: workshopPage.pageSize },
    };
  }

  async usageOverview(tenantId: string, windowDays: 30 | 90): Promise<UsageOverview> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException({ code: "workshop_not_found", message: "Workshop not found." });

    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    const [staffActiveAccounts, customerSessions, staffSessionsInWindow, owner, staff, decisionRequests] = await Promise.all([
      this.prisma.session.findMany({
        where: { account: { tenantId, accountType: "TENANT_STAFF" }, createdAt: { gte: since } },
        distinct: ["accountId"],
        select: { accountId: true },
      }),
      this.prisma.session.findMany({
        where: { account: { tenantId, accountType: "CUSTOMER" }, createdAt: { gte: since } },
        distinct: ["accountId"],
        select: { accountId: true },
      }),
      this.prisma.session.findMany({
        where: { account: { tenantId }, createdAt: { gte: since } },
        select: { createdAt: true },
      }),
      this.prisma.staffUser.findFirst({ where: { tenantId, role: "TENANT_OWNER" }, include: { account: true } }),
      this.prisma.staffUser.findMany({ where: { tenantId, isActive: true }, select: { id: true, fullName: true, role: true, accountId: true } }),
      this.prisma.customerDecisionRequest.findMany({
        where: { tenantId, createdAt: { gte: since } },
        select: { status: true },
      }),
    ]);

    const ownerLastSession = owner
      ? await this.prisma.session.findFirst({ where: { accountId: owner.accountId }, orderBy: { createdAt: "desc" } })
      : null;

    return {
      activeUsers: { staff: staffActiveAccounts.length, customer: customerSessions.length },
      loginsByDay: this.bucketByDay(staffSessionsInWindow.map((s) => s.createdAt), windowDays),
      ownerLastLogin: this.ownerLoginStatus(ownerLastSession?.createdAt ?? null),
      staffActivity: await this.staffActivity(tenantId, staff),
      customerPortal: {
        sessions: customerSessions.length,
        distinctCustomers: customerSessions.length,
        decisionResponseRate: this.responseRate(decisionRequests),
      },
    };
  }

  async detail(tenantId: string, windowDays: 30 | 90): Promise<PlatformReportDetail> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, include: { plan: true } });
    if (!tenant) throw new NotFoundException({ code: "workshop_not_found", message: "Workshop not found." });

    const [usageOverview, featureUsage, builderAdoption, operationalActivity] = await Promise.all([
      this.usageOverview(tenantId, windowDays),
      this.featureUsage(tenantId, windowDays),
      this.builderAdoption(tenantId),
      this.operationalActivity(tenantId, tenant.currency, windowDays),
    ]);

    return {
      workshop: { id: tenant.id, name: tenant.name, planName: tenant.plan.name, status: tenant.status, currency: tenant.currency },
      usageOverview,
      featureUsage,
      builderAdoption,
      operationalActivity,
      commercialSnapshot: {
        plan: tenant.plan.name,
        subscriptionStatus: tenant.status,
        paidStatus: null,
        renewalDate: null,
        overdueAmount: null,
        mrrContribution: null,
        note: "Platform subscription billing is not backed by a MOP billing table yet; money fields remain explicit placeholders.",
      },
      healthRisk: await this.healthRisk(tenantId, usageOverview, builderAdoption, featureUsage),
    };
  }

  private async platformTotals(): Promise<PlatformTotals> {
    const [totalWorkshops, activeWorkshops, totalStaffUsers, totalCustomers] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.tenant.count({ where: { status: "ACTIVE" } }),
      this.prisma.staffUser.count({ where: { isActive: true } }),
      this.prisma.customer.count(),
    ]);
    return { totalWorkshops, activeWorkshops, totalStaffUsers, totalCustomers, aggregateMrr: null };
  }

  private async cardSignals(tenantId: string): Promise<{
    readonly activeUserCount: number;
    readonly featureAdoptionPercent: number | null;
    readonly builderAdoptionPercent: number;
  }> {
    const range = this.reportRange(30);
    const [activeUsers, featureUsage, builderAdoption] = await Promise.all([
      this.prisma.session.findMany({
        where: { tenantId, createdAt: { gte: range.from, lte: range.to } },
        distinct: ["accountId"],
        select: { accountId: true },
      }),
      this.featureUsage(tenantId, 30),
      this.builderAdoption(tenantId),
    ]);
    return {
      activeUserCount: activeUsers.length,
      featureAdoptionPercent: featureUsage.adoptionPercent,
      builderAdoptionPercent: builderAdoption.adoptionPercent,
    };
  }

  private async featureUsage(tenantId: string, windowDays: 30 | 90): Promise<PlatformFeatureUsage> {
    const range = this.reportRange(windowDays);
    const profile = await this.capabilityProfile(tenantId);

    const rows = await Promise.all(
      FEATURE_DEFINITIONS.map(async (definition): Promise<PlatformFeatureUsageRow> => {
        const [currentUsage, previousUsage] = await Promise.all([
          this.countFeatureUsage(tenantId, definition.key, range.from, range.to),
          this.countFeatureUsage(tenantId, definition.key, range.previousFrom, range.previousTo),
        ]);
        const enabled = definition.capabilityKey ? isCapabilityActive(profile, definition.capabilityKey) : true;
        const enablementStatus = definition.capabilityKey ? profile[definition.capabilityKey] ?? "ENABLED" : "NOT_CAPABILITY_BACKED";
        return {
          key: definition.key,
          label: definition.label,
          capabilityKey: definition.capabilityKey,
          enabled,
          enablementStatus,
          currentUsage,
          previousUsage,
          trend: this.trend(currentUsage, previousUsage),
          adoptionSignal: enabled ? (currentUsage > 0 ? "USED" : "ENABLED_UNUSED") : "DISABLED",
          metric: definition.metric,
        };
      }),
    );

    const enabledRows = rows.filter((row) => row.enabled);
    const usedRows = enabledRows.filter((row) => row.currentUsage > 0);
    return {
      windowDays,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      rows,
      enabledFeatureCount: enabledRows.length,
      enabledUsedFeatureCount: usedRows.length,
      adoptionPercent: enabledRows.length === 0 ? null : Math.round((usedRows.length / enabledRows.length) * 100),
    };
  }

  private async builderAdoption(tenantId: string): Promise<BuilderAdoption> {
    const [
      config,
      formsCustomized,
      messages,
      lastPublish,
      rollbackCount,
      validationFailures,
      highRiskChanges,
    ] = await Promise.all([
      this.prisma.tenantConfiguration.findUnique({ where: { tenantId } }),
      this.prisma.customFieldDefinition.count({ where: { tenantId, isArchived: false } }),
      this.prisma.messageTemplate.findMany({ where: { tenantId }, distinct: ["templateKey"], select: { templateKey: true } }),
      this.prisma.tenantConfigurationVersion.findFirst({
        where: { tenantId },
        orderBy: { publishedAt: "desc" },
        select: { publishedAt: true, publishedById: true, version: true },
      }),
      this.prisma.auditLog.count({ where: { tenantId, action: { contains: "rollback" } } }),
      this.prisma.auditLog.count({ where: { tenantId, action: { contains: "validation" } } }),
      this.prisma.auditLog.findMany({
        where: { tenantId, riskLevel: { in: ["HIGH", "CRITICAL"] } },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, action: true, createdAt: true, riskLevel: true },
      }),
    ]);

    const themeCustomized = this.hasConfiguredValue(config?.theme);
    const pagesCustomized = this.configuredObjectCount(config?.pageLayouts);
    const facets = [themeCustomized, pagesCustomized > 0, formsCustomized > 0, messages.length > 0];

    return {
      themeCustomized,
      pagesCustomized,
      formsCustomized,
      messagesCustomized: messages.length,
      lastPublish: lastPublish
        ? { at: lastPublish.publishedAt.toISOString(), by: lastPublish.publishedById, version: lastPublish.version }
        : null,
      rollbackCount,
      validationFailures,
      highRiskChanges: highRiskChanges.map((row) => ({
        id: row.id,
        action: row.action,
        at: row.createdAt.toISOString(),
        riskLevel: row.riskLevel,
      })),
      adoptionPercent: Math.round((facets.filter(Boolean).length / facets.length) * 100),
    };
  }

  private async operationalActivity(tenantId: string, currency: string, windowDays: 30 | 90): Promise<OperationalActivity> {
    const range = this.reportRange(windowDays);
    const [
      workOrdersCreated,
      workOrdersCompleted,
      activeTasks,
      waitingCustomer,
      waitingParts,
      openBlockers,
      resolvedBlockers,
      movementGroups,
      paymentCount,
      paymentSum,
      invoicesIssued,
    ] = await Promise.all([
      this.prisma.workOrder.count({ where: { tenantId, createdAt: { gte: range.from, lte: range.to } } }),
      this.prisma.workOrder.count({ where: { tenantId, status: "CLOSED", closedAt: { gte: range.from, lte: range.to } } }),
      this.prisma.task.count({ where: { tenantId, status: { notIn: ["DONE", "CANCELLED"] } } }),
      this.prisma.workOrder.count({ where: { tenantId, status: "WAITING_CUSTOMER" } }),
      this.prisma.workOrder.count({ where: { tenantId, status: "WAITING_PARTS" } }),
      this.prisma.taskBlocker.count({ where: { tenantId, status: { in: ["OPEN", "ESCALATED"] } } }),
      this.prisma.taskBlocker.count({ where: { tenantId, status: "RESOLVED", resolvedAt: { gte: range.from, lte: range.to } } }),
      this.prisma.stockMovement.groupBy({
        by: ["type"],
        where: { tenantId, createdAt: { gte: range.from, lte: range.to } },
        _count: true,
      }),
      this.prisma.payment.count({ where: { tenantId, status: "CONFIRMED", createdAt: { gte: range.from, lte: range.to } } }),
      this.prisma.payment.aggregate({
        where: { tenantId, status: "CONFIRMED", createdAt: { gte: range.from, lte: range.to } },
        _sum: { amount: true },
      }),
      this.prisma.invoice.count({ where: { tenantId, issuedAt: { gte: range.from, lte: range.to } } }),
    ]);

    return {
      workOrders: {
        created: workOrdersCreated,
        completed: workOrdersCompleted,
        completionRate: workOrdersCreated === 0 ? null : Math.round((workOrdersCompleted / workOrdersCreated) * 100),
      },
      activeTasks,
      waiting: { customer: waitingCustomer, parts: waitingParts },
      blockers: { open: openBlockers, resolvedThisPeriod: resolvedBlockers },
      inventoryMovements: movementGroups.map((row) => ({ type: row.type, count: row._count })),
      paymentsRecorded: { count: paymentCount, totalAmount: this.decimalToNumber(paymentSum._sum.amount), currency },
      invoicesIssued,
    };
  }

  private async healthRisk(
    tenantId: string,
    usage: UsageOverview,
    builder: BuilderAdoption,
    featureUsage: PlatformFeatureUsage,
  ): Promise<HealthRisk> {
    const now = new Date();
    const yearAgo = new Date(now.getTime() - 365 * DAY_MS);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * DAY_MS);

    const [owner, activeStaff, activeStaffWithAudit, frozenHistory] = await Promise.all([
      this.prisma.staffUser.findFirst({
        where: { tenantId, role: "TENANT_OWNER" },
        include: { account: true },
      }),
      this.prisma.staffUser.findMany({ where: { tenantId, isActive: true }, select: { accountId: true } }),
      this.prisma.auditLog.findMany({
        where: { tenantId, actorType: "TENANT_STAFF", createdAt: { gte: this.reportRange(featureUsage.windowDays).from, lte: now } },
        distinct: ["actorId"],
        select: { actorId: true },
      }),
      this.prisma.auditLog.findMany({
        where: { tenantId, action: { in: ["platform.workshop.frozen", "platform.workshop.reactivated"] }, createdAt: { gte: yearAgo } },
        orderBy: { createdAt: "desc" },
        select: { action: true, createdAt: true },
      }),
    ]);

    const activeActorIds = new Set(activeStaffWithAudit.map((row) => row.actorId));
    const ownerLastLoginAt = usage.ownerLastLogin.at ? new Date(usage.ownerLastLogin.at) : null;
    const staffLastActivityAt = usage.staffActivity
      .map((row) => row.lastActionAt)
      .filter((value): value is string => value !== null)
      .map((value) => new Date(value))
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    const recentFreezeOrSuspend = frozenHistory.some(
      (row) => row.action === "platform.workshop.frozen" && row.createdAt >= ninetyDaysAgo,
    );
    const evaluated = this.health.evaluate({
      ownerLastLoginAt,
      staffLastActivityAt,
      ownerFailedLoginCount: owner?.account.failedLoginCount ?? 0,
      frozenOrSuspendedInLast90Days: recentFreezeOrSuspend,
    });

    return {
      status: evaluated.status,
      warnings: evaluated.warnings,
      ownerInactivityDays: usage.ownerLastLogin.staleDays,
      lowStaffUsageCount: activeStaff.filter((row) => !activeActorIds.has(row.accountId)).length,
      failedLogins: { count: owner?.account.failedLoginCount ?? 0, spike: null },
      builderValidationErrors: builder.validationFailures,
      paymentRisk: null,
      frozenOrSuspendedHistory: frozenHistory.map((row) => ({ action: row.action, at: row.createdAt.toISOString() })),
      lowFeatureAdoptionCount: featureUsage.rows.filter((row) => row.adoptionSignal === "ENABLED_UNUSED").length,
    };
  }

  private async customerCountsFor(tenantIds: readonly string[]): Promise<Map<string, number>> {
    if (tenantIds.length === 0) return new Map();
    const groups = await this.prisma.customer.groupBy({ by: ["tenantId"], where: { tenantId: { in: [...tenantIds] } }, _count: true });
    return new Map(groups.map((g) => [g.tenantId, g._count]));
  }

  private async capabilityProfile(tenantId: string): Promise<CapabilityProfile> {
    const rows = await this.prisma.tenantCapability.findMany({
      where: { tenantId, effectiveTo: null },
      select: { capabilityKey: true, status: true },
    });
    const profile: Partial<Record<CapabilityKey, CapabilityStatus>> = {};
    for (const row of rows) {
      if (CAPABILITY_KEYS.includes(row.capabilityKey as CapabilityKey)) {
        profile[row.capabilityKey as CapabilityKey] = row.status as CapabilityStatus;
      }
    }
    return profile;
  }

  private async countFeatureUsage(tenantId: string, key: string, from: Date, to: Date): Promise<number> {
    const inWindow = { gte: from, lte: to };
    switch (key) {
      case "technician_work_card":
        return this.prisma.task.count({ where: { tenantId, status: "DONE", updatedAt: inWindow } });
      case "customer_decisions":
        return this.prisma.customerDecisionRequest.count({ where: { tenantId, createdAt: inWindow } });
      case "inventory_requests":
        return this.prisma.partRequest.count({ where: { tenantId, createdAt: inWindow } });
      case "parts_used_returned": {
        const [used, returns] = await Promise.all([
          this.prisma.issuedItem.count({ where: { tenantId, usedAt: inWindow } }),
          this.prisma.partReturnRequest.count({ where: { tenantId, createdAt: inWindow } }),
        ]);
        return used + returns;
      }
      case "quick_inspection":
        return this.prisma.inspection.count({ where: { tenantId, type: "QUICK", createdAt: inWindow } });
      case "quick_service":
        return this.prisma.workOrder.count({ where: { tenantId, inspectionDeclined: true, createdAt: inWindow } });
      case "builder":
        return this.prisma.auditLog.count({ where: { tenantId, action: { in: BUILDER_AUDIT_ACTIONS }, createdAt: inWindow } });
      case "reports":
        return this.prisma.analystSavedView.count({ where: { tenantId, createdAt: inWindow } });
      case "team_leader":
        return this.prisma.supervisionNote.count({ where: { tenantId, createdAt: inWindow } });
      case "finance": {
        const [payments, invoices] = await Promise.all([
          this.prisma.payment.count({ where: { tenantId, status: "CONFIRMED", createdAt: inWindow } }),
          this.prisma.invoice.count({ where: { tenantId, issuedAt: inWindow } }),
        ]);
        return payments + invoices;
      }
      default:
        return 0;
    }
  }

  private reportRange(windowDays: 30 | 90): ReportRange {
    const to = new Date();
    const from = new Date(to.getTime() - windowDays * DAY_MS);
    const previousTo = from;
    const previousFrom = new Date(previousTo.getTime() - windowDays * DAY_MS);
    return { from, to, previousFrom, previousTo };
  }

  private trend(current: number, previous: number): UsageTrend {
    if (current > 0 && previous === 0) return "NEW";
    if (current > previous) return "UP";
    if (current < previous) return "DOWN";
    return "FLAT";
  }

  private hasConfiguredValue(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
    if (typeof value === "string") return value.trim().length > 0;
    return Boolean(value);
  }

  private configuredObjectCount(value: unknown): number {
    if (Array.isArray(value)) return value.length;
    if (value && typeof value === "object") return Object.keys(value as Record<string, unknown>).length;
    return 0;
  }

  private decimalToNumber(value: unknown): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === "number") return value;
    const asString = typeof (value as { toString?: () => string }).toString === "function" ? (value as { toString: () => string }).toString() : String(value);
    const parsed = Number(asString);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private usageScore(lastActivityAt: Date | null): number {
    if (!lastActivityAt) return 0;
    const days = (Date.now() - lastActivityAt.getTime()) / (24 * 60 * 60 * 1000);
    if (days <= 1) return 100;
    if (days <= 7) return 80;
    if (days <= 30) return 55;
    if (days <= 90) return 25;
    return 5;
  }

  private ownerLoginStatus(at: Date | null): UsageOverview["ownerLastLogin"] {
    if (!at) return { at: null, staleDays: null, isStale: true };
    const staleDays = Math.floor((Date.now() - at.getTime()) / (24 * 60 * 60 * 1000));
    return { at: at.toISOString(), staleDays, isStale: staleDays > STALE_OWNER_LOGIN_DAYS };
  }

  private async staffActivity(
    tenantId: string,
    staff: readonly { id: string; fullName: string; role: string; accountId: string }[],
  ): Promise<UsageOverview["staffActivity"]> {
    if (staff.length === 0) return [];

    const recentAudit = await this.prisma.auditLog.findMany({
      where: { tenantId, actorType: "TENANT_STAFF" },
      orderBy: { createdAt: "desc" },
      take: AUDIT_SCAN_LIMIT,
      select: { actorId: true, action: true, createdAt: true },
    });

    const lastByAccount = new Map<string, { action: string; createdAt: Date }>();
    for (const row of recentAudit) {
      if (!lastByAccount.has(row.actorId)) lastByAccount.set(row.actorId, { action: row.action, createdAt: row.createdAt });
    }

    return staff
      .map((person) => {
        const last = lastByAccount.get(person.accountId);
        return {
          staffUserId: person.id,
          fullName: person.fullName,
          role: person.role,
          lastAction: last?.action ?? null,
          lastActionAt: last?.createdAt.toISOString() ?? null,
        };
      })
      .sort((a, b) => (b.lastActionAt ?? "").localeCompare(a.lastActionAt ?? ""));
  }

  /** RESOLVED/PARTIALLY_RESPONDED are real answers; PENDING/SENT/VIEWED/EXPIRED are not -- delivery or lapse, not a response. */
  private responseRate(requests: readonly { status: string }[]): number | null {
    if (requests.length === 0) return null;
    const responded = requests.filter((r) => r.status === "RESOLVED" || r.status === "PARTIALLY_RESPONDED").length;
    return Math.round((responded / requests.length) * 100);
  }

  private bucketByDay(dates: readonly Date[], windowDays: number): readonly { date: string; count: number }[] {
    const counts = new Map<string, number>();
    for (const date of dates) {
      const key = date.toISOString().slice(0, 10);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const days: { date: string; count: number }[] = [];
    for (let i = windowDays - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      days.push({ date: key, count: counts.get(key) ?? 0 });
    }
    return days;
  }
}
