import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../runtime/database/prisma.service";
import { resolveDateRange, safeDivide, type ReportQueryParams } from "../owner-reports/date-range.util";
import type { AnalyticsScope } from "./analytics-scope.util";
import { QcFailureReason, TaskReworkReason } from "@mop/database";

export interface QcSummary {
  readonly qcEvaluationsCount: number;
  readonly firstPassEvaluations: number;
  readonly firstPassPassed: number;
  readonly firstPassYield: number | null;
  readonly qcFailures: number;
  readonly qcFailureRate: number | null;
}

export interface TaskReworkSummary {
  readonly completedTasks: number;
  readonly tasksWithRework: number;
  readonly reworkTaskCount: number;
  readonly taskReworkRate: number | null;
}

export interface WorkOrderQualitySummary {
  readonly completedWorkOrders: number;
  readonly workOrdersWithQcFailure: number;
  readonly workOrdersWithTaskRework: number;
  readonly reopenedWorkOrders: number;
  readonly workOrdersWithQualityRework: number;
  readonly workOrderReworkRate: number | null;
}

export interface VehicleRepeatSummary {
  readonly repeatVehicleVisitsWithin30Days: number;
  readonly uniqueVehiclesWithRepeatVisitWithin30Days: number;
  readonly faultRecurrenceCount: number;
}

export interface QualityCostDrag {
  readonly reworkLaborMinutes: number;
  readonly reworkLaborCost: null;
  readonly reworkLaborCostNotComputableReason: string;
  readonly reworkPartsCost: null;
  readonly reworkPartsCostNotComputableReason: string;
  readonly totalMeasurableQualityCost: null;
  readonly totalMeasurableQualityCostNotComputableReason: string;
}

export interface ReasonBreakdownItem {
  readonly reason: string;
  readonly count: number;
  readonly percentage: number | null;
}

export interface BranchQualityContributor {
  readonly branchId: string;
  readonly branchName: string;
  readonly qcEvaluations: number;
  readonly firstPassEvaluations: number;
  readonly firstPassPassed: number;
  readonly firstPassYield: number | null;
  readonly qcFailures: number;
  readonly qcFailureRate: number | null;
  readonly completedTasks: number;
  readonly tasksWithRework: number;
  readonly reworkTaskCount: number;
  readonly reworkRate: number | null;
}

export interface ServiceQualityContributor {
  readonly serviceKey: string;
  readonly serviceTitle: string;
  readonly completedTasks: number;
  readonly tasksWithRework: number;
  readonly reworkTaskCount: number;
  readonly reworkRate: number | null;
}

export interface TechnicianQualityContributor {
  readonly staffUserId: string;
  readonly staffName: string;
  readonly completedTasks: number;
  readonly reworkTasks: number;
  readonly reworkRate: number | null;
  readonly insufficientSampleSize: boolean;
  readonly rankingSuppressed: boolean;
}

export interface QualityIntegrityAnomalies {
  readonly qcFailedWithoutStructuredReason: number;
  readonly qcFailedWithoutNote: number;
  readonly reworkWithoutOriginalTask: number;
  readonly repeatVisitsUnlinked: number;
}

export interface QualityIntelligenceReport {
  readonly range: { from: string; to: string };
  readonly qc: QcSummary;
  readonly rework: TaskReworkSummary;
  readonly workOrders: WorkOrderQualitySummary;
  readonly vehicleRepeats: VehicleRepeatSummary;
  readonly costDrag: QualityCostDrag;
  readonly qcFailureReasons: readonly ReasonBreakdownItem[];
  readonly reworkReasons: readonly ReasonBreakdownItem[];
  readonly contributors: {
    readonly byBranch: readonly BranchQualityContributor[];
    readonly byService: readonly ServiceQualityContributor[];
    readonly byTechnician: readonly TechnicianQualityContributor[];
  };
  readonly integrity: QualityIntegrityAnomalies;
}

const MIN_SAMPLE_SIZE = 5;

