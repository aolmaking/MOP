import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonDirective } from '../../../shared/button/button.directive';
import { ErrorBanner } from '../../../shared/error-banner/error-banner';
import { Identifier } from '../../../shared/identifier/identifier';
import type { PresentedError } from '../../../core/api/error.interceptor';
import { AttentionApi, type AttentionItem, type AttentionKind } from './attention.api';

type PageState = 'loading' | 'ready' | 'empty' | 'error' | 'forbidden';

interface WatchTile {
  readonly kind: AttentionKind;
  readonly label: string;
  readonly count: number;
}

/** Plain words for each kind. Never shown as a raw enum. */
const KIND_LABELS: Readonly<Record<AttentionKind, string>> = {
  CRITICAL_REJECTION_UNACKNOWLEDGED: 'Critical rejections',
  TECHNICIAN_BLOCKED: 'Blocked technicians',
  CUSTOMER_APPROVAL_WAITING: 'Waiting on customers',
  SLA_OVERRUN: 'Past promised time',
  READY_UNPAID: 'Ready but unpaid',
  WAITING_PARTS: 'Waiting on parts',
  REWORK_REQUIRED: 'Needs rework',
};

/**
 * The action verb offered on each row. Phrased as what the manager does
 * next, not as what the system calls it.
 */
const ACTION_LABELS: Readonly<Record<string, string>> = {
  CHASE_CUSTOMER: 'Send reminder',
  ESCALATE_CRITICAL: 'Escalate',
  RESOLVE_BLOCKER: 'View blocker',
  CHECK_PARTS: 'Check parts',
  TAKE_PAYMENT: 'Take payment',
  REASSIGN: 'Reassign',
  REVIEW_OVERRUN: 'Review job',
};

/**
 * The branch manager's landing page.
 *
 * Answers "what needs me?" before anything else, because every return to
 * this screen is a cold start -- they are interrupted constantly, and
 * re-orientation has to take under two seconds.
 *
 * The band order (queue, then today, then counts) is the page's whole
 * argument and is reasoned through in docs/phases/PHASE_5.md section 2.
 */
@Component({
  selector: 'app-attention-center',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ButtonDirective, ErrorBanner, Identifier],
  templateUrl: './attention-center.html',
  styleUrl: './attention-center.css',
})
export class AttentionCenter {
  private readonly api = inject(AttentionApi);

  readonly items = signal<readonly AttentionItem[]>([]);
  readonly counts = signal<Readonly<Record<string, number>>>({});
  readonly error = signal<PresentedError | null>(null);

  private readonly loading = signal(true);
  private readonly failure = signal<'none' | 'error' | 'forbidden'>('none');

  /**
   * Five distinct states. Empty and forbidden are deliberately NOT the
   * same screen as error: nothing is broken in either, and offering a
   * "try again" on them would be a lie.
   */
  readonly state = computed<PageState>(() => {
    if (this.loading()) return 'loading';
    if (this.failure() === 'forbidden') return 'forbidden';
    if (this.failure() === 'error') return 'error';
    return this.items().length === 0 ? 'empty' : 'ready';
  });

  readonly subtitle = computed(() => {
    const total = this.items().length;
    if (total === 0) return '';
    return total === 1 ? '1 job needs you' : `${total} jobs need you`;
  });

  readonly watchList = computed<WatchTile[]>(() =>
    (Object.keys(KIND_LABELS) as AttentionKind[])
      .map((kind) => ({ kind, label: KIND_LABELS[kind], count: this.counts()[kind] ?? 0 }))
      // A tile showing zero is noise -- it invites a click that leads
      // nowhere. Only what actually exists is shown.
      .filter((tile) => tile.count > 0),
  );

  /**
   * Orientation, not action. Derived from what is already loaded rather
   * than fetched separately, so the two bands can never disagree.
   */
  readonly todayFlow = computed(() => {
    const items = this.items();
    return [
      { label: 'Needs attention', value: items.length },
      { label: 'Waiting on customers', value: this.counts()['CUSTOMER_APPROVAL_WAITING'] ?? 0 },
      { label: 'Blocked', value: this.counts()['TECHNICIAN_BLOCKED'] ?? 0 },
      { label: 'Ready to collect', value: this.counts()['READY_UNPAID'] ?? 0 },
    ];
  });

  constructor() {
    this.load();
  }

  reload(): void {
    this.load();
  }

  /** Tier 1 only. Everything else stays neutral so the ranking stays visible. */
  isCritical(item: AttentionItem): boolean {
    return item.rank.tier <= 1;
  }

  actionLabel(item: AttentionItem): string {
    return ACTION_LABELS[item.primaryAction] ?? 'Open';
  }

  act(item: AttentionItem): void {
    // Wired to real actions in 5.E, where the approvals and delivery
    // surfaces exist. Left as a no-op rather than a fake success toast:
    // a button that pretends to work is worse than one that does nothing.
    void item;
  }

  filterBy(kind: AttentionKind): void {
    void kind;
  }

  private load(): void {
    this.loading.set(true);
    this.failure.set('none');

    this.api.attention().subscribe({
      next: (response) => {
        this.items.set(response.items);
        this.counts.set(response.counts);
        this.loading.set(false);
      },
      error: (error: PresentedError) => {
        // A 403 is not a system failure, so it gets its own state with no
        // retry control — retrying will never help, and offering it would
        // be a lie.
        this.failure.set(error.httpStatus === 403 ? 'forbidden' : 'error');
        this.error.set(error);
        this.loading.set(false);
      },
    });
  }
}
