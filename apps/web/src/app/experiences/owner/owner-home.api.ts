import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

export interface OwnerHome {
  readonly workshopStatus: { activeBranches: number; totalBranches: number; activeUsers: number };
  readonly openWorkOrders: number;
  readonly waitingCustomerApproval: number;
  readonly waitingParts: number;
  readonly waitingPayment: number;
  readonly lowStock: number;
  readonly recentChanges: readonly {
    id: string;
    actorName: string;
    action: string;
    targetType: string;
    createdAt: string;
  }[];
}

@Injectable({ providedIn: 'root' })
export class OwnerHomeApi {
  private readonly http = inject(HttpClient);

  home(): Observable<OwnerHome> {
    return this.http.get<OwnerHome>('/api/v1/owner/home');
  }
}
