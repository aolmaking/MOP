import { NotFoundException } from "@nestjs/common";
import { Prisma } from "@mop/database";
import { FinanceService } from "./finance.service";

function money(value: string) {
  return new Prisma.Decimal(value);
}

function actor() {
  return { accountId: "cashier-1", displayName: "Cashier", actorType: "TENANT_STAFF" as const };
}

function harness() {
  const core = {
    invoice: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    payment: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
    },
    refundRequest: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    discountRequest: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    workOrder: {
      findFirst: jest.fn(),
    },
    runningInvoice: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    runningInvoiceLine: {
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
  const prisma = {
    ...core,
    $transaction: jest.fn((callback: (tx: typeof core) => unknown): unknown => callback(core)),
  };
  const capabilities = { resolveCurrent: jest.fn().mockResolvedValue({}) };
  const events = { emit: jest.fn() };
  const billing = { issueDocument: jest.fn(), issueCreditNote: jest.fn() };
  const priceCatalog = { resolve: jest.fn() };
  const policies = { resolveValue: jest.fn().mockResolvedValue("ANY_STAFF_UNLIMITED") };
  const chargeable = {
    partItems: jest.fn().mockResolvedValue([]),
    serviceItems: jest.fn().mockResolvedValue([]),
    approvedDecisionItems: jest.fn().mockResolvedValue([]),
  };
  const lifecycle = { apply: jest.fn() };
  const service = new FinanceService(
    prisma as never,
    capabilities as never,
    events as never,
    billing as never,
    priceCatalog as never,
    policies as never,
    chargeable as never,
    lifecycle as never,
  );

  return { service, prisma };
}

describe("FinanceService tenant isolation", () => {
  it("scopes settlement reads and payment/refund sums to the requesting tenant", async () => {
    const { service, prisma } = harness();
    prisma.invoice.findFirst.mockResolvedValue({ id: "invoice-1", total: money("100.00") });
    prisma.payment.findMany.mockResolvedValue([{ amount: money("40.00") }]);
    prisma.refundRequest.findMany.mockResolvedValue([{ amount: money("10.00") }]);

    const settlement = await service.settlement("invoice-1", "tenant-1");

    expect(prisma.invoice.findFirst).toHaveBeenCalledWith({
      where: { id: "invoice-1", tenantId: "tenant-1" },
      select: { id: true, total: true },
    });
    expect(prisma.payment.findMany).toHaveBeenCalledWith({
      where: { invoiceId: "invoice-1", tenantId: "tenant-1", status: "CONFIRMED" },
      select: { amount: true },
    });
    expect(prisma.refundRequest.findMany).toHaveBeenCalledWith({
      where: { invoiceId: "invoice-1", tenantId: "tenant-1", status: "COMPLETED" },
      select: { amount: true },
    });
    expect(settlement).toMatchObject({ paid: "30.00", outstanding: "70.00", settled: false });
  });

  it("returns invoice_not_found before summing another tenant's settlement", async () => {
    const { service, prisma } = harness();
    prisma.invoice.findFirst.mockResolvedValue(null);

    await expect(service.settlement("invoice-foreign", "tenant-1")).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.payment.findMany).not.toHaveBeenCalled();
    expect(prisma.refundRequest.findMany).not.toHaveBeenCalled();
  });

  it("refuses to add a running invoice line to a work order outside the tenant", async () => {
    const { service, prisma } = harness();
    prisma.workOrder.findFirst.mockResolvedValue(null);

    await expect(
      service.addLine(
        {
          tenantId: "tenant-1",
          workOrderId: "work-order-foreign",
          name: "Oil change",
          itemType: "SERVICE",
          quantity: 1,
          unitPrice: "100.00",
        },
        actor(),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.workOrder.findFirst).toHaveBeenCalledWith({
      where: { id: "work-order-foreign", tenantId: "tenant-1" },
      select: { branchId: true, customerId: true },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.runningInvoice.upsert).not.toHaveBeenCalled();
  });

  it("refuses to record payment against an invoice outside the tenant before writing money", async () => {
    const { service, prisma } = harness();
    prisma.payment.findUnique.mockResolvedValue(null);
    prisma.invoice.findFirst.mockResolvedValue(null);

    await expect(
      service.recordPayment(
        "tenant-1",
        "invoice-foreign",
        { amount: "25.00", method: "CASH", idempotencyKey: "payment-key-1" },
        actor(),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.invoice.findFirst).toHaveBeenCalledWith({
      where: { id: "invoice-foreign", tenantId: "tenant-1" },
      select: { workOrderId: true },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it("scopes refund and discount decisions to the requesting tenant", async () => {
    const { service, prisma } = harness();
    prisma.refundRequest.findFirst.mockResolvedValue(null);
    prisma.discountRequest.findFirst.mockResolvedValue(null);

    await expect(service.approveRefund("refund-foreign", actor(), "tenant-1")).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.approveDiscount("discount-foreign", actor(), "tenant-1")).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.refundRequest.findFirst).toHaveBeenCalledWith({ where: { id: "refund-foreign", tenantId: "tenant-1" } });
    expect(prisma.discountRequest.findFirst).toHaveBeenCalledWith({ where: { id: "discount-foreign", tenantId: "tenant-1" } });
    expect(prisma.refundRequest.update).not.toHaveBeenCalled();
    expect(prisma.discountRequest.update).not.toHaveBeenCalled();
  });
});
