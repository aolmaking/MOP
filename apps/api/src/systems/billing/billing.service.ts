import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { Prisma } from "@mop/database";
import type {
  BillingCountryAdapter,
  ClearanceStatus,
  InvoiceCandidate,
  InvoiceSnapshot,
} from "@mop/shared";
import { PrismaService } from "../../runtime/database/prisma.service";
import { GenericBillingAdapter } from "./generic-billing-adapter.service";

export interface IssueDocumentResult {
  readonly billingDocumentId: string;
  readonly documentNumber: string;
  readonly status: ClearanceStatus;
}

export interface IssueCreditNoteInput {
  readonly tenantId: string;
  readonly invoiceId: string;
  readonly amount: string;
  readonly reason: string;
  readonly issuedById: string;
}

const CLEARANCE_TO_DOCUMENT_STATUS: Record<ClearanceStatus, "PENDING" | "CLEARED" | "REJECTED" | "CLEARANCE_FAILED"> = {
  NOT_REQUIRED: "CLEARED",
  PENDING: "PENDING",
  CLEARED: "CLEARED",
  REJECTED: "REJECTED",
  FAILED: "CLEARANCE_FAILED",
};

/**
 * Countries `GenericBillingAdapter` is NOT a compliance gap for -- empty
 * today, deliberately: no country adapter ships in Phase 9 (see the
 * phase doc's exit criteria), so every country is compliant-blocked
 * until `EgyptETAAdapter` or `SaudiZATCAAdapter` actually exist and are
 * added here. This is the one line that changes when they do.
 */
const ADAPTER_COVERED_COUNTRIES = new Set<string>();

/**
 * Billing -- a separate bounded system from Finance Core, per this
 * project's own recorded decision. Finance decides how much; this
 * decides whether the resulting document is legally sufficient, and
 * never touches the amount it was handed.
 *
 * Consumes `InvoiceCandidate` as a typed contract call, not by reading
 * Finance's or Operations' tables -- everything this service needs
 * arrives as a parameter. See `docs/phases/PHASE_9.md` for why this is
 * a direct call rather than genuine queue-based dispatch: the
 * infrastructure for the latter does not exist anywhere in this
 * codebase yet, and inventing it here would be Phase 13's job done
 * early and alone.
 */
@Injectable()
export class BillingService {
  private readonly adapter: BillingCountryAdapter;

  constructor(
    private readonly prisma: PrismaService,
    generic: GenericBillingAdapter,
    @Optional() @Inject("BILLING_COUNTRY_ADAPTER") customAdapter?: BillingCountryAdapter,
  ) {
    // A real country adapter, once one exists, is injected under this
    // token per tenant/country -- selection logic is deliberately out of
    // scope for Phase 9 (only the generic adapter ships), so today this
    // is always the generic one unless a test supplies its own.
    this.adapter = customAdapter ?? generic;
  }

  /**
   * Produces the `BillingDocument` for an invoice Finance has already
   * created. Runs inside the caller's transaction when one is passed, so
   * an invoice can never exist without its document half-created.
   *
   * Respects External Billing Mode: when the tenant's own accounting
   * software owns the document, this writes nothing and returns null --
   * the delivery gate is satisfied by `externalInvoiceReference` being
   * present, not by a `BillingDocument` row existing.
   */
  async issueDocument(
    candidate: InvoiceCandidate,
    snapshot: InvoiceSnapshot,
    tx?: Prisma.TransactionClient,
    // UNCOVERED_COUNTRY_BILLING's resolved value, read by the caller
    // BEFORE opening its transaction and handed in here rather than
    // looked up inside it -- ten simultaneously-issuing invoices each
    // adding one more query to an already-tight interactive transaction
    // is exactly what pushed a real concurrency test over Prisma's 5s
    // transaction timeout when this was resolved in here instead.
    countryBillingRule: string = "WARN_ONLY",
  ): Promise<IssueDocumentResult | null> {
    this.assertSameTenant(candidate, snapshot);
    const client = tx ?? this.prisma;

    const configuration = await client.financeConfiguration.findUnique({
      where: { tenantId: candidate.tenantId },
      select: { externalBillingEnabled: true },
    });

    // Kept current on every issue, not on a schedule -- the moment a
    // tenant's country coverage or External Billing Mode changes is
    // exactly the moment this flag needs to be right, and issuing an
    // invoice is the one guaranteed touchpoint that happens regularly
    // enough to keep it from ever going stale.
    const compliantBlocked = await this.refreshCompliantBlocked(
      client,
      candidate.tenantId,
      candidate.country,
      configuration?.externalBillingEnabled ?? false,
    );

    if (configuration?.externalBillingEnabled) return null;

    // UNCOVERED_COUNTRY_BILLING: WARN_ONLY is Phase 9's original,
    // visibility-only behaviour -- the flag is set and nothing is
    // refused. BLOCK and BLOCK_WITH_OVERRIDE both refuse the invoice
    // outright; the audited override action BLOCK_WITH_OVERRIDE implies
    // is Governance Controls' work, the same honest gap
    // DELIVERY_BLOCKED_UNTIL_PAID's REQUIRES_OVERRIDE already carries.
    if (compliantBlocked && (countryBillingRule === "BLOCK" || countryBillingRule === "BLOCK_WITH_OVERRIDE")) {
      throw new BadRequestException({
        code: "country_not_covered",
        message: `This workshop's country has no billing adapter yet, and this workshop's policy refuses to issue without one. Enable External Billing Mode, or change the policy answer.`,
      });
    }

    const validation = this.adapter.validateInvoice(candidate);
    if (!validation.valid) {
      // A real HTTP exception, not a bare Error -- this used to surface
      // as an opaque 500 with no handler, and because it throws inside
      // issueInvoice()'s own transaction (deliberately: an invoice must
      // never exist without its billing document at least attempted),
      // whoever is closing out the job needs an actual reason, not a
      // stack trace.
      throw new BadRequestException({
        code: "billing_validation_failed",
        message: `This invoice cannot be issued: ${validation.errors.map((e) => `${e.field} — ${e.message}`).join("; ")}`,
      });
    }

    const artifact = this.adapter.generateDocument(snapshot);
    const clearance = this.adapter.submitForClearance(snapshot);

    const document = await client.billingDocument.create({
      data: {
        tenantId: candidate.tenantId,
        invoiceId: snapshot.invoiceId,
        documentNumber: artifact.documentNumber,
        adapterName: artifact.adapterName,
        status: CLEARANCE_TO_DOCUMENT_STATUS[clearance.status],
        qrPayload: artifact.qr.data,
        clearanceReference: clearance.clearanceReference,
        // The immutable rendered snapshot -- never re-read from Invoice
        // later, the same reason InvoiceLine.lockedUnitPrice exists one
        // level down.
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
      },
      select: { id: true, documentNumber: true },
    });

    return { billingDocumentId: document.id, documentNumber: document.documentNumber, status: clearance.status };
  }

