import type { GateKey } from "../capabilities/gates";

/**
 * The typed contracts between MOP's six systems.
 *
 * Each of these exists to remove a temptation. Without `ChargeableWorkItem`,
 * Finance works out what to bill by reading `Task` and `PartRequest`
 * directly -- and then every change to the work-order schema breaks
 * invoicing. Without `InvoiceCandidate`, Billing reads Operations to
 * decide what goes on a legal document, which couples a compliance
 * artifact to shop-floor internals.
 *
 * These are wire shapes, not database rows. Money is a **string**
 * throughout: `Decimal` cannot cross a JSON boundary without either
 * losing precision as a number or leaking decimal.js internals as an
 * object.
 */

// ---------------------------------------------------------------------------
// Operations -> Finance Core
// ---------------------------------------------------------------------------

export type ChargeableItemType = "SERVICE" | "LABOUR" | "PART" | "INSPECTION" | "PACKAGE" | "FEE";

/**
 * How the workshop came by a part. `CUSTOMER_SUPPLIED` is the case that
 * forced this field: a customer who brings their own part and pays only
 * for fitting. There is no stock movement, no cost to the workshop, and a
 * liability position that differs from a part the workshop sold -- so it
 * cannot be modelled as an inventory item with a zero price.
 */
export type ItemProvenance = "INVENTORY" | "EXTERNAL_PURCHASE" | "CUSTOMER_SUPPLIED" | "NOT_APPLICABLE";

/**
 * Operations' statement that something is billable. Finance decides what
 * it costs; Operations never computes money, and Finance never reads a
 * task.
 */
export interface ChargeableWorkItem {
  readonly tenantId: string;
  readonly branchId: string;
  readonly workOrderId: string;
  readonly taskId: string | null;
  readonly assetId: string;
  readonly customerId: string;
  readonly itemType: ChargeableItemType;
  readonly itemName: string;
  readonly quantity: number;
  readonly provenance: ItemProvenance;
  /** Set only when provenance is INVENTORY. */
  readonly inventoryItemId: string | null;
  /** Where this came from in Operations, for traceability back from an invoice line. */
  readonly sourceType: "TASK" | "INSPECTION" | "PART_REQUEST" | "MANUAL";
  readonly sourceId: string;
  readonly requiresCustomerApproval: boolean;
  readonly approvalStatus: "NOT_REQUIRED" | "PENDING" | "APPROVED" | "REJECTED";
  /**
   * The price the customer agreed to, captured at the moment they agreed.
   * Null until approved. Once set it is never recomputed -- a later
   * catalogue change must not retroactively alter what was agreed.
   */
  readonly approvedUnitPrice: string | null;
  readonly approvedLabourPrice: string | null;
  readonly addedAt: string;
}

// ---------------------------------------------------------------------------
// Finance Core -> Billing
// ---------------------------------------------------------------------------

export interface InvoiceCandidateLine {
  readonly name: string;
  readonly itemType: ChargeableItemType;
  readonly provenance: ItemProvenance;
  readonly quantity: number;
  readonly unitPrice: string;
  readonly labourPrice: string;
  readonly lineTotal: string;
  readonly taxCode: string | null;
  /** Traces this line back to the ChargeableWorkItem it came from. */
  readonly sourceType: ChargeableWorkItem["sourceType"];
  readonly sourceId: string;
}

export interface TaxBreakdownEntry {
  readonly taxCode: string;
  /** Percentage as a string, e.g. "14.00" -- snapshotted, because rates change and old invoices must re-render correctly. */
  readonly ratePercent: string;
  readonly taxableAmount: string;
  readonly taxAmount: string;
}

/**
 * Everything Billing needs to produce a legal invoice, with no route back
 * into Operations. `country` and `billingProfile` are here because the
 * document differs per jurisdiction -- Egypt's ETA and Saudi ZATCA
 * require submission to a state portal in a prescribed format, and in
 * those markets an uncleared invoice is not a valid invoice.
 */
export interface InvoiceCandidate {
  readonly tenantId: string;
  readonly branchId: string;
  readonly customerId: string;
  readonly workOrderId: string;
  readonly currency: string;
  readonly country: string;
  readonly billingProfile: string;
  readonly invoiceType: "STANDARD" | "SIMPLIFIED" | "CREDIT" | "DEBIT";
  readonly lines: readonly InvoiceCandidateLine[];
  readonly taxBreakdown: readonly TaxBreakdownEntry[];
  readonly subtotal: string;
  readonly discountTotal: string;
  readonly taxTotal: string;
  readonly total: string;
  readonly amountPaid: string;
  readonly createdById: string;
  readonly createdAt: string;
}

// ---------------------------------------------------------------------------
// Billing -> Finance Core / Operations
// ---------------------------------------------------------------------------

export type ClearanceStatus = "NOT_REQUIRED" | "PENDING" | "CLEARED" | "REJECTED" | "FAILED";

export interface InvoiceIssued {
  readonly tenantId: string;
  readonly workOrderId: string;
  readonly invoiceId: string;
  readonly invoiceNumber: string;
  readonly total: string;
  readonly currency: string;
  /**
   * In a clearance jurisdiction an invoice is not legally valid until the
   * state portal accepts it, so delivery must NOT be released on
   * `issued` alone. This is the field most likely to be forgotten.
   */
  readonly clearanceStatus: ClearanceStatus;
  readonly issuedAt: string;
}

// ---------------------------------------------------------------------------
// Operations -> everyone: gate outcomes
// ---------------------------------------------------------------------------

export interface GateEvaluation {
  readonly gate: GateKey;
  readonly satisfied: boolean;
  /** Present only when unsatisfied; the message a blocked person is shown. */
  readonly blockedMessage?: string;
}

export interface GateResult {
  readonly checkpoint: "FINISH" | "DELIVERY";
  readonly passed: boolean;
  /** Only gates live under this tenant's capabilities -- dropped gates never appear. */
  readonly evaluations: readonly GateEvaluation[];
}

// ---------------------------------------------------------------------------
// Operations -> People & Performance
// ---------------------------------------------------------------------------

/**
 * Carries blocked duration separately so a technician is not penalised
 * for time spent waiting on a part or a customer. A performance metric
 * that counts waiting as working is worse than no metric.
 */
export interface TaskPerformanceRecord {
  readonly tenantId: string;
  readonly technicianId: string;
  readonly workOrderId: string;
  readonly taskId: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly activeSeconds: number;
  readonly blockedSeconds: number;
  readonly blockerCount: number;
  readonly reworkCount: number;
}
