import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

export type IntegrityIssueType =
  | 'PART_ARRIVAL_UNCONFIRMED'
  | 'CUSTOMER_RESPONSE_NOT_REFLECTED'
  | 'RETURN_PENDING_REVIEW'
  | 'TEAM_LEADER_MISSING_REPORT_ACCESS'
  | 'WORK_ORDER_TASK_STATUS_CONFLICT'
  | 'ORPHANED_STATUS_CHANGE';

export type IntegrityIssueSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

/** OPEN until somebody records that they have looked at it. */
export type IntegrityIssueStatus = 'OPEN' | 'ACKNOWLEDGED' | 'INVESTIGATING' | 'ESCALATED';

export interface IntegrityIssue {
  /** Stable across scans, so a decision about it survives a rescan. */
  readonly id: string;
  readonly type: IntegrityIssueType;
  readonly severity: IntegrityIssueSeverity;
  readonly description: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly link: string;
  readonly ownerFixable: boolean;
  readonly detectedAt: string;
  readonly status: IntegrityIssueStatus;
  readonly note: string | null;
  readonly handledBy: string | null;
  readonly handledAt: string | null;
}

/** One row per fault class -- the cause, not each symptom of it. */
export interface IntegrityGroup {
  readonly type: IntegrityIssueType;
  readonly severity: IntegrityIssueSeverity;
  readonly total: number;
  readonly open: number;
  readonly handled: number;
  readonly ownerFixable: boolean;
  readonly whatItMeans: string;
  readonly recommendedAction: string;
  readonly fixableBy: string;
}

export interface IntegrityTotals {
  readonly all: number;
  readonly critical: number;
  readonly warning: number;
  readonly info: number;
  readonly open: number;
  readonly handled: number;
}

export interface MissingCapabilityNote {
  readonly issueType: string;
  readonly reason: string;
}

export interface IntegrityReport {
  readonly issues: readonly IntegrityIssue[];
  readonly groups: readonly IntegrityGroup[];
  /** Always describes every detected issue, never just the filtered view. */
  readonly totals: IntegrityTotals;
  readonly scannedAt: string;
  readonly notComputable: readonly MissingCapabilityNote[];
}

export interface IssueFilters {
  readonly severity?: IntegrityIssueSeverity;
  readonly type?: string;
  readonly status?: 'open' | 'handled';
}

export type WaitingCause = 'PEOPLE' | 'INVENTORY' | 'APPROVAL' | 'PAYMENT' | 'QUALITY' | 'OTHER';

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
  readonly taskReworkCount?: number;
}

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

export type DiagnosticSubject =
  | 'WORK_ORDER_DELAY'
  | 'WORKFLOW_BOTTLENECK'
  | 'QC_FAILURE'
  | 'TASK_REWORK'
  | 'REPEAT_VEHICLE_VISIT'
  | 'FAULT_RECURRENCE'
  | 'CUSTOMER_DECISION_DROP_OFF'
  | 'DELIVERY_DELAY';

export type DiagnosticEvidenceLevel =
  | 'OBSERVED_FACT'
  | 'RULE_BASED_CONTRIBUTOR'
  | 'STRONG_ASSOCIATION'
  | 'CAUSAL_LINK'
  | 'INSUFFICIENT_EVIDENCE';

export interface DiagnosticEvidenceReference {
  readonly type: 'WORK_ORDER' | 'TASK' | 'EVENT' | 'FAULT' | 'DECISION_ITEM' | 'BLOCKER';
  readonly id: string;
  readonly label?: string;
  readonly workOrderId?: string;
  readonly timestamp?: string;
}

export interface DiagnosticFact {
  readonly key: string;
  readonly label: string;
  readonly value: string | number;
  readonly unit?: string;
  readonly evidenceLevel: 'OBSERVED_FACT';
  readonly explanation: string;
  readonly evidenceIds?: readonly string[];
}

export interface DiagnosticFactor {
  readonly key: string;
  readonly label: string;
  readonly category: string;
  readonly observedCount?: number;
  readonly baselineCount?: number;
  readonly rate?: number | null;
  readonly baselineRate?: number | null;
  readonly delta?: number | null;
  readonly evidenceLevel: DiagnosticEvidenceLevel;
  readonly explanation: string;
  readonly evidenceIds?: readonly string[];
}

