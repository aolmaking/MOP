import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@mop/database";
import { FinanceConfigurationService } from "./finance-configuration.service";

function decimal(value: string) {
  return new Prisma.Decimal(value);
}

function config(overrides: Record<string, unknown> = {}) {
  return {
    discountApprovalThreshold: decimal("0.00"),
    maxDiscountPercent: decimal("20.00"),
    maxBranchDiscountPercent: decimal("10.00"),
    depositRequired: false,
    depositPercent: decimal("0.00"),
    taxRatePercent: decimal("0.00"),
    taxInclusive: false,
    invoiceNumberPrefix: "INV",
    defaultDueInDays: 0,
    allowUnpaidDelivery: false,
    allowPartialPaidDelivery: false,
    paymentMethods: ["CASH"],
    invoiceTerms: null,
    ...overrides,
  };
}

function harness(before = config(), updated = config()) {
  const prisma = {
    tenant: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ currency: "EGP" }),
    },
    financeConfiguration: {
      upsert: jest.fn().mockResolvedValue(before),
      update: jest.fn().mockResolvedValue(updated),
    },
  };
  const audit = { record: jest.fn() };
  const service = new FinanceConfigurationService(prisma as never, audit as never);
  return { service, prisma, audit };
}

describe("FinanceConfigurationService validation", () => {
  it("refuses lowering the workshop discount ceiling below the stored branch ceiling", async () => {
    const { service, prisma, audit } = harness(config({ maxDiscountPercent: decimal("25.00"), maxBranchDiscountPercent: decimal("15.00") }));

    await expect(service.update("tenant-1", { maxDiscountPercent: 10 }, actor())).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.financeConfiguration.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("refuses raising the branch discount ceiling above the stored workshop ceiling", async () => {
    const { service, prisma } = harness(config({ maxDiscountPercent: decimal("20.00"), maxBranchDiscountPercent: decimal("5.00") }));

    await expect(service.update("tenant-1", { maxBranchDiscountPercent: 25 }, actor())).rejects.toMatchObject({
      response: expect.objectContaining({ code: "branch_ceiling_exceeds_workshop_ceiling" }),
    });

    expect(prisma.financeConfiguration.update).not.toHaveBeenCalled();
  });

  it("refuses percentage fields above one hundred before writing", async () => {
    const { service, prisma } = harness();

    await expect(service.update("tenant-1", { depositPercent: 125 }, actor())).rejects.toMatchObject({
      response: expect.objectContaining({ code: "invalid_percent" }),
    });

    expect(prisma.financeConfiguration.update).not.toHaveBeenCalled();
  });

  it("updates when the effective branch ceiling remains within the workshop ceiling", async () => {
    const after = config({ maxDiscountPercent: decimal("30.00"), maxBranchDiscountPercent: decimal("15.00") });
    const { service, prisma, audit } = harness(config({ maxDiscountPercent: decimal("20.00"), maxBranchDiscountPercent: decimal("15.00") }), after);

    const view = await service.update("tenant-1", { maxDiscountPercent: 30 }, actor());

    expect(prisma.financeConfiguration.update).toHaveBeenCalledWith({ where: { tenantId: "tenant-1" }, data: { maxDiscountPercent: 30 } });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "finance_configuration.updated", riskLevel: "HIGH" }));
    expect(view.maxDiscountPercent).toBe("30");
  });
});

function actor() {
  return { accountId: "owner-1", displayName: "Owner" };
}
