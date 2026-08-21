import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import type { SessionContext } from "@mop/shared";
import { SessionGuard } from "../../identity/auth/session.guard";
import { PlatformGuard } from "../../identity/auth/platform.guard";
import { CurrentSession } from "../../identity/auth/current-session.decorator";
import { RolePermissionLockService } from "./role-permission-lock.service";
import { SetRoleLockDto, RemoveRoleLockDto } from "./role-permission-lock.dto";

/**
 * The write path for `role_permission_lock`, per-tenant, platform-only.
 * Not exposed to any tenant session -- this is Platform Super Admin's own
 * governance surface, the same trust boundary `WorkshopsController`'s
 * freeze/reactivate already uses (`SessionGuard` then `PlatformGuard`,
 * never `EffectiveAccessService`, since a platform session has no
 * tenant-scoped permission set for the resolver to evaluate).
 */
@Controller("platform/governance/workshops/:tenantId/role-locks")
@UseGuards(SessionGuard, PlatformGuard)
export class RolePermissionLockController {
  constructor(private readonly locks: RolePermissionLockService) {}

  @Get()
  list(@Param("tenantId") tenantId: string) {
    return this.locks.listActive(tenantId);
  }

  @Get("history")
  history(@Param("tenantId") tenantId: string) {
    return this.locks.history(tenantId);
  }

  @Post()
  set(@Param("tenantId") tenantId: string, @Body() dto: SetRoleLockDto, @CurrentSession() session: SessionContext) {
    return this.locks.lock(tenantId, dto.role, dto.permissionKey, dto.allowed, dto.reason, session.accountId, session.displayName);
  }

  @Post("remove")
  remove(@Param("tenantId") tenantId: string, @Body() dto: RemoveRoleLockDto, @CurrentSession() session: SessionContext) {
    return this.locks.unlock(tenantId, dto.role, dto.permissionKey, session.accountId, session.displayName, dto.reason);
  }
}
