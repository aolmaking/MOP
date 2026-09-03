import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { SalesWaterfallDto } from '@mop/shared';

@Component({
  selector: 'app-waterfall-chart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="waterfall-card">
      <h3 class="waterfall-title">Inspection Quote Leakage Waterfall</h3>
      <p class="waterfall-sub">Tracks estimate dollars from initial multi-point inspection identification down to net realized revenue vs. un-sold leakage.</p>

      @if (data(); as d) {
        <div class="waterfall-bars">
          <div class="waterfall-bar waterfall-bar--identified">
            <div class="bar-header">
              <span class="bar-label">Total Identified</span>
              <span class="bar-val">\${{ d.totalEstimatesIdentified }}</span>
            </div>
            <div class="bar-fill bar-fill--100"></div>
          </div>

          <div class="waterfall-bar waterfall-bar--safety">
            <div class="bar-header">
              <span class="bar-label">Critical Safety Sold ({{ d.criticalSafetyConversionPct }}%)</span>
              <span class="bar-val">\${{ d.criticalSafetySold }}</span>
            </div>
            <div class="bar-fill bar-fill--safety" [style.width.%]="d.criticalSafetyConversionPct"></div>
          </div>

          <div class="waterfall-bar waterfall-bar--maint">
            <div class="bar-header">
              <span class="bar-label">Maintenance Sold ({{ d.maintenanceConversionPct }}%)</span>
              <span class="bar-val">\${{ d.maintenanceSold }}</span>
            </div>
            <div class="bar-fill bar-fill--maint" [style.width.%]="d.maintenanceConversionPct"></div>
          </div>

          <div class="waterfall-bar waterfall-bar--cosmetic">
            <div class="bar-header">
              <span class="bar-label">Cosmetic / Future Sold ({{ d.cosmeticConversionPct }}%)</span>
              <span class="bar-val">\${{ d.cosmeticSold }}</span>
            </div>
            <div class="bar-fill bar-fill--cosmetic" [style.width.%]="d.cosmeticConversionPct"></div>
          </div>

          <div class="waterfall-bar waterfall-bar--leakage">
            <div class="bar-header">
              <span class="bar-label">Unrealized Revenue Gap (Declined Work)</span>
              <span class="bar-val bar-val--danger">\${{ d.unrealizedRevenueGap }}</span>
            </div>
            <div class="bar-fill bar-fill--danger" [style.width.%]="d.totalConversionPct ? 100 - d.totalConversionPct : 0"></div>
          </div>
        </div>

        <div class="advisor-grid">
          <h4 class="advisor-title">Service Advisor Conversion Scorecards</h4>
          <div class="advisor-cards">
            @if (d.advisorScorecards.length === 0) {
              <p style="color: #64748b; font-size: 0.875rem; padding: 0.5rem 0;">No advisor estimate decisions recorded in this date range.</p>
            }
            @for (adv of d.advisorScorecards; track adv.advisorId) {
              <div class="advisor-card">
                <span class="adv-name">{{ adv.displayName }}</span>
                <span class="adv-rate">{{ adv.conversionPct }}% Close Rate</span>
                <span class="adv-sub">\${{ adv.totalSold }} sold of \${{ adv.totalQuoted }} quoted</span>
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .waterfall-card {
      background: var(--bg-card, #ffffff);
      border: 1px solid var(--border, #e2e8f0);
      border-radius: 0.5rem;
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .waterfall-title { font-size: 1.125rem; font-weight: 700; color: #0f172a; }
    .waterfall-sub { font-size: 0.875rem; color: #64748b; margin-top: -0.5rem; }
    .waterfall-bars { display: flex; flex-direction: column; gap: 0.75rem; }
    .waterfall-bar { display: flex; flex-direction: column; gap: 0.25rem; }
    .bar-header { display: flex; justify-content: space-between; font-size: 0.8125rem; font-weight: 700; color: #334155; }
    .bar-val { font-weight: 800; color: #16a34a; }
    .bar-val--danger { color: #dc2626; }
    .bar-fill { height: 10px; border-radius: 0.25rem; background: #3b82f6; }
    .bar-fill--100 { width: 100%; background: #0f172a; }
    .bar-fill--safety { background: #16a34a; }
    .bar-fill--maint { background: #3b82f6; }
    .bar-fill--cosmetic { background: #a855f7; }
    .bar-fill--danger { background: #ef4444; }

    .advisor-grid { margin-top: 1rem; display: flex; flex-direction: column; gap: 0.5rem; }
    .advisor-title { font-size: 0.875rem; font-weight: 700; color: #0f172a; }
    .advisor-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.75rem; }
    .advisor-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 0.375rem; padding: 0.75rem; display: flex; flex-direction: column; gap: 0.25rem; }
    .adv-name { font-size: 0.8125rem; font-weight: 700; color: #0f172a; }
    .adv-rate { font-size: 1rem; font-weight: 800; color: #2563eb; }
    .adv-sub { font-size: 0.75rem; color: #64748b; }
  `],
})
export class WaterfallChartComponent {
  readonly data = input.required<SalesWaterfallDto>();
}
