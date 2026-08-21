import { WorkshopConfigurationLayer } from "./workshop-configuration.layer";
import { createSession } from "../test-support/session-fixture";
import { createContext } from "../test-support/permission-context-fixture";
import { DEFAULT_DECISION } from "../types";

const layer = new WorkshopConfigurationLayer();
const KEY = "inventory.stock.adjust";

const denied = (keys: string[]) => createContext({ configurationDeniedKeys: new Set(keys) });

describe("WorkshopConfigurationLayer", () => {
  it("defers when the session has no tenant", () => {
    expect(layer.evaluate(createSession({ tenantId: null }), KEY, DEFAULT_DECISION, denied([KEY]))).toBeNull();
  });

  it("defers when the key is not denied by this workshop's configuration", () => {
    expect(layer.evaluate(createSession(), KEY, DEFAULT_DECISION, denied([]))).toBeNull();
  });

  it("denies and locks when the configuration denies the key", () => {
    const decision = layer.evaluate(createSession(), KEY, DEFAULT_DECISION, denied([KEY]));

    expect(decision).toMatchObject({ allowed: false, locked: true });
    expect(decision?.reason).toContain("this workshop");
  });

  it("only ever narrows -- it never grants", () => {
    // Granting belongs to the role template and user override. If this
    // layer could allow, a workshop setting would out-rank a platform lock.
    const decision = layer.evaluate(createSession(), KEY, DEFAULT_DECISION, denied([KEY]));
    expect(decision?.allowed).toBe(false);
  });
});
