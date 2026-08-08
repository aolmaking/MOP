import { BadRequestException } from "@nestjs/common";
import { AccessController } from "./access.controller";
import { EffectiveAccessService } from "./effective-access.service";
import { createSession } from "./test-support/session-fixture";

describe("AccessController", () => {
  it("rejects an unregistered permission key with a 400 rather than silently resolving it", async () => {
    const effectiveAccess = { check: jest.fn() } as unknown as EffectiveAccessService;
    const controller = new AccessController(effectiveAccess);

    await expect(controller.check("not.a.real.key", createSession())).rejects.toBeInstanceOf(BadRequestException);
    expect(effectiveAccess.check).not.toHaveBeenCalled();
  });

  it("rejects a missing key the same way", async () => {
    const effectiveAccess = { check: jest.fn() } as unknown as EffectiveAccessService;
    const controller = new AccessController(effectiveAccess);

    await expect(controller.check("", createSession())).rejects.toBeInstanceOf(BadRequestException);
  });

  it("delegates a registered key straight to EffectiveAccessService for the current session", async () => {
    const decision = { allowed: true, locked: true, reason: "Allowed by your role" };
    const effectiveAccess = { check: jest.fn().mockResolvedValue(decision) } as unknown as EffectiveAccessService;
    const controller = new AccessController(effectiveAccess);
    const session = createSession();

    const result = await controller.check("inventory.stock.adjust", session);

    expect(effectiveAccess.check).toHaveBeenCalledWith(session, "inventory.stock.adjust");
    expect(result).toEqual(decision);
  });
});
