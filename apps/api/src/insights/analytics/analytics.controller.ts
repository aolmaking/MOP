import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import type { SessionContext } from "@mop/shared";
import { SessionGuard } from "../../identity/auth/session.guard";
import { CurrentSession } from "../../identity/auth/current-session.decorator";
import { EffectiveAccessService } from "../../identity/access/effective-access.service";
import { resolveScope } from "./analytics-scope.util";
import { AnalyticsHomeService } from "./analytics-home.service";
import { OperationsAnalyticsService } from "./operations-analytics.service";
import { PeopleAnalyticsService } from "./people-analytics.service";
import { InventoryAnalyticsService } from "./inventory-analytics.service";
import { DecisionsAnalyticsService } from "./decisions-analytics.service";
import { FeatureAdoptionAnalyticsService } from "./feature-adoption-analytics.service";
import { AnalystSavedViewsService } from "./saved-views.service";
import { CreateAnalystSavedViewDto, RenameAnalystSavedViewDto } from "./saved-views.dto";
import { AnalyticsExportService } from "./analytics-export.service";
import { QualityAnalyticsService } from "./quality-analytics.service";
import { RootCauseAnalysisService } from "./root-cause-analysis.service";
import { UniversalDrillDownService } from "./universal-drill-down.service";
import type { DiagnosticSubject } from "./root-cause-analysis.types";
import type { DrillDownQuery, EvidenceEntityType } from "./drill-down.types";

/**
 * Data Analyst (docs/detailed-specs/data-analyst.md) -- analytical views
 * each have their own query shape, per that spec's own explicit warning
 * against the previous build's "7 routes, 1 generic component" mistake.
 * The only writes here persist the analyst's own saved view configuration;
 * no endpoint mutates workshop operations, inventory, finance, or workflow.
 */
@Controller("analytics")
@UseGuards(SessionGuard)
export class AnalyticsController {
  constructor(
    private readonly home: AnalyticsHomeService,
    private readonly operations: OperationsAnalyticsService,
    private readonly people: PeopleAnalyticsService,
    private readonly inventory: InventoryAnalyticsService,
    private readonly decisions: DecisionsAnalyticsService,
    private readonly quality: QualityAnalyticsService,
    private readonly rootCause: RootCauseAnalysisService,
    private readonly drillDownService: UniversalDrillDownService,
    private readonly featureAdoption: FeatureAdoptionAnalyticsService,
    private readonly savedViews: AnalystSavedViewsService,
    private readonly exportService: AnalyticsExportService,
    private readonly access: EffectiveAccessService,
  ) {}

  @Get("home")
  async getHome(@CurrentSession() session: SessionContext, @Query("from") from?: string, @Query("to") to?: string) {
    const tenantId = await this.require(session, "analytics.home.view");
    return this.wrap(() => this.home.build(tenantId, resolveScope(session), { from, to }));
  }

  @Get("operations")
  async getOperations(
    @CurrentSession() session: SessionContext,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("groupBy") groupBy?: string,
  ) {
    const tenantId = await this.require(session, "analytics.operations.view");
    return this.wrap(() => this.operations.build(tenantId, resolveScope(session), { from, to, groupBy }));
  }

  @Get("people")
  async getPeople(@CurrentSession() session: SessionContext, @Query("from") from?: string, @Query("to") to?: string) {
    const tenantId = await this.require(session, "analytics.people.view");
    return this.wrap(() => this.people.build(tenantId, resolveScope(session), { from, to }));
  }

  @Get("inventory")
  async getInventory(@CurrentSession() session: SessionContext) {
    await this.require(session, "analytics.inventory.view");
    const canViewCost = await this.access.can(session, "inventory.cost.view");
    return this.inventory.build(session.tenantId!, resolveScope(session), canViewCost);
  }

  @Get("decisions")
  async getDecisions(@CurrentSession() session: SessionContext, @Query("from") from?: string, @Query("to") to?: string) {
    const tenantId = await this.require(session, "analytics.decisions.view");
    return this.wrap(() => this.decisions.build(tenantId, resolveScope(session), { from, to }));
  }

  @Get("quality")
  async getQuality(
    @CurrentSession() session: SessionContext,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("branchId") branchId?: string,
  ) {
    const tenantId = await this.require(session, "analytics.operations.view");
    return this.wrap(() => this.quality.build(tenantId, resolveScope(session), { from, to, branchId }));
  }

  @Get("root-cause")
  async getRootCause(
    @CurrentSession() session: SessionContext,
    @Query("subject") subject?: DiagnosticSubject,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("branchId") branchId?: string,
    @Query("serviceKey") serviceKey?: string,
    @Query("technicianId") technicianId?: string,
    @Query("workOrderId") workOrderId?: string,
  ) {
    const tenantId = await this.require(session, "analytics.operations.view");
    return this.wrap(() =>
      this.rootCause.analyze(tenantId, resolveScope(session), {
        subject,
        from,
        to,
        branchId,
        serviceKey,
        technicianId,
        workOrderId,
      }),
    );
  }

