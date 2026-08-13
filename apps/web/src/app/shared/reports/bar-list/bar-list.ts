import { Component, computed, input } from '@angular/core';

export interface BarListItem {
  readonly label: string;
  readonly value: number;
  readonly displayValue: string;
  /** Optional drill-down target. */
  readonly link?: string;
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

  protected widthPercent(value: number): number {
    return (Math.abs(value) / this.maxValue()) * 100;
  }
}
