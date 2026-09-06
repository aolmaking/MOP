import { ReportingService } from "./reporting.service";

describe("ReportingService", () => {
  it("applies assigned branch/category scope to every work-order-backed section", async () => {
    const prisma = {
      staffUser: {
        findMany: jest.fn().mockResolvedValue([{ id: "tech1", fullName: "Technician One" }]),
      },
      taskAssignment: {
        count: jest.fn().mockResolvedValue(0),
      },
      taskBlocker: {
        count: jest.fn().mockResolvedValue(0),
      },
      workOrder: {
        groupBy: jest.fn().mockResolvedValue([{ status: "IN_PROGRESS", _count: { _all: 2 } }]),
      },
      invoice: {
        findMany: jest.fn().mockResolvedValue([{ total: 200, paid: 150, balance: 50 }]),
      },
    };
    const service = new ReportingService(prisma as never);
    const workOrderScope = { branchId: { in: ["branch1"] }, asset: { category: { in: ["CARS"] } } };

    await service.companyReport("tenant1", { branchIds: ["branch1"], categoryIds: ["CARS"] });

    expect(prisma.staffUser.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "tenant1", role: "TECHNICIAN", branchScope: { hasSome: ["branch1"] } },
      }),
    );
    expect(prisma.workOrder.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "tenant1", ...workOrderScope },
      }),
    );
    expect(prisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "tenant1", workOrder: workOrderScope },
      }),
    );
    expect(prisma.taskAssignment.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant1",
          staffUserId: "tech1",
          task: expect.objectContaining({ workOrder: workOrderScope }),
        }),
      }),
    );
    expect(prisma.taskBlocker.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: "tenant1",
          task: { assignments: { some: { staffUserId: "tech1", unassignedAt: null } }, workOrder: workOrderScope },
        },
      }),
    );
  });
});
