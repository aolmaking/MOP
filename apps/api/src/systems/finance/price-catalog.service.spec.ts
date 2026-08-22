import { BadRequestException } from "@nestjs/common";
import { PriceCatalogService } from "./price-catalog.service";

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "price-1",
    itemKey: "Oil change",
    itemType: "SERVICE",
    unitPrice: 100,
    laborPrice: null,
    isActive: true,
    effectiveFrom: new Date("2026-08-22T10:00:00.000Z"),
    ...overrides,
  };
}

function harness() {
  const core = {
    priceCatalogEntry: {
      findMany: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
      create: jest.fn().mockResolvedValue(row()),
    },
  };
  const prisma = {
    ...core,
    $transaction: jest.fn((callback: (tx: typeof core) => unknown): unknown => callback(core)),
  };
  const audit = { record: jest.fn() };
  const service = new PriceCatalogService(prisma as never, audit as never);
  return { service, prisma, audit };
}

describe("PriceCatalogService", () => {
  it("rejects a blank item key before opening a price row", async () => {
    const { service, prisma } = harness();

    await expect(service.setPrice("tenant-1", { itemKey: "   ", itemType: "SERVICE", unitPrice: 100 }, actor())).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a blank item type before opening a price row", async () => {
    const { service, prisma } = harness();

    await expect(service.setPrice("tenant-1", { itemKey: "Oil change", itemType: "   ", unitPrice: 100 }, actor())).rejects.toMatchObject({
      response: expect.objectContaining({ code: "item_type_required" }),
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects an invalid labour price before opening a price row", async () => {
    const { service, prisma } = harness();

    await expect(
      service.setPrice("tenant-1", { itemKey: "Oil change", itemType: "SERVICE", unitPrice: 100, laborPrice: -1 }, actor()),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: "invalid_price" }) });

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("trims item identity, closes the open row, creates a new row, and audits", async () => {
    const { service, prisma, audit } = harness();
    prisma.priceCatalogEntry.findFirst.mockResolvedValue(row({ id: "old-price" }));
    prisma.priceCatalogEntry.create.mockResolvedValue(row({ id: "new-price", itemKey: "Oil change", itemType: "SERVICE" }));

    const created = await service.setPrice(
      "tenant-1",
      { itemKey: "  Oil change  ", itemType: "  SERVICE  ", unitPrice: 120, laborPrice: 15 },
      actor(),
    );

    expect(prisma.priceCatalogEntry.update).toHaveBeenCalledWith({ where: { id: "old-price" }, data: { effectiveTo: expect.any(Date) } });
    expect(prisma.priceCatalogEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: "tenant-1", itemKey: "Oil change", itemType: "SERVICE", unitPrice: 120, laborPrice: 15 }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        action: "price_catalog.set",
        after: { itemKey: "Oil change", itemType: "SERVICE", unitPrice: 120 },
      }),
    );
    expect(created.id).toBe("new-price");
  });
});

function actor() {
  return { accountId: "owner-1", displayName: "Owner" };
}
