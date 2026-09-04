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
  /**
   * Whether this workshop has a return path at all. Server-computed from
   * the part-request graph under the tenant's capability profile -- the
   * card renders the button strictly from this flag and never from the
   * status, because a workshop with PART_RETURNS removed has no such
   * edge and the button would outlive the capability that owns it.
   */
  readonly returnable: boolean;
  readonly clarificationPending: boolean;
  readonly clarificationQuestion: string | null;
}

/** The one job-level move available now, named and worded by the server. */
export interface WorkCardPrimaryAction {
  readonly intent: 'START_INSPECTION' | 'START_WORK';
  readonly label: string;
}

/**
 * Mission 1 -- where the inspection stands on this job.
 *
 * Every field is the server's answer. The card renders it and never
 * derives it: `repairLocked` below comes from the same authority that
 * refuses the write, so what the technician is told and what the API
 * would do cannot drift apart.
 */
export interface WorkCardInspection {
  readonly state: 'REQUIRED' | 'IN_PROGRESS' | 'COMPLETED' | 'DECLINED';
  readonly completedAt: string | null;
  readonly actualMinutes: number | null;
  readonly faultCount: number;
}

export interface WorkCard {
  readonly workOrderId: string;
  readonly identifier: string | null;
  readonly customerName: string;
  readonly status: string;
  readonly complaint: string | null;
  readonly inspectionDeclined: boolean;
  readonly timeTracking: 'OFF' | 'OPTIONAL' | 'REQUIRED';
  readonly inspection: WorkCardInspection;
  /**
   * Whether repair work is legal right now. Server-computed.
   *
   * A disabled button is not enforcement -- this flag exists so the page
   * can EXPLAIN the lock, not so it can impose one. The same request sent
   * by hand is refused by the API with the same reason.
   */
  readonly repairLocked: boolean;
  readonly repairLockReason: string | null;
  readonly tasks: readonly TechnicianTask[];
  readonly parts: readonly WorkCardPart[];
  readonly finish: FinishCheck;
  readonly primaryAction: WorkCardPrimaryAction | null;
}

/**
 * What became of a recommendation, and why the history says so.
 *
 * Notice what is NOT here: no price, no labour, no total. The server
 * omits those keys entirely for a technician rather than blanking them,
 * so there is nothing on this path for a template to leak.
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

export interface HistoryRecommendation {
  readonly id: string;
  readonly workOrderId: string;
  readonly name: string;
  readonly explanation: string;
  readonly importance: string;
  readonly decision: string;
  readonly decidedAt: string | null;
  readonly outcome: RecommendationOutcome;
  readonly outcomeLabel: string;
  readonly evidence: readonly { readonly at: string | null; readonly text: string }[];
  readonly linkedTasks: readonly { readonly id: string; readonly title: string; readonly status: string }[];
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
  readonly inspectionNote: string | null;
  readonly sameOwnerAsCurrent: boolean;
}

export interface HistoryComplaint {
  readonly workOrderId: string;
  readonly at: string;
  readonly text: string;
  readonly status: string;
  readonly closedAt: string | null;
  readonly sameOwnerAsCurrent: boolean;
}

/**
 * One card in the parts catalog. Shaped by `CatalogBrowseService` --
 * `cost` is absent from this interface because it is absent from the
 * server's own `BrowseCard`, not merely unread here.
 */
export interface PartCard {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly summary: string | null;
  readonly imageUrl: string | null;
  readonly categoryId: string | null;
  readonly categoryName: string | null;
  /** Money as a string, always. */
  readonly sellingPrice: string;
  readonly stockTracked: boolean;
  readonly onHand: number;
  readonly availability: 'IN_STOCK' | 'LOW' | 'OUT_OF_STOCK' | 'NOT_TRACKED';
  /** Whatever the inventory manager configured, in their own words. */
  readonly attributes: readonly { attributeId: string; label: string; valueLabel: string }[];
}

export interface PartCategoryNode {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly parentId: string | null;
  readonly itemCount: number;
  readonly children: readonly PartCategoryNode[];
}

export interface PartFilterOption {
  readonly valueId: string;
  readonly value: string;
  readonly label: string;
  readonly count: number;
  readonly selected: boolean;
}

/**
 * A filter the technician sees.
 *
 * Nothing in this app knows what "Vehicle Type" is, and that is the
 * point: the inventory manager invented it, the server persisted it,
 * and the page renders whatever comes back. A hardcoded filter here
 * would go stale the moment a workshop configured a different one.
 */
export interface PartFilter {
  readonly attributeId: string;
  readonly key: string;
  readonly label: string;
  readonly options: readonly PartFilterOption[];
}

