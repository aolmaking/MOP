import { HttpClient, HttpParams } from '@angular/common/http';
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

export interface FulfillmentFunnel {
  readonly recommendationsCreated: number;
  readonly sent: number;
  readonly viewed: number;
  readonly responded: number;
  readonly approved: number;
  readonly planned: number;
  readonly started: number;
  readonly performed: number;
  readonly invoiced: null;
  readonly invoicedNotComputableReason: string;
  readonly collected: null;
  readonly collectedNotComputableReason: string;
}

export interface DecisionConversionRates {
  readonly responseRate: number;
  readonly approvalRate: number;
  readonly rejectionRate: number;
  readonly planningRate: number;
  readonly executionRate: number;
  readonly fulfillmentRate: number;
  readonly dropOffRate: number;
}

export interface DecisionValueSummary {
  readonly currency: string;
  readonly totalRecommendedValue: number;
  readonly approvedValue: number;
  readonly plannedValue: number;
  readonly performedValue: number;
  readonly unperformedApprovedValue: number;
  readonly invoicedValue: null;
  readonly invoicedValueNotComputableReason: string;
  readonly collectedValue: null;
  readonly collectedValueNotComputableReason: string;
}

export interface UnperformedBreakdownItem {
  readonly count: number;
  readonly value: number;
}

export interface UnperformedBreakdown {
  readonly noWorkLinked: UnperformedBreakdownItem;
  readonly plannedNotStarted: UnperformedBreakdownItem;
  readonly inProgress: UnperformedBreakdownItem;
  readonly partiallyPerformed: UnperformedBreakdownItem;
  readonly abandonedTerminal: UnperformedBreakdownItem;
}

export interface DecisionOutcomeRow {
  readonly outcome: string;
  readonly label: string;
  readonly count: number;
  readonly totalValue: number;
}

export interface DecisionTimingSummary {
  readonly averageResponseHours: number | null;
  readonly averagePlanningHours: number | null;
  readonly averageExecutionHours: number | null;
}

export interface ApprovalByImportanceRow {
  readonly importance: string;
  readonly total: number;
  readonly approved: number;
  readonly rejected: number;
  readonly pending: number;
  readonly performed: number;
  readonly approvedValue: number;
  readonly performedValue: number;
  readonly lostValue: number;
}

export interface DecisionIntegrityAnomalies {
  readonly approvedWithoutTasks: number;
  readonly terminalWithoutExecution: number;
}

export interface DecisionsAnalyticsReport {
  readonly range: { from: string; to: string };
  readonly approvalRate: number;
  readonly rejectionRate: number;
  readonly planningRate: number;
  readonly executionRate: number;
  readonly fulfillmentRate: number;
  readonly dropOffRate: number;
  readonly byImportance: readonly ApprovalByImportanceRow[];
  readonly averageResponseHours: number | null;
  readonly overdueRate: number;
  readonly criticalRejections: number;
  readonly criticalRejectionsLaterApproved: number;
  readonly linkOpenRate: number;

  readonly funnel: FulfillmentFunnel;
  readonly rates: DecisionConversionRates;
  readonly value: DecisionValueSummary;
  readonly unperformedBreakdown: UnperformedBreakdown;
  readonly outcomes: readonly DecisionOutcomeRow[];
  readonly timing: DecisionTimingSummary;
  readonly integrity: DecisionIntegrityAnomalies;
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

  operations(params?: { from?: string; to?: string; groupBy?: string }): Observable<OperationsAnalyticsReport> {
    let httpParams = new HttpParams();
    if (params?.from) httpParams = httpParams.set('from', params.from);
    if (params?.to) httpParams = httpParams.set('to', params.to);
    if (params?.groupBy) httpParams = httpParams.set('groupBy', params.groupBy);
    return this.http.get<OperationsAnalyticsReport>('/api/v1/analytics/operations', { params: httpParams });
  }

  people(params?: { from?: string; to?: string }): Observable<PeopleAnalyticsReport> {
    let httpParams = new HttpParams();
    if (params?.from) httpParams = httpParams.set('from', params.from);
    if (params?.to) httpParams = httpParams.set('to', params.to);
    return this.http.get<PeopleAnalyticsReport>('/api/v1/analytics/people', { params: httpParams });
  }

  inventory(): Observable<InventoryAnalyticsReport> {
    return this.http.get<InventoryAnalyticsReport>('/api/v1/analytics/inventory');
  }

  decisions(params?: { from?: string; to?: string }): Observable<DecisionsAnalyticsReport> {
    let httpParams = new HttpParams();
    if (params?.from) httpParams = httpParams.set('from', params.from);
    if (params?.to) httpParams = httpParams.set('to', params.to);
    return this.http.get<DecisionsAnalyticsReport>('/api/v1/analytics/decisions', { params: httpParams });
  }

  featureAdoption(params?: { from?: string; to?: string }): Observable<FeatureAdoptionReport> {
    let httpParams = new HttpParams();
    if (params?.from) httpParams = httpParams.set('from', params.from);
    if (params?.to) httpParams = httpParams.set('to', params.to);
    return this.http.get<FeatureAdoptionReport>('/api/v1/analytics/feature-adoption', { params: httpParams });
  }

  exportCsv(
    category: AnalystSavedViewSourcePage,
    params?: { from?: string; to?: string; groupBy?: string },
  ): Observable<Blob> {
    let httpParams = new HttpParams();
    if (params?.from) httpParams = httpParams.set('from', params.from);
    if (params?.to) httpParams = httpParams.set('to', params.to);
    if (params?.groupBy) httpParams = httpParams.set('groupBy', params.groupBy);
    return this.http.get(`/api/v1/analytics/export/${category}`, { responseType: 'blob', params: httpParams });
  }

  savedViews(): Observable<{ items: readonly AnalystSavedView[] }> {
    return this.http.get<{ items: readonly AnalystSavedView[] }>('/api/v1/analytics/saved-views');
  }

  saveView(input: CreateAnalystSavedView): Observable<AnalystSavedView> {
    return this.http.post<AnalystSavedView>('/api/v1/analytics/saved-views', input);
  }

  renameView(id: string, name: string): Observable<AnalystSavedView> {
    return this.http.patch<AnalystSavedView>(`/api/v1/analytics/saved-views/${id}`, { name });
  }

  deleteView(id: string): Observable<{ ok: true }> {
    return this.http.delete<{ ok: true }>(`/api/v1/analytics/saved-views/${id}`);
  }
}
