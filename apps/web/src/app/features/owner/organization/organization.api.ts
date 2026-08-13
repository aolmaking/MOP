import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

export type StaffRole = 'TENANT_ADMIN' | 'BRANCH_MANAGER' | 'TECHNICIAN' | 'INVENTORY_MANAGER' | 'TEAM_LEADER' | 'DATA_ANALYST';

export interface StaffListItem {
  readonly id: string;
  readonly fullName: string;
  readonly role: StaffRole;
  readonly branchScope: string[];
  readonly warehouseScope: string[];
  readonly categoryScope: string[];
  readonly isActive: boolean;
  readonly lockedAt: string | null;
  readonly email: string | null;
  readonly accountStatus: string;
}

export interface StaffPage {
  readonly items: readonly StaffListItem[];
  readonly nextCursor: string | null;
}

export interface InviteStaffInput {
  readonly fullName: string;
  readonly email: string;
  readonly phone: string;
  readonly role: StaffRole;
  readonly branchScope?: string[];
  readonly warehouseScope?: string[];
}

@Injectable({ providedIn: 'root' })
export class OrganizationApi {
  private readonly http = inject(HttpClient);

  listStaff(cursor?: string): Observable<StaffPage> {
    return this.http.get<StaffPage>('/api/v1/organization/staff', { params: cursor ? { cursor } : {} });
  }

  inviteStaff(input: InviteStaffInput): Observable<{ staffId: string }> {
    return this.http.post<{ staffId: string }>('/api/v1/organization/staff', input);
  }

  setActive(staffId: string, isActive: boolean): Observable<{ ok: true }> {
    return this.http.patch<{ ok: true }>(`/api/v1/organization/staff/${staffId}/active`, { isActive });
  }

  setLocked(staffId: string, locked: boolean): Observable<{ ok: true }> {
    return this.http.patch<{ ok: true }>(`/api/v1/organization/staff/${staffId}/locked`, { locked });
  }
}
