import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ErrorBanner } from '../../ui/error-banner/error-banner';
import { ButtonDirective } from '../../ui/button/button.directive';
import { BarList, type BarListItem } from '../../ui/charts/bar-list/bar-list';
import { KpiCard } from '../../ui/charts/kpi-card/kpi-card';
import type { PresentedError } from '../../runtime/http/error.interceptor';
import { AnalystApi, type InventoryAnalyticsReport } from './analyst.api';

type State = 'loading' | 'ready' | 'forbidden' | 'error';

@Component({
  selector: 'app-analyst-inventory-page',
  imports: [ErrorBanner, ButtonDirective, BarList, KpiCard],
  templateUrl: './analyst-inventory-page.html',
  styleUrl: './analyst-inventory-page.css',
})
export class AnalystInventoryPage {
  private readonly api = inject(AnalystApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly state = signal<State>('loading');
  protected readonly error = signal<PresentedError | null>(null);
  protected readonly data = signal<InventoryAnalyticsReport | null>(null);

  protected readonly categoryItems = computed<BarListItem[]>(() =>
    (this.data()?.consumptionByCategory ?? []).map((r) => ({ label: r.category, value: r.issued, displayValue: r.issued.toString() })),
  );
  protected readonly riskItems = computed<BarListItem[]>(() =>
    (this.data()?.operational.stockRisk ?? [])
      .filter((r) => r.daysLeft !== null)
      .sort((a, b) => a.daysLeft! - b.daysLeft!)
      .slice(0, 10)
      .map((r) => ({ label: r.name, value: 1 / (r.daysLeft! + 1), displayValue: `${r.daysLeft} day(s) left` })),
  );

  constructor() {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.api
      .inventory()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          this.data.set(r);
          this.state.set('ready');
        },
        error: (err: PresentedError) => {
          this.state.set(err.httpStatus === 403 ? 'forbidden' : 'error');
          this.error.set(err);
        },
      });
  }
}
