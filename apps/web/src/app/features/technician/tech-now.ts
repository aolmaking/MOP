import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Identifier } from '../../shared/identifier/identifier';
import type { PresentedError } from '../../core/api/error.interceptor';
import { TechnicianApi, type TechnicianJob } from './technician.api';

type State = 'loading' | 'active' | 'idle' | 'forbidden' | 'error';

/**
 * "What am I doing right now?"
 *
 * The put-down-pick-up page. It must answer in one glance with no tap,
 * which is why it opens ON the active job rather than on a list
 * containing it -- the technician has one car in front of them, and
 * making this a list would cost a tap on the page that must not cost one.
 *
 * If nothing is started, it says so and points at My Work. That is the
 * only branch this page has.
 */
@Component({
  selector: 'app-tech-now',
  imports: [RouterLink, Identifier],
  templateUrl: './tech-now.html',
  styleUrl: './tech-now.css',
})
export class TechNow {
  private readonly api = inject(TechnicianApi);
  private readonly router = inject(Router);

  protected readonly job = signal<TechnicianJob | null>(null);
  protected readonly state = signal<State>('loading');

  constructor() {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.api.active().subscribe({
      next: ({ job }) => {
        this.job.set(job);
        this.state.set(job ? 'active' : 'idle');
      },
      error: (err: PresentedError) => this.state.set(err.httpStatus === 403 ? 'forbidden' : 'error'),
    });
  }

  /** The whole card is the target, so there is nothing to aim at. */
  protected openCard(): void {
    const job = this.job();
    if (job) void this.router.navigate(['/tech/card', job.workOrderId]);
  }

  protected since(hours: number): string {
    if (hours < 1) return 'just now';
    if (hours < 24) return `${Math.floor(hours)}h`;
    const days = Math.floor(hours / 24);
    return days === 1 ? '1 day' : `${days} days`;
  }
}
