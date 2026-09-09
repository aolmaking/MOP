import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { SessionGuard } from "../../identity/auth/session.guard";
import { CurrentSession } from "../../identity/auth/current-session.decorator";
import type { SessionContext } from "@mop/shared";
import { EffectiveAccessService } from "../../identity/access/effective-access.service";
import { OperatorService } from "./operator.service";
import {
  OperatorApproveRepairDto,
  OperatorDispatchRepairDto,
  OperatorIntakeDto,
  OperatorPosOrderDto,
  OperatorUpdateQuoteDto,
  RegisterCustomerVehicleDto,
} from "./operator.dto";

/**
 * Every route on this surface names the permission it needs.
 *
 * What used to be here instead was a Set of four role names, checked once for
 * all fourteen routes. That is an authorization model living above the
 * resolver rather than inside it: a workshop could not delegate reception work
 * to a role the Set does not list, could not revoke it from one it does, and
 * the OPERATIONS module being switched off changed nothing, because a Set in a
 * controller cannot see a capability. It also silently granted TENANT_OWNER and
 * TENANT_ADMIN write powers that default-role-permissions.ts deliberately
 * withholds from them.
 *
 * `EffectiveAccessService.can` runs the eleven ordered layers -- capability
 * above role, `locked` short-circuiting, deny by default -- so these answers
 * are the same ones /access/check gives the page that drew the button.
 */

@Controller("operator")
@UseGuards(SessionGuard)
export class OperatorController {
  constructor(
    private readonly operatorService: OperatorService,
    private readonly access: EffectiveAccessService,
  ) {}

  @Get("overview")
  async getOverview(@CurrentSession() session: SessionContext) {
    const { tenantId } = await this.require(session, "workorders.branch.view");
    return this.operatorService.getOverview(tenantId, session.branchScope);
  }

  @Get("search")
  async search(@CurrentSession() session: SessionContext, @Query("q") query?: string) {
    const { tenantId } = await this.require(session, "workorders.branch.view");
    return this.operatorService.searchReception(tenantId, query ?? "");
  }

  @Post("register-vehicle")
  async registerVehicle(
    @CurrentSession() session: SessionContext,
    @Body() dto: RegisterCustomerVehicleDto,
  ) {
    const { tenantId } = await this.require(session, "customer.intake.create");
    return this.operatorService.registerCustomerAndVehicle(tenantId, dto);
  }

  @Post("intake")
  async createIntake(
    @CurrentSession() session: SessionContext,
    @Body() dto: OperatorIntakeDto,
  ) {
    const { tenantId } = await this.require(session, "customer.intake.create");
    return this.operatorService.createIntake(tenantId, dto, session);
  }

  @Get("pos/catalog")
  async posCatalog(
    @CurrentSession() session: SessionContext,
    @Query("q") query?: string,
    @Query("categoryId") categoryId?: string,
    @Query("inStockOnly") inStockOnly?: string,
    @Query("page") page?: string,
  ) {
    const { tenantId } = await this.require(session, "inventory.stock.view");
    return this.operatorService.browseCatalog(tenantId, {
      query,
      categoryId,
      inStockOnly: inStockOnly === "true",
      page: page ? Number(page) : 1,
    });
  }

  @Post("pos/order")
  async createPosOrder(
    @CurrentSession() session: SessionContext,
    @Body() dto: OperatorPosOrderDto,
  ) {
    const { tenantId } = await this.require(session, "finance.counter_sale.create");
    return this.operatorService.createPosOrder(tenantId, dto, session);
  }

  @Get("inspection-reports")
  async getInspectionReports(@CurrentSession() session: SessionContext) {
    const { tenantId } = await this.require(session, "workorders.branch.view");
    return this.operatorService.getInspectionReports(tenantId, session.branchScope);
  }

  @Get("work-orders/:id/inspection-report")
  async getInspectionReportDetail(
    @CurrentSession() session: SessionContext,
    @Param("id") id: string,
  ) {
    const { tenantId, branchScope } = await this.require(session, "workorders.branch.view");
    return this.operatorService.getInspectionReportDetail(tenantId, id, branchScope);
  }

  @Post("work-orders/:id/update-quote")
  async updateQuote(
    @CurrentSession() session: SessionContext,
    @Param("id") id: string,
    @Body() dto: OperatorUpdateQuoteDto,
  ) {
    const { tenantId, branchScope } = await this.require(session, "workorders.branch.dispatch_repair");
    return this.operatorService.updateQuote(tenantId, id, dto, branchScope);
  }

  @Post("work-orders/:id/approve-repair")
  async approveRepair(
    @CurrentSession() session: SessionContext,
    @Param("id") id: string,
    @Body() dto: OperatorApproveRepairDto,
  ) {
    const { tenantId } = await this.require(session, "workorders.branch.dispatch_repair");
    return this.operatorService.approveRepair(tenantId, id, dto, session);
  }

  @Post("work-orders/:id/dispatch-repair")
  async dispatchRepair(
    @CurrentSession() session: SessionContext,
    @Param("id") id: string,
    @Body() dto: OperatorDispatchRepairDto,
  ) {
    const { tenantId } = await this.require(session, "workorders.branch.dispatch_repair");
    return this.operatorService.approveRepair(tenantId, id, dto, session);
  }

  private async require(
    session: SessionContext,
    permission: string,
  ): Promise<{ tenantId: string; branchScope: readonly string[] }> {
    if (session.accountType !== "TENANT_STAFF" || !session.tenantId) {
      throw new ForbiddenException({
        code: "forbidden",
        message: "You do not have access to reception and operator operations.",
      });
    }
    if (!(await this.access.can(session, permission))) {
      throw new ForbiddenException({
        code: "forbidden",
        message: "You do not have access to reception and operator operations.",
      });
    }
    return { tenantId: session.tenantId, branchScope: session.branchScope ?? [] };
  }
}
