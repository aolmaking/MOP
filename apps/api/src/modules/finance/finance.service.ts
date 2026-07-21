import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  DiscountStatus,
  FinancialLineStatus,
  InvoiceStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  QuotationItemStatus,
  QuotationStatus,
  RefundStatus,
  SellableItemType
} from "@prisma/client";
import type {
  FinalInvoiceDto,
  FinanceConfigurationDto,
  FinanceDashboardDto,
  FinanceLineDto,
  FinanceWorkOrderDto,
  RunningInvoiceDto,
  SellableItemDto
} from "@mop/shared";
import { AccessService } from "../../access/access.service";
import { PrismaService } from "../../database/prisma.service";
import { OperationEventsService } from "../../operations/operation-events.service";
import type { RequestSessionContext } from "../../tenancy/session-context";

const DEFAULT_PAYMENT_METHODS = ["cash", "card", "bank_transfer", "wallet"];

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly operations: OperationEventsService
  ) {}

  async configuration(session: RequestSessionContext): Promise<FinanceConfigurationDto> {
    const tenantId = this.tenantId(session);
    const [row, platform] = await Promise.all([
      this.prisma.financeConfiguration.findUnique({ where: { tenantId } }),
      this.platformPolicy(tenantId)
    ]);
    return {
      currency: row?.currency || "EGP",
      taxEnabled: row?.taxEnabled || false,
      taxRate: Number(row?.taxRate || 0),
      invoiceNumberPattern: row?.invoiceNumberPattern || "INV-{year}-{seq}",
      invoiceTerms: row?.invoiceTerms || undefined,
      paymentMethods: this.stringArray(row?.paymentMethods, DEFAULT_PAYMENT_METHODS),
      depositAllowed: row?.depositAllowed ?? true,
      maxBranchDiscountPercent: Number(row?.maxBranchDiscountPercent || 10),
      discountApprovalThreshold: Number(row?.discountApprovalThreshold || 10),
      allowUnpaidDelivery: platform.deliveryOverrideAllowed && Boolean(row?.allowUnpaidDelivery),
      allowPartialPaidDelivery: platform.deliveryOverrideAllowed && Boolean(row?.allowPartialPaidDelivery),
      customerInvoiceVisible: row?.customerInvoiceVisible ?? true,
      technicianPriceVisible: row?.technicianPriceVisible ?? false,
      inventoryPriceEditable: row?.inventoryPriceEditable ?? false,
      platform
    };
  }

  async updateConfiguration(session: RequestSessionContext, body: any) {
    this.assertTenantStaff(session);
    const current = await this.configuration(session);
    if (!current.platform.financeEnabled || current.platform.forceReadOnly) {
      throw new ForbiddenException("Finance configuration is locked by the platform.");
    }
    if ((body.allowUnpaidDelivery || body.allowPartialPaidDelivery) && !current.platform.deliveryOverrideAllowed) {
      throw new ForbiddenException("The platform does not allow delivery payment overrides.");
    }
    const taxRate = this.nonNegative(body.taxRate ?? current.taxRate, "taxRate");
    if (taxRate > 100) throw new BadRequestException("taxRate cannot exceed 100.");
    const paymentMethods = this.cleanPaymentMethods(body.paymentMethods ?? current.paymentMethods);
    const tenantId = this.tenantId(session);
    const row = await this.prisma.financeConfiguration.upsert({
      where: { tenantId },
      create: {
        tenantId,
        currency: this.text(body.currency || current.currency, "currency", 3),
        taxEnabled: Boolean(body.taxEnabled),
        taxRate,
        invoiceNumberPattern: this.invoicePattern(body.invoiceNumberPattern || current.invoiceNumberPattern),
        invoiceTerms: this.optionalText(body.invoiceTerms, 1000),
        paymentMethods,
        depositAllowed: body.depositAllowed ?? current.depositAllowed,
        maxBranchDiscountPercent: this.percent(body.maxBranchDiscountPercent ?? current.maxBranchDiscountPercent),
        discountApprovalThreshold: this.percent(body.discountApprovalThreshold ?? current.discountApprovalThreshold),
        allowUnpaidDelivery: Boolean(body.allowUnpaidDelivery),
        allowPartialPaidDelivery: Boolean(body.allowPartialPaidDelivery),
        customerInvoiceVisible: body.customerInvoiceVisible ?? current.customerInvoiceVisible,
        technicianPriceVisible: body.technicianPriceVisible ?? current.technicianPriceVisible,
        inventoryPriceEditable: body.inventoryPriceEditable ?? current.inventoryPriceEditable,
        updatedBy: session.userId
      },
      update: {
        currency: this.text(body.currency || current.currency, "currency", 3),
        taxEnabled: body.taxEnabled ?? current.taxEnabled,
        taxRate,
        invoiceNumberPattern: this.invoicePattern(body.invoiceNumberPattern || current.invoiceNumberPattern),
        invoiceTerms: body.invoiceTerms === undefined ? current.invoiceTerms : this.optionalText(body.invoiceTerms, 1000),
        paymentMethods,
        depositAllowed: body.depositAllowed ?? current.depositAllowed,
        maxBranchDiscountPercent: this.percent(body.maxBranchDiscountPercent ?? current.maxBranchDiscountPercent),
        discountApprovalThreshold: this.percent(body.discountApprovalThreshold ?? current.discountApprovalThreshold),
        allowUnpaidDelivery: body.allowUnpaidDelivery ?? current.allowUnpaidDelivery,
        allowPartialPaidDelivery: body.allowPartialPaidDelivery ?? current.allowPartialPaidDelivery,
        customerInvoiceVisible: body.customerInvoiceVisible ?? current.customerInvoiceVisible,
        technicianPriceVisible: body.technicianPriceVisible ?? current.technicianPriceVisible,
        inventoryPriceEditable: body.inventoryPriceEditable ?? current.inventoryPriceEditable,
        updatedBy: session.userId
      }
    });
    await this.financeAudit(session, "finance.configuration.updated", "finance_configuration", row.id, undefined, row);
    return this.configuration(session);
  }

  async catalog(session: RequestSessionContext, branchId?: string): Promise<SellableItemDto[]> {
    const tenantId = this.tenantId(session);
    const items = await this.prisma.sellableItem.findMany({
      where: { tenantId, archivedAt: null },
      include: {
        prices: {
          where: {
            active: true,
            effectiveFrom: { lte: new Date() },
            OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }]
          },
          orderBy: { effectiveFrom: "desc" }
        }
      },
      orderBy: [{ type: "asc" }, { name: "asc" }]
    });
    return items.map((item) => {
      const scoped = item.prices.find((price) => price.branchId === branchId);
      const company = item.prices.find((price) => !price.branchId);
      return {
        id: item.id,
        inventoryItemId: item.inventoryItemId || undefined,
        type: item.type.toLowerCase() as SellableItemDto["type"],
        name: item.name,
        description: item.description || undefined,
        category: item.category || undefined,
        basePrice: Number(item.basePrice),
        effectivePrice: Number(scoped?.price ?? company?.price ?? item.basePrice),
        branchId: scoped?.branchId || undefined,
        taxable: item.taxable,
        approvalRequired: item.approvalRequired,
        technicianCanAdd: item.technicianCanAdd,
        branchManagerCanDiscount: item.branchManagerCanDiscount,
        customerVisible: item.customerVisible,
        active: item.active
      };
    });
  }

  async upsertCatalogItem(session: RequestSessionContext, body: any) {
    await this.assertWritable(session);
    const tenantId = this.tenantId(session);
    const type = this.sellableType(body.type);
    const basePrice = this.nonNegative(body.basePrice, "basePrice");
    const existing = body.id
      ? await this.prisma.sellableItem.findFirst({ where: { id: body.id, tenantId } })
      : null;
    const item = existing
      ? await this.prisma.sellableItem.update({
          where: { id: existing.id },
          data: {
            name: this.text(body.name, "name", 160),
            description: this.optionalText(body.description, 1000),
            category: this.optionalText(body.category, 80),
            basePrice,
            taxable: Boolean(body.taxable),
            approvalRequired: body.approvalRequired !== false,
            technicianCanAdd: Boolean(body.technicianCanAdd),
            branchManagerCanDiscount: Boolean(body.branchManagerCanDiscount),
            customerVisible: body.customerVisible !== false,
            active: body.active !== false
          }
        })
      : await this.prisma.sellableItem.create({
          data: {
            tenantId,
            inventoryItemId: body.inventoryItemId || null,
            type,
            name: this.text(body.name, "name", 160),
            description: this.optionalText(body.description, 1000),
            category: this.optionalText(body.category, 80),
            basePrice,
            taxable: Boolean(body.taxable),
            approvalRequired: body.approvalRequired !== false,
            technicianCanAdd: Boolean(body.technicianCanAdd),
            branchManagerCanDiscount: Boolean(body.branchManagerCanDiscount),
            customerVisible: body.customerVisible !== false
          }
        });
    if (body.price !== undefined || body.branchId) {
      await this.setPrice(session, item.id, {
        branchId: body.branchId,
        price: body.price ?? basePrice,
        currency: body.currency
      });
    }
    await this.financeAudit(session, existing ? "price_catalog.item_updated" : "price_catalog.item_created", "sellable_item", item.id, existing, item);
    await this.emit(session, existing ? "price_catalog.price_changed" : "price_catalog.item_created", {
      targetType: "sellable_item",
      targetId: item.id,
      payload: { itemId: item.id, type: item.type, price: basePrice }
    });
    return (await this.catalog(session, body.branchId)).find((row) => row.id === item.id);
  }

  async setPrice(session: RequestSessionContext, itemId: string, body: any) {
    await this.assertWritable(session);
    const tenantId = this.tenantId(session);
    const item = await this.prisma.sellableItem.findFirst({ where: { id: itemId, tenantId } });
    if (!item) throw new NotFoundException("Sellable item not found.");
    if (body.branchId && !this.branchAllowed(session, body.branchId) && !this.owner(session)) {
      throw new ForbiddenException("Branch price is outside the current scope.");
    }
    const price = this.nonNegative(body.price, "price");
    const now = new Date();
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.priceCatalogEntry.updateMany({
        where: { tenantId, sellableItemId: item.id, branchId: body.branchId || null, active: true },
        data: { active: false, effectiveTo: now }
      });
      return tx.priceCatalogEntry.create({
        data: {
          tenantId,
          sellableItemId: item.id,
          branchId: body.branchId || null,
          price,
          currency: String(body.currency || "EGP").toUpperCase(),
          effectiveFrom: now,
          createdBy: session.userId
        }
      });
    });
    await this.financeAudit(session, "price_catalog.price_changed", "price_catalog_entry", created.id, undefined, created);
    await this.emit(session, "price_catalog.price_changed", {
      branchId: body.branchId,
      targetType: "price_catalog_entry",
      targetId: created.id,
      payload: { itemId, price, affectsFutureQuotesOnly: true }
    });
    return created;
  }

  async setInventoryManagedPrice(session: RequestSessionContext, itemId: string, body: any) {
    const config = await this.configuration(session);
    if (session.roleId !== "inventory_manager" || !config.inventoryPriceEditable) {
      throw new ForbiddenException("Inventory selling-price edits are disabled by Owner policy.");
    }
    const item = await this.prisma.sellableItem.findFirst({
      where: { id: itemId, tenantId: this.tenantId(session), type: SellableItemType.PART, inventoryItemId: { not: null } }
    });
    if (!item) throw new NotFoundException("Inventory-linked sellable item not found.");
    return this.setPrice(session, itemId, body);
  }

  async createQuote(session: RequestSessionContext, workOrderId: string, body: any) {
    await this.assertWritable(session);
    const workOrder = await this.scopedWorkOrder(session, workOrderId);
    const config = await this.configuration(session);
    const catalog = new Map((await this.catalog(session, workOrder.branchId || undefined)).map((item) => [item.id, item]));
    if (!Array.isArray(body.lines) || !body.lines.length) throw new BadRequestException("At least one quote line is required.");
    const lines = body.lines.map((line: any) => {
      const item = line.sellableItemId ? catalog.get(line.sellableItemId) : undefined;
      const quantity = this.positiveInt(line.quantity || 1, "quantity");
      const unitPrice = this.nonNegative(line.unitPrice ?? item?.effectivePrice ?? 0, "unitPrice");
      const laborPrice = this.nonNegative(line.laborPrice || 0, "laborPrice");
      const beforeTax = quantity * unitPrice + laborPrice;
      const tax = config.taxEnabled && (item?.taxable ?? Boolean(line.taxable)) ? this.money(beforeTax * config.taxRate / 100) : 0;
      return {
        sellableItemId: item?.id || null,
        lineType: this.sellableType(line.type || item?.type || "service"),
        title: this.text(line.title || item?.name, "line title", 180),
        description: this.optionalText(line.description || item?.description, 1000),
        qty: quantity,
        unitPrice,
        laborPrice,
        taxAmount: tax,
        total: this.money(beforeTax + tax),
        catalogPriceSnapshot: unitPrice,
        approvalRequired: item?.approvalRequired ?? true
      };
    });
    const subtotal = this.money(lines.reduce((sum: number, line: any) => sum + line.qty * line.unitPrice + line.laborPrice, 0));
    const tax = this.money(lines.reduce((sum: number, line: any) => sum + line.taxAmount, 0));
    const total = this.money(subtotal + tax);
    const quote = await this.prisma.quotation.create({
      data: {
        tenantId: workOrder.tenantId,
        workOrderId,
        branchId: workOrder.branchId,
        customerId: workOrder.customerId,
        number: `Q-${workOrder.number}-${Date.now().toString().slice(-6)}`,
        subtotal,
        tax,
        total,
        currency: config.currency,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : new Date(Date.now() + 48 * 60 * 60 * 1000),
        items: { create: lines }
      },
      include: { items: true }
    });
    await this.emit(session, "quote.created", {
      workOrderId,
      branchId: workOrder.branchId || undefined,
      customerId: workOrder.customerId,
      assetId: workOrder.assetId,
      targetType: "quotation",
      targetId: quote.id,
      payload: { quoteNumber: quote.number, total, currency: config.currency }
    });
    return quote;
  }

  async sendQuote(session: RequestSessionContext, quoteId: string) {
    await this.assertWritable(session);
    const quote = await this.prisma.quotation.findFirst({
      where: { id: quoteId, tenantId: this.tenantId(session) },
      include: { workOrder: true, items: true }
    });
    if (!quote) throw new NotFoundException("Quote not found.");
    if (quote.status !== QuotationStatus.DRAFT) throw new ConflictException("Only draft quotes can be sent.");
    const updated = await this.prisma.quotation.update({
      where: { id: quote.id },
      data: { status: QuotationStatus.AWAITING_RESPONSE, sentAt: new Date() },
      include: { items: true }
    });
    await this.emit(session, "quote.sent_to_customer", {
      workOrderId: quote.workOrderId,
      branchId: quote.workOrder.branchId || undefined,
      customerId: quote.workOrder.customerId,
      assetId: quote.workOrder.assetId,
      targetType: "quotation",
      targetId: quote.id,
      notificationTargets: ["customer", "branch_manager", "technician"],
      pageUpdates: ["customer-finance", "branch-invoices", "work-card"],
      customerSafeOutput: {
        title: "Estimate ready",
        message: `Estimate ${quote.number} is ready for review.`,
        customerId: quote.workOrder.customerId,
        assetId: quote.workOrder.assetId,
        workOrderId: quote.workOrderId
      },
      payload: { total: Number(quote.total), currency: quote.currency }
    });
    return updated;
  }

  async decideQuote(session: RequestSessionContext, quoteId: string, body: any) {
    const quote = await this.prisma.quotation.findFirst({
      where: {
        id: quoteId,
        tenantId: this.tenantId(session),
        ...(session.accountType === "customer" ? { customerId: session.customerId } : {})
      },
      include: { workOrder: true, items: true }
    });
    if (!quote) throw new NotFoundException("Quote not found.");
    if (!(new Set<QuotationStatus>([QuotationStatus.SENT, QuotationStatus.AWAITING_RESPONSE, QuotationStatus.PARTIALLY_APPROVED])).has(quote.status)) {
      throw new ConflictException("Quote is not awaiting a decision.");
    }
    const decisions = new Map<string, string>((body.lines || []).map((line: any) => [String(line.id), String(line.decision)]));
    if (!decisions.size) throw new BadRequestException("Quote decisions are required.");
    const result = await this.prisma.$transaction(async (tx) => {
      for (const line of quote.items) {
        const decision = decisions.get(line.id);
        if (!decision) continue;
        if (!["approved", "rejected"].includes(decision)) throw new BadRequestException("Invalid quote decision.");
        await tx.quotationItem.update({
          where: { id: line.id },
          data: decision === "approved"
            ? { status: QuotationItemStatus.APPROVED, lineStatus: FinancialLineStatus.APPROVED, approvedPrice: line.total }
            : { status: QuotationItemStatus.REJECTED, lineStatus: FinancialLineStatus.REJECTED }
        });
      }
      const items = await tx.quotationItem.findMany({ where: { quotationId: quote.id } });
      const approved = items.filter((line) => line.status === QuotationItemStatus.APPROVED).length;
      const rejected = items.filter((line) => line.status === QuotationItemStatus.REJECTED).length;
      const status = approved === items.length
        ? QuotationStatus.APPROVED
        : rejected === items.length
          ? QuotationStatus.REJECTED
          : QuotationStatus.PARTIALLY_APPROVED;
      const updated = await tx.quotation.update({
        where: { id: quote.id },
        data: { status, priceLocked: approved > 0 },
        include: { items: true }
      });
      await this.syncQuoteToRunningInvoice(tx, updated, quote.workOrder);
      return updated;
    });
    const eventKey = result.status === QuotationStatus.REJECTED ? "quote.rejected" : "quote.approved";
    await this.emit(session, eventKey, {
      workOrderId: quote.workOrderId,
      branchId: quote.workOrder.branchId || undefined,
      customerId: quote.workOrder.customerId,
      assetId: quote.workOrder.assetId,
      targetType: "quotation",
      targetId: quote.id,
      payload: { quoteStatus: result.status, approvedPricesLocked: true }
    });
    await this.emit(session, "running_invoice.updated", {
      workOrderId: quote.workOrderId,
      branchId: quote.workOrder.branchId || undefined,
      customerId: quote.workOrder.customerId,
      targetType: "running_invoice",
      targetId: quote.workOrderId,
      payload: { source: "quote_decision" }
    });
    return this.workOrderFinance(session, quote.workOrderId);
  }

  async addRunningLine(session: RequestSessionContext, workOrderId: string, body: any) {
    await this.assertWritable(session);
    const workOrder = await this.scopedWorkOrder(session, workOrderId);
    const config = await this.configuration(session);
    if (session.roleId === "technician" && !config.technicianPriceVisible) {
      throw new ForbiddenException("Technician financial line entry is disabled by Owner policy.");
    }
    const running = await this.ensureRunningInvoice(workOrder, config);
    const quantity = this.positiveInt(body.quantity || 1, "quantity");
    const unitPrice = this.nonNegative(body.unitPrice, "unitPrice");
    const laborPrice = this.nonNegative(body.laborPrice || 0, "laborPrice");
    const subtotal = quantity * unitPrice + laborPrice;
    const taxAmount = config.taxEnabled && body.taxable ? this.money(subtotal * config.taxRate / 100) : 0;
    const status = body.approvalRequired === false ? FinancialLineStatus.APPROVED : FinancialLineStatus.PENDING_CUSTOMER_APPROVAL;
    const line = await this.prisma.runningInvoiceLine.create({
      data: {
        runningInvoiceId: running.id,
        sourceType: String(body.sourceType || "manual"),
        sourceId: body.sourceId || null,
        sellableItemId: body.sellableItemId || null,
        title: this.text(body.title, "title", 180),
        lineType: this.sellableType(body.type || "service"),
        quantity,
        unitPrice,
        laborPrice,
        taxAmount,
        total: this.money(subtotal + taxAmount),
        status,
        priceLocked: status === FinancialLineStatus.APPROVED
      }
    });
    await this.recalculateRunning(running.id);
    await this.emit(session, "running_invoice.updated", {
      workOrderId,
      branchId: workOrder.branchId || undefined,
      customerId: workOrder.customerId,
      assetId: workOrder.assetId,
      targetType: "running_invoice_line",
      targetId: line.id,
      payload: { action: "line_added", lineStatus: status }
    });
    return this.workOrderFinance(session, workOrderId);
  }

  async reverseRunningLine(session: RequestSessionContext, lineId: string, reason: string) {
    await this.assertWritable(session);
    const line = await this.prisma.runningInvoiceLine.findFirst({
      where: { id: lineId, runningInvoice: { tenantId: this.tenantId(session) } },
      include: { runningInvoice: true }
    });
    if (!line) throw new NotFoundException("Running invoice line not found.");
    if (line.status === FinancialLineStatus.FINALIZED) {
      throw new ConflictException("Finalized lines require a credit note or refund.");
    }
    const updated = await this.prisma.runningInvoiceLine.update({
      where: { id: line.id },
      data: { status: FinancialLineStatus.RETURNED, total: 0, discount: 0, taxAmount: 0 }
    });
    await this.recalculateRunning(line.runningInvoiceId);
    await this.financeAudit(session, "running_invoice.line_reversed", "running_invoice_line", line.id, line, updated, reason);
    return this.workOrderFinance(session, line.runningInvoice.workOrderId);
  }

  async issueFinalInvoice(session: RequestSessionContext, workOrderId: string, body: any = {}) {
    await this.assertWritable(session);
    const config = await this.configuration(session);
    if (!config.platform.invoiceGenerationEnabled) throw new ForbiddenException("Invoice generation is disabled by the platform.");
    const workOrder = await this.scopedWorkOrder(session, workOrderId);
    const existing = await this.prisma.invoice.findFirst({
      where: { tenantId: workOrder.tenantId, workOrderId, locked: true },
      include: { lines: true, customer: true, workOrder: true }
    });
    if (existing) throw new ConflictException("A locked final invoice already exists. Use a credit note or refund.");
    const running = await this.ensureRunningInvoice(workOrder, config);
    await this.recalculateRunning(running.id);
    const fresh = await this.prisma.runningInvoice.findUnique({ where: { id: running.id }, include: { lines: true } });
    if (!fresh) throw new NotFoundException("Running invoice not found.");
    const pendingStatuses = new Set<FinancialLineStatus>([FinancialLineStatus.DRAFT, FinancialLineStatus.PENDING_CUSTOMER_APPROVAL]);
    const pending = fresh.lines.filter((line) => pendingStatuses.has(line.status));
    if (pending.length) throw new ConflictException("Resolve all pending invoice lines before issuing the final invoice.");
    const billableStatuses = new Set<FinancialLineStatus>([
      FinancialLineStatus.APPROVED,
      FinancialLineStatus.ADDED_TO_WORK_ORDER,
      FinancialLineStatus.USED,
      FinancialLineStatus.COMPLETED
    ]);
    const billable = fresh.lines.filter((line) =>
      billableStatuses.has(line.status)
      && Number(line.total) > 0
    );
    if (!billable.length) throw new ConflictException("There are no billable lines to issue.");
    const number = await this.nextInvoiceNumber(workOrder.tenantId, workOrder.branchId, config.invoiceNumberPattern);
    const invoice = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.runningInvoice.updateMany({
        where: { id: fresh.id, status: { notIn: ["FINALIZING", "FINALIZED"] } },
        data: { status: "FINALIZING", version: { increment: 1 } }
      });
      if (claim.count !== 1) throw new ConflictException("Final invoice is already being issued or has already been issued.");
      const duplicate = await tx.invoice.findFirst({ where: { tenantId: workOrder.tenantId, workOrderId, locked: true } });
      if (duplicate) throw new ConflictException("A locked final invoice already exists. Use a credit note or refund.");
      const created = await tx.invoice.create({
        data: {
          tenantId: workOrder.tenantId,
          workOrderId,
          customerId: workOrder.customerId,
          branchId: workOrder.branchId,
          number,
          status: InvoiceStatus.ISSUED_LOCKED,
          locked: true,
          currency: fresh.currency,
          subtotal: fresh.subtotal,
          discount: fresh.discount,
          tax: fresh.tax,
          total: fresh.total,
          paid: fresh.paid,
          balance: fresh.remaining,
          terms: body.terms || config.invoiceTerms,
          issuedBy: session.userId,
          issuedAt: new Date(),
          dueAt: body.dueAt ? new Date(body.dueAt) : null,
          immutableVersion: 1,
          lines: {
            create: billable.map((line) => ({
              sellableItemId: line.sellableItemId,
              lineType: line.lineType,
              title: line.title,
              qty: line.quantity,
              source: `${line.sourceType}:${line.sourceId || ""}`,
              unitPrice: line.unitPrice,
              lockedUnitPrice: line.unitPrice,
              discount: line.discount,
              taxAmount: line.taxAmount,
              total: line.total,
              status: FinancialLineStatus.FINALIZED
            }))
          }
        },
        include: { lines: true, customer: true, workOrder: true }
      });
      await tx.runningInvoice.update({ where: { id: fresh.id }, data: { status: "FINALIZED" } });
      await tx.runningInvoiceLine.updateMany({
        where: { runningInvoiceId: fresh.id, id: { in: billable.map((line) => line.id) } },
        data: { status: FinancialLineStatus.FINALIZED }
      });
      await tx.workOrder.update({
        where: { id: workOrderId },
        data: { total: fresh.total, paid: fresh.paid, balance: fresh.remaining }
      });
      return created;
    });
    await this.financeAudit(session, "invoice.issued", "invoice", invoice.id, undefined, invoice);
    await this.emit(session, "invoice.issued", {
      workOrderId,
      branchId: workOrder.branchId || undefined,
      customerId: workOrder.customerId,
      assetId: workOrder.assetId,
      targetType: "invoice",
      targetId: invoice.id,
      notificationTargets: ["customer", "branch_manager", "tenant_owner", "reports_engine"],
      pageUpdates: ["customer-finance", "branch-invoices", "invoices-payments", "financial-dashboard", "branch-delivery"],
      customerSafeOutput: {
        title: "Final invoice issued",
        message: `Invoice ${invoice.number} is ready. Amount due: ${Number(invoice.balance)} ${invoice.currency}.`,
        customerId: workOrder.customerId,
        assetId: workOrder.assetId,
        workOrderId
      },
      payload: { invoiceNumber: invoice.number, total: Number(invoice.total), immutable: true }
    });
    return this.workOrderFinance(session, workOrderId);
  }

  async recordPayment(session: RequestSessionContext, invoiceId: string, body: any) {
    await this.assertWritable(session);
    const config = await this.configuration(session);
    if (!config.platform.paymentRecordingEnabled) throw new ForbiddenException("Payment recording is disabled by the platform.");
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId: this.tenantId(session), ...this.invoiceBranchWhere(session) },
      include: { workOrder: true }
    });
    if (!invoice) throw new NotFoundException("Invoice not found in current scope.");
    if (!invoice.locked || invoice.status === InvoiceStatus.CANCELLED) throw new ConflictException("Payments require an issued invoice.");
    const amount = this.nonNegative(body.amount, "amount");
    if (amount <= 0) throw new BadRequestException("Payment amount must be greater than zero.");
    const methodText = String(body.method || "").toLowerCase();
    if (!config.paymentMethods.includes(methodText)) throw new BadRequestException("Payment method is not enabled.");
    const method = this.paymentMethod(methodText);
    const idempotencyKey = this.optionalText(body.idempotencyKey, 180);
    const providerTransactionId = this.optionalText(body.providerTransactionId, 180);
    if (idempotencyKey) {
      const existingPayment = await this.prisma.payment.findFirst({
        where: { tenantId: invoice.tenantId, idempotencyKey }
      });
      if (existingPayment) return this.workOrderFinance(session, invoice.workOrderId);
    }
    const payment = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.invoice.updateMany({
        where: {
          id: invoice.id,
          tenantId: invoice.tenantId,
          locked: true,
          status: { not: InvoiceStatus.CANCELLED },
          balance: { gte: amount }
        },
        data: { paid: { increment: amount }, balance: { decrement: amount } }
      });
      if (claim.count !== 1) throw new ConflictException("Invoice balance changed. Refresh before recording this payment.");
      const created = await tx.payment.create({
        data: {
          tenantId: invoice.tenantId,
          invoiceId: invoice.id,
          workOrderId: invoice.workOrderId,
          branchId: invoice.branchId,
          customerId: invoice.customerId,
          amount,
          method,
          reference: this.optionalText(body.reference, 120),
          idempotencyKey,
          providerTransactionId,
          note: this.optionalText(body.note, 500),
          createdBy: session.userId,
          status: PaymentStatus.CONFIRMED,
          receivedAt: new Date()
        }
      });
      const updatedInvoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
      const status = Number(updatedInvoice.balance) <= 0 ? InvoiceStatus.PAID : InvoiceStatus.PARTIALLY_PAID;
      await tx.invoice.update({ where: { id: invoice.id }, data: { status } });
      await tx.workOrder.update({ where: { id: invoice.workOrderId }, data: { paid: updatedInvoice.paid, balance: updatedInvoice.balance } });
      await tx.runningInvoice.updateMany({ where: { workOrderId: invoice.workOrderId }, data: { paid: updatedInvoice.paid, remaining: updatedInvoice.balance } });
      return created;
    }).catch(async (error) => {
      if (idempotencyKey && this.isUniqueConflict(error)) {
        const existingPayment = await this.prisma.payment.findFirst({
          where: { tenantId: invoice.tenantId, idempotencyKey }
        });
        if (existingPayment) return existingPayment;
      }
      throw error;
    });
    await this.financeAudit(session, "payment.recorded", "payment", payment.id, undefined, payment);
    await this.emit(session, "payment.recorded", {
      workOrderId: invoice.workOrderId,
      branchId: invoice.branchId || undefined,
      customerId: invoice.customerId,
      assetId: invoice.workOrder.assetId,
      targetType: "payment",
      targetId: payment.id,
      notificationTargets: ["customer", "branch_manager", "tenant_owner", "reports_engine"],
      pageUpdates: ["customer-finance", "branch-invoices", "financial-dashboard", "branch-delivery"],
      customerSafeOutput: {
        title: "Payment recorded",
        message: `Payment of ${amount} ${invoice.currency} was recorded for invoice ${invoice.number}.`,
        customerId: invoice.customerId,
        assetId: invoice.workOrder.assetId,
        workOrderId: invoice.workOrderId
      },
      payload: { amount, method: methodText, invoiceId: invoice.id }
    });
    const result = await this.workOrderFinance(session, invoice.workOrderId);
    await this.emit(session, result.deliveryGate.allowed ? "delivery.allowed_payment" : "delivery.blocked_payment", {
      workOrderId: invoice.workOrderId,
      branchId: invoice.branchId || undefined,
      customerId: invoice.customerId,
      targetType: "work_order",
      targetId: invoice.workOrderId,
      payload: { reasons: result.deliveryGate.reasons }
    });
    return result;
  }

  async requestDiscount(session: RequestSessionContext, workOrderId: string, body: any) {
    await this.assertWritable(session);
    const workOrder = await this.scopedWorkOrder(session, workOrderId);
    const config = await this.configuration(session);
    const running = await this.ensureRunningInvoice(workOrder, config);
    const percent = body.percent === undefined ? undefined : this.percent(body.percent);
    const amount = percent === undefined
      ? this.nonNegative(body.amount, "amount")
      : this.money(Number(running.subtotal) * percent / 100);
    const canApply = this.access.can("finance.discount.apply", session);
    if (!canApply) throw new ForbiddenException("Missing permission: finance.discount.apply");
    const requiresApproval = !this.access.can("finance.discount.approve", session)
      && ((percent ?? 100) > config.discountApprovalThreshold || amount > Number(running.subtotal) * config.maxBranchDiscountPercent / 100);
    const request = await this.prisma.$transaction(async (tx) => {
      const created = await tx.discountRequest.create({
        data: {
          tenantId: workOrder.tenantId,
          workOrderId,
          runningInvoiceId: running.id,
          amount,
          percent,
          reason: this.text(body.reason, "reason", 500),
          status: requiresApproval ? DiscountStatus.PENDING_APPROVAL : DiscountStatus.APPLIED,
          requestedBy: session.userId || session.accountId,
          approvedBy: requiresApproval ? null : session.userId,
          decidedAt: requiresApproval ? null : new Date()
        }
      });
      if (!requiresApproval) {
        await tx.runningInvoice.update({ where: { id: running.id }, data: { discount: { increment: amount } } });
        await this.recalculateRunning(running.id, tx);
      }
      return created;
    });
    await this.emit(session, requiresApproval ? "discount.approval_requested" : "discount.applied", {
      workOrderId,
      branchId: workOrder.branchId || undefined,
      customerId: workOrder.customerId,
      targetType: "discount_request",
      targetId: request.id,
      payload: { amount, percent, requiresApproval }
    });
    return this.workOrderFinance(session, workOrderId);
  }

  async discountAction(session: RequestSessionContext, requestId: string, body: any) {
    await this.assertWritable(session);
    const action = String(body?.action || "").toLowerCase();
    if (!["approve", "reject"].includes(action)) throw new BadRequestException("Discount action must be approve or reject.");
    const request = await this.prisma.discountRequest.findFirst({
      where: { id: requestId, tenantId: this.tenantId(session) }
    });
    if (!request) throw new NotFoundException("Discount request not found.");
    const workOrder = await this.scopedWorkOrder(session, request.workOrderId);
    if (request.status !== DiscountStatus.PENDING_APPROVAL) throw new ConflictException("Discount request is not pending approval.");

    await this.prisma.$transaction(async (tx) => {
      const status = action === "approve" ? DiscountStatus.APPROVED : DiscountStatus.REJECTED;
      const claim = await tx.discountRequest.updateMany({
        where: { id: request.id, status: DiscountStatus.PENDING_APPROVAL },
        data: {
          status,
          approvedBy: action === "approve" ? session.userId : null,
          decidedAt: new Date()
        }
      });
      if (claim.count !== 1) throw new ConflictException("Discount request was already decided.");
      if (action === "approve" && request.runningInvoiceId) {
        await tx.runningInvoice.update({
          where: { id: request.runningInvoiceId },
          data: { discount: { increment: Number(request.amount) } }
        });
        await this.recalculateRunning(request.runningInvoiceId, tx);
      }
    });
    await this.emit(session, action === "approve" ? "discount.approved" : "discount.rejected", {
      workOrderId: workOrder.id,
      branchId: workOrder.branchId || undefined,
      customerId: workOrder.customerId,
      assetId: workOrder.assetId,
      targetType: "discount_request",
      targetId: request.id,
      payload: { amount: Number(request.amount), action, reason: this.optionalText(body?.reason, 500) }
    });
    return this.workOrderFinance(session, request.workOrderId);
  }

  async refund(session: RequestSessionContext, invoiceId: string, body: any) {
    await this.assertWritable(session);
    const config = await this.configuration(session);
    if (!config.platform.refundsEnabled) throw new ForbiddenException("Refunds are disabled by the platform.");
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId: this.tenantId(session), ...this.invoiceBranchWhere(session) },
      include: { workOrder: true }
    });
    if (!invoice) throw new NotFoundException("Invoice not found.");
    const amount = this.nonNegative(body.amount, "amount");
    if (amount <= 0 || amount > Number(invoice.paid)) throw new BadRequestException("Refund must be positive and cannot exceed paid amount.");
    if (body.paymentId) {
      const payment = await this.prisma.payment.findFirst({
        where: { id: String(body.paymentId), tenantId: invoice.tenantId, invoiceId: invoice.id, status: PaymentStatus.CONFIRMED }
      });
      if (!payment) throw new BadRequestException("Refund payment reference does not belong to this invoice.");
    }
    const canApprove = this.access.can("finance.refund.approve", session) && body.approve === true;
    const request = await this.prisma.$transaction(async (tx) => {
      const created = await tx.refundRequest.create({
        data: {
          tenantId: invoice.tenantId,
          invoiceId: invoice.id,
          paymentId: body.paymentId || null,
          amount,
          reason: this.text(body.reason, "reason", 500),
          status: canApprove ? RefundStatus.APPROVED : RefundStatus.REQUESTED,
          requestedBy: session.userId || session.accountId,
          approvedBy: canApprove ? session.userId : null
        }
      });
      if (!canApprove) return created;
      const claim = await tx.invoice.updateMany({
        where: { id: invoice.id, tenantId: invoice.tenantId, paid: { gte: amount }, status: { not: InvoiceStatus.CANCELLED } },
        data: { paid: { decrement: amount }, balance: { increment: amount } }
      });
      if (claim.count !== 1) throw new ConflictException("Invoice paid amount changed. Refresh before approving this refund.");
      const number = `CN-${invoice.number}-${Date.now().toString().slice(-5)}`;
      await tx.creditNote.create({
          data: {
            tenantId: invoice.tenantId,
            invoiceId: invoice.id,
            number,
            amount,
            reason: created.reason,
            issuedBy: session.userId || session.accountId
          }
      });
      const updatedInvoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: Number(updatedInvoice.paid) <= 0 ? InvoiceStatus.REFUNDED : InvoiceStatus.PARTIALLY_REFUNDED }
      });
      await tx.workOrder.update({ where: { id: invoice.workOrderId }, data: { paid: updatedInvoice.paid, balance: updatedInvoice.balance } });
      await tx.runningInvoice.updateMany({ where: { workOrderId: invoice.workOrderId }, data: { paid: updatedInvoice.paid, remaining: updatedInvoice.balance } });
      return created;
    });
    await this.financeAudit(session, canApprove ? "refund.approved" : "refund.requested", "refund_request", request.id, undefined, request);
    await this.emit(session, canApprove ? "refund.approved" : "refund.requested", {
      workOrderId: invoice.workOrderId,
      branchId: invoice.branchId || undefined,
      customerId: invoice.customerId,
      assetId: invoice.workOrder.assetId,
      targetType: "refund_request",
      targetId: request.id,
      payload: { amount, invoiceId, creditNoteRequired: true }
    });
    return request;
  }

  async workOrderFinance(session: RequestSessionContext, workOrderId: string): Promise<FinanceWorkOrderDto> {
    const workOrder = await this.scopedWorkOrder(session, workOrderId);
    const config = await this.configuration(session);
    if (session.accountType === "customer" && !config.customerInvoiceVisible) {
      throw new ForbiddenException("Customer invoice visibility is disabled.");
    }
    const running = await this.ensureRunningInvoice(workOrder, config);
    await this.recalculateRunning(running.id);
    const [fresh, finalInvoice, payments] = await Promise.all([
      this.prisma.runningInvoice.findUnique({ where: { id: running.id }, include: { lines: { orderBy: { createdAt: "asc" } } } }),
      this.prisma.invoice.findFirst({
        where: { tenantId: workOrder.tenantId, workOrderId, locked: true },
        include: { lines: true, customer: true, workOrder: true },
        orderBy: { createdAt: "desc" }
      }),
      this.prisma.payment.findMany({
        where: { tenantId: workOrder.tenantId, workOrderId, status: PaymentStatus.CONFIRMED },
        orderBy: { receivedAt: "desc" }
      })
    ]);
    if (!fresh) throw new NotFoundException("Running invoice not found.");
    const invoiceIssued = Boolean(finalInvoice?.locked);
    const fullyPaid = Boolean(finalInvoice && Number(finalInvoice.balance) <= 0);
    const reasons: string[] = [];
    if (!invoiceIssued) reasons.push("Final invoice has not been issued.");
    if (invoiceIssued && !fullyPaid) {
      const partial = Number(finalInvoice!.paid) > 0;
      if (!(config.allowUnpaidDelivery || (partial && config.allowPartialPaidDelivery))) {
        reasons.push(partial ? "Invoice is only partially paid." : "Invoice is unpaid.");
      }
    }
    return {
      workOrder: {
        id: workOrder.id,
        number: workOrder.number,
        status: workOrder.status,
        customerName: workOrder.customer.fullName,
        assetName: workOrder.asset.name,
        branchId: workOrder.branchId || undefined
      },
      runningInvoice: this.runningDto(fresh, workOrder),
      finalInvoice: finalInvoice ? this.finalDto(finalInvoice) : undefined,
      payments: payments.map((payment) => ({
        id: payment.id,
        amount: Number(payment.amount),
        method: payment.method.toLowerCase(),
        reference: payment.reference || undefined,
        status: payment.status.toLowerCase(),
        receivedAt: payment.receivedAt.toISOString()
      })),
      deliveryGate: { allowed: reasons.length === 0, invoiceIssued, fullyPaid, reasons }
    };
  }

  async invoices(session: RequestSessionContext): Promise<FinalInvoiceDto[]> {
    const rows = await this.prisma.invoice.findMany({
      where: {
        tenantId: this.tenantId(session),
        ...this.invoiceBranchWhere(session),
        ...(session.accountType === "customer" ? { customerId: session.customerId } : {})
      },
      include: { lines: true, customer: true, workOrder: true },
      orderBy: { createdAt: "desc" }
    });
    return rows.map((row) => this.finalDto(row));
  }

  async dashboard(session: RequestSessionContext): Promise<FinanceDashboardDto> {
    const tenantId = this.tenantId(session);
    const where = { tenantId, ...this.invoiceBranchWhere(session) };
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [config, invoices, todayPayments, monthPayments, refunds] = await Promise.all([
      this.configuration(session),
      this.prisma.invoice.findMany({ where, include: { lines: true, customer: true, workOrder: true }, orderBy: { createdAt: "desc" } }),
      this.prisma.payment.findMany({ where: { tenantId, ...this.paymentBranchWhere(session), status: PaymentStatus.CONFIRMED, receivedAt: { gte: dayStart } } }),
      this.prisma.payment.findMany({ where: { tenantId, ...this.paymentBranchWhere(session), status: PaymentStatus.CONFIRMED, receivedAt: { gte: monthStart } } }),
      this.prisma.refundRequest.findMany({ where: { tenantId, status: { in: [RefundStatus.APPROVED, RefundStatus.PAID] } } })
    ]);
    const issued = invoices.filter((invoice) => invoice.locked && invoice.status !== InvoiceStatus.CANCELLED);
    const branchIds = [...new Set(issued.map((invoice) => invoice.branchId).filter(Boolean))] as string[];
    const branches = await this.prisma.branch.findMany({ where: { id: { in: branchIds }, tenantId }, select: { id: true, name: true } });
    const branchNames = new Map(branches.map((branch) => [branch.id, branch.name]));
    const branchTotals = new Map<string, number>();
    for (const invoice of issued) {
      const key = invoice.branchId || "company";
      branchTotals.set(key, (branchTotals.get(key) || 0) + Number(invoice.total));
    }
    const methodTotals = new Map<string, number>();
    for (const payment of monthPayments) {
      const key = payment.method.toLowerCase();
      methodTotals.set(key, (methodTotals.get(key) || 0) + Number(payment.amount));
    }
    return {
      currency: config.currency,
      todayRevenue: this.sum(todayPayments.map((row) => Number(row.amount))),
      monthRevenue: this.sum(monthPayments.map((row) => Number(row.amount))),
      unpaidInvoices: issued.filter((row) => Number(row.balance) > 0 && Number(row.paid) === 0).length,
      partialPayments: issued.filter((row) => Number(row.balance) > 0 && Number(row.paid) > 0).length,
      overdueAmount: this.sum(issued.filter((row) => row.dueAt && row.dueAt < now && Number(row.balance) > 0).map((row) => Number(row.balance))),
      averageInvoiceValue: issued.length ? this.money(this.sum(issued.map((row) => Number(row.total))) / issued.length) : 0,
      refunds: this.sum(refunds.map((row) => Number(row.amount))),
      discountsGiven: this.sum(issued.map((row) => Number(row.discount))),
      branchRevenue: [...branchTotals.entries()].map(([branchId, amount]) => ({
        branchId,
        branchName: branchNames.get(branchId) || "Company",
        amount: this.money(amount)
      })),
      paymentMethods: [...methodTotals.entries()].map(([method, amount]) => ({ method, amount: this.money(amount) })),
      recentInvoices: issued.slice(0, 8).map((row) => this.finalDto(row))
    };
  }

  async syncInventoryLine(
    session: RequestSessionContext,
    input: { workOrderId: string; itemId: string; title: string; quantity: number; unitPrice: number; sourceId: string; action: "used" | "returned" }
  ) {
    const workOrder = await this.scopedWorkOrder(session, input.workOrderId);
    const config = await this.configuration(session);
    const running = await this.ensureRunningInvoice(workOrder, config);
    const existing = await this.prisma.runningInvoiceLine.findFirst({
      where: { runningInvoiceId: running.id, sourceType: "inventory_part", sourceId: input.sourceId }
    });
    if (input.action === "returned") {
      if (existing && existing.status !== FinancialLineStatus.FINALIZED) {
        await this.prisma.runningInvoiceLine.update({
          where: { id: existing.id },
          data: { status: FinancialLineStatus.RETURNED, total: 0, taxAmount: 0 }
        });
        await this.recalculateRunning(running.id);
      }
      return;
    }
    if (existing) return;
    await this.prisma.runningInvoiceLine.create({
      data: {
        runningInvoiceId: running.id,
        sourceType: "inventory_part",
        sourceId: input.sourceId,
        sellableItemId: input.itemId,
        title: input.title,
        lineType: SellableItemType.PART,
        quantity: input.quantity,
        unitPrice: input.unitPrice,
        total: this.money(input.quantity * input.unitPrice),
        status: FinancialLineStatus.USED,
        priceLocked: true
      }
    });
    await this.recalculateRunning(running.id);
  }

  private async syncQuoteToRunningInvoice(tx: Prisma.TransactionClient, quote: any, workOrder: any) {
    const running = await tx.runningInvoice.upsert({
      where: { workOrderId: quote.workOrderId },
      create: {
        tenantId: quote.tenantId,
        workOrderId: quote.workOrderId,
        customerId: workOrder.customerId,
        branchId: workOrder.branchId,
        currency: quote.currency
      },
      update: {}
    });
    for (const line of quote.items) {
      const existing = await tx.runningInvoiceLine.findFirst({
        where: { runningInvoiceId: running.id, sourceType: "quotation_line", sourceId: line.id }
      });
      const approved = line.status === QuotationItemStatus.APPROVED;
      const data = {
        title: line.title,
        lineType: line.lineType,
        quantity: line.qty,
        unitPrice: line.unitPrice,
        laborPrice: line.laborPrice,
        taxAmount: approved ? line.taxAmount : 0,
        total: approved ? line.total : 0,
        status: approved ? FinancialLineStatus.APPROVED : FinancialLineStatus.REJECTED,
        priceLocked: approved
      };
      if (existing) await tx.runningInvoiceLine.update({ where: { id: existing.id }, data });
      else {
        await tx.runningInvoiceLine.create({
          data: {
            runningInvoiceId: running.id,
            sourceType: "quotation_line",
            sourceId: line.id,
            sellableItemId: line.sellableItemId,
            ...data
          }
        });
      }
    }
    await this.recalculateRunning(running.id, tx);
  }

  private async ensureRunningInvoice(workOrder: any, config: FinanceConfigurationDto) {
    return this.prisma.runningInvoice.upsert({
      where: { workOrderId: workOrder.id },
      create: {
        tenantId: workOrder.tenantId,
        workOrderId: workOrder.id,
        customerId: workOrder.customerId,
        branchId: workOrder.branchId,
        currency: config.currency
      },
      update: {}
    });
  }

  private async recalculateRunning(id: string, client: Prisma.TransactionClient | PrismaService = this.prisma) {
    const invoice = await client.runningInvoice.findUnique({ where: { id }, include: { lines: true } });
    if (!invoice) throw new NotFoundException("Running invoice not found.");
    const excludedStatuses = new Set<FinancialLineStatus>([
      FinancialLineStatus.REJECTED,
      FinancialLineStatus.REMOVED,
      FinancialLineStatus.RETURNED,
      FinancialLineStatus.REFUNDED
    ]);
    const active = invoice.lines.filter((line) => !excludedStatuses.has(line.status));
    const subtotal = this.sum(active.map((line) => Number(line.unitPrice) * line.quantity + Number(line.laborPrice)));
    const lineDiscount = this.sum(active.map((line) => Number(line.discount)));
    const discount = this.money(Number(invoice.discount) + lineDiscount);
    const tax = this.sum(active.map((line) => Number(line.taxAmount)));
    const total = this.money(Math.max(0, subtotal - discount + tax));
    const remaining = this.money(Math.max(0, total - Number(invoice.paid)));
    return client.runningInvoice.update({
      where: { id },
      data: { subtotal, tax, total, remaining, version: { increment: 1 } }
    });
  }

  private async nextInvoiceNumber(tenantId: string, branchId: string | null, pattern: string) {
    const year = new Date().getFullYear();
    const branchKey = branchId || "COMPANY";
    const sequence = await this.prisma.invoiceSequence.upsert({
      where: { tenantId_branchKey_year: { tenantId, branchKey, year } },
      create: { tenantId, branchKey, year, nextValue: 2 },
      update: { nextValue: { increment: 1 } }
    });
    const value = sequence.nextValue - 1;
    const branch = branchId
      ? await this.prisma.branch.findUnique({ where: { id: branchId }, select: { name: true } })
      : null;
    return pattern
      .replaceAll("{year}", String(year))
      .replaceAll("{branch}", branch?.name.replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toUpperCase() || "HQ")
      .replaceAll("{seq}", String(value).padStart(6, "0"));
  }

  private async platformPolicy(tenantId: string): Promise<FinanceConfigurationDto["platform"]> {
    const controls = await this.prisma.controlSetting.findMany({
      where: {
        OR: [{ tenantId: null }, { tenantId }],
        AND: [{
          OR: [
            { key: { contains: "finance" } },
            { key: { contains: "payment_recording" } },
            { key: { contains: "invoice_generation" } },
            { key: { contains: "refund" } },
            { key: { contains: "delivery_payment_override" } }
          ]
        }]
      },
      orderBy: { tenantId: "asc" }
    });
    const value = (keys: string[], fallback: boolean) => {
      const match = [...controls].reverse().find((row) => keys.some((key) => row.key.toLowerCase().includes(key)));
      if (!match) return fallback;
      if (typeof match.value === "boolean") return match.value;
      if (match.value && typeof match.value === "object" && !Array.isArray(match.value)) {
        const object = match.value as Record<string, unknown>;
        if (typeof object.enabled === "boolean") return object.enabled;
        if (typeof object.value === "boolean") return object.value;
      }
      return fallback;
    };
    return {
      financeEnabled: value(["finance_module", "finance.enabled"], true),
      invoiceGenerationEnabled: value(["invoice_generation"], true),
      paymentRecordingEnabled: value(["payment_recording"], true),
      refundsEnabled: value(["refund"], true),
      reportsEnabled: value(["financial_reports", "finance_reports"], true),
      exportEnabled: value(["finance_export"], true),
      forceReadOnly: value(["finance_read_only"], false),
      deliveryOverrideAllowed: value(["delivery_payment_override"], true)
    };
  }

  private async scopedWorkOrder(session: RequestSessionContext, id: string) {
    const row = await this.prisma.workOrder.findFirst({
      where: { id, ...this.access.workOrderWhere(session) },
      include: { customer: true, asset: true, branch: true }
    });
    if (!row) throw new NotFoundException("Work order not found in current scope.");
    return row;
  }

  private runningDto(row: any, workOrder: any): RunningInvoiceDto {
    return {
      id: row.id,
      workOrderId: row.workOrderId,
      workOrderNumber: workOrder.number,
      customerId: row.customerId,
      customerName: workOrder.customer.fullName,
      branchId: row.branchId || undefined,
      currency: row.currency,
      status: row.status.toLowerCase(),
      subtotal: Number(row.subtotal),
      discount: Number(row.discount),
      tax: Number(row.tax),
      total: Number(row.total),
      paid: Number(row.paid),
      remaining: Number(row.remaining),
      version: row.version,
      lines: row.lines.map((line: any) => this.lineDto(line))
    };
  }

  private finalDto(row: any): FinalInvoiceDto {
    return {
      id: row.id,
      number: row.number,
      workOrderId: row.workOrderId,
      workOrderNumber: row.workOrder?.number,
      customerId: row.customerId,
      customerName: row.customer?.fullName,
      branchId: row.branchId || undefined,
      status: row.status.toLowerCase(),
      locked: row.locked,
      currency: row.currency,
      subtotal: Number(row.subtotal),
      discount: Number(row.discount),
      tax: Number(row.tax),
      total: Number(row.total),
      paid: Number(row.paid),
      balance: Number(row.balance),
      terms: row.terms || undefined,
      issuedAt: row.issuedAt?.toISOString(),
      dueAt: row.dueAt?.toISOString(),
      lines: row.lines.map((line: any) => this.lineDto({
        ...line,
        sourceType: line.source?.split(":")[0] || "invoice",
        sourceId: line.source?.split(":")[1],
        quantity: line.qty,
        laborPrice: 0,
        priceLocked: Boolean(line.lockedUnitPrice)
      }))
    };
  }

  private lineDto(line: any): FinanceLineDto {
    return {
      id: line.id,
      sourceType: line.sourceType,
      sourceId: line.sourceId || undefined,
      sellableItemId: line.sellableItemId || undefined,
      title: line.title,
      lineType: line.lineType.toLowerCase(),
      quantity: line.quantity,
      unitPrice: Number(line.unitPrice),
      laborPrice: Number(line.laborPrice || 0),
      discount: Number(line.discount || 0),
      taxAmount: Number(line.taxAmount || 0),
      total: Number(line.total),
      status: line.status.toLowerCase(),
      priceLocked: Boolean(line.priceLocked)
    };
  }

  private async financeAudit(session: RequestSessionContext, action: string, targetType: string, targetId: string, before?: unknown, after?: unknown, reason?: string) {
    await this.prisma.financeAuditEvent.create({
      data: {
        tenantId: this.tenantId(session),
        action,
        targetType,
        targetId,
        actorId: session.userId || session.accountId,
        reason,
        before: before ? (before as Prisma.InputJsonValue) : undefined,
        after: after ? (after as Prisma.InputJsonValue) : undefined
      }
    });
  }

  private emit(session: RequestSessionContext, eventKey: string, input: any) {
    return this.operations.emitFromSession(session, {
      eventKey,
      tenantId: this.tenantId(session),
      auditAction: eventKey,
      canUndo: false,
      reportHooks: [
        { reportKey: "finance.reports.view", metric: eventKey, delta: 1, scope: ["company", "branch"] }
      ],
      ...input
    });
  }

  private tenantId(session: RequestSessionContext) {
    if (!session.tenantId) throw new ForbiddenException("A tenant context is required.");
    return session.tenantId;
  }

  private owner(session: RequestSessionContext) {
    return ["tenant_owner", "tenant_admin"].includes(session.roleId);
  }

  private assertTenantStaff(session: RequestSessionContext) {
    if (session.accountType !== "tenant_staff") throw new ForbiddenException("Tenant staff access required.");
  }

  private async assertWritable(session: RequestSessionContext) {
    this.assertTenantStaff(session);
    const config = await this.configuration(session);
    if (!config.platform.financeEnabled) throw new ForbiddenException("Finance is disabled by the platform.");
    if (config.platform.forceReadOnly) throw new ForbiddenException("Finance is read-only by platform policy.");
  }

  private branchAllowed(session: RequestSessionContext, branchId: string) {
    return session.branchScope.includes(branchId);
  }

  private invoiceBranchWhere(session: RequestSessionContext) {
    if (this.owner(session) || session.accountType === "customer") return {};
    return session.branchScope.length ? { branchId: { in: session.branchScope } } : { id: "__deny_all__" };
  }

  private paymentBranchWhere(session: RequestSessionContext) {
    if (this.owner(session)) return {};
    return session.branchScope.length ? { branchId: { in: session.branchScope } } : { id: "__deny_all__" };
  }

  private sellableType(value: unknown) {
    const normalized = String(value || "").toUpperCase();
    if (!(Object.values(SellableItemType) as string[]).includes(normalized)) throw new BadRequestException("Invalid sellable item type.");
    return normalized as SellableItemType;
  }

  private paymentMethod(value: string) {
    const normalized = value.toUpperCase();
    if (!(Object.values(PaymentMethod) as string[]).includes(normalized)) return PaymentMethod.OTHER;
    return normalized as PaymentMethod;
  }

  private invoicePattern(value: unknown) {
    const pattern = this.text(value, "invoiceNumberPattern", 80);
    if (!pattern.includes("{seq}")) throw new BadRequestException("Invoice number pattern must include {seq}.");
    if (!/^[A-Za-z0-9_{}.-]+$/.test(pattern)) throw new BadRequestException("Invoice number pattern contains unsafe characters.");
    return pattern;
  }

  private cleanPaymentMethods(value: unknown) {
    if (!Array.isArray(value) || !value.length) throw new BadRequestException("At least one payment method is required.");
    return [...new Set(value.map((item) => String(item).toLowerCase()).filter((item) => /^[a-z_]{2,30}$/.test(item)))];
  }

  private stringArray(value: unknown, fallback: string[]) {
    return Array.isArray(value) ? value.map(String) : fallback;
  }

  private text(value: unknown, field: string, max: number) {
    const text = String(value || "").trim();
    if (!text) throw new BadRequestException(`${field} is required.`);
    if (text.length > max) throw new BadRequestException(`${field} is too long.`);
    return text;
  }

  private optionalText(value: unknown, max: number) {
    if (value === undefined || value === null || value === "") return null;
    const text = String(value).trim();
    if (text.length > max) throw new BadRequestException("Text value is too long.");
    return text;
  }

  private nonNegative(value: unknown, field: string) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) throw new BadRequestException(`${field} must be a non-negative number.`);
    return this.money(number);
  }

  private positiveInt(value: unknown, field: string) {
    const number = Number(value);
    if (!Number.isInteger(number) || number <= 0) throw new BadRequestException(`${field} must be a positive integer.`);
    return number;
  }

  private percent(value: unknown) {
    const number = this.nonNegative(value, "percent");
    if (number > 100) throw new BadRequestException("percent cannot exceed 100.");
    return number;
  }

  private money(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private sum(values: number[]) {
    return this.money(values.reduce((sum, value) => sum + value, 0));
  }

  private isUniqueConflict(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
  }
}
