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
