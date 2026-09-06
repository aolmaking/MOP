import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ErrorBanner } from '../../ui/error-banner/error-banner';
import { ButtonDirective } from '../../ui/button/button.directive';
import type { PresentedError } from '../../runtime/http/error.interceptor';
import { OwnerHomeApi, type OwnerHome } from './owner-home.api';
import { isHeldBack } from '../../runtime/launch-surface';

type State = 'loading' | 'ready' | 'forbidden' | 'error';

interface StatCard {
  readonly key: string;
  readonly label: string;
  readonly meaning: string;
  readonly count: number;
  readonly link: string | null;
  readonly weight: 'urgent' | 'active' | 'quiet' | 'clear';
}

/**
 * Owner Home -- the role's landing page, and the one PROJECT_STATE.md has
 * flagged repeatedly as "the owner has nowhere to start."
 *
 * Every card is a link, never an action, per PHASE_10.md section 4: this
 * page tells the owner what's true and where to act, it never mutates
 * data itself. Configuration warnings, Builder draft status, and
 * Workflow health alerts are deliberately absent, not present-and-empty
 * -- the diagnostic systems behind them do not exist yet, and a card that
 * always reads "no warnings" would be the silent stub CLAUDE.md forbids.
 */
@Component({
  selector: 'app-owner-home-page',
  imports: [RouterLink, ErrorBanner, ButtonDirective],
  templateUrl: './owner-home-page.html',
  styleUrl: './owner-home-page.css',
})
export class OwnerHomePage {
  /**
   * History is written and queryable; the owner-facing page waits for
   * M4, so the launch sprint holds it back. The recent-activity list
   * above stays -- only the door to the full page closes, because a
   * "see everything" link to a page the rail hides is a dead end.
   */
  protected readonly historyVisible = !isHeldBack('/owner/audit');

  private readonly api = inject(OwnerHomeApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly data = signal<OwnerHome | null>(null);
  protected readonly state = signal<State>('loading');
  protected readonly error = signal<PresentedError | null>(null);

  protected readonly cards = computed<readonly StatCard[]>(() => {
    const d = this.data();
    if (!d) return [];
    return [
      {
        key: 'open',
        label: 'Open work orders',
        meaning: 'currently moving through the workshop',
        count: d.openWorkOrders,
        link: '/branch/work-orders',
        weight: d.openWorkOrders === 0 ? 'clear' : 'active',
      },
      {
        key: 'approval',
        label: 'Waiting on the customer',
        meaning: 'a decision has been asked for and not answered',
        count: d.waitingCustomerApproval,
        link: '/branch/approvals',
        weight: d.waitingCustomerApproval === 0 ? 'clear' : 'urgent',
      },
      {
        key: 'parts',
        label: 'Waiting on parts',
        meaning: 'work orders blocked on a part request',
        count: d.waitingParts,
        link: '/inventory/requests',
        weight: d.waitingParts === 0 ? 'clear' : 'active',
      },
      {
        key: 'payment',
        label: 'Waiting on payment',
        meaning: 'work is done and the balance is still open',
        count: d.waitingPayment,
        link: '/branch/delivery',
        weight: d.waitingPayment === 0 ? 'clear' : 'active',
      },
      {
        key: 'stock',
        label: 'Low stock',
        meaning: 'items at or below their low-stock threshold',
        count: d.lowStock,
        link: '/inventory/stock',
        weight: d.lowStock === 0 ? 'clear' : 'quiet',
      },
    ];
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.api
      .home()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.data.set(data);
          this.state.set('ready');
        },
        error: (err: PresentedError) => {
          this.error.set(err);
          this.state.set(err.httpStatus === 403 ? 'forbidden' : 'error');
        },
      });
  }

  protected when(iso: string): string {
    return new Date(iso).toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  protected label(value: string): string {
    return value.toLowerCase().replace(/[._]/g, ' ');
  }
}
