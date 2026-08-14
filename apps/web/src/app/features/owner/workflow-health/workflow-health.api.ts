import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

export type IntegrityIssueType =
  | 'PART_ARRIVAL_UNCONFIRMED'
  | 'CUSTOMER_RESPONSE_NOT_REFLECTED'
  | 'RETURN_PENDING_REVIEW'
  | 'TEAM_LEADER_MISSING_REPORT_ACCESS'
  | 'WORK_ORDER_TASK_STATUS_CONFLICT'
  | 'ORPHANED_STATUS_CHANGE';

export interface IntegrityIssue {
  readonly type: IntegrityIssueType;
  readonly severity: 'INFO' | 'WARNING' | 'CRITICAL';
  readonly description: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly link: string;
  readonly ownerFixable: boolean;
  readonly detectedAt: string;
}

export interface MissingCapabilityNote {
  readonly issueType: string;
  readonly reason: string;
}

export interface IntegrityReport {
  readonly issues: readonly IntegrityIssue[];
  readonly notComputable: readonly MissingCapabilityNote[];
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

  bottlenecks(from?: string, to?: string): Observable<BottlenecksReport> {
    const params: Record<string, string> = {};
    if (from) params['from'] = from;
    if (to) params['to'] = to;
    return this.http.get<BottlenecksReport>('/api/v1/organization/workflow-health/bottlenecks', { params });
  }
}
