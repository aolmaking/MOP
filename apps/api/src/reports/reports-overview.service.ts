import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import {
  percentChange,
  previousPeriod,
  resolveDateRange,
  safeDivide,
  toDecimalNumber,
  type ReportDateRange,
  type ReportQueryParams,
} from "./date-range.util";

export interface KpiValue {
  readonly current: number;
  readonly previous: number;
  /** Null when the previous period had no baseline to compare against (see percentChange). */
  readonly percentChange: number | null;
}

export interface OverviewAlert {
  readonly key: string;
  readonly severity: "INFO" | "WARNING";
  readonly message: string;
  /** Where the Owner would go to actually act on this. */
  readonly link: string;
}

export interface OverviewReport {
  readonly range: { from: string; to: string };
  readonly currency: string;
  readonly revenue: KpiValue;
  readonly collected: KpiValue;
  /** Not date-ranged -- current total exposure across every unpaid invoice, regardless of when it was issued. */
  readonly outstandingBalance: number;
  readonly workOrdersCreated: KpiValue;
  readonly workOrdersClosed: KpiValue;
  /** Hours. Null when no work order closed in range -- never a fake zero. */
  readonly averageCompletionHours: number | null;
  readonly averageOrderValue: number;
  readonly activeCustomers: KpiValue;
  /** At current selling price -- see reports-inventory.service.ts for the same caveat. */
  readonly inventoryValue: number;
  readonly alerts: readonly OverviewAlert[];
}

/**
 * Executive Overview -- the first screen, per the reporting brief: "the
 * Owner should be able to quickly understand current business health."
 * Every KPI here has a defined drill-down section (Financial, Operations,
 * Customers, Inventory) it expands into; this service only computes the
 * headline numbers, not the breakdowns.
 */
@Injectable()
export class ReportsOverviewService {
  constructor(private readonly prisma: PrismaService) {}

