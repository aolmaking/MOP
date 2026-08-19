import { Component, computed, input } from '@angular/core';
import { KpiCard } from '../../../../shared/reports/kpi-card/kpi-card';
import { BarList, type BarListItem } from '../../../../shared/reports/bar-list/bar-list';
import type { CustomersReport } from '../reports.api';

/**
 * Customers -- activity and value. "Returning" and "inactive" are both
 * defined relative to a customer's entire history, not just the report
 * window; see reports-customers.service.ts's own doc comment.
 */
@Component({
  selector: 'app-customers-section',
  imports: [KpiCard, BarList],
  templateUrl: './customers-section.html',
  styleUrl: './customers-section.css',
})
export class CustomersSection {
  readonly data = input.required<CustomersReport>();

  protected readonly topCustomerItems = computed<BarListItem[]>(() =>
    this.data().topCustomersByValue.map((row) => ({
      label: row.fullName,
      value: row.totalInvoiced,
      displayValue: this.fmt(row.totalInvoiced),
      // Total spend and spend per visit rank customers differently: one
      // big repair is not the same relationship as ten small ones, and
      // the bar cannot tell them apart.
      detail:
        `${row.workOrderCount} ${row.workOrderCount === 1 ? 'visit' : 'visits'}` +
        (row.workOrderCount > 0 ? `, ${this.fmt(row.totalInvoiced / row.workOrderCount)} per visit` : ''),
    })),
  );

  private fmt(value: number): string {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
  }
}
