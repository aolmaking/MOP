import { PlatformControlLayer } from "./platform-control.layer";
import { createSession } from "../test-support/session-fixture";
import { createContext } from "../test-support/permission-context-fixture";
import { DEFAULT_DECISION } from "../types";

const layer = new PlatformControlLayer();
const KEY = "inventory.stock.adjust";

/** Locks are keyed `${role}:${permissionKey}`. */
const locks = (entries: Record<string, boolean>) => createContext({ platformLocks: new Map(Object.entries(entries)) });

describe("PlatformControlLayer", () => {
  it("defers when the session has no tenant (platform session)", () => {
    expect(layer.evaluate(createSession({ tenantId: null }), KEY, DEFAULT_DECISION, createContext())).toBeNull();
  });

  it("defers when no matching platform lock exists", () => {
    expect(layer.evaluate(createSession(), KEY, DEFAULT_DECISION, createContext())).toBeNull();
  });

  it("denies and locks when the platform has explicitly disabled this role and permission", () => {
    const session = createSession();
    const decision = layer.evaluate(session, KEY, DEFAULT_DECISION, locks({ [`${session.role}:${KEY}`]: false }));

    expect(decision).toMatchObject({ allowed: false, locked: true });
    expect(decision?.reason).toContain("Platform Super Admin");
  });

  it("allows and locks when the platform has explicitly enabled it", () => {
    const session = createSession();
    const decision = layer.evaluate(session, KEY, DEFAULT_DECISION, locks({ [`${session.role}:${KEY}`]: true }));

    expect(decision).toMatchObject({ allowed: true, locked: true });
  });

  it("ignores a lock aimed at a different role", () => {
    const session = createSession({ role: "TECHNICIAN" });
    const decision = layer.evaluate(session, KEY, DEFAULT_DECISION, locks({ [`BRANCH_MANAGER:${KEY}`]: false }));

    expect(decision).toBeNull();
  });

  it("ignores a lock aimed at a different permission", () => {
    const session = createSession();
    const other = { [`${session.role}:finance.invoice.issue`]: false };

    expect(layer.evaluate(session, KEY, DEFAULT_DECISION, locks(other))).toBeNull();
  });
});
