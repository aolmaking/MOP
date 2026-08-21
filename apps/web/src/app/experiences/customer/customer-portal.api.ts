import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, type Observable } from 'rxjs';
import type { PublicDecision, SubmittedAnswer } from '../../domain/decisions/decision-answer';
import type { PresentedJourney } from '../../domain/journey/workflow-strip';

export interface PortalHome {
  readonly assetCount: number;
  readonly currentServiceCount: number;
  readonly pendingDecisions: number;
  readonly openInvoiceBalance: string;
  readonly recentActivity: readonly { id: string; message: string; createdAt: string }[];
}

export interface PortalAsset {
  readonly id: string;
  readonly category: string;
  readonly plateNumber: string | null;
  readonly vinOrChassisNumber: string | null;
  readonly ownedSince: string;
}

export interface CurrentServiceItem {
  readonly workOrderId: string;
  readonly status: string;
  readonly asset: string;
  readonly createdAt: string;
}

export interface InvoiceStatusRow {
  readonly invoiceId: string;
  readonly invoiceNumber: string;
  readonly status: string;
  readonly total: string;
  readonly paid: string;
  readonly balance: string;
  readonly issuedAt: string;
}

/**
 * A decision waiting on this customer. Exactly the shape the public
 * token page renders, plus the id needed to answer it from inside a
 * session -- the two ends of this feature share one contract rather
 * than two that have to be kept matching by hand.
 */
export type PendingDecision = PublicDecision & { readonly requestId: string };

export interface SafeHistoryEntry {
  readonly id: string;
  readonly assetId: string;
  readonly summary: string;
  readonly serviceDate: string;
}

@Injectable({ providedIn: 'root' })
export class CustomerPortalApi {
  private readonly http = inject(HttpClient);

  home(): Observable<PortalHome> {
    return this.http.get<PortalHome>('/api/v1/customer-portal/home');
  }

  assets(): Observable<readonly PortalAsset[]> {
    return this.http.get<readonly PortalAsset[]>('/api/v1/customer-portal/assets');
  }

  currentService(): Observable<readonly CurrentServiceItem[]> {
    return this.http.get<readonly CurrentServiceItem[]>('/api/v1/customer-portal/current-service');
  }

  invoices(): Observable<readonly InvoiceStatusRow[]> {
    return this.http.get<readonly InvoiceStatusRow[]>('/api/v1/customer-portal/invoices');
  }

  pendingDecisions(): Observable<readonly PendingDecision[]> {
    return this.http
      .get<{ decisions: readonly PendingDecision[] }>('/api/v1/customer-portal/decisions')
      .pipe(map((response) => response.decisions));
  }

  respondToDecision(requestId: string, answers: readonly SubmittedAnswer[]): Observable<PublicDecision> {
    return this.http.post<PublicDecision>(`/api/v1/customer-portal/decisions/${requestId}/respond`, { answers });
  }

  journey(workOrderId: string): Observable<PresentedJourney> {
    return this.http.get<PresentedJourney>(`/api/v1/customer-portal/service/${workOrderId}/journey`);
  }

  safeHistory(): Observable<readonly SafeHistoryEntry[]> {
    return this.http.get<readonly SafeHistoryEntry[]>('/api/v1/customer-portal/safe-history');
  }
}
