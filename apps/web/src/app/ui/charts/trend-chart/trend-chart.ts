import { AfterViewInit, Component, ElementRef, OnChanges, OnDestroy, effect, input, viewChild } from '@angular/core';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

export interface TrendSeries {
  readonly label: string;
  readonly color: string;
  readonly values: readonly number[];
}

/**
 * A single reusable line-chart renderer for every trend in Reports &
 * Analytics (revenue/collected, future series) -- one Chart.js instance
 * implementation, not one per page. Labels/series are plain inputs; this
 * component owns none of the business logic for what a trend means.
 */
@Component({
  selector: 'app-trend-chart',
  templateUrl: './trend-chart.html',
  styleUrl: './trend-chart.css',
})
export class TrendChart implements AfterViewInit, OnDestroy, OnChanges {
  readonly labels = input.required<readonly string[]>();
  readonly series = input.required<readonly TrendSeries[]>();

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private chart: Chart | null = null;

  constructor() {
    effect(() => {
      // Re-read both signals so the effect re-runs whenever either changes.
      this.labels();
      this.series();
      this.render();
    });
  }

  ngAfterViewInit(): void {
    this.render();
  }

  ngOnChanges(): void {
    this.render();
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }

  private render(): void {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas) return;

    this.chart?.destroy();
    this.chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: [...this.labels()],
        datasets: this.series().map((s) => ({
          label: s.label,
          data: [...s.values],
          borderColor: s.color,
          backgroundColor: s.color,
          tension: 0.25,
          pointRadius: 2,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { labels: { color: '#a89f9b' } },
        },
        scales: {
          x: { ticks: { color: '#a89f9b' }, grid: { color: 'rgba(255,255,255,0.06)' } },
          y: { ticks: { color: '#a89f9b' }, grid: { color: 'rgba(255,255,255,0.06)' }, beginAtZero: true },
        },
      },
    });
  }
}
