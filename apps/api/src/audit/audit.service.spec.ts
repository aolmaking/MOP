import { AuditService } from "./audit.service";
import { PrismaService } from "../runtime/database/prisma.service";

describe("AuditService", () => {
  function createPrismaMock() {
    return {
      auditLog: { create: jest.fn().mockResolvedValue({ id: "audit-1" }) },
    } as unknown as PrismaService;
  }

  it("writes every required field, defaulting optional ones to null", async () => {
    const prisma = createPrismaMock();
    const service = new AuditService(prisma);

    await service.record({
      tenantId: "tenant-1",
      actorId: "staff-1",
      actorType: "TENANT_STAFF",
      actorName: "Ahmed",
      targetType: "Invoice",
      targetId: "invoice-1",
      action: "finance.invoice.issued",
      riskLevel: "MEDIUM",
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "tenant-1",
        actorId: "staff-1",
        actorType: "TENANT_STAFF",
        actorName: "Ahmed",
        targetType: "Invoice",
        targetId: "invoice-1",
        action: "finance.invoice.issued",
        reason: null,
        riskLevel: "MEDIUM",
      }),
    });
  });

  it("captures before/after when provided", async () => {
    const prisma = createPrismaMock();
    const service = new AuditService(prisma);

    await service.record({
      actorId: "platform-1",
      actorType: "PLATFORM",
      actorName: "Super Admin",
      targetType: "Tenant",
      targetId: "tenant-1",
      action: "platform.workshop.frozen",
      before: { status: "ACTIVE" },
      after: { status: "FROZEN" },
      reason: "Non-payment",
      riskLevel: "HIGH",
    });

    const call = (prisma.auditLog.create as jest.Mock).mock.calls[0][0];
    expect(call.data.before).toEqual({ status: "ACTIVE" });
    expect(call.data.after).toEqual({ status: "FROZEN" });
    expect(call.data.reason).toBe("Non-payment");
  });

  it("writes within a provided transaction client instead of the default connection", async () => {
    const prisma = createPrismaMock();
    const tx = { auditLog: { create: jest.fn().mockResolvedValue({ id: "audit-2" }) } };
    const service = new AuditService(prisma);

    await service.record(
      {
        actorId: "staff-1",
        actorType: "TENANT_STAFF",
        actorName: "Ahmed",
        targetType: "WorkOrder",
        targetId: "wo-1",
        action: "work_order.created",
        riskLevel: "LOW",
      },
      tx as never,
    );

    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});
