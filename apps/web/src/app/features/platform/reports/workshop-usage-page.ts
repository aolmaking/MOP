import { Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ErrorBanner } from '../../../shared/error-banner/error-banner';
import { ButtonDirective } from '../../../shared/button/button.directive';
import type { PresentedError } from '../../../core/api/error.interceptor';
import { PlatformReportsApi, type UsageOverview } from '../../../core/api/platform-reports.api';

type State = 'loading' | 'ready' | 'forbidden' | 'error';

/**
 * Platform Reports — Level 2, Usage Overview only.
 *
 * The five other sections the spec names (Feature Usage, Builder
 * Adoption, Operational Activity, Commercial Snapshot, Health & Risk)
 * are not built this pass -- named as owed rather than shown as empty
 * tabs, which would claim a page exists where it doesn't.
 */
@Component({
  selector: 'app-workshop-usage-page',
  imports: [RouterLink, ErrorBanner, ButtonDirective],
  templateUrl: './workshop-usage-page.html',
  styleUrl: './workshop-usage-page.css',
})
export class WorkshopUsagePage {
  readonly id = input.required<string>();

  private readonly api = inject(PlatformReportsApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly data = signal<UsageOverview | null>(null);
  protected readonly state = signal<State>('loading');
  protected readonly error = signal<PresentedError | null>(null);
  protected readonly windowDays = signal<30 | 90>(30);

  protected readonly maxLogins = computed(() => Math.max(1, ...(this.data()?.loginsByDay.map((d) => d.count) ?? [1])));

  constructor() {
    // Deferred to a microtask so a route-bound `id` is set before the
    // first read, matching WorkOrderWorkspace's own reasoning.
    queueMicrotask(() => this.load());
  }

  protected load(): void {
    this.state.set('loading');
    this.api
      .usage(this.id(), this.windowDays())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.data.set(data);
          this.state.set('ready');
        },
        error: (err: PresentedError) => {
          this.error.set(err);
          this.state.set(err.httpStatus === 403 ? 'forbidden' : 'error');
        },
      });
  }

  protected setWindow(days: 30 | 90): void {
    this.windowDays.set(days);
    this.load();
  }

  protected barHeight(count: number): string {
    return `${Math.max(2, Math.round((count / this.maxLogins()) * 100))}%`;
  }

  protected dayLabel(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }

  protected when(iso: string | null): string {
    if (!iso) return 'Never';
    return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  protected label(value: string): string {
    return value.toLowerCase().replace(/[._]/g, ' ');
  }
}
