import { Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { WORK_ORDER_LANES } from '@mop/shared';
import { Identifier } from '../../../ui/identifier/identifier';
import { ErrorBanner } from '../../../ui/error-banner/error-banner';
import { ButtonDirective } from '../../../ui/button/button.directive';
import { DossierDrawer } from '../../../domain/dossier/dossier-drawer';
import { WorkflowStrip } from '../../../domain/journey/workflow-strip';
import { pollJourney, type JourneyFeed } from '../../../domain/journey/journey-poller';
import type { PresentedError } from '../../../runtime/http/error.interceptor';
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
  private readonly destroyRef = inject(DestroyRef);

  /** Bound from the route. */
  readonly id = input.required<string>();

  protected readonly detail = signal<WorkOrderDetail | null>(null);
  /** The same projection the technician and customer see, in manager words. */
  private feed: JourneyFeed | null = null;
  protected readonly journey = computed(() => this.feed?.journey() ?? null);
  protected readonly advancing = signal(false);
  protected readonly advanceError = signal<string | null>(null);

  /**
   * Only at the two stages where somebody has to say yes or no. Read off
   * the job's own status rather than a capability flag: if the workshop
   * has no QC, no job of theirs is ever in READY_FOR_QC.
   */
  protected readonly reviewStage = computed(() => {
    const status = this.detail()?.status;
    if (status === 'READY_FOR_TEAM_REVIEW') return 'review' as const;
    if (status === 'READY_FOR_QC') return 'qc' as const;
    return null;
  });

  protected advance(passed: boolean): void {
    this.advancing.set(true);
    this.advanceError.set(null);
    this.api.advance(this.id(), passed).subscribe({
      next: () => {
        this.advancing.set(false);
        this.load();
        this.feed?.refresh();
      },
      error: (err: PresentedError) => {
        this.advancing.set(false);
        this.advanceError.set(err.message ?? 'That did not go through.');
      },
    });
  }
  protected readonly error = signal<PresentedError | null>(null);
  protected readonly state = signal<State>('loading');
  protected readonly showDossier = signal(false);

  /**
   * Add-task and request-approval, the manager's own doors into the same
   * writes the technician's Work Card already exposes -- see
   * `WorkOrdersApi.createTask`/`raiseDecision`. Only one panel open at a
   * time, same discipline as the Work Card's own tool panels.
   */
  protected readonly panel = signal<'none' | 'task' | 'decision'>('none');
  protected readonly panelBusy = signal(false);
  protected readonly panelError = signal<string | null>(null);

  protected readonly taskTitle = signal('');
  protected readonly taskServiceKey = signal('');

  protected readonly decisionName = signal('');
  protected readonly decisionExplanation = signal('');
  protected readonly decisionImportance = signal('MEDIUM');
  protected readonly decisionPrice = signal('');
  protected readonly decisionLaborPrice = signal('');
  private static readonly MONEY = /^\d+(\.\d{1,2})?$/;
  protected readonly decisionPriceValid = computed(() => WorkOrderWorkspace.MONEY.test(this.decisionPrice().trim()));

  protected togglePanel(next: 'task' | 'decision'): void {
    this.panelError.set(null);
    this.panel.set(this.panel() === next ? 'none' : next);
  }

  protected addTask(): void {
    const title = this.taskTitle().trim();
    if (title.length < 1) return;
    const serviceKey = this.taskServiceKey().trim() || undefined;

    this.panelBusy.set(true);
    this.panelError.set(null);
    this.api.createTask(this.id(), title, serviceKey).subscribe({
      next: () => {
        this.panelBusy.set(false);
        this.panel.set('none');
        this.taskTitle.set('');
        this.taskServiceKey.set('');
        this.load();
      },
      error: (err: PresentedError) => {
        this.panelBusy.set(false);
        this.panelError.set(err.message ?? 'That did not work.');
      },
    });
  }

  protected requestApproval(): void {
    const name = this.decisionName().trim();
    const explanation = this.decisionExplanation().trim();
    if (name.length < 1 || explanation.length < 1 || !this.decisionPriceValid()) return;

    this.panelBusy.set(true);
    this.panelError.set(null);
    this.api
      .raiseDecision(this.id(), {
        name,
        explanation,
        importance: this.decisionImportance(),
        price: this.decisionPrice().trim(),
        laborPrice: this.decisionLaborPrice().trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.panelBusy.set(false);
          this.panel.set('none');
          this.decisionName.set('');
          this.decisionExplanation.set('');
          this.decisionPrice.set('');
          this.decisionLaborPrice.set('');
          this.load();
          this.feed?.refresh();
        },
        error: (err: PresentedError) => {
          this.panelBusy.set(false);
          this.panelError.set(err.message ?? 'That did not work.');
        },
      });
  }

  protected readonly cancellingRequestId = signal<string | null>(null);

  /** Only meaningful before the customer has answered anything. */
  protected canCancelDecision(request: { status: string }): boolean {
    return request.status === 'SENT' || request.status === 'VIEWED';
  }

  protected cancelDecision(requestId: string): void {
    this.cancellingRequestId.set(requestId);
    this.api.cancelDecision(requestId).subscribe({
      next: () => {
        this.cancellingRequestId.set(null);
        this.load();
      },
      error: (err: PresentedError) => {
        this.cancellingRequestId.set(null);
        this.panelError.set(err.message ?? 'Could not cancel that request.');
      },
    });
  }

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
        // Started after the detail read, which is what scopes this job
        // to the manager's own branches.
        this.feed ??= pollJourney(this.destroyRef, () => this.api.journey(this.id()));
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
