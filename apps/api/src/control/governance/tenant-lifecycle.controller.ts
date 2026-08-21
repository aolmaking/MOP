import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { IsInt, IsOptional, Min } from "class-validator";
import { SessionGuard } from "../../identity/auth/session.guard";
import { PlatformGuard } from "../../identity/auth/platform.guard";
import { TenantLifecycleService } from "../tenant-relationships/tenant-lifecycle.service";

class ArchiveDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  retentionYears?: number;
}

/**
 * Governance Controls: Tenant Status (archive/reactivate). `archive()`/
 * `reactivate()` have existed on `TenantLifecycleService` since Phase 18
 * with no HTTP surface -- this is that surface, not a new lifecycle
 * mechanism. Freeze/reactivate (ACTIVE <-> FROZEN) already has its own
 * route on `WorkshopsController`; this controller owns the other half of
 * the state machine, ARCHIVED <-> READ_ONLY, deliberately kept separate
 * since the two pairs have different semantics (freeze is reversible and
 * immediate, archive carries the two-clock retention model).
 */
@Controller("platform/governance/workshops/:tenantId")
@UseGuards(SessionGuard, PlatformGuard)
export class TenantLifecycleController {
  constructor(private readonly lifecycle: TenantLifecycleService) {}

  @Post("archive")
  archive(@Param("tenantId") tenantId: string, @Body() dto: ArchiveDto) {
    return this.lifecycle.archive(tenantId, dto.retentionYears);
  }

  @Post("reactivate")
  reactivate(@Param("tenantId") tenantId: string) {
    return this.lifecycle.reactivate(tenantId);
  }
}
