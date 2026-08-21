import type { CapabilityProfile } from "@mop/shared";
import { TenantCapabilityLayer } from "./tenant-capability.layer";
import { createSession } from "../test-support/session-fixture";
import { createContext } from "../test-support/permission-context-fixture";
import { DEFAULT_DECISION } from "../types";

const layer = new TenantCapabilityLayer();
const session = createSession({ tenantId: "tenant-1", role: "TECHNICIAN", staffUserId: "staff-1" });

const evaluate = (permissionKey: string, capabilities: CapabilityProfile) =>
  layer.evaluate(session, permissionKey, DEFAULT_DECISION, createContext({ capabilities }));

describe("TenantCapabilityLayer", () => {
  it("defers for a platform session with no tenant", () => {
    const platform = createSession({ tenantId: null, role: "PLATFORM_SUPER_ADMIN" });
    const decision = layer.evaluate(platform, "inventory.request.issue", DEFAULT_DECISION, createContext());
    expect(decision).toBeNull();
  });

  it("defers for a core permission that no capability governs", () => {
    // Work orders are core -- a workshop without them is not a workshop.
    expect(evaluate("workorders.branch.view", { INVENTORY: "DISABLED" })).toBeNull();
  });

  it("defers for an unregistered key rather than guessing", () => {
    // A guessed capability would deny a legitimate action for a reason
    // nobody could trace back.
    expect(evaluate("totally.unknown.key", { INVENTORY: "DISABLED" })).toBeNull();
  });

  it("defers when the governing capability is enabled", () => {
    expect(evaluate("inventory.request.issue", {})).toBeNull();
  });

  it("denies and locks when the governing capability is disabled", () => {
    const decision = evaluate("inventory.request.issue", { INVENTORY: "DISABLED" });

    expect(decision).toMatchObject({ allowed: false, locked: true });
    expect(decision?.reason).toContain("Inventory");
  });

  it("denies for EXTERNAL, because MOP must not offer an action it does not perform", () => {
    const decision = evaluate("finance.payment.record", { FINANCE_CORE: "EXTERNAL" });

    expect(decision).toMatchObject({ allowed: false, locked: true });
    expect(decision?.reason).toContain("outside MOP");
  });

  it("treats READ_ONLY and LOCKED as live, since the function still exists", () => {
    for (const status of ["READ_ONLY", "LOCKED"] as const) {
      expect(evaluate("inventory.request.issue", { INVENTORY: status })).toBeNull();
    }
  });

  it("maps a narrower key to its own capability, not its module's", () => {
    // Returns are removable while inventory as a whole stays on: a
    // workshop may issue parts and still refuse to take them back.
    expect(evaluate("inventory.stock.return.accept", { PART_RETURNS: "DISABLED" })).toMatchObject({ allowed: false });
    expect(evaluate("inventory.request.issue", { PART_RETURNS: "DISABLED" })).toBeNull();
  });

  it("locks the denial, so no lower layer can grant it", () => {
    // The whole point of this layer's position. Without the lock, a role
    // template or user override further down could still allow it.
    expect(evaluate("inventory.request.issue", { INVENTORY: "DISABLED" })?.locked).toBe(true);
  });
});
