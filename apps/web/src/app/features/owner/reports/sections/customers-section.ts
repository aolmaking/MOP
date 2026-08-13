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
      displayValue: new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(row.totalInvoiced),
    })),
  );
}
