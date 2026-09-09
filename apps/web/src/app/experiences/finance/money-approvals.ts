import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Identifier } from '../../ui/identifier/identifier';
import { ErrorBanner } from '../../ui/error-banner/error-banner';
import { ButtonDirective } from '../../ui/button/button.directive';
import type { PresentedError } from '../../runtime/http/error.interceptor';
import { FinanceApi, type MoneyApprovals } from './finance.api';

type State = 'loading' | 'ready' | 'empty' | 'forbidden' | 'error';

/**
 * "What needs my signature?"
 *
 * Two loops that existed end to end in the API and were reachable from no page
 * in the product: a refund could be requested and granted over HTTP, producing
 * a real credit note, and nothing ever called either route. Same for a
 * discount — which made `DISCOUNT_AUTHORITY` worse than decorative: set to
 * anything but `ANY_STAFF_UNLIMITED`, it turned every discount into a request
 * that no surface could make and no surface could grant.
 *
 * One page for both because it is one job to the person doing it, done in one
 * sitting: money leaving the workshop, and money never collected. The two
 * halves stay visually distinct because they are opposite acts — a refund
 * reverses something already taken, a discount forgives something not yet
 * charged.
 *
 * Requesting and deciding are separate permissions by design, so this page
 * shows only the half its viewer may actually decide. An empty half is an
 * honest answer; a 403 on the whole page for someone who holds one of the two
 * would not be.
 */
@Component({
  selector: 'app-money-approvals',
  imports: [RouterLink, Identifier, ErrorBanner, ButtonDirective],
  templateUrl: './money-approvals.html',
  styleUrl: './money-approvals.css',
})
export class MoneyApprovalsPage {
  private readonly api = inject(FinanceApi);

  protected readonly queue = signal<MoneyApprovals | null>(null);
  protected readonly error = signal<PresentedError | null>(null);
  protected readonly state = signal<State>('loading');

  /** Which row is mid-decision, so only its own buttons show the wait. */
  protected readonly deciding = signal<string | null>(null);
  protected readonly decisionError = signal<string | null>(null);

  /**
   * Rejecting asks for a reason in place.
   *
   * A refusal with no reason reaches the requester as a bare "no", and the
   * person who asked is the one who has to face the customer. Approving needs
   * no such thing: the amount and the reason are already on the row.
   */
  protected readonly rejecting = signal<string | null>(null);
  protected readonly rejectReason = signal('');

  /** What was decided most recently, kept on screen after the row leaves. */
  protected readonly lastOutcome = signal<string | null>(null);

  constructor() {
    this.load();
  }

  protected readonly total = computed(() => {
    const queue = this.queue();
    if (!queue) return 0;
    return queue.refunds.length + queue.discounts.length;
  });

  protected load(): void {
    this.state.set('loading');
    this.api.moneyApprovals().subscribe({
      next: (queue) => {
        this.queue.set(queue);
        this.state.set(queue.refunds.length + queue.discounts.length === 0 ? 'empty' : 'ready');
      },
      error: (err: PresentedError) => {
        this.error.set(err);
        this.state.set(err.httpStatus === 403 ? 'forbidden' : 'error');
      },
    });
  }

  protected askToReject(id: string): void {
    this.rejecting.set(this.rejecting() === id ? null : id);
    this.rejectReason.set('');
    this.decisionError.set(null);
  }

  protected setRejectReason(value: string): void {
    this.rejectReason.set(value);
  }

  protected approveRefund(id: string): void {
    this.decide(id, this.api.approveRefund(id), (result) => {
      const note = (result as { creditNoteNumber?: string }).creditNoteNumber;
      // The credit note number is the artifact the customer and the tax
      // authority both ask for later, so it is said out loud once here.
      return note ? `Refunded. Credit note ${note}.` : 'Refunded.';
    });
  }

  protected rejectRefund(id: string): void {
    if (!this.rejectReason().trim()) return;
    this.decide(id, this.api.rejectRefund(id, this.rejectReason().trim()), () => 'Refund declined.');
  }

  protected approveDiscount(id: string): void {
    this.decide(id, this.api.approveDiscount(id), () => 'Discount approved.');
  }

  protected rejectDiscount(id: string): void {
    if (!this.rejectReason().trim()) return;
    this.decide(id, this.api.rejectDiscount(id, this.rejectReason().trim()), () => 'Discount declined.');
  }

  /**
   * Reloads rather than dropping the row locally.
   *
   * Approving a refund writes a credit note and can fail on the billing
   * adapter; approving a discount can be refused outright when the approver is
   * a branch manager over their own ceiling. Neither outcome is knowable here,
   * so what the queue looks like afterwards is the server's answer.
   */
  private decide<T>(
    id: string,
    call: { subscribe(observer: { next(value: T): void; error(err: PresentedError): void }): unknown },
    describe: (result: T) => string,
  ): void {
    this.deciding.set(id);
    this.decisionError.set(null);
    call.subscribe({
      next: (result: T) => {
        this.deciding.set(null);
        this.rejecting.set(null);
        this.rejectReason.set('');
        this.lastOutcome.set(describe(result));
        this.load();
      },
      error: (err: PresentedError) => {
        this.deciding.set(null);
        this.decisionError.set(err.message ?? 'That decision did not go through.');
      },
    });
  }

  protected asked(isoDate: string): string {
    const hours = (Date.now() - new Date(isoDate).getTime()) / 3_600_000;
    if (hours < 1) return 'just now';
    if (hours < 24) return `${Math.floor(hours)}h ago`;
    const days = Math.floor(hours / 24);
    return days === 1 ? 'yesterday' : `${days} days ago`;
  }
}
