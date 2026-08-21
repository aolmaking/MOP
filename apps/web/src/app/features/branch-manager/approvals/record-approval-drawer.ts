import { Component, DestroyRef, inject, input, output, signal, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DismissOnEscapeDirective } from '../../../shared/dismiss-on-escape/dismiss-on-escape.directive';
import { ErrorBanner } from '../../../shared/error-banner/error-banner';
import type { PresentedError } from '../../../core/api/error.interceptor';
import { DecisionAnswer, type PublicDecision, type SubmittedAnswer } from '../../customer/decision-answer';
import { ApprovalsApi } from './approvals.api';

type State = 'loading' | 'ready' | 'error';

/**
 * P-18 (docs/POLICY_DECISION_INVENTORY.md): recording a decision the
 * customer gave verbally rather than through their portal or link.
 * `CAPABILITY_MODEL.md` Rule 3 promises that removing the portal moves
 * approval to the counter without deleting consent -- `recordOnBehalf`
 * and its route existed and were fully tested with nothing in the
 * product ever calling them. This is that call site.
 *
 * A drawer, matching the dossier's own pattern, because this is opened
 * from the middle of chasing a list of customers and must not lose that
 * position. Hosts the same `DecisionAnswer` component the customer's own
 * token link and portal use, so a manager reading it down the phone sees
 * the identical items, prices and safety warning the customer would have
 * seen -- one implementation, three doors in.
 */
@Component({
  selector: 'app-record-approval-drawer',
  imports: [FormsModule, DismissOnEscapeDirective, ErrorBanner, DecisionAnswer],
  templateUrl: './record-approval-drawer.html',
  styleUrl: './record-approval-drawer.css',
})
export class RecordApprovalDrawer {
  private readonly api = inject(ApprovalsApi);
  private readonly destroyRef = inject(DestroyRef);

  readonly requestId = input.required<string>();
  readonly closed = output<void>();
  /** Emitted after a successful write, so the host can refresh its list. */
  readonly recorded = output<void>();

  protected readonly state = signal<State>('loading');
  protected readonly decision = signal<PublicDecision | null>(null);
  protected readonly loadError = signal<PresentedError | null>(null);

  protected readonly evidenceReference = signal('');
  protected readonly submitting = signal(false);
  protected readonly submitError = signal<string | null>(null);

  constructor() {
    effect(() => {
      const id = this.requestId();
      if (id) this.load(id);
    });
  }

  protected load(id: string): void {
    this.state.set('loading');
    this.api
      .approvalDetail(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (d) => {
          this.decision.set(d);
          this.state.set('ready');
        },
        error: (err: PresentedError) => {
          this.loadError.set(err);
          this.state.set('error');
        },
      });
  }

  protected retry(): void {
    this.load(this.requestId());
  }

  protected submit(answers: readonly SubmittedAnswer[]): void {
    this.submitting.set(true);
    this.submitError.set(null);

    this.api
      .recordDecision(this.requestId(), answers, this.evidenceReference())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.recorded.emit();
        },
        error: (err: PresentedError) => {
          this.submitting.set(false);
          this.submitError.set(err.message ?? 'That did not go through. Please try again.');
        },
      });
  }
}
