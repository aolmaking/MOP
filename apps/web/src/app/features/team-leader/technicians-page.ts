import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ErrorBanner } from '../../shared/error-banner/error-banner';
import { ButtonDirective } from '../../shared/button/button.directive';
import type { PresentedError } from '../../core/api/error.interceptor';
import { TeamLeaderApi, type TechnicianDetail, type TechnicianRow } from './team-leader.api';
import { TechnicianDrawer } from './technician-drawer';

type State = 'loading' | 'ready' | 'empty' | 'forbidden' | 'error';

/**
 * Technicians View -- the managed roster, with a details drawer that
 * carries the internal supervision note (PHASE_10.md section 3).
 *
 * The list itself never shows a technician's own blockers or task
 * detail beyond what fits a row; that lives in the drawer, opened on
 * demand, matching the platform's own Workshops-list/drawer split.
 */
@Component({
  selector: 'app-technicians-page',
  imports: [ErrorBanner, ButtonDirective, TechnicianDrawer],
  templateUrl: './technicians-page.html',
  styleUrl: './technicians-page.css',
})
export class TechniciansPage {
  private readonly api = inject(TeamLeaderApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly rows = signal<readonly TechnicianRow[]>([]);
  protected readonly state = signal<State>('loading');
  protected readonly error = signal<PresentedError | null>(null);

  protected readonly selected = signal<TechnicianDetail | null>(null);
  protected readonly drawerLoading = signal(false);
  protected readonly noteSubmitting = signal(false);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.api
      .technicians()
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

  protected open(id: string): void {
    this.drawerLoading.set(true);
    this.api
      .technician(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detail) => {
          this.selected.set(detail);
          this.drawerLoading.set(false);
        },
        error: () => this.drawerLoading.set(false),
      });
  }

  protected close(): void {
    this.selected.set(null);
  }

  protected addNote(event: { body: string; escalate: boolean }): void {
    const current = this.selected();
    if (!current) return;

    this.noteSubmitting.set(true);
    this.api
      .addNote(current.staffUserId, event.body, event.escalate)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.noteSubmitting.set(false);
          // Reload so the drawer shows the note it just wrote, not a
          // stale snapshot from before the write.
          this.open(current.staffUserId);
        },
        error: () => this.noteSubmitting.set(false),
      });
  }
}
