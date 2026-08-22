import { WorkOrderDossierService } from "./work-order-dossier.service";

describe("WorkOrderDossierService", () => {
  it("resolves capability deviations under the work order's opened-at timestamp", async () => {
    const openedAt = new Date("2026-08-01T10:00:00.000Z");
    const prisma = {
      workOrder: {
        findFirst: jest.fn().mockResolvedValue({
          id: "wo1",
          status: "IN_PROGRESS",
          createdAt: openedAt,
          closedAt: null,
          assetId: "asset1",
          customer: null,
          asset: null,
          tasks: [],
        }),
        count: jest.fn().mockResolvedValue(0),
      },
      operationEvent: { findMany: jest.fn().mockResolvedValue([]) },
      workOrderPartLine: { findMany: jest.fn().mockResolvedValue([]) },
      inspection: { findMany: jest.fn().mockResolvedValue([]) },
      fault: { findMany: jest.fn().mockResolvedValue([]) },
      runningInvoice: { findUnique: jest.fn().mockResolvedValue(null) },
      invoice: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const capabilities = {
      resolveAsOf: jest.fn().mockResolvedValue({ INVENTORY: "DISABLED", QC: "ENABLED", BILLING: "EXTERNAL" }),
    };
    const service = new WorkOrderDossierService(prisma as never, {} as never, capabilities as never);

    const dossier = await service.build("tenant1", "wo1", { canViewCost: true });

    expect(capabilities.resolveAsOf).toHaveBeenCalledWith("tenant1", openedAt);
    expect(dossier.capabilityDeviationsAtOpen).toEqual([
      { key: "INVENTORY", status: "DISABLED" },
      { key: "BILLING", status: "EXTERNAL" },
    ]);
  });
});
