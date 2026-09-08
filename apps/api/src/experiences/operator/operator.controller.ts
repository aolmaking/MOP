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
import { OperatorService } from "./operator.service";
import {
  OperatorDispatchRepairDto,
  OperatorIntakeDto,
  OperatorPosOrderDto,
  OperatorUpdateQuoteDto,
  RegisterCustomerVehicleDto,
} from "./operator.dto";

const ALLOWED_OPERATOR_ROLES = new Set([
  "OPERATOR",
  "BRANCH_MANAGER",
  "TENANT_OWNER",
  "TENANT_ADMIN",
]);

@Controller("operator")
@UseGuards(SessionGuard)
export class OperatorController {
  constructor(private readonly operatorService: OperatorService) {}

  @Get("overview")
  async getOverview(@CurrentSession() session: SessionContext) {
    const { tenantId } = this.require(session);
    return this.operatorService.getOverview(tenantId, session.branchScope);
  }

  @Get("search")
  async search(@CurrentSession() session: SessionContext, @Query("q") query?: string) {
    const { tenantId } = this.require(session);
    return this.operatorService.searchReception(tenantId, query ?? "");
  }

  @Post("register-vehicle")
  async registerVehicle(
    @CurrentSession() session: SessionContext,
    @Body() dto: RegisterCustomerVehicleDto,
  ) {
    const { tenantId } = this.require(session);
    return this.operatorService.registerCustomerAndVehicle(tenantId, dto);
  }

  @Post("intake")
  async createIntake(
    @CurrentSession() session: SessionContext,
    @Body() dto: OperatorIntakeDto,
  ) {
    const { tenantId } = this.require(session);
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
    const { tenantId } = this.require(session);
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
    const { tenantId } = this.require(session);
    return this.operatorService.createPosOrder(tenantId, dto, session);
  }

  @Get("inspection-reports")
  async getInspectionReports(@CurrentSession() session: SessionContext) {
    const { tenantId } = this.require(session);
    return this.operatorService.getInspectionReports(tenantId, session.branchScope);
  }

  @Get("work-orders/:id/inspection-report")
  async getInspectionReportDetail(
    @CurrentSession() session: SessionContext,
    @Param("id") id: string,
  ) {
    const { tenantId } = this.require(session);
    return this.operatorService.getInspectionReportDetail(tenantId, id);
  }

  @Post("work-orders/:id/update-quote")
  async updateQuote(
    @CurrentSession() session: SessionContext,
    @Param("id") id: string,
    @Body() dto: OperatorUpdateQuoteDto,
  ) {
    const { tenantId } = this.require(session);
    return this.operatorService.updateQuote(tenantId, id, dto);
  }

  @Post("work-orders/:id/dispatch-repair")
  async dispatchRepair(
    @CurrentSession() session: SessionContext,
    @Param("id") id: string,
    @Body() dto: OperatorDispatchRepairDto,
  ) {
    const { tenantId } = this.require(session);
    return this.operatorService.dispatchRepair(tenantId, id, dto, session);
  }

  private require(session: SessionContext): { tenantId: string } {
    if (
      session.accountType !== "TENANT_STAFF" ||
      !session.tenantId ||
      !ALLOWED_OPERATOR_ROLES.has(session.role as string)
    ) {
      throw new ForbiddenException({
        code: "forbidden",
        message: "You do not have access to reception and operator operations.",
      });
    }
    return { tenantId: session.tenantId };
  }
}
