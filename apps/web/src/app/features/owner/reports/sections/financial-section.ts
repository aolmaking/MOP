import { Component, computed, input } from '@angular/core';
import { BarList, type BarListItem } from '../../../../shared/reports/bar-list/bar-list';
import { TrendChart, type TrendSeries } from '../../../../shared/reports/trend-chart/trend-chart';
import type { FinancialReport } from '../reports.api';

/**
 * Financial -- revenue vs collected are two different lines on the same
 * chart, deliberately, so the gap between "billed" and "actually paid"
 * is visible rather than implied by two separate numbers on two
 * different screens.
 */
@Component({
  selector: 'app-financial-section',
  imports: [BarList, TrendChart],
  templateUrl: './financial-section.html',
  styleUrl: './financial-section.css',
})
export class FinancialSection {
  readonly data = input.required<FinancialReport>();

  protected readonly trendLabels = computed(() =>
    this.data().trend.map((p) => new Date(p.bucket).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })),
  );

  protected readonly trendSeries = computed<TrendSeries[]>(() => [
    { label: 'Revenue', color: '#e0574a', values: this.data().trend.map((p) => p.revenue) },
    { label: 'Collected', color: '#46a86a', values: this.data().trend.map((p) => p.collected) },
  ]);

  // Each detail below states the figure the bar cannot: the count behind
  // the total, and the per-unit average that count implies. A branch
  // earning the most is a different fact from a branch earning the most
  // per job, and only one of them is visible in a bar.
  protected readonly branchItems = computed<BarListItem[]>(() =>
    this.data().branchRevenue.map((row) => ({
      label: row.branchName,
      value: row.revenue,
      displayValue: this.fmtMoney(row.revenue),
      detail: `${row.workOrderCount} ${this.plural(row.workOrderCount, 'job', 'jobs')}${this.per(row.revenue, row.workOrderCount, 'per job')}`,
    })),
  );

  protected readonly serviceItems = computed<BarListItem[]>(() =>
    this.data().topServicesByRevenue.map((row) => ({
      label: row.name,
      value: row.revenue,
      displayValue: this.fmtMoney(row.revenue),
      detail: `sold ${row.quantity} ${this.plural(row.quantity, 'time', 'times')}${this.per(row.revenue, row.quantity, 'each')}`,
    })),
  );

  protected readonly paymentMethodItems = computed<BarListItem[]>(() =>
    this.data().paymentMethods.map((row) => ({
      label: row.method,
      value: row.amount,
      displayValue: this.fmtMoney(row.amount),
      detail: `${row.count} ${this.plural(row.count, 'payment', 'payments')}${this.per(row.amount, row.count, 'per payment')}`,
    })),
  );

  protected readonly agingItems = computed<BarListItem[]>(() =>
    this.data().outstandingAging.map((row) => ({
      label: row.label,
      value: row.amount,
      displayValue: this.fmtMoney(row.amount),
      detail: `${row.invoiceCount} unpaid ${this.plural(row.invoiceCount, 'invoice', 'invoices')}${this.per(row.amount, row.invoiceCount, 'each')}`,
    })),
  );

  private plural(n: number, one: string, many: string): string {
    return n === 1 ? one : many;
  }

  /** Omitted rather than shown as a divide-by-zero when the count is 0. */
  private per(total: number, count: number, suffix: string): string {
    if (count <= 0) return '';
    return `, ${this.fmtMoney(total / count)} ${suffix}`;
  }

  protected fmtMoney(value: number): string {
    return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value)} ${this.data().currency}`;
  }
}
