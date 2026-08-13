import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ErrorBanner } from '../../shared/error-banner/error-banner';
import { ButtonDirective } from '../../shared/button/button.directive';
import type { PresentedError } from '../../core/api/error.interceptor';
import { CustomerPortalApi, type CurrentServiceItem } from './customer-portal.api';

type State = 'loading' | 'ready' | 'empty' | 'forbidden' | 'error';

/**
 * Current Service -- every open work order for this customer, in plain
 * language. `docs/detailed-specs/customer.md` describes this as a full
 * lifecycle strip, but `CustomerPortalService.currentService()` (Phase
 * 11) exposes only status, not per-stage detail -- so this renders one
 * honest plain-language phrase per job rather than a strip implying a
 * precision the API does not have. A real lifecycle strip is future
 * work against the same page, not something to fake here.
 */
const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Being set up',
  REGISTERED: 'Checked in',
  UNDER_INSPECTION: 'Being inspected',
  AWAITING_CUSTOMER_APPROVAL: 'Waiting for your decision',
  APPROVED_FOR_WORK: 'Approved, work starting',
  IN_PROGRESS: 'Work in progress',
  WAITING_PARTS: 'Waiting for parts',
  WAITING_CUSTOMER: 'Waiting to hear from you',
  BLOCKED: 'On hold',
  READY_FOR_TEAM_REVIEW: 'Being reviewed',
  READY_FOR_QC: 'Final checks',
  QC_FAILED: 'Being corrected',
  READY_FOR_DELIVERY: 'Ready for pickup',
  PAYMENT_PENDING: 'Ready — payment pending',
};

const NEEDS_YOU = new Set(['AWAITING_CUSTOMER_APPROVAL', 'WAITING_CUSTOMER']);

@Component({
  selector: 'app-current-service',
  imports: [ErrorBanner, ButtonDirective],
  templateUrl: './current-service.html',
  styleUrl: './current-service.css',
})
export class CurrentService {
  private readonly api = inject(CustomerPortalApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly items = signal<readonly CurrentServiceItem[]>([]);
  protected readonly state = signal<State>('loading');
  protected readonly error = signal<PresentedError | null>(null);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.state.set('loading');
    this.api
      .currentService()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.items.set(items);
          this.state.set(items.length === 0 ? 'empty' : 'ready');
        },
        error: (err: PresentedError) => {
          this.error.set(err);
          this.state.set(err.httpStatus === 403 ? 'forbidden' : 'error');
        },
      });
  }

  protected label(status: string): string {
    return STATUS_LABEL[status] ?? status.toLowerCase().replace(/_/g, ' ');
  }

  protected needsYou(status: string): boolean {
    return NEEDS_YOU.has(status);
  }

  protected when(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }
}
