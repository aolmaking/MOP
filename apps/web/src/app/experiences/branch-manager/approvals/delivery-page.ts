import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Identifier } from '../../../ui/identifier/identifier';
import { ErrorBanner } from '../../../ui/error-banner/error-banner';
import { ButtonDirective } from '../../../ui/button/button.directive';
import type { PresentedError } from '../../../runtime/http/error.interceptor';
import { AccessApi } from '../../../identity/access.api';
import { ApprovalsApi, type DeliveryBoard, type DeliveryCandidate } from './approvals.api';

type State = 'loading' | 'ready' | 'empty' | 'forbidden' | 'error';

/**
 * "What is leaving today, and can it?"
 *
 * The one screen where "why can't this go" must be answered precisely.
 * Every reason shown here comes from the gate evaluator -- the same code
 * that will refuse the transition -- so this page and the engine cannot
 * disagree. Nothing here re-derives readiness from a status.
 */
@Component({
  selector: 'app-delivery-page',
  imports: [RouterLink, Identifier, ErrorBanner, ButtonDirective],
  templateUrl: './delivery-page.html',
  styleUrl: './delivery-page.css',
})
export class DeliveryPage {
  private readonly api = inject(ApprovalsApi);
  private readonly access = inject(AccessApi);

  /**
   * Whether this person may actually take money.
   *
   * `default-role-permissions.ts` withholds `finance.payment.record` from
   * BRANCH_MANAGER on purpose -- the till is the owner's by default -- and
   * this page is a manager's page. Asking the server rather than assuming
   * either way is what keeps "Take payment" from being a button that
   * greets half its audience with a 403. Defaults to false, so a failed
   * check costs a hidden action rather than a dead one.
   */
  protected readonly mayTakePayment = signal(false);

  protected readonly board = signal<DeliveryBoard | null>(null);
  protected readonly error = signal<PresentedError | null>(null);
  protected readonly state = signal<State>('loading');
  /** Which row is mid-release, so only its own button shows the wait. */
  protected readonly releasing = signal<string | null>(null);
  protected readonly releaseError = signal<string | null>(null);

  constructor() {
    this.load();
    this.access.can('finance.payment.record').subscribe((allowed) => this.mayTakePayment.set(allowed));
  }

  protected load(): void {
    this.state.set('loading');
    this.api.delivery().subscribe({
      next: (board) => {
        this.board.set(board);
        this.state.set(board.ready.length + board.held.length === 0 ? 'empty' : 'ready');
      },
      error: (err: PresentedError) => {
        this.error.set(err);
        this.state.set(err.httpStatus === 403 ? 'forbidden' : 'error');
      },
    });
  }

  /**
   * Reloads the whole board afterwards rather than removing the row
   * locally: releasing closes the job, and the server is what decides
   * that. Guessing here is how a page shows a car as gone that is still
   * on the ramp.
   */
  protected release(row: DeliveryCandidate): void {
    this.releasing.set(row.workOrderId);
    this.releaseError.set(null);
    this.api.releaseDelivery(row.workOrderId).subscribe({
      next: () => {
        this.releasing.set(null);
        this.load();
      },
      error: (err: PresentedError) => {
        this.releasing.set(null);
        this.releaseError.set(err.message ?? 'That did not go through.');
      },
    });
  }

  protected waited(row: DeliveryCandidate): string {
    const hours = row.waitingHours;
    if (hours < 1) return 'just now';
    if (hours < 24) return `${Math.floor(hours)}h`;
    const days = Math.floor(hours / 24);
    return days === 1 ? '1 day' : `${days} days`;
  }
}
