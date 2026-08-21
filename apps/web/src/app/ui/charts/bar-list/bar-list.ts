import { Component, computed, input } from '@angular/core';

export interface BarListItem {
  readonly label: string;
  readonly value: number;
  readonly displayValue: string;
  /** Optional drill-down target. */
  readonly link?: string;
  /**
   * What this row means, shown on hover and focus and carried in the
   * accessible name. A bar shows relative size; it cannot say what the
   * number is of, how it compares, or what to do about it -- and a report
   * figure a reader cannot interpret is a figure they will guess at.
   */
  readonly detail?: string;
}

/**
 * A ranking rendered as proportional bars -- for "which X is biggest"
 * questions (status distribution, top services, branch comparison, part
 * profitability), where a bare table hides the relative scale a bar
 * makes obvious at a glance.
 */
@Component({
  selector: 'app-bar-list',
  templateUrl: './bar-list.html',
  styleUrl: './bar-list.css',
})
export class BarList {
  readonly items = input.required<readonly BarListItem[]>();
  readonly color = input('var(--accent)');

  protected readonly maxValue = computed(() => Math.max(1, ...this.items().map((i) => Math.abs(i.value))));

  protected readonly total = computed(() => this.items().reduce((sum, i) => sum + Math.abs(i.value), 0));

  protected widthPercent(value: number): number {
    return (Math.abs(value) / this.maxValue()) * 100;
  }

  /**
   * Share of the whole, which is the comparison a ranking invites and a
   * bar length only implies. Null when the rows do not sum to a
   * meaningful whole -- an average per stage is not a share of anything,
   * and claiming otherwise would be a confident lie.
   */
  protected sharePercent(value: number): number | null {
    const total = this.total();
    if (total <= 0) return null;
    return (Math.abs(value) / total) * 100;
  }

  /** The full readout for one row: value, share, and any caller detail. */
  protected readout(item: BarListItem): string {
    const share = this.sharePercent(item.value);
    const parts = [`${item.label}: ${item.displayValue}`];
    if (share !== null && this.items().length > 1) parts.push(`${share.toFixed(0)}% of the total`);
    if (item.detail) parts.push(item.detail);
    return parts.join(' — ');
  }
}
