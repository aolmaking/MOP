import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { PipelineSankeyNode } from '@mop/shared';

@Component({
  selector: 'app-sankey-chart',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="sankey-container">
      <div class="sankey-flow">
        @for (node of nodes(); track node.stage; let idx = $index; let last = $last) {
          <div class="sankey-node" [class.sankey-node--bottleneck]="node.isBottleneck" [class.sankey-node--declined]="node.stage === 'DECLINED'">
            <div class="node-header">
              <span class="node-stage">{{ node.label }}</span>
              @if (node.isBottleneck) {
                <span class="node-alert">BOTTLENECK</span>
              }
            </div>
            <div class="node-metrics">
              <span class="node-count">{{ node.vehicleCount }} Cars</span>
              <span class="node-volume">\${{ node.dollarVolume }}</span>
            </div>
            @if (node.averageDwellMinutes > 0) {
              <div class="node-dwell">Avg Dwell: {{ formatDwell(node.averageDwellMinutes) }}</div>
            }
          </div>

          @if (!last && node.stage !== 'DECLINED') {
            <div class="sankey-connector">
              <div class="connector-line"></div>
              <span class="connector-arrow">&rarr;</span>
            </div>
          }
        }
      </div>
    </div>
  `,
  styles: [`
    .sankey-container {
      background: var(--bg-card, #ffffff);
      border: 1px solid var(--border, #e2e8f0);
      border-radius: 0.5rem;
      padding: 1.25rem;
      overflow-x: auto;
    }
    .sankey-flow {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      min-width: 800px;
    }
    .sankey-node {
      flex: 1;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 0.375rem;
      padding: 0.875rem;
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
      box-shadow: 0 1px 2px rgba(0,0,0,0.04);
    }
    .sankey-node--bottleneck {
      border-color: #f59e0b;
      background: #fffbeb;
    }
    .sankey-node--declined {
      border-color: #f87171;
      background: #fef2f2;
    }
    .node-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .node-stage {
      font-size: 0.75rem;
      font-weight: 700;
      color: #334155;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .node-alert {
      font-size: 0.625rem;
      font-weight: 800;
      background: #fef3c7;
      color: #b45309;
      padding: 0.125rem 0.375rem;
      border-radius: 0.25rem;
    }
    .node-metrics {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
    }
    .node-count {
      font-size: 1.125rem;
      font-weight: 800;
      color: #0f172a;
    }
    .node-volume {
      font-size: 0.875rem;
      font-weight: 700;
      color: #16a34a;
    }
    .node-dwell {
      font-size: 0.75rem;
      color: #64748b;
    }
    .sankey-connector {
      display: flex;
      align-items: center;
      color: #94a3b8;
      font-size: 1.25rem;
      font-weight: 700;
    }
  `],
})
export class SankeyChartComponent {
  readonly nodes = input.required<readonly PipelineSankeyNode[]>();

  protected formatDwell(minutes: number): string {
    if (minutes < 60) return `${minutes}m`;
    const hrs = (minutes / 60).toFixed(1);
    return `${hrs}h`;
  }
}
