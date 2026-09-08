import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Identifier } from '../../ui/identifier/identifier';
import type { PresentedError } from '../../runtime/http/error.interceptor';
import { TechnicianApi, type TechnicianJob } from './technician.api';

type State = 'loading' | 'idle' | 'forbidden' | 'error';

/**
 * Technician Station -- Simplified Vehicle Queue.
 * Displays all assigned and workshop vehicles with clear, color-coded state badges.
 */
@Component({
  selector: 'app-tech-now',
  imports: [RouterLink, Identifier],
  templateUrl: './tech-now.html',
  styleUrl: './tech-now.css',
})
export class TechNow {
  private readonly api = inject(TechnicianApi);

  protected readonly queue = signal<readonly TechnicianJob[]>([]);
  protected readonly filter = signal<string>('ALL');
  protected readonly state = signal<State>('loading');

  protected readonly activeCount = computed(() => this.queue().filter((j) => j.active || j.status === 'IN_PROGRESS').length);
  protected readonly blockedCount = computed(() => this.queue().filter((j) => j.blocked || j.status === 'BLOCKED').length);
  protected readonly inspectionCount = computed(
    () => this.queue().filter((j) => j.status === 'UNDER_INSPECTION' || (!j.inspectionDeclined && j.status === 'REGISTERED')).length,
  );

  protected readonly filteredQueue = computed(() => {
    const q = this.queue();
    const f = this.filter();
    if (f === 'ALL') return q;
    if (f === 'BLOCKED') return q.filter((j) => j.blocked || j.status === 'BLOCKED');
    if (f === 'READY') return q.filter((j) => ['READY_TO_START', 'APPROVED_FOR_WORK'].includes(j.status));
    if (f === 'INSPECTION') return q.filter((j) => j.status === 'UNDER_INSPECTION' || (!j.inspectionDeclined && j.status === 'REGISTERED'));
    if (f === 'IN_PROGRESS') return q.filter((j) => j.status === 'IN_PROGRESS' || j.active);
    return q;
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.api.myWork().subscribe({
      next: ({ jobs }) => {
        this.queue.set(jobs);
        this.state.set('idle');
      },
      error: (err: PresentedError) => this.state.set(err.httpStatus === 403 ? 'forbidden' : 'error'),
    });
  }

  protected statusLabel(status: string, blocked?: boolean): string {
    if (blocked || status === 'BLOCKED') return 'Blocked';
    switch (status) {
      case 'REGISTERED':
        return 'Ready to Start';
      case 'UNDER_INSPECTION':
        return 'Under Inspection';
      case 'APPROVED_FOR_WORK':
        return 'Approved for Work';
      case 'IN_PROGRESS':
        return 'In Progress';
      case 'WAITING_PARTS':
      case 'WAITING_ON_PARTS':
        return 'Waiting on Parts';
      case 'AWAITING_CUSTOMER_APPROVAL':
        return 'Waiting on Approval';
      case 'READY_FOR_TEAM_REVIEW':
        return 'Ready for Review';
      default:
        return status.toLowerCase().replace(/_/g, ' ');
    }
  }

  protected statusColorClass(status: string, blocked?: boolean): string {
    if (blocked || status === 'BLOCKED') return 'state-badge--blocked';
    switch (status) {
      case 'UNDER_INSPECTION':
        return 'state-badge--inspection';
      case 'REGISTERED':
      case 'READY_TO_START':
      case 'APPROVED_FOR_WORK':
        return 'state-badge--ready';
      case 'IN_PROGRESS':
        return 'state-badge--progress';
      case 'WAITING_PARTS':
      case 'WAITING_ON_PARTS':
        return 'state-badge--waiting';
      case 'READY_FOR_TEAM_REVIEW':
        return 'state-badge--review';
      case 'AWAITING_CUSTOMER_APPROVAL':
        return 'state-badge--approval';
      default:
        return 'state-badge--default';
    }
  }

  protected since(hours: number): string {
    if (hours < 1) return 'just now';
    if (hours < 24) return `${Math.floor(hours)}h`;
    const days = Math.floor(hours / 24);
    return days === 1 ? '1 day' : `${days} days`;
  }
}
