import { PlanEntitlementLayer } from "./plan-entitlement.layer";
import { PrismaService } from "../../database/prisma.service";
import { createSession } from "../test-support/session-fixture";

describe("PlanEntitlementLayer", () => {
  function createPrismaMock(tenant: unknown) {
    return {
      tenant: { findUnique: jest.fn().mockResolvedValue(tenant) },
    } as unknown as PrismaService;
  }

  it("defers when the session has no tenant", async () => {
    const prisma = createPrismaMock(null);
    const layer = new PlanEntitlementLayer(prisma);

    const decision = await layer.evaluate(createSession({ tenantId: null }), "inventory.stock.adjust");

    expect(decision).toBeNull();
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
  });

  it("defers for an unregistered permission key rather than guessing its module", async () => {
    const prisma = createPrismaMock({ plan: { allowedModules: ["FINANCE"] } });
    const layer = new PlanEntitlementLayer(prisma);

    const decision = await layer.evaluate(createSession(), "not.a.real.key");

    expect(decision).toBeNull();
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
  });

  it("defers when the plan imposes no module restriction (empty allowedModules)", async () => {
    const prisma = createPrismaMock({ plan: { allowedModules: [] } });
    const layer = new PlanEntitlementLayer(prisma);

    const decision = await layer.evaluate(createSession(), "inventory.stock.adjust");

    expect(decision).toBeNull();
  });

  it("defers when the plan includes the key's module", async () => {
    const prisma = createPrismaMock({ plan: { allowedModules: ["INVENTORY", "FINANCE"] } });
    const layer = new PlanEntitlementLayer(prisma);

    const decision = await layer.evaluate(createSession(), "inventory.stock.adjust");

    expect(decision).toBeNull();
  });

  it("independently denies and locks when the plan does not include the key's module", async () => {
    const prisma = createPrismaMock({ plan: { allowedModules: ["FINANCE"] } });
    const layer = new PlanEntitlementLayer(prisma);

    const decision = await layer.evaluate(createSession(), "inventory.stock.adjust");

    expect(decision).toEqual({
      allowed: false,
      locked: true,
      reason: "Not included in your current plan",
    });
  });
});
