import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Identifier } from '../../ui/identifier/identifier';
import type { PresentedError } from '../../runtime/http/error.interceptor';
import { TechnicianApi, type TechnicianJob } from './technician.api';

type State = 'loading' | 'ready' | 'empty' | 'forbidden' | 'error';

/**
 * "What else is mine today?"
 *
 * Used a handful of times a day rather than continuously, so it is a
 * plain list -- no filters, no search, no sort control. A technician with
 * more jobs than fits on one screen has a scheduling problem that a
 * filter would only hide.
 */
@Component({
  selector: 'app-tech-my-work',
  imports: [RouterLink, Identifier],
  templateUrl: './tech-my-work.html',
  styleUrl: './tech-my-work.css',
})
export class TechMyWork {
  private readonly api = inject(TechnicianApi);

  protected readonly jobs = signal<readonly TechnicianJob[]>([]);
  protected readonly state = signal<State>('loading');

  constructor() {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.api.myWork().subscribe({
      next: ({ jobs }) => {
        this.jobs.set(jobs);
        this.state.set(jobs.length === 0 ? 'empty' : 'ready');
      },
      error: (err: PresentedError) => this.state.set(err.httpStatus === 403 ? 'forbidden' : 'error'),
    });
  }

  protected since(hours: number): string {
    if (hours < 1) return 'just now';
    if (hours < 24) return `${Math.floor(hours)}h`;
    const days = Math.floor(hours / 24);
    return days === 1 ? '1 day' : `${days} days`;
  }

  protected statusLabel(status: string): string {
    return status.toLowerCase().replace(/_/g, ' ');
  }
}
