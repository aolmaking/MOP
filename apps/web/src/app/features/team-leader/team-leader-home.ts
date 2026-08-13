import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ErrorBanner } from '../../shared/error-banner/error-banner';
import { ButtonDirective } from '../../shared/button/button.directive';
import type { PresentedError } from '../../core/api/error.interceptor';
import { TeamLeaderApi, type TeamLeaderHome as HomeData } from './team-leader.api';

type State = 'loading' | 'ready' | 'no-team' | 'forbidden' | 'error';

interface StatCard {
  readonly key: string;
  readonly label: string;
  readonly meaning: string;
  readonly count: number;
  readonly link: string | null;
  readonly weight: 'urgent' | 'active' | 'quiet' | 'clear';
}

/**
 * Team Leader Home -- same triage spirit as Attention Center/Inventory
 * Home, scoped to the managed roster (PHASE_10.md section 3).
 *
 * Rework/QC issues is visible, never actionable: the card links to the
 * work-orders view rather than anywhere a pass/reject decision could be
 * made, because this role never gets that permission (section 2's rule).
 *
 * Zero managed technicians is its own state, not the same empty-of-work
 * state -- "you have no team" and "your team has nothing outstanding"
 * are different facts and read as different problems.
 */
@Component({
  selector: 'app-team-leader-home',
  imports: [RouterLink, ErrorBanner, ButtonDirective],
  templateUrl: './team-leader-home.html',
  styleUrl: './team-leader-home.css',
})
export class TeamLeaderHome {
  private readonly api = inject(TeamLeaderApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly data = signal<HomeData | null>(null);
  protected readonly state = signal<State>('loading');
  protected readonly error = signal<PresentedError | null>(null);

  protected readonly cards = computed<readonly StatCard[]>(() => {
    const d = this.data();
    if (!d) return [];
    return [
      {
        key: 'active',
        label: 'Active work',
        meaning: 'tasks your technicians are on right now',
        count: d.activeWork,
        link: '/team-leader/work-orders',
        weight: d.activeWork === 0 ? 'clear' : 'active',
      },
      {
        key: 'blocked',
        label: 'Blocked technicians',
        meaning: 'stuck on an open blocker',
        count: d.blockedTechnicians,
        link: '/team-leader/technicians',
        weight: d.blockedTechnicians === 0 ? 'clear' : 'urgent',
      },
      {
        key: 'parts',
        label: 'Waiting parts',
        meaning: 'a managed work order is blocked on a part',
        count: d.waitingParts,
        link: '/team-leader/work-orders',
        weight: d.waitingParts === 0 ? 'clear' : 'active',
      },
      {
        key: 'customer',
        label: 'Waiting customer',
        meaning: 'a managed work order is waiting on a customer decision',
        count: d.waitingCustomer,
        link: '/team-leader/work-orders',
        weight: d.waitingCustomer === 0 ? 'clear' : 'quiet',
      },
      {
        key: 'rework',
        label: 'Rework / QC issues',
        meaning: 'visible here, never decided from here',
        count: d.reworkIssues,
        link: '/team-leader/work-orders',
        weight: d.reworkIssues === 0 ? 'clear' : 'urgent',
      },
    ];
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
          this.state.set(data.managedCount === 0 ? 'no-team' : 'ready');
        },
        error: (err: PresentedError) => {
          this.error.set(err);
          this.state.set(err.httpStatus === 403 ? 'forbidden' : 'error');
        },
      });
  }

  protected when(iso: string): string {
    return new Date(iso).toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  protected label(value: string): string {
    return value.toLowerCase().replace(/[._]/g, ' ');
  }
}
