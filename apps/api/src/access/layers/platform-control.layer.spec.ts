import { PlatformControlLayer } from "./platform-control.layer";
import { PrismaService } from "../../database/prisma.service";
import { createSession } from "../test-support/session-fixture";

describe("PlatformControlLayer", () => {
  function createPrismaMock(setting: unknown) {
    return {
      controlSetting: { findFirst: jest.fn().mockResolvedValue(setting) },
    } as unknown as PrismaService;
  }

  it("defers when the session has no tenant (platform session)", async () => {
    const prisma = createPrismaMock(null);
    const layer = new PlatformControlLayer(prisma);

    const decision = await layer.evaluate(createSession({ tenantId: null }), "inventory.stock.adjust");

    expect(decision).toBeNull();
    expect(prisma.controlSetting.findFirst).not.toHaveBeenCalled();
  });

  it("defers when no matching platform lock exists", async () => {
    const prisma = createPrismaMock(null);
    const layer = new PlatformControlLayer(prisma);

    const decision = await layer.evaluate(createSession(), "inventory.stock.adjust");

    expect(decision).toBeNull();
  });

  it("independently denies and locks when the platform has explicitly disabled this role+permission", async () => {
    const prisma = createPrismaMock({ value: { allowed: false } });
    const layer = new PlatformControlLayer(prisma);

    const decision = await layer.evaluate(createSession(), "inventory.stock.adjust");

    expect(decision).toEqual({
      allowed: false,
      locked: true,
      reason: expect.stringContaining("Locked"),
    });
  });

  it("allows and locks when the platform has explicitly enabled this role+permission", async () => {
    const prisma = createPrismaMock({ value: { allowed: true } });
    const layer = new PlatformControlLayer(prisma);

    const decision = await layer.evaluate(createSession(), "inventory.stock.adjust");

    expect(decision).toEqual({
      allowed: true,
      locked: true,
      reason: expect.stringContaining("Enabled"),
    });
  });

  it("defers when the stored setting value is malformed", async () => {
    const prisma = createPrismaMock({ value: { somethingElse: true } });
    const layer = new PlatformControlLayer(prisma);

    const decision = await layer.evaluate(createSession(), "inventory.stock.adjust");

    expect(decision).toBeNull();
  });

  it("looks up the lock keyed by role and permission key together", async () => {
    const prisma = createPrismaMock(null);
    const layer = new PlatformControlLayer(prisma);

    await layer.evaluate(createSession({ tenantId: "tenant-9", role: "TECHNICIAN" }), "task.complete");

    expect(prisma.controlSetting.findFirst).toHaveBeenCalledWith({
      where: {
        scope: "PLATFORM",
        tenantId: "tenant-9",
        type: "role_permission_lock",
        key: "TECHNICIAN:task.complete",
        active: true,
      },
    });
  });
});
