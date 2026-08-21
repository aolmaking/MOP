import { BadRequestException, Injectable } from "@nestjs/common";
import type { PaymentMethod } from "@mop/database";
import { PrismaService } from "../runtime/database/prisma.service";
import { AuditService } from "../audit/audit.service";

export interface FinanceConfigActor {
  readonly accountId: string;
  readonly displayName: string;
}

export interface FinanceConfigView {
  readonly discountApprovalThreshold: string;
  readonly maxDiscountPercent: string;
  readonly maxBranchDiscountPercent: string;
  readonly depositRequired: boolean;
  readonly depositPercent: string;
  readonly taxRatePercent: string;
  readonly taxInclusive: boolean;
  readonly invoiceNumberPrefix: string;
  readonly defaultDueInDays: number;
  readonly allowUnpaidDelivery: boolean;
  readonly allowPartialPaidDelivery: boolean;
  readonly paymentMethods: readonly PaymentMethod[];
  readonly invoiceTerms: string | null;
  readonly currency: string;
}

export interface UpdateFinanceConfigInput {
  readonly discountApprovalThreshold?: number;
  readonly maxDiscountPercent?: number;
  readonly maxBranchDiscountPercent?: number;
  readonly depositRequired?: boolean;
  readonly depositPercent?: number;
  readonly taxRatePercent?: number;
  readonly taxInclusive?: boolean;
  readonly invoiceNumberPrefix?: string;
  readonly defaultDueInDays?: number;
  readonly allowUnpaidDelivery?: boolean;
  readonly allowPartialPaidDelivery?: boolean;
  readonly paymentMethods?: PaymentMethod[];
  readonly invoiceTerms?: string;
}

/**
 * Pricing & Financial Configuration's non-catalog sections: Tax/VAT,
 * Discounts & Deposits, Payment Methods, Invoice Settings, Delivery
 * Payment Gate. `FinanceConfiguration` existed in the schema since Phase
 * 8, upserted only for `compliantBlocked` by billing.service.ts, and
 * genuinely read by gate-evaluator.service.ts (delivery gate) and
 * decision.service.ts (discount threshold) -- this is the Owner-facing
 * surface those real consumers were missing, not a new decision about
 * what the fields mean.
 *
 * "Who Can Handle Money" (the finance.invoice.issue/finance.payment.record
 * role-permission slice) is deliberately not included here -- it needs to
 * respect Super Admin's platform-lock ControlSettings the same way
 * Builder Control's Permission Matrix does, which is its own
 * self-contained mechanism worth getting right in its own pass rather
 * than bolted on here. Named as owed, not silently dropped.
 */
@Injectable()
export class FinanceConfigurationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(tenantId: string): Promise<FinanceConfigView> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { currency: true } });
    const config = await this.prisma.financeConfiguration.upsert({
      where: { tenantId },
      create: { tenantId },
      update: {},
    });
    return this.toView(config, tenant.currency);
  }

  async update(tenantId: string, input: UpdateFinanceConfigInput, actor: FinanceConfigActor): Promise<FinanceConfigView> {
    if (input.maxDiscountPercent !== undefined && (input.maxDiscountPercent < 0 || input.maxDiscountPercent > 100)) {
      throw new BadRequestException({ code: "invalid_percent", message: "Max discount % must be between 0 and 100." });
    }
    if (
      input.maxBranchDiscountPercent !== undefined &&
      input.maxDiscountPercent !== undefined &&
      input.maxBranchDiscountPercent > input.maxDiscountPercent
    ) {
      throw new BadRequestException({
        code: "branch_ceiling_exceeds_workshop_ceiling",
        message: "The branch discount ceiling cannot exceed the workshop-wide max discount %.",
      });
    }
    if (input.taxRatePercent !== undefined && (input.taxRatePercent < 0 || input.taxRatePercent > 100)) {
      throw new BadRequestException({ code: "invalid_percent", message: "Tax rate must be between 0 and 100." });
    }

    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { currency: true } });
    const before = await this.prisma.financeConfiguration.upsert({ where: { tenantId }, create: { tenantId }, update: {} });

    const updated = await this.prisma.financeConfiguration.update({
      where: { tenantId },
      data: input,
    });

    await this.audit.record({
      tenantId,
      actorId: actor.accountId,
      actorType: "TENANT_STAFF",
      actorName: actor.displayName,
      targetType: "FinanceConfiguration",
      targetId: tenantId,
      action: "finance_configuration.updated",
      before: this.toView(before, tenant.currency) as never,
      after: this.toView(updated, tenant.currency) as never,
      // Delivery-gate and discount-threshold changes alter what branches
      // and technicians can actually do with real money -- not routine.
      riskLevel: "HIGH",
    });

    return this.toView(updated, tenant.currency);
  }

  private toView(
    config: {
      discountApprovalThreshold: unknown;
      maxDiscountPercent: unknown;
      maxBranchDiscountPercent: unknown;
      depositRequired: boolean;
      depositPercent: unknown;
      taxRatePercent: unknown;
      taxInclusive: boolean;
      invoiceNumberPrefix: string;
      defaultDueInDays: number;
      allowUnpaidDelivery: boolean;
      allowPartialPaidDelivery: boolean;
      paymentMethods: PaymentMethod[];
      invoiceTerms: string | null;
    },
    currency: string,
  ): FinanceConfigView {
    return {
      discountApprovalThreshold: String(config.discountApprovalThreshold),
      maxDiscountPercent: String(config.maxDiscountPercent),
      maxBranchDiscountPercent: String(config.maxBranchDiscountPercent),
      depositRequired: config.depositRequired,
      depositPercent: String(config.depositPercent),
      taxRatePercent: String(config.taxRatePercent),
      taxInclusive: config.taxInclusive,
      invoiceNumberPrefix: config.invoiceNumberPrefix,
      defaultDueInDays: config.defaultDueInDays,
      allowUnpaidDelivery: config.allowUnpaidDelivery,
      allowPartialPaidDelivery: config.allowPartialPaidDelivery,
      paymentMethods: config.paymentMethods,
      invoiceTerms: config.invoiceTerms,
      currency,
    };
  }
}
