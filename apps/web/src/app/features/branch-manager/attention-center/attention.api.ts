import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

export type AttentionKind =
  | 'CRITICAL_REJECTION_UNACKNOWLEDGED'
  | 'TECHNICIAN_BLOCKED'
  | 'CUSTOMER_APPROVAL_WAITING'
  | 'READY_UNPAID'
  | 'WAITING_PARTS'
  | 'REWORK_REQUIRED';

export type PrimaryAction =
  | 'CHASE_CUSTOMER'
  | 'ESCALATE_CRITICAL'
  | 'RESOLVE_BLOCKER'
  | 'CHECK_PARTS'
  | 'TAKE_PAYMENT'
  | 'REASSIGN';

export interface AttentionRank {
  /** Lower is more urgent. Tier 1 is safety. */
  tier: number;
  waitingHours: number;
  escalated: boolean;
  score: number;
}

/**
 * Note what is absent: no prices, no cost, no internal notes. Restricted
 * data is left out of the response entirely rather than hidden here --
 * anyone can open developer tools.
 */
export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  workOrderId: string;
  identifier: string | null;
  customerName: string;
  branchId: string;
  /** A full sentence including the wait, built server-side. */
  reason: string;
  waitingSince: string;
  rank: AttentionRank;
  primaryAction: PrimaryAction;
}

export interface AttentionCenterResponse {
  items: AttentionItem[];
  counts: Record<string, number>;
  generatedAt: string;
}

/**
 * The ranking is deliberately NOT recomputed here. It arrives ordered and
 * scored from the server so that this page, a future mobile view and any
 * report can never disagree about what is most urgent.
 */
@Injectable({ providedIn: 'root' })
export class AttentionApi {
  private readonly http = inject(HttpClient);

  attention(): Observable<AttentionCenterResponse> {
    return this.http.get<AttentionCenterResponse>('/api/v1/branch-manager/attention');
  }
}
