import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ErrorBanner } from '../../ui/error-banner/error-banner';
import { ButtonDirective } from '../../ui/button/button.directive';
import { BarList, type BarListItem } from '../../ui/charts/bar-list/bar-list';
import type { PresentedError } from '../../runtime/http/error.interceptor';
import { AnalystApi, type OperationsAnalyticsReport } from './analyst.api';

type State = 'loading' | 'ready' | 'forbidden' | 'error';

@Component({
  selector: 'app-analyst-operations-page',
  imports: [ErrorBanner, ButtonDirective, BarList],
  templateUrl: './analyst-operations-page.html',
  styleUrl: './analyst-operations-page.css',
})
export class AnalystOperationsPage {
  private readonly api = inject(AnalystApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly state = signal<State>('loading');
  protected readonly error = signal<PresentedError | null>(null);
  protected readonly data = signal<OperationsAnalyticsReport | null>(null);

  protected readonly statusItems = computed<BarListItem[]>(() =>
    (this.data()?.statusDistribution ?? []).map((r) => ({ label: r.status, value: r.count, displayValue: r.count.toString() })),
  );
  protected readonly timeInStatusItems = computed<BarListItem[]>(() =>
    (this.data()?.timeInStatus ?? []).map((r) => ({ label: r.status, value: r.averageHours, displayValue: `${r.averageHours.toFixed(1)} h` })),
  );
  protected readonly branchItems = computed<BarListItem[]>(() =>
    (this.data()?.branchComparison ?? []).map((r) => ({ label: r.branchName, value: r.completed, displayValue: `${r.completed} completed` })),
  );
  protected readonly blockerItems = computed<BarListItem[]>(() =>
    (this.data()?.blockers ?? []).map((r) => ({ label: r.reason, value: r.count, displayValue: r.count.toString() })),
  );

  constructor() {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.api
      .operations()
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
