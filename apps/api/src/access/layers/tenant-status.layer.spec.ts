import { TenantStatusLayer } from "./tenant-status.layer";
import { createSession } from "../test-support/session-fixture";

describe("TenantStatusLayer", () => {
  it("defers for a platform session (no tenant)", () => {
    const layer = new TenantStatusLayer();

    const decision = layer.evaluate(createSession({ tenantId: null, tenantStatus: null }), "inventory.stock.adjust");

    expect(decision).toBeNull();
  });

  it("defers when the tenant is ACTIVE", () => {
    const layer = new TenantStatusLayer();

    const decision = layer.evaluate(createSession({ tenantStatus: "ACTIVE" }), "inventory.stock.adjust");

    expect(decision).toBeNull();
  });

  it("independently denies and locks when the tenant is FROZEN, even though nothing else has an opinion yet", () => {
    const layer = new TenantStatusLayer();

    const decision = layer.evaluate(createSession({ tenantStatus: "FROZEN" }), "inventory.stock.adjust");

    expect(decision).toEqual({
      allowed: false,
      locked: true,
      reason: expect.stringContaining("frozen"),
    });
  });

  it("independently denies and locks when the tenant is SUSPENDED", () => {
    const layer = new TenantStatusLayer();

    const decision = layer.evaluate(createSession({ tenantStatus: "SUSPENDED" }), "inventory.stock.adjust");

    expect(decision?.allowed).toBe(false);
    expect(decision?.locked).toBe(true);
  });
});
