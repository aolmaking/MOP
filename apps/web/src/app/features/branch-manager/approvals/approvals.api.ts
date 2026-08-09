import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

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

  delivery(): Observable<DeliveryBoard> {
    return this.http.get<DeliveryBoard>('/api/v1/branch-manager/delivery');
  }
}
