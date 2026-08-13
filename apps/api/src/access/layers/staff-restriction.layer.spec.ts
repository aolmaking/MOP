import { StaffRestrictionLayer } from "./staff-restriction.layer";
import { createSession } from "../test-support/session-fixture";

describe("StaffRestrictionLayer", () => {
  it("defers when there is no restriction", () => {
    const layer = new StaffRestrictionLayer();

    const decision = layer.evaluate(createSession({ staffRestrictionStatus: "NONE" }), "inventory.stock.adjust");

    expect(decision).toBeNull();
  });

  it("defers when the session carries no restriction field at all (non-staff sessions)", () => {
    const layer = new StaffRestrictionLayer();

    const decision = layer.evaluate(createSession({}), "inventory.stock.adjust");

    expect(decision).toBeNull();
  });

  it("denies and locks a mutation for a restricted account", () => {
    const layer = new StaffRestrictionLayer();

    const decision = layer.evaluate(
      createSession({ staffRestrictionStatus: "RESTRICTED_PENDING_INVESTIGATION" }),
      "inventory.stock.adjust",
    );

    expect(decision?.allowed).toBe(false);
    expect(decision?.locked).toBe(true);
  });

  it("defers on a .view key for a restricted account -- curtailed, not blind", () => {
    const layer = new StaffRestrictionLayer();

    const decision = layer.evaluate(
      createSession({ staffRestrictionStatus: "RESTRICTED_PENDING_INVESTIGATION" }),
      "reports.company.view",
    );

    expect(decision).toBeNull();
  });
});
