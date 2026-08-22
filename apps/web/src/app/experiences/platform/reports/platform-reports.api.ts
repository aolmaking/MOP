import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import type { HealthStatus } from '../workshops/platform-workshops.api';

export interface PlatformTotals {
  readonly totalWorkshops: number;
  readonly activeWorkshops: number;
  readonly totalStaffUsers: number;
  readonly totalCustomers: number;
  readonly aggregateMrr: null;
}

export interface WorkshopReportCard {
  readonly id: string;
  readonly name: string;
  readonly health: HealthStatus;
  readonly planName: string;
  readonly status: string;
  readonly lastActivityAt: string | null;
  readonly staffUserCount: number;
  readonly customerCount: number;
  readonly activeUserCount: number;
  readonly usageScore: number;
  readonly featureAdoptionPercent: number | null;
  readonly builderAdoptionPercent: number;
}

export interface PlatformReportsOverview {
  readonly totals: PlatformTotals;
  readonly workshops: { readonly items: readonly WorkshopReportCard[]; readonly total: number; readonly page: number; readonly pageSize: number };
}

export interface UsageOverview {
  readonly activeUsers: { readonly staff: number; readonly customer: number };
  readonly loginsByDay: readonly { readonly date: string; readonly count: number }[];
  readonly ownerLastLogin: { readonly at: string | null; readonly staleDays: number | null; readonly isStale: boolean };
  readonly staffActivity: readonly {
    readonly staffUserId: string;
    readonly fullName: string;
    readonly role: string;
    readonly lastAction: string | null;
    readonly lastActionAt: string | null;
  }[];
  readonly customerPortal: { readonly sessions: number; readonly distinctCustomers: number; readonly decisionResponseRate: number | null };
}

export type UsageTrend = 'UP' | 'DOWN' | 'FLAT' | 'NEW';

export interface PlatformFeatureUsageRow {
  readonly key: string;
  readonly label: string;
  readonly capabilityKey: string | null;
  readonly enabled: boolean;
  readonly enablementStatus: string;
  readonly currentUsage: number;
  readonly previousUsage: number;
  readonly trend: UsageTrend;
  readonly adoptionSignal: 'DISABLED' | 'USED' | 'ENABLED_UNUSED';
  readonly metric: string;
}

export interface PlatformFeatureUsage {
  readonly windowDays: 30 | 90;
  readonly from: string;
  readonly to: string;
  readonly rows: readonly PlatformFeatureUsageRow[];
  readonly enabledFeatureCount: number;
  readonly enabledUsedFeatureCount: number;
  readonly adoptionPercent: number | null;
}

export interface BuilderAdoption {
  readonly themeCustomized: boolean;
  readonly pagesCustomized: number;
  readonly formsCustomized: number;
  readonly messagesCustomized: number;
  readonly lastPublish: { readonly at: string; readonly by: string; readonly version: number } | null;
  readonly rollbackCount: number;
  readonly validationFailures: number;
  readonly highRiskChanges: readonly { readonly id: string; readonly action: string; readonly at: string; readonly riskLevel: string }[];
  readonly adoptionPercent: number;
}

export interface OperationalActivity {
  readonly workOrders: { readonly created: number; readonly completed: number; readonly completionRate: number | null };
  readonly activeTasks: number;
  readonly waiting: { readonly customer: number; readonly parts: number };
  readonly blockers: { readonly open: number; readonly resolvedThisPeriod: number };
  readonly inventoryMovements: readonly { readonly type: string; readonly count: number }[];
  readonly paymentsRecorded: { readonly count: number; readonly totalAmount: number; readonly currency: string };
  readonly invoicesIssued: number;
}

export interface CommercialSnapshot {
  readonly plan: string;
  readonly subscriptionStatus: string;
  readonly paidStatus: null;
  readonly renewalDate: null;
  readonly overdueAmount: null;
  readonly mrrContribution: null;
  readonly note: string;
}

export interface HealthRisk {
  readonly status: HealthStatus;
  readonly warnings: readonly { readonly code: string; readonly message: string }[];
  readonly ownerInactivityDays: number | null;
  readonly lowStaffUsageCount: number;
  readonly failedLogins: { readonly count: number; readonly spike: boolean | null };
  readonly builderValidationErrors: number;
  readonly paymentRisk: null;
  readonly frozenOrSuspendedHistory: readonly { readonly at: string; readonly action: string }[];
  readonly lowFeatureAdoptionCount: number;
}

export interface PlatformReportDetail {
  readonly workshop: { readonly id: string; readonly name: string; readonly planName: string; readonly status: string; readonly currency: string };
  readonly usageOverview: UsageOverview;
  readonly featureUsage: PlatformFeatureUsage;
  readonly builderAdoption: BuilderAdoption;
  readonly operationalActivity: OperationalActivity;
  readonly commercialSnapshot: CommercialSnapshot;
  readonly healthRisk: HealthRisk;
}

export interface ReportsFilters {
  page?: number;
  pageSize?: number;
  search?: string;
  sort?: string;
}

@Injectable({ providedIn: 'root' })
export class PlatformReportsApi {
  private readonly http = inject(HttpClient);

  overview(filters: ReportsFilters): Observable<PlatformReportsOverview> {
    const params: Record<string, string> = {};
    if (filters.page) params['page'] = String(filters.page);
    if (filters.pageSize) params['pageSize'] = String(filters.pageSize);
    if (filters.search) params['search'] = filters.search;
    if (filters.sort) params['sort'] = filters.sort;
    return this.http.get<PlatformReportsOverview>('/api/v1/platform/reports', { params });
  }

  usage(id: string, windowDays: 30 | 90): Observable<UsageOverview> {
    return this.http.get<UsageOverview>(`/api/v1/platform/reports/${id}/usage`, { params: { window: String(windowDays) } });
  }

  detail(id: string, windowDays: 30 | 90): Observable<PlatformReportDetail> {
    return this.http.get<PlatformReportDetail>(`/api/v1/platform/reports/${id}`, { params: { window: String(windowDays) } });
  }
}
