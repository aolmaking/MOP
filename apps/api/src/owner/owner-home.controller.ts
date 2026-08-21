import { Controller, ForbiddenException, Get, UseGuards } from "@nestjs/common";
import type { SessionContext } from "@mop/shared";
import { SessionGuard } from "../identity/auth/session.guard";
import { CurrentSession } from "../identity/auth/current-session.decorator";
import { EffectiveAccessService } from "../identity/access/effective-access.service";
import { OwnerHomeService, type OwnerHome } from "./owner-home.service";

@Controller("owner")
@UseGuards(SessionGuard)
export class OwnerHomeController {
  constructor(
    private readonly home: OwnerHomeService,
    private readonly access: EffectiveAccessService,
  ) {}

  @Get("home")
  async ownerHome(@CurrentSession() session: SessionContext): Promise<OwnerHome> {
    const allowed = await this.access.can(session, "dashboard.owner.view");
    if (!allowed || !session.tenantId) {
      throw new ForbiddenException({ code: "forbidden", message: "You do not have access to this page." });
    }
    return this.home.build(session.tenantId);
  }
}