@Injectable()
export class QualityAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async build(
    tenantId: string,
    scope: AnalyticsScope,
    params: ReportQueryParams,
  ): Promise<QualityIntelligenceReport> {
    const range = resolveDateRange({ from: params.from, to: params.to });

    // Validate branch scope
    if (params.branchId) {
      if (scope.branchIds.length > 0 && !scope.branchIds.includes(params.branchId)) {
        throw new ForbiddenException({
          code: "branch_scope_violation",
          message: "You are not authorized to view quality data for this branch.",
        });
      }
    }

    const effectiveBranchIds = params.branchId
      ? [params.branchId]
      : scope.branchIds.length > 0
        ? [...scope.branchIds]
        : [];

    const branchFilter = effectiveBranchIds.length > 0 ? { in: effectiveBranchIds } : undefined;

    // Load branches for attribution and labels
    const branches = await this.prisma.branch.findMany({
      where: { tenantId, ...(branchFilter ? { id: branchFilter } : {}) },
      select: { id: true, name: true },
    });
    const branchMap = new Map<string, string>(branches.map((b) => [b.id, b.name]));

    // -------------------------------------------------------------------------
    // 1. QC EVALUATIONS & FIRST PASS YIELD
    // Source of Truth: OperationEvent ("work_order.status_changed")
    // -------------------------------------------------------------------------
    // Find all QC events up to range.to for work orders in scope, so we can determine
    // the true first pass evaluation for any work order evaluated in this window.
    const allQcEvents = await this.prisma.operationEvent.findMany({
      where: {
        tenantId,
        eventKey: "work_order.status_changed",
        createdAt: { lte: range.to },
        ...(branchFilter ? { branchId: branchFilter } : {}),
      },
      select: {
        id: true,
        workOrderId: true,
        branchId: true,
        createdAt: true,
        payload: true,
      },
      orderBy: { createdAt: "asc" },
    });

    // Filter to genuine QC evaluations
    // QC progression happens from READY_FOR_QC, or intent is QC_PASSED/QC_FAILED,
    // or to is QC_FAILED / PAYMENT_PENDING / READY_FOR_DELIVERY from READY_FOR_QC.
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

    // Group QC events by workOrderId to find the true first evaluation
    const qcEventsByWo = new Map<string, (typeof qcEvents)[0][]>();
    for (const ev of qcEvents) {
      if (!ev.workOrderId) continue;
      const list = qcEventsByWo.get(ev.workOrderId) ?? [];
      list.push(ev);
      qcEventsByWo.set(ev.workOrderId, list);
    }

    // Identify first pass evaluations and whether their first pass event fell in [range.from, range.to]
    let firstPassEvaluations = 0;
    let firstPassPassed = 0;

    // Branch QC aggregations
    const branchQcStats = new Map<
      string,
      {
        evaluations: number;
        firstPassEvaluations: number;
        firstPassPassed: number;
        failures: number;
      }
    >();

    const getBranchStats = (bId: string) => {
      let st = branchQcStats.get(bId);
      if (!st) {
        st = { evaluations: 0, firstPassEvaluations: 0, firstPassPassed: 0, failures: 0 };
        branchQcStats.set(bId, st);
      }
      return st;
    };

    for (const [woId, events] of qcEventsByWo.entries()) {
      const firstEv = events[0]; // chronologically earliest
      if (firstEv.createdAt >= range.from && firstEv.createdAt <= range.to) {
        firstPassEvaluations++;
        const passed = isQcPass(firstEv);
        if (passed) {
          firstPassPassed++;
        }
        if (firstEv.branchId) {
          const bSt = getBranchStats(firstEv.branchId);
          bSt.firstPassEvaluations++;
          if (passed) bSt.firstPassPassed++;
        }
      }
    }

    // Events within the active reporting window
    const inRangeQcEvents = qcEvents.filter(
      (ev) => ev.createdAt >= range.from && ev.createdAt <= range.to,
    );
    const qcEvaluationsCount = inRangeQcEvents.length;
    const qcFailsInRange = inRangeQcEvents.filter((ev) => !isQcPass(ev));
    const qcFailures = qcFailsInRange.length;

    for (const ev of inRangeQcEvents) {
      if (ev.branchId) {
        const bSt = getBranchStats(ev.branchId);
        bSt.evaluations++;
        if (!isQcPass(ev)) {
          bSt.failures++;
        }
      }
    }

    const firstPassYield =
      firstPassEvaluations > 0
        ? Math.round((firstPassPassed / firstPassEvaluations) * 1000) / 10
        : null;

    const qcFailureRate =
      qcEvaluationsCount > 0
        ? Math.round((qcFailures / qcEvaluationsCount) * 1000) / 10
        : null;

    // Structured QC Failure Reasons breakdown
    const qcFailureReasonCounts = new Map<string, number>();
    let qcFailedWithoutStructuredReason = 0;
    let qcFailedWithoutNote = 0;

    for (const ev of qcFailsInRange) {
      const p = ev.payload as Record<string, unknown> | null;
      const failureReason = p?.failureReason as string | undefined;
      const note = (p?.reason ?? p?.note) as string | undefined;

      if (failureReason && Object.values(QcFailureReason).includes(failureReason as QcFailureReason)) {
        qcFailureReasonCounts.set(failureReason, (qcFailureReasonCounts.get(failureReason) ?? 0) + 1);
      } else {
        qcFailedWithoutStructuredReason++;
        qcFailureReasonCounts.set("UNCLASSIFIED", (qcFailureReasonCounts.get("UNCLASSIFIED") ?? 0) + 1);
      }

      if (!note || note.trim().length === 0) {
        qcFailedWithoutNote++;
      }
    }

    const qcFailureReasons: ReasonBreakdownItem[] = Array.from(qcFailureReasonCounts.entries())
      .map(([reason, count]) => ({
        reason,
        count,
        percentage: qcFailures > 0 ? Math.round((count / qcFailures) * 1000) / 10 : null,
      }))
      .sort((a, b) => b.count - a.count);

    // -------------------------------------------------------------------------
    // 2. TASK REWORK MODEL & REWORK RATE
    // Source of Truth: Task (status, completedAt, originalTaskId, reworkReason)
    // -------------------------------------------------------------------------
    // Tasks completed within range
    const completedTasks = await this.prisma.task.findMany({
      where: {
        tenantId,
        status: "DONE",
        completedAt: { gte: range.from, lte: range.to },
        ...(branchFilter ? { workOrder: { branchId: branchFilter } } : {}),
      },
      select: {
        id: true,
        title: true,
        serviceKey: true,
        actualMinutes: true,
        status: true,
        originalTaskId: true,
        reworkReason: true,
        reworkNote: true,
        workOrderId: true,
        completedAt: true,
        workOrder: { select: { branchId: true } },
        assignments: {
          select: {
            staffUserId: true,
            assignedAt: true,
            unassignedAt: true,
            staffUser: { select: { fullName: true } },
          },
        },
      },
    });

    // All rework tasks created or returned within range
    const allTasksInRange = await this.prisma.task.findMany({
      where: {
        tenantId,
        createdAt: { gte: range.from, lte: range.to },
        ...(branchFilter ? { workOrder: { branchId: branchFilter } } : {}),
      },
      select: {
        id: true,
        originalTaskId: true,
        reworkReason: true,
        reworkNote: true,
        status: true,
        actualMinutes: true,
        serviceKey: true,
        workOrderId: true,
        workOrder: { select: { branchId: true } },
      },
    });

    // Distinct tasks with rework
    // A task is a rework task if originalTaskId is set, or reworkReason is set, or status is RETURNED_FOR_REWORK
    const isReworkTask = (t: {
      originalTaskId: string | null;
      reworkReason: TaskReworkReason | null;
      status?: string;
    }) => t.originalTaskId !== null || t.reworkReason !== null || t.status === "RETURNED_FOR_REWORK";

    // Set of originalTaskIds that were reworked
    const originalTasksReworked = new Set<string>();
    for (const t of allTasksInRange) {
      if (t.originalTaskId) {
        originalTasksReworked.add(t.originalTaskId);
      }
      if (t.status === "RETURNED_FOR_REWORK") {
        originalTasksReworked.add(t.id);
      }
    }

    // Also include any completed tasks that were rework tasks or had rework
    const completedTasksWithReworkSet = new Set<string>();
    for (const t of completedTasks) {
      if (isReworkTask(t) || originalTasksReworked.has(t.id)) {
        completedTasksWithReworkSet.add(t.id);
      }
    }

    const tasksWithRework = completedTasksWithReworkSet.size;
    const completedTasksCount = completedTasks.length;
    const taskReworkRate =
      completedTasksCount > 0
        ? Math.round((tasksWithRework / completedTasksCount) * 1000) / 10
        : null;

    const reworkTaskCount = allTasksInRange.filter((t) => t.originalTaskId !== null).length;

    // Rework labor minutes (computable)
    let reworkLaborMinutes = 0;
    for (const t of allTasksInRange) {
      if (isReworkTask(t) && typeof t.actualMinutes === "number") {
        reworkLaborMinutes += t.actualMinutes;
      }
    }
    // Also include any completed tasks identified as rework
    for (const t of completedTasks) {
      if (isReworkTask(t) && typeof t.actualMinutes === "number" && !allTasksInRange.some((x) => x.id === t.id)) {
        reworkLaborMinutes += t.actualMinutes;
      }
    }

    // Structured Rework Reasons breakdown
    const reworkReasonCounts = new Map<string, number>();
    let reworkWithoutOriginalTask = 0;

    for (const t of allTasksInRange) {
      if (isReworkTask(t)) {
        if (t.originalTaskId === null && t.status !== "RETURNED_FOR_REWORK") {
          reworkWithoutOriginalTask++;
        }

        if (t.reworkReason && Object.values(TaskReworkReason).includes(t.reworkReason)) {
          reworkReasonCounts.set(t.reworkReason, (reworkReasonCounts.get(t.reworkReason) ?? 0) + 1);
        } else {
          reworkReasonCounts.set("UNCLASSIFIED", (reworkReasonCounts.get("UNCLASSIFIED") ?? 0) + 1);
        }
      }
    }

    const totalReworkIdentified = Array.from(reworkReasonCounts.values()).reduce((a, b) => a + b, 0);
    const reworkReasons: ReasonBreakdownItem[] = Array.from(reworkReasonCounts.entries())
      .map(([reason, count]) => ({
        reason,
        count,
        percentage:
          totalReworkIdentified > 0 ? Math.round((count / totalReworkIdentified) * 1000) / 10 : null,
      }))
      .sort((a, b) => b.count - a.count);

    // -------------------------------------------------------------------------
    // 3. WORK ORDER QUALITY REWORK RATE & REOPENED WORK ORDERS
    // -------------------------------------------------------------------------
    // Completed work orders in range
    const completedWorkOrders = await this.prisma.workOrder.findMany({
      where: {
        tenantId,
        status: "CLOSED",
        closedAt: { gte: range.from, lte: range.to },
        ...(branchFilter ? { branchId: branchFilter } : {}),
      },
      select: {
        id: true,
        branchId: true,
        relinkedFromWorkOrderId: true,
      },
    });

    const completedWorkOrdersCount = completedWorkOrders.length;

    // Work orders with QC failures in range
    const workOrderIdsWithQcFailure = new Set<string>();
    for (const ev of qcFailsInRange) {
      if (ev.workOrderId) workOrderIdsWithQcFailure.add(ev.workOrderId);
    }

    // Work orders with task rework in range
    const workOrderIdsWithTaskRework = new Set<string>();
    for (const t of allTasksInRange) {
      if (isReworkTask(t)) {
        workOrderIdsWithTaskRework.add(t.workOrderId);
      }
    }
    for (const t of completedTasks) {
      if (isReworkTask(t)) {
        workOrderIdsWithTaskRework.add(t.workOrderId);
      }
    }

    // Reopened / relinked work orders in range (WorkOrder.relinkedFromWorkOrderId)
    const reopenedWorkOrdersList = await this.prisma.workOrder.findMany({
      where: {
        tenantId,
        createdAt: { gte: range.from, lte: range.to },
        relinkedFromWorkOrderId: { not: null },
        ...(branchFilter ? { branchId: branchFilter } : {}),
      },
      select: { id: true },
    });
    const reopenedWorkOrders = reopenedWorkOrdersList.length;

    // Combined work orders with quality rework
    const workOrdersWithQualityReworkSet = new Set<string>();
    for (const id of workOrderIdsWithQcFailure) workOrdersWithQualityReworkSet.add(id);
    for (const id of workOrderIdsWithTaskRework) workOrdersWithQualityReworkSet.add(id);
    for (const wo of reopenedWorkOrdersList) workOrdersWithQualityReworkSet.add(wo.id);

    // Intersect or match with completed jobs or total affected
    const workOrdersWithQualityRework = workOrdersWithQualityReworkSet.size;
    const workOrderReworkRate =
      completedWorkOrdersCount > 0
        ? Math.round(
            (completedWorkOrders.filter((wo) => workOrdersWithQualityReworkSet.has(wo.id)).length /
              completedWorkOrdersCount) *
              1000,
          ) / 10
        : null;

    // -------------------------------------------------------------------------
    // 4. REPEAT VEHICLE VISITS (30 DAYS) & FAULT RECURRENCE
    // -------------------------------------------------------------------------
    // Work orders created in range with authoritative assetId
    const candidateWorkOrders = await this.prisma.workOrder.findMany({
      where: {
        tenantId,
        createdAt: { gte: range.from, lte: range.to },
        ...(branchFilter ? { branchId: branchFilter } : {}),
      },
      select: {
        id: true,
        assetId: true,
        createdAt: true,
        relinkedFromWorkOrderId: true,
      },
    });

    let repeatVehicleVisitsWithin30Days = 0;
    const repeatAssets = new Set<string>();
    let repeatVisitsUnlinked = 0;

    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    for (const wo of candidateWorkOrders) {
      if (!wo.assetId) continue;

      // Find prior closed work order for the same asset within 30 days
      const prior = await this.prisma.workOrder.findFirst({
        where: {
          tenantId,
          assetId: wo.assetId,
          id: { not: wo.id },
          closedAt: {
            not: null,
            lt: wo.createdAt,
            gte: new Date(wo.createdAt.getTime() - thirtyDaysMs),
          },
        },
        select: { id: true, closedAt: true },
      });

      if (prior) {
        repeatVehicleVisitsWithin30Days++;
        repeatAssets.add(wo.assetId);
        if (!wo.relinkedFromWorkOrderId) {
          repeatVisitsUnlinked++;
        }
      }
    }

    const uniqueVehiclesWithRepeatVisitWithin30Days = repeatAssets.size;

    // Fault Recurrence:
    // For faults on work orders created in range with code and assetId,
    // check if the same code occurred on a prior work order for the same vehicle.
    const faultsInRange = await this.prisma.fault.findMany({
      where: {
        tenantId,
        code: { not: null },
        workOrder: {
          createdAt: { gte: range.from, lte: range.to },
          ...(branchFilter ? { branchId: branchFilter } : {}),
        },
      },
      select: {
        id: true,
        code: true,
        workOrderId: true,
        workOrder: { select: { assetId: true, createdAt: true } },
      },
    });

    let faultRecurrenceCount = 0;
    for (const f of faultsInRange) {
      if (!f.code || !f.workOrder.assetId) continue;

      const priorFault = await this.prisma.fault.findFirst({
        where: {
          tenantId,
          code: f.code,
          id: { not: f.id },
          workOrderId: { not: f.workOrderId },
          workOrder: {
            assetId: f.workOrder.assetId,
            createdAt: { lt: f.workOrder.createdAt },
          },
        },
        select: { id: true },
      });

      if (priorFault) {
        faultRecurrenceCount++;
      }
    }

    // -------------------------------------------------------------------------
    // 5. QUALITY CONTRIBUTORS (BRANCH, SERVICE, TECHNICIAN)
    // -------------------------------------------------------------------------
    // A. Branch contributor
    const branchTasks = new Map<
      string,
      { completedTasks: number; tasksWithRework: number; reworkTaskCount: number }
    >();

    for (const b of branches) {
      branchTasks.set(b.id, { completedTasks: 0, tasksWithRework: 0, reworkTaskCount: 0 });
    }

    for (const t of completedTasks) {
      const bId = t.workOrder?.branchId;
      if (bId && branchTasks.has(bId)) {
        const b = branchTasks.get(bId)!;
        b.completedTasks++;
        if (isReworkTask(t) || originalTasksReworked.has(t.id)) {
          b.tasksWithRework++;
        }
      }
    }

    for (const t of allTasksInRange) {
      const bId = t.workOrder?.branchId;
      if (bId && branchTasks.has(bId) && t.originalTaskId !== null) {
        branchTasks.get(bId)!.reworkTaskCount++;
      }
    }

    const byBranch: BranchQualityContributor[] = branches.map((b) => {
      const q = branchQcStats.get(b.id) ?? {
        evaluations: 0,
        firstPassEvaluations: 0,
        firstPassPassed: 0,
        failures: 0,
      };
      const t = branchTasks.get(b.id) ?? {
        completedTasks: 0,
        tasksWithRework: 0,
        reworkTaskCount: 0,
      };

      const bFpy =
        q.firstPassEvaluations > 0
          ? Math.round((q.firstPassPassed / q.firstPassEvaluations) * 1000) / 10
          : null;
      const bQcFailRate =
        q.evaluations > 0 ? Math.round((q.failures / q.evaluations) * 1000) / 10 : null;
      const bReworkRate =
        t.completedTasks > 0 ? Math.round((t.tasksWithRework / t.completedTasks) * 1000) / 10 : null;

      return {
        branchId: b.id,
        branchName: b.name,
        qcEvaluations: q.evaluations,
        firstPassEvaluations: q.firstPassEvaluations,
        firstPassPassed: q.firstPassPassed,
        firstPassYield: bFpy,
        qcFailures: q.failures,
        qcFailureRate: bQcFailRate,
        completedTasks: t.completedTasks,
        tasksWithRework: t.tasksWithRework,
        reworkTaskCount: t.reworkTaskCount,
        reworkRate: bReworkRate,
      };
    });

    // B. Service contributor
    const serviceStats = new Map<
      string,
      { completedTasks: number; tasksWithRework: number; reworkTaskCount: number; title: string }
    >();

    for (const t of completedTasks) {
      if (!t.serviceKey) continue;
      let s = serviceStats.get(t.serviceKey);
      if (!s) {
        s = { completedTasks: 0, tasksWithRework: 0, reworkTaskCount: 0, title: t.title };
        serviceStats.set(t.serviceKey, s);
      }
      s.completedTasks++;
      if (isReworkTask(t) || originalTasksReworked.has(t.id)) {
        s.tasksWithRework++;
      }
    }

    for (const t of allTasksInRange) {
      if (!t.serviceKey || t.originalTaskId === null) continue;
      let s = serviceStats.get(t.serviceKey);
      if (!s) {
        s = { completedTasks: 0, tasksWithRework: 0, reworkTaskCount: 0, title: t.serviceKey };
        serviceStats.set(t.serviceKey, s);
      }
      s.reworkTaskCount++;
    }

    const byService: ServiceQualityContributor[] = Array.from(serviceStats.entries()).map(
      ([serviceKey, s]) => ({
        serviceKey,
        serviceTitle: s.title,
        completedTasks: s.completedTasks,
        tasksWithRework: s.tasksWithRework,
        reworkTaskCount: s.reworkTaskCount,
        reworkRate:
          s.completedTasks > 0 ? Math.round((s.tasksWithRework / s.completedTasks) * 1000) / 10 : null,
      }),
    );

    // C. Technician contributor
    // Historical technician attribution foundation (Phase 1 & 4):
    // For each completed task, find the active assignment at task.completedAt.
    const techStats = new Map<
      string,
      { staffUserId: string; staffName: string; completedTasks: number; reworkTasks: number }
    >();

    for (const t of completedTasks) {
      if (!t.completedAt) continue;
      const compTime = t.completedAt.getTime();

      // Find historically active assignment at completion
      const activeAssignment = t.assignments.find((a) => {
        const start = a.assignedAt.getTime();
        const end = a.unassignedAt ? a.unassignedAt.getTime() : Infinity;
        return start <= compTime && compTime <= end;
      });

      if (!activeAssignment) continue;

      const techId = activeAssignment.staffUserId;
      let ts = techStats.get(techId);
      if (!ts) {
        ts = {
          staffUserId: techId,
          staffName: activeAssignment.staffUser?.fullName ?? "Unknown Technician",
          completedTasks: 0,
          reworkTasks: 0,
        };
        techStats.set(techId, ts);
      }
      ts.completedTasks++;
      if (isReworkTask(t) || originalTasksReworked.has(t.id)) {
        ts.reworkTasks++;
      }
    }

    const byTechnician: TechnicianQualityContributor[] = Array.from(techStats.values()).map(
      (tech) => {
        const insufficient = tech.completedTasks < MIN_SAMPLE_SIZE;
        const reworkRate =
          tech.completedTasks > 0
            ? Math.round((tech.reworkTasks / tech.completedTasks) * 1000) / 10
            : null;

        return {
          staffUserId: tech.staffUserId,
          staffName: tech.staffName,
          completedTasks: tech.completedTasks,
          reworkTasks: tech.reworkTasks,
          reworkRate,
          insufficientSampleSize: insufficient,
          rankingSuppressed: insufficient,
        };
      },
    );

    // -------------------------------------------------------------------------
    // 6. FINAL REPORT ASSEMBLY (STRICT DATA HONESTY)
    // -------------------------------------------------------------------------
    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      qc: {
        qcEvaluationsCount,
        firstPassEvaluations,
        firstPassPassed,
        firstPassYield,
        qcFailures,
        qcFailureRate,
      },
      rework: {
        completedTasks: completedTasksCount,
        tasksWithRework,
        reworkTaskCount,
        taskReworkRate,
      },
      workOrders: {
        completedWorkOrders: completedWorkOrdersCount,
        workOrdersWithQcFailure: workOrderIdsWithQcFailure.size,
        workOrdersWithTaskRework: workOrderIdsWithTaskRework.size,
        reopenedWorkOrders,
        workOrdersWithQualityRework,
        workOrderReworkRate,
      },
      vehicleRepeats: {
        repeatVehicleVisitsWithin30Days,
        uniqueVehiclesWithRepeatVisitWithin30Days,
        faultRecurrenceCount,
      },
      costDrag: {
        reworkLaborMinutes,
        reworkLaborCost: null,
        reworkLaborCostNotComputableReason:
          "Technician hourly labor cost rate is not captured in domain; selling price cannot be substituted for cost",
        reworkPartsCost: null,
        reworkPartsCostNotComputableReason:
          "Damaged part scrap or rework consumption cost allocation is not tracked",
        totalMeasurableQualityCost: null,
        totalMeasurableQualityCostNotComputableReason:
          "Direct technician hourly labor cost and scrap/rework parts cost allocations are not tracked in domain",
      },
      qcFailureReasons,
      reworkReasons,
      contributors: {
        byBranch,
        byService,
        byTechnician,
      },
      integrity: {
        qcFailedWithoutStructuredReason,
        qcFailedWithoutNote,
        reworkWithoutOriginalTask,
        repeatVisitsUnlinked,
      },
    };
  }
}
