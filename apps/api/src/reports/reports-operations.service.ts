import { Injectable } from "@nestjs/common";
import { Prisma } from "@mop/database";
import { PrismaService } from "../runtime/database/prisma.service";
import {
  resolveDateRange,
  resolveGranularity,
  safeDivide,
  type ReportGranularity,
  type ReportQueryParams,
} from "./date-range.util";
import { averageMsByStatus, computeStatusDurations, TERMINAL_STATUSES } from "./lifecycle-duration.util";

export interface StatusDistributionRow {
  readonly status: string;
  readonly count: number;
}

export interface AverageTimeInStatusRow {
  readonly status: string;
  readonly averageHours: number;
}

export interface BranchOperationsRow {
  readonly branchId: string;
  readonly branchName: string;
  readonly workOrdersCreated: number;
  readonly workOrdersClosed: number;
  readonly averageCompletionHours: number | null;
}

export interface TechnicianWorkloadRow {
  readonly staffUserId: string;
  readonly fullName: string;
  readonly tasksCompleted: number;
  readonly activeTasks: number;
  readonly reworkCount: number;
  /** Rework as a share of everything this technician completed or reworked -- null when they have done nothing yet. */
  readonly reworkRate: number | null;
}

/** One bucket of the volume series -- how many vehicles came in and went out. */
export interface VolumePoint {
  readonly bucket: string;
  readonly created: number;
  readonly closed: number;
}

export interface OperationsReport {
  readonly range: { from: string; to: string };
  /**
   * Vehicles in and out over time, bucketed by the caller's granularity
   * (day by default, week or month via `groupBy`).
   *
   * The Owner's most basic operational question -- "how many cars did we
   * do today, and this month" -- had no answer anywhere in Reports: the
   * page could show a status snapshot and a financial trend, but nothing
   * counted throughput over time, so a workshop could not tell a busy
   * week from a quiet one.
   */
  readonly volume: readonly VolumePoint[];
  /** Totals for the whole selected range, so the headline needs no client-side summing. */
  readonly volumeTotals: { created: number; closed: number };
  /**
   * The bucketing actually used. Stated by the server rather than assumed
   * by the client, because an unrecognised `groupBy` falls back to day --
   * a chart that labelled those buckets as months would be reporting a
   * granularity the figures do not have.
   */
  readonly granularity: ReportGranularity;
  readonly statusDistribution: readonly StatusDistributionRow[];
  readonly averageTimeInStatus: readonly AverageTimeInStatusRow[];
  readonly branchComparison: readonly BranchOperationsRow[];
  readonly technicianWorkload: readonly TechnicianWorkloadRow[];
  readonly delayedJobs: number;
  readonly reopenedJobs: number;
  readonly cancelledJobs: number;
  readonly cancellationRate: number;
}

/**
 * Operations -- workload, throughput, cycle time, and where jobs
 * actually get stuck. `averageTimeInStatus` is the one metric here that
 * genuinely needs history rather than a snapshot (see
 * lifecycle-duration.util.ts): a work order sitting in WAITING_PARTS
 * right now says nothing about how long jobs *typically* wait there,
 * which is the operationally useful question.
 */
@Injectable()
export class ReportsOperationsService {
  constructor(private readonly prisma: PrismaService) {}

