import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ErrorBanner } from '../../ui/error-banner/error-banner';
import { ButtonDirective } from '../../ui/button/button.directive';
import { BarList, type BarListItem } from '../../ui/charts/bar-list/bar-list';
import type { PresentedError } from '../../runtime/http/error.interceptor';
import { AnalystApi, type PeopleAnalyticsReport } from './analyst.api';

type State = 'loading' | 'ready' | 'forbidden' | 'error';

/** Never shows payment or invoice figures tied to a technician -- the same no-finance discipline Team Leader observes. */
@Component({
  selector: 'app-analyst-people-page',
  imports: [ErrorBanner, ButtonDirective, BarList],
  templateUrl: './analyst-people-page.html',
  styleUrl: './analyst-people-page.css',
})
export class AnalystPeoplePage {
  private readonly api = inject(AnalystApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly state = signal<State>('loading');
  protected readonly error = signal<PresentedError | null>(null);
  protected readonly data = signal<PeopleAnalyticsReport | null>(null);

  protected readonly teamItems = computed<BarListItem[]>(() =>
    (this.data()?.teamThroughput ?? []).map((r) => ({ label: r.teamName, value: r.tasksCompleted, displayValue: r.tasksCompleted.toString() })),
  );
  protected readonly diagnosticItems = computed<BarListItem[]>(() =>
    (this.data()?.diagnosticCodeActivity ?? []).slice(0, 10).map((r) => ({ label: r.code, value: r.count, displayValue: r.count.toString() })),
  );

  constructor() {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.api
      .people()
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