export interface PartsCatalogPage {
  readonly categories: readonly PartCategoryNode[];
  /** Empty until a category is chosen -- filters belong to a category. */
  readonly filters: readonly PartFilter[];
  readonly items: readonly PartCard[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly categoryId: string | null;
  readonly query: string | null;
}

export interface CartSubmission {
  readonly cartKey: string;
  readonly requests: readonly { id: string; inventoryItemId: string; quantity: number; status: string }[];
  /** True when the server recognised this basket and changed nothing. */
  readonly replayed: boolean;
}

export interface CatalogBrowseQuery {
  readonly q?: string;
  readonly categoryId?: string;
  /** attributeId -> chosen valueIds. */
  readonly attributes?: Readonly<Record<string, readonly string[]>>;
  readonly inStockOnly?: boolean;
  readonly page?: number;
}

/**
 * `attributeId:valueId,valueId;attributeId:valueId`.
 *
 * Shared with the inventory manager's preview client, and parsed by one
 * function on the server -- see `parseAttributeQuery` in
 * inventory.controller.ts for why the browse is a link rather than a
 * body.
 */
export function encodeAttributeQuery(
  attributes: Readonly<Record<string, readonly string[]>> | undefined,
): string | undefined {
  if (!attributes) return undefined;
  const parts = Object.entries(attributes)
    .filter(([, values]) => values.length > 0)
    .map(([attributeId, values]) => `${attributeId}:${values.join(',')}`);
  return parts.length > 0 ? parts.join(';') : undefined;
}

export function browseParams(query: CatalogBrowseQuery): Record<string, string> {
  const params: Record<string, string> = {};
  if (query.q?.trim()) params['q'] = query.q.trim();
  if (query.categoryId) params['categoryId'] = query.categoryId;
  const attributes = encodeAttributeQuery(query.attributes);
  if (attributes) params['attributes'] = attributes;
  if (query.inStockOnly) params['inStockOnly'] = 'true';
  if (query.page && query.page > 1) params['page'] = String(query.page);
  return params;
}

/**
 * The vehicle's history, arranged around the decision the technician is
 * about to make -- not the owner's complete record, which is a different
 * product for a different question.
 */
export interface TechnicianHistoryBrief {
  readonly workOrderId: string;
  readonly asset: {
    readonly id: string;
    readonly category: string;
    readonly identifier: string | null;
    readonly plateNumber: string | null;
    readonly vin: string | null;
  };
  readonly currentComplaint: string | null;
  readonly currentInspectionDeclined: boolean;
  readonly priorVisits: number;
  /** How many of `priorVisits` the lists below were built from. */
  readonly visitsExamined: number;
  readonly hasPriorOwnerHistory: boolean;
  readonly previousComplaints: readonly HistoryComplaint[];
  readonly previousFindings: readonly HistoryFinding[];
  readonly previousRecommendations: readonly HistoryRecommendation[];
  /** Agreed and not delivered. The reason this surface exists. */
  readonly unresolved: readonly HistoryRecommendation[];
  readonly generatedAt: string;
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

  vehicleHistory(workOrderId: string): Observable<TechnicianHistoryBrief> {
    return this.http.get<TechnicianHistoryBrief>(`/api/v1/technician/work-orders/${workOrderId}/vehicle-history`);
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

  /**
   * The workshop's own catalog, as configured by its inventory manager
   * and filtered to what a work order can use.
   */
  partsCatalog(query: CatalogBrowseQuery = {}): Observable<PartsCatalogPage> {
    return this.http.get<PartsCatalogPage>('/api/v1/technician/parts-catalog', { params: browseParams(query) });
  }

  /**
   * The whole cart, in one call, under a key the client minted when the
   * cart was opened. Submitting the same key twice returns the basket
   * the first submit created rather than doubling the store's work.
   */
  submitCart(
    workOrderId: string,
    cartKey: string,
    lines: readonly { inventoryItemId: string; quantity: number }[],
    reason?: string,
  ): Observable<CartSubmission> {
    return this.http.post<CartSubmission>(`/api/v1/technician/work-orders/${workOrderId}/parts/cart`, {
      cartKey,
      lines,
      ...(reason?.trim() ? { reason: reason.trim() } : {}),
    });
  }

  requestPart(workOrderId: string, inventoryItemId: string, quantity: number, reason?: string): Observable<unknown> {
    return this.http.post(`/api/v1/technician/work-orders/${workOrderId}/parts`, {
      inventoryItemId,
      quantity,
      reason,
    });
  }

  /**
   * CONTRACTS-v0 C1/C2. Which of the two to call is not a decision this
   * client makes: the card renders whatever `primaryAction.intent` the
   * server put on the payload, so the workflow graph stays the only
   * thing that knows which move exists from which state.
   */
  startInspection(workOrderId: string): Observable<{ workOrderId: string; status: string }> {
    return this.http.post<{ workOrderId: string; status: string }>(
      `/api/v1/technician/work-orders/${workOrderId}/start-inspection`,
      {},
    );
  }

  startWork(workOrderId: string): Observable<{ workOrderId: string; status: string }> {
    return this.http.post<{ workOrderId: string; status: string }>(
      `/api/v1/technician/work-orders/${workOrderId}/start-work`,
      {},
    );
  }

  /** CONTRACTS-v0 C6. */
  returnPart(partRequestId: string, quantity: number, reason: string): Observable<unknown> {
    return this.http.post(`/api/v1/technician/parts/${partRequestId}/return`, { quantity, reason });
  }

  /** CONTRACTS-v0 C7 -- the answer to the question the store asked. */
  answerClarification(partRequestId: string, answer: string): Observable<unknown> {
    return this.http.post(`/api/v1/technician/parts/${partRequestId}/clarification`, { answer });
  }

  /**
   * CONTRACTS-v0 C8. A part the workshop never held: the customer
   * brought it, or it was bought outside. No stock moves, because
   * nothing left a shelf.
   */
  addExternalPart(
    workOrderId: string,
    name: string,
    provenance: 'CUSTOMER_SUPPLIED' | 'EXTERNAL_PURCHASE',
    quantity = 1,
  ): Observable<unknown> {
    return this.http.post(`/api/v1/technician/work-orders/${workOrderId}/external-parts`, {
      name,
      provenance,
      quantity,
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
