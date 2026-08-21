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
  readonly usageScore: number;
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
}
