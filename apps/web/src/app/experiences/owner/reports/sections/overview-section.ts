import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { KpiCard } from '../../../../ui/charts/kpi-card/kpi-card';
import type { OverviewReport } from '../reports.api';

/**
 * Executive Overview -- the first screen. Every KPI here has a defined
 * drill-down (its own tab); this section never computes anything itself,
 * only presents what reports-overview.service.ts already decided.
 */
@Component({
  selector: 'app-overview-section',
  imports: [RouterLink, KpiCard],
  templateUrl: './overview-section.html',
  styleUrl: './overview-section.css',
})
export class OverviewSection {
  readonly data = input.required<OverviewReport>();

  protected readonly money = computed(() => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }));

  protected fmtMoney(value: number): string {
    return `${this.money().format(value)} ${this.data().currency}`;
  }

  protected fmtHours(value: number | null): string {
    return value === null ? 'Not available yet' : `${value.toFixed(1)} h`;
  }
}
