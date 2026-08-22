import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ErrorBanner } from '../../ui/error-banner/error-banner';
import { ButtonDirective } from '../../ui/button/button.directive';
import { BarList, type BarListItem } from '../../ui/charts/bar-list/bar-list';
import { KpiCard } from '../../ui/charts/kpi-card/kpi-card';
import type { PresentedError } from '../../runtime/http/error.interceptor';
import { AnalystApi, type DecisionsAnalyticsReport } from './analyst.api';
import { ExportViewAction } from './export-view-action';
import { SavedViewAction } from './saved-view-action';

type State = 'loading' | 'ready' | 'forbidden' | 'error';

/** No customer name, phone, or identifying detail anywhere -- every row is a decision record, never linked back to who's behind it. */
@Component({
  selector: 'app-analyst-decisions-page',
  imports: [ErrorBanner, ButtonDirective, BarList, KpiCard, SavedViewAction, ExportViewAction],
  templateUrl: './analyst-decisions-page.html',
  styleUrl: './analyst-decisions-page.css',
})
export class AnalystDecisionsPage {
  private readonly api = inject(AnalystApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly state = signal<State>('loading');
  protected readonly error = signal<PresentedError | null>(null);
  protected readonly data = signal<DecisionsAnalyticsReport | null>(null);

  protected readonly importanceItems = computed<BarListItem[]>(() =>
    (this.data()?.byImportance ?? []).map((r) => ({
      label: r.importance,
      value: r.approved,
      displayValue: `${r.approved} approved / ${r.rejected} rejected`,
    })),
  );
  protected readonly viewConfiguration = computed(() => ({ range: this.data()?.range ?? null }));

  constructor() {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.api
      .decisions()
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
