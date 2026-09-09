import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Identifier } from '../../../ui/identifier/identifier';
import { ErrorBanner } from '../../../ui/error-banner/error-banner';
import { ButtonDirective } from '../../../ui/button/button.directive';
import type { PresentedError } from '../../../runtime/http/error.interceptor';
import { AccessApi } from '../../../identity/access.api';
import { FinanceApi } from '../../finance/finance.api';
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
  private readonly finance = inject(FinanceApi);

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

  /**
   * Whether this person may turn a finished job into an invoice.
   *
   * Separate from `mayTakePayment` because they are separate keys and
   * `default-role-permissions.ts` withholds both from BRANCH_MANAGER by
   * default -- issuing is the owner's until delegated, same as the till.
   */
  protected readonly mayIssueInvoice = signal(false);

  /** Which row is mid-issue, so only its own button shows the wait. */
  protected readonly issuing = signal<string | null>(null);

  protected readonly board = signal<DeliveryBoard | null>(null);
  protected readonly error = signal<PresentedError | null>(null);
  protected readonly state = signal<State>('loading');
  /** Which row is mid-release, so only its own button shows the wait. */
  protected readonly releasing = signal<string | null>(null);
  protected readonly releaseError = signal<string | null>(null);

  constructor() {
    this.load();
    this.access.can('finance.payment.record').subscribe((allowed) => this.mayTakePayment.set(allowed));
    this.access.can('finance.invoice.issue').subscribe((allowed) => this.mayIssueInvoice.set(allowed));
  }

  /**
   * A job at PAYMENT_PENDING with no invoice yet.
   *
   * This was the dead end in the journey. The board already said "The
   * final invoice has not been issued" -- correctly, and in the right
   * words -- but no page in the product called
   * `POST /finance/work-orders/:id/invoice`, so there was nothing the
   * manager could do about it. The take-payment page needs an invoice id
   * that did not exist, and DELIVER is gated on `invoice.issued`, so a
   * work order could not reach CLOSED through the product at all.
   */
  protected awaitingInvoice(row: DeliveryCandidate): boolean {
    return row.status === 'PAYMENT_PENDING' && !row.unsettledInvoiceId && !row.invoiceId;
  }

  /**
   * Issue the invoice, then reload rather than patch the row.
   *
   * Issuing changes what is holding the car -- the gate flips, the
   * blocking reason changes, and "Take payment" becomes available -- and
   * all three of those are the server's answers. Reloading is how this
   * page and the gate evaluator stay unable to disagree.
   */
  protected issueInvoice(row: DeliveryCandidate): void {
    this.issuing.set(row.workOrderId);
    this.releaseError.set(null);
    this.finance.issueInvoice(row.workOrderId).subscribe({
      next: () => {
        this.issuing.set(null);
        this.load();
      },
      error: (err: PresentedError) => {
        this.issuing.set(null);
        this.releaseError.set(err.message ?? 'The invoice could not be issued.');
      },
    });
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
