import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ErrorBanner } from '../../ui/error-banner/error-banner';
import { ButtonDirective } from '../../ui/button/button.directive';
import type { PresentedError } from '../../runtime/http/error.interceptor';
import { AccessApi } from '../../identity/access.api';
import { FinanceApi, type Money, type Settlement } from './finance.api';

type State = 'loading' | 'ready' | 'settled' | 'forbidden' | 'error';

const METHODS = [
  { key: 'CASH', label: 'Cash' },
  { key: 'CARD', label: 'Card' },
  { key: 'BANK_TRANSFER', label: 'Transfer' },
  { key: 'WALLET', label: 'Wallet' },
] as const;

/**
 * Take payment.
 *
 * A focused task, like intake: the customer is standing at the counter
 * with money in their hand. The outstanding balance is the largest thing
 * on the screen, and the method is four buttons rather than a dropdown --
 * a dropdown for four options is a click that buys nothing.
 *
 * Money is a string from the API to this template and is never parsed.
 * Rounding, comparison and subtraction all happen server-side, in the
 * shared money module, so this page cannot introduce a float.
 */
@Component({
  selector: 'app-take-payment',
  imports: [RouterLink, ErrorBanner, ButtonDirective],
  templateUrl: './take-payment.html',
  styleUrl: './take-payment.css',
})
export class TakePayment {
  private readonly api = inject(FinanceApi);
  private readonly access = inject(AccessApi);

  readonly id = input.required<string>();

  protected readonly settlement = signal<Settlement | null>(null);
  protected readonly state = signal<State>('loading');
  protected readonly error = signal<PresentedError | null>(null);

  protected readonly methods = METHODS;
  protected readonly method = signal<string>('CASH');
  protected readonly amount = signal<Money>('');
  protected readonly submitting = signal(false);
  protected readonly conflict = signal<string | null>(null);

  /**
   * One key per ATTEMPT, not per request.
   *
   * Regenerated only when the operator changes what they are paying, so
   * a retry after a timeout carries the same key and records one payment.
   * Generating it per request would defeat the mechanism entirely.
   */
  private attemptKey = newKey();

  /**
   * Whether this person may ask for money to go back.
   *
   * Asking and deciding are separate permissions -- a branch manager sees the
   * dispute and can raise it, the owner signs it off -- so this only governs
   * the request. Defaults to false: a hidden action costs less than one that
   * greets its user with a 403.
   */
  protected readonly mayRequestRefund = signal(false);

  /**
   * The overpayment this page already names out loud.
   *
   * "This is owed back to the customer" was on screen with nothing to do about
   * it, which is the same shape as the delivery board naming an invoice
   * nobody could issue. Money the workshop is holding that belongs to someone
   * else is a refund, and a refund is its own record.
   */
  protected readonly refundOpen = signal(false);
  protected readonly refundAmount = signal<Money>('');
  protected readonly refundReason = signal('');
  protected readonly refundSubmitting = signal(false);
  protected readonly refundError = signal<string | null>(null);
  protected readonly refundRequested = signal(false);

  constructor() {
    queueMicrotask(() => this.load());
    this.access.can('finance.refund.request').subscribe((allowed) => this.mayRequestRefund.set(allowed));
  }

  /**
   * Opens pre-filled with the overpayment where there is one.
   *
   * That is the amount in dispute in the common case, and re-typing a number
   * already on the screen is the most likely place to mistype one -- the same
   * reasoning as the payment amount above.
   */
  protected openRefund(): void {
    const settlement = this.settlement();
    this.refundOpen.set(true);
    this.refundError.set(null);
    if (this.refundAmount() === '') {
      this.refundAmount.set(settlement && settlement.overpaid !== '0.00' ? settlement.overpaid : '');
    }
  }

  protected closeRefund(): void {
    this.refundOpen.set(false);
    this.refundError.set(null);
  }

  protected setRefundAmount(value: string): void {
    this.refundAmount.set(value);
    this.refundError.set(null);
  }

  protected setRefundReason(value: string): void {
    this.refundReason.set(value);
  }

  protected readonly canRequestRefund = computed(
    () =>
      /^\d+(\.\d{1,2})?$/.test(this.refundAmount().trim()) &&
      this.refundReason().trim().length > 0 &&
      !this.refundSubmitting(),
  );

  /**
   * A request, not a refund. Nothing moves until somebody who holds
   * `finance.refund.decide` approves it, and only then is a credit note
   * written -- money leaving with no document is money nobody can account for
   * to a customer or a tax authority.
   */
  protected requestRefund(): void {
    if (!this.canRequestRefund()) return;

    this.refundSubmitting.set(true);
    this.refundError.set(null);
    this.api.requestRefund(this.id(), this.refundAmount().trim(), this.refundReason().trim()).subscribe({
      next: () => {
        this.refundSubmitting.set(false);
        this.refundOpen.set(false);
        this.refundRequested.set(true);
        this.refundAmount.set('');
        this.refundReason.set('');
      },
      error: (err: PresentedError) => {
        this.refundSubmitting.set(false);
        this.refundError.set(err.message ?? 'That request did not go through.');
      },
    });
  }

  protected load(): void {
    this.state.set('loading');
    this.api.settlement(this.id()).subscribe({
      next: (settlement) => {
        this.settlement.set(settlement);
        // Pre-filled with the full balance: paying it off is the common
        // case, and re-typing a number that is already on screen is the
        // most likely place to mistype one.
        if (this.amount() === '') this.amount.set(settlement.outstanding);
        this.state.set(settlement.settled ? 'settled' : 'ready');
      },
      error: (err: PresentedError) => {
        this.error.set(err);
        this.state.set(err.httpStatus === 403 ? 'forbidden' : 'error');
      },
    });
  }

  protected setAmount(value: string): void {
    this.amount.set(value);
    // A different amount is a different attempt, so it gets a new key --
    // and would otherwise collide with the previous one server-side.
    this.attemptKey = newKey();
    this.conflict.set(null);
  }

  protected setMethod(value: string): void {
    this.method.set(value);
  }

  /** A well-formed money string with at most two decimal places. */
  protected readonly amountValid = computed(() => /^\d+(\.\d{1,2})?$/.test(this.amount().trim()));

  protected readonly canSubmit = computed(
    () => this.amountValid() && !this.submitting() && this.state() === 'ready',
  );

  protected submit(): void {
    if (!this.canSubmit()) return;

    this.submitting.set(true);
    this.error.set(null);
    this.conflict.set(null);

    this.api.pay(this.id(), this.amount().trim(), this.method(), this.attemptKey).subscribe({
      next: (settlement) => {
        this.submitting.set(false);
        this.settlement.set(settlement);
        this.state.set(settlement.settled ? 'settled' : 'ready');
        this.amount.set(settlement.outstanding);
        this.attemptKey = newKey();
      },
      error: (err: PresentedError) => {
        this.submitting.set(false);
        if (err.code === 'idempotency_conflict') {
          // Stated as a question, not an error. The likely cause is that
          // the money was already taken, and telling the operator to
          // "try again" would be the worst possible advice.
          this.conflict.set(
            'A payment with this reference was already recorded for a different amount. ' +
              'Check whether it has already been taken before recording it again.',
          );
          this.load();
          return;
        }
        this.error.set(err);
      },
    });
  }
}

/** Unique per attempt. crypto.randomUUID is available in every target browser. */
function newKey(): string {
  return `pay-${crypto.randomUUID()}`;
}
