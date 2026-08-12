import { Body, Controller, ForbiddenException, Get, Param, Post, UseGuards } from "@nestjs/common";
import type { SessionContext } from "@mop/shared";
import { SessionGuard } from "../auth/session.guard";
import { CurrentSession } from "../auth/current-session.decorator";
import { EffectiveAccessService } from "../access/effective-access.service";
import { FinanceService } from "./finance.service";
import { AddLineDto, IssueInvoiceDto, RecordPaymentDto, RejectRefundDto, RequestRefundDto } from "./finance.dto";

@Controller("finance")
@UseGuards(SessionGuard)
export class FinanceController {
  constructor(
    private readonly finance: FinanceService,
    private readonly access: EffectiveAccessService,
  ) {}

  /** What this job costs so far. Shown inside the Work Order Workspace. */
  @Get("work-orders/:id/total")
  async jobTotal(@CurrentSession() session: SessionContext, @Param("id") id: string) {
    const tenantId = await this.require(session, "workorders.branch.view");
    return this.finance.jobTotal(tenantId, id);
  }

  @Post("work-orders/:id/lines")
  async addLine(@CurrentSession() session: SessionContext, @Param("id") id: string, @Body() dto: AddLineDto) {
    const tenantId = await this.require(session, "finance.running_invoice.add_line");
    return this.finance.addLine(
      {
        tenantId,
        workOrderId: id,
        name: dto.name,
        itemType: dto.itemType,
        quantity: dto.quantity,
        unitPrice: dto.unitPrice,
        labour: dto.labour,
      },
      this.actor(session),
    );
  }

  @Post("work-orders/:id/invoice")
  async issue(@CurrentSession() session: SessionContext, @Param("id") id: string, @Body() dto: IssueInvoiceDto) {
    const tenantId = await this.require(session, "finance.invoice.issue");
    return this.finance.issueInvoice(tenantId, id, this.actor(session), {
      discountPercent: dto.discountPercent,
      taxPercent: dto.taxPercent,
    });
  }

  @Get("invoices/:id")
  async settlement(@CurrentSession() session: SessionContext, @Param("id") id: string) {
    await this.require(session, "finance.payment.record");
    return this.finance.settlement(id);
  }

  /**
   * Take a payment.
   *
   * The idempotency key is required and comes from the client, so a
   * double-tap on a counter tablet with bad signal records one payment
   * rather than two.
   */
  @Post("invoices/:id/payments")
  async pay(@CurrentSession() session: SessionContext, @Param("id") id: string, @Body() dto: RecordPaymentDto) {
    const tenantId = await this.require(session, "finance.payment.record");
    return this.finance.recordPayment(
      tenantId,
      id,
      { amount: dto.amount, method: dto.method, idempotencyKey: dto.idempotencyKey },
      this.actor(session),
    );
  }

  /**
   * Refunds. Requesting and deciding are two different permissions on
   * purpose -- a branch manager can raise a dispute; deciding it, by
   * default, stays with the owner. See finance.service.ts's own note on
   * why this isn't yet a structurally-enforced second-person check.
   */
  @Post("invoices/:id/refunds")
  async requestRefund(@CurrentSession() session: SessionContext, @Param("id") id: string, @Body() dto: RequestRefundDto) {
    const tenantId = await this.require(session, "finance.refund.request");
    return this.finance.requestRefund(tenantId, id, dto.amount, dto.reason, this.actor(session));
  }

  @Post("refunds/:id/approve")
  async approveRefund(@CurrentSession() session: SessionContext, @Param("id") id: string) {
    await this.require(session, "finance.refund.decide");
    return this.finance.approveRefund(id, this.actor(session));
  }

  @Post("refunds/:id/reject")
  async rejectRefund(@CurrentSession() session: SessionContext, @Param("id") id: string, @Body() dto: RejectRefundDto) {
    await this.require(session, "finance.refund.decide");
    return this.finance.rejectRefund(id, this.actor(session), dto.reason);
  }

  private actor(session: SessionContext) {
    return {
      accountId: session.accountId,
      displayName: session.displayName,
      actorType: "TENANT_STAFF" as const,
    };
  }

  private async require(session: SessionContext, permission: string): Promise<string> {
    const allowed = await this.access.can(session, permission);
    if (!allowed || !session.tenantId) {
      throw new ForbiddenException({ code: "forbidden", message: "You do not have access to this." });
    }
    return session.tenantId;
  }
}
