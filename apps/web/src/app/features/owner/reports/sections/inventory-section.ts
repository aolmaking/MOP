import { Component, computed, input } from '@angular/core';
import { KpiCard } from '../../../../shared/reports/kpi-card/kpi-card';
import { BarList, type BarListItem } from '../../../../shared/reports/bar-list/bar-list';
import type { InventoryAnalyticsReport } from '../reports.api';

/**
 * Inventory -- money trapped in stock, and which parts actually earn
 * their shelf space. Reuses InventoryReportsService's own velocity-based
 * stock risk (built for the Inventory Manager's page) rather than a
 * second slow/fast-moving calculation.
 */
@Component({
  selector: 'app-inventory-section',
  imports: [KpiCard, BarList],
  templateUrl: './inventory-section.html',
  styleUrl: './inventory-section.css',
})
export class InventorySection {
  readonly data = input.required<InventoryAnalyticsReport>();

  protected readonly profitableItems = computed<BarListItem[]>(() =>
    this.data()
      .partProfitability.filter((r) => r.profit !== null)
      .slice(0, 10)
      .map((row) => ({ label: row.name, value: row.profit!, displayValue: this.fmt(row.profit!) })),
  );

  protected readonly noCostItems = computed(() => this.data().partProfitability.filter((r) => r.profit === null));

  protected readonly deadStockItems = computed<BarListItem[]>(() =>
    this.data().deadStock.map((row) => ({
      label: row.name,
      value: row.valueAtSellingPrice,
      displayValue: this.fmt(row.valueAtSellingPrice),
    })),
  );

  /** Soonest-to-run-out first -- the point of a risk ranking is to surface urgency, not to sort alphabetically by comfort. */
  protected readonly stockRiskItems = computed<BarListItem[]>(() =>
    this.data()
      .operational.stockRisk.filter((r) => r.daysLeft !== null)
      .sort((a, b) => a.daysLeft! - b.daysLeft!)
      .slice(0, 10)
      .map((row) => ({
        // Inverted so the bar itself reads as "how urgent," not "how much runway" -- a 2-day item should look bigger than a 60-day one.
        label: row.name,
        value: 1 / (row.daysLeft! + 1),
        displayValue: `${row.daysLeft} day(s) left`,
      })),
  );

  protected fmt(value: number): string {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
  }
}
