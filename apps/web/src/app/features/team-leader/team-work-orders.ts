import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ErrorBanner } from '../../shared/error-banner/error-banner';
import { ButtonDirective } from '../../shared/button/button.directive';
import type { PresentedError } from '../../core/api/error.interceptor';
import { TeamLeaderApi, type ManagedWorkOrder } from './team-leader.api';

type State = 'loading' | 'ready' | 'empty' | 'forbidden' | 'error';

/**
 * Vehicles / Work Orders View -- every work order touched by a managed
 * technician, same field vocabulary as Branch Manager's board.
 *
 * No price, cost, or payment figure anywhere -- enforced the same way
 * Customer Portal's restricted fields are enforced: `ManagedWorkOrder`
 * has no such field to begin with, so there is nothing here to hide.
 */
@Component({
  selector: 'app-team-work-orders',
  imports: [ErrorBanner, ButtonDirective],
  templateUrl: './team-work-orders.html',
  styleUrl: './team-work-orders.css',
})
export class TeamWorkOrders {
  private readonly api = inject(TeamLeaderApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly rows = signal<readonly ManagedWorkOrder[]>([]);
  protected readonly state = signal<State>('loading');
  protected readonly error = signal<PresentedError | null>(null);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.api
      .workOrders()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          this.rows.set(rows);
          this.state.set(rows.length === 0 ? 'empty' : 'ready');
        },
        error: (err: PresentedError) => {
          this.error.set(err);
          this.state.set(err.httpStatus === 403 ? 'forbidden' : 'error');
        },
      });
  }

  protected label(value: string): string {
    return value.toLowerCase().replace(/_/g, ' ');
  }
}
