import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

export interface RoleLock {
  readonly id: string;
  readonly role: string;
  readonly permissionKey: string;
  /** What the lock pins the permission to. */
  readonly allowed: boolean;
  readonly reason: string;
  readonly lockedBy: string;
  readonly createdAt: string;
}

export interface RoleLockHistoryEntry extends RoleLock {
  readonly removedAt: string | null;
  readonly removedBy: string | null;
}

export interface WorkshopSummary {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly status: string;
}

export type EntitlementField = 'maxBranches' | 'maxUsers' | 'maxWarehouses' | 'allowedExports';

export interface EntitlementOverride {
  readonly id: string;
  readonly field: EntitlementField;
  readonly value: number | readonly string[];
  readonly reason: string | null;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly active: boolean;
}

export interface EntitlementFieldSummary {
  readonly field: EntitlementField;
  readonly label: string;
  readonly kind: 'number' | 'list';
  readonly planDefault: number | readonly string[];
  readonly effective: number | readonly string[];
  readonly usage?: number;
  readonly options?: readonly string[];
  readonly override: EntitlementOverride | null;
}

export interface TenantEntitlementsSummary {
  readonly tenant: { readonly id: string; readonly name: string; readonly plan: { readonly id: string; readonly code: string; readonly name: string } };
  readonly usage: { readonly branches: number; readonly users: number; readonly warehouses: number };
  readonly fields: readonly EntitlementFieldSummary[];
}

@Injectable({ providedIn: 'root' })
export class ControlCenterApi {
  private readonly http = inject(HttpClient);

  /** Reuses the Workshops list -- Control Center governs the same tenants. */
  workshops(): Observable<{ items: WorkshopSummary[] }> {
    return this.http.get<{ items: WorkshopSummary[] }>('/api/v1/platform/workshops', {
      params: { pageSize: '100' },
    });
  }

  activeLocks(tenantId: string): Observable<RoleLock[]> {
    return this.http.get<RoleLock[]>(`/api/v1/platform/governance/workshops/${tenantId}/role-locks`);
  }

  lockHistory(tenantId: string): Observable<RoleLockHistoryEntry[]> {
    return this.http.get<RoleLockHistoryEntry[]>(
      `/api/v1/platform/governance/workshops/${tenantId}/role-locks/history`,
    );
  }

  entitlements(tenantId: string): Observable<TenantEntitlementsSummary> {
    return this.http.get<TenantEntitlementsSummary>(`/api/v1/platform/governance/workshops/${tenantId}/entitlements`);
  }

  setEntitlementOverride(
    tenantId: string,
    body:
      | { field: Exclude<EntitlementField, 'allowedExports'>; numericValue: number; reason: string }
      | { field: 'allowedExports'; stringValues: readonly string[]; reason: string },
  ): Observable<TenantEntitlementsSummary> {
    return this.http.post<TenantEntitlementsSummary>(`/api/v1/platform/governance/workshops/${tenantId}/entitlements`, body);
  }

  clearEntitlementOverride(
    tenantId: string,
    body: { field: EntitlementField; reason: string },
  ): Observable<TenantEntitlementsSummary> {
    return this.http.post<TenantEntitlementsSummary>(
      `/api/v1/platform/governance/workshops/${tenantId}/entitlements/clear`,
      body,
    );
  }

  /**
   * `allowed` is the decision the lock pins: locking a permission ON is
   * as much a governance act as locking it off, and the platform must be
   * able to guarantee either. The Owner cannot move it afterwards.
   */
  setLock(
    tenantId: string,
    body: { role: string; permissionKey: string; allowed: boolean; reason: string },
  ): Observable<RoleLock> {
    return this.http.post<RoleLock>(`/api/v1/platform/governance/workshops/${tenantId}/role-locks`, body);
  }

  removeLock(tenantId: string, body: { role: string; permissionKey: string; reason: string }): Observable<{ ok: true }> {
    return this.http.post<{ ok: true }>(
      `/api/v1/platform/governance/workshops/${tenantId}/role-locks/remove`,
      body,
    );
  }

  archive(tenantId: string, reason: string): Observable<{ ok: true }> {
    return this.http.post<{ ok: true }>(`/api/v1/platform/governance/workshops/${tenantId}/archive`, { reason });
  }

  reactivate(tenantId: string, reason: string): Observable<{ ok: true }> {
    return this.http.post<{ ok: true }>(`/api/v1/platform/governance/workshops/${tenantId}/reactivate`, { reason });
  }
}
