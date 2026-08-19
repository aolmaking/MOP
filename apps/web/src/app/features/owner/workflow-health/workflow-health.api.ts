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
}
