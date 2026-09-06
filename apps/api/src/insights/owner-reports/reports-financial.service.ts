import { Injectable } from "@nestjs/common";
import { Prisma } from "@mop/database";
import { fromMinor, toMinor } from "@mop/shared";
import { PrismaService } from "../../runtime/database/prisma.service";
import { resolveDateRange, resolveGranularity, toDecimalNumber, type ReportQueryParams } from "./date-range.util";

export interface TrendPoint {
  readonly bucket: string;
  readonly revenue: number;
  readonly collected: number;
}

export interface BranchRevenueRow {
  readonly branchId: string;
  readonly branchName: string;
  readonly revenue: number;
  readonly workOrderCount: number;
}

export interface ServiceRevenueRow {
  readonly name: string;
  readonly revenue: number;
  readonly quantity: number;
}

export interface PaymentMethodRow {
  readonly method: string;
  readonly amount: number;
  readonly count: number;
}

export interface OutstandingAgingBucket {
  readonly label: string;
  readonly amount: number;
  readonly invoiceCount: number;
}

export interface FinancialReport {
  readonly range: { from: string; to: string };
  readonly currency: string;
  readonly trend: readonly TrendPoint[];
  readonly laborRevenue: number;
  readonly partsRevenue: number;
  readonly discountsTotal: number;
  readonly branchRevenue: readonly BranchRevenueRow[];
  readonly topServicesByRevenue: readonly ServiceRevenueRow[];
  readonly paymentMethods: readonly PaymentMethodRow[];
  readonly outstandingAging: readonly OutstandingAgingBucket[];
}

/** Valid non-cancelled invoice filter condition for Prisma queries */
function validInvoiceWhere(branchId?: string) {
  return {
    ...(branchId
      ? {
          OR: [{ branchId }, { branchId: null, workOrder: { branchId } }],
        }
      : {}),
    NOT: {
      OR: [
        { status: "REFUNDED" as const },
        { workOrder: { status: "CANCELLED" as const }, paid: 0 },
      ],
    },
  };
}

/**
 * Financial -- revenue, collections, and where the money actually comes
 * from. Revenue is what was billed net of credit notes; collected is cash
 * actually received net of completed refunds.
 *
 * Uses exact integer minor units for internal monetary math to prevent
 * floating-point corruption.
 */
@Injectable()
export class ReportsFinancialService {
  constructor(private readonly prisma: PrismaService) {}

