import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { SessionContext } from "@mop/shared";
import type { Response } from "express";
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
import { ANALYST_SAVED_VIEW_SOURCE_PAGES } from "./saved-views.constants";

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
    private readonly featureAdoption: FeatureAdoptionAnalyticsService,
    private readonly savedViews: AnalystSavedViewsService,
    private readonly exports: AnalyticsExportService,
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

  @Get("feature-adoption")
  async getFeatureAdoption(
    @CurrentSession() session: SessionContext,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    const tenantId = await this.require(session, "analytics.feature_adoption.view");
    return this.wrap(() => this.featureAdoption.build(tenantId, { from, to }));
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

  @Get("export")
  async exportCsv(
    @CurrentSession() session: SessionContext,
    @Res({ passthrough: true }) res: Response,
    @Query("sourcePage") sourcePage: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("groupBy") groupBy?: string,
  ): Promise<string> {
    const tenantId = await this.require(session, "analytics.export");
    if (!isAnalystExportSource(sourcePage)) {
      throw new BadRequestException({ code: "invalid_export_source", message: "Choose a valid analytical page to export." });
    }

    const canViewCost = await this.access.can(session, "inventory.cost.view");
    const file = await this.wrap(() => this.exports.buildCsv(tenantId, resolveScope(session), sourcePage, { from, to, groupBy }, canViewCost));
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
    return file.content;
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

function isAnalystExportSource(value: string): value is (typeof ANALYST_SAVED_VIEW_SOURCE_PAGES)[number] {
  return (ANALYST_SAVED_VIEW_SOURCE_PAGES as readonly string[]).includes(value);
}
