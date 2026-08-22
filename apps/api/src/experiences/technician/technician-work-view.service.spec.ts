import { TechnicianWorkViewService } from "./technician-work-view.service";

describe("TechnicianWorkViewService", () => {
  it("includes the live TIME_TRACKING policy on the work card", async () => {
    const prisma = {
      workOrder: {
        findFirst: jest.fn().mockResolvedValue({
          id: "wo1",
          status: "IN_PROGRESS",
          inspectionDeclined: false,
          assetId: "asset1",
          asset: { plateNumber: "DEMO-4471", serialNumber: null },
          customer: { fullName: "Mona Adel" },
          tasks: [],
        }),
      },
      partRequest: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const lifecycle = { availableIntents: jest.fn().mockResolvedValue([]), previewGates: jest.fn() };
    const assetHistory = { complaintText: jest.fn().mockResolvedValue(new Map([["wo1", "Brake noise"]])) };
    const policies = { resolveValue: jest.fn().mockResolvedValue("REQUIRED") };

    const service = new TechnicianWorkViewService(prisma as never, lifecycle as never, assetHistory as never, policies as never);

    const card = await service.workCard("tech1", "tenant1", "wo1");

    expect(card.timeTracking).toBe("REQUIRED");
    expect(policies.resolveValue).toHaveBeenCalledWith("tenant1", "TIME_TRACKING");
  });
});
