import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  ZERO,
  add,
  compare,
  invoiceTotal,
  isCapabilityActive,
  isZero,
  outstanding,
  overpaid,
  subtract,
  sum,
  type ChargeableItemType,
  type InvoiceCandidate,
  type InvoiceSnapshot,
  type Money,
} from "@mop/shared";
import { Prisma } from "@mop/database";
import { PrismaService } from "../database/prisma.service";
import { CapabilityResolutionService } from "../capabilities/capability-resolution.service";
import { OperationEventsService } from "../operations/operation-events.service";
import { BillingService } from "../billing/billing.service";
import type { LifecycleActor } from "../operations/work-order-lifecycle.service";
import { PriceCatalogService } from "./price-catalog.service";
import { PolicyResolutionService } from "../policies/policy-resolution.service";

export interface AddLineInput {
  readonly tenantId: string;
  readonly workOrderId: string;
  readonly name: string;
  readonly itemType: string;
  readonly quantity: number;
  /**
   * Optional on purpose. Omit it and the workshop's own Service Catalog
   * decides the price, looked up by `name`; pass it and the caller's
   * number wins. Before this was optional the catalogue governed nothing
   * -- every price in the product was whatever the caller typed, so the
   * Owner's Pricing page was write-only.
   */
  readonly unitPrice?: Money;
  readonly labour?: Money;
}

export interface JobTotal {
  readonly subtotal: Money;
  readonly discount: Money;
  readonly tax: Money;
  readonly total: Money;
  readonly lines: readonly {
    id: string;
    name: string;
    quantity: number;
    unitPrice: Money;
    labour: Money;
    total: Money;
  }[];
}

export interface Settlement {
  readonly invoiceId: string;
  readonly total: Money;
  readonly paid: Money;
  readonly outstanding: Money;
  readonly overpaid: Money;
  readonly settled: boolean;
}

/**
 * Finance Core.
 *
 * The rule this phase is judged by:
 *
 *   Never move money you did not mean to move, and never move it twice.
 *
 * Three things follow from it and are not negotiable here.
 *
 * **All arithmetic goes through @mop/shared/money.** Never a JS number,
 * never a Decimal method chain reinvented per call site. That module
 * decides rounding and the discount/tax order once, and
 * tools/lint-money.mjs fails the build if this file forgets.
 *
 * **`paid` and `balance` are derived from payment rows**, never cached.
 * Same reasoning as inventory fulfilment: a stored total is a second
 * source of truth, and the two eventually disagree.
 *
 * **Nothing is ever edited or deleted.** A wrong payment is corrected by
 * a refund, which is its own record. An issued invoice is immutable.
 */
