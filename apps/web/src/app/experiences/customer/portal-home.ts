import { Component, DestroyRef, inject, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { ErrorBanner } from '../../ui/error-banner/error-banner';
import { ButtonDirective } from '../../ui/button/button.directive';
import { WorkflowStrip, type PresentedJourney } from '../../domain/journey/workflow-strip';
import { pollJourney, type JourneyFeed } from '../../domain/journey/journey-poller';
import { DecisionAnswer, type SubmittedAnswer } from '../../domain/decisions/decision-answer';
import type { PresentedError } from '../../runtime/http/error.interceptor';
import {
  CustomerPortalApi,
  type PortalHome as HomeData,
  type CurrentServiceItem,
  type PendingDecision,
  type PortalAsset,
} from './customer-portal.api';

type State = 'loading' | 'ready' | 'forbidden' | 'error';

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Being set up',
  REGISTERED: 'Booked in — Intake queue',
  UNDER_INSPECTION: 'In-bay diagnostic & inspection',
  AWAITING_CUSTOMER_APPROVAL: 'Action Required: Waiting for your decision',
  APPROVED_FOR_WORK: 'Approved — Work starting',
  IN_PROGRESS: 'Active repair & part installation',
  WAITING_PARTS: 'Waiting for parts delivery',
  WAITING_CUSTOMER: 'Waiting to hear from you',
  BLOCKED: 'Temporarily on hold',
  READY_FOR_TEAM_REVIEW: 'Under quality review',
  READY_FOR_QC: 'Final testing & quality checks',
  QC_FAILED: 'Corrections in progress',
  READY_FOR_DELIVERY: 'Ready for collection / pickup',
  PAYMENT_PENDING: 'Ready — payment pending',
  CLOSED: 'Completed & Delivered',
  CANCELLED: 'Cancelled',
};

/**
 * Customer Portal Home -- The Core Lifecycle Operations Hub.
 *
 * Dedicated strictly to customer-facing transparency:
 *  1. Real-time Live Tracking of active vehicles with the 6-stage WorkflowStrip.
 *  2. Inline response to technician requisitions & decision approvals.
 *  3. Quick orientation metrics & verified workshop activity history.
 */
@Component({
  selector: 'app-portal-home',
  imports: [
    RouterLink,
    FormsModule,
    ErrorBanner,
    ButtonDirective,
    WorkflowStrip,
    DecisionAnswer,
  ],
  templateUrl: './portal-home.html',
  styleUrl: './portal-home.css',
})
export class PortalHome {
  private readonly api = inject(CustomerPortalApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly data = signal<HomeData | null>(null);
  protected readonly state = signal<State>('loading');
  protected readonly error = signal<PresentedError | null>(null);

  // Active services & Live Tracking state
  protected readonly activeJobs = signal<readonly CurrentServiceItem[]>([]);
  protected readonly selectedJobId = signal<string | null>(null);
  protected readonly journeys = signal<Record<string, PresentedJourney>>({});
  private readonly feeds = new Map<string, JourneyFeed>();

  // Decisions state
  protected readonly pendingDecisions = signal<readonly PendingDecision[]>([]);
  protected readonly submittingDecision = signal<string | null>(null);
  protected readonly decisionError = signal<Record<string, string>>({});
  protected readonly decisionSuccess = signal<string | null>(null);

  protected readonly myAssets = signal<readonly PortalAsset[]>([]);

  /**
   * Reporting a problem.
   *
   * `POST /customer-portal/service-requests` has existed on the server, with a
   * validated DTO and a client method on `CustomerPortalApi`, and nothing in
   * the product ever called it. A customer could watch a repair and pay for
   * one, but could not ask for one: the portal's whole reason to exist had no
   * front door. The spec for this button was written and the button never was,
   * which is why that test had been failing since the day it landed.
   */
  protected readonly reporting = signal(false);
  protected readonly reportAssetId = signal<string>('');
  protected readonly reportComplaint = signal<string>('');
  protected readonly reportSubmitting = signal(false);
  protected readonly reportError = signal<string | null>(null);
  protected readonly reportBooked = signal<string | null>(null);

  /**
   * The complaint is what the workshop has to act on, so an empty one is
   * refused here rather than sent for the server to reject. Three characters
   * is the server's own floor, not a number invented for this page.
   */
  protected readonly canSubmitReport = computed(
    () => this.reportComplaint().trim().length >= 3 && !this.reportSubmitting(),
  );

  protected openReport(): void {
    this.reporting.set(true);
    this.reportError.set(null);
    this.reportBooked.set(null);
    const assets = this.myAssets();
    // Pre-selected only when there is no choice to make. Picking one of several
    // on the customer's behalf is how the wrong car gets booked in.
    this.reportAssetId.set(assets.length === 1 ? assets[0].id : '');
  }

  protected closeReport(): void {
    this.reporting.set(false);
    this.reportComplaint.set('');
    this.reportError.set(null);
  }

  protected submitReport(): void {
    if (!this.canSubmitReport()) return;

    this.reportSubmitting.set(true);
    this.reportError.set(null);

    this.api
      .reportIssue({
        complaint: this.reportComplaint().trim(),
        ...(this.reportAssetId() ? { assetId: this.reportAssetId() } : {}),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.reportSubmitting.set(false);
          this.reporting.set(false);
          this.reportComplaint.set('');
          // Confirmed on this page with the job it created, rather than routed
          // somewhere else: the customer asked for something and is owed a
          // plain answer that it was received.
          this.reportBooked.set(result.workOrderId);
          this.load();
        },
        error: (err: PresentedError) => {
          this.reportSubmitting.set(false);
          this.reportError.set(err.message ?? 'That could not be sent. Please try again.');
        },
      });
  }

