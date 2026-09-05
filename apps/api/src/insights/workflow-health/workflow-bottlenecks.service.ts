import { Injectable } from "@nestjs/common";
import type { Prisma, WorkOrderStatus } from "@mop/database";
import { PrismaService } from "../../runtime/database/prisma.service";
import { resolveDateRange, type ReportQueryParams } from "../owner-reports/date-range.util";
import {
  averageMsByStatus,
  computeStatusDurations,
  type StatusChangeEvent,
  TERMINAL_STATUSES,
  type WorkOrderMeta,
} from "../owner-reports/lifecycle-duration.util";
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
  readonly taskReworkCount: number;
}

/**
 * Workflow Health -- bottleneck/SLA diagnostics. Attributed by cause and
 * hardened against historical drift: evaluated against range.to rather than
 * mutating live timestamps, with terminal statuses excluded from dwell calculations.
 */
@Injectable()
export class WorkflowBottlenecksService {
  constructor(private readonly prisma: PrismaService) {}

  async build(tenantId: string, params: ReportQueryParams): Promise<BottlenecksReport> {
    const range = resolveDateRange(params);
    const branchFilter = params.branchId ? { branchId: params.branchId } : {};

    const events = await this.prisma.operationEvent.findMany({
      where: {
        tenantId,
        eventKey: "work_order.status_changed",
        createdAt: { gte: range.from, lte: range.to },
        ...branchFilter,
      },
      select: { payload: true, createdAt: true, workOrderId: true, branchId: true },
    });

    let statusEvents: StatusChangeEvent[] = events.map((e) => {
      const payload = e.payload as { workOrderId?: string; from?: string; to?: string };
      return {
        workOrderId: e.workOrderId ?? payload.workOrderId ?? "unknown",
        branchId: e.branchId ?? undefined,
        from: payload.from ?? "UNKNOWN",
        to: payload.to ?? "UNKNOWN",
        at: e.createdAt,
      };
    });

    const workOrderIds = [...new Set(statusEvents.map((e) => e.workOrderId).filter((id) => id !== "unknown"))];
    const workOrders = await this.prisma.workOrder.findMany({
      where: { tenantId, id: { in: workOrderIds }, ...branchFilter },
      select: { id: true, createdAt: true, closedAt: true, status: true, branchId: true },
    });

    if (params.branchId) {
      const allowed = new Set(workOrders.map((w) => w.id));
      statusEvents = statusEvents.filter((e) => allowed.has(e.workOrderId));
    }

    const metaMap = new Map<string, WorkOrderMeta>(
      workOrders.map((wo) => [
        wo.id,
        {
          workOrderId: wo.id,
          createdAt: wo.createdAt,
          closedAt: wo.closedAt,
          initialStatus: "DRAFT",
          branchId: wo.branchId,
          tenantId,
        },
      ]),
    );

    const durations = computeStatusDurations(statusEvents, range.to, metaMap);
    const averages = averageMsByStatus(durations);

    // Exclude terminal statuses (CLOSED, CANCELLED) so completed jobs do not pollute bottlenecks
    const stageDwell: StageDwellRow[] = Object.entries(averages)
      .filter(([status]) => !TERMINAL_STATUSES.includes(status))
      .map(([status, ms]) => ({
        status,
        averageHours: ms / (60 * 60 * 1000),
        cause: WAITING_CAUSE_BY_STATUS[status] ?? "OTHER",
      }))
      .sort((a, b) => b.averageHours - a.averageHours);

    const causeTotals = new Map<WaitingCause, { totalMs: number; workOrders: Set<string> }>();
    for (const d of durations) {
      for (const [status, ms] of Object.entries(d.msByStatus)) {
        if (TERMINAL_STATUSES.includes(status)) continue;
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

    const now = new Date();
    const asOf = range.to.getTime() < now.getTime() ? range.to : now;

    const [slaRisk, reopenedWorkOrders, taskReworkCount] = await Promise.all([
      this.slaRisk(tenantId, asOf, branchFilter),
      this.prisma.workOrder.count({
        where: { tenantId, ...branchFilter, relinkedFromWorkOrderId: { not: null }, createdAt: { gte: range.from, lte: range.to } },
      }),
      this.prisma.task.count({
        where: {
          tenantId,
          status: "RETURNED_FOR_REWORK",
          ...(params.branchId ? { workOrder: { branchId: params.branchId } } : {}),
          updatedAt: { gte: range.from, lte: range.to },
        },
      }),
    ]);

    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      stageDwell,
      waitingCauseBreakdown,
      slaRisk,
      reworkLoops,
      reopenedWorkOrders,
      taskReworkCount,
    };
  }

  /**
   * Evaluates SLA risk against asOf (min(range.to, now)).
   * For historical periods, evaluates against the period end rather than live state.
   */
  private async slaRisk(
    tenantId: string,
    asOf: Date,
    branchFilter: { branchId?: string },
  ): Promise<SlaRiskSummary> {
    const in24h = new Date(asOf.getTime() + 24 * 60 * 60 * 1000);

    // Active/open work orders as of `asOf`: created <= asOf and not closed before asOf
    const baseOpenCondition: Prisma.WorkOrderWhereInput = {
      tenantId,
      ...branchFilter,
      createdAt: { lte: asOf },
      OR: [
        { status: { notIn: ["CLOSED", "CANCELLED"] as WorkOrderStatus[] } },
        { closedAt: { gt: asOf } },
      ],
    };

    const [breached, atRiskWithin24h, onTrack, untracked] = await Promise.all([
      this.prisma.workOrder.count({
        where: { ...baseOpenCondition, promisedAt: { lt: asOf } },
      }),
      this.prisma.workOrder.count({
        where: { ...baseOpenCondition, promisedAt: { gte: asOf, lte: in24h } },
      }),
      this.prisma.workOrder.count({
        where: { ...baseOpenCondition, promisedAt: { gt: in24h } },
      }),
      this.prisma.workOrder.count({
        where: { ...baseOpenCondition, promisedAt: null },
      }),
    ]);

    return { breached, atRiskWithin24h, onTrack, untracked };
  }
}
