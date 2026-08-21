import { BadRequestException, Controller, ForbiddenException, Get, Query, UseGuards } from "@nestjs/common";
import type { SessionContext } from "@mop/shared";
import { SessionGuard } from "../identity/auth/session.guard";
import { CurrentSession } from "../identity/auth/current-session.decorator";
import { EffectiveAccessService } from "../identity/access/effective-access.service";
import { resolveScope } from "./analytics-scope.util";
import { AnalyticsHomeService } from "./analytics-home.service";
import { OperationsAnalyticsService } from "./operations-analytics.service";
import { PeopleAnalyticsService } from "./people-analytics.service";
import { InventoryAnalyticsService } from "./inventory-analytics.service";
import { DecisionsAnalyticsService } from "./decisions-analytics.service";
import { FeatureAdoptionAnalyticsService } from "./feature-adoption-analytics.service";

/**
 * Data Analyst (docs/detailed-specs/data-analyst.md) -- 6 real analytical
 * views, each with its own query shape, per that spec's own explicit
 * warning against the previous build's "7 routes, 1 generic component"
 * mistake. Read-only: not one write endpoint exists in this controller.
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