  async build(tenantId: string, params: ReportQueryParams): Promise<OperationsReport> {
    const range = resolveDateRange(params);
    const granularity = resolveGranularity(params.groupBy);
    const branchFilter = params.branchId ? { branchId: params.branchId } : {};

    const [
      statusDistribution,
      averageTimeInStatus,
      branchComparison,
      technicianWorkload,
      delayedJobs,
      reopenedJobs,
      cancelledJobs,
      totalInRange,
      volume,
    ] = await Promise.all([
      this.statusDistribution(tenantId, branchFilter),
      this.averageTimeInStatus(tenantId, range, params.branchId),
      this.branchComparison(tenantId, range),
      this.technicianWorkload(tenantId, range),
      this.delayedJobsCount(tenantId, branchFilter),
      this.reopenedJobsCount(tenantId, range),
      this.prisma.workOrder.count({
        where: { tenantId, ...branchFilter, status: "CANCELLED", updatedAt: { gte: range.from, lte: range.to } },
      }),
      this.prisma.workOrder.count({ where: { tenantId, ...branchFilter, createdAt: { gte: range.from, lte: range.to } } }),
      this.volume(tenantId, range, granularity, params.branchId),
    ]);

    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      statusDistribution,
      averageTimeInStatus,
      branchComparison,
      technicianWorkload,
      delayedJobs,
      reopenedJobs,
      cancelledJobs,
      cancellationRate: safeDivide(cancelledJobs, totalInRange) * 100,
      volume,
      granularity,
      volumeTotals: volume.reduce(
        (acc, p) => ({ created: acc.created + p.created, closed: acc.closed + p.closed }),
        { created: 0, closed: 0 },
      ),
    };
  }

  /**
   * Created vs closed per bucket.
   *
   * Bucketed in the database rather than in JS for the same reason the
   * financial trend is: date_trunc stays correct across timezones and at
   * real data volume, where pulling every row back to count them does
   * not. Two queries rather than one because a work order created in one
   * bucket and closed in another belongs to both series, and a single
   * grouped query would have to pick one.
   */
  private async volume(
    tenantId: string,
    range: { from: Date; to: Date },
    granularity: "day" | "week" | "month",
    branchId: string | undefined,
  ): Promise<VolumePoint[]> {
    const createdRows = await this.prisma.$queryRaw<{ bucket: Date; count: bigint }[]>(Prisma.sql`
      SELECT date_trunc(${granularity}, w."createdAt") AS bucket, COUNT(*) AS count
      FROM "work_orders" w
      WHERE w."tenantId" = ${tenantId}
        AND w."createdAt" >= ${range.from} AND w."createdAt" <= ${range.to}
        ${branchId ? Prisma.sql`AND w."branchId" = ${branchId}` : Prisma.empty}
      GROUP BY bucket
      ORDER BY bucket ASC
    `);

    const closedRows = await this.prisma.$queryRaw<{ bucket: Date; count: bigint }[]>(Prisma.sql`
      SELECT date_trunc(${granularity}, w."closedAt") AS bucket, COUNT(*) AS count
      FROM "work_orders" w
      WHERE w."tenantId" = ${tenantId} AND w."closedAt" IS NOT NULL
        AND w."closedAt" >= ${range.from} AND w."closedAt" <= ${range.to}
        ${branchId ? Prisma.sql`AND w."branchId" = ${branchId}` : Prisma.empty}
      GROUP BY bucket
      ORDER BY bucket ASC
    `);

    const byBucket = new Map<string, { created: number; closed: number }>();
    for (const row of createdRows) {
      const key = row.bucket.toISOString();
      byBucket.set(key, { created: Number(row.count), closed: byBucket.get(key)?.closed ?? 0 });
    }
    for (const row of closedRows) {
      const key = row.bucket.toISOString();
      byBucket.set(key, { created: byBucket.get(key)?.created ?? 0, closed: Number(row.count) });
    }

    return [...byBucket.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([bucket, v]) => ({ bucket, ...v }));
  }

  private async statusDistribution(tenantId: string, branchFilter: object): Promise<StatusDistributionRow[]> {
    const grouped = await this.prisma.workOrder.groupBy({
      by: ["status"],
      where: { tenantId, ...branchFilter },
      _count: { _all: true },
    });
    return grouped.map((row) => ({ status: row.status, count: row._count._all })).sort((a, b) => b.count - a.count);
  }

  private async averageTimeInStatus(
    tenantId: string,
    range: { from: Date; to: Date },
    branchId: string | undefined,
  ): Promise<AverageTimeInStatusRow[]> {
    // OperationEvent has no targetId column -- the work order id lives
    // inside `payload.workOrderId` (see work-order-lifecycle.service.ts's
    // emit call), so branch scoping has to join back through that id
    // rather than filtering the query itself.
    const events = await this.prisma.operationEvent.findMany({
      where: {
        tenantId,
        eventKey: "work_order.status_changed",
        createdAt: { gte: range.from, lte: range.to },
      },
      select: { payload: true, createdAt: true },
    });

    let statusEvents = events.map((e) => this.toStatusChangeEvent(e));

    if (branchId) {
      const workOrderIds = [...new Set(statusEvents.map((e) => e.workOrderId))];
      const inBranch = await this.prisma.workOrder.findMany({
        where: { tenantId, branchId, id: { in: workOrderIds } },
        select: { id: true },
      });
      const allowed = new Set(inBranch.map((w) => w.id));
      statusEvents = statusEvents.filter((e) => allowed.has(e.workOrderId));
    }

    const durations = computeStatusDurations(statusEvents, range.to);
    const averages = averageMsByStatus(durations);

    return Object.entries(averages)
      // Terminal states are excluded: their slice measures time since the
      // job finished, which grows with the report range rather than
      // saying anything about how the workshop runs.
      .filter(([status]) => !TERMINAL_STATUSES.includes(status))
      .map(([status, ms]) => ({ status, averageHours: ms / (60 * 60 * 1000) }))
      .sort((a, b) => b.averageHours - a.averageHours);
  }

  private toStatusChangeEvent(event: { payload: unknown; createdAt: Date }) {
    const payload = event.payload as { workOrderId?: string; from?: string; to?: string };
    return {
      workOrderId: payload.workOrderId ?? "unknown",
      from: payload.from ?? "UNKNOWN",
      to: payload.to ?? "UNKNOWN",
      at: event.createdAt,
    };
  }

  private async branchComparison(tenantId: string, range: { from: Date; to: Date }): Promise<BranchOperationsRow[]> {
    const branches = await this.prisma.branch.findMany({ where: { tenantId }, select: { id: true, name: true } });

    return Promise.all(
      branches.map(async (branch) => {
        const [created, closed] = await Promise.all([
          this.prisma.workOrder.count({
            where: { tenantId, branchId: branch.id, createdAt: { gte: range.from, lte: range.to } },
          }),
          this.prisma.workOrder.findMany({
            where: { tenantId, branchId: branch.id, status: "CLOSED", closedAt: { gte: range.from, lte: range.to } },
            select: { createdAt: true, closedAt: true },
          }),
        ]);

        const averageCompletionHours =
          closed.length === 0
            ? null
            : closed.reduce((sum, wo) => sum + (wo.closedAt!.getTime() - wo.createdAt.getTime()) / (60 * 60 * 1000), 0) /
              closed.length;

        return {
          branchId: branch.id,
          branchName: branch.name,
          workOrdersCreated: created,
          workOrdersClosed: closed.length,
          averageCompletionHours,
        };
      }),
    );
  }

  private async technicianWorkload(tenantId: string, range: { from: Date; to: Date }): Promise<TechnicianWorkloadRow[]> {
    const technicians = await this.prisma.staffUser.findMany({
      where: { tenantId, role: "TECHNICIAN" },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    });

    return Promise.all(
      technicians.map(async (person) => {
        const [tasksCompleted, activeTasks, reworkCount] = await Promise.all([
          this.prisma.taskAssignment.count({
            where: {
              tenantId,
              staffUserId: person.id,
              task: { status: "DONE" },
              assignedAt: { gte: range.from, lte: range.to },
            },
          }),
          this.prisma.taskAssignment.count({
            where: { tenantId, staffUserId: person.id, unassignedAt: null, task: { status: "IN_PROGRESS" } },
          }),
          this.prisma.taskAssignment.count({
            where: {
              tenantId,
              staffUserId: person.id,
              task: { status: "RETURNED_FOR_REWORK" },
              assignedAt: { gte: range.from, lte: range.to },
            },
          }),
        ]);

        const denominator = tasksCompleted + reworkCount;
        return {
          staffUserId: person.id,
          fullName: person.fullName,
          tasksCompleted,
          activeTasks,
          reworkCount,
          reworkRate: denominator === 0 ? null : (reworkCount / denominator) * 100,
        };
      }),
    );
  }

  /** Non-terminal work orders past their own promised time -- the SLA clock the Attention Center already uses. */
  private async delayedJobsCount(tenantId: string, branchFilter: object): Promise<number> {
    return this.prisma.workOrder.count({
      where: {
        tenantId,
        ...branchFilter,
        status: { notIn: ["CLOSED", "CANCELLED"] },
        promisedAt: { lt: new Date() },
      },
    });
  }

  /**
   * `relinkedFromWorkOrderId` is how this codebase already models "this
   * work order continues one that was closed" (see schema comment on
   * WorkOrder) -- a reopened job is exactly one whose relink target
   * closed and was then relinked, within this range.
   */
  private async reopenedJobsCount(tenantId: string, range: { from: Date; to: Date }): Promise<number> {
    return this.prisma.workOrder.count({
      where: { tenantId, relinkedFromWorkOrderId: { not: null }, createdAt: { gte: range.from, lte: range.to } },
    });
  }
}
