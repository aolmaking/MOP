import { SINGLE_BAY_QUICK_SERVICE, MULTI_BRANCH_FULL_SERVICE } from "../capabilities/profiles";
import {
  applicableResponsibilities,
  grantsForResponsibilities,
  orphanedCapabilities,
  responsibilitySummary,
} from "./responsibility";

/**
 * A regression for a real, silent hole this file's own doc comment
 * describes for INVENTORY but that also existed here, unnoticed, for
 * BRANCH_MANAGER: the question was gated on MULTI_BRANCH being active,
 * so a single-branch workshop -- the overwhelming majority of tenants,
 * since SINGLE_BAY_QUICK_SERVICE and friends all disable MULTI_BRANCH --
 * was never asked who runs it, and TENANT_OWNER never received the
 * grant. `owner-operational-visibility.spec.ts` (apps/api/src/access)
 * proves TENANT_OWNER holds none of workorders.branch.*,
 * customer_decision.record_on_behalf or customer.intake.create by
 * default, so an unanswered question here left every one-bay shop with
 * nobody able to book a vehicle in, record a customer's decision on
 * their behalf, reassign a technician or release a delivery.
 */
describe("the branch-manager responsibility question", () => {
  it("is asked for a single-branch workshop, not only a multi-branch one", () => {
    const questions = applicableResponsibilities(SINGLE_BAY_QUICK_SERVICE);
    expect(questions.some((q) => q.dedicatedRole === "BRANCH_MANAGER")).toBe(true);
  });

  it("is also asked for a multi-branch workshop", () => {
    const questions = applicableResponsibilities(MULTI_BRANCH_FULL_SERVICE);
    expect(questions.some((q) => q.dedicatedRole === "BRANCH_MANAGER")).toBe(true);
  });

  it("granting it to TENANT_OWNER in a single-branch shop writes real permission rows", () => {
    // workorders.branch.view is skipped: TENANT_OWNER already holds it
    // (the read-only visibility owner-operational-visibility.spec.ts
    // guards), so re-granting it would violate grantsForResponsibilities'
    // own "only real changes" rule.
    const grants = grantsForResponsibilities(SINGLE_BAY_QUICK_SERVICE, { MULTI_BRANCH: "TENANT_OWNER" });
    const keys = grants.filter((g) => g.role === "TENANT_OWNER").map((g) => g.permissionKey);
    expect(keys).toEqual(
      expect.arrayContaining(["customer_decision.record_on_behalf", "customer.intake.create", "workorders.branch.reassign_technician"]),
    );
    expect(keys).not.toContain("workorders.branch.view");
  });

  it("a single-branch shop that neither staffs nor delegates it is a real orphan, caught before creation", () => {
    const orphaned = orphanedCapabilities(SINGLE_BAY_QUICK_SERVICE, { MULTI_BRANCH: "DATA_ANALYST" });
    expect(orphaned).toContain("MULTI_BRANCH");
  });

  it("staffing it dedicated in a single-branch shop needs no grant and no orphan", () => {
    expect(grantsForResponsibilities(SINGLE_BAY_QUICK_SERVICE, { MULTI_BRANCH: "DEDICATED" })).toEqual([]);
    expect(orphanedCapabilities(SINGLE_BAY_QUICK_SERVICE, { MULTI_BRANCH: "DEDICATED" })).toEqual([]);
  });

  it("the review-screen summary names the real holder even when MULTI_BRANCH is off", () => {
    const summary = responsibilitySummary(SINGLE_BAY_QUICK_SERVICE, { MULTI_BRANCH: "TENANT_OWNER" });
    const entry = summary.find((s) => s.capability === "MULTI_BRANCH");
    expect(entry).toEqual({ capability: "MULTI_BRANCH", holder: "TENANT_OWNER", delegated: true });
  });
});
