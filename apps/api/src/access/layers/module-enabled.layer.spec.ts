import { ModuleEnabledLayer } from "./module-enabled.layer";
import { createSession } from "../test-support/session-fixture";

describe("ModuleEnabledLayer", () => {
  it("defers for a platform session (no tenant)", () => {
    const layer = new ModuleEnabledLayer();

    const decision = layer.evaluate(createSession({ tenantId: null }), "inventory.stock.adjust");

    expect(decision).toBeNull();
  });

  it("defers for an unregistered permission key rather than guessing its module", () => {
    const layer = new ModuleEnabledLayer();

    const decision = layer.evaluate(createSession({ enabledModules: ["FINANCE"] }), "not.a.real.key");

    expect(decision).toBeNull();
  });

  it("defers when the module is enabled for this tenant", () => {
    const layer = new ModuleEnabledLayer();

    const decision = layer.evaluate(createSession({ enabledModules: ["INVENTORY"] }), "inventory.stock.adjust");

    expect(decision).toBeNull();
  });

  it("independently denies and locks when the module is not enabled for this tenant", () => {
    const layer = new ModuleEnabledLayer();

    const decision = layer.evaluate(createSession({ enabledModules: ["FINANCE"] }), "inventory.stock.adjust");

    expect(decision).toEqual({
      allowed: false,
      locked: true,
      reason: "This module is not enabled for your workshop",
    });
  });

  it("denies when nothing is enabled at all (fresh tenant, no published configuration)", () => {
    const layer = new ModuleEnabledLayer();

    const decision = layer.evaluate(createSession({ enabledModules: [] }), "inventory.stock.adjust");

    expect(decision?.allowed).toBe(false);
    expect(decision?.locked).toBe(true);
  });
});
