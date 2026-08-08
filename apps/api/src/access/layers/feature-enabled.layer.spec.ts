import { createSession } from "../test-support/session-fixture";

describe("FeatureEnabledLayer", () => {
  it("defers for every key today, since FEATURE_GATED_PERMISSIONS is empty until a later phase gates a real feature", async () => {
    const { FeatureEnabledLayer } = await import("./feature-enabled.layer");
    const layer = new FeatureEnabledLayer();

    const decision = layer.evaluate(createSession(), "inventory.stock.adjust");

    expect(decision).toBeNull();
  });

  it("defers for a platform session (no tenant) even if the key were gated", async () => {
    const { FeatureEnabledLayer } = await import("./feature-enabled.layer");
    const layer = new FeatureEnabledLayer();

    const decision = layer.evaluate(createSession({ tenantId: null }), "inventory.stock.adjust");

    expect(decision).toBeNull();
  });

  describe("when a permission key is registered as feature-gated", () => {
    beforeEach(() => {
      jest.resetModules();
      jest.doMock("@mop/shared", () => ({
        ...jest.requireActual("@mop/shared"),
        FEATURE_GATED_PERMISSIONS: { "inventory.stock.adjust": "multi_warehouse_transfers" },
      }));
    });

    afterEach(() => {
      jest.dontMock("@mop/shared");
      jest.resetModules();
    });

    it("defers when the required feature is enabled for this tenant", async () => {
      const { FeatureEnabledLayer } = await import("./feature-enabled.layer");
      const layer = new FeatureEnabledLayer();

      const decision = layer.evaluate(
        createSession({ enabledFeatures: ["multi_warehouse_transfers"] }),
        "inventory.stock.adjust",
      );

      expect(decision).toBeNull();
    });

    it("independently denies and locks when the required feature is not enabled for this tenant", async () => {
      const { FeatureEnabledLayer } = await import("./feature-enabled.layer");
      const layer = new FeatureEnabledLayer();

      const decision = layer.evaluate(createSession({ enabledFeatures: [] }), "inventory.stock.adjust");

      expect(decision).toEqual({
        allowed: false,
        locked: true,
        reason: "This feature is not enabled for your workshop",
      });
    });
  });
});
