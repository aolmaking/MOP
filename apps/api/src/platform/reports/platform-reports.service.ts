import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { WorkshopsService } from "../workshops/workshops.service";
import type { HealthStatus } from "../workshops/workshop-health.service";
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
  readonly usageScore: number;
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

/** Past this many days with no recorded activity, an owner's last login is flagged stale on the page. */
const STALE_OWNER_LOGIN_DAYS = 14;
/** Bounded scan for "staff last activity" -- see the same CANDIDATE_CAP reasoning in WorkshopsService.list(). A real background summary table is Phase 13's eventual job, not this pass's. */
const AUDIT_SCAN_LIMIT = 300;

/**
 * Platform Reports -- Level 1 (aggregated view) and Level 2's Usage
 * Overview section only (`docs/detailed-specs/platform-super-admin.md`
 * names six sections; Feature Usage, Builder Adoption, Operational
 * Activity, Commercial Snapshot, and Health & Risk are deliberately not
 * built this pass, named rather than faked -- see PAGE_INVENTORY.md).
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
  ) {}

  async overview(query: ListWorkshopsQueryDto): Promise<PlatformReportsOverview> {
    const [workshopPage, totals] = await Promise.all([this.workshops.list(query), this.platformTotals()]);
    const customerCounts = await this.customerCountsFor(workshopPage.items.map((w) => w.id));

    const items: WorkshopReportCard[] = workshopPage.items.map((row) => ({
      id: row.id,
      name: row.name,
      health: row.health,
      planName: row.plan.name,
      status: row.status,
      lastActivityAt: row.lastActivityAt?.toISOString() ?? null,
      staffUserCount: row.userCount,
      customerCount: customerCounts.get(row.id) ?? 0,
      usageScore: this.usageScore(row.lastActivityAt),
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

  private async platformTotals(): Promise<PlatformTotals> {
    const [totalWorkshops, activeWorkshops, totalStaffUsers, totalCustomers] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.tenant.count({ where: { status: "ACTIVE" } }),
      this.prisma.staffUser.count({ where: { isActive: true } }),
      this.prisma.customer.count(),
    ]);
    return { totalWorkshops, activeWorkshops, totalStaffUsers, totalCustomers, aggregateMrr: null };
  }

  private async customerCountsFor(tenantIds: readonly string[]): Promise<Map<string, number>> {
    if (tenantIds.length === 0) return new Map();
    const groups = await this.prisma.customer.groupBy({ by: ["tenantId"], where: { tenantId: { in: [...tenantIds] } }, _count: true });
    return new Map(groups.map((g) => [g.tenantId, g._count]));
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
