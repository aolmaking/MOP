import { UserOverrideLayer } from "./user-override.layer";
import { createSession } from "../test-support/session-fixture";
import { createContext } from "../test-support/permission-context-fixture";
import { DEFAULT_DECISION } from "../types";

const layer = new UserOverrideLayer();
const KEY = "inventory.stock.adjust";

const overrides = (entries: Record<string, { allowed: boolean; reason: string | null }>) =>
  createContext({ userOverrides: new Map(Object.entries(entries)) });

describe("UserOverrideLayer", () => {
  it("defers when the session has no staff user", () => {
    const customer = createSession({ staffUserId: undefined });
    expect(layer.evaluate(customer, KEY, DEFAULT_DECISION, overrides({}))).toBeNull();
  });

  it("defers when no override exists for the key", () => {
    expect(layer.evaluate(createSession(), KEY, DEFAULT_DECISION, overrides({}))).toBeNull();
  });

  it("grants and locks, being the last layer with nothing left to defer to", () => {
    const context = overrides({ [KEY]: { allowed: true, reason: null } });
    const decision = layer.evaluate(createSession(), KEY, DEFAULT_DECISION, context);

    expect(decision).toMatchObject({ allowed: true, locked: true });
    expect(decision?.reason).toContain("Individually granted");
  });

  it("revokes and locks", () => {
    const context = overrides({ [KEY]: { allowed: false, reason: null } });
    const decision = layer.evaluate(createSession(), KEY, DEFAULT_DECISION, context);

    expect(decision).toMatchObject({ allowed: false, locked: true });
  });

  it("prefers the recorded reason over the generic wording", () => {
    // Whoever made the exception explained why. That explanation is far
    // more useful to the person who hits it than a generated sentence.
    const context = overrides({ [KEY]: { allowed: false, reason: "Revoked pending retraining" } });
    const decision = layer.evaluate(createSession(), KEY, DEFAULT_DECISION, context);

    expect(decision?.reason).toBe("Revoked pending retraining");
  });
});
