import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AccessService } from "../../access/access.service";
import { SessionGuard } from "../../auth/session.guard";
import type { RequestWithSession } from "../../tenancy/session-context";
import { FinanceService } from "./finance.service";

@Controller("finance")
@UseGuards(SessionGuard)
export class FinanceController {
  constructor(private readonly finance: FinanceService, private readonly access: AccessService) {}

  @Get("configuration")
  configuration(@Req() req: RequestWithSession) {
    this.access.assert("finance.configuration.view", req.session);
    return this.finance.configuration(req.session);
  }

  @Post("configuration")
  updateConfiguration(@Req() req: RequestWithSession, @Body() body: unknown) {
    this.access.assert("finance.configuration.manage", req.session);
    return this.finance.updateConfiguration(req.session, body);
  }

  @Get("catalog")
  catalog(@Req() req: RequestWithSession, @Query("branchId") branchId?: string) {
    this.access.assert("finance.catalog.view", req.session);
    return this.finance.catalog(req.session, branchId);
  }

  @Post("catalog")
  upsertCatalog(@Req() req: RequestWithSession, @Body() body: unknown) {
    this.access.assert("finance.catalog.manage", req.session);
    return this.finance.upsertCatalogItem(req.session, body);
  }

  @Post("catalog/:id/price")
  setPrice(@Req() req: RequestWithSession, @Param("id") id: string, @Body() body: unknown) {
    this.access.assert("finance.catalog.manage", req.session);
    return this.finance.setPrice(req.session, id, body);
  }

  @Post("catalog/:id/inventory-price")
  setInventoryPrice(@Req() req: RequestWithSession, @Param("id") id: string, @Body() body: unknown) {
    this.access.assert("finance.catalog.view", req.session);
    return this.finance.setInventoryManagedPrice(req.session, id, body);
  }

  @Post("work-orders/:id/quotes")
  createQuote(@Req() req: RequestWithSession, @Param("id") id: string, @Body() body: unknown) {
    this.access.assert("customer_decision.create", req.session);
    return this.finance.createQuote(req.session, id, body);
  }

  @Post("quotes/:id/send")
  sendQuote(@Req() req: RequestWithSession, @Param("id") id: string) {
    this.access.assert("customer_decision.send", req.session);
    return this.finance.sendQuote(req.session, id);
  }

  @Post("quotes/:id/decision")
  decideQuote(@Req() req: RequestWithSession, @Param("id") id: string, @Body() body: unknown) {
    if (req.session.accountType !== "customer") this.access.assert("customer_decision.manual_record", req.session);
    return this.finance.decideQuote(req.session, id, body);
  }

  @Get("work-orders/:id")
  workOrder(@Req() req: RequestWithSession, @Param("id") id: string) {
    this.access.assert("finance.invoice.view", req.session);
    return this.finance.workOrderFinance(req.session, id);
  }

  @Post("work-orders/:id/lines")
  addLine(@Req() req: RequestWithSession, @Param("id") id: string, @Body() body: unknown) {
    this.access.assert("finance.invoice.view", req.session);
    return this.finance.addRunningLine(req.session, id, body);
  }

  @Post("running-lines/:id/reverse")
  reverseLine(@Req() req: RequestWithSession, @Param("id") id: string, @Body() body: any) {
    this.access.assert("finance.invoice.view", req.session);
    return this.finance.reverseRunningLine(req.session, id, String(body?.reason || "Unused item returned"));
  }

  @Post("work-orders/:id/issue")
  issue(@Req() req: RequestWithSession, @Param("id") id: string, @Body() body: unknown) {
    this.access.assert("finance.invoice.issue", req.session);
    return this.finance.issueFinalInvoice(req.session, id, body);
  }

  @Get("invoices")
  invoices(@Req() req: RequestWithSession) {
    this.access.assert("finance.invoice.view", req.session);
    return this.finance.invoices(req.session);
  }

  @Post("invoices/:id/payments")
  payment(@Req() req: RequestWithSession, @Param("id") id: string, @Body() body: unknown) {
    this.access.assert("finance.payment.record", req.session);
    return this.finance.recordPayment(req.session, id, body);
  }

  @Post("work-orders/:id/discounts")
  discount(@Req() req: RequestWithSession, @Param("id") id: string, @Body() body: unknown) {
    this.access.assert("finance.discount.apply", req.session);
    return this.finance.requestDiscount(req.session, id, body);
  }

  @Post("discounts/:id/action")
  discountAction(@Req() req: RequestWithSession, @Param("id") id: string, @Body() body: unknown) {
    this.access.assert("finance.discount.approve", req.session);
    return this.finance.discountAction(req.session, id, body);
  }

  @Post("invoices/:id/refunds")
  refund(@Req() req: RequestWithSession, @Param("id") id: string, @Body() body: unknown) {
    this.access.assert("finance.refund.request", req.session);
    return this.finance.refund(req.session, id, body);
  }

  @Get("dashboard")
  dashboard(@Req() req: RequestWithSession) {
    this.access.assert("finance.reports.view", req.session);
    return this.finance.dashboard(req.session);
  }
}
