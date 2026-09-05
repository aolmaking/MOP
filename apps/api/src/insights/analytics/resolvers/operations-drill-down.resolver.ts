import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../runtime/database/prisma.service";
import type { AnalyticsScope } from "../analytics-scope.util";
import type {
  DrillDownQuery,
  DrillDownResult,
  DrillDownRecord,
  DrillDownDimensionBreakdown,
  DrillDownTimelineEvent,
  EvidenceReference,
} from "../drill-down.types";
import type { DrillDownResolver } from "./drill-down-resolver.interface";
import { decodeCursor, paginateRecords, resolvePageLimit } from "../drill-down-pagination.util";
import { computeStatusDurations } from "../../owner-reports/lifecycle-duration.util";

@Injectable()
export class OperationsDrillDownResolver implements DrillDownResolver {
  readonly supportedMetrics = [
    "completedWorkOrders",
    "delayedWorkOrders",
    "waitingTime",
    "bottleneckCount",
  ] as const;

  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    tenantId: string,
    scope: AnalyticsScope,
    query: DrillDownQuery,
    range: { from: Date; to: Date },
  ): Promise<DrillDownResult> {
    const effectiveBranchId = query.branchId ?? (scope.branchIds.length === 1 ? scope.branchIds[0] : undefined);
    const branchFilter = effectiveBranchId ? { branchId: effectiveBranchId } : {};
    const limit = resolvePageLimit(query.limit);
    const cursor = decodeCursor(query.cursor);

    switch (query.metric) {
      case "completedWorkOrders":
        return this.resolveCompletedWorkOrders(tenantId, branchFilter, query, range, limit, cursor);
      case "delayedWorkOrders":
        return this.resolveDelayedWorkOrders(tenantId, branchFilter, query, range, limit, cursor);
      case "waitingTime":
        return this.resolveWaitingTime(tenantId, branchFilter, query, range, limit, cursor);
      case "bottleneckCount":
        return this.resolveBottlenecks(tenantId, branchFilter, query, range, limit, cursor);
      default:
        throw new Error(`Unsupported metric ${query.metric}`);
    }
  }

  // ==========================================================================
  // COMPLETED WORK ORDERS
  // ==========================================================================
  private async resolveCompletedWorkOrders(
    tenantId: string,
    branchFilter: { branchId?: string },
    query: DrillDownQuery,
    range: { from: Date; to: Date },
    limit: number,
    cursor: { occurredAt: string; id: string } | null,
  ): Promise<DrillDownResult> {
    const workOrders = await this.prisma.workOrder.findMany({
      where: {
        tenantId,
        status: "CLOSED",
        closedAt: { gte: range.from, lte: range.to },
        ...branchFilter,
      },
      include: {
        branch: { select: { name: true } },
        asset: { select: { plateNumber: true, category: true } },
        tasks: { select: { id: true, title: true, status: true, serviceKey: true } },
      },
      orderBy: { closedAt: "desc" },
    });

    // Query operation events for work order timeline
    const events = workOrders.length > 0
      ? await this.prisma.operationEvent.findMany({
          where: {
            tenantId,
            workOrderId: { in: workOrders.map((w) => w.id) },
          },
          orderBy: { createdAt: "asc" },
        })
      : [];

    const eventsByWo = new Map<string, typeof events>();
    for (const ev of events) {
      if (!ev.workOrderId) continue;
      const list = eventsByWo.get(ev.workOrderId) ?? [];
      list.push(ev);
      eventsByWo.set(ev.workOrderId, list);
    }

    const rawRecords: DrillDownRecord[] = [];
    const dimensionCounts = new Map<string, number>();

    for (const wo of workOrders) {
      if (!wo.closedAt) continue;

      const dimKey = query.dimension ?? "branch";
      let dimVal = wo.branchId ?? "UNASSIGNED";
      if (dimKey === "service") {
        dimVal = wo.tasks[0]?.serviceKey ?? "GENERAL";
      }

      if (query.dimension && query.dimensionValue && dimVal !== query.dimensionValue) {
        continue;
      }

      dimensionCounts.set(dimVal, (dimensionCounts.get(dimVal) ?? 0) + 1);

      const cycleHours = Math.round(
        (wo.closedAt.getTime() - wo.createdAt.getTime()) / (1000 * 60 * 60) * 10,
      ) / 10;

      const woEvents = eventsByWo.get(wo.id) ?? [];
      const timeline: DrillDownTimelineEvent[] = woEvents.map((e) => ({
        id: e.id,
        eventKey: e.eventKey,
        label: `Status Changed: ${(e.payload as Record<string, unknown>)?.to ?? "UNKNOWN"}`,
        timestamp: e.createdAt.toISOString(),
        actorId: e.actorId,
        actorType: e.actorType,
        payload: e.payload as Record<string, unknown>,
      }));

      const evidenceReferences: EvidenceReference[] = [
        {
          entityType: "WORK_ORDER",
          entityId: wo.id,
          tenantId,
          workOrderId: wo.id,
          occurredAt: wo.closedAt.toISOString(),
          label: `Completed Work Order #${wo.id.slice(-6)}`,
        },
      ];

      rawRecords.push({
        entityType: "WORK_ORDER",
        entityId: wo.id,
        label: `Work Order #${wo.id.slice(-6)} - Closed in ${cycleHours}h`,
        occurredAt: wo.closedAt.toISOString(),
        status: wo.status,
        branchId: wo.branchId,
        branchName: wo.branch?.name,
        workOrderId: wo.id,
        attributes: {
          cycleHours,
          waitingMinutes: 0,
          createdAt: wo.createdAt.toISOString(),
          closedAt: wo.closedAt.toISOString(),
          tasksCount: wo.tasks.length,
          tasksCompletedCount: wo.tasks.filter((t) => t.status === "DONE").length,
          plateNumber: wo.asset?.plateNumber ?? null,
        },
        timeline,
        evidenceReferences,
      });
    }

    const { items, nextCursor } = paginateRecords(rawRecords, limit, cursor);

    return {
      metric: {
        key: "completedWorkOrders",
        label: "Completed Work Orders",
        value: rawRecords.length,
        unit: "jobs",
        period: { from: range.from.toISOString(), to: range.to.toISOString() },
      },
      activeFilters: {
        branchId: query.branchId,
        dimension: query.dimension,
        dimensionValue: query.dimensionValue,
      },
      dimensions: Array.from(dimensionCounts.entries()).map(([val, cnt]) => ({
        key: query.dimension ?? "branch",
        value: val,
        label: val,
        count: cnt,
      })),
      records: items,
      nextCursor,
      integrity: {
        totalMatchingRecords: rawRecords.length,
        returnedRecords: items.length,
        historicalAttributionPreserved: true,
        financialAttributionComputable: false,
      },
    };
  }

  // ==========================================================================
  // DELAYED WORK ORDERS
  // ==========================================================================
  private async resolveDelayedWorkOrders(
    tenantId: string,
    branchFilter: { branchId?: string },
    query: DrillDownQuery,
    range: { from: Date; to: Date },
    limit: number,
    cursor: { occurredAt: string; id: string } | null,
  ): Promise<DrillDownResult> {
    const candidateWorkOrders = await this.prisma.workOrder.findMany({
      where: {
        tenantId,
        createdAt: { lte: range.to },
        OR: [{ closedAt: null }, { closedAt: { gte: range.from } }],
        ...branchFilter,
      },
      include: {
        branch: { select: { name: true } },
        asset: { select: { plateNumber: true } },
        tasks: {
          include: {
            blockers: { select: { id: true, reason: true, createdAt: true, resolvedAt: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const candidateIds = candidateWorkOrders.map((w) => w.id);
    const events = candidateIds.length > 0
      ? await this.prisma.operationEvent.findMany({
          where: {
            tenantId,
            workOrderId: { in: candidateIds },
            eventKey: "work_order.status_changed",
          },
          orderBy: { createdAt: "asc" },
        })
      : [];

    const statusEvents = events.map((e) => {
      const payload = e.payload as { workOrderId?: string; from?: string; to?: string };
      return {
        tenantId,
        branchId: e.branchId ?? undefined,
        workOrderId: e.workOrderId ?? payload.workOrderId ?? "unknown",
        from: payload.from ?? "UNKNOWN",
        to: payload.to ?? "UNKNOWN",
        at: e.createdAt,
      };
    });

    const metaMap = new Map(
      candidateWorkOrders.map((w) => [
        w.id,
        {
          workOrderId: w.id,
          createdAt: w.createdAt,
          closedAt: w.closedAt,
          initialStatus: "DRAFT",
          branchId: w.branchId,
        },
      ]),
    );

    const durationsList = computeStatusDurations(statusEvents, range.to, metaMap);
    const durationsByWo = new Map(durationsList.map((d) => [d.workOrderId, d]));

    const eventsByWo = new Map<string, typeof events>();
    for (const ev of events) {
      if (!ev.workOrderId) continue;
      const list = eventsByWo.get(ev.workOrderId) ?? [];
      list.push(ev);
      eventsByWo.set(ev.workOrderId, list);
    }

    const rawRecords: DrillDownRecord[] = [];
    const dimensionCounts = new Map<string, number>();

    for (const wo of candidateWorkOrders) {
      const woEvents = eventsByWo.get(wo.id) ?? [];
      const durations = durationsByWo.get(wo.id);

      let waitingDwellMs = durations?.waitingMs ?? 0;
      let primaryWaitingStatus = durations?.bottleneckStatus ?? "NONE";

      const totalLifecycleMs = durations?.totalMs ?? Math.max(1, (wo.closedAt ?? range.to).getTime() - wo.createdAt.getTime());
      const waitingShare = totalLifecycleMs > 0 ? waitingDwellMs / totalLifecycleMs : 0;
      const waitingHours = Math.round((waitingDwellMs / (1000 * 60 * 60)) * 10) / 10;

      const allBlockers = wo.tasks.flatMap((t) => t.blockers);
      const isDelayed = (waitingHours >= 24 && waitingShare >= 0.35) || allBlockers.length > 0;

      if (!isDelayed) continue;

      const dimKey = query.dimension ?? "waitingStatus";
      let dimVal = primaryWaitingStatus;
      if (dimKey === "branch") dimVal = wo.branchId ?? "UNASSIGNED";

      if (query.dimension && query.dimensionValue && dimVal !== query.dimensionValue) {
        continue;
      }

      dimensionCounts.set(dimVal, (dimensionCounts.get(dimVal) ?? 0) + 1);

      const timeline: DrillDownTimelineEvent[] = woEvents.map((e) => ({
        id: e.id,
        eventKey: e.eventKey,
        label: `Status Changed: ${(e.payload as Record<string, unknown>)?.to ?? "UNKNOWN"}`,
        timestamp: e.createdAt.toISOString(),
        actorId: e.actorId,
        actorType: e.actorType,
        payload: e.payload as Record<string, unknown>,
      }));

      const evidenceReferences: EvidenceReference[] = [
        {
          entityType: "WORK_ORDER",
          entityId: wo.id,
          tenantId,
          workOrderId: wo.id,
          occurredAt: wo.createdAt.toISOString(),
          label: `Delayed Work Order #${wo.id.slice(-6)} (${waitingHours}h waiting)`,
        },
      ];

      for (const b of allBlockers.slice(0, 3)) {
        evidenceReferences.push({
          entityType: "TASK_BLOCKER",
          entityId: b.id,
          tenantId,
          workOrderId: wo.id,
          occurredAt: b.createdAt.toISOString(),
          relation: "TASK_BLOCKER",
          label: `Blocker: ${b.reason}`,
        });
      }

      rawRecords.push({
        entityType: "WORK_ORDER",
        entityId: wo.id,
        label: `Delayed Work Order #${wo.id.slice(-6)} - ${waitingHours}h waiting`,
        occurredAt: wo.createdAt.toISOString(),
        status: wo.status,
        branchId: wo.branchId,
        branchName: wo.branch?.name,
        workOrderId: wo.id,
        attributes: {
          waitingHours,
          waitingMinutes: Math.round(waitingHours * 60),
          waitingSharePercent: Math.round(waitingShare * 100),
          primaryWaitingStatus,
          bottleneckStatus: primaryWaitingStatus,
          blockerCount: allBlockers.length,
          plateNumber: wo.asset?.plateNumber ?? null,
        },
        timeline,
        evidenceReferences,
      });
    }

    const { items, nextCursor } = paginateRecords(rawRecords, limit, cursor);

    return {
      metric: {
        key: query.metric,
        label: query.metric === "waitingTime" ? "Waiting Time Dwell" : query.metric === "bottleneckCount" ? "Workflow Bottleneck Jobs" : "Delayed Work Orders",
        value: query.metric === "waitingTime" ? rawRecords.reduce((sum, r) => sum + (Number(r.attributes["waitingHours"]) || 0), 0) : rawRecords.length,
        unit: query.metric === "waitingTime" ? "hours" : "jobs",
        period: { from: range.from.toISOString(), to: range.to.toISOString() },
      },
      activeFilters: {
        branchId: query.branchId,
        dimension: query.dimension,
        dimensionValue: query.dimensionValue,
      },
      dimensions: Array.from(dimensionCounts.entries()).map(([val, cnt]) => ({
        key: query.dimension ?? "waitingStatus",
        value: val,
        label: val,
        count: cnt,
      })),
      records: items,
      nextCursor,
      integrity: {
        totalMatchingRecords: rawRecords.length,
        returnedRecords: items.length,
        historicalAttributionPreserved: true,
        financialAttributionComputable: false,
      },
    };
  }

  // ==========================================================================
  // WAITING TIME DWELL
  // ==========================================================================
  private async resolveWaitingTime(
    tenantId: string,
    branchFilter: { branchId?: string },
    query: DrillDownQuery,
    range: { from: Date; to: Date },
    limit: number,
    cursor: { occurredAt: string; id: string } | null,
  ): Promise<DrillDownResult> {
    // Reuses the delayed work order analysis with waiting dwell focus
    return this.resolveDelayedWorkOrders(tenantId, branchFilter, query, range, limit, cursor);
  }

  // ==========================================================================
  // BOTTLENECK COUNT
  // ==========================================================================
  private async resolveBottlenecks(
    tenantId: string,
    branchFilter: { branchId?: string },
    query: DrillDownQuery,
    range: { from: Date; to: Date },
    limit: number,
    cursor: { occurredAt: string; id: string } | null,
  ): Promise<DrillDownResult> {
    // Finds work orders whose longest dwell was in a waiting/bottleneck status
    return this.resolveDelayedWorkOrders(tenantId, branchFilter, query, range, limit, cursor);
  }
}