  /**
   * A refund, once approved elsewhere (Finance owns that workflow --
   * this service only ever produces the document), becomes a real,
   * numbered `CreditNote`. The number comes from `credit_note_sequences`
   * with the same atomic upsert-increment `InvoiceSequence` proved out
   * for invoices -- no separate design needed, the same fix applies.
   */
  async issueCreditNote(input: IssueCreditNoteInput, tx?: Prisma.TransactionClient): Promise<{ creditNoteId: string; creditNoteNumber: string }> {
    const client = tx ?? this.prisma;

    const document = await client.billingDocument.findFirst({
      where: { invoiceId: input.invoiceId, tenantId: input.tenantId },
    });

    const invoice = await client.invoice.findFirst({
      where: { id: input.invoiceId, tenantId: input.tenantId },
      include: { lines: true },
    });
    if (!invoice) throw new NotFoundException({ code: "invoice_not_found", message: "Invoice not found." });

    const snapshot: InvoiceSnapshot = document
      ? (document.snapshot as unknown as InvoiceSnapshot)
      : {
          tenantId: invoice.tenantId,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          currency: "",
          country: "",
          lines: [],
          taxBreakdown: [],
          subtotal: invoice.subtotal.toFixed(2),
          discountTotal: invoice.discount.toFixed(2),
          taxTotal: invoice.tax.toFixed(2),
          total: invoice.total.toFixed(2),
          issuedAt: invoice.issuedAt.toISOString(),
        };

    const creditNoteNumber = await this.nextCreditNoteNumber(client, input.tenantId);
    const generated = this.adapter.generateCreditNote(snapshot, input.amount, input.reason, creditNoteNumber);

    const creditNote = await client.creditNote.create({
      data: {
        tenantId: input.tenantId,
        invoiceId: input.invoiceId,
        billingDocumentId: document?.id,
        creditNoteNumber: generated.creditNoteNumber,
        amount: input.amount,
        reason: input.reason,
        issuedById: input.issuedById,
      },
      select: { id: true, creditNoteNumber: true },
    });

    return { creditNoteId: creditNote.id, creditNoteNumber: creditNote.creditNoteNumber ?? creditNoteNumber };
  }

  /**
   * A tenant is compliant-blocked when its country has no adapter beyond
   * the generic one and it is not in External Billing Mode -- the
   * distinction named in docs/phases/PHASE_9.md section 6: this is a
   * platform limitation, not a tenant choice. What that means for
   * issuance is UNCOVERED_COUNTRY_BILLING's own decision, read by the
   * caller right after this returns -- WARN_ONLY leaves the flag as
   * visibility only (MOP is not the tenant's lawyer), BLOCK and
   * BLOCK_WITH_OVERRIDE refuse. Upserts the row, since nothing before
   * this ever created one -- `FinanceConfiguration` existed in the
   * schema since Phase 8 with no writer at all.
   */
  private async refreshCompliantBlocked(
    client: PrismaService | Prisma.TransactionClient,
    tenantId: string,
    country: string,
    externalBillingEnabled: boolean,
  ): Promise<boolean> {
    const compliantBlocked = !externalBillingEnabled && !ADAPTER_COVERED_COUNTRIES.has(country);

    await client.financeConfiguration.upsert({
      where: { tenantId },
      create: { tenantId, compliantBlocked },
      update: { compliantBlocked },
    });

    return compliantBlocked;
  }

  private assertSameTenant(candidate: InvoiceCandidate, snapshot: InvoiceSnapshot): void {
    if (candidate.tenantId === snapshot.tenantId) return;
    throw new BadRequestException({
      code: "billing_contract_tenant_mismatch",
      message: "Billing document input must describe one tenant.",
    });
  }

  /** Same atomic-upsert pattern as FinanceService.nextInvoiceNumber(). */
  private async nextCreditNoteNumber(
    client: PrismaService | Prisma.TransactionClient,
    tenantId: string,
  ): Promise<string> {
    const [row] = await client.$queryRaw<{ lastNumber: number }[]>(Prisma.sql`
      INSERT INTO "credit_note_sequences" ("tenantId", "lastNumber")
      VALUES (${tenantId}, 1)
      ON CONFLICT ("tenantId") DO UPDATE SET "lastNumber" = "credit_note_sequences"."lastNumber" + 1
      RETURNING "lastNumber"
    `);
    return `CN-${String(row.lastNumber).padStart(6, "0")}`;
  }
}
