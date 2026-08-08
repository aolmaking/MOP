import { WorkshopConfigurationLayer } from "./workshop-configuration.layer";
import { PrismaService } from "../../database/prisma.service";
import { createSession } from "../test-support/session-fixture";

describe("WorkshopConfigurationLayer", () => {
  function createPrismaMock(configuration: unknown) {
    return {
      tenantConfiguration: { findUnique: jest.fn().mockResolvedValue(configuration) },
    } as unknown as PrismaService;
  }

  it("defers when the session has no tenant", async () => {
    const prisma = createPrismaMock(null);
    const layer = new WorkshopConfigurationLayer(prisma);

    const decision = await layer.evaluate(createSession({ tenantId: null }), "inventory.stock.adjust");

    expect(decision).toBeNull();
    expect(prisma.tenantConfiguration.findUnique).not.toHaveBeenCalled();
  });

  it("defers when no configuration has been published for this tenant yet", async () => {
    const prisma = createPrismaMock(null);
    const layer = new WorkshopConfigurationLayer(prisma);

    const decision = await layer.evaluate(createSession(), "inventory.stock.adjust");

    expect(decision).toBeNull();
  });

  it("defers when the role has no entry in roleExperience", async () => {
    const prisma = createPrismaMock({ roleExperience: { TECHNICIAN: { deniedPermissionKeys: ["task.complete"] } } });
    const layer = new WorkshopConfigurationLayer(prisma);

    const decision = await layer.evaluate(createSession({ role: "BRANCH_MANAGER" }), "inventory.stock.adjust");

    expect(decision).toBeNull();
  });

  it("defers when this key is not in the role's denied list", async () => {
    const prisma = createPrismaMock({
      roleExperience: { BRANCH_MANAGER: { deniedPermissionKeys: ["workorders.branch.release_delivery"] } },
    });
    const layer = new WorkshopConfigurationLayer(prisma);

    const decision = await layer.evaluate(createSession({ role: "BRANCH_MANAGER" }), "inventory.stock.adjust");

    expect(decision).toBeNull();
  });

  it("independently denies and locks when this workshop's published config explicitly denies this role+key", async () => {
    const prisma = createPrismaMock({
      roleExperience: { BRANCH_MANAGER: { deniedPermissionKeys: ["inventory.stock.adjust"] } },
    });
    const layer = new WorkshopConfigurationLayer(prisma);

    const decision = await layer.evaluate(createSession({ role: "BRANCH_MANAGER" }), "inventory.stock.adjust");

    expect(decision).toEqual({
      allowed: false,
      locked: true,
      reason: "Disabled for this role in this workshop",
    });
  });

  it("never grants an allow itself -- only ever defers or denies", async () => {
    // Nothing in this layer's implementation can produce allowed:true; this
    // test documents that contract so a future edit can't silently add one.
    const prisma = createPrismaMock({
      roleExperience: { BRANCH_MANAGER: { deniedPermissionKeys: [] } },
    });
    const layer = new WorkshopConfigurationLayer(prisma);

    const decision = await layer.evaluate(createSession({ role: "BRANCH_MANAGER" }), "inventory.stock.adjust");

    expect(decision).toBeNull();
  });

  it.each([
    ["roleExperience is not an object", "not-an-object"],
    ["roleExperience is null", null],
  ])("defers defensively when %s", async (_label, roleExperience) => {
    const prisma = createPrismaMock({ roleExperience });
    const layer = new WorkshopConfigurationLayer(prisma);

    const decision = await layer.evaluate(createSession(), "inventory.stock.adjust");

    expect(decision).toBeNull();
  });

  it("defers defensively when deniedPermissionKeys is missing or malformed", async () => {
    const prisma = createPrismaMock({ roleExperience: { BRANCH_MANAGER: { deniedPermissionKeys: "not-an-array" } } });
    const layer = new WorkshopConfigurationLayer(prisma);

    const decision = await layer.evaluate(createSession({ role: "BRANCH_MANAGER" }), "inventory.stock.adjust");

    expect(decision).toBeNull();
  });
});
