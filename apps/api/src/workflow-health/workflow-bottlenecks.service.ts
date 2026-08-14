import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { resolveDateRange, type ReportQueryParams } from "../reports/date-range.util";
import { averageMsByStatus, computeStatusDurations, type StatusChangeEvent } from "../reports/lifecycle-duration.util";
import { detectStatusLoops } from "./loop-detection.util";

export type WaitingCause = "PEOPLE" | "INVENTORY" | "APPROVAL" | "PAYMENT" | "QUALITY" | "OTHER";

/**
 * Which real-world cause a status's dwell time represents -- fixed by
 * what the status itself means in the lifecycle graph (packages/shared's
 * WORK_ORDER_GRAPH), not a guess. A status with no obvious single cause
 * (DRAFT, REGISTERED, UNDER_INSPECTION, CLOSED, CANCELLED) is OTHER
 * rather than forced into one of the five real buckets.
 */
const WAITING_CAUSE_BY_STATUS: Readonly<Record<string, WaitingCause>> = {
  WAITING_PARTS: "INVENTORY",
  WAITING_CUSTOMER: "APPROVAL",
  AWAITING_CUSTOMER_APPROVAL: "APPROVAL",
  BLOCKED: "PEOPLE",
  READY_FOR_TEAM_REVIEW: "PEOPLE",
  READY_FOR_QC: "QUALITY",
  QC_FAILED: "QUALITY",
  PAYMENT_PENDING: "PAYMENT",
};

export interface WaitingCauseRow {
  readonly cause: WaitingCause;
  readonly totalHours: number;
  readonly workOrderCount: number;
}

export interface StageDwellRow {
  readonly status: string;
  readonly averageHours: number;
  readonly cause: WaitingCause;
}

export interface SlaRiskSummary {
  readonly breached: number;
  readonly atRiskWithin24h: number;
  readonly onTrack: number;
  /** Work orders with no promisedAt at all -- SLA risk is simply not tracked for them. */
  readonly untracked: number;
}

export interface ReworkLoopRow {
  readonly status: string;
  readonly workOrderCount: number;
  readonly totalReentries: number;
}

export interface BottlenecksReport {
  readonly range: { from: string; to: string };
  readonly stageDwell: readonly StageDwellRow[];
  readonly waitingCauseBreakdown: readonly WaitingCauseRow[];
  readonly slaRisk: SlaRiskSummary;
  readonly reworkLoops: readonly ReworkLoopRow[];
  readonly reopenedWorkOrders: number;
}

/**
 * Workflow Health -- bottleneck/SLA diagnostics. Deliberately does not
 * duplicate Reports & Analytics' Operations tab (branch/technician
 * comparison already live there) -- this is the deeper, cause-attributed
 * view: not just "how long," but "waiting on what." Built on the same
 * reusable primitives (lifecycle-duration.util.ts) rather than a second
 * status-duration implementation.
 */
@Injectable()
export class WorkflowBottlenecksService {
  constructor(private readonly prisma: PrismaService) {}

  async build(tenantId: string, params: ReportQueryParams): Promise<BottlenecksReport> {
    const range = resolveDateRange(params);

    const events = await this.prisma.operationEvent.findMany({
      where: { tenantId, eventKey: "work_order.status_changed", createdAt: { gte: range.from, lte: range.to } },
      select: { payload: true, createdAt: true },
    });
    const statusEvents: StatusChangeEvent[] = events.map((e) => {
      const payload = e.payload as { workOrderId?: string; from?: string; to?: string };
      return {
        workOrderId: payload.workOrderId ?? "unknown",
        from: payload.from ?? "UNKNOWN",
        to: payload.to ?? "UNKNOWN",
        at: e.createdAt,
      };
    });

    const durations = computeStatusDurations(statusEvents, range.to);
    const averages = averageMsByStatus(durations);

    const stageDwell: StageDwellRow[] = Object.entries(averages)
      .map(([status, ms]) => ({
        status,
        averageHours: ms / (60 * 60 * 1000),
        cause: WAITING_CAUSE_BY_STATUS[status] ?? "OTHER",
      }))
      .sort((a, b) => b.averageHours - a.averageHours);

    const causeTotals = new Map<WaitingCause, { totalMs: number; workOrders: Set<string> }>();
    for (const d of durations) {
      for (const [status, ms] of Object.entries(d.msByStatus)) {
        const cause = WAITING_CAUSE_BY_STATUS[status];
        if (!cause) continue;
        const entry = causeTotals.get(cause) ?? { totalMs: 0, workOrders: new Set<string>() };
        entry.totalMs += ms;
        entry.workOrders.add(d.workOrderId);
        causeTotals.set(cause, entry);
      }
    }
    const waitingCauseBreakdown: WaitingCauseRow[] = [...causeTotals.entries()]
      .map(([cause, { totalMs, workOrders }]) => ({
        cause,
        totalHours: totalMs / (60 * 60 * 1000),
        workOrderCount: workOrders.size,
      }))
      .sort((a, b) => b.totalHours - a.totalHours);

    const loops = detectStatusLoops(statusEvents);
    const loopsByStatus = new Map<string, { workOrders: Set<string>; totalReentries: number }>();
    for (const loop of loops) {
      const entry = loopsByStatus.get(loop.reenteredStatus) ?? { workOrders: new Set<string>(), totalReentries: 0 };
      entry.workOrders.add(loop.workOrderId);
      entry.totalReentries += loop.count;
      loopsByStatus.set(loop.reenteredStatus, entry);
    }
    const reworkLoops: ReworkLoopRow[] = [...loopsByStatus.entries()]
      .map(([status, { workOrders, totalReentries }]) => ({
        status,
        workOrderCount: workOrders.size,
        totalReentries,
      }))
      .sort((a, b) => b.workOrderCount - a.workOrderCount);

    const [slaRisk, reopenedWorkOrders] = await Promise.all([
      this.slaRisk(tenantId),
      this.prisma.workOrder.count({
        where: { tenantId, relinkedFromWorkOrderId: { not: null }, createdAt: { gte: range.from, lte: range.to } },
      }),
    ]);

    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      stageDwell,
      waitingCauseBreakdown,
      slaRisk,
      reworkLoops,
      reopenedWorkOrders,
    };
  }

  /**
   * Current snapshot (not date-ranged) of every non-terminal work order
   * against its own `promisedAt` -- "breached" already passed it,
   * "at risk" is within the next 24 hours, "on track" has more runway,
   * "untracked" never had a promise made at all.
   */
  private async slaRisk(tenantId: string): Promise<SlaRiskSummary> {
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const [breached, atRiskWithin24h, onTrack, untracked] = await Promise.all([
      this.prisma.workOrder.count({
        where: { tenantId, status: { notIn: ["CLOSED", "CANCELLED"] }, promisedAt: { lt: now } },
      }),
      this.prisma.workOrder.count({
        where: { tenantId, status: { notIn: ["CLOSED", "CANCELLED"] }, promisedAt: { gte: now, lte: in24h } },
      }),
      this.prisma.workOrder.count({
        where: { tenantId, status: { notIn: ["CLOSED", "CANCELLED"] }, promisedAt: { gt: in24h } },
      }),
      this.prisma.workOrder.count({
        where: { tenantId, status: { notIn: ["CLOSED", "CANCELLED"] }, promisedAt: null },
      }),
    ]);

    return { breached, atRiskWithin24h, onTrack, untracked };
  }
}
