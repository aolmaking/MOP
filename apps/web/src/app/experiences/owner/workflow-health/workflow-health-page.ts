import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ErrorBanner } from '../../../ui/error-banner/error-banner';
import { ButtonDirective } from '../../../ui/button/button.directive';
import { BarList, type BarListItem } from '../../../ui/charts/bar-list/bar-list';
import { KpiCard } from '../../../ui/charts/kpi-card/kpi-card';
import type { IntegrityIssueSeverity } from './workflow-health.api';
import type { PresentedError } from '../../../runtime/http/error.interceptor';
import { WorkflowHealthApi, type BottlenecksReport, type IntegrityReport } from './workflow-health.api';

type State = 'loading' | 'ready' | 'forbidden' | 'error';

const CAUSE_LABEL: Record<string, string> = {
  PEOPLE: 'People',
  INVENTORY: 'Inventory',
  APPROVAL: 'Approval',
  PAYMENT: 'Payment',
  QUALITY: 'Quality (QC)',
  OTHER: 'Other',
};

const SEVERITY_ORDER: Record<string, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };

/**
 * Workflow Health / Operations Integrity
 * (docs/detailed-specs/tenant-owner.md). Two facets of the same
 * question -- "is something wrong, and why" -- laid out so the Owner can
 * answer, in order: is the workshop healthy, where's the biggest
 * problem, why, who's affected, what to do next.
 */
@Component({
  selector: 'app-workflow-health-page',
  imports: [RouterLink, ErrorBanner, ButtonDirective, BarList, KpiCard],
  templateUrl: './workflow-health-page.html',
  styleUrl: './workflow-health-page.css',
})
export class WorkflowHealthPage {
  private readonly api = inject(WorkflowHealthApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly state = signal<State>('loading');
  protected readonly error = signal<PresentedError | null>(null);
  protected readonly issues = signal<IntegrityReport | null>(null);
  protected readonly bottlenecks = signal<BottlenecksReport | null>(null);

  protected readonly sortedIssues = computed(
    () =>
      this.issues()
        ?.issues.slice()
        .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]) ?? [],
  );

  // Read from `totals`, not from the visible list: filtering the list
  // must not make the headline count appear to drop.
  protected readonly criticalCount = computed(() => this.issues()?.totals.critical ?? 0);
  protected readonly warningCount = computed(() => this.issues()?.totals.warning ?? 0);
  protected readonly openCount = computed(() => this.issues()?.totals.open ?? 0);
  protected readonly handledCount = computed(() => this.issues()?.totals.handled ?? 0);
  protected readonly groups = computed(() => this.issues()?.groups ?? []);
  protected readonly scannedAt = computed(() => this.issues()?.scannedAt ?? null);

  /** Narrows the list only. Totals above are unaffected by design. */
  protected readonly severityFilter = signal<IntegrityIssueSeverity | null>(null);
  protected readonly typeFilter = signal<string | null>(null);
  protected readonly statusFilter = signal<'open' | 'handled' | null>(null);

  /** The issue whose acknowledgement form is open, if any. */
  protected readonly acknowledging = signal<string | null>(null);
  protected readonly ackNote = signal('');
  protected readonly ackStatus = signal<'ACKNOWLEDGED' | 'INVESTIGATING' | 'ESCALATED'>('INVESTIGATING');
  protected readonly ackError = signal<string | null>(null);
  protected readonly ackSaving = signal(false);

  protected readonly biggestProblem = computed(() => {
    const causes = this.bottlenecks()?.waitingCauseBreakdown ?? [];
    if (causes.length === 0) return null;
    const top = causes[0]!;
    return `${CAUSE_LABEL[top.cause] ?? top.cause} is the largest source of delay -- ${top.totalHours.toFixed(0)}h across ${top.workOrderCount} work order(s).`;
  });

  protected readonly causeItems = computed<BarListItem[]>(() =>
    (this.bottlenecks()?.waitingCauseBreakdown ?? []).map((row) => ({
      label: CAUSE_LABEL[row.cause] ?? row.cause,
      value: row.totalHours,
      displayValue: `${row.totalHours.toFixed(0)} h`,
    })),
  );

  protected readonly stageDwellItems = computed<BarListItem[]>(() =>
    (this.bottlenecks()?.stageDwell ?? []).map((row) => ({
      label: row.status,
      value: row.averageHours,
      displayValue: `${row.averageHours.toFixed(1)} h avg`,
    })),
  );

  protected readonly reworkItems = computed<BarListItem[]>(() =>
    (this.bottlenecks()?.reworkLoops ?? []).map((row) => ({
      label: row.status,
      value: row.workOrderCount,
      displayValue: `${row.workOrderCount} work order(s)`,
    })),
  );

  constructor() {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    const onError = (err: PresentedError) => {
      this.state.set(err.httpStatus === 403 ? 'forbidden' : 'error');
      this.error.set(err);
    };

    this.api
      .issues()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (report) => {
          this.issues.set(report);
          this.api
            .bottlenecks()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: (b) => {
                this.bottlenecks.set(b);
                this.state.set('ready');
              },
              error: onError,
            });
        },
        error: onError,
      });
  }

  protected severityClass(severity: string): string {
    return `severity--${severity.toLowerCase()}`;
  }

  protected setSeverity(value: IntegrityIssueSeverity | null): void {
    this.severityFilter.set(this.severityFilter() === value ? null : value);
    this.reloadIssues();
  }

  protected setType(value: string | null): void {
    this.typeFilter.set(this.typeFilter() === value ? null : value);
    this.reloadIssues();
  }

  protected setStatus(value: 'open' | 'handled' | null): void {
    this.statusFilter.set(this.statusFilter() === value ? null : value);
    this.reloadIssues();
  }

  protected clearFilters(): void {
    this.severityFilter.set(null);
    this.typeFilter.set(null);
    this.statusFilter.set(null);
    this.reloadIssues();
  }

  protected readonly hasFilters = computed(
    () => this.severityFilter() !== null || this.typeFilter() !== null || this.statusFilter() !== null,
  );

  private reloadIssues(): void {
    this.api
      .issuesFiltered({
        severity: this.severityFilter() ?? undefined,
        type: this.typeFilter() ?? undefined,
        status: this.statusFilter() ?? undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (report) => this.issues.set(report) });
  }

  protected startAcknowledge(issueId: string): void {
    this.acknowledging.set(issueId);
    this.ackNote.set('');
    this.ackStatus.set('INVESTIGATING');
    this.ackError.set(null);
  }

  protected cancelAcknowledge(): void {
    this.acknowledging.set(null);
    this.ackError.set(null);
  }

  protected submitAcknowledge(issueId: string): void {
    const note = this.ackNote().trim();
    // Mirrors the server rule rather than replacing it: an acknowledgement
    // with no reason cannot be told apart from nobody having looked.
    if (note.length < 3) {
      this.ackError.set('Say what you found or what you are doing about it.');
      return;
    }

    this.ackSaving.set(true);
    this.api
      .acknowledgeIssue(issueId, { status: this.ackStatus(), note })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.ackSaving.set(false);
          this.acknowledging.set(null);
          this.reloadIssues();
        },
        error: (err: PresentedError) => {
          this.ackSaving.set(false);
          this.ackError.set(err.message ?? 'That did not save.');
        },
      });
  }

  protected typeLabel(value: string): string {
    return value.toLowerCase().replace(/_/g, ' ');
  }

  protected statusLabel(value: string): string {
    return value.toLowerCase();
  }

  protected when(iso: string | null): string {
    return iso ? new Date(iso).toLocaleString() : '';
  }

}
