import { WorkshopHealthService } from "./workshop-health.service";
import { WorkshopsService } from "./workshops.service";

describe("WorkshopsService", () => {
  function tenant(overrides: Record<string, unknown> = {}) {
    return {
      id: "tenant-1",
      name: "Apex Motors",
      slug: "apex-motors",
      status: "ACTIVE",
      currency: "EGP",
      timezone: "Africa/Cairo",
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
      country: "EG",
      city: "Cairo",
      businessType: "WORKSHOP",
      primaryCategory: "CARS",
      plan: {
        id: "plan-1",
        name: "Growth",
        monthlyPrice: { toString: () => "900.00" },
        maxBranches: 5,
        maxUsers: 25,
        maxWarehouses: 3,
      },
      configuration: null,
      financeConfiguration: { compliantBlocked: true },
      ...overrides,
    };
  }

  function makeService() {
    const prisma = {
      tenant: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
      },
      branch: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      warehouse: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      staffUser: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      workOrder: {
        groupBy: jest.fn().mockResolvedValue([]),
      },
      session: {
        groupBy: jest.fn().mockResolvedValue([]),
      },
      auditLog: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      controlSetting: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    return {
      prisma,
      service: new WorkshopsService(prisma as never, {} as never, new WorkshopHealthService()),
    };
  }

  it("projects stored compliantBlocked onto list rows", async () => {
    const { prisma, service } = makeService();
    prisma.tenant.findMany.mockResolvedValue([tenant()]);
    prisma.tenant.count.mockResolvedValue(1);

    const result = await service.list({ page: 1, pageSize: 25, sort: "created_desc" } as never);

    expect(result.items[0].compliantBlocked).toBe(true);
    expect(prisma.tenant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({ financeConfiguration: true }),
      }),
    );
  });

  it("projects stored compliantBlocked onto workshop details", async () => {
    const { prisma, service } = makeService();
    prisma.tenant.findUnique.mockResolvedValue(tenant());

    const details = await service.getDetails("tenant-1");

    expect(details.compliantBlocked).toBe(true);
    expect(prisma.tenant.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({ financeConfiguration: true }),
      }),
    );
  });
});
