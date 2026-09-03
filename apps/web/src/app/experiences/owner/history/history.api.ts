import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

/**
 * The Owner's History endpoints.
 *
 * Two calls, matching the two things an owner does: scan the index, then
 * open one relationship. The deep record is deliberately NOT fetched with
 * the index -- a workshop's whole history is not a page payload.
 */

export type RecommendationOutcome =
  | 'AWAITING_CUSTOMER'
  | 'DECLINED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'APPROVED_NO_WORK_LINKED'
  | 'APPROVED_PLANNED'
  | 'APPROVED_IN_PROGRESS'
  | 'PARTIALLY_PERFORMED'
  | 'PERFORMED'
  | 'NOT_PERFORMED';

export interface RecommendationEvidence {
  readonly at: string | null;
  readonly text: string;
}

export interface HistoryRecommendation {
  readonly id: string;
  readonly workOrderId: string;
  readonly name: string;
  readonly explanation: string;
  readonly importance: string;
  readonly decision: string;
  readonly decidedAt: string | null;
  readonly requestId: string;
  readonly requestStatus: string;
  readonly sentAt: string | null;
  readonly viewedAt: string | null;
  readonly respondedAt: string | null;
  readonly expiresAt: string | null;
  readonly outcome: RecommendationOutcome;
  readonly outcomeLabel: string;
  readonly evidence: readonly RecommendationEvidence[];
  readonly linkedTasks: readonly { id: string; title: string; status: string; lastChangedAt: string }[];
  /** ABSENT for a reader who may not see money -- never blanked. */
  readonly price?: string;
  readonly laborPrice?: string;
  readonly total?: string;
}

export interface HistoryFinding {
  readonly id: string;
  readonly workOrderId: string;
  readonly at: string;
  readonly code: string | null;
  readonly description: string;
  readonly severity: string;
  readonly recommendedService: string | null;
  readonly inspectionId: string | null;
  readonly inspectionType: string | null;
}

export interface HistoryInspection {
  readonly id: string;
  readonly type: string;
  readonly at: string;
  readonly technicianName: string | null;
  readonly odometerOrHours: string | null;
  readonly note: string | null;
  readonly fields: Record<string, unknown>;
}

export interface HistoryMoney {
  readonly runningTotal: string | null;
  readonly invoiceId: string | null;
  readonly invoiceNumber: string | null;
  readonly invoiceStatus: string | null;
  readonly issuedAt: string | null;
  readonly subtotal: string | null;
  readonly discount: string | null;
  readonly tax: string | null;
  readonly total: string | null;
  readonly paid: string | null;
  readonly outstanding: string | null;
  readonly lines: readonly { name: string; itemType: string; quantity: number; unitPrice: string; laborPrice: string; total: string }[];
  readonly payments: readonly { id: string; at: string; amount: string; method: string; status: string }[];
}

export interface HistoryPart {
  readonly name: string;
  readonly quantity: number;
  readonly provenance: string;
  readonly charged: string;
  readonly workshopWarranted: boolean;
  readonly addedAt: string;
  readonly taskId: string | null;
  readonly requestId: string | null;
  readonly requestStatus: string | null;
  readonly requestedAt: string | null;
  readonly issuedQuantity: number;
  readonly issuedAt: string | null;
  readonly receivedAt: string | null;
  readonly usedAt: string | null;
}

export interface HistoryVisit {
  readonly workOrderId: string;
  readonly status: string;
  readonly branchName: string | null;
  readonly openedAt: string;
  readonly closedAt: string | null;
  readonly promisedAt: string | null;
  readonly complaint: string | null;
  readonly inspectionDeclined: boolean;
  readonly staff: readonly { id: string; fullName: string; role: string }[];
  readonly inspections: readonly HistoryInspection[];
  readonly findings: readonly HistoryFinding[];
  readonly recommendations: readonly HistoryRecommendation[];
  readonly decisionRequests: readonly {
    id: string;
    status: string;
    sentAt: string | null;
    viewedAt: string | null;
    respondedAt: string | null;
    expiresAt: string | null;
    itemCount: number;
  }[];
  readonly operations: readonly {
    id: string;
    title: string;
    serviceKey: string | null;
    status: string;
    actualMinutes: number | null;
    createdAt: string;
    lastChangedAt: string;
    fromRecommendationId: string | null;
    blockers: readonly { reason: string; note: string | null; status: string; at: string }[];
  }[];
  readonly parts: readonly HistoryPart[];
  readonly money: HistoryMoney;
  readonly lifecycle: readonly { at: string; from: string | null; to: string | null; actorId: string }[];
  readonly events: readonly { at: string; eventKey: string; actorId: string }[];
  readonly sameOwnerAsCurrent: boolean;
}

export interface OwnerHistoryRecord {
  readonly key: string;
  readonly customer: { id: string; fullName: string; phone: string; email: string | null; portalStatus: string };
  readonly asset: {
    id: string;
    category: string;
    plateNumber: string | null;
    vin: string | null;
    engineNumber: string | null;
    serialNumber: string | null;
    currentOwnerCustomerId: string | null;
  };
  readonly isCurrentOwner: boolean;
  readonly ownershipStartedAt: string | null;
  readonly ownershipEndedAt: string | null;
  readonly otherOwnerVisits: number;
  readonly totalVisits: number;
  readonly firstVisitAt: string | null;
  readonly lastVisitAt: string | null;
  readonly visits: readonly HistoryVisit[];
  readonly generatedAt: string;
}

export interface OwnerHistoryIndexRow {
  readonly key: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly customerPhone: string;
  readonly assetId: string;
  readonly category: string;
  readonly plateNumber: string | null;
  readonly vin: string | null;
  readonly serialNumber: string | null;
  readonly visits: number;
  readonly firstVisitAt: string;
  readonly lastVisitAt: string;
  readonly openVisits: number;
  readonly lastStatus: string;
  readonly lastWorkOrderId: string;
  readonly lastComplaint: string | null;
  readonly billedTotal: string;
  readonly outstanding: string;
}

export interface OwnerHistoryIndex {
  readonly rows: readonly OwnerHistoryIndexRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly sort: string;
  readonly direction: 'asc' | 'desc';
  readonly generatedAt: string;
}

export type HistorySort = 'lastVisit' | 'firstVisit' | 'visits' | 'customer' | 'plate' | 'outstanding';

export interface HistoryQuery {
  readonly search?: string;
  readonly activity?: 'all' | 'open' | 'closed';
  readonly sort?: HistorySort;
  readonly direction?: 'asc' | 'desc';
  readonly page?: number;
  readonly pageSize?: number;
}

@Injectable({ providedIn: 'root' })
export class OwnerHistoryApi {
  private readonly http = inject(HttpClient);

  index(query: HistoryQuery): Observable<OwnerHistoryIndex> {
    const params: Record<string, string> = {};
    // Only what was actually asked for. Sending `search=""` would make
    // the server run a LIKE over every customer for no reason.
    if (query.search?.trim()) params['search'] = query.search.trim();
    if (query.activity && query.activity !== 'all') params['activity'] = query.activity;
    if (query.sort) params['sort'] = query.sort;
    if (query.direction) params['direction'] = query.direction;
    if (query.page) params['page'] = String(query.page);
    if (query.pageSize) params['pageSize'] = String(query.pageSize);
    return this.http.get<OwnerHistoryIndex>('/api/v1/owner/history', { params });
  }

  record(customerId: string, assetId: string): Observable<OwnerHistoryRecord> {
    return this.http.get<OwnerHistoryRecord>(`/api/v1/owner/history/${customerId}/${assetId}`);
  }
}
