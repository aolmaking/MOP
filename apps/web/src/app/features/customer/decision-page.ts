import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import type { PresentedError } from '../../core/api/error.interceptor';

type Verdict = 'PENDING' | 'APPROVED' | 'REJECTED';

interface DecisionItem {
  readonly id: string;
  readonly name: string;
  readonly explanation: string;
  readonly importance: 'Low' | 'Medium' | 'High' | 'Critical';
  readonly decision: Verdict;
  readonly price: string | null;
  readonly labour: string | null;
  readonly total: string | null;
}

interface PublicDecision {
  readonly state: 'OPEN' | 'EXPIRED' | 'ANSWERED';
  readonly workshopName: string;
  readonly vehicle: string | null;
  readonly pricingVisible: boolean;
  readonly respondedAt: string | null;
  readonly items: readonly DecisionItem[];
  readonly criticalWarning: string;
}

type State = 'loading' | 'ready' | 'not-found' | 'error';

/**
 * The customer decision page.
 *
 * The only public page in MOP, and the only one a customer will ever see
 * more than once or twice. From DESIGN_LANGUAGE section 0: they open this
 * on a phone, worried about money and their car, and they do not know
 * what any of our words mean.
 *
 * So it is written in plain language, one item at a time, with the money
 * stated before the choice rather than after it. There is no navigation,
 * no branding beyond the workshop's name, and nothing to explore.
 */
@Component({
  selector: 'app-decision-page',
  templateUrl: './decision-page.html',
  styleUrl: './decision-page.css',
})
export class DecisionPage {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);

  protected readonly decision = signal<PublicDecision | null>(null);
  protected readonly state = signal<State>('loading');
  protected readonly error = signal<string | null>(null);
  protected readonly submitting = signal(false);

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

  private readonly token = this.route.snapshot.paramMap.get('token') ?? '';

  constructor() {
    if (!this.token) {
      this.state.set('not-found');
      return;
    }
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.http.get<PublicDecision>(`/api/v1/public/decisions/${this.token}`).subscribe({
      next: (decision) => {
        this.decision.set(decision);
        this.state.set('ready');
      },
      error: (err: PresentedError) => this.state.set(err.httpStatus === 404 ? 'not-found' : 'error'),
    });
  }

  protected choose(item: DecisionItem, verdict: Verdict): void {
    // A critical rejection is held back until the warning is read.
    if (verdict === 'REJECTED' && item.importance === 'Critical') {
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
    const items = this.decision()?.items ?? [];
    return items.length > 0 && items.every((item) => this.chosen(item) !== 'PENDING');
  });

  protected readonly canSubmit = computed(() => this.allAnswered() && !this.submitting());

  protected submit(): void {
    if (!this.canSubmit()) return;

    const items = this.decision()?.items ?? [];
    const answers = items.map((item) => ({
      itemId: item.id,
      decision: this.chosen(item) as 'APPROVED' | 'REJECTED',
      // Only ever true for a critical rejection the customer confirmed.
      // The server re-checks this; sending it is not what makes it valid.
      warningAcknowledged: item.importance === 'Critical' && this.chosen(item) === 'REJECTED',
    }));

    this.submitting.set(true);
    this.error.set(null);

    this.http.post<PublicDecision>(`/api/v1/public/decisions/${this.token}/respond`, { answers }).subscribe({
      next: (updated) => {
        this.submitting.set(false);
        this.decision.set(updated);
        this.choices.set({});
      },
      error: (err: PresentedError) => {
        this.submitting.set(false);
        this.error.set(err.message ?? 'That did not go through. Please try again.');
      },
    });
  }

  protected when(iso: string | null): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  }
}
