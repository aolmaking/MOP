import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import type { SessionContext } from "@mop/shared";
import { SessionGuard } from "../auth/session.guard";
import { CurrentSession } from "../auth/current-session.decorator";
import { EffectiveAccessService } from "../access/effective-access.service";
import { InviteStaffDto, UpdateStaffScopeDto } from "./staff.dto";
import { StaffPage, StaffService } from "./staff.service";

/**
 * Organization & Access -- Staff tab. Branches/Warehouses/Teams tabs are
 * the same page's remaining scope, not yet built (see PAGE_INVENTORY.md).
 */
@Controller("organization")
@UseGuards(SessionGuard)
export class OrganizationController {
  constructor(
    private readonly staff: StaffService,
    private readonly access: EffectiveAccessService,
  ) {}

  @Get("staff")
  async listStaff(@CurrentSession() session: SessionContext, @Query("cursor") cursor?: string): Promise<StaffPage> {
    await this.requireAccess(session);
    return this.staff.list(session.tenantId!, cursor);
  }

  @Post("staff")
  async inviteStaff(
    @CurrentSession() session: SessionContext,
    @Body() dto: InviteStaffDto,
  ): Promise<{ staffId: string }> {
    await this.requireAccess(session);
    return this.staff.invite(session.tenantId!, dto, this.actorOf(session));
  }

  @Patch("staff/:id/scope")
  async updateScope(
    @CurrentSession() session: SessionContext,
    @Param("id") id: string,
    @Body() dto: UpdateStaffScopeDto,
  ): Promise<{ ok: true }> {
    await this.requireAccess(session);
    await this.staff.updateScope(session.tenantId!, id, dto, this.actorOf(session));
    return { ok: true };
  }

  @Patch("staff/:id/active")
  async setActive(
    @CurrentSession() session: SessionContext,
    @Param("id") id: string,
    @Body() body: { isActive: boolean },
  ): Promise<{ ok: true }> {
    await this.requireAccess(session);
    await this.staff.setActive(session.tenantId!, id, body.isActive, this.actorOf(session));
    return { ok: true };
  }

  @Patch("staff/:id/locked")
  async setLocked(
    @CurrentSession() session: SessionContext,
    @Param("id") id: string,
    @Body() body: { locked: boolean },
  ): Promise<{ ok: true }> {
    await this.requireAccess(session);
    await this.staff.setLocked(session.tenantId!, id, body.locked, this.actorOf(session));
    return { ok: true };
  }

  private async requireAccess(session: SessionContext): Promise<void> {
    const allowed = await this.access.can(session, "organization.access.manage");
    if (!allowed || !session.tenantId) {
      throw new ForbiddenException({
        code: "forbidden",
        message: "You do not have access to Organization & Access.",
      });
    }
  }

  private actorOf(session: SessionContext) {
    return { accountId: session.accountId, displayName: session.displayName };
  }
}
