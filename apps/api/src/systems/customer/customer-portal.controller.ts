import { Body, Controller, ForbiddenException, Get, Optional, Param, Post, Query, UseGuards } from "@nestjs/common";
import type { SessionContext } from "@mop/shared";
import { SessionGuard } from "../../identity/auth/session.guard";
import { CurrentSession } from "../../identity/auth/current-session.decorator";
import { CustomerPortalService } from "./customer-portal.service";
import { CustomerDecisionService } from "./decision.service";
import { WorkflowJourneyService } from "../operations/workflow-journey.service";
import { CatalogBrowseService } from "../inventory/catalog-browse.service";
import { parseAttributeQuery } from "../inventory/inventory.controller";
import { RespondDto } from "./decision.dto";
import { ReportCustomerIssueDto } from "./report-issue.dto";
import { CustomerPosOrderDto } from "./customer-pos-order.dto";

/**
 * The Customer Portal's authenticated pages.
 *
 * `RolePermissionTemplateLayer` (and every other permission-resolver
 * layer) requires `session.staffUserId`, which a customer session never
 * has -- the effective-permission engine was built for tenant staff, and
 * a customer session running through it would always be denied, silently,
 * for reasons unrelated to whether the module is actually enabled. So
 * this controller checks the two facts that actually govern portal
 * access directly: the session is a real customer of THIS tenant, and
 * the workshop has the CUSTOMER_PORTAL module enabled.
 *
 * Every handler reads `session.customerId`, never a route parameter --
 * a customer's own portal must not be able to widen its scope by asking
 * for somebody else's id.
 */
@Controller("customer-portal")
@UseGuards(SessionGuard)
export class CustomerPortalController {
  constructor(
    private readonly portal: CustomerPortalService,
    private readonly decisions: CustomerDecisionService,
    private readonly journey: WorkflowJourneyService,
    @Optional() private readonly browse?: CatalogBrowseService,
  ) {}

  /**
   * Directly submit a vehicle issue or book a service from the customer portal.
   *
   * Creates a work order registered to this customer, assigns it to the
   * active workshop branch, and moves it to REGISTERED so it enters the
   * workshop queue immediately.
   */
  @Post("service-requests")
  async reportIssue(@CurrentSession() session: SessionContext, @Body() dto: ReportCustomerIssueDto) {
    const { tenantId, customerId } = this.require(session);
    return this.portal.reportIssue(tenantId, customerId, dto, session);
  }

  /**
   * The workshop's parts catalogue for customer POS browsing.
   * "If the customer only needs to buy a part and leave".
   */
  @Get("parts-catalog")
  async partsCatalog(
    @CurrentSession() session: SessionContext,
    @Query("q") query?: string,
    @Query("categoryId") categoryId?: string,
    @Query("attributes") attributes?: string,
    @Query("inStockOnly") inStockOnly?: string,
    @Query("page") page?: string,
  ) {
    const { tenantId } = this.require(session);
    if (!this.browse) {
      return { items: [], total: 0, page: 1, pageSize: 24, categories: [], filters: [] };
    }
    return this.browse.browse(tenantId, {
      query,
      categoryId,
      attributes: parseAttributeQuery(attributes),
      inStockOnly: inStockOnly === "true",
      page: page ? Number(page) : 1,
    });
  }

  /**
   * Over-the-counter POS parts checkout for customer direct purchase.
   */
  @Post("pos/order")
  async createPosOrder(@CurrentSession() session: SessionContext, @Body() dto: CustomerPosOrderDto) {
    const { tenantId, customerId } = this.require(session);
    return this.portal.createPosOrder(tenantId, customerId, dto, session);
  }

  @Get("home")
  async home(@CurrentSession() session: SessionContext) {
    const { tenantId, customerId } = this.require(session);
    return this.portal.home(tenantId, customerId);
  }

  @Get("assets")
  async assets(@CurrentSession() session: SessionContext) {
    const { tenantId, customerId } = this.require(session);
    return this.portal.myAssets(tenantId, customerId);
  }

  @Get("current-service")
  async currentService(@CurrentSession() session: SessionContext) {
    const { tenantId, customerId } = this.require(session);
    return this.portal.currentService(tenantId, customerId);
  }

  @Get("invoices")
  async invoices(@CurrentSession() session: SessionContext) {
    const { tenantId, customerId } = this.require(session);
    return this.portal.invoiceStatus(tenantId, customerId);
  }

  /**
   * What the workshop is waiting to hear from this customer.
   *
   * The portal has counted these on its home page since Phase 11 and
   * listed them nowhere; the only way to answer was a token link the
   * customer had to still have. Same `PublicDecision` shape the token
   * page renders, so both ends agree on what is safe to show.
   */
  @Get("decisions")
  async decisionsPending(@CurrentSession() session: SessionContext) {
    const { tenantId, customerId } = this.require(session);
    return { decisions: await this.decisions.listForCustomer(tenantId, customerId) };
  }

  /**
   * The answer, from inside the customer's own session.
   *
   * `requestId` is a route parameter here rather than a violation of
   * this controller's own rule, because it is scoped BY the session:
   * `respondAsCustomer` resolves it with `customerId` in the where
   * clause, so another customer's id reads as not-found rather than as
   * somebody else's decision.
   */
  @Post("decisions/:requestId/respond")
  async respondToDecision(
    @CurrentSession() session: SessionContext,
    @Param("requestId") requestId: string,
    @Body() dto: RespondDto,
  ) {
    const { tenantId, customerId } = this.require(session);
    return this.decisions.respondAsCustomer(tenantId, customerId, requestId, dto.answers);
  }

  /**
   * Where this customer's car actually is, as a strip they can read.
   *
   * Scoped by OWNERSHIP, not by the job still being open. It used to ask
   * `currentService` -- the list of jobs in a live status -- which meant
   * a customer watching their repair was refused the second it closed,
   * on the one screen whose whole job is telling them it finished.
   *
   * No viewer is passed, so no actions come back: the customer's journey
   * is a status they read, not a console they drive. Their one real
   * action, answering a decision, has its own page reached from the
   * portal, and a second door to it here would be a second way to change
   * their mind with different consequences.
   */
  @Get("service/:workOrderId/journey")
  async serviceJourney(@CurrentSession() session: SessionContext, @Param("workOrderId") workOrderId: string) {
    const { tenantId, customerId } = this.require(session);
    if (!(await this.portal.ownsWorkOrder(tenantId, customerId, workOrderId))) {
      throw new ForbiddenException({ code: "forbidden", message: "You do not have access to this page." });
    }
    return this.journey.forWorkOrder(tenantId, workOrderId, "CUSTOMER");
  }

  @Get("safe-history")
  async safeHistory(@CurrentSession() session: SessionContext) {
    const { tenantId, customerId } = this.require(session);
    return this.portal.safeHistory(tenantId, customerId);
  }

  private require(session: SessionContext): { tenantId: string; customerId: string } {
    if (
      session.accountType !== "CUSTOMER" ||
      !session.tenantId ||
      !session.customerId ||
      !session.enabledModules.includes("CUSTOMER_PORTAL")
    ) {
      throw new ForbiddenException({ code: "forbidden", message: "You do not have access to this page." });
    }
    return { tenantId: session.tenantId, customerId: session.customerId };
  }
}
