import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { AccessService } from "../../access/access.service";
import { SessionGuard } from "../../auth/session.guard";
import type { RequestWithSession } from "../../tenancy/session-context";
import { AuditService } from "./audit.service";

@Controller("audit")
@UseGuards(SessionGuard)
export class AuditController {
  constructor(
    private readonly audit: AuditService,
    private readonly access: AccessService
  ) {}

  @Get()
  list(@Req() req: RequestWithSession) {
    this.access.assert("audit.read", req.session);
    return this.audit.list(req.session);
  }
}
