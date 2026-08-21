import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { WORK_ORDER_LANES } from '@mop/shared';
import { Identifier } from '../../../ui/identifier/identifier';
import { ErrorBanner } from '../../../ui/error-banner/error-banner';
import { ButtonDirective } from '../../../ui/button/button.directive';
import type { PresentedError } from '../../../runtime/http/error.interceptor';
import { WorkOrdersApi, type BoardResult, type BoardRow } from './work-orders.api';

type State = 'loading' | 'ready' | 'empty' | 'no-results' | 'forbidden' | 'error';

/**
 * The board -- everything open, grouped by who is holding it.
 *
 * Structure is argued in docs/phases/PHASE_5.md (5.D). The short version:
 * this is a rack, not a kanban. Status is owned by
 * WorkOrderLifecycleService and every transition is gated, so a card the
 * manager could drag would be a card that refuses to move -- an interface
 * promising something the domain forbids.
 */
@Component({
  selector: 'app-work-orders-board',
  imports: [RouterLink, Identifier, ErrorBanner, ButtonDirective],
  templateUrl: './work-orders-board.html',
  styleUrl: './work-orders-board.css',
})
export class WorkOrdersBoard {
  private readonly api = inject(WorkOrdersApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly query = signal('');
  protected readonly board = signal<BoardResult | null>(null);
  protected readonly error = signal<PresentedError | null>(null);
  protected readonly state = signal<State>('loading');

  private readonly queries = new Subject<string>();

  /** Lane order is the shared definition's order, never the API's. */
  protected readonly lanes = computed(() => {
    const result = this.board();
    if (!result) return [];
    const rowsByLane = new Map(result.lanes.map((lane) => [lane.key, lane.rows]));

    return WORK_ORDER_LANES.filter((lane) => !lane.closed)
      .map((lane) => ({ ...lane, rows: rowsByLane.get(lane.key) ?? [] }))
      .filter((lane) => lane.rows.length > 0);
  });

  constructor() {
    // Debounce belongs on typing, not on opening the page. Putting the
    // first load behind it delayed every visit by 200ms to smooth out
    // keystrokes that had not happened yet.
    this.queries
      .pipe(
        debounceTime(200),
        distinctUntilChanged(),
        switchMap((q) => this.api.board(q || undefined)),
        takeUntilDestroyed(),
      )
      .subscribe({
        next: (result) => this.receive(result),
        error: (err: PresentedError) => this.fail(err),
      });

    this.fetchNow();
  }

  protected onQuery(value: string): void {
    this.query.set(value);
    this.state.set('loading');
    this.queries.next(value.trim());
  }

  protected reload(): void {
    this.fetchNow();
  }

  /** Straight to the network, no debounce -- first load and explicit retry. */
  private fetchNow(): void {
    this.state.set('loading');
    this.api
      .board(this.query().trim() || undefined)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => this.receive(result),
        error: (err: PresentedError) => this.fail(err),
      });
  }

  private receive(result: BoardResult): void {
    this.board.set(result);
    if (result.total > 0) this.state.set('ready');
    // Empty and no-results are different screens: one means a clear yard,
    // the other means the search was too narrow.
    else this.state.set(this.query().trim() ? 'no-results' : 'empty');
  }

  private fail(err: PresentedError): void {
    this.error.set(err);
    this.state.set(err.httpStatus === 403 ? 'forbidden' : 'error');
  }

  /**
   * Wait time in the words a person would use. Exact hours past a day is
   * false precision -- nobody acts differently at 26 hours than at 25.
   */
  protected waited(row: BoardRow): string {
    const hours = row.sinceHours;
    if (hours < 1) return 'just now';
    if (hours < 24) return `${Math.floor(hours)}h`;
    const days = Math.floor(hours / 24);
    return days === 1 ? '1 day' : `${days} days`;
  }

  /** Status in the manager's words, not the schema's. */
  protected statusLabel(status: string): string {
    return status.toLowerCase().replace(/_/g, ' ');
  }
}
