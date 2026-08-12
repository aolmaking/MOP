import { Body, Controller, ForbiddenException, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import type { SessionContext } from "@mop/shared";
import { SessionGuard } from "../auth/session.guard";
import { CurrentSession } from "../auth/current-session.decorator";
import { EffectiveAccessService } from "../access/effective-access.service";
import { InventoryViewService } from "./inventory-view.service";
import { PartRequestService } from "./part-request.service";
import { IssueDto, ReturnDto } from "./inventory.dto";
import { CatalogItemDto } from "./catalog.dto";
import { InventoryHomeService } from "./inventory-home.service";
import { CatalogService } from "./catalog.service";
import { InventoryReportsService } from "./inventory-reports.service";

/**
 * The inventory manager's surfaces.
 *
 * Scope is the tenant, not a branch: stock belongs to the workshop, and a
 * store that could only see one branch's requests would leave the other
 * branch's technicians waiting on nobody.
 */
@Controller("inventory")
@UseGuards(SessionGuard)
export class InventoryController {
  constructor(
    private readonly view: InventoryViewService,
    private readonly parts: PartRequestService,
    private readonly access: EffectiveAccessService,
    private readonly home: InventoryHomeService,
    private readonly catalog: CatalogService,
    private readonly reports: InventoryReportsService,
  ) {}

  /** Daily triage. Counts are per warehouse, never blended. */
  @Get("home")
  async inventoryHome(@CurrentSession() session: SessionContext) {
    const tenantId = await this.require(session, "inventory.home.view");
    return this.home.build(tenantId, session.warehouseScope);
  }

  @Get("catalog")
  async catalogList(
    @CurrentSession() session: SessionContext,
    @Query("q") query?: string,
    @Query("category") category?: string,
    @Query("stockTracked") stockTracked?: string,
    @Query("page") page?: string,
  ) {
    const tenantId = await this.require(session, "inventory.catalog.manage");
    return this.catalog.list(
      tenantId,
      {
        query,
        category,
        stockTracked: stockTracked === undefined ? undefined : stockTracked === "true",
        page: page ? Number(page) : 1,
      },
      await this.maySeeCost(session),
    );
  }

  @Get("catalog/:id")
  async catalogGet(@CurrentSession() session: SessionContext, @Param("id") id: string) {
    const tenantId = await this.require(session, "inventory.catalog.manage");
    return this.catalog.get(tenantId, id, await this.maySeeCost(session));
  }

  @Post("catalog")
  async catalogCreate(@CurrentSession() session: SessionContext, @Body() dto: CatalogItemDto) {
    const tenantId = await this.require(session, "inventory.catalog.manage");
    return this.catalog.create(tenantId, dto, await this.maySeeCost(session));
  }

  @Post("catalog/:id")
  async catalogUpdate(
    @CurrentSession() session: SessionContext,
    @Param("id") id: string,
    @Body() dto: CatalogItemDto,
  ) {
    const tenantId = await this.require(session, "inventory.catalog.manage");
    return this.catalog.update(tenantId, id, dto, await this.maySeeCost(session));
  }

  @Get("reports")
  async inventoryReports(@CurrentSession() session: SessionContext) {
    const tenantId = await this.require(session, "reports.inventory.view");
    return this.reports.build(tenantId, session.warehouseScope);
  }

  /**
   * Cost is hidden unless explicitly granted -- the same discipline as the
   * technician's price gate, applied to the inventory side. Checked here
   * rather than in the service, so a caller cannot forget to ask.
   */
  private async maySeeCost(session: SessionContext): Promise<boolean> {
    return this.access.can(session, "inventory.cost.view");
  }

  @Get("requests")
  async requests(@CurrentSession() session: SessionContext) {
    const tenantId = await this.require(session, "inventory.requests.view");
    return { requests: await this.view.waiting(tenantId) };
  }

  @Get("stock")
  async stock(@CurrentSession() session: SessionContext, @Query("q") query?: string) {
    const tenantId = await this.require(session, "inventory.home.view");
    return this.view.stockTable(tenantId, query);
  }

  @Get("items/:id")
  async item(@CurrentSession() session: SessionContext, @Param("id") id: string) {
    const tenantId = await this.require(session, "inventory.home.view");
    return this.view.item(tenantId, id);
  }

  @Post("requests/:id/approve")
  async approve(@CurrentSession() session: SessionContext, @Param("id") id: string) {
    await this.require(session, "inventory.request.approve");
    return this.parts.approve(id, this.actor(session));
  }

  @Post("requests/:id/reject")
  async reject(@CurrentSession() session: SessionContext, @Param("id") id: string, @Body() body: { reason?: string }) {
    await this.require(session, "inventory.request.reject");
    return this.parts.reject(id, this.actor(session), body?.reason);
  }

  @Post("requests/:id/unavailable")
  async unavailable(@CurrentSession() session: SessionContext, @Param("id") id: string) {
    await this.require(session, "inventory.request.mark_unavailable");
    return this.parts.markUnavailable(id, this.actor(session));
  }

  /** Hand a part over. May be partial -- see PHASE_7.md section 2. */
  @Post("requests/:id/issue")
  async issue(@CurrentSession() session: SessionContext, @Param("id") id: string, @Body() dto: IssueDto) {
    await this.require(session, "inventory.request.issue");
    return this.parts.issue(
      { partRequestId: id, warehouseId: dto.warehouseId, quantity: dto.quantity },
      this.actor(session),
    );
  }

  @Post("requests/:id/return")
  async completeReturn(@CurrentSession() session: SessionContext, @Param("id") id: string, @Body() dto: ReturnDto) {
    await this.require(session, "inventory.request.issue");
    await this.parts.completeReturn(id, dto.warehouseId, dto.quantity, this.actor(session), {
      damaged: dto.damaged ?? false,
    });
    return { ok: true as const };
  }

  private actor(session: SessionContext) {
    return {
      accountId: session.accountId,
      displayName: session.displayName,
      actorType: "TENANT_STAFF" as const,
    };
  }

  private async require(session: SessionContext, permission: string): Promise<string> {
    const allowed = await this.access.can(session, permission);
    if (!allowed || !session.tenantId) {
      throw new ForbiddenException({ code: "forbidden", message: "You do not have access to inventory." });
    }
    return session.tenantId;
  }
}
