import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Identifier } from '../../../shared/identifier/identifier';
import { ErrorBanner } from '../../../shared/error-banner/error-banner';
import { ButtonDirective } from '../../../shared/button/button.directive';
import type { PresentedError } from '../../../core/api/error.interceptor';
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

  protected readonly board = signal<DeliveryBoard | null>(null);
  protected readonly error = signal<PresentedError | null>(null);
  protected readonly state = signal<State>('loading');

  constructor() {
    this.load();
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

  protected waited(row: DeliveryCandidate): string {
    const hours = row.waitingHours;
    if (hours < 1) return 'just now';
    if (hours < 24) return `${Math.floor(hours)}h`;
    const days = Math.floor(hours / 24);
    return days === 1 ? '1 day' : `${days} days`;
  }
}
