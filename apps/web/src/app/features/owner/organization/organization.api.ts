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

export interface BranchListItem {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly city: string | null;
  readonly warehouseCount: number;
  readonly staffCount: number;
  readonly isActive: boolean;
}

export interface WarehouseListItem {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly linkedBranches: readonly { id: string; name: string }[];
  readonly isActive: boolean;
}

export interface OrganizationInfrastructure {
  readonly branches: readonly BranchListItem[];
  readonly warehouses: readonly WarehouseListItem[];
  readonly links: readonly { branchId: string; warehouseId: string }[];
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

  infrastructure(): Observable<OrganizationInfrastructure> {
    return this.http.get<OrganizationInfrastructure>('/api/v1/organization/infrastructure');
  }

  createBranch(input: { name: string; code?: string; address?: string; city?: string }): Observable<{ id: string }> {
    return this.http.post<{ id: string }>('/api/v1/organization/branches', input);
  }

  setBranchActive(branchId: string, isActive: boolean): Observable<{ ok: true }> {
    return this.http.patch<{ ok: true }>(`/api/v1/organization/branches/${branchId}/active`, { isActive });
  }

  createWarehouse(input: { name: string; code?: string }): Observable<{ id: string }> {
    return this.http.post<{ id: string }>('/api/v1/organization/warehouses', input);
  }

  setLink(branchId: string, warehouseId: string, linked: boolean): Observable<{ ok: true }> {
    return this.http.post<{ ok: true }>('/api/v1/organization/branch-warehouse-links', { branchId, warehouseId, linked });
  }
}