export interface DiagnosticUnknown {
  readonly key: string;
  readonly question: string;
  readonly reason: string;
}

export interface DiagnosticIntegrity {
  readonly sampleSize: number;
  readonly baselineAvailable: boolean;
  readonly baselineSampleSize?: number;
  readonly insufficientSampleSize: boolean;
  readonly historicalAttributionComplete: boolean;
  readonly causalInferenceSupported: boolean;
  readonly financialAttributionComputable: boolean;
  readonly financialAttributionNote?: string;
}

export interface DiagnosticOutcomeSummary {
  readonly title: string;
  readonly description: string;
  readonly metricName: string;
  readonly metricValue: number | string | null;
  readonly metricUnit?: string;
}

export interface RootCauseAnalysisReport {
  readonly subject: DiagnosticSubject;
  readonly period: { readonly from: string; readonly to: string };
  readonly scope: {
    readonly tenantId: string;
    readonly branchId?: string;
    readonly serviceKey?: string;
    readonly technicianId?: string;
    readonly workOrderId?: string;
  };
  readonly outcome: DiagnosticOutcomeSummary;
  readonly evidenceLevel: DiagnosticEvidenceLevel;
  readonly summary: string;
  readonly observedFacts: readonly DiagnosticFact[];
  readonly contributingFactors: readonly DiagnosticFactor[];
  readonly evidenceReferences: readonly DiagnosticEvidenceReference[];
  readonly unknowns: readonly DiagnosticUnknown[];
  readonly integrity: DiagnosticIntegrity;
}

@Injectable({ providedIn: 'root' })
export class WorkflowHealthApi {
  private readonly http = inject(HttpClient);

  issues(): Observable<IntegrityReport> {
    return this.http.get<IntegrityReport>('/api/v1/organization/workflow-health/issues');
  }

  issuesFiltered(filters: IssueFilters): Observable<IntegrityReport> {
    let params = new HttpParams();
    if (filters.severity) params = params.set('severity', filters.severity);
    if (filters.type) params = params.set('type', filters.type);
    if (filters.status) params = params.set('status', filters.status);
    return this.http.get<IntegrityReport>('/api/v1/organization/workflow-health/issues', { params });
  }

  /**
   * Records what somebody decided. There is no "resolve": an issue is
   * resolved when the records stop producing it.
   */
  acknowledgeIssue(
    issueId: string,
    body: { status: Exclude<IntegrityIssueStatus, 'OPEN'>; note: string },
  ): Observable<{ fingerprint: string; status: string }> {
    return this.http.post<{ fingerprint: string; status: string }>(
      `/api/v1/organization/workflow-health/issues/${encodeURIComponent(issueId)}/acknowledge`,
      body,
    );
  }

  bottlenecks(from?: string, to?: string): Observable<BottlenecksReport> {
    const params: Record<string, string> = {};
    if (from) params['from'] = from;
    if (to) params['to'] = to;
    return this.http.get<BottlenecksReport>('/api/v1/organization/workflow-health/bottlenecks', { params });
  }

  quality(from?: string, to?: string, branchId?: string): Observable<QualityIntelligenceReport> {
    const params: Record<string, string> = {};
    if (from) params['from'] = from;
    if (to) params['to'] = to;
    if (branchId) params['branchId'] = branchId;
    return this.http.get<QualityIntelligenceReport>('/api/v1/organization/workflow-health/quality', { params });
  }

  rootCause(query: {
    subject?: DiagnosticSubject;
    from?: string;
    to?: string;
    branchId?: string;
    serviceKey?: string;
    technicianId?: string;
    workOrderId?: string;
  }): Observable<RootCauseAnalysisReport> {
    const params: Record<string, string> = {};
    if (query.subject) params['subject'] = query.subject;
    if (query.from) params['from'] = query.from;
    if (query.to) params['to'] = query.to;
    if (query.branchId) params['branchId'] = query.branchId;
    if (query.serviceKey) params['serviceKey'] = query.serviceKey;
    if (query.technicianId) params['technicianId'] = query.technicianId;
    if (query.workOrderId) params['workOrderId'] = query.workOrderId;
    return this.http.get<RootCauseAnalysisReport>('/api/v1/organization/workflow-health/root-cause', { params });
  }
}
