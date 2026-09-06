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
    const context = canvas.getContext('2d');
    if (!context) return;

    this.chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: [...this.labels()],
        datasets: this.series().map((s) => {
          const fill = context.createLinearGradient(0, 0, 0, canvas.clientHeight || 280);
          fill.addColorStop(0, `${s.color}55`);
          fill.addColorStop(1, `${s.color}00`);
          return {
            label: s.label,
            data: [...s.values],
            borderColor: s.color,
            backgroundColor: fill,
            fill: true,
            tension: 0.35,
            borderWidth: 2.5,
            pointRadius: 0,
            pointHoverRadius: 5,
            pointHoverBorderWidth: 2,
            pointHoverBackgroundColor: '#111821',
          };
        }),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#a8b6c4', usePointStyle: true, pointStyle: 'circle', padding: 18 },
          },
          tooltip: {
            backgroundColor: '#182330',
            borderColor: '#3b4d5e',
            borderWidth: 1,
            titleColor: '#f5f7fa',
            bodyColor: '#dbe5ee',
            padding: 12,
            displayColors: true,
            usePointStyle: true,
          },
        },
        scales: {
          x: {
            border: { display: false },
            ticks: { color: '#7f91a1', maxRotation: 0, autoSkipPadding: 18 },
            grid: { display: false },
          },
          y: {
            border: { display: false, dash: [4, 4] },
            ticks: { color: '#7f91a1', padding: 8 },
            grid: { color: 'rgba(168,182,196,0.12)' },
            beginAtZero: true,
          },
        },
      },
    });
  }
}
