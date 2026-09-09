import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import type { PresentedJourney } from '../../domain/journey/workflow-strip';

export interface TechnicianJob {
  readonly workOrderId: string;
  readonly identifier: string | null;
  readonly vehicleModel?: string | null;
  readonly category?: string | null;
  readonly vin?: string | null;
  readonly customerName: string;
  readonly customerPhone?: string | null;
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
  readonly actions?: readonly ('RECEIVE' | 'MARK_USED' | 'RETURN' | 'RESPOND_CLARIFICATION')[];
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
  readonly id: string | null;
  readonly state: 'REQUIRED' | 'IN_PROGRESS' | 'COMPLETED' | 'DECLINED';
  readonly completedAt: string | null;
  readonly actualMinutes: number | null;
  readonly faultCount: number;
}

export type FindingDecisionStatus = 'NOT_REQUESTED' | 'PENDING' | 'APPROVED' | 'REJECTED';

export interface WorkCardFinding {
  readonly id: string;
  readonly description: string;
  readonly severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  readonly code: string | null;
  readonly recommendedService: string | null;
  readonly inspectionId: string | null;
  readonly decisionStatus: FindingDecisionStatus;
}

export interface InspectionBoxCustomerDetails {
  readonly customerName: string;
  readonly phone: string | null;
  readonly vehicleIdentifier: string;
  readonly vehicleCategory?: string | null;
  readonly complaint: string;
}

export interface InspectionBoxItem {
  readonly id: string;
  readonly partKey: string;
  readonly nameEn: string;
  readonly nameAr: string;
  readonly systemCategoryEn: string;
  readonly systemCategoryAr: string;
  readonly icon: string;
  readonly color: string;
  readonly customerDetails: InspectionBoxCustomerDetails;
  readonly isDone: boolean;
  readonly completedAt: string | null;
  readonly symptoms: readonly string[];
}

export interface WorkCard {
  readonly workOrderId: string;
  readonly identifier: string | null;
  readonly vehicleModel?: string | null;
  readonly vin?: string | null;
  readonly mileage?: string | null;
  readonly customerName: string;
  readonly customerPhone?: string | null;
  readonly status: string;
  readonly complaint: string | null;
  readonly inspectionDeclined: boolean;
  readonly timeTracking: 'OFF' | 'OPTIONAL' | 'REQUIRED';
  readonly inspection: WorkCardInspection;
  /** Findings logged against this work order with their customer decision states. */
  readonly findings: readonly WorkCardFinding[];
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
  readonly inspectionBoxes?: readonly InspectionBoxItem[];
  readonly inspectionReport?: string | null;
  readonly inspectionReportSubmitted?: boolean;
  readonly submittedFindings?: readonly any[];
  readonly submittedParts?: readonly any[];
  readonly submittedServices?: readonly any[];
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

export interface RecordInspectionPayload {
  readonly type: 'QUICK' | 'FULL';
  readonly odometerOrHours?: number;
  readonly actualMinutes?: number;
  readonly note?: string;
}

@Injectable({ providedIn: 'root' })
export class TechnicianApi {
  private readonly http = inject(HttpClient);

  active(): Observable<{ job: TechnicianJob | null }> {
    return this.http.get<{ job: TechnicianJob | null }>('/api/v1/technician/active');
  }

  myWork(): Observable<{ jobs: readonly TechnicianJob[] }> {
    return this.http.get<{ jobs: readonly TechnicianJob[] }>('/api/v1/technician/my-work');
  }