@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capabilities: CapabilityResolutionService,
    private readonly events: OperationEventsService,
    private readonly billing: BillingService,
    private readonly priceCatalog: PriceCatalogService,
    private readonly policies: PolicyResolutionService,
  ) {}

  /**
   * Adds a line to the live total for a job in progress.
   *
   * The running invoice is created on first use rather than at intake:
   * a job that never charges anything should not carry an empty invoice
   * around, and a workshop with no finance never creates one at all.
   */
  async addLine(input: AddLineInput, actor: LifecycleActor): Promise<JobTotal> {
    await this.requireFinance(input.tenantId);

    if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
      throw new BadRequestException({ code: "quantity_invalid", message: "Quantity must be a whole number, at least one." });
    }

    const issued = await this.prisma.invoice.findUnique({ where: { workOrderId: input.workOrderId } });
    if (issued) {
      // An issued invoice is immutable. Adding to it after the customer
      // has been given a total is how a bill changes behind someone.
      throw new ConflictException({
        code: "invoice_already_issued",
        message: "This job has been invoiced. Correct it with a credit note instead.",
      });
    }

    // The catalogue is consulted only when the caller did not state a
    // price. A stated price still wins -- a workshop must be able to
    // charge something one-off without first cataloguing it -- but the
    // common path now goes through the Owner's own Pricing page, so
    // changing a price there changes what a job actually bills.
    const resolved =
      input.unitPrice === undefined ? await this.priceCatalog.resolve(input.tenantId, input.name) : null;

    if (input.unitPrice === undefined && !resolved) {
      throw new BadRequestException({
        code: "price_not_in_catalog",
        message: `"${input.name}" has no price in this workshop's Service Catalog. Add it under Pricing, or pass a price for this line.`,
      });
    }

    const unitPrice = input.unitPrice ?? (resolved as { unitPrice: Money }).unitPrice;
    // A catalogued labour price applies only when the caller left labour
    // unstated too; an explicit zero is a decision, not an omission.
    const labour = input.labour ?? resolved?.laborPrice ?? ZERO;

    await this.prisma.$transaction(async (tx) => {
      const running = await tx.runningInvoice.upsert({
        where: { workOrderId: input.workOrderId },
        create: { tenantId: input.tenantId, workOrderId: input.workOrderId },
        update: {},
        select: { id: true },
      });

      // The line total is computed by the shared module, not here, so one
      // rounding rule governs quotes, running totals and invoices alike.
      const computed = invoiceTotal([{ unitPrice, quantity: input.quantity, labour }]);

      await tx.runningInvoiceLine.create({
        data: {
          tenantId: input.tenantId,
          runningInvoiceId: running.id,
          name: input.name,
          itemType: input.itemType,
          quantity: input.quantity,
          unitPrice,
          laborPrice: labour,
          total: computed.total,
          addedById: actor.accountId,
        },
      });

      await this.emit(tx, input.tenantId, "finance.line_added", input.workOrderId, actor, {
        name: input.name,
        quantity: input.quantity,
        total: computed.total,
      });
    });

    return this.jobTotal(input.tenantId, input.workOrderId);
  }

  /**
   * What this job costs so far.
   *
   * Recomputed from the lines every time. The stored `total` on each line
   * is what was agreed when it was added; the invoice total is the sum of
   * those rounded lines, which is the rule that makes a printed column
   * add up to its printed total.
   */
  async jobTotal(tenantId: string, workOrderId: string): Promise<JobTotal> {
    const running = await this.prisma.runningInvoice.findUnique({
      where: { workOrderId },
      select: {
        lines: {
          select: { id: true, name: true, quantity: true, unitPrice: true, laborPrice: true, total: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    const lines = (running?.lines ?? []).map((line) => ({
      id: line.id,
      name: line.name,
      quantity: line.quantity,
      unitPrice: line.unitPrice.toFixed(2),
      labour: line.laborPrice.toFixed(2),
      total: line.total.toFixed(2),
    }));

    const total = sum(lines.map((line) => line.total));

    // No discount or tax policy is applied to a running total: those are
    // decided at issue time, when somebody with authority commits to them.
    return { subtotal: total, discount: ZERO, tax: ZERO, total, lines };
  }

  /**
   * Issues the invoice: the running total becomes a fixed document.
   *
   * Lines are SNAPSHOTTED, not referenced. A price that changes in the
   * catalog tomorrow must not silently change what a customer was billed
   * yesterday, which is why InvoiceLine carries lockedUnitPrice rather
   * than an item id.
   */
  async issueInvoice(
    tenantId: string,
    workOrderId: string,
    actor: LifecycleActor,
    options: { discountPercent?: number; taxPercent?: number } = {},
  ): Promise<Settlement> {
    await this.requireFinance(tenantId);

    const existing = await this.prisma.invoice.findUnique({ where: { workOrderId }, select: { id: true } });
    if (existing) {
      throw new ConflictException({ code: "invoice_already_issued", message: "This job already has an invoice." });
    }

    const running = await this.prisma.runningInvoice.findUnique({
      where: { workOrderId },
      select: {
        lines: {
          select: { name: true, itemType: true, quantity: true, unitPrice: true, laborPrice: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!running || running.lines.length === 0) {
      throw new BadRequestException({
        code: "nothing_to_invoice",
        message: "There is nothing on this job to invoice.",
      });
    }

    // Everything Billing needs, fetched here rather than left for it to
    // read itself -- Billing must never reach into Operations' or
    // Finance's own tables to decide what to invoice, per SYSTEMS.md.
    const [workOrder, tenant] = await Promise.all([
      this.prisma.workOrder.findUniqueOrThrow({
        where: { id: workOrderId },
        select: { branchId: true, customerId: true },
      }),
      this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { country: true, currency: true } }),
    ]);

    const computed = invoiceTotal(
      running.lines.map((line) => ({
        unitPrice: line.unitPrice.toFixed(2),
        quantity: line.quantity,
        labour: line.laborPrice.toFixed(2),
        discountPercent: options.discountPercent,
        taxPercent: options.taxPercent,
      })),
    );

    await this.enforceDiscountAuthority(tenantId, workOrderId, options.discountPercent ?? 0, computed.discount);

    const invoiceId = await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          tenantId,
          workOrderId,
          invoiceNumber: await this.nextInvoiceNumber(tx, tenantId),
          subtotal: computed.subtotal,
          discount: computed.discount,
          tax: computed.tax,
          total: computed.total,
          // paid and balance are DERIVED. These columns exist for
          // reporting convenience only, and settlement() never reads them
          // -- see the comment on settlement().
          paid: ZERO,
          balance: computed.total,
          issuedById: actor.accountId,
        },
        select: { id: true },
      });

      await tx.invoiceLine.createMany({
        data: running.lines.map((line, index) => ({
          tenantId,
          invoiceId: invoice.id,
          name: line.name,
          itemType: line.itemType,
          quantity: line.quantity,
          lockedUnitPrice: line.unitPrice,
          lockedLaborPrice: line.laborPrice,
          total: computed.lines[index].total,
        })),
      });

      await this.emit(tx, tenantId, "finance.invoice_issued", invoice.id, actor, {
        workOrderId,
        total: computed.total,
      });

      const stored = await tx.invoice.findUniqueOrThrow({
        where: { id: invoice.id },
        select: { invoiceNumber: true, issuedAt: true },
      });

      const candidateLines = running.lines.map((line, index) => ({
        name: line.name,
        itemType: line.itemType as ChargeableItemType,
        // The running invoice does not currently track provenance
        // per line -- NOT_APPLICABLE is honest rather than guessed.
        provenance: "NOT_APPLICABLE" as const,
        quantity: line.quantity,
        unitPrice: line.unitPrice.toFixed(2),
        labourPrice: line.laborPrice.toFixed(2),
        lineTotal: computed.lines[index].total,
        taxCode: null,
        sourceType: "MANUAL" as const,
        sourceId: invoice.id,
      }));

      const candidate: InvoiceCandidate = {
        tenantId,
        branchId: workOrder.branchId,
        customerId: workOrder.customerId,
        workOrderId,
        currency: tenant.currency,
        country: tenant.country,
        billingProfile: "DEFAULT",
        invoiceType: "STANDARD",
        lines: candidateLines,
        taxBreakdown: [],
        subtotal: computed.subtotal,
        discountTotal: computed.discount,
        taxTotal: computed.tax,
        total: computed.total,
        amountPaid: ZERO,
        createdById: actor.accountId,
        createdAt: stored.issuedAt.toISOString(),
      };

      const snapshot: InvoiceSnapshot = {
        tenantId,
        invoiceId: invoice.id,
        invoiceNumber: stored.invoiceNumber,
        currency: tenant.currency,
        country: tenant.country,
        lines: candidateLines,
        taxBreakdown: [],
        subtotal: computed.subtotal,
        discountTotal: computed.discount,
        taxTotal: computed.tax,
        total: computed.total,
        issuedAt: stored.issuedAt.toISOString(),
      };

      // Same transaction, deliberately -- an invoice must never exist
      // without its billing document at least attempted, the same
      // discipline StockService uses for a part leaving the shelf.
      await this.billing.issueDocument(candidate, snapshot, tx);

      return invoice.id;
    });

    return this.settlement(invoiceId);
  }

  /**
   * Records a payment. Idempotent by key.
   *
   * The subtle case, and the reason this is not a one-liner: the same key
   * with a DIFFERENT amount is refused, not replayed. A client reusing a
   * key for a different amount is not retrying -- it is confused, or two
   * people are taking money for the same job at once. Silently returning
   * the first payment there leaves a customer charged an amount nobody
   * recorded.
   *
   * The upfront `findUnique` below is a fast path only, not the guarantee
   * -- two requests carrying the same key can both read "not found" before
   * either has written (H5, `docs/scenarios3/EDGE_CASE_REGISTER.md`). What
   * actually prevents a duplicate payment is `Payment.idempotencyKey`'s
   * database-level unique constraint; the loser of that race catches the
   * resulting P2002 here and re-runs the same same-invoice/same-amount
   * comparison against the row that won, so a genuine concurrent retry
   * still resolves to one settlement instead of an unhandled 500.
   */
  async recordPayment(
    tenantId: string,
    invoiceId: string,
    input: { amount: Money; method: string; idempotencyKey: string },
    actor: LifecycleActor,
  ): Promise<Settlement> {
    await this.requireFinance(tenantId);

    const existing = await this.prisma.payment.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: { id: true, invoiceId: true, amount: true },
    });

    if (existing) {
      return this.resolveIdempotentReplay(existing, invoiceId, input.amount);
    }

    const before = await this.settlement(invoiceId);

    // P-05. A workshop that has opted into full settlement only refuses a
    // short amount rather than banking it -- checked before the
    // already-settled branch below, so the refusal reads as "this
    // workshop does not take part payments" and not as a stray
    // idempotency error.
    if (!before.settled && (await this.policies.resolveValue(tenantId, "PARTIAL_PAYMENT")) === "FULL_ONLY") {
      if (compare(input.amount, before.outstanding) !== 0) {
        throw new ConflictException({
          code: "partial_payment_refused",
          message: `This workshop settles in full. The outstanding balance is ${before.outstanding}.`,
        });
      }
    }

    if (before.settled) {
      // Could be a genuine second payment against an already-full
      // invoice, or this exact key's own payment landing between the
      // findUnique above and this read (the same H5 race, one check
      // later) -- re-check for this specific key before refusing.
      const raced = await this.prisma.payment.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        select: { id: true, invoiceId: true, amount: true },
      });
      if (raced) return this.resolveIdempotentReplay(raced, invoiceId, input.amount);
      throw new ConflictException({ code: "already_settled", message: "This invoice is already paid in full." });
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.payment.create({
          data: {
            tenantId,
            invoiceId,
            amount: input.amount,
            method: input.method as never,
            idempotencyKey: input.idempotencyKey,
            recordedById: actor.accountId,
          },
        });

        await this.emit(tx, tenantId, "finance.payment_recorded", invoiceId, actor, {
          amount: input.amount,
          method: input.method,
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        // Lost the race to a concurrent call carrying the same key --
        // resolve against whichever row actually landed, exactly as the
        // upfront check above would have if it had run a moment later.
        const winner = await this.prisma.payment.findUniqueOrThrow({
          where: { idempotencyKey: input.idempotencyKey },
          select: { id: true, invoiceId: true, amount: true },
        });
        return this.resolveIdempotentReplay(winner, invoiceId, input.amount);
      }
      throw error;
    }

    await this.refreshCachedTotals(invoiceId);
    return this.settlement(invoiceId);
  }

  private resolveIdempotentReplay(
    existing: { invoiceId: string; amount: Prisma.Decimal },
    invoiceId: string,
    amount: Money,
  ): Promise<Settlement> {
    const sameInvoice = existing.invoiceId === invoiceId;
    const sameAmount = compare(existing.amount.toFixed(2), amount) === 0;

    if (sameInvoice && sameAmount) {
      // A genuine retry. Not a second payment.
      return this.settlement(invoiceId);
    }

    throw new ConflictException({
      code: "idempotency_conflict",
      message:
        "That payment reference has already been used for a different amount or job. " +
        "Check whether the payment was already taken before recording it again.",
    });
  }

  /**
   * Where this invoice stands.
   *
   * `paid` is summed from confirmed payment rows every time rather than
   * read from Invoice.paid. Those columns are a reporting convenience
   * that a bug could leave stale; the rows are what actually happened.
   */
  /**
   * `paid` nets out completed refunds, never edits a payment row.
   * A payment is a fact about money that moved once; a refund is a
   * separate fact about money that moved back, with its own reason and
   * its own actor. Subtracting it here keeps both facts on the record
   * instead of pretending the original payment was smaller than it was.
   */
  async settlement(invoiceId: string): Promise<Settlement> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, total: true },
    });
    if (!invoice) throw new NotFoundException({ code: "invoice_not_found", message: "Invoice not found." });

    const [payments, refunds] = await Promise.all([
      this.prisma.payment.findMany({ where: { invoiceId, status: "CONFIRMED" }, select: { amount: true } }),
      this.prisma.refundRequest.findMany({ where: { invoiceId, status: "COMPLETED" }, select: { amount: true } }),
    ]);

    const total = invoice.total.toFixed(2);
    const grossPaid = sum(payments.map((payment) => payment.amount.toFixed(2)));
    const refunded = sum(refunds.map((refund) => refund.amount.toFixed(2)));
    const paid = subtract(grossPaid, refunded);

    return {
      invoiceId,
      total,
      paid,
      outstanding: outstanding(total, paid),
      overpaid: overpaid(total, paid),
      settled: compare(paid, total) >= 0,
    };
  }

  // --- refunds ---------------------------------------------------------

  /**
   * A technician or manager asks for money back on an issued invoice.
   * Sits at PENDING until someone else decides -- approving your own
   * refund request is exactly the kind of thing Phase 19's separation-
   * of-duties work will eventually gate explicitly; for now the decision
   * simply requires a second call with a different actor, which the
   * controller can enforce by permission.
   */
  async requestRefund(
    tenantId: string,
    invoiceId: string,
    amount: Money,
    reason: string,
    actor: LifecycleActor,
    // Phase 19.C -- routine vs. remediation of a disputed/fraudulent
    // charge. Defaults to ROUTINE: most refunds are exactly that, and a
    // requester should have to actively say otherwise, not the reverse.
    reasonCategory: "ROUTINE" | "DISPUTE_REMEDIATION" = "ROUTINE",
  ): Promise<{ id: string; status: "PENDING" }> {
    await this.requireFinance(tenantId);

    const settlement = await this.settlement(invoiceId);
    if (compare(amount, settlement.paid) > 0) {
      throw new BadRequestException({
        code: "over_refund",
        message: `Only ${settlement.paid} was actually paid; ${amount} cannot be refunded.`,
      });
    }

    const requestId = await this.prisma.$transaction(async (tx) => {
      const request = await tx.refundRequest.create({
        data: { tenantId, invoiceId, amount, reason, reasonCategory, requestedById: actor.accountId },
        select: { id: true },
      });
      await this.emit(tx, tenantId, "finance.refund_requested", request.id, actor, { invoiceId, amount, reason, reasonCategory });
      return request.id;
    });

    return { id: requestId, status: "PENDING" };
  }

  /**
   * Approved, and only now does money actually move -- a request on its
   * own changes nothing. Produces a real CreditNote through Billing,
   * because a refund without a document is money leaving with no
   * artifact a customer or a tax authority could ever ask to see.
   */
  async approveRefund(refundRequestId: string, actor: LifecycleActor): Promise<{ id: string; creditNoteNumber: string }> {
    const refund = await this.prisma.refundRequest.findUnique({ where: { id: refundRequestId } });
    if (!refund) throw new NotFoundException({ code: "refund_not_found", message: "Refund request not found." });
    if (refund.status !== "PENDING") {
      throw new ConflictException({
        code: "refund_not_pending",
        message: `This refund is already ${refund.status.toLowerCase()}.`,
      });
    }

    const creditNote = await this.prisma.$transaction(async (tx) => {
      await tx.refundRequest.update({
        where: { id: refundRequestId },
        data: { status: "COMPLETED", decidedById: actor.accountId, decidedAt: new Date() },
      });

      const issued = await this.billing.issueCreditNote(
        {
          tenantId: refund.tenantId,
          invoiceId: refund.invoiceId,
          amount: refund.amount.toFixed(2),
          reason: refund.reason,
          issuedById: actor.accountId,
        },
        tx,
      );

      await this.emit(tx, refund.tenantId, "finance.refund_approved", refundRequestId, actor, {
        invoiceId: refund.invoiceId,
        amount: refund.amount.toFixed(2),
        creditNoteNumber: issued.creditNoteNumber,
      });

      return issued;
    });

    await this.refreshCachedTotals(refund.invoiceId);

    return { id: refundRequestId, creditNoteNumber: creditNote.creditNoteNumber };
  }

  async rejectRefund(refundRequestId: string, actor: LifecycleActor, reason?: string): Promise<{ id: string; status: "REJECTED" }> {
    const refund = await this.prisma.refundRequest.findUnique({ where: { id: refundRequestId } });
    if (!refund) throw new NotFoundException({ code: "refund_not_found", message: "Refund request not found." });
    if (refund.status !== "PENDING") {
      throw new ConflictException({
        code: "refund_not_pending",
        message: `This refund is already ${refund.status.toLowerCase()}.`,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.refundRequest.update({
        where: { id: refundRequestId },
        data: { status: "REJECTED", decidedById: actor.accountId, decidedAt: new Date() },
      });
      await this.emit(tx, refund.tenantId, "finance.refund_rejected", refundRequestId, actor, { reason });
    });

    return { id: refundRequestId, status: "REJECTED" };
  }

  // --- discounts -------------------------------------------------------
  //
  // DISCOUNT_AUTHORITY (packages/shared/src/policies/registry.ts) is the
  // policy this section makes real. `FinanceConfiguration` has carried
  // `discountApprovalThreshold`/`maxDiscountPercent` since Phase 8; until
  // now nothing ever read them, so any amount of discount at issue time
  // was unrestricted for anyone holding `finance.invoice.issue`. That is
  // the exact gap the policy exists to close.

  /**
   * Asks for a discount above the workshop's threshold. Sits at PENDING
   * until someone else decides -- the same request/decide separation as
   * a refund, and for the same reason: a role that can ask should not
   * automatically be able to grant its own ask.
   */
  async requestDiscount(
    tenantId: string,
    workOrderId: string,
    amount: Money,
    reason: string,
    actor: LifecycleActor,
  ): Promise<{ id: string; status: "PENDING" }> {
    await this.requireFinance(tenantId);

    const authority = await this.policies.resolveValue(tenantId, "DISCOUNT_AUTHORITY");
    if (authority === "NONE") {
      throw new ForbiddenException({
        code: "discounts_not_offered",
        message: "This workshop does not offer discounts.",
      });
    }

    const requestId = await this.prisma.$transaction(async (tx) => {
      const request = await tx.discountRequest.create({
        data: { tenantId, workOrderId, amount, reason, requestedById: actor.accountId },
        select: { id: true },
      });
      await this.emit(tx, tenantId, "finance.discount_requested", request.id, actor, { workOrderId, amount, reason }, "WorkOrder");
      return request.id;
    });

    return { id: requestId, status: "PENDING" };
  }

  async approveDiscount(discountRequestId: string, actor: LifecycleActor): Promise<{ id: string; status: "APPROVED" }> {
    const discount = await this.prisma.discountRequest.findUnique({ where: { id: discountRequestId } });
    if (!discount) throw new NotFoundException({ code: "discount_not_found", message: "Discount request not found." });
    if (discount.status !== "PENDING") {
      throw new ConflictException({
        code: "discount_not_pending",
        message: `This discount request is already ${discount.status.toLowerCase()}.`,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.discountRequest.update({
        where: { id: discountRequestId },
        data: { status: "APPROVED", decidedById: actor.accountId, decidedAt: new Date() },
      });
      await this.emit(
        tx,
        discount.tenantId,
        "finance.discount_approved",
        discountRequestId,
        actor,
        { workOrderId: discount.workOrderId, amount: discount.amount.toFixed(2) },
        "WorkOrder",
      );
    });

    return { id: discountRequestId, status: "APPROVED" };
  }

  async rejectDiscount(discountRequestId: string, actor: LifecycleActor, reason?: string): Promise<{ id: string; status: "REJECTED" }> {
    const discount = await this.prisma.discountRequest.findUnique({ where: { id: discountRequestId } });
    if (!discount) throw new NotFoundException({ code: "discount_not_found", message: "Discount request not found." });
    if (discount.status !== "PENDING") {
      throw new ConflictException({
        code: "discount_not_pending",
        message: `This discount request is already ${discount.status.toLowerCase()}.`,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.discountRequest.update({
        where: { id: discountRequestId },
        data: { status: "REJECTED", decidedById: actor.accountId, decidedAt: new Date() },
      });
      await this.emit(tx, discount.tenantId, "finance.discount_rejected", discountRequestId, actor, { reason }, "WorkOrder");
    });

    return { id: discountRequestId, status: "REJECTED" };
  }

  /**
   * Refuses to issue an invoice carrying a discount this workshop's
   * DISCOUNT_AUTHORITY answer has not actually authorised.
   *
   * `NONE` refuses any discount outright. `ANY_STAFF_UNLIMITED` is the
   * pre-existing, unrestricted behaviour -- whoever holds
   * `finance.invoice.issue` decides. `THRESHOLD_THEN_APPROVAL` and
   * `ALWAYS_APPROVAL` both require a matching `DiscountRequest` in
   * `APPROVED` status for this exact work order and amount; because a
   * work order can only ever carry one invoice (`invoice_already_issued`
   * above), an approved request can only ever be spent once, with no
   * separate "consumed" flag needed.
   */
  private async enforceDiscountAuthority(
    tenantId: string,
    workOrderId: string,
    discountPercent: number,
    discountAmount: Money,
  ): Promise<void> {
    if (discountPercent <= 0 || isZero(discountAmount)) return;

    const authority = await this.policies.resolveValue(tenantId, "DISCOUNT_AUTHORITY");
    if (authority === "ANY_STAFF_UNLIMITED") return;

    if (authority === "NONE") {
      throw new ForbiddenException({
        code: "discounts_not_offered",
        message: "This workshop does not offer discounts.",
      });
    }

    let needsApproval = authority === "ALWAYS_APPROVAL";
    if (authority === "THRESHOLD_THEN_APPROVAL") {
      const config = await this.prisma.financeConfiguration.findUnique({
        where: { tenantId },
        select: { discountApprovalThreshold: true, maxDiscountPercent: true },
      });
      const threshold = config?.discountApprovalThreshold.toFixed(2) ?? "0.00";
      // money-lint-ok: a percentage (0-100), not currency -- compared
      // directly against discountPercent, which the API boundary itself
      // already types as a JS number (IssueInvoiceDto).
      const maxPercent = config ? Number(config.maxDiscountPercent) : 0;
      needsApproval = compare(discountAmount, threshold) > 0 || discountPercent > maxPercent;
    }
    if (!needsApproval) return;

    const approved = await this.prisma.discountRequest.findFirst({
      where: { tenantId, workOrderId, status: "APPROVED" },
      orderBy: { decidedAt: "desc" },
    });

    if (!approved) {
      throw new ForbiddenException({
        code: "discount_approval_required",
        message: "This discount needs an approved request before the invoice can be issued.",
      });
    }
    if (compare(approved.amount.toFixed(2), discountAmount) !== 0) {
      throw new ForbiddenException({
        code: "discount_approval_mismatch",
        message: `The approved discount (${approved.amount.toFixed(2)}) does not match what is being invoiced (${discountAmount}).`,
      });
    }
  }

  // --- internals -----------------------------------------------------

  /**
   * Writes the derived figures back onto the invoice row.
   *
   * A convenience for reporting and for the delivery gate's `balance > 0`
   * query, NOT a source of truth. settlement() deliberately ignores these
   * columns, so a bug here shows up as a stale report rather than as a
   * customer being told the wrong thing.
   */
  private async refreshCachedTotals(invoiceId: string): Promise<void> {
    const current = await this.settlement(invoiceId);

    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        paid: current.paid,
        balance: current.outstanding,
        status: current.settled ? "PAID" : compare(current.paid, ZERO) > 0 ? "PARTIALLY_PAID" : "ISSUED",
      },
    });
  }

  /**
   * Sequential per workshop, and allocated inside the caller's
   * transaction so two invoices issued at the same moment cannot collide.
   *
   * `InvoiceSequence` is a single atomic upsert-increment
   * (`INSERT ... ON CONFLICT DO UPDATE SET "lastNumber" = "lastNumber" + 1`),
   * which Postgres itself locks the row for -- no separate SELECT-then-
   * write step is needed here the way the stock balance's decrement
   * needed one (that case had a business-rule rejection between reading
   * and writing; this one is a pure increment, which the database can do
   * in one statement).
   *
   * This used to be `tx.invoice.count({ where: { tenantId } }) + 1`, with
   * the `(tenantId, invoiceNumber)` unique constraint as "the backstop" --
   * meaning two invoices issued for the same tenant at the same instant
   * could both count N and race the constraint, aborting one transaction
   * at the worst possible moment. The `invoice_sequences` table this
   * method now actually uses has existed in the schema the whole time.
   * See docs/scenarios3/EDGE_CASE_REGISTER.md, H3.
   */
  private async nextInvoiceNumber(tx: Prisma.TransactionClient, tenantId: string): Promise<string> {
    const [row] = await tx.$queryRaw<{ lastNumber: number }[]>(Prisma.sql`
      INSERT INTO "invoice_sequences" ("tenantId", "lastNumber")
      VALUES (${tenantId}, 1)
      ON CONFLICT ("tenantId") DO UPDATE SET "lastNumber" = "invoice_sequences"."lastNumber" + 1
      RETURNING "lastNumber"
    `);
    return `INV-${String(row.lastNumber).padStart(6, "0")}`;
  }

  private async requireFinance(tenantId: string): Promise<void> {
    const profile = await this.capabilities.resolveCurrent(tenantId);
    if (!isCapabilityActive(profile, "FINANCE_CORE")) {
      throw new ForbiddenException({
        code: "finance_disabled",
        message: "This workshop does not handle money through MOP.",
      });
    }
  }

  private async emit(
    tx: Prisma.TransactionClient,
    tenantId: string,
    eventKey: string,
    targetId: string,
    actor: LifecycleActor,
    payload: Record<string, unknown>,
    targetType: string = "Invoice",
  ): Promise<void> {
    await this.events.emit(
      {
        tenantId,
        eventKey,
        actorId: actor.accountId,
        actorName: actor.displayName,
        actorType: actor.actorType,
        targetType,
        targetId,
        riskLevel: "MEDIUM",
        payload,
      },
      tx,
    );
  }
}

/** Re-exported so callers do not reach past this service into the module. */
export { add, type Money };
