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

  protected readonly branchItems = computed<BarListItem[]>(() =>
    this.data().branchRevenue.map((row) => ({
      label: row.branchName,
      value: row.revenue,
      displayValue: this.fmtMoney(row.revenue),
    })),
  );

  protected readonly serviceItems = computed<BarListItem[]>(() =>
    this.data().topServicesByRevenue.map((row) => ({
      label: row.name,
      value: row.revenue,
      displayValue: this.fmtMoney(row.revenue),
    })),
  );

  protected readonly paymentMethodItems = computed<BarListItem[]>(() =>
    this.data().paymentMethods.map((row) => ({
      label: row.method,
      value: row.amount,
      displayValue: this.fmtMoney(row.amount),
    })),
  );

  protected readonly agingItems = computed<BarListItem[]>(() =>
    this.data().outstandingAging.map((row) => ({
      label: row.label,
      value: row.amount,
      displayValue: this.fmtMoney(row.amount),
    })),
  );

  protected fmtMoney(value: number): string {
    return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value)} ${this.data().currency}`;
  }
}
