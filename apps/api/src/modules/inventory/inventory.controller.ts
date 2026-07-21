import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AccessService } from "../../access/access.service";
import { SessionGuard } from "../../auth/session.guard";
import type { RequestWithSession } from "../../tenancy/session-context";
import { InventoryService } from "./inventory.service";

@Controller("inventory")
@UseGuards(SessionGuard)
export class InventoryController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly access: AccessService
  ) {}

  @Get("items")
  items(@Req() req: RequestWithSession) {
    this.access.assert("inventory.catalog.view", req.session);
    return this.inventory.items(req.session);
  }

  @Get("part-requests")
  requests(@Req() req: RequestWithSession) {
    this.access.assert("inventory.requests.view", req.session);
    return this.inventory.partRequests(req.session);
  }

  @Get("home")
  home(@Req() req: RequestWithSession) {
    this.access.assert("inventory.home.view", req.session);
    return this.inventory.home(req.session);
  }

  @Get("technician-requests")
  technicianRequests(@Req() req: RequestWithSession) {
    this.access.assert("inventory.requests.view", req.session);
    return this.inventory.technicianRequests(req.session);
  }

  @Post("technician-requests/:id/action")
  requestAction(@Req() req: RequestWithSession, @Param("id") id: string, @Body() body: any) {
    this.access.assert("inventory.requests.view", req.session);
    return this.inventory.requestAction(req.session, id, body);
  }

  @Post("catalog/items")
  createItem(@Req() req: RequestWithSession, @Body() body: any) {
    this.access.assert("inventory.item.create", req.session);
    return this.inventory.createItem(req.session, body);
  }

  @Post("catalog/items/:id/action")
  itemAction(@Req() req: RequestWithSession, @Param("id") id: string, @Body() body: any) {
    this.access.assert("inventory.catalog.view", req.session);
    return this.inventory.itemAction(req.session, id, body);
  }

  @Get("stock-status")
  stockStatus(@Req() req: RequestWithSession) {
    this.access.assert("inventory.stock.view", req.session);
    return this.inventory.stockStatus(req.session);
  }

  @Get("movements")
  movements(@Req() req: RequestWithSession) {
    this.access.assert("inventory.stock.ledger.view", req.session);
    return this.inventory.movements(req.session);
  }

  @Get("returns")
  returns(@Req() req: RequestWithSession) {
    this.access.assert("inventory.stock.return", req.session);
    return this.inventory.returns(req.session);
  }

  @Post("returns/:id/action")
  returnAction(@Req() req: RequestWithSession, @Param("id") id: string, @Body() body: any) {
    this.access.assert("inventory.stock.return", req.session);
    return this.inventory.returnAction(req.session, id, body);
  }

  @Get("procurement")
  procurement(@Req() req: RequestWithSession) {
    this.access.assert("inventory.transfer.create", req.session);
    return this.inventory.procurement(req.session);
  }

  @Get("reports-lite")
  reports(@Req() req: RequestWithSession) {
    this.access.assert("reports.inventory.view", req.session);
    return this.inventory.reports(req.session);
  }
}
