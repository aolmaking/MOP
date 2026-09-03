import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { TechnicianApi, type HistoryRecommendation, type TechnicianHistoryBrief } from './technician.api';

/**
 * What was done to this car before, on the technician's tablet.
 *
 * Its own component rather than a block inside the Work Card because it
 * answers its own question -- the card is what to do to this car now,
 * this is what happened to it already -- and because the two stylesheets
 * together exceeded the per-component CSS budget, which was that
 * distinction arriving as a build error.
 *
 * Loaded lazily, on request: not every job needs the past, and most
 * vehicles have been here once.
 */
@Component({
  selector: 'app-tech-vehicle-history',
  templateUrl: './tech-vehicle-history.html',
  styleUrl: './tech-vehicle-history.css',
})
export class TechVehicleHistory {
  private readonly api = inject(TechnicianApi);

  readonly workOrderId = input.required<string>();

  protected readonly vehicleHistory = signal<TechnicianHistoryBrief | null>(null);
  protected readonly vehicleHistoryOpen = signal(false);
  protected readonly vehicleHistoryLoading = signal(false);

  /**
   * Which of the three lists are showing everything.
   *
   * The headings and the first few entries answer the question most of
   * the time; the rest is one tap away. A technician standing at a car
   * needs the shape of the history in seconds, not all of it at once --
   * and a wall of thirty findings is how the useful one gets missed.
   */
  protected readonly expandedList = signal<ReadonlySet<string>>(new Set());
  /** Which recommendation has its detail open. One at a time, deliberately. */
  protected readonly openRecommendation = signal<string | null>(null);

  private static readonly PREVIEW = 3;

  constructor() {
    // Keyed on the job, not run once.
    //
    // Angular reuses the Work Card when only the route's `:id` changes,
    // so without this the previous car's history would still be on
    // screen. On a workshop tablet that is not cosmetic: it is a
    // technician reading the wrong vehicle's brake history while holding
    // a different car's key.
    effect(() => {
      this.workOrderId();
      untracked(() => this.reset());
    });
  }

  private reset(): void {
    this.vehicleHistory.set(null);
    this.vehicleHistoryOpen.set(false);
    this.vehicleHistoryLoading.set(false);
    this.expandedList.set(new Set());
    this.openRecommendation.set(null);
  }

  protected preview<T>(items: readonly T[], list: string): readonly T[] {
    return this.expandedList().has(list) ? items : items.slice(0, TechVehicleHistory.PREVIEW);
  }

  protected hasMore(items: readonly unknown[], list: string): boolean {
    return !this.expandedList().has(list) && items.length > TechVehicleHistory.PREVIEW;
  }

  protected toggleList(list: string): void {
    this.expandedList.update((current) => {
      const next = new Set(current);
      if (next.has(list)) next.delete(list);
      else next.add(list);
      return next;
    });
  }

  protected toggleRecommendation(recommendation: HistoryRecommendation): void {
    this.openRecommendation.update((current) => (current === recommendation.id ? null : recommendation.id));
  }

  /**
   * "Performed" is the only green. Every flavour of agreed-and-not-done
   * shares one warning colour so a technician scanning the list learns a
   * single signal rather than four.
   */
  protected outcomeTone(recommendation: HistoryRecommendation): string {
    if (recommendation.outcome === 'PERFORMED') return 'good';
    if (
      recommendation.outcome === 'NOT_PERFORMED' ||
      recommendation.outcome === 'PARTIALLY_PERFORMED' ||
      recommendation.outcome === 'APPROVED_NO_WORK_LINKED' ||
      recommendation.outcome === 'APPROVED_PLANNED'
    ) {
      return 'warn';
    }
    return 'plain';
  }

  protected shortDate(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  protected label(value: string): string {
    return value.toLowerCase().replace(/_/g, ' ');
  }

  protected toggleVehicleHistory(): void {
    const opening = !this.vehicleHistoryOpen();
    this.vehicleHistoryOpen.set(opening);
    // Every sub-panel closes with the section. Reopening history on a
    // DIFFERENT car must not inherit the last car's expanded rows.
    this.expandedList.set(new Set());
    this.openRecommendation.set(null);
    if (opening && !this.vehicleHistory()) {
      this.vehicleHistoryLoading.set(true);
      this.api.vehicleHistory(this.workOrderId()).subscribe({
        next: (summary) => {
          this.vehicleHistoryLoading.set(false);
          this.vehicleHistory.set(summary);
        },
        error: () => this.vehicleHistoryLoading.set(false),
      });
    }
  }
}
