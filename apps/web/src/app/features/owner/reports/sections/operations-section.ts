import { Component, computed, input } from '@angular/core';
import { KpiCard } from '../../../../shared/reports/kpi-card/kpi-card';
import { BarList, type BarListItem } from '../../../../shared/reports/bar-list/bar-list';
import type { OperationsReport } from '../reports.api';

/**
 * Operations -- workload, throughput, and where jobs get stuck.
 * `averageTimeInStatus` is the one metric here computed from real
 * transition history (reports-operations.service.ts), not a snapshot --
 * it answers "where do jobs typically wait," which the current status
 * distribution alone cannot.
 */
@Component({
  selector: 'app-operations-section',
  imports: [KpiCard, BarList],
  templateUrl: './operations-section.html',
  styleUrl: './operations-section.css',
})
export class OperationsSection {
  readonly data = input.required<OperationsReport>();

  protected readonly statusItems = computed<BarListItem[]>(() =>
    this.data().statusDistribution.map((row) => ({
      label: row.status,
      value: row.count,
      displayValue: row.count.toString(),
    })),
  );

  protected readonly timeInStatusItems = computed<BarListItem[]>(() =>
    this.data().averageTimeInStatus.map((row) => ({
      label: row.status,
      value: row.averageHours,
      displayValue: `${row.averageHours.toFixed(1)} h`,
    })),
  );

  protected readonly branchItems = computed<BarListItem[]>(() =>
    this.data()
      .branchComparison.slice()
      .sort((a, b) => b.workOrdersClosed - a.workOrdersClosed)
      .map((row) => ({
        label: row.branchName,
        value: row.workOrdersClosed,
        displayValue: `${row.workOrdersClosed} closed`,
      })),
  );

  protected readonly technicianItems = computed<BarListItem[]>(() =>
    this.data()
      .technicianWorkload.filter((row) => row.tasksCompleted > 0 || row.activeTasks > 0)
      .sort((a, b) => b.tasksCompleted - a.tasksCompleted)
      .slice(0, 10)
      .map((row) => ({
        label: row.fullName,
        value: row.tasksCompleted,
        displayValue: `${row.tasksCompleted} done`,
      })),
  );
}
