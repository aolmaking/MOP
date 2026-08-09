import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Identifier } from '../../../shared/identifier/identifier';
import { ErrorBanner } from '../../../shared/error-banner/error-banner';
import { ButtonDirective } from '../../../shared/button/button.directive';
import type { PresentedError } from '../../../core/api/error.interceptor';
import { ApprovalsApi, type ApprovalRow, type ApprovalsResult } from './approvals.api';

type State = 'loading' | 'ready' | 'empty' | 'forbidden' | 'error';

/**
 * "Who do I need to chase?"
 *
 * Its own page because chasing is a batch activity -- done in one sitting
 * with a phone in hand, working down a list. See PHASE_5.md (5.E).
 *
 * The list is split into two, and the split is the point: a request that
 * was SENT is the customer's delay, one that was never sent is ours. They
 * look identical in the database and call for opposite actions.
 */
@Component({
  selector: 'app-approvals-page',
  imports: [RouterLink, Identifier, ErrorBanner, ButtonDirective],
  templateUrl: './approvals-page.html',
  styleUrl: './approvals-page.css',
})
export class ApprovalsPage {
  private readonly api = inject(ApprovalsApi);

  protected readonly result = signal<ApprovalsResult | null>(null);
  protected readonly error = signal<PresentedError | null>(null);
  protected readonly state = signal<State>('loading');

  constructor() {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.api.approvals().subscribe({
      next: (result) => {
        this.result.set(result);
        this.state.set(result.waiting.length + result.unsent.length === 0 ? 'empty' : 'ready');
      },
      error: (err: PresentedError) => {
        this.error.set(err);
        this.state.set(err.httpStatus === 403 ? 'forbidden' : 'error');
      },
    });
  }

  /**
   * How long the customer has had it, in words. Past a day the exact hour
   * is false precision -- nobody chases differently at 50h than at 49h.
   */
  protected waited(row: ApprovalRow): string {
    const hours = row.waitingHours;
    if (hours < 1) return 'just now';
    if (hours < 24) return `${Math.floor(hours)}h`;
    const days = Math.floor(hours / 24);
    return days === 1 ? '1 day' : `${days} days`;
  }

  /** Over a day is the point where chasing stops being optional. */
  protected overdue(row: ApprovalRow): boolean {
    return row.waitingHours >= 24;
  }

  protected progress(row: ApprovalRow): string {
    return `${row.decidedCount} of ${row.itemCount} answered`;
  }
}