  async build(tenantId: string, params: ReportQueryParams): Promise<FinancialReport> {
    const range = resolveDateRange(params);
    const granularity = resolveGranularity(params.groupBy);
    const branchId = params.branchId;

    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { currency: true } });

    const [trend, laborParts, discountsTotal, branchRevenue, topServices, paymentMethods, outstandingAging] =
      await Promise.all([
        this.trend(tenantId, range, granularity, branchId),
        this.laborVsParts(tenantId, range, branchId),
        this.discountsTotal(tenantId, range, branchId),
        this.branchRevenue(tenantId, range, branchId),
        this.topServicesByRevenue(tenantId, range, branchId),
        this.paymentMethods(tenantId, range, branchId),
        this.outstandingAging(tenantId, branchId),
      ]);

    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      currency: tenant.currency,
      trend,
      laborRevenue: laborParts.labor,
      partsRevenue: laborParts.parts,
      discountsTotal,
      branchRevenue,
      topServicesByRevenue: topServices,
      paymentMethods,
      outstandingAging,
    };
  }

  private async trend(
    tenantId: string,
    range: { from: Date; to: Date },
    granularity: "day" | "week" | "month",
    branchId: string | undefined,
  ): Promise<TrendPoint[]> {
    const branchClause = branchId
      ? Prisma.sql`AND (i."branchId" = ${branchId} OR (i."branchId" IS NULL AND w."branchId" = ${branchId}))`
      : Prisma.empty;

    // Gross invoiced, excluding fully refunded invoices and unpaid invoices on cancelled work orders
    const revenueRows = await this.prisma.$queryRaw<{ bucket: Date; total: Prisma.Decimal }[]>(Prisma.sql`
      SELECT date_trunc(${granularity}, i."issuedAt") AS bucket, SUM(i.total) AS total
      FROM "invoices" i
      JOIN "work_orders" w ON w.id = i."workOrderId"
      WHERE i."tenantId" = ${tenantId}
        AND i."issuedAt" >= ${range.from} AND i."issuedAt" <= ${range.to}
        AND NOT (i.status = 'REFUNDED' OR (w.status = 'CANCELLED' AND i.paid = 0))
        ${branchClause}
      GROUP BY bucket
      ORDER BY bucket ASC
    `);

    // Credit notes reduce recognized invoiced revenue in their issued bucket
    const creditNoteRows = await this.prisma.$queryRaw<{ bucket: Date; total: Prisma.Decimal }[]>(Prisma.sql`
      SELECT date_trunc(${granularity}, cn."createdAt") AS bucket, SUM(cn.amount) AS total
      FROM "credit_notes" cn
      JOIN "invoices" i ON i.id = cn."invoiceId"
      JOIN "work_orders" w ON w.id = i."workOrderId"
      WHERE cn."tenantId" = ${tenantId}
        AND cn."createdAt" >= ${range.from} AND cn."createdAt" <= ${range.to}
        ${branchClause}
      GROUP BY bucket
      ORDER BY bucket ASC
    `);

    // Confirmed cash collections
    const collectedRows = await this.prisma.$queryRaw<{ bucket: Date; total: Prisma.Decimal }[]>(Prisma.sql`
      SELECT date_trunc(${granularity}, p."createdAt") AS bucket, SUM(p.amount) AS total
      FROM "payments" p
      JOIN "invoices" i ON i.id = p."invoiceId"
      JOIN "work_orders" w ON w.id = i."workOrderId"
      WHERE p."tenantId" = ${tenantId} AND p.status = 'CONFIRMED'
        AND p."createdAt" >= ${range.from} AND p."createdAt" <= ${range.to}
        ${branchClause}
      GROUP BY bucket
      ORDER BY bucket ASC
    `);

    // Completed refunds reduce cash collected in their decided bucket
    const refundRows = await this.prisma.$queryRaw<{ bucket: Date; total: Prisma.Decimal }[]>(Prisma.sql`
      SELECT date_trunc(${granularity}, r."decidedAt") AS bucket, SUM(r.amount) AS total
      FROM "refund_requests" r
      JOIN "invoices" i ON i.id = r."invoiceId"
      JOIN "work_orders" w ON w.id = i."workOrderId"
      WHERE r."tenantId" = ${tenantId} AND r.status = 'COMPLETED'
        AND r."decidedAt" >= ${range.from} AND r."decidedAt" <= ${range.to}
        ${branchClause}
      GROUP BY bucket
      ORDER BY bucket ASC
    `);

    const byBucket = new Map<string, { revenueMinor: number; collectedMinor: number }>();

    for (const row of revenueRows) {
      const key = row.bucket.toISOString();
      const entry = byBucket.get(key) ?? { revenueMinor: 0, collectedMinor: 0 };
      entry.revenueMinor += toMinor(row.total.toFixed(2));
      byBucket.set(key, entry);
    }

    for (const row of creditNoteRows) {
      const key = row.bucket.toISOString();
      const entry = byBucket.get(key) ?? { revenueMinor: 0, collectedMinor: 0 };
      entry.revenueMinor = Math.max(0, entry.revenueMinor - toMinor(row.total.toFixed(2)));
      byBucket.set(key, entry);
    }

    for (const row of collectedRows) {
      const key = row.bucket.toISOString();
      const entry = byBucket.get(key) ?? { revenueMinor: 0, collectedMinor: 0 };
      entry.collectedMinor += toMinor(row.total.toFixed(2));
      byBucket.set(key, entry);
    }

    for (const row of refundRows) {
      const key = row.bucket.toISOString();
      const entry = byBucket.get(key) ?? { revenueMinor: 0, collectedMinor: 0 };
      entry.collectedMinor = Math.max(0, entry.collectedMinor - toMinor(row.total.toFixed(2)));
      byBucket.set(key, entry);
    }

    return [...byBucket.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([bucket, values]) => ({
        bucket,
        revenue: Number(fromMinor(values.revenueMinor)),
        collected: Number(fromMinor(values.collectedMinor)),
      }));
  }

  private async laborVsParts(
    tenantId: string,
    range: { from: Date; to: Date },
    branchId: string | undefined,
  ): Promise<{ labor: number; parts: number }> {
    const lines = await this.prisma.invoiceLine.findMany({
      where: {
        tenantId,
        invoice: {
          issuedAt: { gte: range.from, lte: range.to },
          ...validInvoiceWhere(branchId),
        },
      },
      select: { quantity: true, lockedUnitPrice: true, lockedLaborPrice: true },
    });

    let laborMinor = 0;
    let partsMinor = 0;
    for (const line of lines) {
      const laborUnit = toMinor(line.lockedLaborPrice.toFixed(2));
      const partsUnit = toMinor(line.lockedUnitPrice.toFixed(2));
      laborMinor += laborUnit * line.quantity;
      partsMinor += partsUnit * line.quantity;
    }

    return {
      labor: Number(fromMinor(laborMinor)),
      parts: Number(fromMinor(partsMinor)),
    };
  }

  private async discountsTotal(
    tenantId: string,
    range: { from: Date; to: Date },
    branchId: string | undefined,
  ): Promise<number> {
    const result = await this.prisma.invoice.aggregate({
      where: {
        tenantId,
        issuedAt: { gte: range.from, lte: range.to },
        ...validInvoiceWhere(branchId),
      },
      _sum: { discount: true },
    });
    return toDecimalNumber(result._sum.discount);
  }

  private async branchRevenue(
    tenantId: string,
    range: { from: Date; to: Date },
    branchId: string | undefined,
  ): Promise<BranchRevenueRow[]> {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        issuedAt: { gte: range.from, lte: range.to },
        ...validInvoiceWhere(branchId),
      },
      select: { total: true, branchId: true, workOrder: { select: { branchId: true } } },
    });

    const creditNotes = await this.prisma.creditNote.findMany({
      where: {
        tenantId,
        createdAt: { gte: range.from, lte: range.to },
        invoice: validInvoiceWhere(branchId),
      },
      select: {
        amount: true,
        invoice: { select: { branchId: true, workOrder: { select: { branchId: true } } } },
      },
    });

    const branches = await this.prisma.branch.findMany({
      where: { tenantId, ...(branchId ? { id: branchId } : {}) },
      select: { id: true, name: true },
    });
    const branchNames = new Map(branches.map((b) => [b.id, b.name]));

    const byBranch = new Map<string, { revenueMinor: number; count: number }>();
    for (const invoice of invoices) {
      const id = invoice.branchId ?? invoice.workOrder.branchId;
      const entry = byBranch.get(id) ?? { revenueMinor: 0, count: 0 };
      entry.revenueMinor += toMinor(invoice.total.toFixed(2));
      entry.count += 1;
      byBranch.set(id, entry);
    }

    for (const cn of creditNotes) {
      const id = cn.invoice.branchId ?? cn.invoice.workOrder.branchId;
      const entry = byBranch.get(id);
      if (entry) {
        entry.revenueMinor = Math.max(0, entry.revenueMinor - toMinor(cn.amount.toFixed(2)));
      }
    }

    return [...byBranch.entries()]
      .map(([id, { revenueMinor, count }]) => ({
        branchId: id,
        branchName: branchNames.get(id) ?? "Unknown branch",
        revenue: Number(fromMinor(revenueMinor)),
        workOrderCount: count,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }

  private async topServicesByRevenue(
    tenantId: string,
    range: { from: Date; to: Date },
    branchId: string | undefined,
  ): Promise<ServiceRevenueRow[]> {
    const lines = await this.prisma.invoiceLine.findMany({
      where: {
        tenantId,
        invoice: {
          issuedAt: { gte: range.from, lte: range.to },
          ...validInvoiceWhere(branchId),
        },
      },
      select: { name: true, total: true, quantity: true },
    });

    const byName = new Map<string, { revenueMinor: number; quantity: number }>();
    for (const line of lines) {
      const entry = byName.get(line.name) ?? { revenueMinor: 0, quantity: 0 };
      entry.revenueMinor += toMinor(line.total.toFixed(2));
      entry.quantity += line.quantity;
      byName.set(line.name, entry);
    }

    return [...byName.entries()]
      .map(([name, { revenueMinor, quantity }]) => ({
        name,
        revenue: Number(fromMinor(revenueMinor)),
        quantity,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 15);
  }

  private async paymentMethods(
    tenantId: string,
    range: { from: Date; to: Date },
    branchId: string | undefined,
  ): Promise<PaymentMethodRow[]> {
    const payments = await this.prisma.payment.findMany({
      where: {
        tenantId,
        status: "CONFIRMED",
        createdAt: { gte: range.from, lte: range.to },
        invoice: validInvoiceWhere(branchId),
      },
      select: { method: true, amount: true },
    });

    const byMethod = new Map<string, { amountMinor: number; count: number }>();
    for (const payment of payments) {
      const entry = byMethod.get(payment.method) ?? { amountMinor: 0, count: 0 };
      entry.amountMinor += toMinor(payment.amount.toFixed(2));
      entry.count += 1;
      byMethod.set(payment.method, entry);
    }

    return [...byMethod.entries()]
      .map(([method, { amountMinor, count }]) => ({
        method,
        amount: Number(fromMinor(amountMinor)),
        count,
      }))
      .sort((a, b) => b.amount - a.amount);
  }

  private async outstandingAging(tenantId: string, branchId: string | undefined): Promise<OutstandingAgingBucket[]> {
    const unpaid = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        balance: { gt: 0 },
        ...validInvoiceWhere(branchId),
      },
      select: { balance: true, issuedAt: true },
    });

    const now = Date.now();
    const buckets = {
      "0-30 days": { amountMinor: 0, invoiceCount: 0 },
      "31-60 days": { amountMinor: 0, invoiceCount: 0 },
      "61+ days": { amountMinor: 0, invoiceCount: 0 },
    };

    for (const invoice of unpaid) {
      const ageDays = (now - invoice.issuedAt.getTime()) / (24 * 60 * 60 * 1000);
      const bucket = ageDays <= 30 ? "0-30 days" : ageDays <= 60 ? "31-60 days" : "61+ days";
      buckets[bucket].amountMinor += toMinor(invoice.balance.toFixed(2));
      buckets[bucket].invoiceCount += 1;
    }

    return Object.entries(buckets).map(([label, values]) => ({
      label,
      amount: Number(fromMinor(values.amountMinor)),
      invoiceCount: values.invoiceCount,
    }));
  }
}
