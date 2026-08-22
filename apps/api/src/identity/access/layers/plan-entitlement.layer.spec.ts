import { PlanEntitlementLayer } from "./plan-entitlement.layer";
import { createSession } from "../test-support/session-fixture";
import { createContext } from "../test-support/permission-context-fixture";
import { DEFAULT_DECISION } from "../types";

const layer = new PlanEntitlementLayer();
const INVENTORY_KEY = "inventory.stock.adjust";
const EXPORT_KEY = "analytics.export";

const withPlan = (planAllowedModules: string[]) => createContext({ planAllowedModules });
const withExports = (planAllowedExports: string[]) => createContext({ planAllowedExports });

describe("PlanEntitlementLayer", () => {
  it("defers when the session has no tenant", () => {
    expect(layer.evaluate(createSession({ tenantId: null }), INVENTORY_KEY, DEFAULT_DECISION, withPlan([]))).toBeNull();
  });

  it("defers for an unregistered key rather than guessing its module", () => {
    expect(layer.evaluate(createSession(), "totally.unknown.key", DEFAULT_DECISION, withPlan(["FINANCE"]))).toBeNull();
  });

  it("defers when the plan lists no module restriction at all", () => {
    // An empty list means "unrestricted", which is a different thing from
    // a plan that allows nothing.
    expect(layer.evaluate(createSession(), INVENTORY_KEY, DEFAULT_DECISION, withPlan([]))).toBeNull();
  });

  it("defers when the key's module is inside the plan", () => {
    expect(layer.evaluate(createSession(), INVENTORY_KEY, DEFAULT_DECISION, withPlan(["INVENTORY"]))).toBeNull();
  });

  it("denies and locks when the key's module is outside the plan", () => {
    const decision = layer.evaluate(createSession(), INVENTORY_KEY, DEFAULT_DECISION, withPlan(["FINANCE"]));

    expect(decision).toMatchObject({ allowed: false, locked: true });
    expect(decision?.reason).toContain("plan");
  });

  it("denies and locks export permission when the plan allows no export categories", () => {
    const decision = layer.evaluate(createSession(), EXPORT_KEY, DEFAULT_DECISION, withExports([]));

    expect(decision).toMatchObject({ allowed: false, locked: true });
    expect(decision?.reason).toContain("Exports");
  });

  it("defers export permission when the plan allows at least one export category", () => {
    expect(layer.evaluate(createSession(), EXPORT_KEY, DEFAULT_DECISION, withExports(["OPERATIONS"]))).toBeNull();
  });
});
