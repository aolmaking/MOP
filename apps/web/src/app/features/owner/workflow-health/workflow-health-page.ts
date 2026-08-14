import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ErrorBanner } from '../../../shared/error-banner/error-banner';
import { ButtonDirective } from '../../../shared/button/button.directive';
import { BarList, type BarListItem } from '../../../shared/reports/bar-list/bar-list';
import { KpiCard } from '../../../shared/reports/kpi-card/kpi-card';
import type { PresentedError } from '../../../core/api/error.interceptor';
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

  protected readonly criticalCount = computed(() => this.sortedIssues().filter((i) => i.severity === 'CRITICAL').length);
  protected readonly warningCount = computed(() => this.sortedIssues().filter((i) => i.severity === 'WARNING').length);

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
}
