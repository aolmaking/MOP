import { Component, DestroyRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ErrorBanner } from '../../shared/error-banner/error-banner';
import { ButtonDirective } from '../../shared/button/button.directive';
import type { PresentedError } from '../../core/api/error.interceptor';
import { AnalystApi, type AnalyticsHomeTile } from './analyst.api';

type State = 'loading' | 'ready' | 'forbidden' | 'error';

const TILE_ROUTE: Record<string, string> = {
  operations: '/analyst/operations',
  people: '/analyst/people',
  inventory: '/analyst/inventory',
  decisions: '/analyst/decisions',
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
  protected readonly tileRoute = TILE_ROUTE;

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
        },
        error: (err: PresentedError) => {
          this.state.set(err.httpStatus === 403 ? 'forbidden' : 'error');
          this.error.set(err);
        },
      });
  }
}
