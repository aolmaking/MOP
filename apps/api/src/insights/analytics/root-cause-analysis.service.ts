import { ForbiddenException, Injectable } from "@nestjs/common";
import { Prisma, QcFailureReason, TaskReworkReason } from "@mop/database";
import { PrismaService } from "../../runtime/database/prisma.service";
import { resolveDateRange, safeDivide } from "../owner-reports/date-range.util";
import type { AnalyticsScope } from "./analytics-scope.util";
import {
  computeStatusDurations,
  TERMINAL_STATUSES,
  type StatusChangeEvent,
  type WorkOrderMeta,
} from "../owner-reports/lifecycle-duration.util";
import { detectStatusLoops } from "../workflow-health/loop-detection.util";
import { resolveOutcome } from "../../systems/operations/history/recommendation-outcome";
import type {
  DiagnosticEvidenceLevel,
  DiagnosticEvidenceReference,
  DiagnosticFact,
  DiagnosticFactor,
  DiagnosticIntegrity,
  DiagnosticOutcomeSummary,
  DiagnosticSubject,
  DiagnosticUnknown,
  RootCauseAnalysisReport,
  RootCauseQueryParams,
} from "./root-cause-analysis.types";

const MIN_SAMPLE_SIZE = 5;

@Injectable()
export class RootCauseAnalysisService {
  constructor(private readonly prisma: PrismaService) {}

  async analyze(
    tenantId: string,
    scope: AnalyticsScope,
    params: RootCauseQueryParams,
  ): Promise<RootCauseAnalysisReport> {
    const range = resolveDateRange(params);
    const subject: DiagnosticSubject = params.subject ?? "WORK_ORDER_DELAY";

    // Branch authorization check
    if (params.branchId && scope.branchIds.length > 0 && !scope.branchIds.includes(params.branchId)) {
      throw new ForbiddenException({
        code: "forbidden_branch",
        message: "You are not authorized to view root-cause diagnostics for this branch.",
      });
    }

    const effectiveBranchId = params.branchId ?? (scope.branchIds.length === 1 ? scope.branchIds[0] : undefined);

    switch (subject) {
      case "WORK_ORDER_DELAY":
        return this.analyzeDelay(tenantId, range, effectiveBranchId, params.workOrderId);
      case "WORKFLOW_BOTTLENECK":
        return this.analyzeBottleneck(tenantId, range, effectiveBranchId);
      case "QC_FAILURE":
        return this.analyzeQcFailure(tenantId, range, effectiveBranchId, params.serviceKey);
      case "TASK_REWORK":
        return this.analyzeTaskRework(tenantId, range, effectiveBranchId, params.serviceKey, params.technicianId);
      case "REPEAT_VEHICLE_VISIT":
        return this.analyzeRepeatVisits(tenantId, range, effectiveBranchId);
      case "FAULT_RECURRENCE":
        return this.analyzeFaultRecurrence(tenantId, range, effectiveBranchId);
      case "CUSTOMER_DECISION_DROP_OFF":
        return this.analyzeCustomerDecisions(tenantId, range, effectiveBranchId);
      case "DELIVERY_DELAY":
        return this.analyzeDeliveryDelay(tenantId, range, effectiveBranchId);
      default:
        return this.analyzeDelay(tenantId, range, effectiveBranchId, params.workOrderId);
    }
  }

