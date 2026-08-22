import { Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ErrorBanner } from '../../../ui/error-banner/error-banner';
import { ButtonDirective } from '../../../ui/button/button.directive';
import type { PresentedError } from '../../../runtime/http/error.interceptor';
import { PlatformReportsApi, type PlatformReportDetail, type UsageTrend } from './platform-reports.api';

type State = 'loading' | 'ready' | 'forbidden' | 'error';

/**
 * Platform Reports — Level 2, all six sections for one workshop.
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

  protected readonly data = signal<PlatformReportDetail | null>(null);
  protected readonly state = signal<State>('loading');
  protected readonly error = signal<PresentedError | null>(null);
  protected readonly windowDays = signal<30 | 90>(30);

  protected readonly maxLogins = computed(() =>
    Math.max(1, ...(this.data()?.usageOverview.loginsByDay.map((d) => d.count) ?? [1])),
  );

  constructor() {
    // Deferred to a microtask so a route-bound `id` is set before the
    // first read, matching WorkOrderWorkspace's own reasoning.
    queueMicrotask(() => this.load());
  }

  protected load(): void {
    this.state.set('loading');
    this.api
      .detail(this.id(), this.windowDays())
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

  protected bool(value: boolean): string {
    return value ? 'Yes' : 'No';
  }

  protected percent(value: number | null): string {
    return value === null ? '—' : `${value}%`;
  }

  protected money(amount: number, currency: string): string {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  }

  protected trend(value: UsageTrend): string {
    switch (value) {
      case 'UP':
        return 'Up';
      case 'DOWN':
        return 'Down';
      case 'NEW':
        return 'New';
      default:
        return 'Flat';
    }
  }
}
