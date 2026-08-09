import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  ZERO,
  add,
  compare,
  invoiceTotal,
  isCapabilityActive,
  outstanding,
  overpaid,
  sum,
  type Money,
} from "@mop/shared";
import type { Prisma } from "@mop/database";
import { PrismaService } from "../database/prisma.service";
import { CapabilityResolutionService } from "../capabilities/capability-resolution.service";
import { OperationEventsService } from "../operations/operation-events.service";
import type { LifecycleActor } from "../operations/work-order-lifecycle.service";

export interface AddLineInput {
  readonly tenantId: string;
  readonly workOrderId: string;
  readonly name: string;
  readonly itemType: string;
  readonly quantity: number;
  readonly unitPrice: Money;
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

    await this.prisma.$transaction(async (tx) => {
      const running = await tx.runningInvoice.upsert({
        where: { workOrderId: input.workOrderId },
        create: { tenantId: input.tenantId, workOrderId: input.workOrderId },
        update: {},
        select: { id: true },
      });

      // The line total is computed by the shared module, not here, so one
      // rounding rule governs quotes, running totals and invoices alike.
      const computed = invoiceTotal([
        { unitPrice: input.unitPrice, quantity: input.quantity, labour: input.labour ?? ZERO },
      ]);

      await tx.runningInvoiceLine.create({
        data: {
          tenantId: input.tenantId,
          runningInvoiceId: running.id,
          name: input.name,
          itemType: input.itemType,
          quantity: input.quantity,
          unitPrice: input.unitPrice,
          laborPrice: input.labour ?? ZERO,
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

    const computed = invoiceTotal(
      running.lines.map((line) => ({
        unitPrice: line.unitPrice.toFixed(2),
        quantity: line.quantity,
        labour: line.laborPrice.toFixed(2),
        discountPercent: options.discountPercent,
        taxPercent: options.taxPercent,
      })),
    );

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
      const sameInvoice = existing.invoiceId === invoiceId;
      const sameAmount = compare(existing.amount.toFixed(2), input.amount) === 0;

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

    const before = await this.settlement(invoiceId);
    if (before.settled) {
      throw new ConflictException({ code: "already_settled", message: "This invoice is already paid in full." });
    }

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

    await this.refreshCachedTotals(invoiceId);
    return this.settlement(invoiceId);
  }

  /**
   * Where this invoice stands.
   *
   * `paid` is summed from confirmed payment rows every time rather than
   * read from Invoice.paid. Those columns are a reporting convenience
   * that a bug could leave stale; the rows are what actually happened.
   */
  async settlement(invoiceId: string): Promise<Settlement> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, total: true },
    });
    if (!invoice) throw new NotFoundException({ code: "invoice_not_found", message: "Invoice not found." });

    const payments = await this.prisma.payment.findMany({
      where: { invoiceId, status: "CONFIRMED" },
      select: { amount: true },
    });

    const total = invoice.total.toFixed(2);
    const paid = sum(payments.map((payment) => payment.amount.toFixed(2)));

    return {
      invoiceId,
      total,
      paid,
      outstanding: outstanding(total, paid),
      overpaid: overpaid(total, paid),
      settled: compare(paid, total) >= 0,
    };
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
   * The unique constraint on (tenantId, invoiceNumber) is the backstop.
   */
  private async nextInvoiceNumber(tx: Prisma.TransactionClient, tenantId: string): Promise<string> {
    const count = await tx.invoice.count({ where: { tenantId } });
    return `INV-${String(count + 1).padStart(6, "0")}`;
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
  ): Promise<void> {
    await this.events.emit(
      {
        tenantId,
        eventKey,
        actorId: actor.accountId,
        actorName: actor.displayName,
        actorType: actor.actorType,
        targetType: "Invoice",
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
