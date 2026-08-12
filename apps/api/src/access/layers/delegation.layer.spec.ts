import { DelegationLayer } from "./delegation.layer";
import { RolePermissionTemplateLayer } from "./role-permission-template.layer";
import { UserOverrideLayer } from "./user-override.layer";
import { createContext } from "../test-support/permission-context-fixture";
import { DEFAULT_DECISION } from "../types";
import type { SessionContext } from "@mop/shared";

const layer = new DelegationLayer();

const session = (overrides: Partial<SessionContext> = {}): SessionContext =>
  ({
    accountId: "acc-1",
    accountType: "TENANT_STAFF",
    displayName: "Branch Manager",
    tenantId: "tenant-1",
    role: "BRANCH_MANAGER",
    staffUserId: "staff-1",
    branchScope: [],
    warehouseScope: [],
    categoryScope: [],
    teamScope: [],
    managedTechnicianIds: [],
    permissions: [],
    enabledModules: [],
    enabledFeatures: [],
    tenantStatus: "ACTIVE",
    landingPage: "branch-home",
    ...overrides,
  }) as SessionContext;

describe("the delegation layer", () => {
  it("denies a delegation-gated permission when the owner has not delegated", () => {
    const decision = layer.evaluate(session(), "team_setup.branch.manage", DEFAULT_DECISION, createContext());

    expect(decision?.allowed).toBe(false);
    expect(decision?.locked).toBe(true);
  });

  it("explains itself in the owner's terms, not as a bug", () => {
    const decision = layer.evaluate(session(), "team_setup.branch.manage", DEFAULT_DECISION, createContext());

    // The page shows this string. "Forbidden" would read as broken.
    expect(decision?.reason).toContain("delegated");
  });

  it("defers once the owner has delegated, leaving the role template to decide", () => {
    const context = createContext({ activeDelegations: new Set(["team_setup.delegate"]) });

    expect(layer.evaluate(session(), "team_setup.branch.manage", DEFAULT_DECISION, context)).toBeNull();
  });

  it("has no opinion about any other permission", () => {
    // Almost every key. A layer that touched more than its registry
    // would be a second, invisible permission system.
    expect(layer.evaluate(session(), "workorders.branch.view", DEFAULT_DECISION, createContext())).toBeNull();
    expect(layer.evaluate(session(), "inventory.catalog.manage", DEFAULT_DECISION, createContext())).toBeNull();
  });

  it("defers for a session with no tenant", () => {
    expect(
      layer.evaluate(session({ tenantId: null }), "team_setup.branch.manage", DEFAULT_DECISION, createContext()),
    ).toBeNull();
  });
});

describe("delegation outranks the layers below it", () => {
  /**
   * The property that matters. The role template grants this permission
   * by default -- it says "a branch manager would do this if allowed
   * to". Delegation says whether anyone but the owner may at all, and a
   * template grant must not be able to answer that question on the
   * owner's behalf.
   */
  it("locks, so a role template that grants it cannot take effect", () => {
    const roleTemplate = new RolePermissionTemplateLayer();
    const context = createContext({ roleTemplate: new Map([["team_setup.branch.manage", true]]) });

    const delegated = layer.evaluate(session(), "team_setup.branch.manage", DEFAULT_DECISION, context);

    expect(delegated?.locked).toBe(true);
    // The resolver stops on `locked`. Proving the template WOULD have
    // granted it is what makes the lock meaningful.
    expect(roleTemplate.evaluate(session(), "team_setup.branch.manage", DEFAULT_DECISION, context)?.allowed).toBe(true);
  });

  it("cannot be reopened by a personal override either", () => {
    const userOverride = new UserOverrideLayer();
    const context = createContext({
      userOverrides: new Map([["team_setup.branch.manage", { allowed: true, reason: "asked nicely" }]]),
    });

    expect(layer.evaluate(session(), "team_setup.branch.manage", DEFAULT_DECISION, context)?.locked).toBe(true);
    expect(userOverride.evaluate(session(), "team_setup.branch.manage", DEFAULT_DECISION, context)?.allowed).toBe(true);
  });

  it("only ever narrows -- it never grants", () => {
    // With delegation on it defers; it has no branch that returns
    // `allowed: true`, so it cannot resurrect a denied permission.
    const context = createContext({ activeDelegations: new Set(["team_setup.delegate"]) });

    expect(layer.evaluate(session(), "team_setup.branch.manage", DEFAULT_DECISION, context)).toBeNull();
  });
});
