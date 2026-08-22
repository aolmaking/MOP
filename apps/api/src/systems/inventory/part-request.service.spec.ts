import { NotFoundException } from "@nestjs/common";
import { PartRequestService } from "./part-request.service";

function actor() {
  return { accountId: "inventory-1", displayName: "Inventory Manager", actorType: "TENANT_STAFF" as const };
}

function request(status: string = "REQUESTED") {
  return {
    id: "request-1",
    tenantId: "tenant-1",
    status,
    inventoryItemId: "item-1",
    workOrderId: "work-order-1",
    approvedById: null,
    requestedById: "technician-1",
  };
}

function harness() {
  const core = {
    partRequest: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    issuedItem: {
      aggregate: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    partReturnRequest: {
      findUnique: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    stockMovement: {
      create: jest.fn(),
    },
    staffUser: {
      findFirst: jest.fn(),
    },
    inventoryItem: {
      findUnique: jest.fn(),
    },
    workOrderPartLine: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    workOrder: {
      findUnique: jest.fn(),
    },
  };
  const prisma = {
    ...core,
    $transaction: jest.fn((callback: (tx: typeof core) => unknown): unknown => callback(core)),
  };
  const capabilities = { resolveCurrent: jest.fn().mockResolvedValue({}) };
  const stock = { record: jest.fn() };
  const events = { emit: jest.fn() };
  const policies = { resolveValue: jest.fn().mockResolvedValue("ALLOW_SAME_PERSON") };
  const lifecycle = { apply: jest.fn() };
  const service = new PartRequestService(
    prisma as never,
    capabilities as never,
    stock as never,
    events as never,
    policies as never,
    lifecycle as never,
  );

  return { service, prisma, events };
}

describe("PartRequestService tenant isolation", () => {
  it("scopes inventory-manager approval to the current tenant", async () => {
    const { service, prisma } = harness();
    prisma.partRequest.findFirst.mockResolvedValue(null);

    await expect(service.approve("request-foreign", actor(), "tenant-1")).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.partRequest.findFirst).toHaveBeenCalledWith({
      where: { id: "request-foreign", tenantId: "tenant-1" },
      select: expect.objectContaining({ id: true, tenantId: true, status: true }),
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("scopes fulfilment reads to the current tenant when a tenant is supplied", async () => {
    const { service, prisma } = harness();
    prisma.partRequest.findFirst.mockResolvedValue({ quantity: 3 });
    prisma.issuedItem.aggregate.mockResolvedValue({ _sum: { quantity: 1 } });

    const fulfilment = await service.fulfilment("request-1", "tenant-1");

    expect(prisma.partRequest.findFirst).toHaveBeenCalledWith({
      where: { id: "request-1", tenantId: "tenant-1" },
      select: { quantity: true },
    });
    expect(prisma.issuedItem.aggregate).toHaveBeenCalledWith({
      where: { partRequestId: "request-1", tenantId: "tenant-1" },
      _sum: { quantity: true },
    });
    expect(fulfilment).toEqual({ requested: 3, issued: 1, outstanding: 2 });
  });

  it("does not issue stock for a request outside the tenant", async () => {
    const { service, prisma } = harness();
    prisma.partRequest.findFirst.mockResolvedValue(null);

    await expect(
      service.issue({ partRequestId: "request-foreign", warehouseId: "warehouse-1", quantity: 1 }, actor(), "tenant-1"),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.issuedItem.create).not.toHaveBeenCalled();
  });

  it("keeps tenantId in the guarded transition write", async () => {
    const { service, prisma, events } = harness();
    prisma.partRequest.findFirst.mockResolvedValue(request("REQUESTED"));
    prisma.partRequest.updateMany.mockResolvedValue({ count: 1 });

    await service.markUnavailable("request-1", actor(), "tenant-1");

    expect(prisma.partRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "request-1", tenantId: "tenant-1", status: "REQUESTED" },
      }),
    );
    expect(events.emit).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-1" }), expect.anything());
  });
});
