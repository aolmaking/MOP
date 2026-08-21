import { Component, computed, input } from '@angular/core';

/**
 * One headline number, with its period-over-period delta when one is
 * available. `percentChange: null` (see date-range.util.ts's own doc
 * comment server-side) renders as "—", never a fabricated 0%/∞% --
 * a workshop's first month of revenue has no meaningful comparison yet.
 */
@Component({
  selector: 'app-kpi-card',
  templateUrl: './kpi-card.html',
  styleUrl: './kpi-card.css',
})
export class KpiCard {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly percentChange = input<number | null>();
  readonly meaning = input<string>();
  /** Set for metrics where a rise is bad news (delayed jobs, cancellations) -- flips which color reads as good. */
  readonly invert = input(false);

  protected readonly trend = computed<'up' | 'down' | 'flat' | 'none'>(() => {
    const change = this.percentChange();
    if (change === null || change === undefined) return 'none';
    const raw = change > 0.5 ? 'up' : change < -0.5 ? 'down' : 'flat';
    if (raw === 'flat' || !this.invert()) return raw;
    return raw === 'up' ? 'down' : 'up';
  });

  protected readonly changeLabel = computed(() => {
    const change = this.percentChange();
    if (change === null || change === undefined) return '—';
    const sign = change > 0 ? '+' : '';
    return `${sign}${change.toFixed(1)}%`;
  });
}
