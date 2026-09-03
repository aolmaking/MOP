import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { CohortRetentionDto } from '@mop/shared';

@Component({
  selector: 'app-cohort-heatmap',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="cohort-card">
      <h3 class="cohort-title">Customer Retention Decay Matrix (6-Month Recapture)</h3>
      <p class="cohort-sub">Heatmap tracking percentage of first-time customers returning for their scheduled 6-month service interval.</p>

      @if (data(); as d) {
        <div class="heatmap-table">
          <div class="heatmap-row heatmap-row--header">
            <span class="cohort-col">Cohort Month</span>
            <span class="cars-col">New Cars</span>
            @for (m of months; track m) {
              <span class="month-col">M+{{ m }}</span>
            }
          </div>

          @for (row of d.heatmap; track row.cohortMonth) {
            <div class="heatmap-row">
              <span class="cohort-name">{{ row.cohortMonth }}</span>
              <span class="cars-count">{{ row.newCustomersCount }}</span>
              @for (ret of row.retentionByMonthPct; track ret.monthOffset) {
                <div class="tile-cell" [style.background-color]="getTileColor(ret.retentionPct)">
                  {{ ret.retentionPct }}%
                </div>
              }
            </div>
          }
        </div>

        <div class="churn-list">
          <h4 class="churn-title">Overdue Churn Risk Call List</h4>
          <div class="churn-rows">
            @for (item of d.churnRiskList; track item.customerId) {
              <div class="churn-row">
                <span class="cust-name">{{ item.customerName }} ({{ item.vehiclePlate }})</span>
                <span class="cust-overdue">Overdue by {{ item.daysOverdue }} days</span>
                <a class="cust-action" href="javascript:void(0)">Send WhatsApp Check-in</a>
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .cohort-card {
      background: var(--bg-card, #ffffff);
      border: 1px solid var(--border, #e2e8f0);
      border-radius: 0.5rem;
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      overflow-x: auto;
    }
    .cohort-title { font-size: 1.125rem; font-weight: 700; color: #0f172a; }
    .cohort-sub { font-size: 0.875rem; color: #64748b; margin-top: -0.5rem; }
    .heatmap-table { display: flex; flex-direction: column; gap: 0.375rem; min-width: 650px; }
    .heatmap-row { display: grid; grid-template-columns: 100px 80px repeat(6, 1fr); gap: 0.375rem; align-items: center; }
    .heatmap-row--header { font-size: 0.75rem; font-weight: 700; color: #64748b; text-transform: uppercase; }
    .cohort-name { font-size: 0.8125rem; font-weight: 700; color: #0f172a; }
    .cars-count { font-size: 0.8125rem; color: #475569; }
    .tile-cell {
      height: 32px;
      border-radius: 0.25rem;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
      font-weight: 800;
      color: #0f172a;
    }
    .churn-list { margin-top: 1rem; display: flex; flex-direction: column; gap: 0.5rem; }
    .churn-title { font-size: 0.875rem; font-weight: 700; color: #0f172a; }
    .churn-rows { display: flex; flex-direction: column; gap: 0.375rem; }
    .churn-row { background: #fef2f2; border: 1px solid #fca5a5; border-radius: 0.375rem; padding: 0.625rem; display: flex; justify-content: space-between; align-items: center; font-size: 0.8125rem; }
    .cust-name { font-weight: 700; color: #0f172a; }
    .cust-overdue { color: #dc2626; font-weight: 600; }
    .cust-action { color: #2563eb; font-weight: 700; text-decoration: none; }
  `],
})
export class CohortHeatmapComponent {
  readonly data = input.required<CohortRetentionDto>();
  readonly months: readonly number[] = [1, 2, 3, 4, 5, 6];

  protected getTileColor(pct: number): string {
    if (pct >= 60) return '#dcfce7'; // Emerald
    if (pct >= 35) return '#fef3c7'; // Yellow
    return '#fef2f2'; // Soft Red
  }
}
