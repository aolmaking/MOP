import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ErrorBanner } from '../../ui/error-banner/error-banner';
import { ButtonDirective } from '../../ui/button/button.directive';
import type { PresentedError } from '../../runtime/http/error.interceptor';
import { CustomerPortalApi, type PendingDecision } from './customer-portal.api';
import { DecisionAnswer, type SubmittedAnswer } from '../../domain/decisions/decision-answer';

type State = 'loading' | 'ready' | 'empty' | 'forbidden' | 'error';

/**
 * "Waiting on you" -- every decision the workshop needs an answer to.
 *
 * The gap this closes: the portal has counted pending decisions on its
 * home page since Phase 11 and listed them nowhere, and Current Service
 * showed a "Needs you" flag that could not be pressed. A logged-in
 * customer could see that they were being asked something and had no way
 * to answer without the separate link the portal exists to make optional.
 *
 * Hosts the same `DecisionAnswer` component the public token page does,
 * so the words, prices and safety warning are identical either way.
 */
@Component({
  selector: 'app-my-decisions',
  imports: [ErrorBanner, ButtonDirective, DecisionAnswer],
  templateUrl: './my-decisions.html',
  styleUrl: './my-decisions.css',
})
export class MyDecisions {
  private readonly api = inject(CustomerPortalApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly decisions = signal<readonly PendingDecision[]>([]);
  protected readonly state = signal<State>('loading');
  protected readonly error = signal<PresentedError | null>(null);

  /** Keyed by requestId -- several decisions can be open at once. */
  protected readonly submitting = signal<string | null>(null);
  protected readonly sendError = signal<Record<string, string>>({});

  constructor() {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.api
      .pendingDecisions()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (decisions) => {
          this.decisions.set(decisions);
          this.state.set(decisions.length === 0 ? 'empty' : 'ready');
        },
        error: (err: PresentedError) => {
          this.error.set(err);
          this.state.set(err.httpStatus === 403 ? 'forbidden' : 'error');
        },
      });
  }

  protected errorFor(requestId: string): string | null {
    return this.sendError()[requestId] ?? null;
  }

  protected send(requestId: string, answers: readonly SubmittedAnswer[]): void {
    this.submitting.set(requestId);
    this.sendError.update((current) => {
      const next = { ...current };
      delete next[requestId];
      return next;
    });

    this.api
      .respondToDecision(requestId, answers)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.submitting.set(null);
          // Reloaded rather than patched: answering can move the work
          // order, and the server decides what the answer did. Guessing
          // here is how a portal shows a decision that closed only in
          // the browser.
          this.load();
        },
        error: (err: PresentedError) => {
          this.submitting.set(null);
          this.sendError.update((current) => ({
            ...current,
            [requestId]: err.message ?? 'That did not go through. Please try again.',
          }));
        },
      });
  }
}
