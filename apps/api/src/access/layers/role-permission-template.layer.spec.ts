import { RolePermissionTemplateLayer } from "./role-permission-template.layer";
import { createSession } from "../test-support/session-fixture";
import { createContext } from "../test-support/permission-context-fixture";
import { DEFAULT_DECISION } from "../types";

const layer = new RolePermissionTemplateLayer();
const KEY = "inventory.stock.adjust";

const template = (entries: Record<string, boolean>) => createContext({ roleTemplate: new Map(Object.entries(entries)) });

describe("RolePermissionTemplateLayer", () => {
  it("defers when the session has no tenant", () => {
    expect(layer.evaluate(createSession({ tenantId: null }), KEY, DEFAULT_DECISION, template({}))).toBeNull();
  });

  it("defers for a session that is not tenant staff", () => {
    // A customer has no StaffRole for a role template to be keyed by.
    const customer = createSession({ role: "CUSTOMER", staffUserId: undefined });
    expect(layer.evaluate(customer, KEY, DEFAULT_DECISION, template({ [KEY]: true }))).toBeNull();
  });

  it("defers when the role template has no entry for the key", () => {
    expect(layer.evaluate(createSession(), KEY, DEFAULT_DECISION, template({}))).toBeNull();
  });

  it("allows without locking, so a user override can still deny", () => {
    const decision = layer.evaluate(createSession(), KEY, DEFAULT_DECISION, template({ [KEY]: true }));

    expect(decision).toMatchObject({ allowed: true, locked: false });
  });

  it("denies without locking, so a user override can still grant", () => {
    const decision = layer.evaluate(createSession(), KEY, DEFAULT_DECISION, template({ [KEY]: false }));

    expect(decision).toMatchObject({ allowed: false, locked: false });
  });
});
