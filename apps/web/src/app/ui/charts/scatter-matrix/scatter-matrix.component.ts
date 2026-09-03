import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { TechnicianTriadMember } from '@mop/shared';

@Component({
  selector: 'app-scatter-matrix',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="scatter-card">
      <h3 class="scatter-title">Technician Performance Matrix (Efficiency vs. Quality)</h3>
      <p class="scatter-sub">Plots technician speed (Flat-Rate Efficiency %) against repair quality (Rework / Comeback Rate %).</p>

      <div class="quadrant-grid">
        <!-- Top-Left: Careful Apprentices -->
        <div class="quadrant quadrant--apprentice">
          <span class="quadrant-label">Careful Apprentices</span>
          <span class="quadrant-desc">High Quality, Lower Speed</span>
        </div>

        <!-- Top-Right: Champions -->
        <div class="quadrant quadrant--champion">
          <span class="quadrant-label">Champions</span>
          <span class="quadrant-desc">High Speed, High Quality</span>
        </div>

        <!-- Bottom-Left: Underperformers -->
        <div class="quadrant quadrant--underperformer">
          <span class="quadrant-label">Underperformers</span>
          <span class="quadrant-desc">Needs Skills Coaching</span>
        </div>

        <!-- Bottom-Right: Rushing Hazards -->
        <div class="quadrant quadrant--hazard">
          <span class="quadrant-label">Rushing Hazards</span>
          <span class="quadrant-desc">High Speed, High Rework Risk</span>
        </div>
      </div>

      <div class="tech-list">
        @for (tech of technicians(); track tech.technicianId) {
          <div class="tech-chip" [class]="'tech-chip--' + tech.performanceQuadrant.toLowerCase()">
            <span class="tech-name">{{ tech.displayName }}</span>
            <span class="tech-metrics">{{ tech.efficiencyPct }}% Eff · {{ tech.reworkRatePct }}% Rework</span>
            <span class="tech-badge">{{ formatQuadrant(tech.performanceQuadrant) }}</span>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .scatter-card {
      background: var(--bg-card, #ffffff);
      border: 1px solid var(--border, #e2e8f0);
      border-radius: 0.5rem;
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .scatter-title {
      font-size: 1.125rem;
      font-weight: 700;
      color: #0f172a;
    }
    .scatter-sub {
      font-size: 0.875rem;
      color: #64748b;
      margin-top: -0.5rem;
    }
    .quadrant-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-template-rows: 1fr 1fr;
      gap: 0.75rem;
      min-height: 220px;
    }
    .quadrant {
      border-radius: 0.375rem;
      padding: 1rem;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      border: 1px dashed #cbd5e1;
    }
    .quadrant--champion { background: #f0fdf4; border-color: #86efac; }
    .quadrant--apprentice { background: #eff6ff; border-color: #93c5fd; }
    .quadrant--hazard { background: #fffbeb; border-color: #fde047; }
    .quadrant--underperformer { background: #fef2f2; border-color: #fca5a5; }
    .quadrant-label { font-size: 0.875rem; font-weight: 700; color: #0f172a; }
    .quadrant-desc { font-size: 0.75rem; color: #64748b; }
    .tech-list {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .tech-chip {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      padding: 0.5rem 0.75rem;
      border-radius: 0.375rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.8125rem;
    }
    .tech-name { font-weight: 700; color: #0f172a; }
    .tech-metrics { color: #64748b; }
    .tech-badge {
      font-size: 0.6875rem;
      font-weight: 800;
      padding: 0.125rem 0.375rem;
      border-radius: 0.25rem;
      text-transform: uppercase;
      background: #e2e8f0;
      color: #334155;
    }
  `],
})
export class ScatterMatrixComponent {
  readonly technicians = input.required<readonly TechnicianTriadMember[]>();

  protected formatQuadrant(quadrant: string): string {
    return quadrant.replace(/_/g, ' ');
  }
}
