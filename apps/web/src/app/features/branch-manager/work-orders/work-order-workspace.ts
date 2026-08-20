import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { WORK_ORDER_LANES } from '@mop/shared';
import { Identifier } from '../../../shared/identifier/identifier';
import { ErrorBanner } from '../../../shared/error-banner/error-banner';
import { ButtonDirective } from '../../../shared/button/button.directive';
import { DossierDrawer } from '../../../shared/dossier/dossier-drawer';
import { WorkflowStrip, type PresentedJourney } from '../../../shared/workflow-strip/workflow-strip';
import type { PresentedError } from '../../../core/api/error.interceptor';
import { WorkOrdersApi, type WorkOrderDetail } from './work-orders.api';

type State = 'loading' | 'ready' | 'not-found' | 'forbidden' | 'error';

/**
 * One car, everything about it.
 *
 * Structure is argued in docs/phases/PHASE_5.md (5.D). The page answers,
 * in this order: what is this, whose move is it, what is holding it up,
 * and what happened. Blockers sit above tasks because a blocked job is
 * the reason a manager opened this page at all.
 */
@Component({
  selector: 'app-work-order-workspace',
  imports: [RouterLink, Identifier, ErrorBanner, ButtonDirective, DossierDrawer, WorkflowStrip],
  templateUrl: './work-order-workspace.html',
  styleUrl: './work-order-workspace.css',
})
export class WorkOrderWorkspace {
  private readonly api = inject(WorkOrdersApi);

  /** Bound from the route. */
  readonly id = input.required<string>();

  protected readonly detail = signal<WorkOrderDetail | null>(null);
  /** The same projection the technician and customer see, in manager words. */
  protected readonly journey = signal<PresentedJourney | null>(null);
  protected readonly error = signal<PresentedError | null>(null);
  protected readonly state = signal<State>('loading');
  protected readonly showDossier = signal(false);

  constructor() {
    // Re-fetches when the route id changes, so navigating between two
    // jobs does not show the previous car's details under a new plate.
    queueMicrotask(() => this.load());
  }

  protected load(): void {
    this.state.set('loading');
    this.api.detail(this.id()).subscribe({
      next: (detail) => {
        this.detail.set(detail);
        this.state.set('ready');
        // After the detail read, which is what scopes this job to the
        // manager's own branches.
        this.api.journey(this.id()).subscribe({
          next: (journey) => this.journey.set(journey),
          error: () => this.journey.set(null),
        });
      },
      error: (err: PresentedError) => {
        this.error.set(err);
        if (err.httpStatus === 404) this.state.set('not-found');
        else if (err.httpStatus === 403) this.state.set('forbidden');
        else this.state.set('error');
      },
    });
  }

  protected readonly lane = computed(() => {
    const key = this.detail()?.lane;
    return WORK_ORDER_LANES.find((lane) => lane.key === key) ?? null;
  });

  /** Open blockers across every task -- the "why is this stuck" answer. */
  protected readonly blockers = computed(() =>
    (this.detail()?.tasks ?? []).flatMap((task) =>
      task.blockers.map((blocker) => ({ ...blocker, taskTitle: task.title })),
    ),
  );

  /**
   * A rejected critical repair the customer has not acknowledged. The one
   * thing on this page that is a liability rather than a delay, so it is
   * pulled out of the decision list and stated on its own.
   */
  protected readonly unacknowledgedCritical = computed(() =>
    (this.detail()?.decisionRequests ?? []).flatMap((request) =>
      request.items.filter(
        (item) => item.importance === 'CRITICAL' && item.decision === 'REJECTED' && !item.warningAcknowledged,
      ),
    ),
  );

  protected readonly identifier = computed(() => {
    const asset = this.detail()?.asset;
    return asset?.plateNumber ?? asset?.serialNumber ?? '—';
  });

  protected label(value: string): string {
    return value.toLowerCase().replace(/_/g, ' ');
  }

  protected since(iso: string): string {
    const hours = (Date.now() - new Date(iso).getTime()) / 3_600_000;
    if (hours < 1) return 'just now';
    if (hours < 24) return `${Math.floor(hours)}h ago`;
    const days = Math.floor(hours / 24);
    return days === 1 ? '1 day ago' : `${days} days ago`;
  }
}
