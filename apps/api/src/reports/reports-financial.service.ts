import { Injectable } from "@nestjs/common";
import { Prisma } from "@mop/database";
import { PrismaService } from "../runtime/database/prisma.service";
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

/**
 * Financial -- revenue, collections, and where the money actually comes
 * from. "Revenue" here means Invoice.total issued in the period (what
 * was billed), never conflated with `collected` (Payment.amount actually
 * received) -- the reporting brief's own example of the distinction this
 * subsystem must never blur.
 *
 * Labor vs Parts is read directly off `InvoiceLine.lockedLaborPrice` and
 * `.lockedUnitPrice` -- both already exist as separate columns on every
 * line, so the split needs no fragile parsing of a free-text `itemType`
 * string.
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
        this.discountsTotal(tenantId, range),
        this.branchRevenue(tenantId, range),
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
    // Prisma has no date_trunc groupBy, and bucketing needs to happen in
    // the database (not JS) to stay correct across timezones and at real
    // data volume -- a raw, fully parameterized query is the standard
    // escape hatch this codebase already uses (billing.service.ts,
    // finance.service.ts).
    const revenueRows = await this.prisma.$queryRaw<{ bucket: Date; total: Prisma.Decimal }[]>(Prisma.sql`
      SELECT date_trunc(${granularity}, i."issuedAt") AS bucket, SUM(i.total) AS total
      FROM "invoices" i
      JOIN "work_orders" w ON w.id = i."workOrderId"
      WHERE i."tenantId" = ${tenantId}
        AND i."issuedAt" >= ${range.from} AND i."issuedAt" <= ${range.to}
        ${branchId ? Prisma.sql`AND w."branchId" = ${branchId}` : Prisma.empty}
      GROUP BY bucket
      ORDER BY bucket ASC
    `);

    const collectedRows = await this.prisma.$queryRaw<{ bucket: Date; total: Prisma.Decimal }[]>(Prisma.sql`
      SELECT date_trunc(${granularity}, p."createdAt") AS bucket, SUM(p.amount) AS total
      FROM "payments" p
      JOIN "invoices" i ON i.id = p."invoiceId"
      JOIN "work_orders" w ON w.id = i."workOrderId"
      WHERE p."tenantId" = ${tenantId} AND p.status = 'CONFIRMED'
        AND p."createdAt" >= ${range.from} AND p."createdAt" <= ${range.to}
        ${branchId ? Prisma.sql`AND w."branchId" = ${branchId}` : Prisma.empty}
      GROUP BY bucket
      ORDER BY bucket ASC
    `);

    const byBucket = new Map<string, { revenue: number; collected: number }>();
    for (const row of revenueRows) {
      const key = row.bucket.toISOString();
      byBucket.set(key, { revenue: toDecimalNumber(row.total), collected: byBucket.get(key)?.collected ?? 0 });
    }
    for (const row of collectedRows) {
      const key = row.bucket.toISOString();
      byBucket.set(key, { revenue: byBucket.get(key)?.revenue ?? 0, collected: toDecimalNumber(row.total) });
    }

    return [...byBucket.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([bucket, values]) => ({ bucket, ...values }));
  }

  private async laborVsParts(
    tenantId: string,
    range: { from: Date; to: Date },
    branchId: string | undefined,
  ): Promise<{ labor: number; parts: number }> {
    const lines = await this.prisma.invoiceLine.findMany({
      where: {
        tenantId,
        invoice: { issuedAt: { gte: range.from, lte: range.to }, workOrder: branchId ? { branchId } : {} },
      },
      select: { quantity: true, lockedUnitPrice: true, lockedLaborPrice: true },
    });

    let labor = 0;
    let parts = 0;
    for (const line of lines) {
      labor += toDecimalNumber(line.lockedLaborPrice) * line.quantity;
      parts += toDecimalNumber(line.lockedUnitPrice) * line.quantity;
    }
    return { labor, parts };
  }

  private async discountsTotal(tenantId: string, range: { from: Date; to: Date }): Promise<number> {
    const result = await this.prisma.discountRequest.aggregate({
      where: { tenantId, status: "APPROVED", decidedAt: { gte: range.from, lte: range.to } },
      _sum: { amount: true },
    });
    return toDecimalNumber(result._sum.amount);
  }

  private async branchRevenue(tenantId: string, range: { from: Date; to: Date }): Promise<BranchRevenueRow[]> {
    const invoices = await this.prisma.invoice.findMany({
      where: { tenantId, issuedAt: { gte: range.from, lte: range.to } },
      select: { total: true, workOrder: { select: { branchId: true } } },
    });

    const branches = await this.prisma.branch.findMany({ where: { tenantId }, select: { id: true, name: true } });
    const branchNames = new Map(branches.map((b) => [b.id, b.name]));

    const byBranch = new Map<string, { revenue: number; count: number }>();
    for (const invoice of invoices) {
      const id = invoice.workOrder.branchId;
      const entry = byBranch.get(id) ?? { revenue: 0, count: 0 };
      entry.revenue += toDecimalNumber(invoice.total);
      entry.count += 1;
      byBranch.set(id, entry);
    }

    return [...byBranch.entries()]
      .map(([branchId, { revenue, count }]) => ({
        branchId,
        branchName: branchNames.get(branchId) ?? "Unknown branch",
        revenue,
        workOrderCount: count,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }

  /**
   * Grouped by invoice-line name -- the closest stable dimension
   * available. There is no `serviceId` foreign key anywhere in the
   * pricing pipeline (QuotationItem/InvoiceLine both store a free-text
   * `name` snapshot, by design, so a later catalog rename can't rewrite
   * an old invoice's line item) -- this is named honestly as a text
   * grouping, not implied to be a stable catalog reference.
   */
  private async topServicesByRevenue(
    tenantId: string,
    range: { from: Date; to: Date },
    branchId: string | undefined,
  ): Promise<ServiceRevenueRow[]> {
    const lines = await this.prisma.invoiceLine.findMany({
      where: {
        tenantId,
        invoice: { issuedAt: { gte: range.from, lte: range.to }, workOrder: branchId ? { branchId } : {} },
      },
      select: { name: true, total: true, quantity: true },
    });

    const byName = new Map<string, { revenue: number; quantity: number }>();
    for (const line of lines) {
      const entry = byName.get(line.name) ?? { revenue: 0, quantity: 0 };
      entry.revenue += toDecimalNumber(line.total);
      entry.quantity += line.quantity;
      byName.set(line.name, entry);
    }

    return [...byName.entries()]
      .map(([name, { revenue, quantity }]) => ({ name, revenue, quantity }))
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
        invoice: { workOrder: branchId ? { branchId } : {} },
      },
      select: { method: true, amount: true },
    });

    const byMethod = new Map<string, { amount: number; count: number }>();
    for (const payment of payments) {
      const entry = byMethod.get(payment.method) ?? { amount: 0, count: 0 };
      entry.amount += toDecimalNumber(payment.amount);
      entry.count += 1;
      byMethod.set(payment.method, entry);
    }

    return [...byMethod.entries()]
      .map(([method, { amount, count }]) => ({ method, amount, count }))
      .sort((a, b) => b.amount - a.amount);
  }

  /**
   * Approximate aging by `issuedAt` (there is no per-invoice due date
   * column, only a workshop-wide `defaultDueInDays`) -- labeled by
   * how long since issuance, not claimed to be a precise due-date aging
   * report.
   */
  private async outstandingAging(tenantId: string, branchId: string | undefined): Promise<OutstandingAgingBucket[]> {
    const unpaid = await this.prisma.invoice.findMany({
      where: { tenantId, balance: { gt: 0 }, workOrder: branchId ? { branchId } : {} },
      select: { balance: true, issuedAt: true },
    });

    const now = Date.now();
    const buckets = {
      "0-30 days": { amount: 0, invoiceCount: 0 },
      "31-60 days": { amount: 0, invoiceCount: 0 },
      "61+ days": { amount: 0, invoiceCount: 0 },
    };

    for (const invoice of unpaid) {
      const ageDays = (now - invoice.issuedAt.getTime()) / (24 * 60 * 60 * 1000);
      const bucket = ageDays <= 30 ? "0-30 days" : ageDays <= 60 ? "31-60 days" : "61+ days";
      buckets[bucket].amount += toDecimalNumber(invoice.balance);
      buckets[bucket].invoiceCount += 1;
    }

    return Object.entries(buckets).map(([label, values]) => ({ label, ...values }));
  }
}
