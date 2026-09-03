import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { BayOccupancySlot } from '@mop/shared';

@Component({
  selector: 'app-bay-gantt',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="gantt-card">
      <div class="gantt-header">
        <div>
          <h3 class="gantt-title">Physical Bay Occupancy Timeline (Today)</h3>
          <p class="gantt-sub">Hourly status of physical lift stalls across shift operating hours.</p>
        </div>
        <div class="gantt-legend">
          <span class="legend-item legend-item--active">Active Wrenching</span>
          <span class="legend-item legend-item--idle">Idle Lift</span>
          <span class="legend-item legend-item--blocked">Bay Blocked</span>
        </div>
      </div>

      <div class="gantt-grid">
        <div class="gantt-row gantt-row--header">
          <span class="bay-col-label">Service Bay</span>
          @for (hour of hours; track hour) {
            <span class="hour-col">{{ hour }}:00</span>
          }
          <span class="util-col">Util %</span>
        </div>

        @for (bay of bays(); track bay.bayId) {
          <div class="gantt-row">
            <div class="bay-col-info">
              <span class="bay-name">{{ bay.bayName }}</span>
              <span class="bay-type">{{ bay.bayType }}</span>
            </div>

            @for (slot of bay.hourlyStatus; track slot.hour) {
              <div class="slot-cell" [class]="'slot-cell--' + slot.status.toLowerCase()" [title]="slot.vehiclePlate || slot.status">
                @if (slot.vehiclePlate) {
                  <span class="slot-text">{{ slot.vehiclePlate }}</span>
                }
              </div>
            }

            <div class="util-col-val">
              <span class="util-badge">{{ bay.utilizationPct }}%</span>
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .gantt-card {
      background: var(--bg-card, #ffffff);
      border: 1px solid var(--border, #e2e8f0);
      border-radius: 0.5rem;
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      overflow-x: auto;
    }
    .gantt-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .gantt-title { font-size: 1.125rem; font-weight: 700; color: #0f172a; }
    .gantt-sub { font-size: 0.875rem; color: #64748b; margin-top: -0.25rem; }
    .gantt-legend { display: flex; gap: 0.75rem; font-size: 0.75rem; font-weight: 600; }
    .legend-item { padding: 0.25rem 0.5rem; border-radius: 0.25rem; }
    .legend-item--active { background: #dcfce7; color: #15803d; }
    .legend-item--idle { background: #f1f5f9; color: #64748b; }
    .legend-item--blocked { background: #fef3c7; color: #b45309; }

    .gantt-grid { display: flex; flex-direction: column; gap: 0.5rem; min-width: 750px; }
    .gantt-row { display: grid; grid-template-columns: 220px repeat(9, 1fr) 70px; gap: 0.375rem; align-items: center; }
    .gantt-row--header { font-size: 0.75rem; font-weight: 700; color: #64748b; text-transform: uppercase; }
    .bay-col-info { display: flex; flex-direction: column; }
    .bay-name { font-size: 0.8125rem; font-weight: 700; color: #0f172a; }
    .bay-type { font-size: 0.6875rem; color: #64748b; }
    .hour-col { text-align: center; }
    .slot-cell {
      height: 38px;
      border-radius: 0.25rem;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0.25rem;
      font-size: 0.6875rem;
      font-weight: 700;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .slot-cell--active { background: #dcfce7; color: #15803d; border: 1px solid #86efac; }
    .slot-cell--idle { background: #f8fafc; color: #94a3b8; border: 1px dashed #cbd5e1; }
    .slot-cell--blocked { background: #fef3c7; color: #b45309; border: 1px solid #fde047; }
    .util-col-val { text-align: right; }
    .util-badge { font-size: 0.8125rem; font-weight: 800; background: #e2e8f0; padding: 0.25rem 0.5rem; border-radius: 0.25rem; }
  `],
})
export class BayGanttComponent {
  readonly bays = input.required<readonly BayOccupancySlot[]>();
  readonly hours: readonly number[] = [8, 9, 10, 11, 12, 13, 14, 15, 16];
}
