import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';

export interface ReportRangeParams {
  readonly from?: string;
  readonly to?: string;
  readonly branchId?: string;
  readonly groupBy?: 'day' | 'week' | 'month';
}

export interface KpiValue {
  readonly current: number;
  readonly previous: number;
  readonly percentChange: number | null;
}

export interface OverviewAlert {
  readonly key: string;
  readonly severity: 'INFO' | 'WARNING';
  readonly message: string;
  readonly link: string;
}

export interface OverviewReport {
  readonly range: { from: string; to: string };
  readonly currency: string;
  readonly revenue: KpiValue;
  readonly collected: KpiValue;
  readonly outstandingBalance: number;
  readonly workOrdersCreated: KpiValue;
  readonly workOrdersClosed: KpiValue;
  readonly averageCompletionHours: number | null;
  readonly averageOrderValue: number;
  readonly activeCustomers: KpiValue;
  readonly inventoryValue: number;
  readonly alerts: readonly OverviewAlert[];
}

export interface StatusDistributionRow {
  readonly status: string;
  readonly count: number;
}

export interface AverageTimeInStatusRow {
  readonly status: string;
  readonly averageHours: number;
}

export interface BranchOperationsRow {
  readonly branchId: string;
  readonly branchName: string;
  readonly workOrdersCreated: number;
  readonly workOrdersClosed: number;
  readonly averageCompletionHours: number | null;
}

export interface TechnicianWorkloadRow {
  readonly staffUserId: string;
  readonly fullName: string;
  readonly tasksCompleted: number;
  readonly activeTasks: number;
  readonly reworkCount: number;
  readonly reworkRate: number | null;
}

export interface VolumePoint {
  readonly bucket: string;
  readonly created: number;
  readonly closed: number;
}

export interface OperationsReport {
  readonly range: { from: string; to: string };
  readonly volume: readonly VolumePoint[];
  readonly volumeTotals: { created: number; closed: number };
  readonly granularity: 'day' | 'week' | 'month';
  readonly statusDistribution: readonly StatusDistributionRow[];
  readonly averageTimeInStatus: readonly AverageTimeInStatusRow[];
  readonly branchComparison: readonly BranchOperationsRow[];
  readonly technicianWorkload: readonly TechnicianWorkloadRow[];
  readonly delayedJobs: number;
  readonly reopenedJobs: number;
  readonly cancelledJobs: number;
  readonly cancellationRate: number;
}

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

export interface UsageRow {
  readonly itemId: string;
  readonly name: string;
  readonly sku: string;
  readonly issued: number;
  readonly movements: number;
}

export interface StockRiskRow {
  readonly itemId: string;
  readonly name: string;
  readonly sku: string;
  readonly warehouseCode: string;
  readonly available: number;
  readonly velocity: number;
  readonly daysLeft: number | null;
}

export interface InventoryOperational {
  readonly windowDays: number;
  readonly usage: readonly UsageRow[];
  readonly categoryUsage: readonly { category: string; issued: number }[];
  readonly stockRisk: readonly StockRiskRow[];
  readonly returns: { total: number; backToStock: number; damaged: number };
  readonly warehouseComparison: readonly { warehouseId: string; code: string; name: string; issued: number }[] | null;
}

export interface PartProfitabilityRow {
  readonly inventoryItemId: string;
  readonly name: string;
  readonly sku: string;
  readonly quantitySold: number;
  readonly revenue: number;
  readonly cost: number | null;
  readonly profit: number | null;
}

export interface DeadStockRow {
  readonly inventoryItemId: string;
  readonly name: string;
  readonly sku: string;
  readonly availableQty: number;
  readonly valueAtSellingPrice: number;
}

export interface InventoryAnalyticsReport {
  readonly range: { from: string; to: string };
  readonly operational: InventoryOperational;
  readonly totalInventoryValue: number;
  readonly partProfitability: readonly PartProfitabilityRow[];
  readonly deadStock: readonly DeadStockRow[];
}

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
  readonly inactiveCustomers: number;
  readonly inactivityThresholdDays: number;
  readonly averageVisitsPerActiveCustomer: number;
  readonly topCustomersByValue: readonly TopCustomerRow[];
}

@Injectable({ providedIn: 'root' })
export class ReportsApi {
  private readonly http = inject(HttpClient);

  overview(params: ReportRangeParams): Observable<OverviewReport> {
    return this.http.get<OverviewReport>('/api/v1/organization/reports/overview', { params: toHttpParams(params) });
  }

  operations(params: ReportRangeParams): Observable<OperationsReport> {
    return this.http.get<OperationsReport>('/api/v1/organization/reports/operations', { params: toHttpParams(params) });
  }

  financial(params: ReportRangeParams): Observable<FinancialReport> {
    return this.http.get<FinancialReport>('/api/v1/organization/reports/financial', { params: toHttpParams(params) });
  }

  inventory(params: ReportRangeParams): Observable<InventoryAnalyticsReport> {
    return this.http.get<InventoryAnalyticsReport>('/api/v1/organization/reports/inventory', { params: toHttpParams(params) });
  }

  customers(params: ReportRangeParams): Observable<CustomersReport> {
    return this.http.get<CustomersReport>('/api/v1/organization/reports/customers', { params: toHttpParams(params) });
  }
}

function toHttpParams(params: ReportRangeParams): Record<string, string> {
  const result: Record<string, string> = {};
  if (params.from) result['from'] = params.from;
  if (params.to) result['to'] = params.to;
  if (params.branchId) result['branchId'] = params.branchId;
  if (params.groupBy) result['groupBy'] = params.groupBy;
  return result;
}
