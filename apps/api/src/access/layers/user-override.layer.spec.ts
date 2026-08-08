import { UserOverrideLayer } from "./user-override.layer";
import { PrismaService } from "../../database/prisma.service";
import { createSession } from "../test-support/session-fixture";

describe("UserOverrideLayer", () => {
  function createPrismaMock(row: unknown) {
    return {
      userPermissionOverride: { findUnique: jest.fn().mockResolvedValue(row) },
    } as unknown as PrismaService;
  }

  it("defers when the session has no staff user (platform/customer sessions)", async () => {
    const prisma = createPrismaMock(null);
    const layer = new UserOverrideLayer(prisma);

    const decision = await layer.evaluate(createSession({ staffUserId: undefined }), "inventory.stock.adjust");

    expect(decision).toBeNull();
    expect(prisma.userPermissionOverride.findUnique).not.toHaveBeenCalled();
  });

  it("defers when no override has been set for this person", async () => {
    const prisma = createPrismaMock(null);
    const layer = new UserOverrideLayer(prisma);

    const decision = await layer.evaluate(createSession(), "inventory.stock.adjust");

    expect(decision).toBeNull();
  });

  it("independently denies and locks when this person has an individual revocation, using the given reason", async () => {
    const prisma = createPrismaMock({ allowed: false, reason: "Under investigation for stock discrepancy" });
    const layer = new UserOverrideLayer(prisma);

    const decision = await layer.evaluate(createSession(), "inventory.stock.adjust");

    expect(decision).toEqual({
      allowed: false,
      locked: true,
      reason: "Under investigation for stock discrepancy",
    });
  });

  it("allows and locks when this person has an individual grant, even with no reason on record", async () => {
    const prisma = createPrismaMock({ allowed: true, reason: null });
    const layer = new UserOverrideLayer(prisma);

    const decision = await layer.evaluate(createSession(), "inventory.stock.adjust");

    expect(decision).toEqual({
      allowed: true,
      locked: true,
      reason: "Individually granted to you",
    });
  });

  it("is the final word: locks on a deny even though this is the last layer in the chain", async () => {
    const prisma = createPrismaMock({ allowed: false, reason: null });
    const layer = new UserOverrideLayer(prisma);

    const decision = await layer.evaluate(createSession(), "inventory.stock.adjust");

    expect(decision?.locked).toBe(true);
    expect(decision?.reason).toBe("Individually revoked for you");
  });
});
