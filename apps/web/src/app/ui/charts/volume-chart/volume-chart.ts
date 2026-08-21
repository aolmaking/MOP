import { Component, computed, input, signal } from '@angular/core';

export interface VolumePoint {
  readonly bucket: string;
  readonly created: number;
  readonly closed: number;
}

interface Column {
  readonly key: string;
  readonly label: string;
  readonly fullLabel: string;
  readonly created: number;
  readonly closed: number;
  readonly createdPercent: number;
  readonly closedPercent: number;
}

/**
 * Vehicles in and out over time.
 *
 * A column chart rather than the shared bar-list, because the question is
 * about shape over time -- was this week busier than last -- and a
 * horizontal bar list answers "which category is biggest" instead. Two
 * series per bucket so arrivals and completions can be compared directly:
 * a workshop taking in more than it finishes is the pattern worth seeing
 * early, and it is invisible in either series alone.
 *
 * Drawn with CSS rather than SVG or a charting library: it is a bar per
 * bucket, it inherits the theme's tokens for free, and it adds nothing to
 * the bundle. `height` is animated only on entry, and the columns
 * themselves scale on the compositor.
 */
@Component({
  selector: 'app-volume-chart',
  templateUrl: './volume-chart.html',
  styleUrl: './volume-chart.css',
})
export class VolumeChart {
  readonly points = input.required<readonly VolumePoint[]>();
  /** day | week | month -- only affects how a bucket is labelled. */
  readonly granularity = input<'day' | 'week' | 'month'>('day');

  /** Which column the pointer or keyboard focus is on, if any. */
  protected readonly active = signal<string | null>(null);

  protected readonly max = computed(() =>
    Math.max(1, ...this.points().flatMap((p) => [p.created, p.closed])),
  );

  protected readonly columns = computed<Column[]>(() => {
    const max = this.max();
    return this.points().map((p) => ({
      key: p.bucket,
      label: this.shortLabel(p.bucket),
      fullLabel: this.fullLabel(p.bucket),
      created: p.created,
      closed: p.closed,
      // Percent of the tallest column, so the chart scales to its own
      // data rather than to an arbitrary axis maximum.
      createdPercent: (p.created / max) * 100,
      closedPercent: (p.closed / max) * 100,
    }));
  });

  protected readonly totals = computed(() =>
    this.points().reduce(
      (acc, p) => ({ created: acc.created + p.created, closed: acc.closed + p.closed }),
      { created: 0, closed: 0 },
    ),
  );

  protected readonly activeColumn = computed(() => {
    const key = this.active();
    return key ? (this.columns().find((c) => c.key === key) ?? null) : null;
  });

  private shortLabel(iso: string): string {
    const d = new Date(iso);
    if (this.granularity() === 'month') return d.toLocaleDateString(undefined, { month: 'short' });
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }

  private fullLabel(iso: string): string {
    const d = new Date(iso);
    if (this.granularity() === 'month') return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'long' });
  }
}
