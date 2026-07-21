import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AccessService } from "../../access/access.service";
import { SessionGuard } from "../../auth/session.guard";
import type { RequestWithSession } from "../../tenancy/session-context";
import { BranchManagerService } from "./branch-manager.service";

@Controller("branch-manager")
@UseGuards(SessionGuard)
export class BranchManagerController {
  constructor(
    private readonly branchManager: BranchManagerService,
    private readonly access: AccessService
  ) {}

  @Get("home")
  home(@Req() req: RequestWithSession) {
    this.access.assert("branch.operations.view", req.session);
    return this.branchManager.home(req.session);
  }

  @Get("intake-options")
  intakeOptions(@Req() req: RequestWithSession) {
    this.access.assert("branch.intake.manage", req.session);
    return this.branchManager.intakeOptions(req.session);
  }

  @Post("intake")
  createIntake(@Req() req: RequestWithSession, @Body() body: unknown) {
    this.access.assert("branch.intake.manage", req.session);
    this.access.assert("branch.customer.create", req.session);
    this.access.assert("branch.asset.register", req.session);
    this.access.assert("branch.work_order.create", req.session);
    return this.branchManager.createIntake(req.session, body);
  }

  @Get("work-orders")
  workOrders(@Req() req: RequestWithSession, @Query("group") group?: string) {
    this.access.assert("branch.operations.view", req.session);
    return this.branchManager.workOrders(req.session, group);
  }

  @Get("work-orders/:id")
  workspace(@Req() req: RequestWithSession, @Param("id") id: string) {
    this.access.assert("branch.operations.view", req.session);
    return this.branchManager.workspace(req.session, id);
  }

  @Post("work-orders/:id/action")
  workOrderAction(@Req() req: RequestWithSession, @Param("id") id: string, @Body() body: unknown) {
    return this.branchManager.workOrderAction(req.session, id, body);
  }

  @Get("decisions")
  decisions(@Req() req: RequestWithSession) {
    this.access.assert("customer_decision.view_staff", req.session);
    return this.branchManager.decisions(req.session);
  }

  @Post("decisions/:id/action")
  decisionAction(@Req() req: RequestWithSession, @Param("id") id: string, @Body() body: unknown) {
    return this.branchManager.decisionAction(req.session, id, body);
  }

  @Get("delivery")
  delivery(@Req() req: RequestWithSession) {
    this.access.assert("branch.delivery.view", req.session);
    return this.branchManager.delivery(req.session);
  }

  @Post("delivery/:id/action")
  deliveryAction(@Req() req: RequestWithSession, @Param("id") id: string, @Body() body: unknown) {
    return this.branchManager.deliveryAction(req.session, id, body);
  }
}
