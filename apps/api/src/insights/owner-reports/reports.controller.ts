import { BadRequestException, Controller, ForbiddenException, Get, Query, UseGuards } from "@nestjs/common";
import type { SessionContext } from "@mop/shared";
import { SessionGuard } from "../../identity/auth/session.guard";
import { CurrentSession } from "../../identity/auth/current-session.decorator";
import { EffectiveAccessService } from "../../identity/access/effective-access.service";
import { ReportsOverviewService } from "./reports-overview.service";
import { ReportsOperationsService } from "./reports-operations.service";
import { ReportsFinancialService } from "./reports-financial.service";
import { ReportsInventoryService } from "./reports-inventory.service";
import { ReportsCustomersService } from "./reports-customers.service";
import { ActionDeckService } from "./action-deck.service";
import { ReportsLaborService } from "./reports-labor.service";
import { ReportsPipelineService } from "./reports-pipeline.service";
import { ReportsSalesConversionService } from "./reports-sales-conversion.service";

/**
 * Owner's Reports & Analytics (docs/detailed-specs/tenant-owner.md).
 * Serves Tier 1 (Home Pulse & Action Deck) and Tier 2 (Deep Intelligence Center).
 */
@Controller("organization/reports")
@UseGuards(SessionGuard)
export class ReportsController {
  constructor(
    private readonly overview: ReportsOverviewService,
    private readonly operations: ReportsOperationsService,
    private readonly financial: ReportsFinancialService,
    private readonly inventory: ReportsInventoryService,
    private readonly customers: ReportsCustomersService,
    private readonly actionDeck: ActionDeckService,
    private readonly labor: ReportsLaborService,
    private readonly pipeline: ReportsPipelineService,
    private readonly salesConversion: ReportsSalesConversionService,
    private readonly access: EffectiveAccessService,
  ) {}

  @Get("home-pulse")
  async getHomePulse(
    @CurrentSession() session: SessionContext,
    @Query("branchId") branchId?: string,
  ) {
    const tenantId = await this.require(session);
    return this.wrap(() => this.actionDeck.buildHomePulse(tenantId, branchId));
  }

  @Get("overview")
  async getOverview(
    @CurrentSession() session: SessionContext,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("branchId") branchId?: string,
  ) {
    const tenantId = await this.require(session);
    return this.wrap(() => this.overview.build(tenantId, { from, to, branchId }));
  }

  @Get("operations")
  async getOperations(
    @CurrentSession() session: SessionContext,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("branchId") branchId?: string,
    @Query("groupBy") groupBy?: string,
  ) {
    const tenantId = await this.require(session);
    return this.wrap(() => this.operations.build(tenantId, { from, to, branchId, groupBy }));
  }

  @Get("financial")
  async getFinancial(
    @CurrentSession() session: SessionContext,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("branchId") branchId?: string,
    @Query("groupBy") groupBy?: string,
  ) {
    const tenantId = await this.require(session);
    return this.wrap(() => this.financial.build(tenantId, { from, to, branchId, groupBy }));
  }

  @Get("labor")
  async getLabor(
    @CurrentSession() session: SessionContext,
    @Query("branchId") branchId?: string,
  ) {
    const tenantId = await this.require(session);
    return this.wrap(() => this.labor.build(tenantId, { branchId }));
  }

  @Get("pipeline")
  async getPipeline(
    @CurrentSession() session: SessionContext,
    @Query("branchId") branchId?: string,
  ) {
    const tenantId = await this.require(session);
    return this.wrap(() => this.pipeline.build(tenantId, { branchId }));
  }

  @Get("sales-conversion")
  async getSalesConversion(
    @CurrentSession() session: SessionContext,
    @Query("branchId") branchId?: string,
  ) {
    const tenantId = await this.require(session);
    return this.wrap(() => this.salesConversion.build(tenantId, { branchId }));
  }

  @Get("inventory")
  async getInventory(
    @CurrentSession() session: SessionContext,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    const tenantId = await this.require(session);
    return this.wrap(() => this.inventory.build(tenantId, { from, to }));
  }

  @Get("customers")
  async getCustomers(
    @CurrentSession() session: SessionContext,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    const tenantId = await this.require(session);
    return this.wrap(() => this.customers.build(tenantId, { from, to }));
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

  private async require(session: SessionContext): Promise<string> {
    const allowed = await this.access.can(session, "reports.owner.view");
    if (!allowed || !session.tenantId) {
      throw new ForbiddenException({ code: "forbidden", message: "You do not have access to Reports & Analytics." });
    }
    return session.tenantId;
  }
}
