import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Identifier } from '../../shared/identifier/identifier';
import { ErrorBanner } from '../../shared/error-banner/error-banner';
import { ButtonDirective } from '../../shared/button/button.directive';
import type { PresentedError } from '../../core/api/error.interceptor';
import { InventoryApi, type WaitingRequest } from './inventory.api';

type State = 'loading' | 'ready' | 'empty' | 'forbidden' | 'error';

/**
 * "Who is waiting on me?"
 *
 * A dense queue, oldest first, with the actions **on the row**. A
 * technician standing at a car with an unapproved request is idle, so
 * making the storekeeper open a page to approve would be the cost, not
 * the click (PHASE_7.md section 3).
 */
@Component({
  selector: 'app-inventory-requests',
  imports: [RouterLink, Identifier, ErrorBanner, ButtonDirective],
  templateUrl: './inventory-requests.html',
  styleUrl: './inventory-requests.css',
})
export class InventoryRequests {
  private readonly api = inject(InventoryApi);

  protected readonly requests = signal<readonly WaitingRequest[]>([]);
  protected readonly state = signal<State>('loading');
  protected readonly error = signal<PresentedError | null>(null);
  protected readonly busy = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.api.requests().subscribe({
      next: ({ requests }) => {
        this.requests.set(requests);
        this.state.set(requests.length === 0 ? 'empty' : 'ready');
      },
      error: (err: PresentedError) => {
        this.error.set(err);
        this.state.set(err.httpStatus === 403 ? 'forbidden' : 'error');
      },
    });
  }

  protected approve(row: WaitingRequest): void {
    this.run(`approve-${row.id}`, this.api.approve(row.id));
  }

  protected reject(row: WaitingRequest): void {
    this.run(`reject-${row.id}`, this.api.reject(row.id));
  }

  /**
   * Issues what is outstanding, or what is on hand -- whichever is less.
   *
   * Short-issuing is not a fallback here, it is the normal case: the
   * whole point of 7.A is that the remainder can be issued later against
   * the same request.
   */
  protected issue(row: WaitingRequest, warehouseId: string): void {
    const source = row.sources.find((candidate) => candidate.warehouseId === warehouseId);
    if (!source) return;

    // Capped by what is on that shelf, not by what the workshop owns in
    // total. Issuing four from a room holding three is how a count stops
    // matching the room.
    const quantity = Math.min(row.outstanding, source.available);
    if (quantity <= 0) return;

    this.run(`issue-${row.id}`, this.api.issue(row.id, warehouseId, quantity));
  }

  private run(key: string, request: { subscribe(o: { next: () => void; error: (e: PresentedError) => void }): void }): void {
    this.busy.set(key);
    this.actionError.set(null);
    request.subscribe({
      next: () => {
        this.busy.set(null);
        this.load();
      },
      error: (err: PresentedError) => {
        this.busy.set(null);
        // Shown on the page. A storekeeper working down a list needs to
        // know which row refused and why, not watch a toast disappear.
        this.actionError.set(err.message ?? 'That did not work.');
      },
    });
  }

  protected waited(hours: number): string {
    if (hours < 1) return 'just now';
    if (hours < 24) return `${Math.floor(hours)}h`;
    const days = Math.floor(hours / 24);
    return days === 1 ? '1 day' : `${days} days`;
  }

  /** Enough on hand to cover what is still outstanding? */
  protected shortOfStock(row: WaitingRequest): boolean {
    return row.onHand < row.outstanding;
  }

  protected label(value: string): string {
    return value.toLowerCase().replace(/_/g, ' ');
  }
}