  @Get("feature-adoption")
  async getFeatureAdoption(
    @CurrentSession() session: SessionContext,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    const tenantId = await this.require(session, "analytics.feature_adoption.view");
    return this.wrap(() => this.featureAdoption.build(tenantId, { from, to }));
  }

  @Get("export/:category")
  async exportCsv(
    @CurrentSession() session: SessionContext,
    @Param("category") category: string,
    @Res() res: Response,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("groupBy") groupBy?: string,
  ): Promise<void> {
    const tenantId = await this.require(session, "analytics.export");
    const canViewCost = await this.access.can(session, "inventory.cost.view");

    const result = await this.exportService.export(tenantId, session, category, canViewCost, { from, to, groupBy });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.send(result.csv);
  }

  @Get("drill-down")
  async getDrillDown(
    @CurrentSession() session: SessionContext,
    @Query("metric") metric: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("branchId") branchId?: string,
    @Query("serviceKey") serviceKey?: string,
    @Query("technicianId") technicianId?: string,
    @Query("workOrderId") workOrderId?: string,
    @Query("dimension") dimension?: string,
    @Query("dimensionValue") dimensionValue?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    const tenantId = await this.require(session, "analytics.home.view");
    return this.wrap(() =>
      this.drillDownService.drillDown(tenantId, resolveScope(session), {
        metric,
        from,
        to,
        branchId,
        serviceKey,
        technicianId,
        workOrderId,
        dimension,
        dimensionValue,
        cursor,
        limit: limit ? parseInt(limit, 10) : undefined,
      }),
    );
  }

  @Get("drill-down/export")
  async exportDrillDownCsv(
    @CurrentSession() session: SessionContext,
    @Res() res: Response,
    @Query("metric") metric: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("branchId") branchId?: string,
    @Query("serviceKey") serviceKey?: string,
    @Query("technicianId") technicianId?: string,
    @Query("workOrderId") workOrderId?: string,
    @Query("dimension") dimension?: string,
    @Query("dimensionValue") dimensionValue?: string,
  ): Promise<void> {
    const tenantId = await this.require(session, "analytics.export");
    const result = await this.drillDownService.exportCsv(tenantId, resolveScope(session), {
      metric,
      from,
      to,
      branchId,
      serviceKey,
      technicianId,
      workOrderId,
      dimension,
      dimensionValue,
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.send(result.csv);
  }

  @Get("drill-down/evidence/:type/:id")
  async getEvidence(
    @CurrentSession() session: SessionContext,
    @Param("type") type: EvidenceEntityType,
    @Param("id") id: string,
  ) {
    const tenantId = await this.require(session, "analytics.home.view");
    return this.wrap(() => this.drillDownService.resolveEvidence(tenantId, resolveScope(session), type, id));
  }

  @Get("saved-views")
  async listSavedViews(@CurrentSession() session: SessionContext) {
    const tenantId = await this.require(session, "analytics.saved_views.manage");
    return { items: await this.savedViews.list(tenantId, session.accountId) };
  }

  @Get("saved-views/:id")
  async getSavedView(@CurrentSession() session: SessionContext, @Param("id") id: string) {
    const tenantId = await this.require(session, "analytics.saved_views.manage");
    return this.savedViews.get(tenantId, session.accountId, id);
  }

  @Post("saved-views")
  async createSavedView(@CurrentSession() session: SessionContext, @Body() dto: CreateAnalystSavedViewDto) {
    const tenantId = await this.require(session, "analytics.saved_views.manage");
    return this.savedViews.create(tenantId, session.accountId, {
      name: dto.name,
      sourcePage: dto.sourcePage,
      configuration: dto.configuration,
    });
  }

  @Patch("saved-views/:id")
  async renameSavedView(
    @CurrentSession() session: SessionContext,
    @Param("id") id: string,
    @Body() dto: RenameAnalystSavedViewDto,
  ) {
    const tenantId = await this.require(session, "analytics.saved_views.manage");
    return this.savedViews.rename(tenantId, session.accountId, id, dto.name);
  }

  @Delete("saved-views/:id")
  async deleteSavedView(@CurrentSession() session: SessionContext, @Param("id") id: string) {
    const tenantId = await this.require(session, "analytics.saved_views.manage");
    return this.savedViews.remove(tenantId, session.accountId, id);
  }

  private async wrap<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof Error && (error.message === "invalid_date_range" || error.message === "date_range_reversed")) {
        throw new BadRequestException({ code: error.message, message: "Check the date range and try again." });
      }
      throw error;
    }
  }

  private async require(session: SessionContext, permissionKey: string): Promise<string> {
    const allowed = await this.access.can(session, permissionKey);
    if (!allowed || !session.tenantId) {
      throw new ForbiddenException({ code: "forbidden", message: "You do not have access to this analytics page." });
    }
    return session.tenantId;
  }
}
