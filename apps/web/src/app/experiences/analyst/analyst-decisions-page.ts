import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ErrorBanner } from '../../ui/error-banner/error-banner';
import { ButtonDirective } from '../../ui/button/button.directive';
import { BarList, type BarListItem } from '../../ui/charts/bar-list/bar-list';
import { KpiCard } from '../../ui/charts/kpi-card/kpi-card';
import type { PresentedError } from '../../runtime/http/error.interceptor';
import { AnalystApi, type DecisionsAnalyticsReport } from './analyst.api';
import { SavedViewAction } from './saved-view-action';
import { ExportAction } from './export-action';

type State = 'loading' | 'ready' | 'forbidden' | 'error';

/**
 * Data Analyst -- Customer Decision -> Execution -> Revenue Intelligence
 * Traces customer repairs from recommendation to execution.
 * Respects strict privacy (no customer PII) and financial integrity.
 */
@Component({
  selector: 'app-analyst-decisions-page',
  imports: [ErrorBanner, ButtonDirective, BarList, KpiCard, SavedViewAction, ExportAction],
  templateUrl: './analyst-decisions-page.html',
  styleUrl: './analyst-decisions-page.css',
})
export class AnalystDecisionsPage {
  private readonly api = inject(AnalystApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly state = signal<State>('loading');
  protected readonly error = signal<PresentedError | null>(null);
  protected readonly data = signal<DecisionsAnalyticsReport | null>(null);

  protected readonly money = computed(() => new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }));

  protected fmtMoney(value: number): string {
    const currency = this.data()?.value?.currency ?? 'USD';
    return `${this.money().format(value)} ${currency}`;
  }

  protected readonly importanceItems = computed<BarListItem[]>(() =>
    (this.data()?.byImportance ?? []).map((r) => ({
      label: r.importance,
      value: r.approved,
      displayValue: `${r.approved} approved (${r.performed} performed) / ${r.rejected} rejected`,
    })),
  );

  protected readonly funnelItems = computed<BarListItem[]>(() => {
    const d = this.data();
    if (!d) return [];
    return [
      { label: '1. Recommended', value: d.funnel.recommendationsCreated, displayValue: d.funnel.recommendationsCreated.toString() },
      { label: '2. Sent to Customer', value: d.funnel.sent, displayValue: d.funnel.sent.toString() },
      { label: '3. Opened by Customer', value: d.funnel.viewed, displayValue: d.funnel.viewed.toString() },
      { label: '4. Responded', value: d.funnel.responded, displayValue: d.funnel.responded.toString() },
      { label: '5. Approved', value: d.funnel.approved, displayValue: `${d.funnel.approved} (${this.fmtMoney(d.value.approvedValue)})` },
      { label: '6. Planned into Work', value: d.funnel.planned, displayValue: `${d.funnel.planned} (${this.fmtMoney(d.value.plannedValue)})` },
      { label: '7. Execution Started', value: d.funnel.started, displayValue: d.funnel.started.toString() },
      { label: '8. Fully Performed', value: d.funnel.performed, displayValue: `${d.funnel.performed} (${this.fmtMoney(d.value.performedValue)})` },
    ];
  });

  protected readonly outcomeItems = computed<BarListItem[]>(() =>
    (this.data()?.outcomes ?? [])
      .filter((o) => o.count > 0)
      .map((o) => ({
        label: o.label,
        value: o.count,
        displayValue: `${o.count} (${this.fmtMoney(o.totalValue)})`,
      })),
  );

  protected readonly unperformedItems = computed<BarListItem[]>(() => {
    const b = this.data()?.unperformedBreakdown;
    if (!b) return [];
    return [
      { label: 'No work planned', value: b.noWorkLinked.value, displayValue: `${b.noWorkLinked.count} items (${this.fmtMoney(b.noWorkLinked.value)})` },
      { label: 'Planned, not started', value: b.plannedNotStarted.value, displayValue: `${b.plannedNotStarted.count} items (${this.fmtMoney(b.plannedNotStarted.value)})` },
      { label: 'Work in progress', value: b.inProgress.value, displayValue: `${b.inProgress.count} items (${this.fmtMoney(b.inProgress.value)})` },
      { label: 'Partially performed', value: b.partiallyPerformed.value, displayValue: `${b.partiallyPerformed.count} items (${this.fmtMoney(b.partiallyPerformed.value)})` },
      { label: 'Abandoned on job closure', value: b.abandonedTerminal.value, displayValue: `${b.abandonedTerminal.count} items (${this.fmtMoney(b.abandonedTerminal.value)})` },
    ].filter((item) => item.value > 0);
  });

  protected readonly viewConfiguration = computed(() => ({ range: this.data()?.range ?? null }));

  constructor() {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.api
      .decisions()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (r) => {
          this.data.set(r);
          this.state.set('ready');
        },
        error: (err: PresentedError) => {
          this.state.set(err.httpStatus === 403 ? 'forbidden' : 'error');
          this.error.set(err);
        },
      });
  }
}
