import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import type { SessionContext } from "@mop/shared";
import { SessionGuard } from "../../identity/auth/session.guard";
import { PlatformGuard } from "../../identity/auth/platform.guard";
import { CurrentSession } from "../../identity/auth/current-session.decorator";
import { TenantEntitlementsService } from "../entitlements/tenant-entitlements.service";
import { ClearEntitlementOverrideDto, SetEntitlementOverrideDto } from "./tenant-entitlements.dto";

@Controller("platform/governance/workshops/:tenantId/entitlements")
@UseGuards(SessionGuard, PlatformGuard)
export class TenantEntitlementsController {
  constructor(private readonly entitlements: TenantEntitlementsService) {}

  @Get()
  current(@Param("tenantId") tenantId: string) {
    return this.entitlements.current(tenantId);
  }

  @Post()
  set(@Param("tenantId") tenantId: string, @Body() dto: SetEntitlementOverrideDto, @CurrentSession() session: SessionContext) {
    const actor = { accountId: session.accountId, displayName: session.displayName };
    if (dto.field === "allowedExports") {
      if (!dto.stringValues) {
        throw new BadRequestException({ code: "string_values_required", message: "Choose the allowed export categories." });
      }
      return this.entitlements.setListOverride(tenantId, dto.field, dto.stringValues, dto.reason, actor);
    }
    if (dto.numericValue === undefined) {
      throw new BadRequestException({ code: "numeric_value_required", message: "Enter a numeric entitlement override." });
    }
    return this.entitlements.setNumberOverride(tenantId, dto.field, dto.numericValue, dto.reason, actor);
  }

  @Post("clear")
  clear(@Param("tenantId") tenantId: string, @Body() dto: ClearEntitlementOverrideDto, @CurrentSession() session: SessionContext) {
    return this.entitlements.clearOverride(tenantId, dto.field, dto.reason, {
      accountId: session.accountId,
      displayName: session.displayName,
    });
  }
}
