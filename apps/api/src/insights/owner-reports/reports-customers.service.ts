import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../runtime/database/prisma.service";
import { resolveDateRange, safeDivide, toDecimalNumber, type ReportQueryParams } from "./date-range.util";

export interface TopCustomerRow {
  readonly customerId: string;
  readonly fullName: string;
  readonly totalInvoiced: number;
  readonly workOrderCount: number;
}

export interface CustomersReport {
  readonly range: { from: string; to: string };
  readonly newCustomers: number;
  readonly activeCustomers: number;
  readonly returningCustomers: number;
  /** Had a work order before the range, none within the trailing `inactivityDays` window as of `to`. */
  readonly inactiveCustomers: number;
  readonly inactivityThresholdDays: number;
  readonly averageVisitsPerActiveCustomer: number;
  readonly topCustomersByValue: readonly TopCustomerRow[];
}

const INACTIVITY_THRESHOLD_DAYS = 90;

/**
 * Customers -- activity and value, not just a name list. "Returning"
 * and "inactive" are both defined relative to the *customer's entire
 * history*, not just the report window, since a customer who visited
 * twice five years apart is not "new" the second time and a customer
 * silent for 91 days is meaningfully different from one silent for 10.
 */
@Injectable()
export class ReportsCustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async build(tenantId: string, params: ReportQueryParams): Promise<CustomersReport> {
    const range = resolveDateRange(params);
    const branchId = params.branchId;

    const [newCustomers, workOrdersInRange, topCustomersByValue, inactiveCustomers] = await Promise.all([
      this.newCustomerCount(tenantId, range, branchId),
      this.prisma.workOrder.findMany({
        where: { tenantId, ...(branchId ? { branchId } : {}), createdAt: { gte: range.from, lte: range.to } },
        select: { customerId: true },
      }),
      this.topCustomersByValue(tenantId, range, branchId),
      this.inactiveCustomerCount(tenantId, range.to, branchId),
    ]);

    const activeCustomerIds = new Set(workOrdersInRange.map((w) => w.customerId));
    const activeCustomers = activeCustomerIds.size;

    const priorVisitCounts = await this.prisma.workOrder.groupBy({
      by: ["customerId"],
      where: {
        tenantId,
        ...(branchId ? { branchId } : {}),
        customerId: { in: [...activeCustomerIds] },
        createdAt: { lt: range.from },
      },
      _count: { _all: true },
    });
    const returningCustomers = priorVisitCounts.filter((row) => row._count._all > 0).length;

    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      newCustomers,
      activeCustomers,
      returningCustomers,
      inactiveCustomers,
      inactivityThresholdDays: INACTIVITY_THRESHOLD_DAYS,
      averageVisitsPerActiveCustomer: safeDivide(workOrdersInRange.length, activeCustomers),
      topCustomersByValue,
    };
  }

  private async topCustomersByValue(
    tenantId: string,
    range: { from: Date; to: Date },
    branchId: string | undefined,
  ): Promise<TopCustomerRow[]> {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        issuedAt: { gte: range.from, lte: range.to },
        // An invoice carries its own branch, and falls back to the job's when
        // it does not -- the same rule the financial report already uses, so
        // the two pages cannot disagree about which branch earned the money.
        ...(branchId ? { OR: [{ branchId }, { branchId: null, workOrder: { branchId } }] } : {}),
      },
      select: { total: true, workOrder: { select: { customerId: true } } },
    });

    const byCustomer = new Map<string, { total: number; count: number }>();
    for (const invoice of invoices) {
      const id = invoice.workOrder.customerId;
      const entry = byCustomer.get(id) ?? { total: 0, count: 0 };
      entry.total += toDecimalNumber(invoice.total);
      entry.count += 1;
      byCustomer.set(id, entry);
    }

    const customers = await this.prisma.customer.findMany({
      where: { tenantId, id: { in: [...byCustomer.keys()] } },
      select: { id: true, fullName: true },
    });
    const nameById = new Map(customers.map((c) => [c.id, c.fullName]));

    return [...byCustomer.entries()]
      .map(([customerId, { total, count }]) => ({
        customerId,
        fullName: nameById.get(customerId) ?? "Unknown customer",
        totalInvoiced: total,
        workOrderCount: count,
      }))
      .sort((a, b) => b.totalInvoiced - a.totalInvoiced)
      .slice(0, 15);
  }

  /**
   * A customer belongs to the workshop, not to a branch -- there is no
   * `Customer.branchId` to count. So with a branch selected, "new" means the
   * customer's first work order anywhere in this workshop happened in the
   * range AND that first visit was to this branch. Counting `Customer` rows
   * created in the range would have reported the whole workshop's intake on
   * every branch's page, which is what this fixes.
   */
  private async newCustomerCount(
    tenantId: string,
    range: { from: Date; to: Date },
    branchId: string | undefined,
  ): Promise<number> {
    if (!branchId) {
      return this.prisma.customer.count({ where: { tenantId, createdAt: { gte: range.from, lte: range.to } } });
    }

    const firstVisits = await this.prisma.workOrder.groupBy({
      by: ["customerId"],
      where: { tenantId },
      _min: { createdAt: true },
    });

    const candidates = firstVisits.filter(
      (row) => row._min.createdAt !== null && row._min.createdAt >= range.from && row._min.createdAt <= range.to,
    );
    if (candidates.length === 0) return 0;

    const atThisBranch = await this.prisma.workOrder.findMany({
      where: {
        tenantId,
        branchId,
        customerId: { in: candidates.map((row) => row.customerId) },
        createdAt: { gte: range.from, lte: range.to },
      },
      select: { customerId: true, createdAt: true },
    });

    const firstAt = new Map(candidates.map((row) => [row.customerId, row._min.createdAt!.getTime()]));
    const counted = new Set<string>();
    for (const visit of atThisBranch) {
      if (visit.createdAt.getTime() === firstAt.get(visit.customerId)) counted.add(visit.customerId);
    }
    return counted.size;
  }

  private async inactiveCustomerCount(tenantId: string, asOf: Date, branchId: string | undefined): Promise<number> {
    const cutoff = new Date(asOf.getTime() - INACTIVITY_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);

    const everHadOne = await this.prisma.workOrder.findMany({
      where: { tenantId, ...(branchId ? { branchId } : {}), createdAt: { lte: asOf } },
      select: { customerId: true },
      distinct: ["customerId"],
    });
    const recentlyActive = await this.prisma.workOrder.findMany({
      where: { tenantId, ...(branchId ? { branchId } : {}), createdAt: { gt: cutoff, lte: asOf } },
      select: { customerId: true },
      distinct: ["customerId"],
    });
    const recentIds = new Set(recentlyActive.map((w) => w.customerId));

    return everHadOne.filter((w) => !recentIds.has(w.customerId)).length;
  }
}