  async build(tenantId: string, params: ReportQueryParams): Promise<OverviewReport> {
    const range = resolveDateRange(params);
    const previous = previousPeriod(range);
    const branchFilter = params.branchId ? { branchId: params.branchId } : {};

    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { currency: true } });

    const [
      revenueCurrent,
      revenuePrevious,
      collectedCurrent,
      collectedPrevious,
      outstandingBalance,
      createdCurrent,
      createdPrevious,
      closedCurrent,
      closedPrevious,
      avgCompletionHours,
      activeCustomersCurrent,
      activeCustomersPrevious,
      inventoryValue,
      lowStockCount,
      overdueInvoiceCount,
    ] = await Promise.all([
      this.revenueInRange(tenantId, range, branchFilter),
      this.revenueInRange(tenantId, previous, branchFilter),
      this.collectedInRange(tenantId, range, branchFilter),
      this.collectedInRange(tenantId, previous, branchFilter),
      this.currentOutstanding(tenantId, branchFilter),
      this.prisma.workOrder.count({ where: { tenantId, ...branchFilter, createdAt: { gte: range.from, lte: range.to } } }),
      this.prisma.workOrder.count({ where: { tenantId, ...branchFilter, createdAt: { gte: previous.from, lte: previous.to } } }),
      this.prisma.workOrder.count({
        where: { tenantId, ...branchFilter, status: "CLOSED", closedAt: { gte: range.from, lte: range.to } },
      }),
      this.prisma.workOrder.count({
        where: { tenantId, ...branchFilter, status: "CLOSED", closedAt: { gte: previous.from, lte: previous.to } },
      }),
      this.averageCompletionHours(tenantId, range, branchFilter),
      this.activeCustomerCount(tenantId, range, branchFilter),
      this.activeCustomerCount(tenantId, previous, branchFilter),
      this.inventoryValue(tenantId),
      this.lowStockCount(tenantId),
      this.overdueInvoiceCount(tenantId),
    ]);

    const invoiceCountCurrent = await this.prisma.invoice.count({
      where: { tenantId, workOrder: branchFilter, issuedAt: { gte: range.from, lte: range.to } },
    });

    const alerts: OverviewAlert[] = [];
    if (lowStockCount > 0) {
      alerts.push({
        key: "low_stock",
        severity: "WARNING",
        message: `${lowStockCount} item(s) trending toward stockout.`,
        link: "/owner/reports/inventory",
      });
    }
    if (overdueInvoiceCount > 0) {
      alerts.push({
        key: "overdue_invoices",
        severity: "WARNING",
        message: `${overdueInvoiceCount} invoice(s) overdue for payment.`,
        link: "/owner/reports/financial",
      });
    }

    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      currency: tenant.currency,
      revenue: this.kpi(revenueCurrent, revenuePrevious),
      collected: this.kpi(collectedCurrent, collectedPrevious),
      outstandingBalance,
      workOrdersCreated: this.kpi(createdCurrent, createdPrevious),
      workOrdersClosed: this.kpi(closedCurrent, closedPrevious),
      averageCompletionHours: avgCompletionHours,
      averageOrderValue: safeDivide(revenueCurrent, invoiceCountCurrent),
      activeCustomers: this.kpi(activeCustomersCurrent, activeCustomersPrevious),
      inventoryValue,
      alerts,
    };
  }

  private kpi(current: number, previous: number): KpiValue {
    return { current, previous, percentChange: percentChange(current, previous) };
  }

  private async revenueInRange(tenantId: string, range: ReportDateRange, branchFilter: object): Promise<number> {
    const result = await this.prisma.invoice.aggregate({
      where: { tenantId, workOrder: branchFilter, issuedAt: { gte: range.from, lte: range.to } },
      _sum: { total: true },
    });
    return toDecimalNumber(result._sum.total);
  }

  private async collectedInRange(tenantId: string, range: ReportDateRange, branchFilter: object): Promise<number> {
    const result = await this.prisma.payment.aggregate({
      where: {
        tenantId,
        status: "CONFIRMED",
        createdAt: { gte: range.from, lte: range.to },
        invoice: { workOrder: branchFilter },
      },
      _sum: { amount: true },
    });
    return toDecimalNumber(result._sum.amount);
  }

  /** Current exposure -- deliberately not date-ranged, this is "what is owed right now." */
  private async currentOutstanding(tenantId: string, branchFilter: object): Promise<number> {
    const result = await this.prisma.invoice.aggregate({
      where: { tenantId, workOrder: branchFilter, balance: { gt: 0 } },
      _sum: { balance: true },
    });
    return toDecimalNumber(result._sum.balance);
  }

  /**
   * closedAt - createdAt for every work order closed within the range.
   * The precise definition the reporting brief asked for: start ->
   * terminal state, using the columns that actually record both.
   */
  private async averageCompletionHours(
    tenantId: string,
    range: ReportDateRange,
    branchFilter: object,
  ): Promise<number | null> {
    const closed = await this.prisma.workOrder.findMany({
      where: { tenantId, ...branchFilter, status: "CLOSED", closedAt: { gte: range.from, lte: range.to } },
      select: { createdAt: true, closedAt: true },
    });
    if (closed.length === 0) return null;

    const totalHours = closed.reduce((sum, wo) => {
      const hours = (wo.closedAt!.getTime() - wo.createdAt.getTime()) / (60 * 60 * 1000);
      return sum + hours;
    }, 0);
    return totalHours / closed.length;
  }

  private async activeCustomerCount(tenantId: string, range: ReportDateRange, branchFilter: object): Promise<number> {
    const rows = await this.prisma.workOrder.findMany({
      where: { tenantId, ...branchFilter, createdAt: { gte: range.from, lte: range.to } },
      select: { customerId: true },
      distinct: ["customerId"],
    });
    return rows.length;
  }

  /** At current selling price -- see reports-inventory.service.ts's own doc comment for the same honesty note. */
  private async inventoryValue(tenantId: string): Promise<number> {
    const balances = await this.prisma.warehouseStockBalance.findMany({
      where: { tenantId },
      select: { availableQty: true, inventoryItem: { select: { sellingPrice: true } } },
    });
    return balances.reduce((sum, b) => sum + b.availableQty * toDecimalNumber(b.inventoryItem.sellingPrice), 0);
  }

  private async lowStockCount(tenantId: string): Promise<number> {
    const items = await this.prisma.inventoryItem.findMany({
      where: { tenantId, stockTracked: true },
      select: { lowStockThreshold: true, stockBalances: { select: { availableQty: true } } },
    });
    return items.filter((item) => {
      const total = item.stockBalances.reduce((sum, b) => sum + b.availableQty, 0);
      return item.lowStockThreshold > 0 && total <= item.lowStockThreshold;
    }).length;
  }

  private async overdueInvoiceCount(tenantId: string): Promise<number> {
    const config = await this.prisma.financeConfiguration.findUnique({ where: { tenantId } });
    const dueInDays = config?.defaultDueInDays ?? 0;
    if (dueInDays <= 0) return 0;

    const cutoff = new Date(Date.now() - dueInDays * 24 * 60 * 60 * 1000);
    return this.prisma.invoice.count({ where: { tenantId, balance: { gt: 0 }, issuedAt: { lt: cutoff } } });
  }
}
