import { Body, Controller, ForbiddenException, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import type { SessionContext } from "@mop/shared";
import { SessionGuard } from "../auth/session.guard";
import { CurrentSession } from "../auth/current-session.decorator";
import { EffectiveAccessService } from "../access/effective-access.service";
import { InventoryViewService } from "./inventory-view.service";
import { PartRequestService } from "./part-request.service";
import { IssueDto, ReturnDto } from "./inventory.dto";

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
  ) {}

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
