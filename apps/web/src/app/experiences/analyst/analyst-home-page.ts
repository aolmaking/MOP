import { Component, DestroyRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ErrorBanner } from '../../ui/error-banner/error-banner';
import { ButtonDirective } from '../../ui/button/button.directive';
import type { PresentedError } from '../../runtime/http/error.interceptor';
import {
  AnalystApi,
  type AnalyticsHomePageKey,
  type AnalyticsHomeTile,
  type AnalystSavedView,
  type AnalystSavedViewSourcePage,
} from './analyst.api';

type State = 'loading' | 'ready' | 'forbidden' | 'error';

const TILE_ROUTE: Record<AnalyticsHomePageKey, string> = {
  operations: '/analyst/operations',
  people: '/analyst/people',
  inventory: '/analyst/inventory',
  decisions: '/analyst/decisions',
  'feature-adoption': '/analyst/feature-adoption',
};

const SAVED_VIEW_ROUTE: Record<AnalystSavedViewSourcePage, string> = {
  OPERATIONS: '/analyst/operations',
  PEOPLE: '/analyst/people',
  INVENTORY: '/analyst/inventory',
  DECISIONS: '/analyst/decisions',
  FEATURE_ADOPTION: '/analyst/feature-adoption',
};

/** Analytics Home -- orientation: a cross-section of the other pages' headline numbers. */
@Component({
  selector: 'app-analyst-home-page',
  imports: [RouterLink, ErrorBanner, ButtonDirective],
  templateUrl: './analyst-home-page.html',
  styleUrl: './analyst-home-page.css',
})
export class AnalystHomePage {
  private readonly api = inject(AnalystApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly state = signal<State>('loading');
  protected readonly error = signal<PresentedError | null>(null);
  protected readonly tiles = signal<readonly AnalyticsHomeTile[]>([]);
  protected readonly savedViews = signal<readonly AnalystSavedView[]>([]);
  protected readonly tileRoute = TILE_ROUTE;
  protected readonly savedViewRoute = SAVED_VIEW_ROUTE;

  constructor() {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.api
      .home()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          this.tiles.set(r.tiles);
          this.state.set('ready');
          this.loadSavedViews();
        },
        error: (err: PresentedError) => {
          this.state.set(err.httpStatus === 403 ? 'forbidden' : 'error');
          this.error.set(err);
        },
      });
  }

  private loadSavedViews(): void {
    this.api
      .savedViews()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => this.savedViews.set(r.items.slice(0, 5)),
        error: () => this.savedViews.set([]),
      });
  }
}
