import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ErrorBanner } from '../../ui/error-banner/error-banner';
import { ButtonDirective } from '../../ui/button/button.directive';
import type { PresentedError } from '../../runtime/http/error.interceptor';
import { TeamLeaderApi, type TechnicianPerformanceRow } from './team-leader.api';

type State = 'loading' | 'ready' | 'empty' | 'forbidden' | 'error';

/**
 * Technician Performance Reports -- Team Leader's own, narrower,
 * `managedTechnicianIds`-scoped view (PHASE_10.md section 1). No finance
 * figures, no inventory value, no customer data, no company-wide
 * numbers -- `TechnicianPerformanceRow` has none of those fields to
 * begin with, so nothing here needs hiding. The company-wide version is
 * Phase 12 (Data Analyst), a different report reading a different table.
 */
@Component({
  selector: 'app-team-reports',
  imports: [ErrorBanner, ButtonDirective],
  templateUrl: './team-reports.html',
  styleUrl: './team-reports.css',
})
export class TeamReports {
  private readonly api = inject(TeamLeaderApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly rows = signal<readonly TechnicianPerformanceRow[]>([]);
  protected readonly state = signal<State>('loading');
  protected readonly error = signal<PresentedError | null>(null);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.api
      .reports()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          this.rows.set(rows);
          this.state.set(rows.length === 0 ? 'empty' : 'ready');
        },
        error: (err: PresentedError) => {
          this.error.set(err);
          this.state.set(err.httpStatus === 403 ? 'forbidden' : 'error');
        },
      });
  }
}