  // ==========================================================================
  // 1. WORK ORDER DELAY
  // ==========================================================================
  private async analyzeDelay(
    tenantId: string,
    range: { from: Date; to: Date },
    branchId?: string,
    workOrderId?: string,
  ): Promise<RootCauseAnalysisReport> {
    const branchFilter = branchId ? { branchId } : {};
    const woFilter = workOrderId ? { id: workOrderId } : {};

    const workOrders = await this.prisma.workOrder.findMany({
      where: {
        tenantId,
        ...branchFilter,
        ...woFilter,
        createdAt: { gte: range.from, lte: range.to },
      },
      select: {
        id: true,
        createdAt: true,
        closedAt: true,
        status: true,
        branchId: true,
        expectedDurationMinutes: true,
        promisedAt: true,
      },
    });

    if (workOrders.length === 0) {
      return this.insufficientEvidenceReport("WORK_ORDER_DELAY", range, tenantId, branchId, workOrderId);
    }

    const woIds = workOrders.map((w) => w.id);

    // Fetch status events
    const rawEvents = await this.prisma.operationEvent.findMany({
      where: {
        tenantId,
        eventKey: "work_order.status_changed",
        workOrderId: { in: woIds },
      },
      select: { id: true, payload: true, createdAt: true, workOrderId: true, branchId: true },
      orderBy: { createdAt: "asc" },
    });

    const statusEvents: StatusChangeEvent[] = rawEvents.map((e) => {
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

    const metaMap = new Map<string, WorkOrderMeta>(
      workOrders.map((w) => [
        w.id,
        {
          workOrderId: w.id,
          createdAt: w.createdAt,
          closedAt: w.closedAt,
          initialStatus: "DRAFT",
          branchId: w.branchId,
          tenantId,
        },
      ]),
    );

    const durations = computeStatusDurations(statusEvents, range.to, metaMap);

    let totalLifecycleMs = 0;
    let totalActiveMs = 0;
    let totalWaitingMs = 0;
    const dwellByStatus: Record<string, number> = {};

    for (const d of durations) {
      totalLifecycleMs += d.totalMs;
      totalActiveMs += d.activeWorkMs ?? 0;
      totalWaitingMs += d.waitingMs ?? 0;
      for (const [s, ms] of Object.entries(d.msByStatus)) {
        if (!TERMINAL_STATUSES.includes(s)) {
          dwellByStatus[s] = (dwellByStatus[s] ?? 0) + ms;
        }
      }
    }

    // Task blockers
    const blockers = await this.prisma.taskBlocker.findMany({
      where: {
        tenantId,
        task: { workOrderId: { in: woIds } },
      },
      select: { id: true, reason: true, createdAt: true, task: { select: { workOrderId: true } } },
    });

    // Rework tasks on these work orders
    const reworkTasks = await this.prisma.task.findMany({
      where: {
        tenantId,
        workOrderId: { in: woIds },
        OR: [{ originalTaskId: { not: null } }, { reworkReason: { not: null } }, { status: "RETURNED_FOR_REWORK" }],
      },
      select: { id: true, title: true, workOrderId: true, createdAt: true },
    });

    const sampleSize = workOrders.length;
    const avgLifecycleHours = safeDivide(totalLifecycleMs, sampleSize * 3600000) ?? 0;
    const avgActiveHours = safeDivide(totalActiveMs, sampleSize * 3600000) ?? 0;
    const avgWaitingHours = safeDivide(totalWaitingMs, sampleSize * 3600000) ?? 0;
    const waitingShare = safeDivide(totalWaitingMs, totalLifecycleMs) ?? 0;

    // Top waiting status
    const topWaitingEntry = Object.entries(dwellByStatus)
      .filter(([s]) => !["IN_PROGRESS", "UNDER_INSPECTION"].includes(s))
      .sort((a, b) => b[1] - a[1])[0];
    const topWaitingStatus = topWaitingEntry ? topWaitingEntry[0] : "NONE";
    const topWaitingHours = topWaitingEntry ? topWaitingEntry[1] / (sampleSize * 3600000) : 0;

    const evidenceReferences: DiagnosticEvidenceReference[] = [];
    for (const w of workOrders.slice(0, 10)) {
      evidenceReferences.push({
        type: "WORK_ORDER",
        id: w.id,
        label: `Work Order #${w.id.slice(-6)}`,
        workOrderId: w.id,
        timestamp: w.createdAt.toISOString(),
      });
    }
    for (const b of blockers.slice(0, 10)) {
      evidenceReferences.push({
        type: "BLOCKER",
        id: b.id,
        label: `Blocker: ${b.reason}`,
        workOrderId: b.task.workOrderId,
        timestamp: b.createdAt.toISOString(),
      });
    }
    for (const r of reworkTasks.slice(0, 10)) {
      evidenceReferences.push({
        type: "TASK",
        id: r.id,
        label: `Rework: ${r.title}`,
        workOrderId: r.workOrderId,
        timestamp: r.createdAt.toISOString(),
      });
    }

    const observedFacts: DiagnosticFact[] = [
      {
        key: "TOTAL_LIFECYCLE_HOURS",
        label: "Average Lifecycle Duration",
        value: Number(avgLifecycleHours.toFixed(1)),
        unit: "hours",
        evidenceLevel: "OBSERVED_FACT",
        explanation: `Work orders averaged ${avgLifecycleHours.toFixed(1)} hours from creation to terminal state across ${sampleSize} job(s).`,
      },
      {
        key: "WAITING_TIME_SHARE",
        label: "Waiting Time Share",
        value: Number((waitingShare * 100).toFixed(1)),
        unit: "percent",
        evidenceLevel: "OBSERVED_FACT",
        explanation: `Waiting states accounted for ${(waitingShare * 100).toFixed(1)}% (${avgWaitingHours.toFixed(1)} hrs avg) of total lifecycle time.`,
      },
      {
        key: "ACTIVE_LABOR_HOURS",
        label: "Active Labor Time",
        value: Number(avgActiveHours.toFixed(1)),
        unit: "hours",
        evidenceLevel: "OBSERVED_FACT",
        explanation: `Hands-on active technician work accounted for ${avgActiveHours.toFixed(1)} hours average.`,
      },
      {
        key: "RECORDED_BLOCKERS",
        label: "Recorded Task Blockers",
        value: blockers.length,
        unit: "count",
        evidenceLevel: "OBSERVED_FACT",
        explanation: `${blockers.length} task blocker(s) were explicitly recorded during execution.`,
      },
    ];

    const contributingFactors: DiagnosticFactor[] = [];

    // Elevated waiting dwell
    if (waitingShare >= 0.4) {
      contributingFactors.push({
        key: "ELEVATED_WAITING_DWELL",
        label: `High Waiting Time in ${topWaitingStatus}`,
        category: "Workflow Dwell",
        rate: Number((waitingShare * 100).toFixed(1)),
        evidenceLevel: "RULE_BASED_CONTRIBUTOR",
        explanation: `Work orders spent an average of ${topWaitingHours.toFixed(1)} hours in '${topWaitingStatus}'. Dwell in non-active queues is an evidence-supported contributor to total cycle delay.`,
      });
    }

    // Task blocker factor
    if (blockers.length > 0) {
      const blockerReasons = blockers.reduce((acc, b) => {
        acc[b.reason] = (acc[b.reason] ?? 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      const topBlockerReason = Object.entries(blockerReasons).sort((a, b) => b[1] - a[1])[0]!;
      contributingFactors.push({
        key: "TASK_BLOCKER_CONTRIBUTION",
        label: `Task Blockers (${topBlockerReason[0]})`,
        category: "Operational Blockers",
        observedCount: blockers.length,
        evidenceLevel: "OBSERVED_FACT",
        explanation: `${blockers.length} task blockers recorded. The leading blocker reason was '${topBlockerReason[0]}' (${topBlockerReason[1]} occurrence(s)).`,
      });
    }

    // Task rework factor
    if (reworkTasks.length > 0) {
      contributingFactors.push({
        key: "REWORK_TASK_DELAY",
        label: "Task Rework Re-entries",
        category: "Quality",
        observedCount: reworkTasks.length,
        evidenceLevel: "OBSERVED_FACT",
        explanation: `${reworkTasks.length} task(s) required rework execution during the measured period, adding additional cycle dwell.`,
      });
    }

    const unknowns: DiagnosticUnknown[] = [
      {
        key: "STAFF_ROOT_CAUSE_NOT_CAPTURED",
        question: "Why did waiting or blocker states persist?",
        reason: "The domain does not capture individual technician or manager motives; free-text notes are not parsed to avoid subjective fabrication.",
      },
      {
        key: "FINANCIAL_DELAY_COST_NOT_COMPUTABLE",
        question: "What was the monetary cost of this delay?",
        reason: "Technician hourly cost rate and workshop facility holding cost rates are not modeled in the domain.",
      },
    ];

    const integrity: DiagnosticIntegrity = {
      sampleSize,
      baselineAvailable: false,
      insufficientSampleSize: sampleSize < MIN_SAMPLE_SIZE,
      historicalAttributionComplete: true,
      causalInferenceSupported: false,
      financialAttributionComputable: false,
      financialAttributionNote: "Financial holding costs and payroll cost rates are not captured in the domain.",
    };

    const outcome: DiagnosticOutcomeSummary = {
      title: workOrderId ? `Cycle Delay for Work Order #${workOrderId.slice(-6)}` : "Workflow Cycle Duration & Delay",
      description: "Analysis of lifecycle duration, active labor ratio, and queue dwell.",
      metricName: "Average Lifecycle Duration",
      metricValue: Number(avgLifecycleHours.toFixed(1)),
      metricUnit: "hours",
    };

    const topFactor = contributingFactors[0];
    const summary = topFactor
      ? `Workflow cycle duration averaged ${avgLifecycleHours.toFixed(1)} hrs. The primary evidence-supported contributor is ${topFactor.label.toLowerCase()} (${topFactor.explanation}).`
      : `Workflow cycle duration averaged ${avgLifecycleHours.toFixed(1)} hrs across ${sampleSize} work order(s).`;

    return {
      subject: "WORK_ORDER_DELAY",
      period: { from: range.from.toISOString(), to: range.to.toISOString() },
      scope: { tenantId, branchId, workOrderId },
      outcome,
      evidenceLevel: contributingFactors.length > 0 ? "RULE_BASED_CONTRIBUTOR" : "OBSERVED_FACT",
      summary,
      observedFacts,
      contributingFactors,
      evidenceReferences,
      unknowns,
      integrity,
    };
  }

  // ==========================================================================
  // 2. WORKFLOW BOTTLENECK
  // ==========================================================================
  private async analyzeBottleneck(
    tenantId: string,
    range: { from: Date; to: Date },
    branchId?: string,
  ): Promise<RootCauseAnalysisReport> {
    const branchFilter = branchId ? { branchId } : {};

    const rawEvents = await this.prisma.operationEvent.findMany({
      where: {
        tenantId,
        eventKey: "work_order.status_changed",
        createdAt: { gte: range.from, lte: range.to },
        ...branchFilter,
      },
      select: { id: true, payload: true, createdAt: true, workOrderId: true, branchId: true },
      orderBy: { createdAt: "asc" },
    });

    const statusEvents: StatusChangeEvent[] = rawEvents.map((e) => {
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

    const woIds = [...new Set(statusEvents.map((e) => e.workOrderId).filter((id) => id !== "unknown"))];
    const workOrders = await this.prisma.workOrder.findMany({
      where: { tenantId, id: { in: woIds }, ...branchFilter },
      select: { id: true, createdAt: true, closedAt: true, status: true, branchId: true },
    });

    if (workOrders.length === 0) {
      return this.insufficientEvidenceReport("WORKFLOW_BOTTLENECK", range, tenantId, branchId);
    }

    const metaMap = new Map<string, WorkOrderMeta>(
      workOrders.map((w) => [
        w.id,
        {
          workOrderId: w.id,
          createdAt: w.createdAt,
          closedAt: w.closedAt,
          initialStatus: "DRAFT",
          branchId: w.branchId,
          tenantId,
        },
      ]),
    );

    const durations = computeStatusDurations(statusEvents, range.to, metaMap);
    const loops = detectStatusLoops(statusEvents);

    // Sum dwell and count by status
    const statusDwellMap: Record<string, { totalMs: number; count: number }> = {};
    for (const d of durations) {
      for (const [s, ms] of Object.entries(d.msByStatus)) {
        if (!TERMINAL_STATUSES.includes(s)) {
          const entry = statusDwellMap[s] ?? { totalMs: 0, count: 0 };
          entry.totalMs += ms;
          entry.count += 1;
          statusDwellMap[s] = entry;
        }
      }
    }

    const sortedStages = Object.entries(statusDwellMap)
      .map(([status, { totalMs, count }]) => ({
        status,
        averageHours: count > 0 ? totalMs / (count * 3600000) : 0,
        totalHours: totalMs / 3600000,
        workOrderCount: count,
      }))
      .sort((a, b) => b.averageHours - a.averageHours);

    const bottleneckStage = sortedStages[0] ?? { status: "NONE", averageHours: 0, workOrderCount: 0 };

    // Inflow vs Outflow for bottleneck status
    const inflowCount = statusEvents.filter((e) => e.to === bottleneckStage.status).length;
    const outflowCount = statusEvents.filter((e) => e.from === bottleneckStage.status).length;

    // Loops for bottleneck status
    const loopCount = loops.filter((l) => l.reenteredStatus === bottleneckStage.status).length;

    const evidenceReferences: DiagnosticEvidenceReference[] = [];
    for (const w of workOrders.slice(0, 10)) {
      evidenceReferences.push({
        type: "WORK_ORDER",
        id: w.id,
        label: `WorkOrder #${w.id.slice(-6)}`,
        workOrderId: w.id,
        timestamp: w.createdAt.toISOString(),
      });
    }

    const observedFacts: DiagnosticFact[] = [
      {
        key: "PRIMARY_BOTTLENECK_STATUS",
        label: "Primary Bottleneck Stage",
        value: bottleneckStage.status,
        evidenceLevel: "OBSERVED_FACT",
        explanation: `Status '${bottleneckStage.status}' had the highest average dwell time (${bottleneckStage.averageHours.toFixed(1)} hrs).`,
      },
      {
        key: "STAGE_INFLOW_VS_OUTFLOW",
        label: "Stage Inflow vs Outflow",
        value: `${inflowCount} in / ${outflowCount} out`,
        evidenceLevel: "OBSERVED_FACT",
        explanation: `${inflowCount} work order(s) entered '${bottleneckStage.status}' and ${outflowCount} exited during the period.`,
      },
      {
        key: "REENTRY_LOOPS",
        label: "Status Re-entry Loops",
        value: loopCount,
        unit: "count",
        evidenceLevel: "OBSERVED_FACT",
        explanation: `${loopCount} workflow re-entry loop(s) observed back into '${bottleneckStage.status}'.`,
      },
    ];

    const contributingFactors: DiagnosticFactor[] = [];

    if (inflowCount > outflowCount) {
      contributingFactors.push({
        key: "BOTTLENECK_ACCUMULATION",
        label: `Work Order Accumulation in ${bottleneckStage.status}`,
        category: "Throughput Imbalance",
        observedCount: inflowCount - outflowCount,
        evidenceLevel: "RULE_BASED_CONTRIBUTOR",
        explanation: `Arrivals (${inflowCount}) exceeded exits (${outflowCount}), creating inventory backlog in '${bottleneckStage.status}'.`,
      });
    }

    if (loopCount > 0) {
      contributingFactors.push({
        key: "STATUS_LOOP_REENTRY",
        label: "Process Re-work Loops",
        category: "Workflow Churn",
        observedCount: loopCount,
        evidenceLevel: "OBSERVED_FACT",
        explanation: `Repeated transitions back into '${bottleneckStage.status}' demonstrate operational churn or rejection loops.`,
      });
    }

    const unknowns: DiagnosticUnknown[] = [
      {
        key: "STAGE_CAPACITY_LIMIT_NOT_CAPTURED",
        question: "Is stage throughput constrained by staffing or equipment?",
        reason: "Physical bay capacities and staffing schedules are not tracked in the domain.",
      },
    ];

    const outcome: DiagnosticOutcomeSummary = {
      title: `Workflow Bottleneck in ${bottleneckStage.status}`,
      description: `Analysis of queue dwell and flow constraints in ${bottleneckStage.status}.`,
      metricName: "Average Stage Dwell",
      metricValue: Number(bottleneckStage.averageHours.toFixed(1)),
      metricUnit: "hours",
    };

    return {
      subject: "WORKFLOW_BOTTLENECK",
      period: { from: range.from.toISOString(), to: range.to.toISOString() },
      scope: { tenantId, branchId },
      outcome,
      evidenceLevel: contributingFactors.length > 0 ? "RULE_BASED_CONTRIBUTOR" : "OBSERVED_FACT",
      summary: `The primary workflow bottleneck is '${bottleneckStage.status}' with an average dwell of ${bottleneckStage.averageHours.toFixed(1)} hours. ${inflowCount} entered and ${outflowCount} exited.`,
      observedFacts,
      contributingFactors,
      evidenceReferences,
      unknowns,
      integrity: {
        sampleSize: workOrders.length,
        baselineAvailable: false,
        insufficientSampleSize: workOrders.length < MIN_SAMPLE_SIZE,
        historicalAttributionComplete: true,
        causalInferenceSupported: false,
        financialAttributionComputable: false,
      },
    };
  }

  // ==========================================================================
  // 3. QC FAILURE
  // ==========================================================================
  private async analyzeQcFailure(
    tenantId: string,
    range: { from: Date; to: Date },
    branchId?: string,
    serviceKey?: string,
  ): Promise<RootCauseAnalysisReport> {
    const branchFilter = branchId ? { branchId } : {};

    const rawEvents = await this.prisma.operationEvent.findMany({
      where: {
        tenantId,
        eventKey: "work_order.status_changed",
        createdAt: { gte: range.from, lte: range.to },
        ...branchFilter,
      },
      select: { id: true, payload: true, createdAt: true, workOrderId: true, branchId: true },
      orderBy: { createdAt: "asc" },
    });

    const qcEvents = rawEvents.filter((e) => {
      const payload = e.payload as { from?: string; to?: string };
      return payload.from === "READY_FOR_QC";
    });

    if (qcEvents.length === 0) {
      return this.insufficientEvidenceReport("QC_FAILURE", range, tenantId, branchId, undefined, serviceKey);
    }

    const failedEvents = qcEvents.filter((e) => {
      const payload = e.payload as { to?: string };
      return payload.to === "QC_FAILED";
    });

    const failureCount = failedEvents.length;
    const totalQcEvals = qcEvents.length;
    const failureRate = safeDivide(failureCount, totalQcEvals) ?? 0;

    // Structured reasons from failed work orders
    const failedWoIds = [...new Set(failedEvents.map((e) => e.workOrderId).filter((id): id is string => Boolean(id)))];
    const failedWorkOrders = await this.prisma.workOrder.findMany({
      where: { tenantId, id: { in: failedWoIds } },
      select: { id: true, qcFailureReason: true, branchId: true, createdAt: true },
    });

    const reasonCounts: Record<string, number> = {};
    let unclassifiedCount = 0;
    for (const w of failedWorkOrders) {
      if (w.qcFailureReason) {
        reasonCounts[w.qcFailureReason] = (reasonCounts[w.qcFailureReason] ?? 0) + 1;
      } else {
        unclassifiedCount += 1;
      }
    }

    // Baseline calculation (organization-wide failure rate if branchId filter was applied)
    let baselineAvailable = false;
    let baselineRate: number | null = null;
    let baselineCount: number | undefined = undefined;

    if (branchId) {
      const allOrgEvents = await this.prisma.operationEvent.findMany({
        where: {
          tenantId,
          eventKey: "work_order.status_changed",
          createdAt: { gte: range.from, lte: range.to },
        },
        select: { payload: true },
      });
      const orgQcEvents = allOrgEvents.filter((e) => (e.payload as { from?: string }).from === "READY_FOR_QC");
      const orgFailedEvents = orgQcEvents.filter((e) => (e.payload as { to?: string }).to === "QC_FAILED");
      if (orgQcEvents.length >= MIN_SAMPLE_SIZE) {
        baselineAvailable = true;
        baselineRate = (orgFailedEvents.length / orgQcEvents.length) * 100;
        baselineCount = orgFailedEvents.length;
      }
    }

    const evidenceReferences: DiagnosticEvidenceReference[] = [];
    for (const e of failedEvents.slice(0, 10)) {
      evidenceReferences.push({
        type: "EVENT",
        id: e.id,
        label: "QC Failed Event",
        workOrderId: e.workOrderId ?? undefined,
        timestamp: e.createdAt.toISOString(),
      });
    }

    const observedFacts: DiagnosticFact[] = [
      {
        key: "TOTAL_QC_EVALUATIONS",
        label: "Total QC Evaluations",
        value: totalQcEvals,
        unit: "count",
        evidenceLevel: "OBSERVED_FACT",
        explanation: `${totalQcEvals} QC evaluation(s) conducted during the period.`,
      },
      {
        key: "QC_FAILURE_RATE",
        label: "QC Failure Rate",
        value: Number((failureRate * 100).toFixed(1)),
        unit: "percent",
        evidenceLevel: "OBSERVED_FACT",
        explanation: `${failureCount} evaluations resulted in QC failure (${(failureRate * 100).toFixed(1)}%).`,
      },
      {
        key: "UNCLASSIFIED_FAILURES",
        label: "Unclassified Historical Failures",
        value: unclassifiedCount,
        unit: "count",
        evidenceLevel: "OBSERVED_FACT",
        explanation: `${unclassifiedCount} failure(s) lack a structured prospective reason enum and remain unclassified.`,
      },
    ];

    const contributingFactors: DiagnosticFactor[] = [];

    // Structured reason concentration
    const sortedReasons = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]);
    if (sortedReasons.length > 0) {
      const [topReason, count] = sortedReasons[0]!;
      const share = safeDivide(count, failureCount) ?? 0;
      if (share >= 0.35) {
        contributingFactors.push({
          key: "QC_REASON_CONCENTRATION",
          label: `Concentration in ${topReason}`,
          category: "Structured Failure Reason",
          observedCount: count,
          rate: Number((share * 100).toFixed(1)),
          evidenceLevel: "RULE_BASED_CONTRIBUTOR",
          explanation: `${count} failure(s) (${(share * 100).toFixed(1)}% of failures) were explicitly recorded as '${topReason}'.`,
        });
      }
    }

    // Branch variance against baseline
    if (baselineAvailable && baselineRate !== null) {
      const currentRatePct = failureRate * 100;
      const delta = currentRatePct - baselineRate;
      if (delta > 5.0) {
        contributingFactors.push({
          key: "QC_BRANCH_ELEVATION",
          label: "Branch QC Failure Rate Elevated vs Org Baseline",
          category: "Branch Performance",
          rate: Number(currentRatePct.toFixed(1)),
          baselineRate: Number(baselineRate.toFixed(1)),
          delta: Number(delta.toFixed(1)),
          evidenceLevel: "STRONG_ASSOCIATION",
          explanation: `Branch QC failure rate (${currentRatePct.toFixed(1)}%) is statistically elevated above the organization baseline of ${baselineRate.toFixed(1)}% (delta: +${delta.toFixed(1)}%).`,
        });
      }
    }

    const unknowns: DiagnosticUnknown[] = [
      {
        key: "QC_EVALUATOR_INTENT_UNKNOWN",
        question: "Did evaluator rigor or vehicle condition drive failure rate?",
        reason: "Subjective evaluator criteria are not recorded beyond the authoritative pass/fail event and structured reason.",
      },
    ];

    const outcome: DiagnosticOutcomeSummary = {
      title: "Quality Control (QC) Failures",
      description: "Analysis of QC pass/fail evaluations, structured reasons, and failure concentrations.",
      metricName: "QC Failure Rate",
      metricValue: Number((failureRate * 100).toFixed(1)),
      metricUnit: "percent",
    };

    return {
      subject: "QC_FAILURE",
      period: { from: range.from.toISOString(), to: range.to.toISOString() },
      scope: { tenantId, branchId, serviceKey },
      outcome,
      evidenceLevel: contributingFactors.length > 0 ? "RULE_BASED_CONTRIBUTOR" : "OBSERVED_FACT",
      summary: `QC failure rate was ${(failureRate * 100).toFixed(1)}% (${failureCount}/${totalQcEvals}). ${contributingFactors.length > 0 ? contributingFactors[0]!.explanation : ""}`,
      observedFacts,
      contributingFactors,
      evidenceReferences,
      unknowns,
      integrity: {
        sampleSize: totalQcEvals,
        baselineAvailable,
        baselineSampleSize: baselineCount,
        insufficientSampleSize: totalQcEvals < MIN_SAMPLE_SIZE,
        historicalAttributionComplete: true,
        causalInferenceSupported: false,
        financialAttributionComputable: false,
      },
    };
  }

  // ==========================================================================
  // 4. TASK REWORK
  // ==========================================================================
  private async analyzeTaskRework(
    tenantId: string,
    range: { from: Date; to: Date },
    branchId?: string,
    serviceKey?: string,
    technicianId?: string,
  ): Promise<RootCauseAnalysisReport> {
    const branchFilter = branchId ? { workOrder: { branchId } } : {};
    const serviceFilter = serviceKey ? { serviceKey } : {};

    // Completed tasks in window
    const completedTasks = await this.prisma.task.findMany({
      where: {
        tenantId,
        status: "DONE",
        completedAt: { gte: range.from, lte: range.to },
        ...branchFilter,
        ...serviceFilter,
      },
      select: {
        id: true,
        title: true,
        workOrderId: true,
        serviceKey: true,
        originalTaskId: true,
        reworkReason: true,
        actualMinutes: true,
        assignments: {
          where: { unassignedAt: null },
          select: { staffUserId: true, staffUser: { select: { fullName: true } } },
        },
      },
    });

    if (completedTasks.length === 0) {
      return this.insufficientEvidenceReport("TASK_REWORK", range, tenantId, branchId, undefined, serviceKey, technicianId);
    }

    // All rework tasks
    const reworkTasks = await this.prisma.task.findMany({
      where: {
        tenantId,
        completedAt: { gte: range.from, lte: range.to },
        ...branchFilter,
        ...serviceFilter,
        OR: [{ originalTaskId: { not: null } }, { reworkReason: { not: null } }, { status: "RETURNED_FOR_REWORK" }],
      },
      select: {
        id: true,
        title: true,
        workOrderId: true,
        serviceKey: true,
        originalTaskId: true,
        reworkReason: true,
        actualMinutes: true,
        assignments: {
          where: { unassignedAt: null },
          select: { staffUserId: true, staffUser: { select: { fullName: true } } },
        },
      },
    });

    const sampleSize = completedTasks.length;
    const reworkTaskCount = reworkTasks.length;
    const tasksWithRework = new Set(reworkTasks.map((t) => t.originalTaskId ?? t.id)).size;
    const reworkRate = (safeDivide(tasksWithRework, sampleSize) ?? 0) * 100;

    let reworkLaborMinutes = 0;
    const reasonCounts: Record<string, number> = {};
    let parentLinkedCount = 0;

    for (const r of reworkTasks) {
      if (r.actualMinutes) reworkLaborMinutes += r.actualMinutes;
      if (r.reworkReason) {
        reasonCounts[r.reworkReason] = (reasonCounts[r.reworkReason] ?? 0) + 1;
      }
      if (r.originalTaskId) {
        parentLinkedCount += 1;
      }
    }

    // Baseline calculation (organization baseline if branch was filtered)
    let baselineAvailable = false;
    let baselineRate: number | null = null;
    let baselineSampleSize: number | undefined = undefined;

    if (branchId) {
      const orgCompleted = await this.prisma.task.count({
        where: { tenantId, status: "DONE", completedAt: { gte: range.from, lte: range.to } },
      });
      const orgRework = await this.prisma.task.count({
        where: {
          tenantId,
          completedAt: { gte: range.from, lte: range.to },
          OR: [{ originalTaskId: { not: null } }, { reworkReason: { not: null } }, { status: "RETURNED_FOR_REWORK" }],
        },
      });
      if (orgCompleted >= MIN_SAMPLE_SIZE) {
        baselineAvailable = true;
        baselineRate = (orgRework / orgCompleted) * 100;
        baselineSampleSize = orgCompleted;
      }
    }

    const evidenceReferences: DiagnosticEvidenceReference[] = [];
    for (const r of reworkTasks.slice(0, 10)) {
      evidenceReferences.push({
        type: "TASK",
        id: r.id,
        label: `Rework Task: ${r.title}`,
        workOrderId: r.workOrderId,
      });
    }

    const observedFacts: DiagnosticFact[] = [
      {
        key: "COMPLETED_TASKS_COUNT",
        label: "Completed Tasks",
        value: sampleSize,
        unit: "count",
        evidenceLevel: "OBSERVED_FACT",
        explanation: `${sampleSize} completed task(s) evaluated during the period.`,
      },
      {
        key: "TASK_REWORK_RATE",
        label: "Task Rework Rate",
        value: Number(reworkRate.toFixed(1)),
        unit: "percent",
        evidenceLevel: "OBSERVED_FACT",
        explanation: `${tasksWithRework} unique task(s) required rework out of ${sampleSize} completed (${reworkRate.toFixed(1)}%).`,
      },
      {
        key: "REWORK_LABOR_MINUTES",
        label: "Tracked Rework Labor",
        value: reworkLaborMinutes,
        unit: "minutes",
        evidenceLevel: "OBSERVED_FACT",
        explanation: `${reworkLaborMinutes} minutes of hands-on rework labor were tracked.`,
      },
    ];

    const contributingFactors: DiagnosticFactor[] = [];

    // Structured rework reason concentration
    const sortedReasons = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]);
    if (sortedReasons.length > 0) {
      const [topReason, count] = sortedReasons[0]!;
      const share = safeDivide(count, reworkTaskCount) ?? 0;
      if (share >= 0.35) {
        contributingFactors.push({
          key: "REWORK_REASON_CONCENTRATION",
          label: `Leading Rework Reason: ${topReason}`,
          category: "Structured Rework Reason",
          observedCount: count,
          rate: Number((share * 100).toFixed(1)),
          evidenceLevel: "RULE_BASED_CONTRIBUTOR",
          explanation: `${count} rework task(s) (${(share * 100).toFixed(1)}%) were explicitly logged with reason '${topReason}'.`,
        });
      }
    }

    // Lineage: Parent-child relationship is an OBSERVED_FACT, not a causal claim
    if (parentLinkedCount > 0) {
      contributingFactors.push({
        key: "REWORK_PARENT_LINEAGE",
        label: "Direct Parent-Task Rework Lineage",
        category: "Traceability",
        observedCount: parentLinkedCount,
        evidenceLevel: "OBSERVED_FACT",
        explanation: `${parentLinkedCount} rework task(s) possess authoritative parent-child links (originalTaskId) connecting them to the initial repair.`,
      });
    }

    // Branch elevation vs baseline
    if (baselineAvailable && baselineRate !== null) {
      const delta = reworkRate - baselineRate;
      if (delta > 3.0) {
        contributingFactors.push({
          key: "REWORK_BRANCH_ELEVATION",
          label: "Branch Rework Rate Elevated vs Baseline",
          category: "Branch Comparison",
          rate: Number(reworkRate.toFixed(1)),
          baselineRate: Number(baselineRate.toFixed(1)),
          delta: Number(delta.toFixed(1)),
          evidenceLevel: "STRONG_ASSOCIATION",
          explanation: `Branch rework rate (${reworkRate.toFixed(1)}%) is statistically elevated above the organization baseline (${baselineRate.toFixed(1)}%).`,
        });
      }
    }

    // Technician comparison with sample-size protection
    if (technicianId) {
      const techCompleted = completedTasks.filter((t) => t.assignments.some((a) => a.staffUserId === technicianId)).length;
      const techRework = reworkTasks.filter((t) => t.assignments.some((a) => a.staffUserId === technicianId)).length;
      if (techCompleted < MIN_SAMPLE_SIZE) {
        contributingFactors.push({
          key: "TECHNICIAN_SAMPLE_SIZE_PROTECTION",
          label: "Technician Sample Size Insufficient",
          category: "Technician Attribution",
          observedCount: techCompleted,
          evidenceLevel: "INSUFFICIENT_EVIDENCE",
          explanation: `Technician has fewer than ${MIN_SAMPLE_SIZE} completed tasks (${techCompleted}). Statistical ranking is suppressed to prevent misleading attribution.`,
        });
      } else {
        const techRate = (techRework / techCompleted) * 100;
        contributingFactors.push({
          key: "TECHNICIAN_REWORK_OBSERVATION",
          label: "Technician Observed Rework Rate",
          category: "Technician Attribution",
          observedCount: techRework,
          rate: Number(techRate.toFixed(1)),
          evidenceLevel: "STRONG_ASSOCIATION",
          explanation: `Technician observed rework rate was ${techRate.toFixed(1)}% across ${techCompleted} task(s). Stated as correlation; does not prove personal fault.`,
        });
      }
    }

    const unknowns: DiagnosticUnknown[] = [
      {
        key: "REWORK_FINANCIAL_COST_NOT_COMPUTABLE",
        question: "What was the monetary financial loss from rework?",
        reason: "Technician hourly cost rate and parts scrap ledger are not captured in the domain; selling price cannot be substituted for cost.",
      },
    ];

    const outcome: DiagnosticOutcomeSummary = {
      title: "Task Rework Intelligence",
      description: "Analysis of rework rates, structured rework reasons, and parent lineage.",
      metricName: "Task Rework Rate",
      metricValue: Number(reworkRate.toFixed(1)),
      metricUnit: "percent",
    };

    return {
      subject: "TASK_REWORK",
      period: { from: range.from.toISOString(), to: range.to.toISOString() },
      scope: { tenantId, branchId, serviceKey, technicianId },
      outcome,
      evidenceLevel: contributingFactors.some((f) => f.evidenceLevel === "RULE_BASED_CONTRIBUTOR")
        ? "RULE_BASED_CONTRIBUTOR"
        : "OBSERVED_FACT",
      summary: `Task rework rate was ${reworkRate.toFixed(1)}% across ${sampleSize} completed task(s) (${reworkTaskCount} rework task(s)). Tracked rework labor: ${reworkLaborMinutes} mins.`,
      observedFacts,
      contributingFactors,
      evidenceReferences,
      unknowns,
      integrity: {
        sampleSize,
        baselineAvailable,
        baselineSampleSize,
        insufficientSampleSize: sampleSize < MIN_SAMPLE_SIZE,
        historicalAttributionComplete: true,
        causalInferenceSupported: false,
        financialAttributionComputable: false,
        financialAttributionNote: "Technician cost rates and scrap allocation are not tracked.",
      },
    };
  }

  // ==========================================================================
  // 5. REPEAT VEHICLE VISIT
  // ==========================================================================
  private async analyzeRepeatVisits(
    tenantId: string,
    range: { from: Date; to: Date },
    branchId?: string,
  ): Promise<RootCauseAnalysisReport> {
    const branchFilter = branchId ? { branchId } : {};

    // Work orders created in window with asset
    const windowWorkOrders = await this.prisma.workOrder.findMany({
      where: {
        tenantId,
        createdAt: { gte: range.from, lte: range.to },
        ...branchFilter,
      },
      select: {
        id: true,
        assetId: true,
        createdAt: true,
        relinkedFromWorkOrderId: true,
        tasks: { select: { serviceKey: true } },
      },
    });

    if (windowWorkOrders.length === 0) {
      return this.insufficientEvidenceReport("REPEAT_VEHICLE_VISIT", range, tenantId, branchId);
    }

    const assetIds = [...new Set(windowWorkOrders.map((w) => w.assetId))];

    // Prior closed work orders for these assets
    const priorClosedOrders = await this.prisma.workOrder.findMany({
      where: {
        tenantId,
        assetId: { in: assetIds },
        closedAt: { not: null },
      },
      select: {
        id: true,
        assetId: true,
        closedAt: true,
        tasks: { select: { serviceKey: true } },
      },
    });

    let repeatVisitCount = 0;
    const repeatVehicles = new Set<string>();
    let relinkedCount = 0;
    let serviceOverlapCount = 0;
    const evidenceReferences: DiagnosticEvidenceReference[] = [];

    for (const curr of windowWorkOrders) {
      const prior = priorClosedOrders.find(
        (p) =>
          p.assetId === curr.assetId &&
          p.id !== curr.id &&
          p.closedAt &&
          p.closedAt.getTime() < curr.createdAt.getTime() &&
          curr.createdAt.getTime() - p.closedAt.getTime() <= 30 * 24 * 3600 * 1000,
      );

      if (prior) {
        repeatVisitCount += 1;
        repeatVehicles.add(curr.assetId);

        if (curr.relinkedFromWorkOrderId) {
          relinkedCount += 1;
        }

        // Service overlap check
        const priorKeys = new Set(prior.tasks.map((t) => t.serviceKey).filter(Boolean));
        const currKeys = curr.tasks.map((t) => t.serviceKey).filter(Boolean);
        if (currKeys.some((k) => priorKeys.has(k))) {
          serviceOverlapCount += 1;
        }

        evidenceReferences.push({
          type: "WORK_ORDER",
          id: curr.id,
          label: `Repeat Visit WO #${curr.id.slice(-6)}`,
          workOrderId: curr.id,
          timestamp: curr.createdAt.toISOString(),
        });
      }
    }

    const observedFacts: DiagnosticFact[] = [
      {
        key: "REPEAT_VISITS_COUNT_30D",
        label: "Repeat Visits Within 30 Days",
        value: repeatVisitCount,
        unit: "count",
        evidenceLevel: "OBSERVED_FACT",
        explanation: `${repeatVisitCount} work order(s) opened within 30 days of a prior closed job on the same vehicle.`,
      },
      {
        key: "UNIQUE_REPEAT_VEHICLES",
        label: "Unique Returning Vehicles",
        value: repeatVehicles.size,
        unit: "vehicles",
        evidenceLevel: "OBSERVED_FACT",
        explanation: `${repeatVehicles.size} unique vehicle(s) returned within 30 days.`,
      },
      {
        key: "RELINKED_REPEAT_JOBS",
        label: "Formally Relinked Repeat Jobs",
        value: relinkedCount,
        unit: "count",
        evidenceLevel: "OBSERVED_FACT",
        explanation: `${relinkedCount} of ${repeatVisitCount} repeat visits carry authoritative relink relations (relinkedFromWorkOrderId).`,
      },
    ];

    const contributingFactors: DiagnosticFactor[] = [];

    if (serviceOverlapCount > 0) {
      contributingFactors.push({
        key: "REPEAT_SERVICE_OVERLAP",
        label: "Service Overlap on Return Visit",
        category: "Service Overlap",
        observedCount: serviceOverlapCount,
        rate: Number(((serviceOverlapCount / (repeatVisitCount || 1)) * 100).toFixed(1)),
        evidenceLevel: "STRONG_ASSOCIATION",
        explanation: `${serviceOverlapCount} repeat visit(s) requested services identical to those performed on the prior visit.`,
      });
    }

    const unlinkedCount = repeatVisitCount - relinkedCount;
    if (unlinkedCount > 0) {
      contributingFactors.push({
        key: "UNLINKED_REPEAT_VISIT_ANOMALY",
        label: "Unlinked Repeat Vehicle Visits",
        category: "Data Integrity",
        observedCount: unlinkedCount,
        evidenceLevel: "RULE_BASED_CONTRIBUTOR",
        explanation: `${unlinkedCount} repeat visit(s) occurred without formal relinking (relinkedFromWorkOrderId is null).`,
      });
    }

    const unknowns: DiagnosticUnknown[] = [
      {
        key: "RETURN_VISIT_COMMERCIAL_INTENT_UNTRACKED",
        question: "Were return visits complimentary re-checks or independent new maintenance?",
        reason: "The platform tracks vehicle return visits within 30 days without asserting commercial liability, defect fault, or customer billing categorization.",
      },
    ];

    const outcome: DiagnosticOutcomeSummary = {
      title: "Repeat Vehicle Visits (Within 30 Days)",
      description: "Analysis of vehicles returning for workshop service within 30 days of job closure.",
      metricName: "Repeat Vehicle Visits (30d)",
      metricValue: repeatVisitCount,
      metricUnit: "visits",
    };

    return {
      subject: "REPEAT_VEHICLE_VISIT",
      period: { from: range.from.toISOString(), to: range.to.toISOString() },
      scope: { tenantId, branchId },
      outcome,
      evidenceLevel: contributingFactors.length > 0 ? "RULE_BASED_CONTRIBUTOR" : "OBSERVED_FACT",
      summary: `${repeatVisitCount} repeat vehicle visit(s) recorded within 30 days across ${repeatVehicles.size} vehicle(s). ${serviceOverlapCount} had service overlap.`,
      observedFacts,
      contributingFactors,
      evidenceReferences,
      unknowns,
      integrity: {
        sampleSize: windowWorkOrders.length,
        baselineAvailable: false,
        insufficientSampleSize: windowWorkOrders.length < MIN_SAMPLE_SIZE,
        historicalAttributionComplete: true,
        causalInferenceSupported: false,
        financialAttributionComputable: false,
      },
    };
  }

  // ==========================================================================
  // 6. FAULT RECURRENCE
  // ==========================================================================
  private async analyzeFaultRecurrence(
    tenantId: string,
    range: { from: Date; to: Date },
    branchId?: string,
  ): Promise<RootCauseAnalysisReport> {
    const branchFilter = branchId ? { workOrder: { branchId } } : {};

    const faultsInWindow = await this.prisma.fault.findMany({
      where: {
        tenantId,
        createdAt: { gte: range.from, lte: range.to },
        code: { not: null },
        ...branchFilter,
      },
      select: {
        id: true,
        code: true,
        severity: true,
        workOrderId: true,
        createdAt: true,
        workOrder: { select: { assetId: true } },
      },
    });

    if (faultsInWindow.length === 0) {
      return this.insufficientEvidenceReport("FAULT_RECURRENCE", range, tenantId, branchId);
    }

    const assetIds = [...new Set(faultsInWindow.map((f) => f.workOrder.assetId))];

    // All faults on these assets
    const allFaultsOnAssets = await this.prisma.fault.findMany({
      where: {
        tenantId,
        code: { not: null },
        workOrder: { assetId: { in: assetIds } },
      },
      select: {
        id: true,
        code: true,
        severity: true,
        workOrderId: true,
        createdAt: true,
        workOrder: { select: { assetId: true } },
      },
    });

    const recurringFaults: typeof faultsInWindow = [];
    const recurringCodes = new Set<string>();
    const evidenceReferences: DiagnosticEvidenceReference[] = [];

    for (const f of faultsInWindow) {
      const prior = allFaultsOnAssets.find(
        (p) =>
          p.id !== f.id &&
          p.workOrderId !== f.workOrderId &&
          p.workOrder.assetId === f.workOrder.assetId &&
          p.code === f.code &&
          p.createdAt.getTime() <= f.createdAt.getTime(),
      );

      if (prior) {
        recurringFaults.push(f);
        if (f.code) recurringCodes.add(f.code);
        evidenceReferences.push({
          type: "FAULT",
          id: f.id,
          label: `Fault Code: ${f.code}`,
          workOrderId: f.workOrderId,
          timestamp: f.createdAt.toISOString(),
        });
      }
    }

    const observedFacts: DiagnosticFact[] = [
      {
        key: "TOTAL_DIAGNOSED_FAULTS",
        label: "Total Diagnosed Faults",
        value: faultsInWindow.length,
        unit: "faults",
        evidenceLevel: "OBSERVED_FACT",
        explanation: `${faultsInWindow.length} fault(s) diagnosed during the period.`,
      },
      {
        key: "RECURRING_FAULT_OCCURRENCES",
        label: "Recurring Fault Occurrences",
        value: recurringFaults.length,
        unit: "count",
        evidenceLevel: "OBSERVED_FACT",
        explanation: `${recurringFaults.length} occurrence(s) matched a prior fault code on the same vehicle.`,
      },
      {
        key: "DISTINCT_RECURRING_CODES",
        label: "Distinct Recurring Codes",
        value: recurringCodes.size,
        unit: "codes",
        evidenceLevel: "OBSERVED_FACT",
        explanation: `${recurringCodes.size} unique code(s) recurred: ${[...recurringCodes].slice(0, 5).join(", ")}.`,
      },
    ];

    const contributingFactors: DiagnosticFactor[] = [];

    if (recurringFaults.length > 0) {
      const highSeverityCount = recurringFaults.filter((f) => f.severity === "CRITICAL" || f.severity === "HIGH").length;
      contributingFactors.push({
        key: "RECURRING_FAULT_PATTERN",
        label: "Persistent Diagnostic Fault Codes",
        category: "Diagnostic History",
        observedCount: recurringFaults.length,
        evidenceLevel: "OBSERVED_FACT",
        explanation: `${recurringFaults.length} fault occurrence(s) recurred on the same vehicle across distinct visits. (${highSeverityCount} high/critical severity).`,
      });
    }

    const unknowns: DiagnosticUnknown[] = [
      {
        key: "MECHANICAL_ROOT_CAUSE_NOT_ESTABLISHED",
        question: "Why did this fault recur?",
        reason: "Without sensor telemetry or part autopsy, root cause (intermittent component vs diagnosis error vs driving condition) cannot be proven.",
      },
    ];

    const outcome: DiagnosticOutcomeSummary = {
      title: "Diagnostic Fault Recurrence",
      description: "Analysis of identical fault codes reappearing on the same vehicle.",
      metricName: "Recurring Faults",
      metricValue: recurringFaults.length,
      metricUnit: "faults",
    };

    return {
      subject: "FAULT_RECURRENCE",
      period: { from: range.from.toISOString(), to: range.to.toISOString() },
      scope: { tenantId, branchId },
      outcome,
      evidenceLevel: recurringFaults.length > 0 ? "RULE_BASED_CONTRIBUTOR" : "OBSERVED_FACT",
      summary: `${recurringFaults.length} recurring fault occurrence(s) identified across ${recurringCodes.size} distinct code(s).`,
      observedFacts,
      contributingFactors,
      evidenceReferences,
      unknowns,
      integrity: {
        sampleSize: faultsInWindow.length,
        baselineAvailable: false,
        insufficientSampleSize: faultsInWindow.length < MIN_SAMPLE_SIZE,
        historicalAttributionComplete: true,
        causalInferenceSupported: false,
        financialAttributionComputable: false,
      },
    };
  }

  // ==========================================================================
  // 7. CUSTOMER DECISION DROP-OFF
  // ==========================================================================
  private async analyzeCustomerDecisions(
    tenantId: string,
    range: { from: Date; to: Date },
    branchId?: string,
  ): Promise<RootCauseAnalysisReport> {
    const branchFilter = branchId ? { workOrder: { branchId } } : {};

    const decisionRequests = await this.prisma.customerDecisionRequest.findMany({
      where: {
        tenantId,
        createdAt: { gte: range.from, lte: range.to },
        ...branchFilter,
      },
      include: {
        workOrder: { select: { id: true, status: true, closedAt: true } },
        items: {
          include: {
            tasks: {
              select: {
                id: true,
                title: true,
                status: true,
                startedAt: true,
                completedAt: true,
                createdAt: true,
                updatedAt: true,
              },
            },
          },
        },
      },
    });

    const allItems = decisionRequests.flatMap((r) => r.items.map((item) => ({ item, request: r })));

    if (allItems.length === 0) {
      return this.insufficientEvidenceReport("CUSTOMER_DECISION_DROP_OFF", range, tenantId, branchId);
    }

    let approvedCount = 0;
    let plannedCount = 0;
    let performedCount = 0;
    let unperformedApprovedCount = 0;
    let noWorkLinkedCount = 0;
    let expiredCount = 0;
    let declinedCount = 0;

    const evidenceReferences: DiagnosticEvidenceReference[] = [];

    for (const { item, request } of allItems) {
      const outcomeResult = resolveOutcome({
        decision: item.decision,
        decidedAt: item.decidedAt,
        requestStatus: request.status,
        sentAt: request.sentAt,
        viewedAt: request.viewedAt,
        respondedAt: request.respondedAt,
        expiresAt: request.expiresAt,
        workOrderStatus: request.workOrder.status,
        workOrderClosedAt: request.workOrder.closedAt,
        tasks: item.tasks,
        now: range.to,
      });
      const outcome = outcomeResult.outcome;

      if (outcome === "DECLINED") declinedCount += 1;
      if (outcome === "EXPIRED") expiredCount += 1;
      if (
        outcome === "APPROVED_NO_WORK_LINKED" ||
        outcome === "APPROVED_PLANNED" ||
        outcome === "APPROVED_IN_PROGRESS" ||
        outcome === "PARTIALLY_PERFORMED" ||
        outcome === "PERFORMED" ||
        outcome === "NOT_PERFORMED"
      ) {
        approvedCount += 1;
      }

      if (
        outcome === "APPROVED_PLANNED" ||
        outcome === "APPROVED_IN_PROGRESS" ||
        outcome === "PARTIALLY_PERFORMED" ||
        outcome === "PERFORMED"
      ) {
        plannedCount += 1;
      }

      if (outcome === "PERFORMED") {
        performedCount += 1;
      }

      if (
        outcome === "APPROVED_NO_WORK_LINKED" ||
        outcome === "APPROVED_PLANNED" ||
        outcome === "APPROVED_IN_PROGRESS" ||
        outcome === "PARTIALLY_PERFORMED" ||
        outcome === "NOT_PERFORMED"
      ) {
        unperformedApprovedCount += 1;
      }

      if (outcome === "APPROVED_NO_WORK_LINKED") {
        noWorkLinkedCount += 1;
        evidenceReferences.push({
          type: "DECISION_ITEM",
          id: item.id,
          label: `Approved Unlinked: ${item.name}`,
          timestamp: request.createdAt.toISOString(),
        });
      }
    }

    const approvalRate = (safeDivide(approvedCount, allItems.length) ?? 0) * 100;
    const fulfillmentRate = (safeDivide(performedCount, approvedCount) ?? 0) * 100;

    const observedFacts: DiagnosticFact[] = [
      {
        key: "TOTAL_RECOMMENDATIONS",
        label: "Total Recommendations",
        value: allItems.length,
        unit: "items",
        evidenceLevel: "OBSERVED_FACT",
        explanation: `${allItems.length} repair recommendation(s) were submitted to customers.`,
      },
      {
        key: "APPROVAL_RATE",
        label: "Customer Approval Rate",
        value: Number(approvalRate.toFixed(1)),
        unit: "percent",
        evidenceLevel: "OBSERVED_FACT",
        explanation: `${approvedCount} items were approved by customers (${approvalRate.toFixed(1)}%).`,
      },
      {
        key: "FULFILLMENT_RATE",
        label: "Workshop Fulfillment Rate",
        value: Number(fulfillmentRate.toFixed(1)),
        unit: "percent",
        evidenceLevel: "OBSERVED_FACT",
        explanation: `${performedCount} of ${approvedCount} approved items were fully performed (${fulfillmentRate.toFixed(1)}%).`,
      },
      {
        key: "APPROVED_UNPERFORMED",
        label: "Approved But Unperformed",
        value: unperformedApprovedCount,
        unit: "items",
        evidenceLevel: "OBSERVED_FACT",
        explanation: `${unperformedApprovedCount} approved item(s) were not fully completed.`,
      },
    ];

    const contributingFactors: DiagnosticFactor[] = [];

    // Gap between approval and task planning
    if (noWorkLinkedCount > 0) {
      contributingFactors.push({
        key: "APPROVAL_TO_PLANNING_GAP",
        label: "Approved Work Lacking Task Creation",
        category: "Planning Execution",
        observedCount: noWorkLinkedCount,
        rate: Number(((noWorkLinkedCount / (approvedCount || 1)) * 100).toFixed(1)),
        evidenceLevel: "RULE_BASED_CONTRIBUTOR",
        explanation: `${noWorkLinkedCount} approved item(s) had zero workshop tasks created (Task.decisionItemId is null).`,
      });
    }

    // Expiration without customer response
    if (expiredCount > 0) {
      contributingFactors.push({
        key: "DECISION_EXPIRATION_DROP",
        label: "Recommendations Expired Without Response",
        category: "Customer Engagement",
        observedCount: expiredCount,
        rate: Number(((expiredCount / allItems.length) * 100).toFixed(1)),
        evidenceLevel: "OBSERVED_FACT",
        explanation: `${expiredCount} recommendation(s) expired past the validity window without a customer decision.`,
      });
    }

    const unknowns: DiagnosticUnknown[] = [
      {
        key: "INVOICE_COLLECTION_ATTRIBUTION_NOT_COMPUTABLE",
        question: "How much revenue was lost from unperformed recommendations?",
        reason: "InvoiceLine lacks a foreign key to CustomerDecisionItem; billing totals cannot be attributed to specific decision lines without guessing.",
      },
    ];

    const outcome: DiagnosticOutcomeSummary = {
      title: "Customer Decision → Execution Drop-Off",
      description: "Analysis of recommendation approval, workshop planning, and execution fulfillment.",
      metricName: "Fulfillment Rate",
      metricValue: Number(fulfillmentRate.toFixed(1)),
      metricUnit: "percent",
    };

    return {
      subject: "CUSTOMER_DECISION_DROP_OFF",
      period: { from: range.from.toISOString(), to: range.to.toISOString() },
      scope: { tenantId, branchId },
      outcome,
      evidenceLevel: contributingFactors.length > 0 ? "RULE_BASED_CONTRIBUTOR" : "OBSERVED_FACT",
      summary: `Of ${allItems.length} recommendations, ${approvedCount} were approved (${approvalRate.toFixed(1)}%) and ${performedCount} completed (${fulfillmentRate.toFixed(1)}% fulfillment). ${noWorkLinkedCount} approved item(s) lacked linked tasks.`,
      observedFacts,
      contributingFactors,
      evidenceReferences,
      unknowns,
      integrity: {
        sampleSize: allItems.length,
        baselineAvailable: false,
        insufficientSampleSize: allItems.length < MIN_SAMPLE_SIZE,
        historicalAttributionComplete: true,
        causalInferenceSupported: false,
        financialAttributionComputable: false,
        financialAttributionNote: "InvoiceLine and Payment lack direct foreign-key attribution to decision lines.",
      },
    };
  }

  // ==========================================================================
  // 8. DELIVERY DELAY
  // ==========================================================================
  private async analyzeDeliveryDelay(
    tenantId: string,
    range: { from: Date; to: Date },
    branchId?: string,
  ): Promise<RootCauseAnalysisReport> {
    const branchFilter = branchId ? { branchId } : {};

    const closedWorkOrders = await this.prisma.workOrder.findMany({
      where: {
        tenantId,
        status: "CLOSED",
        closedAt: { gte: range.from, lte: range.to },
        ...branchFilter,
      },
      select: { id: true, createdAt: true, closedAt: true, branchId: true },
    });

    if (closedWorkOrders.length === 0) {
      return this.insufficientEvidenceReport("DELIVERY_DELAY", range, tenantId, branchId);
    }

    const woIds = closedWorkOrders.map((w) => w.id);

    const deliveryEvents = await this.prisma.operationEvent.findMany({
      where: {
        tenantId,
        eventKey: "work_order.status_changed",
        workOrderId: { in: woIds },
      },
      select: { id: true, payload: true, createdAt: true, workOrderId: true },
      orderBy: { createdAt: "asc" },
    });

    const readyAtMap = new Map<string, Date>();
    const paymentPendingMap = new Map<string, number>();

    for (const e of deliveryEvents) {
      const payload = e.payload as { to?: string; from?: string };
      const woId = e.workOrderId;
      if (!woId) continue;

      if (payload.to === "READY_FOR_DELIVERY" && !readyAtMap.has(woId)) {
        readyAtMap.set(woId, e.createdAt);
      }
    }

    let totalGapHours = 0;
    let gapCount = 0;
    const evidenceReferences: DiagnosticEvidenceReference[] = [];

    for (const w of closedWorkOrders) {
      const readyAt = readyAtMap.get(w.id);
      if (readyAt && w.closedAt) {
        const gapMs = w.closedAt.getTime() - readyAt.getTime();
        if (gapMs >= 0) {
          totalGapHours += gapMs / 3600000;
          gapCount += 1;
          evidenceReferences.push({
            type: "WORK_ORDER",
            id: w.id,
            label: `Delivered WorkOrder #${w.id.slice(-6)}`,
            workOrderId: w.id,
            timestamp: w.closedAt.toISOString(),
          });
        }
      }
    }

    const avgGapHours = gapCount > 0 ? totalGapHours / gapCount : 0;

    const observedFacts: DiagnosticFact[] = [
      {
        key: "DELIVERY_GAP_HOURS",
        label: "Average Delivery Gap",
        value: Number(avgGapHours.toFixed(1)),
        unit: "hours",
        evidenceLevel: "OBSERVED_FACT",
        explanation: `Work orders averaged ${avgGapHours.toFixed(1)} hours between reaching READY_FOR_DELIVERY and final closure.`,
      },
      {
        key: "MEASURED_DELIVERIES",
        label: "Measured Deliveries",
        value: gapCount,
        unit: "jobs",
        evidenceLevel: "OBSERVED_FACT",
        explanation: `${gapCount} work order(s) reached both delivery and closure stages during the period.`,
      },
    ];

    const contributingFactors: DiagnosticFactor[] = [];

    if (avgGapHours >= 24) {
      contributingFactors.push({
        key: "EXTENDED_HANDOVER_DWELL",
        label: "Extended Handover Dwell (> 24 hrs)",
        category: "Handover Delay",
        rate: Number(avgGapHours.toFixed(1)),
        evidenceLevel: "RULE_BASED_CONTRIBUTOR",
        explanation: `Work orders spent an average of ${avgGapHours.toFixed(1)} hours awaiting physical customer vehicle handover.`,
      });
    }

    const unknowns: DiagnosticUnknown[] = [
      {
        key: "CUSTOMER_PICKUP_REASON_NOT_RECORDED",
        question: "Why was customer vehicle pickup delayed?",
        reason: "Customer personal schedules and external transport arrangements are not recorded in the domain.",
      },
    ];

    const outcome: DiagnosticOutcomeSummary = {
      title: "Delivery & Handover Cycle",
      description: "Analysis of time elapsed between repair completion and customer handover.",
      metricName: "Average Delivery Gap",
      metricValue: Number(avgGapHours.toFixed(1)),
      metricUnit: "hours",
    };

    return {
      subject: "DELIVERY_DELAY",
      period: { from: range.from.toISOString(), to: range.to.toISOString() },
      scope: { tenantId, branchId },
      outcome,
      evidenceLevel: contributingFactors.length > 0 ? "RULE_BASED_CONTRIBUTOR" : "OBSERVED_FACT",
      summary: `Average delivery gap was ${avgGapHours.toFixed(1)} hours across ${gapCount} closed work order(s).`,
      observedFacts,
      contributingFactors,
      evidenceReferences,
      unknowns,
      integrity: {
        sampleSize: gapCount,
        baselineAvailable: false,
        insufficientSampleSize: gapCount < MIN_SAMPLE_SIZE,
        historicalAttributionComplete: true,
        causalInferenceSupported: false,
        financialAttributionComputable: false,
      },
    };
  }

  // ==========================================================================
  // HELPER: INSUFFICIENT EVIDENCE REPORT
  // ==========================================================================
  private insufficientEvidenceReport(
    subject: DiagnosticSubject,
    range: { from: Date; to: Date },
    tenantId: string,
    branchId?: string,
    workOrderId?: string,
    serviceKey?: string,
    technicianId?: string,
  ): RootCauseAnalysisReport {
    return {
      subject,
      period: { from: range.from.toISOString(), to: range.to.toISOString() },
      scope: { tenantId, branchId, workOrderId, serviceKey, technicianId },
      outcome: {
        title: `Insufficient Evidence for ${subject}`,
        description: "No qualifying events or operational records were found for the specified period and filters.",
        metricName: "Sample Count",
        metricValue: 0,
        metricUnit: "records",
      },
      evidenceLevel: "INSUFFICIENT_EVIDENCE",
      summary: "Available domain evidence is insufficient to determine root causes. No matching records were found in the selected reporting window.",
      observedFacts: [],
      contributingFactors: [],
      evidenceReferences: [],
      unknowns: [
        {
          key: "NO_MATCHING_RECORDS",
          question: "Why are there no diagnostic findings?",
          reason: "Zero qualifying domain records exist within the requested scope and date window.",
        },
      ],
      integrity: {
        sampleSize: 0,
        baselineAvailable: false,
        insufficientSampleSize: true,
        historicalAttributionComplete: true,
        causalInferenceSupported: false,
        financialAttributionComputable: false,
      },
    };
  }
}
