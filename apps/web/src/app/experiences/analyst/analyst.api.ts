import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

export type AnalyticsHomePageKey = 'operations' | 'people' | 'inventory' | 'decisions' | 'feature-adoption';

export interface AnalyticsHomeTile {
  readonly page: AnalyticsHomePageKey;
  readonly label: string;
  readonly metrics: readonly { readonly label: string; readonly value: string }[];
}

export interface VolumePoint {
  readonly bucket: string;
  readonly created: number;
  readonly completed: number;
}

export interface OperationsAnalyticsReport {
  readonly range: { from: string; to: string };
  readonly volume: readonly VolumePoint[];
  readonly statusDistribution: readonly { status: string; count: number }[];
  readonly timeInStatus: readonly { status: string; averageHours: number }[];
  readonly branchComparison: readonly { branchId: string; branchName: string; created: number; completed: number }[] | null;
  readonly blockers: readonly { reason: string; count: number }[];
  readonly deliveryFunnel: {
    reachedReadyForDelivery: number;
    reachedClosed: number;
    averageGapHours: number | null;
  };
}

export interface TechnicianRow {
  readonly staffUserId: string;
  readonly fullName: string;
  readonly tasksCompleted: number;
  readonly averageTaskHours: number | null;
  readonly reworkRate: number;
  readonly blockerCount: number;
}

export interface PeopleAnalyticsReport {
  readonly range: { from: string; to: string };
  readonly technicians: readonly TechnicianRow[];
  readonly teamThroughput: readonly { teamId: string; teamName: string; tasksCompleted: number }[];
  readonly diagnosticCodeActivity: readonly { code: string; count: number }[];
}

export interface InventoryAnalyticsReport {
  readonly operational: {
    windowDays: number;
    usage: readonly { itemId: string; name: string; sku: string; issued: number; movements: number }[];
    categoryUsage: readonly { category: string; issued: number }[];
    stockRisk: readonly { itemId: string; name: string; available: number; velocity: number; daysLeft: number | null }[];
    returns: { total: number; backToStock: number; damaged: number };
    warehouseComparison: readonly { warehouseId: string; name: string; issued: number }[] | null;
  };
  readonly consumptionByCategory: readonly { category: string; issued: number }[];
  readonly inventoryValue: number | null;
}

export interface DecisionsAnalyticsReport {
  readonly range: { from: string; to: string };
  readonly approvalRate: number;
  readonly rejectionRate: number;
  readonly byImportance: readonly { importance: string; approved: number; rejected: number; pending: number }[];
  readonly averageResponseHours: number | null;
  readonly overdueRate: number;
  readonly criticalRejections: number;
  readonly criticalRejectionsLaterApproved: number;
  readonly linkOpenRate: number;
}

export interface FeatureAdoptionReport {
  readonly range: { from: string; to: string };
  readonly features: readonly { feature: string; usageCount: number; zeroUsage: boolean }[];
  readonly notTrackable: readonly { feature: string; reason: string }[];
}

export type AnalystSavedViewSourcePage = 'OPERATIONS' | 'PEOPLE' | 'INVENTORY' | 'DECISIONS' | 'FEATURE_ADOPTION';

export interface AnalystSavedView {
  readonly id: string;
  readonly name: string;
  readonly sourcePage: AnalystSavedViewSourcePage;
  readonly configuration: Record<string, unknown>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateAnalystSavedView {
  readonly name: string;
  readonly sourcePage: AnalystSavedViewSourcePage;
  readonly configuration: Record<string, unknown>;
}

@Injectable({ providedIn: 'root' })
export class AnalystApi {
  private readonly http = inject(HttpClient);

  home(): Observable<{ tiles: readonly AnalyticsHomeTile[] }> {
    return this.http.get<{ tiles: readonly AnalyticsHomeTile[] }>('/api/v1/analytics/home');
  }

  operations(): Observable<OperationsAnalyticsReport> {
    return this.http.get<OperationsAnalyticsReport>('/api/v1/analytics/operations');
  }

  people(): Observable<PeopleAnalyticsReport> {
    return this.http.get<PeopleAnalyticsReport>('/api/v1/analytics/people');
  }

  inventory(): Observable<InventoryAnalyticsReport> {
    return this.http.get<InventoryAnalyticsReport>('/api/v1/analytics/inventory');
  }

  decisions(): Observable<DecisionsAnalyticsReport> {
    return this.http.get<DecisionsAnalyticsReport>('/api/v1/analytics/decisions');
  }

  featureAdoption(): Observable<FeatureAdoptionReport> {
    return this.http.get<FeatureAdoptionReport>('/api/v1/analytics/feature-adoption');
  }

  savedViews(): Observable<{ items: readonly AnalystSavedView[] }> {
    return this.http.get<{ items: readonly AnalystSavedView[] }>('/api/v1/analytics/saved-views');
  }

  saveView(input: CreateAnalystSavedView): Observable<AnalystSavedView> {
    return this.http.post<AnalystSavedView>('/api/v1/analytics/saved-views', input);
  }

  exportCsv(sourcePage: AnalystSavedViewSourcePage, configuration: Record<string, unknown>): Observable<Blob> {
    const params: Record<string, string> = { sourcePage };
    const range = configuration['range'];
    if (isRange(range)) {
      params['from'] = range.from;
      params['to'] = range.to;
    }
    const groupBy = configuration['groupBy'];
    if (typeof groupBy === 'string') params['groupBy'] = groupBy;
    return this.http.get('/api/v1/analytics/export', { params, responseType: 'blob' });
  }

  renameView(id: string, name: string): Observable<AnalystSavedView> {
    return this.http.patch<AnalystSavedView>(`/api/v1/analytics/saved-views/${id}`, { name });
  }

  deleteView(id: string): Observable<{ ok: true }> {
    return this.http.delete<{ ok: true }>(`/api/v1/analytics/saved-views/${id}`);
  }
}

function isRange(value: unknown): value is { from: string; to: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { from?: unknown }).from === 'string' &&
    typeof (value as { to?: unknown }).to === 'string'
  );
}
