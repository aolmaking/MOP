import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import type { PresentedJourney } from '../../domain/journey/workflow-strip';

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

export interface WorkCardPart {
  readonly partRequestId: string;
  readonly name: string;
  readonly sku: string;
  readonly quantity: number;
  readonly issued: number;
  readonly status: string;
  readonly statusText: string;
  readonly waitingOn: 'STORE' | 'YOU' | 'NOBODY';
  readonly action: 'RECEIVE' | 'MARK_USED' | null;
}

export interface WorkCard {
  readonly workOrderId: string;
  readonly identifier: string | null;
  readonly customerName: string;
  readonly status: string;
  readonly complaint: string | null;
  readonly inspectionDeclined: boolean;
  readonly timeTracking: 'OFF' | 'OPTIONAL' | 'REQUIRED';
  readonly tasks: readonly TechnicianTask[];
  readonly parts: readonly WorkCardPart[];
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

/**
 * One card in the parts picker. Shaped by `CatalogService.toItem` --
 * `cost` is deliberately absent from this interface, not merely unread:
 * the technician endpoint never asks for it.
 */
export interface PartCard {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly category: string | null;
  /** Money as a string, always. */
  readonly sellingPrice: string;
  readonly stockTracked: boolean;
  readonly onHand: number;
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

  completeTask(taskId: string, minutesSpent?: number): Observable<unknown> {
    return this.http.post(`/api/v1/technician/tasks/${taskId}/complete`, {
      ...(minutesSpent === undefined ? {} : { minutesSpent }),
    });
  }

  reportBlocker(taskId: string, reason: string, note?: string): Observable<unknown> {
    return this.http.post(`/api/v1/technician/tasks/${taskId}/blocker`, { reason, note });
  }

  recordInspection(workOrderId: string, type: 'QUICK' | 'FULL', note?: string): Observable<unknown> {
    return this.http.post(`/api/v1/technician/work-orders/${workOrderId}/inspection`, { type, note });
  }

  createFault(workOrderId: string, description: string, severity: string): Observable<unknown> {
    return this.http.post(`/api/v1/technician/work-orders/${workOrderId}/faults`, { description, severity });
  }

  finishWorkOrder(workOrderId: string): Observable<unknown> {
    return this.http.post(`/api/v1/technician/work-orders/${workOrderId}/finish`, {});
  }

  /** The workshop's own catalog, filtered to what a work order can use. */
  partsCatalog(query?: string): Observable<{ items: PartCard[]; total: number; categories: string[] }> {
    const suffix = query?.trim() ? `?q=${encodeURIComponent(query.trim())}` : '';
    return this.http.get<{ items: PartCard[]; total: number; categories: string[] }>(
      `/api/v1/technician/parts-catalog${suffix}`,
    );
  }

  requestPart(workOrderId: string, inventoryItemId: string, quantity: number, reason?: string): Observable<unknown> {
    return this.http.post(`/api/v1/technician/work-orders/${workOrderId}/parts`, {
      inventoryItemId,
      quantity,
      reason,
    });
  }

  journey(workOrderId: string): Observable<PresentedJourney> {
    return this.http.get<PresentedJourney>(`/api/v1/technician/work-orders/${workOrderId}/journey`);
  }

  receivePart(partRequestId: string): Observable<unknown> {
    return this.http.post(`/api/v1/technician/parts/${partRequestId}/receive`, {});
  }

  usePart(partRequestId: string): Observable<unknown> {
    return this.http.post(`/api/v1/technician/parts/${partRequestId}/used`, {});
  }

  /** "Ask the customer" -- creates the decision request and sends it in one call. */
  raiseDecision(
    workOrderId: string,
    item: { name: string; explanation: string; importance: string; price: string; laborPrice?: string },
  ): Observable<{ requestId: string; secureToken: string }> {
    return this.http.post<{ requestId: string; secureToken: string }>(
      `/api/v1/technician/work-orders/${workOrderId}/decisions`,
      item,
    );
  }
}
