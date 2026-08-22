import { BadRequestException } from "@nestjs/common";
import { createSession } from "../../identity/access/test-support/session-fixture";
import { MoneyHandlingPermissionsService } from "./money-handling-permissions.service";

function harness() {
  const tx = {
    rolePermission: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({
        id: "role-permission-1",
        allowed: true,
        source: "OWNER_OVERRIDE",
      }),
    },
  };
  const prisma = {
    $transaction: jest.fn(async (fn: (txArg: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const access = {
    check: jest.fn().mockResolvedValue({ allowed: false, locked: false, reason: "Not allowed by your role" }),
    checkMany: jest.fn().mockImplementation(async () => {
      return new Map([
        ["finance.invoice.issue", { allowed: false, locked: false, reason: "Not allowed by your role" }],
        ["finance.payment.record", { allowed: false, locked: false, reason: "Not allowed by your role" }],
      ]);
    }),
  };
  const service = new MoneyHandlingPermissionsService(prisma as never, audit as never, access as never);
  const session = createSession({
    tenantId: "tenant-1",
    accountId: "owner-1",
    displayName: "Owner",
    role: "TENANT_OWNER",
    enabledModules: ["FINANCE"],
  });

  return { service, prisma, tx, audit, access, session };
}

describe("MoneyHandlingPermissionsService", () => {
  it("returns lock-aware money permission cells using the real access decision shape", async () => {
    const { service, access, session } = harness();
    access.checkMany.mockImplementation(async (roleSession) => {
      return new Map([
        [
          "finance.invoice.issue",
          {
            allowed: roleSession.role === "BRANCH_MANAGER",
            locked: roleSession.role === "TECHNICIAN",
            reason: roleSession.role === "TECHNICIAN" ? "Locked by Platform Super Admin" : "Allowed by your role",
          },
        ],
        ["finance.payment.record", { allowed: false, locked: false, reason: "Not allowed by your role" }],
      ]);
    });

    const view = await service.view("tenant-1", session);

    const invoice = view.permissions.find((permission) => permission.permissionKey === "finance.invoice.issue");
    expect(invoice?.roles.find((role) => role.role === "BRANCH_MANAGER")).toMatchObject({
      allowed: true,
      editable: true,
      locked: false,
    });
    expect(invoice?.roles.find((role) => role.role === "TECHNICIAN")).toMatchObject({
      allowed: false,
      editable: false,
      locked: true,
      reason: "Locked by Platform Super Admin",
    });
  });

  it("refuses unsupported roles and permission keys before writing", async () => {
    const { service, tx, session } = harness();

    await expect(service.set("tenant-1", session, "DATA_ANALYST", "finance.payment.record", true, actor())).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(tx.rolePermission.upsert).not.toHaveBeenCalled();
  });

  it("refuses to override a locked platform or plan decision", async () => {
    const { service, access, tx, session } = harness();
    access.check.mockResolvedValue({ allowed: false, locked: true, reason: "Locked by Platform Super Admin" });

    await expect(
      service.set("tenant-1", session, "TECHNICIAN", "finance.payment.record", true, actor()),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: "permission_locked" }) });

    expect(tx.rolePermission.upsert).not.toHaveBeenCalled();
  });

  it("writes an Owner override RolePermission row and audits the money authority change", async () => {
    const { service, tx, audit, session } = harness();

    await service.set("tenant-1", session, "BRANCH_MANAGER", "finance.payment.record", true, actor());

    expect(tx.rolePermission.upsert).toHaveBeenCalledWith({
      where: { tenantId_role_permissionKey: { tenantId: "tenant-1", role: "BRANCH_MANAGER", permissionKey: "finance.payment.record" } },
      create: {
        tenantId: "tenant-1",
        role: "BRANCH_MANAGER",
        permissionKey: "finance.payment.record",
        allowed: true,
        source: "OWNER_OVERRIDE",
        updatedBy: "owner-1",
      },
      update: {
        allowed: true,
        source: "OWNER_OVERRIDE",
        updatedBy: "owner-1",
      },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "finance.money_handling_permission.updated",
        riskLevel: "HIGH",
        after: { role: "BRANCH_MANAGER", permissionKey: "finance.payment.record", allowed: true, source: "OWNER_OVERRIDE" },
      }),
      tx,
    );
  });
});

function actor() {
  return { accountId: "owner-1", displayName: "Owner" };
}
