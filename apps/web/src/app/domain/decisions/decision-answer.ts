import { Component, computed, input, output, signal } from '@angular/core';

export type Verdict = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface DecisionItem {
  readonly id: string;
  readonly name: string;
  readonly explanation: string;
  readonly importance: 'Low' | 'Medium' | 'High' | 'Critical';
  readonly decision: Verdict;
  readonly price: string | null;
  readonly labour: string | null;
  readonly total: string | null;
  /**
   * APPROVAL_WEIGHT, resolved server-side: whether declining THIS item
   * needs the explicit acknowledgement modal before the rejection is
   * recorded. Reflected here, never decided here -- the server re-checks
   * the same requirement from its own live policy value when the answer
   * is submitted.
   */
  readonly requiresAcknowledgement: boolean;
}

export interface PublicDecision {
  readonly state: 'OPEN' | 'EXPIRED' | 'ANSWERED';
  readonly workshopName: string;
  readonly vehicle: string | null;
  readonly pricingVisible: boolean;
  readonly respondedAt: string | null;
  readonly items: readonly DecisionItem[];
  readonly criticalWarning: string;
}

export interface SubmittedAnswer {
  readonly itemId: string;
  readonly decision: 'APPROVED' | 'REJECTED';
  readonly warningAcknowledged: boolean;
}

/**
 * Answering a decision: the items, the two choices, and the critical
 * warning.
 *
 * Extracted from the public token page when the authenticated portal
 * became a second way to answer the same question. A customer who
 * follows a WhatsApp link and a customer who opens the portal are
 * agreeing to the same thing, so they must see the same words, the same
 * prices, and the same safety warning -- two implementations would
 * eventually differ, and the one that differed would be the one showing
 * a price the other did not.
 *
 * Deliberately knows nothing about HTTP. The host page owns loading and
 * sending; this owns what a customer reads and presses.
 */
@Component({
  selector: 'app-decision-answer',
  templateUrl: './decision-answer.html',
  styleUrl: './decision-answer.css',
})
export class DecisionAnswer {
  readonly decision = input.required<PublicDecision>();
  readonly submitting = input(false);
  readonly error = input<string | null>(null);
  /** Overridable for a host where the customer isn't the one pressing it -- e.g. a manager recording an answer on their behalf. */
  readonly submitLabel = input('Send my answers');

  readonly answered = output<readonly SubmittedAnswer[]>();

  /** The customer's choices, before they are sent. */
  protected readonly choices = signal<Record<string, Verdict>>({});

  /**
   * The item whose critical warning is on screen.
   *
   * A rejection of a safety-critical repair is held here until it is
   * acknowledged. The server refuses it independently -- this modal is
   * the courtesy, not the gate.
   */
  protected readonly confirming = signal<DecisionItem | null>(null);
  protected readonly acknowledged = signal(false);

  protected choose(item: DecisionItem, verdict: Verdict): void {
    // APPROVAL_WEIGHT decides which items this applies to -- server-side,
    // per item, in `requiresAcknowledgement`. Under TWO_TIER that is
    // HIGH/CRITICAL only; under SINGLE_WEIGHT it is every item.
    if (verdict === 'REJECTED' && item.requiresAcknowledgement) {
      this.acknowledged.set(false);
      this.confirming.set(item);
      return;
    }
    this.choices.update((current) => ({ ...current, [item.id]: verdict }));
  }

  protected confirmCriticalRejection(): void {
    const item = this.confirming();
    if (!item || !this.acknowledged()) return;
    this.choices.update((current) => ({ ...current, [item.id]: 'REJECTED' }));
    this.confirming.set(null);
  }

  protected cancelCriticalRejection(): void {
    this.confirming.set(null);
    this.acknowledged.set(false);
  }

  protected chosen(item: DecisionItem): Verdict {
    return this.choices()[item.id] ?? item.decision;
  }

  protected readonly allAnswered = computed(() => {
    const items = this.decision().items;
    return items.length > 0 && items.every((item) => this.chosen(item) !== 'PENDING');
  });

  protected readonly canSubmit = computed(() => this.allAnswered() && !this.submitting());

  protected submit(): void {
    if (!this.canSubmit()) return;

    this.answered.emit(
      this.decision().items.map((item) => ({
        itemId: item.id,
        decision: this.chosen(item) as 'APPROVED' | 'REJECTED',
        // Only ever true for a rejection the customer confirmed through the
        // modal. The server re-checks this against its own live policy
        // value; sending it is not what makes it valid.
        warningAcknowledged: item.requiresAcknowledgement && this.chosen(item) === 'REJECTED',
      })),
    );
  }

  /** Cleared by the host once a send succeeds, so the fresh state shows. */
  reset(): void {
    this.choices.set({});
  }

  protected when(iso: string | null): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  }
}
