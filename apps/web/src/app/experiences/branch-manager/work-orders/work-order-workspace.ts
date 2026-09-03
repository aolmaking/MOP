import { Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { WORK_ORDER_LANES } from '@mop/shared';
import { Identifier } from '../../../ui/identifier/identifier';
import { ErrorBanner } from '../../../ui/error-banner/error-banner';
import { ButtonDirective } from '../../../ui/button/button.directive';
import { DossierDrawer } from '../../../domain/dossier/dossier-drawer';
import { WorkflowStrip, type JourneyAction } from '../../../domain/journey/workflow-strip';
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
  /**
   * CONTRACTS-v0 C3. The counter's own "and while it is in, do this
   * too": work the technician did not think to raise, added by the
   * person the customer is standing in front of.
   */
  protected readonly addingTask = signal(false);
  protected readonly newTaskTitle = signal('');
  protected readonly taskError = signal<string | null>(null);
  protected readonly savingTask = signal(false);
  protected readonly taskTitleValid = computed(() => this.newTaskTitle().trim().length > 0);

  protected toggleAddTask(): void {
    this.addingTask.update((open) => !open);
    this.newTaskTitle.set('');
    this.taskError.set(null);
  }

  protected addTask(): void {
    if (!this.taskTitleValid()) return;
    this.savingTask.set(true);
    this.taskError.set(null);
    this.api.createTask(this.id(), { title: this.newTaskTitle().trim() }).subscribe({
      next: () => {
        this.savingTask.set(false);
        this.addingTask.set(false);
        this.newTaskTitle.set('');
        // The server decides what the write did -- creating a task can
        // move the job -- so the page re-reads rather than pushing the
        // new row into the local list.
        this.load();
        this.feed?.refresh();
      },
      error: (err: PresentedError) => {
        this.savingTask.set(false);
        this.taskError.set(err.message ?? 'That task did not save.');
      },
    });
  }

  /**
   * CONTRACTS-v0 C4. The job that has a priced recommendation sitting on
   * it and never moved, because the technician raised it and nobody
   * pressed anything since.
   *
   * Reached through the journey's own action list, which is the only
   * place that has asked BOTH questions: does the workshop's graph allow
   * this move from here, and does this manager hold the permission. This
   * page used to decide for itself from the status alone -- an
   * approximation that offered the button on jobs the graph would refuse.
   */
  protected readonly requestingApproval = signal(false);
  protected readonly approvalError = signal<string | null>(null);

  /**
   * An action the server offered, performed.
   *
   * Routed by the server's action KEY. An unrecognised key does nothing
   * rather than guessing: a new server-side action reaches an old client
   * as nothing, never as the wrong request.
   */
  protected runJourneyAction(action: JourneyAction): void {
    if (action.key === 'request_approval') this.requestApproval();
  }

  private requestApproval(): void {
    this.requestingApproval.set(true);
    this.approvalError.set(null);
    this.api.requestApproval(this.id()).subscribe({
      next: () => {
        this.requestingApproval.set(false);
        this.load();
        this.feed?.refresh();
      },
      error: (err: PresentedError) => {
        this.requestingApproval.set(false);
        this.approvalError.set(err.message ?? 'That did not go through.');
      },
    });
  }

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
