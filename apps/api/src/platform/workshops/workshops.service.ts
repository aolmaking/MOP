import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type TenantStatus } from "@mop/database";
import { PrismaService } from "../../database/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { WorkshopHealthService, type HealthStatus, type HealthWarning } from "./workshop-health.service";
import type { ListWorkshopsQueryDto } from "./list-workshops.dto";

const CLOSED_WORK_ORDER_STATUSES = ["CLOSED", "CANCELLED"] as const;
const FREEZING_STATUSES = new Set(["FROZEN", "SUSPENDED"]);

export type BuilderStatus = "NOT_CUSTOMIZED" | "CUSTOMIZED" | "DRAFT_PENDING";

export interface WorkshopRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  currency: string;
  timezone: string;
  createdAt: Date;
  plan: { id: string; name: string; monthlyPrice: string };
  owner: { fullName: string; email: string | null; invitePending: boolean } | null;
  branchCount: number;
  userCount: number;
  activeWorkOrderCount: number;
  lastActivityAt: Date | null;
  builderStatus: BuilderStatus;
  health: HealthStatus;
}

export interface WorkshopListResult {
  items: WorkshopRow[];
  total: number;
  page: number;
  pageSize: number;
}

@Injectable()
export class WorkshopsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly health: WorkshopHealthService,
  ) {}

  async list(query: ListWorkshopsQueryDto): Promise<WorkshopListResult> {
    const where = this.buildWhere(query);
    const wantsHealthFilter = !!query.health?.length;
    const wantsAggregateSort = ["last_activity_desc", "branch_count_desc", "user_count_desc"].includes(query.sort);

    if (!wantsHealthFilter && !wantsAggregateSort) {
      // The fast, fully DB-level path: sort/filter/pagination Prisma can
      // express directly (name, created date, plan, status).
      const [tenants, total] = await Promise.all([
        this.prisma.tenant.findMany({
          where,
          include: { plan: true, configuration: true },
          orderBy: this.buildOrderBy(query.sort),
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        this.prisma.tenant.count({ where }),
      ]);
      const rows = await this.attachAggregates(tenants);
      return { items: rows, total, page: query.page, pageSize: query.pageSize };
    }

    // Health and the aggregate-dependent sorts (last activity, branch/user
    // count) aren't columns Prisma can filter/orderBy directly -- they're
    // computed after the fact in attachAggregates(). Correct fix at real
    // platform-wide scale is a denormalized, background-job-refreshed
    // summary table (Phase 10, System Automation) so this can go back to
    // a single indexed DB query; that job pattern doesn't exist yet, so
    // this takes a bounded candidate set instead, real and correct up to
    // CANDIDATE_CAP tenants matching the other filters, not an unbounded
    // "select everything" scan.
    const CANDIDATE_CAP = 500;
    const [candidates, matchingTotal] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        include: { plan: true, configuration: true },
        orderBy: { createdAt: "desc" },
        take: CANDIDATE_CAP,
      }),
      this.prisma.tenant.count({ where }),
    ]);

    let rows = await this.attachAggregates(candidates);
    if (wantsHealthFilter) rows = rows.filter((row) => query.health!.includes(row.health));
    rows = this.sortByAggregate(rows, query.sort);

    const pageStart = (query.page - 1) * query.pageSize;
    return {
      items: rows.slice(pageStart, pageStart + query.pageSize),
      total: wantsHealthFilter ? rows.length : matchingTotal,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /**
   * The Workshop Details drawer -- every sub-list is paginated/limited at
   * the query itself (never "load everything then slice in JS"), so a
   * workshop with 1 branch and one with 200 use the exact same shape,
   * per spec: "the drawer must not assume any fixed count."
   */
  async getDetails(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { plan: true, configuration: true },
    });
    if (!tenant) throw new NotFoundException({ code: "workshop_not_found", message: "Workshop not found." });

    const [owner, branchPage, branchTotal, warehousePage, warehouseTotal, usersByRole, recentAudit, recentControls, aggregates] =
      await Promise.all([
        this.prisma.staffUser.findFirst({ where: { tenantId, role: "TENANT_OWNER" }, include: { account: true } }),
        this.prisma.branch.findMany({ where: { tenantId }, take: 20, orderBy: { name: "asc" } }),
        this.prisma.branch.count({ where: { tenantId } }),
        this.prisma.warehouse.findMany({ where: { tenantId }, take: 20, orderBy: { name: "asc" } }),
        this.prisma.warehouse.count({ where: { tenantId } }),
        this.prisma.staffUser.groupBy({ by: ["role"], where: { tenantId, isActive: true }, _count: true }),
        this.prisma.auditLog.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 10 }),
        this.prisma.controlSetting.findMany({
          where: { scope: "PLATFORM", tenantId },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
        this.attachAggregates([tenant]),
      ]);

    const row = aggregates[0];

    return {
      basicInfo: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        country: tenant.country,
        city: tenant.city,
        businessType: tenant.businessType,
        primaryCategory: tenant.primaryCategory,
        currency: tenant.currency,
        timezone: tenant.timezone,
        createdAt: tenant.createdAt,
        status: tenant.status,
      },
      ownerInfo: owner
        ? {
            fullName: owner.fullName,
            email: owner.account.email,
            phone: owner.account.phone,
            accountStatus: owner.account.status,
            lastLoginAt: row.lastActivityAt, // best available proxy -- see WorkshopHealthService's own note
          }
        : null,
      planInfo: {
        name: tenant.plan.name,
        monthlyPrice: tenant.plan.monthlyPrice.toString(),
        limits: {
          branches: { used: branchTotal, max: tenant.plan.maxBranches },
          users: { used: row.userCount, max: tenant.plan.maxUsers },
          warehouses: { used: warehouseTotal, max: tenant.plan.maxWarehouses },
        },
      },
      branches: { items: branchPage, total: branchTotal },
      warehouses: { items: warehousePage, total: warehouseTotal },
      usersByRole: usersByRole.map((u) => ({ role: u.role, count: u._count })),
      enabledModules: tenant.configuration?.enabledModules ?? [],
      recentActivity: recentAudit,
      recentPlatformControls: recentControls,
      subscription: {
        planName: tenant.plan.name,
        monthlyPrice: tenant.plan.monthlyPrice.toString(),
        currency: tenant.currency,
        // Honestly not backed by real billing yet -- same disclosed gap
        // as the Workshops table's Subscription column and Platform
        // Reports' Commercial Snapshot; not implied to be more precise
        // than it is.
        renewalDate: null,
        paidThroughDate: null,
      },
      health: { status: row.health, warnings: await this.healthWarnings(tenant.id, row) },
    };
  }

  private async healthWarnings(tenantId: string, row: WorkshopRow): Promise<HealthWarning[]> {
    const owner = await this.prisma.staffUser.findFirst({ where: { tenantId, role: "TENANT_OWNER" }, include: { account: true } });
    const recentFreeze = await this.prisma.auditLog.findFirst({
      where: {
        tenantId,
        action: "platform.workshop.frozen",
        createdAt: { gt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
      },
    });
    return this.health.evaluate({
      ownerLastLoginAt: row.lastActivityAt,
      staffLastActivityAt: row.lastActivityAt,
      ownerFailedLoginCount: owner?.account.failedLoginCount ?? 0,
      frozenOrSuspendedInLast90Days: !!recentFreeze,
    }).warnings;
  }

  async freeze(tenantId: string, reason: string, actor: { accountId: string; displayName: string }): Promise<void> {
    await this.changeStatus(tenantId, "FROZEN", reason, actor, "platform.workshop.frozen");
  }

  async reactivate(tenantId: string, reason: string, actor: { accountId: string; displayName: string }): Promise<void> {
    await this.changeStatus(tenantId, "ACTIVE", reason, actor, "platform.workshop.reactivated");
  }

  /** Live-computed at dialog-open time, never cached -- per spec, an Impact Preview must reflect the current moment, not a stale prior look. */
  async freezeImpactPreview(tenantId: string): Promise<{ staffSessionsToRevoke: number; customerSessionsToRevoke: number }> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException({ code: "workshop_not_found", message: "Workshop not found." });

    const now = new Date();
    const [staffSessionsToRevoke, customerSessionsToRevoke] = await Promise.all([
      this.prisma.session.count({
        where: { revokedAt: null, expiresAt: { gt: now }, account: { tenantId, accountType: "TENANT_STAFF" } },
      }),
      this.prisma.session.count({
        where: { revokedAt: null, expiresAt: { gt: now }, account: { tenantId, accountType: "CUSTOMER" } },
      }),
    ]);

    return { staffSessionsToRevoke, customerSessionsToRevoke };
  }

  /**
   * E14 (`docs/scenarios3/EDGE_CASE_REGISTER.md`): two opposite platform
   * actions -- freeze and reactivate -- racing the same tenant. The
   * equality check above looks like it prevents this, but it only
   * catches the case where a caller's own target already matches what it
   * read; it does nothing for a tenant starting from a THIRD status
   * (e.g. SUSPENDED or TRIAL), where a concurrent freeze (targeting
   * FROZEN) and a concurrent reactivate (targeting ACTIVE) can both read
   * that same starting status, both pass their own check, and then race
   * a plain `update` with no guard -- leaving the final status as
   * whichever write happened to land last, with BOTH audit rows on
   * record as if each had definitively succeeded. The write below is
   * conditional on the exact status just read, same discipline as the
   * WorkOrder/part-request/team-membership locks elsewhere in this
   * project: whichever call's write lands first wins outright, and the
   * loser gets a real conflict instead of a silently overwritten result.
   */
  private async changeStatus(
    tenantId: string,
    newStatus: TenantStatus,
    reason: string,
    actor: { accountId: string; displayName: string },
    auditAction: string,
  ): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException({ code: "workshop_not_found", message: "Workshop not found." });
    if (tenant.status === newStatus) {
      throw new ConflictException({ code: "already_in_status", message: `Workshop is already ${newStatus}.` });
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.tenant.updateMany({
        where: { id: tenantId, status: tenant.status },
        data: { status: newStatus },
      });

      if (updated.count === 0) {
        throw new ConflictException({
          code: "concurrent_status_change",
          message: "This workshop's status changed while this action was being applied. Reload and try again.",
        });
      }

      // Revoking sessions is the actual login-block mechanism -- status
      // alone is inert without this (SessionGuard resolves a session
      // that's still marked valid regardless of the tenant's own status;
      // TenantStatusLayer, from Phase 1, is what then denies further
      // *actions*, but an already-issued cookie must stop resolving too).
      if (FREEZING_STATUSES.has(newStatus)) {
        await tx.session.updateMany({
          where: { revokedAt: null, account: { tenantId } },
          data: { revokedAt: now },
        });
      }

      await this.auditService.record(
        {
          tenantId,
          actorId: actor.accountId,
          actorType: "PLATFORM",
          actorName: actor.displayName,
          targetType: "Tenant",
          targetId: tenantId,
          action: auditAction,
          before: { status: tenant.status },
          after: { status: newStatus },
          reason,
          riskLevel: "HIGH",
        },
        tx,
      );
    });
  }

  private buildWhere(query: ListWorkshopsQueryDto): Prisma.TenantWhereInput {
    const where: Prisma.TenantWhereInput = {};
    if (query.search) {
      where.OR = [
        { nameNormalized: { contains: query.search.toLowerCase() } },
        { staffUsers: { some: { role: "TENANT_OWNER", account: { email: { contains: query.search, mode: "insensitive" } } } } },
      ];
    }
    if (query.status?.length) where.status = { in: query.status };
    if (query.plan?.length) where.planId = { in: query.plan };
    return where;
  }

  private buildOrderBy(sort: string): Prisma.TenantOrderByWithRelationInput {
    switch (sort) {
      case "name_asc":
        return { nameNormalized: "asc" };
      case "created_desc":
        return { createdAt: "desc" };
      // branch_count_desc / user_count_desc / last_activity_desc all need
      // computed aggregates that Prisma can't orderBy directly -- these
      // fall back to createdAt here and get their real ordering applied
      // in attachAggregates()'s in-memory sort instead.
      default:
        return { createdAt: "desc" };
    }
  }

  private async attachAggregates(
    tenants: Array<Prisma.TenantGetPayload<{ include: { plan: true; configuration: true } }>>,
  ): Promise<WorkshopRow[]> {
    if (tenants.length === 0) return [];
    const tenantIds = tenants.map((t) => t.id);

    const [branchCounts, staffCounts, workOrderCounts, owners, sessionActivity, auditActivity, recentStatusChanges] = await Promise.all([
      this.prisma.branch.groupBy({ by: ["tenantId"], where: { tenantId: { in: tenantIds }, isActive: true }, _count: true }),
      this.prisma.staffUser.groupBy({ by: ["tenantId"], where: { tenantId: { in: tenantIds }, isActive: true }, _count: true }),
      this.prisma.workOrder.groupBy({
        by: ["tenantId"],
        where: { tenantId: { in: tenantIds }, status: { notIn: [...CLOSED_WORK_ORDER_STATUSES] } },
        _count: true,
      }),
      this.prisma.staffUser.findMany({
        where: { tenantId: { in: tenantIds }, role: "TENANT_OWNER" },
        include: { account: true },
      }),
      this.prisma.session.groupBy({
        by: ["tenantId"],
        where: { tenantId: { in: tenantIds } },
        _max: { createdAt: true },
      }),
      this.prisma.auditLog.groupBy({
        by: ["tenantId"],
        where: { tenantId: { in: tenantIds } },
        _max: { createdAt: true },
      }),
      this.prisma.auditLog.findMany({
        where: {
          tenantId: { in: tenantIds },
          action: { in: ["platform.workshop.frozen"] },
          createdAt: { gt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
        },
        select: { tenantId: true },
      }),
    ]);

    const branchCountByTenant = mapCount(branchCounts);
    const staffCountByTenant = mapCount(staffCounts);
    const workOrderCountByTenant = mapCount(workOrderCounts);
    const ownerByTenant = new Map(owners.map((o) => [o.tenantId, o]));
    const lastSessionByTenant = new Map(sessionActivity.map((s) => [s.tenantId, s._max.createdAt]));
    const lastAuditByTenant = new Map(auditActivity.map((a) => [a.tenantId!, a._max.createdAt]));
    const recentlyFrozenTenantIds = new Set(recentStatusChanges.map((r) => r.tenantId));

    const now = new Date();
    const rows = tenants.map((tenant): WorkshopRow => {
      const owner = ownerByTenant.get(tenant.id) ?? null;
      const lastSession = lastSessionByTenant.get(tenant.id) ?? null;
      const lastAudit = lastAuditByTenant.get(tenant.id) ?? null;
      const lastActivityAt = maxDate(lastSession, lastAudit);

      const { status: healthStatus } = this.health.evaluate(
        {
          ownerLastLoginAt: lastSession, // best available proxy: this tenant's most recent session start
          staffLastActivityAt: lastActivityAt,
          ownerFailedLoginCount: owner?.account.failedLoginCount ?? 0,
          frozenOrSuspendedInLast90Days: recentlyFrozenTenantIds.has(tenant.id),
        },
        now,
      );

      return {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        currency: tenant.currency,
        timezone: tenant.timezone,
        createdAt: tenant.createdAt,
        plan: { id: tenant.plan.id, name: tenant.plan.name, monthlyPrice: tenant.plan.monthlyPrice.toString() },
        owner: owner
          ? { fullName: owner.fullName, email: owner.account.email, invitePending: owner.account.status === "INVITED" }
          : null,
        branchCount: branchCountByTenant.get(tenant.id) ?? 0,
        userCount: staffCountByTenant.get(tenant.id) ?? 0,
        activeWorkOrderCount: workOrderCountByTenant.get(tenant.id) ?? 0,
        lastActivityAt,
        builderStatus: this.builderStatus(tenant.configuration),
        health: healthStatus,
      };
    });

    return rows;
  }

  private builderStatus(configuration: { draftVersion: number; publishedVersion: number } | null): BuilderStatus {
    if (!configuration) return "NOT_CUSTOMIZED";
    if (configuration.draftVersion !== configuration.publishedVersion) return "DRAFT_PENDING";
    return configuration.publishedVersion > 1 ? "CUSTOMIZED" : "NOT_CUSTOMIZED";
  }

  private sortByAggregate(rows: WorkshopRow[], sort: string): WorkshopRow[] {
    const sorted = [...rows];
    switch (sort) {
      case "branch_count_desc":
        return sorted.sort((a, b) => b.branchCount - a.branchCount);
      case "user_count_desc":
        return sorted.sort((a, b) => b.userCount - a.userCount);
      case "last_activity_desc":
      default:
        // Nulls (never any recorded activity) sort last, not first --
        // "no activity yet" is not "most recent activity."
        return sorted.sort((a, b) => {
          if (!a.lastActivityAt && !b.lastActivityAt) return 0;
          if (!a.lastActivityAt) return 1;
          if (!b.lastActivityAt) return -1;
          return b.lastActivityAt.getTime() - a.lastActivityAt.getTime();
        });
    }
  }
}

function mapCount(groups: Array<{ tenantId: string; _count: number }>): Map<string, number> {
  return new Map(groups.map((g) => [g.tenantId, g._count]));
}

function maxDate(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

export type { HealthWarning };
