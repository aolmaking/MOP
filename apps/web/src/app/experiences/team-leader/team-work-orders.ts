import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ErrorBanner } from '../../ui/error-banner/error-banner';
import { ButtonDirective } from '../../ui/button/button.directive';
import { Identifier } from '../../ui/identifier/identifier';
import { WorkflowStrip, type PresentedJourney } from '../../domain/journey/workflow-strip';
import { pollJourney, type JourneyFeed } from '../../domain/journey/journey-poller';
import type { PresentedError } from '../../runtime/http/error.interceptor';
import { TeamLeaderApi, type ManagedWorkOrder } from './team-leader.api';

type State = 'loading' | 'ready' | 'empty' | 'forbidden' | 'error';

/**
 * Vehicles / Work Orders View -- every work order touched by a managed
 * technician, same field vocabulary as Branch Manager's board.
 *
 * The question this page exists to answer is "which jobs are stuck, why,
 * and what needs me": the table gives the roster at a glance, and
 * opening a row gives the live journey for that ONE job -- where it is,
 * since when, who owes the next move, and what would unblock it.
 *
 * The journey is opened per row rather than drawn on every row. Twenty
 * strips polling every twenty seconds is twenty times the query load for
 * information nobody is reading, and a table where every row is a
 * paragraph stops being scannable, which is the table's whole job.
 *
 * No price, cost, or payment figure anywhere -- enforced the same way
 * Customer Portal's restricted fields are enforced: `ManagedWorkOrder`
 * has no such field to begin with, so there is nothing here to hide.
 */
@Component({
  selector: 'app-team-work-orders',
  imports: [ErrorBanner, ButtonDirective, Identifier, WorkflowStrip],
  templateUrl: './team-work-orders.html',
  styleUrl: './team-work-orders.css',
})
export class TeamWorkOrders {
  private readonly api = inject(TeamLeaderApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly rows = signal<readonly ManagedWorkOrder[]>([]);
  protected readonly state = signal<State>('loading');
  protected readonly error = signal<PresentedError | null>(null);

  /**
   * Which row is open, and the live feed behind it.
   *
   * One at a time, and the previous feed is STOPPED when another opens.
   * Leaving pollers running behind closed rows is how a page left open
   * on a wall screen quietly grows to a request every second.
   */
  protected readonly openRow = signal<string | null>(null);
  protected readonly openJourney = signal<PresentedJourney | null>(null);
  private feed: JourneyFeed | null = null;

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

  protected toggleRow(row: ManagedWorkOrder): void {
    this.feed?.stop();
    this.feed = null;
    this.openJourney.set(null);

    if (this.openRow() === row.workOrderId) {
      this.openRow.set(null);
      return;
    }

    this.openRow.set(row.workOrderId);
    // The feed is started with THIS row's id captured in the closure, so
    // a second row opened before the first responded cannot have its
    // answer written into the wrong row.
    const id = row.workOrderId;
    this.feed = pollJourney(
      this.destroyRef,
      () => this.api.journey(id),
      (journey) => {
        if (this.openRow() === id) this.openJourney.set(journey);
      },
    );
  }

  protected isOpen(row: ManagedWorkOrder): boolean {
    return this.openRow() === row.workOrderId;
  }

  protected label(value: string): string {
    return value.toLowerCase().replace(/_/g, ' ');
  }
}
