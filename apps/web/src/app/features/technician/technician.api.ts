import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

export interface TechnicianJob {
  readonly workOrderId: string;
  readonly identifier: string | null;
  readonly customerName: string;
  readonly status: string;
  readonly complaint: string | null;
  readonly inspectionDeclined: boolean;
  readonly myTaskCount: number;
  readonly myOpenTaskCount: number;
  readonly active: boolean;
  readonly blocked: boolean;
  readonly sinceHours: number;
}

export interface TechnicianTask {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly blockedReason: string | null;
}

export interface FinishCheck {
  readonly available: boolean;
  readonly passed: boolean;
  readonly conditions: readonly { satisfied: boolean; text: string }[];
}

export interface WorkCard {
  readonly workOrderId: string;
  readonly identifier: string | null;
  readonly customerName: string;
  readonly status: string;
  readonly complaint: string | null;
  readonly inspectionDeclined: boolean;
  readonly tasks: readonly TechnicianTask[];
  readonly finish: FinishCheck;
}

export interface AssetHistoryVisit {
  readonly workOrderId: string;
  readonly status: string;
  readonly createdAt: string;
  readonly closedAt: string | null;
  readonly complaint: string | null;
  readonly inspections: readonly { readonly type: string; readonly note: string | null; readonly createdAt: string }[];
  readonly faults: readonly {
    readonly code: string | null;
    readonly description: string;
    readonly severity: string;
    readonly recommendedService: string | null;
  }[];
  readonly partsUsed: readonly { readonly name: string; readonly quantity: number }[];
  readonly decisions: readonly { readonly name: string; readonly decision: string }[];
  readonly sameOwnerAsCurrent: boolean;
}

export interface AssetHistorySummary {
  readonly assetId: string;
  readonly identifier: string | null;
  readonly totalPriorVisits: number;
  readonly hasPriorOwnerHistory: boolean;
  readonly visits: readonly AssetHistoryVisit[];
}

@Injectable({ providedIn: 'root' })
export class TechnicianApi {
  private readonly http = inject(HttpClient);

  active(): Observable<{ job: TechnicianJob | null }> {
    return this.http.get<{ job: TechnicianJob | null }>('/api/v1/technician/active');
  }

  myWork(): Observable<{ jobs: TechnicianJob[] }> {
    return this.http.get<{ jobs: TechnicianJob[] }>('/api/v1/technician/my-work');
  }

  workCard(id: string): Observable<WorkCard> {
    return this.http.get<WorkCard>(`/api/v1/technician/work-orders/${id}`);
  }

  vehicleHistory(workOrderId: string): Observable<AssetHistorySummary> {
    return this.http.get<AssetHistorySummary>(`/api/v1/technician/work-orders/${workOrderId}/vehicle-history`);
  }

  startTask(taskId: string): Observable<unknown> {
    return this.http.post(`/api/v1/technician/tasks/${taskId}/start`, {});
  }

  completeTask(taskId: string): Observable<unknown> {
    return this.http.post(`/api/v1/technician/tasks/${taskId}/complete`, {});
  }

  reportBlocker(taskId: string, reason: string, note?: string): Observable<unknown> {
    return this.http.post(`/api/v1/technician/tasks/${taskId}/blocker`, { reason, note });
  }

  createFault(workOrderId: string, description: string, severity: string): Observable<unknown> {
    return this.http.post(`/api/v1/technician/work-orders/${workOrderId}/faults`, { description, severity });
  }
}
