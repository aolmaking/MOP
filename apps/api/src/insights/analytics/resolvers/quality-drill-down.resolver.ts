import { Injectable, ForbiddenException } from "@nestjs/common";
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
import { QcFailureReason, TaskReworkReason } from "@mop/database";

const MIN_SAMPLE_SIZE = 5;

@Injectable()
export class QualityDrillDownResolver implements DrillDownResolver {
  readonly supportedMetrics = [
    "qcEvaluations",
    "firstPassYield",
    "qcFailures",
    "taskReworkRate",
    "repeatVehicleVisits",
    "faultRecurrence",
  ] as const;

  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    tenantId: string,
    scope: AnalyticsScope,
    query: DrillDownQuery,
    range: { from: Date; to: Date },
  ): Promise<DrillDownResult> {
    const effectiveBranchId = query.branchId ?? (scope.branchIds.length === 1 ? scope.branchIds[0] : undefined);
    const limit = resolvePageLimit(query.limit);
    const cursor = decodeCursor(query.cursor);

    switch (query.metric) {
      case "firstPassYield":
      case "qcEvaluations":
      case "qcFailures":
        return this.resolveQcMetrics(tenantId, effectiveBranchId, query, range, limit, cursor);
      case "taskReworkRate":
        return this.resolveTaskRework(tenantId, effectiveBranchId, query, range, limit, cursor);
      case "repeatVehicleVisits":
        return this.resolveRepeatVisits(tenantId, effectiveBranchId, query, range, limit, cursor);
      case "faultRecurrence":
        return this.resolveFaultRecurrence(tenantId, effectiveBranchId, query, range, limit, cursor);
      default:
        throw new Error(`Unsupported metric ${query.metric}`);
    }
  }

  // ==========================================================================
  // QC EVALUATIONS, FIRST PASS YIELD & QC FAILURES
  // ==========================================================================
  private async resolveQcMetrics(
    tenantId: string,
    branchId: string | undefined,
    query: DrillDownQuery,
    range: { from: Date; to: Date },
    limit: number,
    cursor: { occurredAt: string; id: string } | null,
  ): Promise<DrillDownResult> {
    const branchFilter = branchId ? { branchId } : {};

    // Load branches for display names
    const branches = await this.prisma.branch.findMany({
      where: { tenantId },
      select: { id: true, name: true },
    });
    const branchNameMap = new Map<string, string>(branches.map((b) => [b.id, b.name]));

    // Query immutable operation events up to range.to to discover earliest evaluation
    const allQcEvents = await this.prisma.operationEvent.findMany({
      where: {
        tenantId,
        eventKey: "work_order.status_changed",
        createdAt: { lte: range.to },
        ...branchFilter,
      },
      select: {
        id: true,
        workOrderId: true,
        branchId: true,
        createdAt: true,
        actorId: true,
        actorType: true,
        payload: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const isQcEvaluation = (e: (typeof allQcEvents)[0]) => {
      const p = e.payload as Record<string, unknown> | null;
      if (!p) return false;
      const intent = p.intent as string | undefined;
      const from = p.from as string | undefined;
      return (
        intent === "QC_PASSED" ||
        intent === "QC_FAILED" ||
        (from === "READY_FOR_QC" && (p.to === "QC_FAILED" || p.to === "PAYMENT_PENDING" || p.to === "READY_FOR_DELIVERY"))
      );
    };

    const isQcPass = (e: (typeof allQcEvents)[0]) => {
      const p = e.payload as Record<string, unknown> | null;
      if (!p) return false;
      const intent = p.intent as string | undefined;
      const to = p.to as string | undefined;
      return intent === "QC_PASSED" || to === "PAYMENT_PENDING" || to === "READY_FOR_DELIVERY";
    };

    const qcEvents = allQcEvents.filter(isQcEvaluation);

    // Group by work order
    const qcByWo = new Map<string, (typeof qcEvents)[0][]>();
    for (const ev of qcEvents) {
      if (!ev.workOrderId) continue;
      const list = qcByWo.get(ev.workOrderId) ?? [];
      list.push(ev);
      qcByWo.set(ev.workOrderId, list);
    }

    // Identify first pass evaluations falling in [range.from, range.to]
    const matchingWoIds: string[] = [];
    const firstPassEventByWo = new Map<string, (typeof qcEvents)[0]>();
    const isPassByWo = new Map<string, boolean>();

    for (const [woId, events] of qcByWo.entries()) {
      const firstEv = events[0]!;
      if (firstEv.createdAt >= range.from && firstEv.createdAt <= range.to) {
        firstPassEventByWo.set(woId, firstEv);
        const passed = isQcPass(firstEv);
        isPassByWo.set(woId, passed);

        if (query.metric === "qcEvaluations") {
          matchingWoIds.push(woId);
        } else if (query.metric === "firstPassYield") {
          matchingWoIds.push(woId);
        } else if (query.metric === "qcFailures") {
          if (!passed) {
            matchingWoIds.push(woId);
          }
        }
      }
    }

    // Load work orders for matching IDs
    const workOrders = matchingWoIds.length > 0
      ? await this.prisma.workOrder.findMany({
          where: { id: { in: matchingWoIds } },
          select: {
            id: true,
            status: true,
            branchId: true,
            qcFailureReason: true,
            createdAt: true,
            asset: { select: { category: true, plateNumber: true } },
            tasks: { select: { id: true, title: true, serviceKey: true } },
          },
        })
      : [];

    const woMap = new Map(workOrders.map((w) => [w.id, w]));

    // Construct raw records
    const rawRecords: DrillDownRecord[] = [];
    const dimensionCounts = new Map<string, number>();

    for (const woId of matchingWoIds) {
      const wo = woMap.get(woId);
      const ev = firstPassEventByWo.get(woId)!;
      const passed = isPassByWo.get(woId)!;

      const p = ev.payload as Record<string, unknown> | null;
      const reason = (wo?.qcFailureReason ?? p?.failureReason ?? "UNCLASSIFIED") as string;
      const note = (p?.reason ?? p?.note) as string | undefined;

      // Apply query dimension filtering if requested
      if (query.dimension && query.dimensionValue) {
        if (query.dimension === "branch" && ev.branchId !== query.dimensionValue) continue;
        if (query.dimension === "result" && (passed ? "PASSED" : "FAILED") !== query.dimensionValue) continue;
        if (query.dimension === "reason" && reason !== query.dimensionValue) continue;
      }

      // Track dimension counts
      const dimKey = query.dimension ?? "result";
      let dimVal = passed ? "PASSED" : "FAILED";
      if (dimKey === "branch") dimVal = ev.branchId ?? "UNASSIGNED";
      if (dimKey === "reason") dimVal = reason;
      dimensionCounts.set(dimVal, (dimensionCounts.get(dimVal) ?? 0) + 1);

      // Build timeline events for this work order
      const woTimeline: DrillDownTimelineEvent[] = (qcByWo.get(woId) ?? []).map((e) => {
        const isP = isQcPass(e);
        return {
          id: e.id,
          eventKey: "work_order.status_changed",
          label: `QC Evaluation: ${isP ? "PASSED" : "FAILED"}`,
          timestamp: e.createdAt.toISOString(),
          actorId: e.actorId,
          actorType: e.actorType,
          payload: e.payload as Record<string, unknown>,
        };
      });

      const evidenceReferences: EvidenceReference[] = [
        {
          entityType: "OPERATION_EVENT",
          entityId: ev.id,
          tenantId,
          workOrderId: woId,
          occurredAt: ev.createdAt.toISOString(),
          relation: "FIRST_PASS_QC_EVENT",
          label: `First Pass QC Evaluation: ${passed ? "PASSED" : "FAILED"}`,
        },
        {
          entityType: "WORK_ORDER",
          entityId: woId,
          tenantId,
          occurredAt: wo ? wo.createdAt.toISOString() : ev.createdAt.toISOString(),
          label: `Work Order #${woId.slice(-6)}`,
        },
      ];

      rawRecords.push({
        entityType: "WORK_ORDER",
        entityId: woId,
        label: `Work Order #${woId.slice(-6)} - First Pass: ${passed ? "PASSED" : "FAILED"}`,
        occurredAt: ev.createdAt.toISOString(),
        status: wo?.status ?? "CLOSED",
        branchId: ev.branchId ?? wo?.branchId,
        branchName: ev.branchId ? branchNameMap.get(ev.branchId) : undefined,
        workOrderId: woId,
        attributes: {
          qcPassed: passed,
          firstPassResult: passed ? "PASSED" : "FAILED",
          qcFailureReason: passed ? null : reason,
          qcNote: note ?? null,
          totalQcEvaluationsOnJob: qcByWo.get(woId)?.length ?? 1,
          plateNumber: wo?.asset?.plateNumber ?? null,
          services: wo?.tasks.map((t) => t.title) ?? [],
        },
        timeline: woTimeline,
        evidenceReferences,
      });
    }

    // Paginate
    const { items, nextCursor } = paginateRecords(rawRecords, limit, cursor);

    // Calculate summary metric value
    let metricValue: number | null = null;
    let label = "First Pass Yield";
    let unit = "percent";

    if (query.metric === "qcEvaluations") {
      metricValue = matchingWoIds.length;
      label = "First Pass QC Evaluations";
      unit = "evaluations";
    } else if (query.metric === "firstPassYield") {
      const passedCount = Array.from(isPassByWo.values()).filter(Boolean).length;
      metricValue = matchingWoIds.length > 0 ? Math.round((passedCount / matchingWoIds.length) * 1000) / 10 : null;
      label = "First Pass Yield";
      unit = "percent";
    } else if (query.metric === "qcFailures") {
      metricValue = matchingWoIds.length;
      label = "QC Failures";
      unit = "failures";
    }

    const dimensions: DrillDownDimensionBreakdown[] = Array.from(dimensionCounts.entries()).map(([val, cnt]) => ({
      key: query.dimension ?? "result",
      value: val,
      label: val,
      count: cnt,
    }));

    return {
      metric: {
        key: query.metric,
        label,
        value: metricValue,
        unit,
        period: { from: range.from.toISOString(), to: range.to.toISOString() },
      },
      activeFilters: {
        branchId: query.branchId,
        serviceKey: query.serviceKey,
        technicianId: query.technicianId,
        workOrderId: query.workOrderId,
        dimension: query.dimension,
        dimensionValue: query.dimensionValue,
      },
      dimensions,
      records: items,
      nextCursor,
      integrity: {
        totalMatchingRecords: rawRecords.length,
        returnedRecords: items.length,
        historicalAttributionPreserved: true,
        financialAttributionComputable: false,
        financialAttributionNote: "QC evaluations represent operational quality events; monetary scrap costs are not tracked.",
      },
    };
  }

  // ==========================================================================
  // TASK REWORK
  // ==========================================================================
  private async resolveTaskRework(
    tenantId: string,
    branchId: string | undefined,
    query: DrillDownQuery,
    range: { from: Date; to: Date },
    limit: number,
    cursor: { occurredAt: string; id: string } | null,
  ): Promise<DrillDownResult> {
    const branchFilter = branchId ? { workOrder: { branchId } } : {};

    // Completed tasks in window
    const completedTasks = await this.prisma.task.findMany({
      where: {
        tenantId,
        status: "DONE",
        completedAt: { gte: range.from, lte: range.to },
        ...branchFilter,
      },
      select: { id: true },
    });

    // Rework tasks in window
    const reworkTasks = await this.prisma.task.findMany({
      where: {
        tenantId,
        createdAt: { gte: range.from, lte: range.to },
        OR: [{ originalTaskId: { not: null } }, { reworkReason: { not: null } }, { status: "RETURNED_FOR_REWORK" }],
        ...branchFilter,
      },
      include: {
        workOrder: { select: { id: true, branchId: true, status: true, asset: { select: { plateNumber: true } } } },
        originalTask: { select: { id: true, title: true, status: true, completedAt: true } },
        assignments: {
          select: {
            staffUserId: true,
            assignedAt: true,
            unassignedAt: true,
            staffUser: { select: { fullName: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Filter by technician if requested
    let filteredTasks = reworkTasks;
    let sampleSizeProtected = false;
    if (query.technicianId) {
      const techCompleted = await this.prisma.taskAssignment.count({
        where: {
          tenantId,
          staffUserId: query.technicianId,
          task: { status: "DONE", completedAt: { gte: range.from, lte: range.to } },
        },
      });
      if (techCompleted < MIN_SAMPLE_SIZE) {
        sampleSizeProtected = true;
      }
      filteredTasks = reworkTasks.filter((t) =>
        t.assignments.some((a) => a.staffUserId === query.technicianId),
      );
    }

    if (query.serviceKey) {
      filteredTasks = filteredTasks.filter((t) => t.serviceKey === query.serviceKey);
    }

    // Dimension breakdown
    const dimensionCounts = new Map<string, number>();
    const rawRecords: DrillDownRecord[] = [];

    for (const task of filteredTasks) {
      const reason = (task.reworkReason ?? "UNCLASSIFIED") as string;
      const dimKey = query.dimension ?? "reason";
      let dimVal = reason;
      if (dimKey === "branch") dimVal = task.workOrder.branchId ?? "UNASSIGNED";
      if (dimKey === "service") dimVal = task.serviceKey ?? "GENERAL";
      if (dimKey === "technician") {
        const assigned = task.assignments[0]?.staffUser?.fullName ?? "UNASSIGNED";
        dimVal = assigned;
      }

      if (query.dimension && query.dimensionValue && dimVal !== query.dimensionValue) {
        continue;
      }

      dimensionCounts.set(dimVal, (dimensionCounts.get(dimVal) ?? 0) + 1);

      const evidenceReferences: EvidenceReference[] = [
        {
          entityType: "TASK",
          entityId: task.id,
          tenantId,
          workOrderId: task.workOrderId,
          taskId: task.id,
          occurredAt: task.createdAt.toISOString(),
          label: `Rework Task: ${task.title}`,
        },
        {
          entityType: "WORK_ORDER",
          entityId: task.workOrderId,
          tenantId,
          workOrderId: task.workOrderId,
          label: `Work Order #${task.workOrderId.slice(-6)}`,
        },
      ];

      // Structural parent lineage is an OBSERVED_FACT, not a causal claim
      if (task.originalTaskId && task.originalTask) {
        evidenceReferences.push({
          entityType: "TASK",
          entityId: task.originalTaskId,
          tenantId,
          workOrderId: task.workOrderId,
          taskId: task.originalTaskId,
          occurredAt: task.originalTask.completedAt?.toISOString(),
          relation: "REWORK_PARENT_LINEAGE",
          label: `Original Parent Task: ${task.originalTask.title}`,
        });
      }

      rawRecords.push({
        entityType: "TASK",
        entityId: task.id,
        label: `Rework Task: ${task.title}`,
        occurredAt: task.createdAt.toISOString(),
        status: task.status,
        branchId: task.workOrder.branchId,
        workOrderId: task.workOrderId,
        taskId: task.id,
        attributes: {
          isRework: true,
          reworkReason: reason,
          reworkNote: task.reworkNote ?? null,
          actualMinutes: task.actualMinutes,
          originalTaskId: task.originalTaskId,
          originalTaskTitle: task.originalTask?.title ?? null,
          // CRITICAL: Lineage is an observed fact, not proof of cause
          lineageClassification: task.originalTaskId ? "OBSERVED_FACT" : null,
          technicians: task.assignments.map((a) => a.staffUser.fullName),
          plateNumber: task.workOrder.asset?.plateNumber ?? null,
        },
        evidenceReferences,
      });
    }

    const { items, nextCursor } = paginateRecords(rawRecords, limit, cursor);
    const reworkRate = completedTasks.length > 0
      ? Math.round((filteredTasks.length / completedTasks.length) * 1000) / 10
      : null;

    return {
      metric: {
        key: "taskReworkRate",
        label: "Task Rework Rate",
        value: reworkRate,
        unit: "percent",
        period: { from: range.from.toISOString(), to: range.to.toISOString() },
      },
      activeFilters: {
        branchId: query.branchId,
        serviceKey: query.serviceKey,
        technicianId: query.technicianId,
        workOrderId: query.workOrderId,
        dimension: query.dimension,
        dimensionValue: query.dimensionValue,
      },
      dimensions: Array.from(dimensionCounts.entries()).map(([val, cnt]) => ({
        key: query.dimension ?? "reason",
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
        sampleSizeProtected,
        financialAttributionComputable: false,
        financialAttributionNote:
          "Technician hourly cost rate and scrap parts ledger are not captured in the domain; monetary rework cost is strictly not computable.",
        dataHonestyDisclaimer:
          "Parent-child task rework links (originalTaskId) reflect authoritative structural lineage as an OBSERVED_FACT and do not by themselves prove personal blame or root cause.",
      },
    };
  }

  // ==========================================================================
  // REPEAT VEHICLE VISITS (WITHIN 30 DAYS, NEVER WARRANTY)
  // ==========================================================================
  private async resolveRepeatVisits(
    tenantId: string,
    branchId: string | undefined,
    query: DrillDownQuery,
    range: { from: Date; to: Date },
    limit: number,
    cursor: { occurredAt: string; id: string } | null,
  ): Promise<DrillDownResult> {
    const branchFilter = branchId ? { branchId } : {};

    // Prior closed work orders in preceding 30 days
    const priorWindowStart = new Date(range.from.getTime() - 30 * 24 * 60 * 60 * 1000);
    const candidateWorkOrders = await this.prisma.workOrder.findMany({
      where: {
        tenantId,
        createdAt: { gte: priorWindowStart, lte: range.to },
        ...branchFilter,
      },
      include: {
        asset: { select: { id: true, plateNumber: true, category: true } },
        tasks: { select: { id: true, title: true, serviceKey: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const windowWorkOrders = candidateWorkOrders.filter(
      (w) => w.createdAt >= range.from && w.createdAt <= range.to,
    );

    const closedByAsset = new Map<string, typeof candidateWorkOrders>();
    for (const wo of candidateWorkOrders) {
      if (wo.status === "CLOSED" && wo.closedAt && wo.assetId) {
        const list = closedByAsset.get(wo.assetId) ?? [];
        list.push(wo);
        closedByAsset.set(wo.assetId, list);
      }
    }

    const rawRecords: DrillDownRecord[] = [];
    const dimensionCounts = new Map<string, number>();

    for (const curr of windowWorkOrders) {
      if (!curr.assetId) continue;
      const priorClosed = closedByAsset.get(curr.assetId) ?? [];
      const prior = priorClosed
        .filter((p) => p.id !== curr.id && p.closedAt && p.closedAt < curr.createdAt)
        .sort((a, b) => b.closedAt!.getTime() - a.closedAt!.getTime())[0];

      if (!prior || !prior.closedAt) continue;

      const diffDays = (curr.createdAt.getTime() - prior.closedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays >= 0 && diffDays <= 30) {
        const priorKeys = new Set(prior.tasks.map((t) => t.serviceKey).filter(Boolean));
        const currKeys = curr.tasks.map((t) => t.serviceKey).filter(Boolean);
        const hasOverlap = currKeys.some((k) => priorKeys.has(k));

        const dimVal = hasOverlap ? "SERVICE_OVERLAP" : "NEW_SERVICE";
        if (query.dimension === "serviceOverlap" && query.dimensionValue && dimVal !== query.dimensionValue) {
          continue;
        }

        dimensionCounts.set(dimVal, (dimensionCounts.get(dimVal) ?? 0) + 1);

        const evidenceReferences: EvidenceReference[] = [
          {
            entityType: "WORK_ORDER",
            entityId: curr.id,
            tenantId,
            workOrderId: curr.id,
            occurredAt: curr.createdAt.toISOString(),
            label: `Repeat Visit Work Order #${curr.id.slice(-6)}`,
          },
          {
            entityType: "WORK_ORDER",
            entityId: prior.id,
            tenantId,
            workOrderId: prior.id,
            occurredAt: prior.closedAt.toISOString(),
            relation: "PRIOR_CLOSED_JOB",
            label: `Prior Closed Job #${prior.id.slice(-6)} (${Math.round(diffDays)} days earlier)`,
          },
        ];

        rawRecords.push({
          entityType: "WORK_ORDER",
          entityId: curr.id,
          label: `Repeat Vehicle Visit #${curr.id.slice(-6)} - ${Math.round(diffDays)}d post closure`,
          occurredAt: curr.createdAt.toISOString(),
          status: curr.status,
          branchId: curr.branchId,
          workOrderId: curr.id,
          attributes: {
            daysSincePriorClosure: Math.round(diffDays),
            priorWorkOrderId: prior.id,
            priorClosedAt: prior.closedAt.toISOString(),
            hasServiceOverlap: hasOverlap,
            plateNumber: curr.asset?.plateNumber ?? null,
            requestedServices: curr.tasks.map((t) => t.title),
            priorServices: prior.tasks.map((t) => t.title),
          },
          evidenceReferences,
        });
      }
    }

    const { items, nextCursor } = paginateRecords(rawRecords, limit, cursor);

    return {
      metric: {
        key: "repeatVehicleVisits",
        label: "Repeat Vehicle Visits (Within 30 Days)",
        value: rawRecords.length,
        unit: "visits",
        period: { from: range.from.toISOString(), to: range.to.toISOString() },
      },
      activeFilters: {
        branchId: query.branchId,
        dimension: query.dimension,
        dimensionValue: query.dimensionValue,
      },
      dimensions: Array.from(dimensionCounts.entries()).map(([val, cnt]) => ({
        key: query.dimension ?? "serviceOverlap",
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
        dataHonestyDisclaimer:
          "The platform tracks vehicle return visits within 30 days without asserting commercial liability, defect fault, or customer billing categorization; repeat visits are strictly NOT labeled as warranty claims.",
      },
    };
  }

  // ==========================================================================
  // FAULT RECURRENCE
  // ==========================================================================
  private async resolveFaultRecurrence(
    tenantId: string,
    branchId: string | undefined,
    query: DrillDownQuery,
    range: { from: Date; to: Date },
    limit: number,
    cursor: { occurredAt: string; id: string } | null,
  ): Promise<DrillDownResult> {
    const branchFilter = branchId ? { workOrder: { branchId } } : {};

    const candidateFaults = await this.prisma.fault.findMany({
      where: {
        tenantId,
        createdAt: { lte: range.to },
        ...branchFilter,
      },
      include: {
        workOrder: { select: { id: true, branchId: true, assetId: true, asset: { select: { plateNumber: true } } } },
      },
      orderBy: { createdAt: "asc" },
    });

    const windowFaults = candidateFaults.filter(
      (f) => f.createdAt >= range.from && f.createdAt <= range.to,
    );

    const faultsByAssetAndCode = new Map<string, typeof candidateFaults>();
    for (const f of candidateFaults) {
      const assetId = f.workOrder?.assetId;
      if (!assetId || !f.code) continue;
      const key = `${assetId}::${f.code}`;
      const list = faultsByAssetAndCode.get(key) ?? [];
      list.push(f);
      faultsByAssetAndCode.set(key, list);
    }

    const rawRecords: DrillDownRecord[] = [];
    const dimensionCounts = new Map<string, number>();

    for (const curr of windowFaults) {
      const assetId = curr.workOrder?.assetId;
      if (!assetId || !curr.code) continue;
      const allInstances = faultsByAssetAndCode.get(`${assetId}::${curr.code}`) ?? [];
      const prior = allInstances.filter(
        (f) => f.id !== curr.id && f.createdAt < curr.createdAt && f.workOrderId !== curr.workOrderId,
      );

      if (prior.length > 0) {
        const severity = curr.severity ?? "MEDIUM";
        if (query.dimension === "severity" && query.dimensionValue && severity !== query.dimensionValue) {
          continue;
        }

        dimensionCounts.set(severity, (dimensionCounts.get(severity) ?? 0) + 1);

        const evidenceReferences: EvidenceReference[] = [
          {
            entityType: "FAULT",
            entityId: curr.id,
            tenantId,
            workOrderId: curr.workOrderId,
            occurredAt: curr.createdAt.toISOString(),
            label: `Recurring Fault Code: ${curr.code}`,
          },
          {
            entityType: "WORK_ORDER",
            entityId: curr.workOrderId,
            tenantId,
            workOrderId: curr.workOrderId,
            label: `Current Work Order #${curr.workOrderId.slice(-6)}`,
          },
        ];

        for (const p of prior.slice(-2)) {
          evidenceReferences.push({
            entityType: "FAULT",
            entityId: p.id,
            tenantId,
            workOrderId: p.workOrderId,
            occurredAt: p.createdAt.toISOString(),
            relation: "PRIOR_FAULT_INSTANCE",
            label: `Prior Instance on WO #${p.workOrderId.slice(-6)} (${p.createdAt.toISOString().slice(0, 10)})`,
          });
        }

        rawRecords.push({
          entityType: "FAULT",
          entityId: curr.id,
          label: `Recurring Fault: ${curr.code} (${severity})`,
          occurredAt: curr.createdAt.toISOString(),
          branchId: curr.workOrder.branchId,
          workOrderId: curr.workOrderId,
          attributes: {
            code: curr.code,
            faultCode: curr.code,
            description: curr.description,
            severity,
            priorOccurrenceCount: prior.length,
            plateNumber: curr.workOrder.asset?.plateNumber ?? null,
            priorWorkOrderIds: prior.map((p) => p.workOrderId),
          },
          evidenceReferences,
        });
      }
    }

    const { items, nextCursor } = paginateRecords(rawRecords, limit, cursor);

    return {
      metric: {
        key: "faultRecurrence",
        label: "Fault Recurrence",
        value: rawRecords.length,
        unit: "occurrences",
        period: { from: range.from.toISOString(), to: range.to.toISOString() },
      },
      activeFilters: {
        branchId: query.branchId,
        dimension: query.dimension,
        dimensionValue: query.dimensionValue,
      },
      dimensions: Array.from(dimensionCounts.entries()).map(([val, cnt]) => ({
        key: query.dimension ?? "severity",
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
        dataHonestyDisclaimer:
          "Fault recurrence identifies diagnostic fault codes recurring on the same vehicle without asserting technician blame, diagnosis errors, or defective parts.",
      },
    };
  }
}
