import type { RecommendationEvidence, RecommendationOutcome } from "./recommendation-outcome";

/**
 * The wire shapes of the history module.
 *
 * Two role-specific projections over ONE truth. They are separate types
 * rather than one type with optional halves, because the difference
 * between them is a security boundary as much as a UX one: the
 * technician shapes below have no money key to forget to strip, and the
 * owner shapes have no "is this relevant to today's decision" ranking to
 * mistake for a fact.
 */

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

/**
 * A recommendation as history reports it, with the outcome and the
 * evidence that produced the outcome.
 *
 * `price`/`laborPrice`/`total` are ABSENT rather than null for a reader
 * who may not see money -- the same rule the work-order dossier already
 * follows for part cost. Null would mean "no price recorded", which is a
 * different fact from "not yours to see".
 */
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
  /** Whatever the workshop's own inspection form recorded. Passed through, never invented. */
  readonly fields: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Owner -- the complete record
// ---------------------------------------------------------------------------

export interface OwnerHistoryIndexRow {
  /** `customerId:assetId` -- the historical identity this row indexes. */
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
  /** From the most recent visit's `work_order.created` event. Null when none was recorded. */
  readonly lastComplaint: string | null;
  /** Money crosses the API as a string. Summed by Postgres over this relationship's invoices. */
  readonly billedTotal: string;
  readonly outstanding: string;
}

export interface OwnerHistoryIndex {
  readonly rows: readonly OwnerHistoryIndexRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  /** Echoed back so the table can prove it is showing what was asked for. */
  readonly sort: string;
  readonly direction: "asc" | "desc";
  readonly generatedAt: string;
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
  /** False marks a visit from a PRIOR ownership period of the same vehicle. */
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
  /** Visits this vehicle made under a DIFFERENT owner. A count only -- never who. */
  readonly otherOwnerVisits: number;
  readonly totalVisits: number;
  readonly firstVisitAt: string | null;
  readonly lastVisitAt: string | null;
  readonly visits: readonly HistoryVisit[];
  readonly generatedAt: string;
}

// ---------------------------------------------------------------------------
// Technician -- decision support
// ---------------------------------------------------------------------------

export interface TechnicianHistoryBrief {
  readonly workOrderId: string;
  readonly asset: { id: string; category: string; identifier: string | null; plateNumber: string | null; vin: string | null };
  /** What the customer said THIS time. The one thing that is not history. */
  readonly currentComplaint: string | null;
  readonly currentInspectionDeclined: boolean;
  readonly priorVisits: number;
  /**
   * How many of those `priorVisits` the lists below were built from.
   *
   * Equal to `priorVisits` for any ordinary vehicle. Lower for one with a
   * very long history, and stated rather than hidden so the surface can
   * say "the last 10 of 34 visits" instead of quietly implying it read
   * everything.
   */
  readonly visitsExamined: number;
  readonly hasPriorOwnerHistory: boolean;
  readonly previousComplaints: readonly {
    workOrderId: string;
    at: string;
    text: string;
    status: string;
    closedAt: string | null;
    sameOwnerAsCurrent: boolean;
  }[];
  readonly previousFindings: readonly (HistoryFinding & { sameOwnerAsCurrent: boolean; inspectionNote: string | null })[];
  readonly previousRecommendations: readonly HistoryRecommendation[];
  /**
   * The subset of the above that was agreed and never delivered, plus
   * declined items the workshop thought were serious. Ranked, not
   * invented -- every entry is one of `previousRecommendations`.
   */
  readonly unresolved: readonly HistoryRecommendation[];
  readonly generatedAt: string;
}
