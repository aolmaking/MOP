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
// The Billing country-adapter seam (Phase 9, docs/SYSTEMS.md)
// ---------------------------------------------------------------------------

/**
 * The immutable rendered form of an invoice, handed to an adapter once --
 * never re-derived from Invoice later. Distinct from `InvoiceCandidate`:
 * the candidate is Finance's proposal; the snapshot is what Billing
 * actually committed to a document, after `validateInvoice` accepted it.
 */
export interface InvoiceSnapshot {
  readonly tenantId: string;
  readonly invoiceId: string;
  readonly invoiceNumber: string;
  readonly currency: string;
  readonly country: string;
  readonly lines: readonly InvoiceCandidateLine[];
  readonly taxBreakdown: readonly TaxBreakdownEntry[];
  readonly subtotal: string;
  readonly discountTotal: string;
  readonly taxTotal: string;
  readonly total: string;
  readonly issuedAt: string;
}

export interface BillingValidationResult {
  readonly valid: boolean;
  /** Empty when valid. Each one names the field and the reason -- never a bare "invalid". */
  readonly errors: readonly { readonly field: string; readonly message: string }[];
}

export interface QrPayload {
  readonly format: string;
  /** Base64 or an encoded string, adapter-defined. Null means the adapter has no QR to offer -- honest absence, never a fabricated code. */
  readonly data: string | null;
}

export interface ClearanceSubmissionResult {
  readonly status: ClearanceStatus;
  readonly clearanceReference: string | null;
  readonly rejectionReason: string | null;
}

/** What an adapter actually returns from `generateDocument` -- the artifact itself, not yet cleared. */
export interface BillingDocumentArtifact {
  readonly adapterName: string;
  readonly documentNumber: string;
  readonly qr: QrPayload;
  readonly renderedAt: string;
}

export interface CreditNoteDocument {
  readonly adapterName: string;
  readonly creditNoteNumber: string;
  readonly originalInvoiceNumber: string;
  /** May be less than the original invoice total -- a partial refund. */
  readonly amount: string;
  readonly reason: string;
  readonly issuedAt: string;
}

export interface DebitNoteDocument {
  readonly adapterName: string;
  readonly debitNoteNumber: string;
  readonly originalInvoiceNumber: string;
  readonly amount: string;
  readonly reason: string;
  readonly issuedAt: string;
}

/**
 * The seam itself, quoted in `docs/SYSTEMS.md` before any code existed
 * to implement it. `GenericBillingAdapter` implements every method
 * jurisdiction-agnostically; `EgyptETAAdapter` / `SaudiZATCAAdapter` are
 * not built yet (Phase 9's exit criteria are explicit about this) -- the
 * point of typing the interface here, in `@mop/shared`, is that a real
 * country adapter can be added without Finance or Billing's own service
 * code changing at all.
 */
