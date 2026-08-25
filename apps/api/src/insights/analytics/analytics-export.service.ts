import { ForbiddenException, Injectable } from "@nestjs/common";
import type { SessionContext } from "@mop/shared";
import { PrismaService } from "../../runtime/database/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { ANALYST_SAVED_VIEW_SOURCE_PAGES, type AnalystSavedViewSourcePageValue } from "./saved-views.constants";
import { resolveScope, type AnalyticsScope } from "./analytics-scope.util";
import type { ReportQueryParams } from "../owner-reports/date-range.util";
import { OperationsAnalyticsService } from "./operations-analytics.service";
import { PeopleAnalyticsService } from "./people-analytics.service";
import { InventoryAnalyticsService } from "./inventory-analytics.service";
import { DecisionsAnalyticsService } from "./decisions-analytics.service";
import { FeatureAdoptionAnalyticsService } from "./feature-adoption-analytics.service";
import { reportToCsv } from "./csv.util";

export interface AnalyticsExportResult {
  readonly filename: string;
  readonly csv: string;
}

/**
 * Data Analyst -- Exports (docs/detailed-specs/data-analyst.md's Saved
 * Views / Exports page). Deliberately re-runs the same `build()` each
 * analytical page itself calls rather than caching or re-deriving a
 * second time: the file always reflects exactly what that page is
 * currently allowed to show, never a separately-maintained export-only
 * view of the same data.
 *
 * Gated twice, both real: `analytics.export` (the permission key, denied
 * outright when the plan's `allowedExports` is empty -- see
 * PlanEntitlementLayer) and then, here, the specific category against
 * that same `allowedExports` list -- a plan can permit exporting
 * Operations without permitting Finance-adjacent categories.
 */
@Injectable()
export class AnalyticsExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly operations: OperationsAnalyticsService,
    private readonly people: PeopleAnalyticsService,
    private readonly inventory: InventoryAnalyticsService,
    private readonly decisions: DecisionsAnalyticsService,
    private readonly featureAdoption: FeatureAdoptionAnalyticsService,
  ) {}

  async export(
    tenantId: string,
    session: SessionContext,
    category: string,
    canViewCost: boolean,
    params: ReportQueryParams,
  ): Promise<AnalyticsExportResult> {
    if (!isSourcePage(category)) {
      throw new ForbiddenException({ code: "export_category_invalid", message: "Unknown export category." });
    }

    await this.assertPlanAllows(tenantId, category);

    const scope = resolveScope(session);
    const report = await this.buildReport(category, tenantId, scope, canViewCost, params);
    const csv = reportToCsv(report as Record<string, unknown>);
    const filename = `${category.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;

    await this.audit.record({
      tenantId,
      actorId: session.accountId,
      actorType: "TENANT_STAFF",
      actorName: session.displayName,
      targetType: "AnalyticsExport",
      targetId: category,
      action: "analytics.export.generated",
      after: { category, from: params.from ?? null, to: params.to ?? null },
      riskLevel: "LOW",
    });

    return { filename, csv };
  }

  private async assertPlanAllows(tenantId: string, category: AnalystSavedViewSourcePageValue): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: { select: { allowedExports: true } } },
    });
    if (!tenant?.plan.allowedExports.includes(category)) {
      throw new ForbiddenException({
        code: "export_category_not_allowed",
        message: "This workshop's plan does not allow exporting this category.",
      });
    }
  }

  private buildReport(
    category: AnalystSavedViewSourcePageValue,
    tenantId: string,
    scope: AnalyticsScope,
    canViewCost: boolean,
    params: ReportQueryParams,
  ): Promise<object> {
    switch (category) {
      case "OPERATIONS":
        return this.operations.build(tenantId, scope, params);
      case "PEOPLE":
        return this.people.build(tenantId, scope, params);
      case "INVENTORY":
        return this.inventory.build(tenantId, scope, canViewCost);
      case "DECISIONS":
        return this.decisions.build(tenantId, scope, params);
      case "FEATURE_ADOPTION":
        return this.featureAdoption.build(tenantId, params);
    }
  }
}

function isSourcePage(value: string): value is AnalystSavedViewSourcePageValue {
  return (ANALYST_SAVED_VIEW_SOURCE_PAGES as readonly string[]).includes(value);
}
