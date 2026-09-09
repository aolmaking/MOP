import { PlanEntitlementLayer } from "./plan-entitlement.layer";
import { createSession } from "../test-support/session-fixture";
import { createContext } from "../test-support/permission-context-fixture";
import { DEFAULT_DECISION } from "../types";

const layer = new PlanEntitlementLayer();
const INVENTORY_KEY = "inventory.stock.adjust";
const EXPORT_KEY = "analytics.export";

const withPlan = (planAllowedModules: string[]) => createContext({ planAllowedModules });
const withExports = (planAllowedExports: string[]) => createContext({ planAllowedExports });
const withReports = (planAllowedReports: string[]) => createContext({ planAllowedReports });
const OWNER_REPORT_KEY = "reports.owner.view";
const INVENTORY_REPORT_KEY = "reports.inventory.view";

describe("PlanEntitlementLayer", () => {
  it("defers when the session has no tenant", () => {
    expect(layer.evaluate(createSession({ tenantId: null }), INVENTORY_KEY, DEFAULT_DECISION, withPlan([]))).toBeNull();
  });

  it("defers for an unregistered key rather than guessing its module", () => {
    expect(layer.evaluate(createSession(), "totally.unknown.key", DEFAULT_DECISION, withPlan(["FINANCE"]))).toBeNull();
  });

  it("defers when the plan lists no module restriction at all", () => {
    // An empty list means "unrestricted", which is a different thing from
    // a plan that allows nothing.
    expect(layer.evaluate(createSession(), INVENTORY_KEY, DEFAULT_DECISION, withPlan([]))).toBeNull();
  });

  it("defers when the key's module is inside the plan", () => {
    expect(layer.evaluate(createSession(), INVENTORY_KEY, DEFAULT_DECISION, withPlan(["INVENTORY"]))).toBeNull();
  });

  it("denies and locks when the key's module is outside the plan", () => {
    const decision = layer.evaluate(createSession(), INVENTORY_KEY, DEFAULT_DECISION, withPlan(["FINANCE"]));

    expect(decision).toMatchObject({ allowed: false, locked: true });
    expect(decision?.reason).toContain("plan");
  });

  it("denies and locks export permission when the plan allows no export categories", () => {
    const decision = layer.evaluate(createSession(), EXPORT_KEY, DEFAULT_DECISION, withExports([]));

    expect(decision).toMatchObject({ allowed: false, locked: true });
    expect(decision?.reason).toContain("Exports");
  });

  it("defers export permission when the plan allows at least one export category", () => {
    expect(layer.evaluate(createSession(), EXPORT_KEY, DEFAULT_DECISION, withExports(["OPERATIONS"]))).toBeNull();
  });

  /**
   * `Plan.allowedReports` sat in the schema beside the two lists above and was
   * read by nothing anywhere in the product, so a plan that sold one report
   * granted all four: the module gate is all-or-nothing and there was no finer
   * answer beneath it.
   */
  describe("which individual reports the plan sells", () => {
    it("defers when the plan names no reports at all", () => {
      // Empty means unrestricted here, unlike exports. Every plan in existence
      // carries an empty list, so the other reading would take reports away
      // from every workshop already running.
      expect(layer.evaluate(createSession(), OWNER_REPORT_KEY, DEFAULT_DECISION, withReports([]))).toBeNull();
    });

    it("defers for a report the plan names", () => {
      expect(
        layer.evaluate(createSession(), OWNER_REPORT_KEY, DEFAULT_DECISION, withReports([OWNER_REPORT_KEY])),
      ).toBeNull();
    });

    it("denies and locks a report the plan leaves out", () => {
      const decision = layer.evaluate(
        createSession(),
        INVENTORY_REPORT_KEY,
        DEFAULT_DECISION,
        withReports([OWNER_REPORT_KEY]),
      );

      expect(decision).toMatchObject({ allowed: false, locked: true });
      expect(decision?.reason).toContain("not included in your current plan");
    });

    it("leaves keys outside the reports family alone", () => {
      // The list names reports, not permissions in general -- a plan that
      // sells one report must not thereby switch off stock adjustments.
      expect(
        layer.evaluate(createSession(), INVENTORY_KEY, DEFAULT_DECISION, withReports([OWNER_REPORT_KEY])),
      ).toBeNull();
    });
  });
});
