import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { AccessService } from "../access/access.service";
import { SessionGuard } from "../auth/session.guard";
import type { RequestWithSession } from "../tenancy/session-context";
import { CrossRoleActionContractsService } from "./cross-role-action-contracts.service";
import { WorkflowHealthService } from "./workflow-health.service";

@Controller("operations")
@UseGuards(SessionGuard)
export class OperationsController {
  constructor(
    private readonly access: AccessService,
    private readonly contracts: CrossRoleActionContractsService,
    private readonly workflowHealth: WorkflowHealthService
  ) {}

  @Get("contracts")
  contractsList(@Req() req: RequestWithSession) {
    this.access.assert("operations.contracts.view", req.session);
    return this.contracts.list();
  }

  @Get("health")
  health(@Req() req: RequestWithSession) {
    this.access.assert("operations.health.view", req.session);
    return this.workflowHealth.inspect(req.session);
  }
}
