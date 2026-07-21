import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AccessService } from "../../access/access.service";
import { SessionGuard } from "../../auth/session.guard";
import type { RequestWithSession } from "../../tenancy/session-context";
import { CustomersService } from "./customers.service";

@Controller("customers")
@UseGuards(SessionGuard)
export class CustomersController {
  constructor(
    private readonly customers: CustomersService,
    private readonly access: AccessService
  ) {}

  @Get()
  list(@Req() req: RequestWithSession) {
    this.access.assert("branch.customer.read", req.session);
    return this.customers.list(req.session);
  }

  @Post()
  create(@Req() req: RequestWithSession, @Body() body: any) {
    this.access.assert("branch.customer.create", req.session);
    return this.customers.create(req.session, body);
  }

  @Post(":customerId/enable-portal")
  enablePortal(@Req() req: RequestWithSession, @Param("customerId") customerId: string) {
    this.access.assert("branch.customer.create", req.session);
    return this.customers.enablePortal(req.session, customerId);
  }

  @Post("assets/:assetId/transfer")
  transferAsset(@Req() req: RequestWithSession, @Param("assetId") assetId: string, @Body() body: any) {
    this.access.assert("asset.ownership.transfer", req.session);
    return this.customers.transferAsset(req.session, assetId, body.newCustomerId, body.reason);
  }
}
