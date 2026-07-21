import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import type { CreateStaffUserDto } from "@mop/shared";
import { AccessService } from "../../access/access.service";
import { SessionGuard } from "../../auth/session.guard";
import type { RequestWithSession } from "../../tenancy/session-context";
import { IdentityService } from "./identity.service";

@Controller("identity")
@UseGuards(SessionGuard)
export class IdentityController {
  constructor(
    private readonly identity: IdentityService,
    private readonly access: AccessService
  ) {}

  @Get("staff-users")
  staffUsers(@Req() req: RequestWithSession) {
    this.access.assert("tenant.users.read", req.session);
    return this.identity.staffUsers(req.session);
  }

  @Get("staff-creation-options")
  creationOptions(@Req() req: RequestWithSession) {
    this.access.assert("tenant.users.read", req.session);
    return this.identity.creationOptions(req.session);
  }

  @Post("staff-users")
  createStaffUser(@Req() req: RequestWithSession, @Body() body: CreateStaffUserDto) {
    this.access.assert("organization.users.invite", req.session);
    return this.identity.createStaffUser(req.session, body);
  }
}