  protected readonly currentJob = computed(() => {
    const jobs = this.activeJobs();
    const selected = this.selectedJobId();
    if (selected) {
      const match = jobs.find((j) => j.workOrderId === selected);
      if (match) return match;
    }
    return jobs.length > 0 ? jobs[0] : null;
  });

  protected readonly currentJourney = computed(() => {
    const job = this.currentJob();
    return job ? this.journeys()[job.workOrderId] ?? null : null;
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

    // Load active jobs for live stage tracking
    if (typeof this.api.currentService === 'function') {
      this.api
        .currentService()
        .pipe(
          takeUntilDestroyed(this.destroyRef),
          catchError(() => of([])),
        )
        .subscribe((jobs) => {
          this.activeJobs.set(jobs);
          if (jobs.length > 0 && !this.selectedJobId()) {
            this.selectedJobId.set(jobs[0].workOrderId);
          }
          for (const job of jobs) {
            this.initJourneyFeed(job.workOrderId);
          }
        });
    }

    // Load pending decisions for inline approvals
    if (typeof this.api.pendingDecisions === 'function') {
      this.api
        .pendingDecisions()
        .pipe(
          takeUntilDestroyed(this.destroyRef),
          catchError(() => of([])),
        )
        .subscribe((decisions) => {
          this.pendingDecisions.set(decisions);
        });
    }

    // Load assets
    if (typeof this.api.assets === 'function') {
      this.api
        .assets()
        .pipe(
          takeUntilDestroyed(this.destroyRef),
          catchError(() => of([])),
        )
        .subscribe((assets) => {
          this.myAssets.set(assets);
        });
    }
  }

  private initJourneyFeed(workOrderId: string): void {
    if (this.feeds.has(workOrderId) || typeof this.api.journey !== 'function') return;
    const feed = pollJourney(
      this.destroyRef,
      () => this.api.journey(workOrderId),
      (journey) => this.journeys.update((all) => ({ ...all, [workOrderId]: journey })),
    );
    this.feeds.set(workOrderId, feed);
  }

  protected selectJob(workOrderId: string): void {
    this.selectedJobId.set(workOrderId);
    this.initJourneyFeed(workOrderId);
  }

  protected labelForStatus(status: string): string {
    return STATUS_LABEL[status] ?? status.toLowerCase().replace(/_/g, ' ');
  }

  protected sendDecisionAnswer(requestId: string, answers: readonly SubmittedAnswer[]): void {
    this.submittingDecision.set(requestId);
    this.decisionError.update((curr) => {
      const next = { ...curr };
      delete next[requestId];
      return next;
    });

    this.api
      .respondToDecision(requestId, answers)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.submittingDecision.set(null);
          this.decisionSuccess.set('Your decision was submitted to the technician.');
          setTimeout(() => this.decisionSuccess.set(null), 6000);
          this.load();
        },
        error: (err: PresentedError) => {
          this.submittingDecision.set(null);
          this.decisionError.update((curr) => ({
            ...curr,
            [requestId]: err.message ?? 'Failed to submit response. Please try again.',
          }));
        },
      });
  }

  protected when(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }
}
