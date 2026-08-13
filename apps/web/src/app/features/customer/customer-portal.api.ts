import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

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

  safeHistory(): Observable<readonly SafeHistoryEntry[]> {
    return this.http.get<readonly SafeHistoryEntry[]>('/api/v1/customer-portal/safe-history');
  }
}
