import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { AccessService } from "../../access/access.service";
import { SessionGuard } from "../../auth/session.guard";
import type { RequestWithSession } from "../../tenancy/session-context";
import { WorkOrdersService } from "./work-orders.service";

@Controller("work-orders")
@UseGuards(SessionGuard)
export class WorkOrdersController {
  constructor(
    private readonly workOrders: WorkOrdersService,
    private readonly access: AccessService
  ) {}

  @Get()
  list(@Req() req: RequestWithSession) {
    if (req.session.accountType === "customer") {
      this.access.assert("customer.work_order.view_summary", req.session);
    } else {
      this.access.assert("workorders.view", req.session);
    }
    return this.workOrders.list(req.session);
  }
}
