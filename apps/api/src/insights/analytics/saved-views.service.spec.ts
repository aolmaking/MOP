import { BadRequestException, NotFoundException } from "@nestjs/common";
import { AnalystSavedViewsService } from "./saved-views.service";

const now = new Date("2026-08-22T10:00:00.000Z");

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "view1",
    name: "Morning operations",
    sourcePage: "OPERATIONS",
    configuration: { from: "2026-08-01", to: "2026-08-22" },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("AnalystSavedViewsService", () => {
  it("lists only the current analyst account's saved views", async () => {
    const prisma = {
      analystSavedView: {
        findMany: jest.fn().mockResolvedValue([row()]),
      },
    };
    const service = new AnalystSavedViewsService(prisma as never);

    await expect(service.list("tenant1", "account1")).resolves.toEqual([
      {
        id: "view1",
        name: "Morning operations",
        sourcePage: "OPERATIONS",
        configuration: { from: "2026-08-01", to: "2026-08-22" },
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    ]);
    expect(prisma.analystSavedView.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "tenant1", accountId: "account1" },
      }),
    );
  });

  it("trims and persists a saved view under the current tenant/account", async () => {
    const prisma = {
      analystSavedView: {
        create: jest.fn().mockResolvedValue(row({ name: "Decision lag" })),
      },
    };
    const service = new AnalystSavedViewsService(prisma as never);

    await service.create("tenant1", "account1", {
      name: "  Decision lag  ",
      sourcePage: "DECISIONS",
      configuration: { from: "2026-08-01" },
    });

    expect(prisma.analystSavedView.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          tenantId: "tenant1",
          accountId: "account1",
          name: "Decision lag",
          sourcePage: "DECISIONS",
          configuration: { from: "2026-08-01" },
        },
      }),
    );
  });

  it("does not rename a view owned by another account", async () => {
    const prisma = {
      analystSavedView: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
    };
    const service = new AnalystSavedViewsService(prisma as never);

    await expect(service.rename("tenant1", "account1", "view2", "New name")).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.analystSavedView.update).not.toHaveBeenCalled();
  });

  it("deletes by tenant and account ownership", async () => {
    const prisma = {
      analystSavedView: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new AnalystSavedViewsService(prisma as never);

    await expect(service.remove("tenant1", "account1", "view1")).resolves.toEqual({ ok: true });
    expect(prisma.analystSavedView.deleteMany).toHaveBeenCalledWith({ where: { id: "view1", tenantId: "tenant1", accountId: "account1" } });
  });

  it("rejects blank names after trimming", async () => {
    const service = new AnalystSavedViewsService({} as never);

    await expect(
      service.create("tenant1", "account1", { name: "   ", sourcePage: "OPERATIONS", configuration: {} }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