export interface BillingCountryAdapter {
  readonly name: string;
  validateInvoice(candidate: InvoiceCandidate): BillingValidationResult;
  generateDocument(invoice: InvoiceSnapshot): BillingDocumentArtifact;
  submitForClearance(invoice: InvoiceSnapshot): ClearanceSubmissionResult;
  getClearanceStatus(invoiceId: string): ClearanceStatus;
  generateQr(invoice: InvoiceSnapshot): QrPayload;
  /**
   * `amount` and `creditNoteNumber` are additions to `docs/SYSTEMS.md`'s
   * original two-argument signature, made while actually implementing
   * this interface for the first time: the original silently assumed a
   * credit note always refunds the full invoice, which is false for any
   * partial refund, and had no numbering parameter at all despite credit
   * notes needing their own sequence, same as invoices.
   */
  generateCreditNote(
    invoice: InvoiceSnapshot,
    amount: string,
    reason: string,
    creditNoteNumber: string,
  ): CreditNoteDocument;
  generateDebitNote(
    invoice: InvoiceSnapshot,
    amount: string,
    reason: string,
    debitNoteNumber: string,
  ): DebitNoteDocument;
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
  /** See GateCheckpoint -- AUTHORIZATION guards the entry to APPROVED_FOR_WORK. */
  readonly checkpoint: "AUTHORIZATION" | "FINISH" | "DELIVERY";
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

// ---------------------------------------------------------------------------
// Phone Number Normalization & Validation
// ---------------------------------------------------------------------------

/**
 * Normalizes phone numbers to standard E.164 format.
 * Supports:
 * - Local Egyptian numbers (e.g. 010..., 011..., 012..., 015...) -> +20...
 * - Numbers with international prefix (00...) -> +...
 * - Standard E.164 (+...)
 * - Numbers with spaces, hyphens, and parentheses
 */
export function normalizePhoneNumber(raw: string): string {
  if (!raw) return "";
  const cleaned = raw.trim().replace(/[\s\-()]/g, "");
  if (!cleaned) return "";

  if (cleaned.startsWith("+")) {
    return cleaned;
  }
  if (cleaned.startsWith("00")) {
    return "+" + cleaned.slice(2);
  }
  // Egyptian mobile format: 010..., 011..., 012..., 015... (11 digits)
  if (/^01[0125]\d{8}$/.test(cleaned)) {
    return "+20" + cleaned.slice(1);
  }
  // Egyptian mobile without leading zero: 10..., 11..., 12..., 15... (10 digits)
  if (/^1[0125]\d{8}$/.test(cleaned)) {
    return "+20" + cleaned;
  }
  // General digits
  if (/^\d{8,15}$/.test(cleaned)) {
    if (cleaned.startsWith("20") && cleaned.length >= 12) {
      return "+" + cleaned;
    }
    if (cleaned.startsWith("0")) {
      return "+20" + cleaned.slice(1);
    }
    return "+" + cleaned;
  }
  return cleaned;
}

export function isValidPhoneNumber(raw: string): boolean {
  const normalized = normalizePhoneNumber(raw);
  return /^\+[1-9]\d{1,14}$/.test(normalized);
}

// ---------------------------------------------------------------------------
// Workshop UI Themes & Color Palettes
// ---------------------------------------------------------------------------

export type WorkshopPaletteKey = "crimson" | "cobalt" | "emerald" | "amber" | "violet" | "titanium";

export interface WorkshopPaletteDefinition {
  readonly key: WorkshopPaletteKey;
  readonly name: string;
  readonly category: string;
  readonly primary: string;
  readonly primaryDeep: string;
  readonly primaryText: string;
  readonly primaryMuted: string;
  readonly accent: string;
  readonly accentHover: string;
  readonly accentMuted: string;
  readonly focusRing: string;
  readonly previewColor: string;
  readonly description: string;
}

export const WORKSHOP_PALETTES: readonly WorkshopPaletteDefinition[] = [
  {
    key: "crimson",
    name: "Crimson Turbo",
    category: "Motorsport & Performance",
    primary: "#d41717",
    primaryDeep: "#8e1010",
    primaryText: "#ef4444",
    primaryMuted: "#2b1414",
    accent: "#d41717",
    accentHover: "#ee2020",
    accentMuted: "#2b1414",
    focusRing: "#ff4b3e",
    previewColor: "#d41717",
    description: "Classic high-energy performance red with charcoal accents.",
  },
  {
    key: "cobalt",
    name: "Cyber Cobalt",
    category: "High-Tech Diagnostics",
    primary: "#2563eb",
    primaryDeep: "#1e3a8a",
    primaryText: "#60a5fa",
    primaryMuted: "#172554",
    accent: "#2563eb",
    accentHover: "#3b82f6",
    accentMuted: "#172554",
    focusRing: "#60a5fa",
    previewColor: "#2563eb",
    description: "Vibrant diagnostic blue engineered for modern tech-forward shops.",
  },
  {
    key: "emerald",
    name: "Emerald Performance",
    category: "Precision & EV",
    primary: "#059669",
    primaryDeep: "#064e3b",
    primaryText: "#34d399",
    primaryMuted: "#022c22",
    accent: "#059669",
    accentHover: "#10b981",
    accentMuted: "#022c22",
    focusRing: "#34d399",
    previewColor: "#059669",
    description: "Crisp racing green conveying precision craftsmanship and EV readiness.",
  },
  {
    key: "amber",
    name: "Electric Amber",
    category: "Heavy Duty & Speed",
    primary: "#d97706",
    primaryDeep: "#78350f",
    primaryText: "#fbbf24",
    primaryMuted: "#451a03",
    accent: "#d97706",
    accentHover: "#f59e0b",
    accentMuted: "#451a03",
    focusRing: "#fbbf24",
    previewColor: "#d97706",
    description: "Bold gold-amber built for fleet logistics and speed mechanics.",
  },
  {
    key: "violet",
    name: "Royal Violet",
    category: "Exotic & Luxury GT",
    primary: "#7c3aed",
    primaryDeep: "#4c1d95",
    primaryText: "#a78bfa",
    primaryMuted: "#2e1065",
    accent: "#7c3aed",
    accentHover: "#8b5cf6",
    accentMuted: "#2e1065",
    focusRing: "#a78bfa",
    previewColor: "#7c3aed",
    description: "Deep luxury violet tailored for prestige, tuning, and bespoke vehicles.",
  },
  {
    key: "titanium",
    name: "Midnight Titanium",
    category: "Stealth & Industrial",
    primary: "#475569",
    primaryDeep: "#1e293b",
    primaryText: "#94a3b8",
    primaryMuted: "#0f172a",
    accent: "#64748b",
    accentHover: "#94a3b8",
    accentMuted: "#0f172a",
    focusRing: "#cbd5e1",
    previewColor: "#475569",
    description: "Minimalist stealth carbon and slate steel for industrial clarity.",
  },
];

export function getWorkshopPalette(key?: string | null): WorkshopPaletteDefinition {
  const found = WORKSHOP_PALETTES.find((p) => p.key === key);
  return found ?? WORKSHOP_PALETTES[0];
}

