import { Component, DestroyRef, computed, effect, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Identifier } from '../../../ui/identifier/identifier';
import { ButtonDirective } from '../../../ui/button/button.directive';
import { DismissOnEscapeDirective } from '../../../ui/dismiss-on-escape/dismiss-on-escape.directive';
import { ErrorBanner } from '../../../ui/error-banner/error-banner';
import type { PresentedError } from '../../../runtime/http/error.interceptor';
import {
  OwnerHistoryApi,
  type HistoryRecommendation,
  type HistoryVisit,
  type OwnerHistoryRecord,
  type RecommendationOutcome,
} from './history.api';

type State = 'loading' | 'ready' | 'error';

/**
 * Which outcomes read as good news, as a warning, or as a plain fact.
 *
 * A map rather than a rule derived from the enum's name: "declined" is
 * the customer's own decision and not a failure of the workshop, so it
 * is neutral, while "approved and never done" is the one an owner has to
 * see. Getting that wrong would either cry wolf on every closed job or
 * hide the only row that matters.
 */
const OUTCOME_TONE: Readonly<Record<RecommendationOutcome, 'good' | 'warn' | 'plain'>> = {
  PERFORMED: 'good',
  PARTIALLY_PERFORMED: 'warn',
  NOT_PERFORMED: 'warn',
  APPROVED_NO_WORK_LINKED: 'warn',
  APPROVED_PLANNED: 'plain',
  APPROVED_IN_PROGRESS: 'plain',
  AWAITING_CUSTOMER: 'plain',
  DECLINED: 'plain',
  EXPIRED: 'plain',
  CANCELLED: 'plain',
};

/**
 * One customer and one vehicle, and everything that ever happened
 * between them.
 *
 * A drawer rather than a route, for the same reason the work-order
 * dossier is one: this is opened from a row an owner is working down, and
 * navigating away loses their place in the list.
 *
 * Every visit renders the same nine bands in the same order, so reading
 * the fourth visit takes no new learning. Bands with nothing in them say
 * so rather than disappearing -- "no inspection was recorded" is a fact
 * about the visit, and a silently missing band reads as a rendering bug.
 */
@Component({
  selector: 'app-history-record-drawer',
  imports: [Identifier, ButtonDirective, DismissOnEscapeDirective, ErrorBanner],
  templateUrl: './history-record-drawer.html',
  styleUrl: './history-record-drawer.css',
})
export class HistoryRecordDrawer {
  private readonly api = inject(OwnerHistoryApi);
  private readonly destroyRef = inject(DestroyRef);

  readonly customerId = input.required<string>();
  readonly assetId = input.required<string>();
  readonly closed = output<void>();

  protected readonly state = signal<State>('loading');
  protected readonly record = signal<OwnerHistoryRecord | null>(null);
  protected readonly error = signal<PresentedError | null>(null);

  /** Which visits are expanded. The most recent opens itself; the rest are a click. */
  protected readonly openVisits = signal<ReadonlySet<string>>(new Set());
  /** Which recommendations have their evidence showing. */
  protected readonly openEvidence = signal<ReadonlySet<string>>(new Set());

  protected readonly identifier = computed(() => {
    const asset = this.record()?.asset;
    return asset ? (asset.plateNumber ?? asset.serialNumber ?? asset.vin) : null;
  });

  constructor() {
    effect(() => {
      const customerId = this.customerId();
      const assetId = this.assetId();
      if (customerId && assetId) this.load(customerId, assetId);
    });
  }

  protected load(customerId = this.customerId(), assetId = this.assetId()): void {
    this.state.set('loading');
    this.api
      .record(customerId, assetId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (record) => {
          this.record.set(record);
          // Newest first from the server, so the first entry is the
          // visit somebody opening this almost always wants.
          this.openVisits.set(new Set(record.visits.slice(0, 1).map((visit) => visit.workOrderId)));
          this.openEvidence.set(new Set());
          this.state.set('ready');
        },
        error: (err: PresentedError) => {
          this.error.set(err);
          this.state.set('error');
        },
      });
  }

  protected toggleVisit(visit: HistoryVisit): void {
    this.openVisits.update((current) => toggled(current, visit.workOrderId));
  }

  protected isVisitOpen(visit: HistoryVisit): boolean {
    return this.openVisits().has(visit.workOrderId);
  }

  protected toggleEvidence(recommendation: HistoryRecommendation): void {
    this.openEvidence.update((current) => toggled(current, recommendation.id));
  }

  protected isEvidenceOpen(recommendation: HistoryRecommendation): boolean {
    return this.openEvidence().has(recommendation.id);
  }

  protected tone(outcome: RecommendationOutcome): string {
    return OUTCOME_TONE[outcome] ?? 'plain';
  }

  /** Local time: a history is read by the people who did the work. */
  protected when(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  protected onlyDate(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  protected label(value: string | null): string {
    return value ? value.toLowerCase().replace(/[._]/g, ' ') : '—';
  }

  /** The workshop's own inspection form values, as name/value pairs. */
  protected fieldPairs(fields: Record<string, unknown>): { key: string; value: string }[] {
    return Object.entries(fields ?? {}).map(([key, value]) => ({
      key: key.replace(/[._]/g, ' '),
      value: value === null || value === undefined ? '—' : String(value),
    }));
  }
}

function toggled(current: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}
