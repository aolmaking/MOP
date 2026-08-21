import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ErrorBanner } from '../../../ui/error-banner/error-banner';
import { ButtonDirective } from '../../../ui/button/button.directive';
import type { PresentedError } from '../../../runtime/http/error.interceptor';
import { LiveViewApi, type LiveViewReport, type LiveWorkshopRow } from './live-view.api';

type State = 'loading' | 'ready' | 'error';

/** How often the page re-reads. Slow enough not to hammer a cross-tenant query. */
const REFRESH_MS = 30_000;

/**
 * Live View -- the platform's read across every workshop at once.
 *
 * Sorted by trouble rather than by name: a quiet workshop with open work
 * is the reason this page exists, so it sorts to the top and everything
 * calm falls below it. A platform operator opening this should not have
 * to hunt for the workshop that needs a phone call.
 *
 * Nothing here is actionable in-page by design. Acting on a workshop
 * means going to Control Center or Workshops, where the action is
 * audited and asks for a reason.
 */
@Component({
  selector: 'app-live-view-page',
  imports: [ErrorBanner, ButtonDirective],
  templateUrl: './live-view-page.html',
  styleUrl: './live-view-page.css',
})
export class LiveViewPage {
  private readonly api = inject(LiveViewApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly state = signal<State>('loading');
  protected readonly error = signal<PresentedError | null>(null);
  protected readonly report = signal<LiveViewReport | null>(null);
  protected readonly autoRefresh = signal(true);

  protected readonly totals = computed(() => this.report()?.platformTotals ?? null);
  protected readonly activity = computed(() => this.report()?.recentActivity ?? []);

  /** Quiet-with-open-work first, then busiest. */
  protected readonly workshops = computed<readonly LiveWorkshopRow[]>(() =>
    [...(this.report()?.workshops ?? [])].sort((a, b) => {
      const aQuiet = this.isQuiet(a) ? 1 : 0;
      const bQuiet = this.isQuiet(b) ? 1 : 0;
      if (aQuiet !== bQuiet) return bQuiet - aQuiet;
      if (a.openJobs !== b.openJobs) return b.openJobs - a.openJobs;
      return a.workshopName.localeCompare(b.workshopName);
    }),
  );

  constructor() {
    this.load();

    const timer = setInterval(() => {
      if (this.autoRefresh()) this.load({ quiet: true });
    }, REFRESH_MS);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  /**
   * `quiet` keeps a background refresh from flashing the page back to a
   * loading state every thirty seconds -- the numbers update in place.
   */
  protected load(options: { quiet?: boolean } = {}): void {
    if (!options.quiet) this.state.set('loading');
    this.api
      .load()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (report) => {
          this.report.set(report);
          this.state.set('ready');
        },
        error: (err: PresentedError) => {
          this.error.set(err);
          this.state.set('error');
        },
      });
  }

  protected toggleAutoRefresh(): void {
    this.autoRefresh.update((on) => !on);
  }

  protected isQuiet(row: LiveWorkshopRow): boolean {
    return row.openJobs > 0 && row.eventsToday === 0;
  }

  protected label(value: string): string {
    return value.toLowerCase().replace(/_/g, ' ');
  }

  protected when(iso: string): string {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  protected sinceLabel(iso: string | null): string {
    if (!iso) return 'no activity in 24h';
    const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    return `${Math.floor(minutes / 60)}h ago`;
  }
}
