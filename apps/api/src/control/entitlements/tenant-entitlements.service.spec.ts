import { BadRequestException, ConflictException } from "@nestjs/common";
import { TenantEntitlementsService } from "./tenant-entitlements.service";

function setting(field: string, value: unknown, id = `setting-${field}`) {
  return {
    id,
    key: `limits.${field}`,
    value: { field, value },
    reason: "Override reason",
    createdBy: "platform-1",
    createdAt: new Date("2026-08-22T10:00:00.000Z"),
    active: true,
  };
}

function harness(options: {
  settings?: unknown[];
  branches?: number;
  users?: number;
  warehouses?: number;
  plan?: Partial<{
    maxBranches: number;
    maxUsers: number;
    maxWarehouses: number;
    allowedModules: string[];
    allowedExports: string[];
  }>;
} = {}) {
  const plan = {
    id: "plan-1",
    code: "GROWTH",
    name: "Growth",
    maxBranches: 5,
    maxUsers: 20,
    maxWarehouses: 3,
    allowedModules: ["REPORTS"],
    allowedExports: ["OPERATIONS", "PEOPLE"],
    ...options.plan,
  };
  const core = {
    tenant: {
      findUnique: jest.fn().mockResolvedValue({ id: "tenant-1", name: "Apex", plan }),
    },
    controlSetting: {
      findMany: jest.fn().mockResolvedValue(options.settings ?? []),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
      create: jest.fn(),
    },
    branch: { count: jest.fn().mockResolvedValue(options.branches ?? 2) },
    staffUser: { count: jest.fn().mockResolvedValue(options.users ?? 4) },
    warehouse: { count: jest.fn().mockResolvedValue(options.warehouses ?? 1) },
  };
  const prisma = {
    ...core,
    $transaction: jest.fn((callback: (tx: typeof core) => unknown): unknown => callback(core)),
  };
  const audit = { record: jest.fn() };
  const service = new TenantEntitlementsService(prisma as never, audit as never);
  return { service, prisma, audit };
}

describe("TenantEntitlementsService", () => {
  it("applies active tenant overrides under the plan ceiling", async () => {
    const { service } = harness({
      settings: [setting("maxBranches", 3), setting("allowedExports", ["PEOPLE", "NOT_IN_PLAN"])],
    });

    const current = await service.current("tenant-1");

    expect(current.fields.find((field) => field.field === "maxBranches")?.effective).toBe(3);
    expect(current.fields.find((field) => field.field === "allowedExports")?.effective).toEqual(["PEOPLE"]);
  });

  it("refuses a numeric override above the plan ceiling", async () => {
    const { service } = harness();

    await expect(service.setNumberOverride("tenant-1", "maxBranches", 6, "Need more branches", actor())).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("refuses a numeric override below current active usage", async () => {
    const { service } = harness({ branches: 3 });

    await expect(service.setNumberOverride("tenant-1", "maxBranches", 2, "Downsize", actor())).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("deactivates the prior override, writes a new row, and audits the change", async () => {
    const previous = setting("maxBranches", 3, "old");
    const created = setting("maxBranches", 4, "new");
    const { service, prisma, audit } = harness();
    prisma.controlSetting.findMany.mockResolvedValueOnce([previous]).mockResolvedValueOnce([created]);
    prisma.controlSetting.findFirst.mockResolvedValue(previous);
    prisma.controlSetting.create.mockResolvedValue(created);

    await service.setNumberOverride("tenant-1", "maxBranches", 4, "Temporary concession", actor());

    expect(prisma.controlSetting.update).toHaveBeenCalledWith({ where: { id: "old" }, data: { active: false } });
    expect(prisma.controlSetting.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          key: "limits.maxBranches",
          type: "limit_entitlement_override",
          value: { field: "maxBranches", value: 4 },
          reason: "Temporary concession",
        }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "governance.entitlement_override.set",
        targetType: "ControlSetting",
        riskLevel: "HIGH",
      }),
      expect.anything(),
    );
  });

  it("blocks runtime additions once effective usage reaches the limit", async () => {
    const { service } = harness({ settings: [setting("maxWarehouses", 1)], warehouses: 1 });

    await expect(service.assertCanAddWarehouse("tenant-1")).rejects.toMatchObject({
      response: expect.objectContaining({ code: "max_warehouses_reached" }),
    });
  });

  it("refuses to clear a numeric override when the plan default is already below usage", async () => {
    const previous = setting("maxBranches", 3, "old");
    const { service, prisma } = harness({ branches: 3, plan: { maxBranches: 2 }, settings: [previous] });
    prisma.controlSetting.findFirst.mockResolvedValue(previous);

    await expect(service.clearOverride("tenant-1", "maxBranches", "Plan was downgraded", actor())).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.controlSetting.update).not.toHaveBeenCalled();
  });
});

function actor() {
  return { accountId: "platform-1", displayName: "Platform Admin" };
}
