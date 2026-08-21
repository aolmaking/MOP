import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

export interface VehicleMatch {
  readonly id: string;
  readonly category: string;
  readonly identifier: string | null;
  readonly ownerCustomerId: string | null;
  readonly ownerName: string | null;
}

export interface CustomerMatch {
  readonly id: string;
  readonly fullName: string;
  readonly phone: string;
  readonly vehicles: readonly VehicleMatch[];
}

export interface IntakeLookupResult {
  readonly customers: readonly CustomerMatch[];
  readonly vehicles: readonly VehicleMatch[];
}

export interface BranchOption {
  readonly id: string;
  readonly name: string;
  readonly code: string;
}

export interface IntakeRequest {
  readonly branchId: string;
  readonly customer: { existingCustomerId?: string; fullName?: string; phone?: string; email?: string };
  readonly asset: { existingAssetId?: string; category?: string; plateNumber?: string; vinOrChassisNumber?: string };
  readonly complaint?: string;
  readonly inspectionDeclined?: boolean;
  readonly confirmOwnershipTransfer?: boolean;
}

export interface IntakeResult {
  readonly workOrderId: string;
  readonly customerId: string;
  readonly assetId: string;
  readonly status: string;
  readonly ownershipTransferred: boolean;
}

@Injectable({ providedIn: 'root' })
export class IntakeApi {
  private readonly http = inject(HttpClient);

  search(query: string): Observable<IntakeLookupResult> {
    return this.http.get<IntakeLookupResult>('/api/v1/branch-manager/intake/search', { params: { q: query } });
  }

  branches(): Observable<{ branches: BranchOption[] }> {
    return this.http.get<{ branches: BranchOption[] }>('/api/v1/branch-manager/intake/branches');
  }

  create(request: IntakeRequest): Observable<IntakeResult> {
    return this.http.post<IntakeResult>('/api/v1/branch-manager/intake', request);
  }
}
