import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import type { PublicDecision, SubmittedAnswer } from '../../../domain/decisions/decision-answer';

export interface ApprovalRow {
  readonly requestId: string;
  readonly workOrderId: string;
  readonly identifier: string | null;
  readonly customerName: string;
  readonly customerPhone: string;
  readonly status: string;
  readonly waitingHours: number;
  readonly sent: boolean;
  readonly itemCount: number;
  readonly decidedCount: number;
  /** A string. Money is never a JS number. */
  readonly pendingTotal: string;
  readonly hasCritical: boolean;
}

export interface ApprovalsResult {
  readonly waiting: readonly ApprovalRow[];
  readonly unsent: readonly ApprovalRow[];
}

export interface DeliveryCandidate {
  readonly workOrderId: string;
  readonly identifier: string | null;
  readonly customerName: string;
  readonly customerPhone: string;
  readonly status: string;
  readonly waitingHours: number;
  readonly canLeave: boolean;
  readonly blockedBy: readonly string[];
  /**
   * The invoice still owing money on this job, or null. Server-derived
   * through Finance, which owns the question -- the page never works it
   * out from a balance.
   */
  readonly unsettledInvoiceId: string | null;
}

export interface DeliveryBoard {
  readonly ready: readonly DeliveryCandidate[];
  readonly held: readonly DeliveryCandidate[];
}

@Injectable({ providedIn: 'root' })
export class ApprovalsApi {
  private readonly http = inject(HttpClient);

  approvals(): Observable<ApprovalsResult> {
    return this.http.get<ApprovalsResult>('/api/v1/branch-manager/approvals');
  }

  /**
   * Hand the car back. The server re-runs the delivery gates, so a board
   * left open in a tab can never release a car that stopped qualifying.
   */
  releaseDelivery(workOrderId: string): Observable<unknown> {
    return this.http.post(`/api/v1/branch-manager/work-orders/${workOrderId}/deliver`, {});
  }

  delivery(): Observable<DeliveryBoard> {
    return this.http.get<DeliveryBoard>('/api/v1/branch-manager/delivery');
  }

  /** Read the same way the customer's own token link reads it, before recording an answer on their behalf. */
  approvalDetail(requestId: string): Observable<PublicDecision> {
    return this.http.get<PublicDecision>(`/api/v1/branch-manager/approvals/${requestId}`);
  }

  /**
   * P-18: record a decision the customer gave verbally rather than
   * through their portal or link. Refused server-side (409/400) if the
   * workshop's PORTAL_COUNTER_APPROVAL policy forbids it or demands
   * evidence this call did not include.
   */
  recordDecision(
    requestId: string,
    answers: readonly SubmittedAnswer[],
    evidenceReference?: string,
  ): Observable<{ ok: true }> {
    return this.http.post<{ ok: true }>(`/api/v1/branch-manager/approvals/${requestId}/record`, {
      answers,
      evidenceReference: evidenceReference?.trim() || undefined,
    });
  }
}
