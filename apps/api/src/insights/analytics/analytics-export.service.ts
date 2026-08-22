import { ForbiddenException, Injectable } from "@nestjs/common";
import type { AnalystSavedViewSourcePage } from "@mop/database";
import { PrismaService } from "../../runtime/database/prisma.service";
import type { ReportQueryParams } from "../owner-reports/date-range.util";
import type { AnalyticsScope } from "./analytics-scope.util";
import { DecisionsAnalyticsService } from "./decisions-analytics.service";
import { FeatureAdoptionAnalyticsService } from "./feature-adoption-analytics.service";
import { InventoryAnalyticsService } from "./inventory-analytics.service";
import { OperationsAnalyticsService } from "./operations-analytics.service";
import { PeopleAnalyticsService } from "./people-analytics.service";

export interface AnalyticsCsvExport {
  readonly filename: string;
  readonly content: string;
}

/**
 * Data Analyst CSV export. The permission resolver answers "may this
 * session export at all"; this service also checks the plan's specific
 * Allowed Exports category list before building bytes for one page.
 */
@Injectable()
export class AnalyticsExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operations: OperationsAnalyticsService,
    private readonly people: PeopleAnalyticsService,
    private readonly inventory: InventoryAnalyticsService,
    private readonly decisions: DecisionsAnalyticsService,
    private readonly featureAdoption: FeatureAdoptionAnalyticsService,
  ) {}

  async buildCsv(
    tenantId: string,
    scope: AnalyticsScope,
    sourcePage: AnalystSavedViewSourcePage,
    params: ReportQueryParams,
    canViewCost: boolean,
  ): Promise<AnalyticsCsvExport> {
    await this.assertAllowedByPlan(tenantId, sourcePage);

    const rows = await this.rows(tenantId, scope, sourcePage, params, canViewCost);
    return {
      filename: `mop-${sourcePage.toLowerCase().replace(/_/g, "-")}-analytics.csv`,
      content: toCsv([["section", "item", "metric", "value"], ...rows]),
    };
  }

  private async assertAllowedByPlan(tenantId: string, sourcePage: AnalystSavedViewSourcePage): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: { select: { allowedExports: true } } },
    });
    const allowed = tenant?.plan.allowedExports ?? [];
    if (!allowed.includes(sourcePage)) {
      throw new ForbiddenException({
        code: "export_not_in_plan",
        message: "This report category is not included in this workshop's Allowed Exports plan entitlement.",
      });
    }
  }

  private async rows(
    tenantId: string,
    scope: AnalyticsScope,
    sourcePage: AnalystSavedViewSourcePage,
    params: ReportQueryParams,
    canViewCost: boolean,
  ): Promise<string[][]> {
    switch (sourcePage) {
      case "OPERATIONS":
        return this.operationsRows(tenantId, scope, params);
      case "PEOPLE":
        return this.peopleRows(tenantId, scope, params);
      case "INVENTORY":
        return this.inventoryRows(tenantId, scope, canViewCost);
      case "DECISIONS":
        return this.decisionRows(tenantId, scope, params);
      case "FEATURE_ADOPTION":
        return this.featureRows(tenantId, params);
    }
  }

  private async operationsRows(tenantId: string, scope: AnalyticsScope, params: ReportQueryParams): Promise<string[][]> {
    const report = await this.operations.build(tenantId, scope, params);
    return [
      ...report.volume.flatMap((row) => [
        ["volume", row.bucket, "created", row.created.toString()],
        ["volume", row.bucket, "completed", row.completed.toString()],
      ]),
      ...report.statusDistribution.map((row) => ["status_distribution", row.status, "count", row.count.toString()]),
      ...report.timeInStatus.map((row) => ["time_in_status", row.status, "average_hours", row.averageHours.toString()]),
      ...(report.branchComparison ?? []).flatMap((row) => [
        ["branch_comparison", row.branchName, "created", row.created.toString()],
        ["branch_comparison", row.branchName, "completed", row.completed.toString()],
      ]),
      ...report.blockers.map((row) => ["blockers", row.reason, "count", row.count.toString()]),
      ["delivery_funnel", "Reached Ready for Delivery", "count", report.deliveryFunnel.reachedReadyForDelivery.toString()],
      ["delivery_funnel", "Reached Closed", "count", report.deliveryFunnel.reachedClosed.toString()],
      ["delivery_funnel", "Average gap", "hours", report.deliveryFunnel.averageGapHours?.toString() ?? ""],
    ];
  }

  private async peopleRows(tenantId: string, scope: AnalyticsScope, params: ReportQueryParams): Promise<string[][]> {
    const report = await this.people.build(tenantId, scope, params);
    return [
      ...report.technicians.flatMap((row) => [
        ["technicians", row.fullName, "tasks_completed", row.tasksCompleted.toString()],
        ["technicians", row.fullName, "average_task_hours", row.averageTaskHours?.toString() ?? ""],
        ["technicians", row.fullName, "rework_rate", row.reworkRate.toString()],
        ["technicians", row.fullName, "blockers", row.blockerCount.toString()],
      ]),
      ...report.teamThroughput.map((row) => ["team_throughput", row.teamName, "tasks_completed", row.tasksCompleted.toString()]),
      ...report.diagnosticCodeActivity.map((row) => ["diagnostic_code_activity", row.code, "count", row.count.toString()]),
    ];
  }

  private async inventoryRows(tenantId: string, scope: AnalyticsScope, canViewCost: boolean): Promise<string[][]> {
    const report = await this.inventory.build(tenantId, scope, canViewCost);
    return [
      ...report.operational.usage.flatMap((row) => [
        ["usage", row.name, "sku", row.sku],
        ["usage", row.name, "issued", row.issued.toString()],
        ["usage", row.name, "movements", row.movements.toString()],
      ]),
      ...report.consumptionByCategory.map((row) => ["category_usage", row.category, "issued", row.issued.toString()]),
      ...report.operational.stockRisk.flatMap((row) => [
        ["stock_risk", row.name, "available", row.available.toString()],
        ["stock_risk", row.name, "velocity", row.velocity.toString()],
        ["stock_risk", row.name, "days_left", row.daysLeft?.toString() ?? ""],
      ]),
      ["returns", "total", "count", report.operational.returns.total.toString()],
      ["returns", "back_to_stock", "count", report.operational.returns.backToStock.toString()],
      ["returns", "damaged", "count", report.operational.returns.damaged.toString()],
      ...(report.operational.warehouseComparison ?? []).map((row) => [
        "warehouse_comparison",
        row.name,
        "issued",
        row.issued.toString(),
      ]),
      ["inventory_value", "value", "amount", report.inventoryValue?.toString() ?? ""],
    ];
  }

  private async decisionRows(tenantId: string, scope: AnalyticsScope, params: ReportQueryParams): Promise<string[][]> {
    const report = await this.decisions.build(tenantId, scope, params);
    return [
      ["summary", "approval_rate", "percent", report.approvalRate.toString()],
      ["summary", "rejection_rate", "percent", report.rejectionRate.toString()],
      ["summary", "average_response", "hours", report.averageResponseHours?.toString() ?? ""],
      ["summary", "overdue_rate", "percent", report.overdueRate.toString()],
      ["summary", "critical_rejections", "count", report.criticalRejections.toString()],
      ["summary", "critical_later_approved", "count", report.criticalRejectionsLaterApproved.toString()],
      ["summary", "link_open_rate", "percent", report.linkOpenRate.toString()],
      ...report.byImportance.flatMap((row) => [
        ["by_importance", row.importance, "approved", row.approved.toString()],
        ["by_importance", row.importance, "rejected", row.rejected.toString()],
        ["by_importance", row.importance, "pending", row.pending.toString()],
      ]),
    ];
  }

  private async featureRows(tenantId: string, params: ReportQueryParams): Promise<string[][]> {
    const report = await this.featureAdoption.build(tenantId, params);
    return [
      ...report.features.flatMap((row) => [
        ["features", row.feature, "usage_count", row.usageCount.toString()],
        ["features", row.feature, "zero_usage", row.zeroUsage ? "true" : "false"],
      ]),
      ...report.notTrackable.map((row) => ["not_trackable", row.feature, "reason", row.reason]),
    ];
  }
}

function toCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
