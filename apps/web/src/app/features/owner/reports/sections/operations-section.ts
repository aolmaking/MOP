import { Component, computed, input } from '@angular/core';
import { KpiCard } from '../../../../shared/reports/kpi-card/kpi-card';
import { BarList, type BarListItem } from '../../../../shared/reports/bar-list/bar-list';
import { VolumeChart } from '../../../../shared/reports/volume-chart/volume-chart';
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
  imports: [KpiCard, BarList, VolumeChart],
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
      detail: `Jobs sitting in ${row.status.toLowerCase().replace(/_/g, ' ')} right now`,
    })),
  );

  protected readonly timeInStatusItems = computed<BarListItem[]>(() =>
    this.data().averageTimeInStatus.map((row) => ({
      label: row.status,
      value: row.averageHours,
      displayValue: `${row.averageHours.toFixed(1)} h`,
      // A share of the total would be meaningless here -- these are
      // averages per stage, not parts of one whole -- so the detail says
      // what the number actually measures instead.
      detail: `Average time a job spends in ${row.status.toLowerCase().replace(/_/g, ' ')} before moving on`,
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
        detail:
          `${row.workOrdersCreated} booked in, ${row.workOrdersClosed} completed` +
          (row.averageCompletionHours === null
            ? ' — no completed job has enough history to time yet'
            : `, averaging ${row.averageCompletionHours.toFixed(1)}h end to end`),
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
        detail:
          `${row.activeTasks} still open` +
          (row.reworkCount > 0
            ? `, ${row.reworkCount} sent back for rework` +
              (row.reworkRate === null ? '' : ` (${row.reworkRate.toFixed(0)}%)`)
            : ', none sent back for rework'),
      })),
  );
}