  workCard(workOrderId: string): Observable<WorkCard> {
    return this.http.get<WorkCard>(`/api/v1/technician/work-orders/${workOrderId}`);
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

  recordInspection(
    workOrderId: string,
    payloadOrType: RecordInspectionPayload | 'QUICK' | 'FULL',
    note?: string,
  ): Observable<unknown> {
    const body =
      typeof payloadOrType === 'string'
        ? { type: payloadOrType, ...(note ? { note } : {}) }
        : payloadOrType;
    return this.http.post(`/api/v1/technician/work-orders/${workOrderId}/inspection`, body);
  }

  createFault(
    workOrderId: string,
    description: string,
    severity: string,
    inspectionId?: string,
  ): Observable<{ id: string }> {
    return this.http.post<{ id: string }>(`/api/v1/technician/work-orders/${workOrderId}/faults`, {
      description,
      severity,
      ...(inspectionId ? { inspectionId } : {}),
    });
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
    inspectionId?: string,
  ): Observable<CartSubmission> {
    return this.http.post<CartSubmission>(`/api/v1/technician/work-orders/${workOrderId}/parts/cart`, {
      cartKey,
      lines,
      ...(reason?.trim() ? { reason: reason.trim() } : {}),
      ...(inspectionId ? { inspectionId } : {}),
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

  /** CONTRACTS-v0 C6. Send a received part back to the store. */
  returnPart(partRequestId: string, quantity: number, reason?: string): Observable<unknown> {
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
    item: {
      name: string;
      explanation: string;
      importance: string;
      price: string;
      laborPrice?: string;
      faultId?: string;
    },
  ): Observable<{ requestId: string; secureToken: string }> {
    return this.http.post<{ requestId: string; secureToken: string }>(
      `/api/v1/technician/work-orders/${workOrderId}/decisions`,
      item,
    );
  }

  /** Mark a simplified inspection box as Done (or toggle state). */
  markInspectionBoxDone(
    workOrderId: string,
    partKey: string,
    isDone = true,
    findingSeverity?: string,
    note?: string,
  ): Observable<{ success: boolean; partKey: string; isDone: boolean; completedAt: string }> {
    return this.http.post<{ success: boolean; partKey: string; isDone: boolean; completedAt: string }>(
      `/api/v1/technician/work-orders/${encodeURIComponent(workOrderId)}/inspection-box-done`,
      { partKey, isDone, findingSeverity, note },
    );
  }

  /** Submit full inspection report to operator with findings, parts, services and note */
  submitInspectionReport(
    workOrderId: string,
    payload: {
      findings?: Array<{
        description: string;
        severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
        recommendedService?: string;
        code?: string;
      }>;
      parts?: Array<{
        sku: string;
        name: string;
        quantity: number;
        unitPrice?: number;
      }>;
      services?: Array<{
        serviceName: string;
        laborPrice?: number;
      }>;
      note?: string;
    },
  ): Observable<{ success: boolean; workOrderId: string; submittedAt: string }> {
    return this.http.post<{ success: boolean; workOrderId: string; submittedAt: string }>(
      `/api/v1/technician/work-orders/${encodeURIComponent(workOrderId)}/submit-inspection-report`,
      payload,
    );
  }

  getSmartSuggestions(query: {
    workOrderId?: string;
    context?: {
      canonicalPartSlug?: string;
      position?: string;
      finding?: {
        key?: string;
        symptom?: string;
        severity?: 'CRITICAL' | 'MEDIUM' | 'LOW' | 'HIGH';
        description?: string;
      };
      vehicle?: {
        category?: 'CARS' | 'MOTORCYCLES' | 'HEAVY_EQUIPMENT';
        make?: string;
        model?: string;
        year?: number;
      };
    };
    vehicleCategory?: 'CARS' | 'MOTORCYCLES' | 'HEAVY_EQUIPMENT';
    partSkus?: string[];
    partNames?: string[];
    categorySlugs?: string[];
    findingKeys?: string[];
  }): Observable<GroupedSuggestionsView> {
    return this.http.post<GroupedSuggestionsView>('/api/v1/technician/smart-suggestions', query);
  }


  getWorkshopInventory(): Observable<{
    items: Array<{
      id: string;
      sku: string;
      name: string;
      sellingPrice: string | number;
      catalogCategoryId?: string;
      availableStock?: number;
    }>;
  }> {
    return this.http.get<{
      items: Array<{
        id: string;
        sku: string;
        name: string;
        sellingPrice: string | number;
        catalogCategoryId?: string;
        availableStock?: number;
      }>;
    }>('/api/v1/inventory/items');
  }

  // Phase C: Inspection Aggregate Lifecycle (OCC, Real-Time Delta Auto-Save, Decisions, Submission)
  /**
   * The inspection aggregate, in the envelope the server actually sends.
   *
   * This method used to declare the aggregate's fields at the top level --
   * `state`, `targets`, `recommendations`, `decisions` -- while the server has
   * always answered `{ inspection, aggregateVersion, lifecycleState }` with the
   * document one level down. Typed `http.get<any>`, nothing checked either
   * side, so the work card read `agg.recommendations`, got `undefined`, fell
   * back to `[]` and showed a technician no generated recommendations and no
   * decisions, on every job, forever. The mocks in its spec returned `null`,
   * so no test ever looked at the shape.
   */
  getInspectionAggregate(workOrderId: string): Observable<InspectionAggregateResponse> {
    return this.http.get<InspectionAggregateResponse>(
      `/api/v1/technician/work-orders/${workOrderId}/inspection`,
    );
  }

  /**
   * Records what was found on one checkpoint.
   *
   * `targetResult` and `recommendations` are the server's names. The client
   * called them `target` and `newlyGeneratedRecommendations`, so the
   * recommendations a saved checkpoint had just generated -- the entire point
   * of saving it -- never reached the panel.
   */
  patchInspectionTarget(
    workOrderId: string,
    targetKey: string,
    dto: PatchInspectionTargetPayload,
  ): Observable<PatchInspectionTargetResult> {
    return this.http.patch<PatchInspectionTargetResult>(
      `/api/v1/technician/work-orders/${workOrderId}/inspection/targets/${targetKey}`,
      dto,
    );
  }

  recordRecommendationDecision(
    workOrderId: string,
    dto: RecordRecommendationDecisionPayload,
  ): Observable<RecordDecisionResult> {
    return this.http.post<RecordDecisionResult>(
      `/api/v1/technician/work-orders/${workOrderId}/inspection/decisions`,
      dto,
    );
  }

  submitInspectionAggregate(
    workOrderId: string,
    dto: { expectedVersion?: number; technicianNotes?: string },
  ): Observable<SubmitInspectionResult> {
    return this.http.post<SubmitInspectionResult>(
      `/api/v1/technician/work-orders/${workOrderId}/inspection/submit`,
      dto,
    );
  }

  // Phase D & E: Vehicle Fitment and POS Live Stock & Price Selection
  getFitmentParts(
    workOrderId: string,
    canonicalPartSlug: string,
    position?: string,
  ): Observable<GroupedFitmentResponseView> {
    const posParam = position ? `&position=${encodeURIComponent(position)}` : '';
    return this.http.get<GroupedFitmentResponseView>(
      `/api/v1/technician/work-orders/${workOrderId}/fitment-parts?canonicalPartSlug=${encodeURIComponent(canonicalPartSlug)}${posParam}`,
    );
  }

  selectPartForWorkOrder(
    workOrderId: string,
    body: { sku: string; quantity?: number; taskId?: string },
  ): Observable<{ success: boolean; partLine: any }> {
    return this.http.post<any>(`/api/v1/technician/work-orders/${workOrderId}/select-part`, body);
  }
}

export interface PatchInspectionTargetPayload {
  canonicalPartSlug: string;
  position: string;
  status: 'INSPECTED' | 'NOT_ACCESSIBLE' | 'NOT_APPLICABLE';
  condition?: 'GOOD' | 'ATTENTION' | 'CRITICAL';
  findings?: Array<{
    findingKey: string;
    technicianObservation?: string;
  }>;
  nonInspectionReason?: string;
  technicianNote?: string;
  measurementValue?: number | string;
  measurementUnit?: string;
  expectedVersion?: number;
}

export interface RecordRecommendationDecisionPayload {
  recommendationId: string;
  decision: 'ACCEPTED' | 'DISMISSED' | 'MODIFIED_SCOPE';
  dismissalReason?: string;
  scopeModificationNote?: string;
  expectedVersion?: number;
}

export interface TargetInspectionResultView {
  readonly id: string;
  readonly targetKey: string;
  readonly canonicalPartSlug: string;
  readonly position: string;
  readonly status: 'NOT_INSPECTED' | 'INSPECTED' | 'NOT_ACCESSIBLE' | 'NOT_APPLICABLE';
  readonly condition?: 'GOOD' | 'ATTENTION' | 'CRITICAL';
  readonly findings: Array<{
    findingKey: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    technicianObservation?: string;
  }>;
  readonly measurementValue?: number;
  readonly measurementUnit?: string;
  readonly technicianNote?: string;
  readonly nonInspectionReason?: string;
}

export interface GeneratedRecommendationView {
  readonly id: string;
  readonly ruleId: string;
  readonly ruleVersion: number;
  readonly engineVersion: string;
  readonly targetResultId: string;
  readonly serviceKey: string;
  readonly serviceDisplayName: string;
  readonly recommendationLevel: 'RECOMMENDED' | 'RELATED' | 'DIAGNOSTIC';
  readonly score: number;
  readonly generatedAt: string;
  readonly evaluationContext: {
    readonly findingKeys: readonly string[];
    readonly severities: readonly string[];
    readonly position: string;
  };
}

export interface RecommendationDecisionView {
  readonly recommendationId: string;
  decision: 'PENDING' | 'ACCEPTED' | 'DISMISSED' | 'MODIFIED_SCOPE';
  decidedAt?: string;
  dismissalReason?: string;
  scopeModificationNote?: string;
}

/**
 * The inspection aggregate as the server sends it: the document, plus the two
 * facts the caller needs without opening it.
 */
export interface InspectionAggregateDocumentView {
  readonly schemaVersion: number;
  readonly aggregateVersion: number;
  readonly catalogVersion: number;
  readonly templateCode: string;
  readonly state: string;
  readonly targets: Record<string, TargetInspectionResultView>;
  readonly recommendations: readonly GeneratedRecommendationView[];
  readonly decisions: readonly RecommendationDecisionView[];
  readonly startedAt?: string | null;
  readonly completedAt?: string | null;
  readonly submittedAt?: string | null;
  readonly technicianStaffId?: string | null;
  readonly snapshot?: unknown;
}

export interface InspectionAggregateResponse {
  /** Null when this job has no aggregate yet -- an honest empty, not an error. */
  readonly inspection: InspectionAggregateDocumentView | null;
  readonly aggregateVersion?: number;
  readonly lifecycleState?: string;
}

export interface PatchInspectionTargetResult {
  readonly success: boolean;
  readonly targetKey: string;
  readonly targetResult: TargetInspectionResultView;
  readonly recommendations: readonly GeneratedRecommendationView[];
  readonly decisions: readonly RecommendationDecisionView[];
  readonly aggregateVersion: number;
}

export interface RecordDecisionResult {
  readonly success: boolean;
  readonly decision: RecommendationDecisionView;
  readonly aggregateVersion: number;
}

export interface SubmitInspectionResult {
  readonly success: boolean;
  readonly workOrderId: string;
  readonly submittedAt?: string | null;
  readonly snapshot?: unknown;
  readonly aggregateVersion: number;
}

export interface ResolvedFitmentItemView {
  readonly sku: string;
  readonly partName: string;
  readonly brand: string;
  readonly canonicalPartSlug: string;
  readonly position?: string;
  readonly fitmentQuality: 'EXACT_MATCH' | 'CROSS_COMPATIBLE' | 'UNIVERSAL';
  readonly grade: 'OEM' | 'PREMIUM_AFTERMARKET' | 'STANDARD_AFTERMARKET' | 'ECONOMY';
  readonly fitmentNotes?: string;
  readonly sellingPrice: string;
  readonly inStock: boolean;
  readonly availableStock: number;
}

export interface GroupedFitmentResponseView {
  readonly canonicalPartSlug: string;
  readonly position?: string;
  readonly vehicleProfile?: { category?: string; make?: string; model?: string; year?: number };
  readonly exactMatches: readonly ResolvedFitmentItemView[];
  readonly compatibleMatches: readonly ResolvedFitmentItemView[];
  readonly universalMatches: readonly ResolvedFitmentItemView[];
  readonly allItems: readonly ResolvedFitmentItemView[];
}

export interface RankedServiceItemView {
  readonly serviceKey: string;
  readonly serviceName: string;
  readonly category: string;
  readonly laborPrice: number;
  readonly standardHours: number;
  readonly rankGroup: 'RECOMMENDED' | 'RELATED' | 'DIAGNOSTIC';
  readonly score: number;
  readonly rationale: string;
  readonly isPrimary: boolean;
}

export interface GroupedSuggestionsView {
  readonly recommended: RankedServiceItemView[];
  readonly related: RankedServiceItemView[];
  readonly diagnostic: RankedServiceItemView[];
  readonly suggestions: RankedServiceItemView[];
}

export interface MasterInspectionCheckpointView {
  readonly checkpointKey: string;
  readonly title: string;
  readonly systemSlug: string;
  readonly targets: Array<{
    readonly targetKey: string;
    readonly label: string;
    readonly canonicalPartSlug: string;
    readonly defaultPosition: string;
  }>;
}


