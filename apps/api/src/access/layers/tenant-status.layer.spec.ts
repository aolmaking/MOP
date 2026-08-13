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

  describe("READ_ONLY / ARCHIVED (Phase 18.D)", () => {
    it("still denies a mutation, matching FROZEN/SUSPENDED", () => {
      const layer = new TenantStatusLayer();

      const readOnly = layer.evaluate(createSession({ tenantStatus: "READ_ONLY" }), "inventory.stock.adjust");
      const archived = layer.evaluate(createSession({ tenantStatus: "ARCHIVED" }), "inventory.stock.adjust");

      expect(readOnly?.allowed).toBe(false);
      expect(readOnly?.locked).toBe(true);
      expect(archived?.allowed).toBe(false);
      expect(archived?.locked).toBe(true);
    });

    it("defers for a .view key, unlike FROZEN/SUSPENDED -- the whole point of the status being distinct", () => {
      const layer = new TenantStatusLayer();

      const readOnly = layer.evaluate(createSession({ tenantStatus: "READ_ONLY" }), "reports.company.view");
      const archived = layer.evaluate(createSession({ tenantStatus: "ARCHIVED" }), "audit.own_tenant.view");

      expect(readOnly).toBeNull();
      expect(archived).toBeNull();
    });

    it("does not defer for a FROZEN/SUSPENDED tenant even on a .view key -- those stay fully blocked", () => {
      const layer = new TenantStatusLayer();

      const frozen = layer.evaluate(createSession({ tenantStatus: "FROZEN" }), "reports.company.view");

      expect(frozen?.allowed).toBe(false);
      expect(frozen?.locked).toBe(true);
    });
  });
});
