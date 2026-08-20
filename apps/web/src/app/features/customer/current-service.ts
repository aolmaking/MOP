import { Component, DestroyRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ErrorBanner } from '../../shared/error-banner/error-banner';
import { WorkflowStrip, type PresentedJourney } from '../../shared/workflow-strip/workflow-strip';
import { pollJourney, type JourneyFeed } from '../../shared/workflow-strip/journey-poller';
import { ButtonDirective } from '../../shared/button/button.directive';
import type { PresentedError } from '../../core/api/error.interceptor';
import { CustomerPortalApi, type CurrentServiceItem } from './customer-portal.api';

type State = 'loading' | 'ready' | 'empty' | 'forbidden' | 'error';

/**
 * Current Service -- every open work order for this customer, in plain
 * language. `docs/detailed-specs/customer.md` describes this as a full
 * lifecycle strip, but `CustomerPortalService.currentService()` (Phase
 * 11) exposes only status, not per-stage detail -- so this renders one
 * honest plain-language phrase per job rather than a strip implying a
 * precision the API does not have. A real lifecycle strip is future
 * work against the same page, not something to fake here.
 */
const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Being set up',
  REGISTERED: 'Checked in',
  UNDER_INSPECTION: 'Being inspected',
  AWAITING_CUSTOMER_APPROVAL: 'Waiting for your decision',
  APPROVED_FOR_WORK: 'Approved, work starting',
  IN_PROGRESS: 'Work in progress',
  WAITING_PARTS: 'Waiting for parts',
  WAITING_CUSTOMER: 'Waiting to hear from you',
  BLOCKED: 'On hold',
  READY_FOR_TEAM_REVIEW: 'Being reviewed',
  READY_FOR_QC: 'Final checks',
  QC_FAILED: 'Being corrected',
  READY_FOR_DELIVERY: 'Ready for pickup',
  PAYMENT_PENDING: 'Ready — payment pending',
  // The two terminal states were missing, so they fell through to the
  // lowercased enum: a customer was told their car was "closed", which is
  // workshop vocabulary for a record, not English for a finished repair.
  CLOSED: 'Completed',
  CANCELLED: 'Cancelled',
};

/**
 * Every status a work order can hold. Kept here so the label map can be
 * checked against it: the fallback prints a lowercased enum on a page a
 * paying customer reads, so a status added later must fail a test rather
 * than quietly show them "ready_for_qc".
 */
export const CUSTOMER_VISIBLE_STATUSES: readonly string[] = [
  'DRAFT',
  'REGISTERED',
  'UNDER_INSPECTION',
  'AWAITING_CUSTOMER_APPROVAL',
  'APPROVED_FOR_WORK',
  'IN_PROGRESS',
  'WAITING_PARTS',
  'WAITING_CUSTOMER',
  'BLOCKED',
  'READY_FOR_TEAM_REVIEW',
  'READY_FOR_QC',
  'QC_FAILED',
  'READY_FOR_DELIVERY',
  'PAYMENT_PENDING',
  'CLOSED',
  'CANCELLED',
];

export const CUSTOMER_STATUS_LABELS = STATUS_LABEL;

const NEEDS_YOU = new Set(['AWAITING_CUSTOMER_APPROVAL', 'WAITING_CUSTOMER']);

@Component({
  selector: 'app-current-service',
  imports: [ErrorBanner, ButtonDirective, RouterLink, WorkflowStrip],
  templateUrl: './current-service.html',
  styleUrl: './current-service.css',
})
export class CurrentService {
  private readonly api = inject(CustomerPortalApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly items = signal<readonly CurrentServiceItem[]>([]);
  /**
   * One strip per open job, keyed by work order.
   *
   * `docs/detailed-specs/customer.md` asked for a lifecycle strip here
   * and Phase 11 could not build one honestly, because the API exposed
   * only a status. It exposes the real journey now, so the strip is the
   * spec's own answer rather than a status phrase standing in for it.
   */
  protected readonly journeys = signal<Record<string, PresentedJourney>>({});

  /**
   * One feed per open job, kept so a customer watching this page sees
   * the workshop's own actions land -- a part being issued, their
   * decision being recorded -- without reloading.
   */
  private readonly feeds = new Map<string, JourneyFeed>();
  protected readonly state = signal<State>('loading');
  protected readonly error = signal<PresentedError | null>(null);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.api
      .currentService()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.items.set(items);
          this.state.set(items.length === 0 ? 'empty' : 'ready');
          for (const item of items) this.loadJourney(item.workOrderId);
        },
        error: (err: PresentedError) => {
          this.error.set(err);
          this.state.set(err.httpStatus === 403 ? 'forbidden' : 'error');
        },
      });
  }

  /**
   * Failure here is deliberately silent: the job row still says where the
   * car is in words, so a strip that could not load costs detail rather
   * than meaning, and an error banner over a working page would be worse.
   */
  private loadJourney(workOrderId: string): void {
    if (this.feeds.has(workOrderId)) return;

    // Mirrored into one map so the template can look a journey up by id.
    // A callback rather than an `effect()` per row: this runs inside a
    // subscribe callback, which is not an injection context.
    const feed = pollJourney(this.destroyRef, () => this.api.journey(workOrderId), (journey) =>
      this.journeys.update((all) => ({ ...all, [workOrderId]: journey })),
    );
    this.feeds.set(workOrderId, feed);
  }

  protected journeyFor(workOrderId: string): PresentedJourney | null {
    return this.journeys()[workOrderId] ?? null;
  }

  protected label(status: string): string {
    return STATUS_LABEL[status] ?? status.toLowerCase().replace(/_/g, ' ');
  }

  protected needsYou(status: string): boolean {
    return NEEDS_YOU.has(status);
  }

  protected when(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }
}
