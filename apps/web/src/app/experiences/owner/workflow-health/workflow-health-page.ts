import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SlicePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ErrorBanner } from '../../../ui/error-banner/error-banner';
import { ButtonDirective } from '../../../ui/button/button.directive';
import { BarList, type BarListItem } from '../../../ui/charts/bar-list/bar-list';
import { KpiCard } from '../../../ui/charts/kpi-card/kpi-card';
import type { IntegrityIssueSeverity } from './workflow-health.api';
import type { PresentedError } from '../../../runtime/http/error.interceptor';
import {
  WorkflowHealthApi,
  type BottlenecksReport,
  type IntegrityReport,
  type QualityIntelligenceReport,
  type BranchQualityContributor,
  type ServiceQualityContributor,
  type TechnicianQualityContributor,
  type DiagnosticSubject,
  type DiagnosticEvidenceLevel,
  type RootCauseAnalysisReport,
} from './workflow-health.api';

import { DrillDownDrawer } from '../../../domain/drill-down/drill-down-drawer';
import { DossierDrawer } from '../../../domain/dossier/dossier-drawer';

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
  imports: [RouterLink, SlicePipe, ErrorBanner, ButtonDirective, BarList, KpiCard, DrillDownDrawer, DossierDrawer],
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
  protected readonly quality = signal<QualityIntelligenceReport | null>(null);

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
  protected readonly ackStatus = signal<'ACKNOWLEDGED' | 'INVESTIGATING' | 'ESCALATED'>('ACKNOWLEDGED');
  protected readonly ackNote = signal<string>('');
  protected readonly ackSaving = signal<boolean>(false);
  protected readonly ackError = signal<string | null>(null);

  /** Universal Drill-Down and Dossier states */
  protected readonly activeDrillDownMetric = signal<string | null>(null);
  protected readonly activeDossierWorkOrderId = signal<string | null>(null);

  protected openDrillDown(metric: string): void {
    this.activeDrillDownMetric.set(metric);
  }

  protected closeDrillDown(): void {
    this.activeDrillDownMetric.set(null);
  }

  protected openDossier(woId: string): void {
    this.activeDossierWorkOrderId.set(woId);
  }

  protected closeDossier(): void {
    this.activeDossierWorkOrderId.set(null);
  }

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

  // Quality & Rework Intelligence computed properties
  protected readonly firstPassYieldDisplay = computed(() => {
    const v = this.quality()?.qc.firstPassYield;
    return v !== null && v !== undefined ? `${v.toFixed(1)}%` : '—';
  });
  protected readonly firstPassYieldSub = computed(() => {
    const q = this.quality()?.qc;
    if (!q || q.firstPassEvaluations === 0) return 'No evaluations';
    return `${q.firstPassPassed} / ${q.firstPassEvaluations} first attempts passed`;
  });

  protected readonly qcFailureRateDisplay = computed(() => {
    const v = this.quality()?.qc.qcFailureRate;
    return v !== null && v !== undefined ? `${v.toFixed(1)}%` : '—';
  });
  protected readonly qcFailureRateSub = computed(() => {
    const q = this.quality()?.qc;
    if (!q || q.qcEvaluationsCount === 0) return 'No evaluations';
    return `${q.qcFailures} failures / ${q.qcEvaluationsCount} total evaluations`;
  });

  protected readonly taskReworkRateDisplay = computed(() => {
    const v = this.quality()?.rework.taskReworkRate;
    return v !== null && v !== undefined ? `${v.toFixed(1)}%` : '—';
  });
  protected readonly taskReworkRateSub = computed(() => {
    const r = this.quality()?.rework;
    if (!r || r.completedTasks === 0) return 'No completed tasks';
    return `${r.tasksWithRework} / ${r.completedTasks} tasks reworked`;
  });

  protected readonly reopenedJobsDisplay = computed(
    () => `${this.quality()?.workOrders.reopenedWorkOrders ?? 0}`,
  );
  protected readonly repeatVisitsDisplay = computed(
    () => `${this.quality()?.vehicleRepeats.repeatVehicleVisitsWithin30Days ?? 0}`,
  );
  protected readonly repeatVisitsSub = computed(() => {
    const v = this.quality()?.vehicleRepeats;
    return `${v?.uniqueVehiclesWithRepeatVisitWithin30Days ?? 0} unique vehicle(s) · repeat visit, not warranty`;
  });
  protected readonly faultRecurrenceDisplay = computed(
    () => `${this.quality()?.vehicleRepeats.faultRecurrenceCount ?? 0}`,
  );

  protected readonly reworkLaborMinutesDisplay = computed(
    () => `${this.quality()?.costDrag.reworkLaborMinutes ?? 0} min`,
  );

  protected readonly qcFailureReasonItems = computed<BarListItem[]>(() =>
    (this.quality()?.qcFailureReasons ?? []).map((r) => ({
      label: r.reason,
      value: r.count,
      displayValue: `${r.count} (${r.percentage !== null && r.percentage !== undefined ? r.percentage + '%' : '—'})`,
    })),
  );

  protected readonly reworkReasonItems = computed<BarListItem[]>(() =>
    (this.quality()?.reworkReasons ?? []).map((r) => ({
      label: r.reason,
      value: r.count,
      displayValue: `${r.count} (${r.percentage !== null && r.percentage !== undefined ? r.percentage + '%' : '—'})`,
    })),
  );

  protected readonly branchContributors = computed<readonly BranchQualityContributor[]>(
    () => this.quality()?.contributors.byBranch ?? [],
  );

  protected readonly serviceContributors = computed<readonly ServiceQualityContributor[]>(
    () => this.quality()?.contributors.byService ?? [],
  );

  protected readonly technicianContributors = computed<readonly TechnicianQualityContributor[]>(
    () => this.quality()?.contributors.byTechnician ?? [],
  );

  protected readonly qualityIntegrity = computed(
    () => this.quality()?.integrity ?? null,
  );

  // Root-Cause Analysis Engine signals
  protected readonly rootCause = signal<RootCauseAnalysisReport | null>(null);
  protected readonly rootCauseSubject = signal<DiagnosticSubject>('WORK_ORDER_DELAY');
  protected readonly rootCauseLoading = signal<boolean>(false);

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
                this.api
                  .quality()
                  .pipe(takeUntilDestroyed(this.destroyRef))
                  .subscribe({
                    next: (q) => {
                      this.quality.set(q);
                      this.loadRootCause();
                      this.state.set('ready');
                    },
                    error: onError,
                  });
              },
              error: onError,
            });
        },
        error: onError,
      });
  }

  protected setRootCauseSubject(sub: DiagnosticSubject): void {
    this.rootCauseSubject.set(sub);
    this.loadRootCause();
  }

  protected loadRootCause(): void {
    this.rootCauseLoading.set(true);
    this.api
      .rootCause({ subject: this.rootCauseSubject() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (report) => {
          this.rootCause.set(report);
          this.rootCauseLoading.set(false);
        },
        error: () => {
          this.rootCauseLoading.set(false);
        },
      });
  }

  protected evidenceBadgeClass(level: DiagnosticEvidenceLevel | undefined): string {
    switch (level) {
      case 'OBSERVED_FACT':
        return 'badge--fact';
      case 'RULE_BASED_CONTRIBUTOR':
        return 'badge--contributor';
      case 'STRONG_ASSOCIATION':
        return 'badge--association';
      case 'CAUSAL_LINK':
        return 'badge--causal';
      case 'INSUFFICIENT_EVIDENCE':
        return 'badge--insufficient';
      default:
        return 'badge--fact';
    }
  }

  protected evidenceBadgeLabel(level: DiagnosticEvidenceLevel | undefined): string {
    switch (level) {
      case 'OBSERVED_FACT':
        return 'Observed Fact';
      case 'RULE_BASED_CONTRIBUTOR':
        return 'Evidence-Supported Contributor';
      case 'STRONG_ASSOCIATION':
        return 'Statistical Association';
      case 'CAUSAL_LINK':
        return 'Authoritative Causal Link';
      case 'INSUFFICIENT_EVIDENCE':
        return 'Insufficient Evidence';
      default:
        return level ?? '';
    }
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
