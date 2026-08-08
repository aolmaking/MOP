import { RolePermissionTemplateLayer } from "./role-permission-template.layer";
import { PrismaService } from "../../database/prisma.service";
import { createSession } from "../test-support/session-fixture";

describe("RolePermissionTemplateLayer", () => {
  function createPrismaMock(row: unknown) {
    return {
      rolePermission: { findUnique: jest.fn().mockResolvedValue(row) },
    } as unknown as PrismaService;
  }

  it("defers when the session has no tenant", async () => {
    const prisma = createPrismaMock(null);
    const layer = new RolePermissionTemplateLayer(prisma);

    const decision = await layer.evaluate(createSession({ tenantId: null }), "inventory.stock.adjust");

    expect(decision).toBeNull();
    expect(prisma.rolePermission.findUnique).not.toHaveBeenCalled();
  });

  it("defers for a non-tenant-staff role (e.g. the customer portal has no RolePermission row)", async () => {
    const prisma = createPrismaMock(null);
    const layer = new RolePermissionTemplateLayer(prisma);

    const decision = await layer.evaluate(createSession({ role: "CUSTOMER", staffUserId: undefined }), "customer.portal.view");

    expect(decision).toBeNull();
    expect(prisma.rolePermission.findUnique).not.toHaveBeenCalled();
  });

  it("defers when the tenant has not set a template row for this role+key", async () => {
    const prisma = createPrismaMock(null);
    const layer = new RolePermissionTemplateLayer(prisma);

    const decision = await layer.evaluate(createSession(), "inventory.stock.adjust");

    expect(decision).toBeNull();
  });

  it("allows without locking when the tenant's role template grants this key", async () => {
    const prisma = createPrismaMock({ allowed: true });
    const layer = new RolePermissionTemplateLayer(prisma);

    const decision = await layer.evaluate(createSession(), "inventory.stock.adjust");

    expect(decision).toEqual({ allowed: true, locked: false, reason: expect.any(String) });
  });

  it("independently denies, without locking, when the tenant's role template denies this key -- User Override must still be able to grant an exception", async () => {
    const prisma = createPrismaMock({ allowed: false });
    const layer = new RolePermissionTemplateLayer(prisma);

    const decision = await layer.evaluate(createSession(), "inventory.stock.adjust");

    expect(decision).toEqual({ allowed: false, locked: false, reason: expect.any(String) });
  });

  it("queries the compound unique key by tenant, role, and permission key together", async () => {
    const prisma = createPrismaMock(null);
    const layer = new RolePermissionTemplateLayer(prisma);

    await layer.evaluate(createSession({ tenantId: "tenant-9", role: "TECHNICIAN" }), "task.complete");

    expect(prisma.rolePermission.findUnique).toHaveBeenCalledWith({
      where: {
        tenantId_role_permissionKey: {
          tenantId: "tenant-9",
          role: "TECHNICIAN",
          permissionKey: "task.complete",
        },
      },
      select: { allowed: true },
    });
  });
});
