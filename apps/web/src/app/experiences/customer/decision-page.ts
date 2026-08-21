import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import type { PresentedError } from '../../runtime/http/error.interceptor';
import { DecisionAnswer, type PublicDecision, type SubmittedAnswer } from '../../domain/decisions/decision-answer';

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
 *
 * This component now owns only the token, the fetch and the frame: the
 * items, the two choices and the critical warning live in
 * `DecisionAnswer`, shared with the authenticated portal so both ways in
 * show the same thing.
 */
@Component({
  selector: 'app-decision-page',
  imports: [DecisionAnswer],
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

  protected submit(answers: readonly SubmittedAnswer[]): void {
    this.submitting.set(true);
    this.error.set(null);

    this.http.post<PublicDecision>(`/api/v1/public/decisions/${this.token}/respond`, { answers }).subscribe({
      next: (updated) => {
        this.submitting.set(false);
        this.decision.set(updated);
      },
      error: (err: PresentedError) => {
        this.submitting.set(false);
        this.error.set(err.message ?? 'That did not go through. Please try again.');
      },
    });
  }
}
