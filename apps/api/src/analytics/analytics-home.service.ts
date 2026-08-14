import { Injectable } from "@nestjs/common";
import { OperationsAnalyticsService } from "./operations-analytics.service";
import { PeopleAnalyticsService } from "./people-analytics.service";
import { InventoryAnalyticsService } from "./inventory-analytics.service";
import { DecisionsAnalyticsService } from "./decisions-analytics.service";
import type { AnalyticsScope } from "./analytics-scope.util";
import type { ReportQueryParams } from "../reports/date-range.util";

export interface AnalyticsHomeTile {
  readonly page: "operations" | "people" | "inventory" | "decisions";
  readonly label: string;
  readonly metrics: readonly { readonly label: string; readonly value: string }[];
}

export interface AnalyticsHomeReport {
  readonly tiles: readonly AnalyticsHomeTile[];
}

/**
 * Data Analyst -- Analytics Home. "A cross-section of the other 6 pages'
 * headline numbers" (spec) -- composes the other services rather than
 * recomputing anything, so this tile's numbers can never drift from what
 * the full page shows when the analyst clicks through.
 */
@Injectable()
export class AnalyticsHomeService {
  constructor(
    private readonly operations: OperationsAnalyticsService,
    private readonly people: PeopleAnalyticsService,
    private readonly inventory: InventoryAnalyticsService,
    private readonly decisions: DecisionsAnalyticsService,
  ) {}

  async build(tenantId: string, scope: AnalyticsScope, params: ReportQueryParams): Promise<AnalyticsHomeReport> {
    const [ops, people, inv, dec] = await Promise.all([
      this.operations.build(tenantId, scope, params),
      this.people.build(tenantId, scope, params),
      this.inventory.build(tenantId, scope, false),
      this.decisions.build(tenantId, scope, params),
    ]);

    const totalCreated = ops.volume.reduce((sum, p) => sum + p.created, 0);
    const totalCompleted = ops.volume.reduce((sum, p) => sum + p.completed, 0);

    return {
      tiles: [
        {
          page: "operations",
          label: "Operations",
          metrics: [
            { label: "Created", value: totalCreated.toString() },
            { label: "Completed", value: totalCompleted.toString() },
          ],
        },
        {
          page: "people",
          label: "Technician & Team",
          metrics: [
            { label: "Technicians tracked", value: people.technicians.length.toString() },
            {
              label: "Total tasks completed",
              value: people.technicians.reduce((sum, t) => sum + t.tasksCompleted, 0).toString(),
            },
          ],
        },
        {
          page: "inventory",
          label: "Inventory",
          metrics: [
            { label: "Items tracked", value: inv.operational.usage.length.toString() },
            { label: "At risk", value: inv.operational.stockRisk.length.toString() },
          ],
        },
        {
          page: "decisions",
          label: "Customer Decisions",
          metrics: [
            { label: "Approval rate", value: `${dec.approvalRate.toFixed(0)}%` },
            { label: "Critical rejections", value: dec.criticalRejections.toString() },
          ],
        },
      ],
    };
  }
}
