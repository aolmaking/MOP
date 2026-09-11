import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Identifier } from '../../ui/identifier/identifier';
import { VehicleMark } from '../../ui/vehicle-mark/vehicle-mark';
import type { PresentedError } from '../../runtime/http/error.interceptor';
import { TechnicianApi, type TechnicianJob } from './technician.api';

type State = 'loading' | 'idle' | 'forbidden' | 'error';

/** What the technician does with a job, which is the only grouping that helps them. */
type GroupKey = 'start' | 'wait';

interface QueueGroup {
  readonly key: GroupKey;
  readonly icon: string;
  readonly title: string;
  readonly jobs: readonly TechnicianJob[];
}

/**
 * The technician's queue.
 *
 * Built around one question -- which car do I touch, and what do I do
 * with it -- for someone standing up, in gloves, who may not read the
 * English words. That shapes three decisions:
 *
 *  - the job in their hands is lifted out of the list entirely, because
 *    it is the answer most of the time;
 *  - the rest is grouped by the action, not by the lifecycle status: a
 *    job is one they can start, or one somebody else has to move first;
 *  - nothing is behind a filter. Five pills reading All / Ready /
 *    Inspection / In Progress / Blocked made reading the price of
 *    admission, and hid whichever jobs the pill did not select.
 */
@Component({
  selector: 'app-tech-now',
  imports: [RouterLink, Identifier, VehicleMark],
  templateUrl: './tech-now.html',
  styleUrl: './tech-now.css',
})
export class TechNow {
  private readonly api = inject(TechnicianApi);

  protected readonly queue = signal<readonly TechnicianJob[]>([]);
  protected readonly state = signal<State>('loading');

  /**
   * The car in front of them, if there is one.
   *
   * A task of theirs in progress, or an inspection they have open --
   * the same two facts `activeJob` uses on the server. Being first in a
   * list is not activity, so nothing else qualifies and most of the time
   * this is null.
   */
  protected readonly currentJob = computed(
    () =>
      this.queue().find((job) => job.active) ??
      this.queue().find((job) => job.status === 'UNDER_INSPECTION') ??
      null,
  );

  /** True when the technician cannot move this job themselves. */
  private waiting(job: TechnicianJob): boolean {
    return (
      job.blocked ||
      [
        'BLOCKED',
        'WAITING_PARTS',
        'WAITING_ON_PARTS',
        'AWAITING_CUSTOMER_APPROVAL',
        'READY_FOR_TEAM_REVIEW',
        // Money and handover are the front desk's, not the bay's. These
        // sat under "Start these" reading "payment pending", which is not
        // a thing a technician can start.
        'PAYMENT_PENDING',
        'READY_FOR_DELIVERY',
      ].includes(job.status)
    );
  }

  protected readonly groups = computed<readonly QueueGroup[]>(() => {
    const current = this.currentJob();
    const rest = this.queue().filter((job) => job.workOrderId !== current?.workOrderId);

    const groups: QueueGroup[] = [
      { key: 'start', icon: '▶', title: 'Start these', jobs: rest.filter((job) => !this.waiting(job)) },
      { key: 'wait', icon: '⏳', title: 'Waiting on someone else', jobs: rest.filter((job) => this.waiting(job)) },
    ];

    // A heading over nothing is one more thing to read past.
    return groups.filter((group) => group.jobs.length > 0);
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.api.myWork().subscribe({
      next: ({ jobs }) => {
        this.queue.set(jobs);
        this.state.set('idle');
      },
      error: (err: PresentedError) => this.state.set(err.httpStatus === 403 ? 'forbidden' : 'error'),
    });
  }

  /**
   * The state as a picture.
   *
   * Beside the word, never instead of it -- and never colour alone,
   * which excludes a colour-blind technician and a screen in daylight.
   */
  protected stateIcon(job: TechnicianJob): string {
    if (job.blocked || job.status === 'BLOCKED') return '✋';
    switch (job.status) {
      case 'UNDER_INSPECTION':
        return '🔍';
      case 'IN_PROGRESS':
        return '🔧';
      case 'WAITING_PARTS':
      case 'WAITING_ON_PARTS':
        return '📦';
      case 'AWAITING_CUSTOMER_APPROVAL':
        return '💬';
      case 'READY_FOR_TEAM_REVIEW':
        return '👀';
      case 'PAYMENT_PENDING':
        return '💵';
      case 'READY_FOR_DELIVERY':
        return '🔑';
      default:
        return '▶';
    }
  }

  /**
   * How long this car has been waiting.
   *
   * Migrated from the "My work" page, which was deleted -- it is the one
   * thing that page showed and this one did not, and it is the difference
   * between two jobs that otherwise look identical: the one that arrived
   * an hour ago and the one that has been standing for three days.
   */
  protected since(hours: number): string {
    if (hours < 1) return 'just now';
    if (hours < 24) return `${Math.floor(hours)}h`;
    const days = Math.floor(hours / 24);
    return days === 1 ? '1 day' : `${days} days`;
  }

  protected statusLabel(status: string, blocked?: boolean): string {
    if (blocked || status === 'BLOCKED') return 'Stopped';
    switch (status) {
      case 'REGISTERED':
        return 'Check it';
      case 'UNDER_INSPECTION':
        return 'Checking';
      case 'APPROVED_FOR_WORK':
        return 'Start work';
      case 'IN_PROGRESS':
        return 'Working';
      case 'WAITING_PARTS':
      case 'WAITING_ON_PARTS':
        return 'Parts';
      case 'AWAITING_CUSTOMER_APPROVAL':
        return 'Customer';
      case 'READY_FOR_TEAM_REVIEW':
        return 'Review';
      case 'PAYMENT_PENDING':
        return 'Payment';
      case 'READY_FOR_DELIVERY':
        return 'Handover';
      default:
        return status.toLowerCase().replace(/_/g, ' ');
    }
  }
}
