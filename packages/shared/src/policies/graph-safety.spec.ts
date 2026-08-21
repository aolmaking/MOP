import {
  policiesAppearingOnEdges,
  policiesOnEdgesDeclareTheirCapability,
  relevantPolicyAnswers,
  validatePolicyGraphSafety,
} from "./graph-safety";
import { effectiveGraph, resolveIntent } from "../capabilities/workflow-router";
import { WORK_ORDER_GRAPH } from "../capabilities/workflow-graphs";

/**
 * Letting a policy narrow the workflow graph puts the capability engine's
 * central promise at risk in a new way. These are the tests that keep the
 * two compatible.
 */

describe("no policy answer can strand a work order", () => {
  it("holds across every shipped profile and every graph-touching option", () => {
    const result = validatePolicyGraphSafety();
    expect(result.issues).toEqual([]);
    expect(result.safe).toBe(true);
    // A guarantee proven over nothing is not a guarantee.
    expect(result.casesChecked).toBeGreaterThan(20);
  });

  it("every policy on an edge is owned by a capability that edge requires", () => {
    expect(policiesOnEdgesDeclareTheirCapability()).toEqual([]);
  });

  it("only policies that genuinely touch routing appear on edges", () => {
    // If this list grows, the combination space in the safety walk grows
    // with it -- so growth should be deliberate, not incidental.
    expect(policiesAppearingOnEdges()).toEqual(["APPROVAL_REQUIRED_SCOPE", "TECHNICIAN_DIRECT_SEND"]);
  });
});

describe("a stale answer is not an answer", () => {
  it("drops an answer whose capability has since been removed", () => {
    const stored = new Map([["TECHNICIAN_DIRECT_SEND", "REVIEW_REQUIRED"]]);

    // With review on, the answer stands.
    expect(relevantPolicyAnswers({}, stored).get("TECHNICIAN_DIRECT_SEND")).toBe("REVIEW_REQUIRED");
    // With review gone the question is no longer asked, so the row --
    // which the time-ranged table correctly keeps -- must not narrow
    // anything.
    expect(relevantPolicyAnswers({ TEAM_REVIEW: "DISABLED" }, stored).has("TECHNICIAN_DIRECT_SEND")).toBe(false);
  });

  it("filters the stale answer out before it reaches the router", () => {
    const profile = { TEAM_REVIEW: "DISABLED" as const };
    const raw = new Map([["TECHNICIAN_DIRECT_SEND", "REVIEW_REQUIRED"]]);

    // The edge the answer narrows requires TEAM_REVIEW, so it is gone
    // either way here -- the structural check
    // (`policiesOnEdgesDeclareTheirCapability`) is what guarantees that
    // stays true for any future edge, and this proves the runtime filter
    // agrees with it rather than relying on it.
    expect(relevantPolicyAnswers(profile, raw).size).toBe(0);
    expect(resolveIntent(WORK_ORDER_GRAPH, profile, "IN_PROGRESS", "FINISH", relevantPolicyAnswers(profile, raw)).ok).toBe(
      true,
    );
  });
});

describe("policies really do change where work goes", () => {
  it("routes finish through team review only when the workshop requires it", () => {
    // The contradiction this fixed: with TEAM_REVIEW on, declaration
    // order forced review unconditionally, so the policy's own declared
    // default (DIRECT -- "review is available, not compulsory") could not
    // be expressed at all.
    const required = resolveIntent(
      WORK_ORDER_GRAPH,
      {},
      "IN_PROGRESS",
      "FINISH",
      new Map([["TECHNICIAN_DIRECT_SEND", "REVIEW_REQUIRED"]]),
    );
    const direct = resolveIntent(
      WORK_ORDER_GRAPH,
      {},
      "IN_PROGRESS",
      "FINISH",
      new Map([["TECHNICIAN_DIRECT_SEND", "DIRECT"]]),
    );

    expect(required.ok && required.transition.to).toBe("READY_FOR_TEAM_REVIEW");
    expect(direct.ok && direct.transition.to).toBe("READY_FOR_QC");
  });

  it("leaves a review-less workshop finishing to QC, and to invoicing without QC", () => {
    const noReview = resolveIntent(WORK_ORDER_GRAPH, { TEAM_REVIEW: "DISABLED" }, "IN_PROGRESS", "FINISH", new Map());
    expect(noReview.ok && noReview.transition.to).toBe("READY_FOR_QC");

    const noReviewNoQc = resolveIntent(
      WORK_ORDER_GRAPH,
      { TEAM_REVIEW: "DISABLED", QC: "DISABLED" },
      "IN_PROGRESS",
      "FINISH",
      new Map(),
    );
    expect(noReviewNoQc.ok && noReviewNoQc.transition.to).toBe("PAYMENT_PENDING");
  });

  it("a workshop that requires review but has no QC or finance still finishes", () => {
    // The combination the safety walk is really guarding: review is the
    // only live FINISH edge, so the policy must not be able to remove it.
    const result = resolveIntent(
      WORK_ORDER_GRAPH,
      { QC: "DISABLED", FINANCE_CORE: "DISABLED", BILLING: "DISABLED" },
      "IN_PROGRESS",
      "FINISH",
      new Map([["TECHNICIAN_DIRECT_SEND", "REVIEW_REQUIRED"]]),
    );
    expect(result.ok && result.transition.to).toBe("READY_FOR_TEAM_REVIEW");
  });

  it("removes the skip-approval route when every job needs the customer's word", () => {
    const skip = (answer?: string) =>
      effectiveGraph(WORK_ORDER_GRAPH, {}, answer ? new Map([["APPROVAL_REQUIRED_SCOPE", answer]]) : new Map())
        .transitions.filter((t) => t.from === "UNDER_INSPECTION" && t.to === "APPROVED_FOR_WORK").length;

    expect(skip("BEYOND_INITIAL_SCOPE")).toBe(1);
    expect(skip("CRITICAL_ONLY")).toBe(1);
    // ALL_WORK: the only way out of inspection is through the customer.
    expect(skip("ALL_WORK")).toBe(0);
    // And the approval route is always there, which is why removing the
    // skip cannot strand anything.
    const stillReachable = effectiveGraph(WORK_ORDER_GRAPH, {}, new Map([["APPROVAL_REQUIRED_SCOPE", "ALL_WORK"]]))
      .transitions.filter((t) => t.from === "UNDER_INSPECTION" && t.to === "AWAITING_CUSTOMER_APPROVAL");
    expect(stillReachable.length).toBe(1);
  });

  it("an unanswered policy narrows nothing", () => {
    const before = effectiveGraph(WORK_ORDER_GRAPH, {}, new Map()).transitions.length;
    const after = effectiveGraph(WORK_ORDER_GRAPH, {}).transitions.length;
    expect(after).toBe(before);
  });
});
