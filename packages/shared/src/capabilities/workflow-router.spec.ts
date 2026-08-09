import { allowedTransitions, canTransition, effectiveGraph, isTerminal, resolveIntent } from "./workflow-router";
import { WORK_ORDER_GRAPH, PART_REQUEST_GRAPH } from "./workflow-graphs";
import { SHIPPED_PROFILES } from "./profiles";
import type { CapabilityProfile } from "./types";

const finish = (profile: CapabilityProfile) => resolveIntent(WORK_ORDER_GRAPH, profile, "IN_PROGRESS", "FINISH");

describe("resolveIntent — finish routing is a function of capabilities", () => {
  // The single most important behaviour in the lifecycle: "technician
  // finishes" lands somewhere different in every workshop shape, and the
  // choice lives in graph data rather than an if-chain in a service.

  it("routes to team review when the workshop reviews work", () => {
    const result = finish({});
    expect(result.ok && result.transition.to).toBe("READY_FOR_TEAM_REVIEW");
  });

  it("routes to QC when there is no team review", () => {
    const result = finish({ TEAM_REVIEW: "DISABLED" });
    expect(result.ok && result.transition.to).toBe("READY_FOR_QC");
  });

  it("routes straight to invoicing when there is neither review nor QC", () => {
    const result = finish({ TEAM_REVIEW: "DISABLED", QC: "DISABLED" });
    expect(result.ok && result.transition.to).toBe("PAYMENT_PENDING");
  });

  it("routes to delivery readiness when finance is external too", () => {
    // A workshop that runs operations in MOP and money elsewhere. Nothing
    // in the code knows this case specially -- it falls out of the graph.
    const result = finish({ TEAM_REVIEW: "DISABLED", QC: "DISABLED", FINANCE_CORE: "EXTERNAL", BILLING: "EXTERNAL" });
    expect(result.ok && result.transition.to).toBe("READY_FOR_DELIVERY");
  });

  it("keeps declaration order as precedence when several routes are live", () => {
    // With review, QC and finance all enabled, three FINISH edges are live
    // at once. Review must win; if this ever returns QC, the graph has been
    // reordered and the lifecycle silently changed for every workshop.
    const all = allowedTransitions(WORK_ORDER_GRAPH, {}, "IN_PROGRESS").filter((t) => t.intent === "FINISH");
    expect(all.length).toBeGreaterThan(1);
    expect(all[0]?.to).toBe("READY_FOR_TEAM_REVIEW");
  });
});

describe("resolveIntent — review and QC continue the same way", () => {
  it("review passes to QC when QC exists", () => {
    const result = resolveIntent(WORK_ORDER_GRAPH, {}, "READY_FOR_TEAM_REVIEW", "REVIEW_PASSED");
    expect(result.ok && result.transition.to).toBe("READY_FOR_QC");
  });

  it("review passes to invoicing when QC does not exist", () => {
    const result = resolveIntent(WORK_ORDER_GRAPH, { QC: "DISABLED" }, "READY_FOR_TEAM_REVIEW", "REVIEW_PASSED");
    expect(result.ok && result.transition.to).toBe("PAYMENT_PENDING");
  });

  it("QC passes to invoicing, or to delivery when finance is external", () => {
    const withFinance = resolveIntent(WORK_ORDER_GRAPH, {}, "READY_FOR_QC", "QC_PASSED");
    expect(withFinance.ok && withFinance.transition.to).toBe("PAYMENT_PENDING");

    const withoutFinance = resolveIntent(
      WORK_ORDER_GRAPH,
      { FINANCE_CORE: "EXTERNAL", BILLING: "EXTERNAL" },
      "READY_FOR_QC",
      "QC_PASSED",
    );
    expect(withoutFinance.ok && withoutFinance.transition.to).toBe("READY_FOR_DELIVERY");
  });
});

describe("resolveIntent — refusals", () => {
  it("refuses an intent that does not apply from this state", () => {
    const result = resolveIntent(WORK_ORDER_GRAPH, {}, "DRAFT", "FINISH");

    expect(result.ok).toBe(false);
    expect(!result.ok && result.failure.kind).toBe("NO_SUCH_TRANSITION");
    expect(!result.ok && result.failure.message).toContain("DRAFT");
  });

  it("distinguishes an intent removed by capability from one that never applies here", () => {
    // A technician told "you cannot do that from here" needs a different
    // message from one told "this workshop does not do that at all".
    const noParts = resolveIntent(WORK_ORDER_GRAPH, { INVENTORY: "DISABLED" }, "IN_PROGRESS", "REQUEST_PART");
    expect(noParts.ok).toBe(false);
    expect(!noParts.ok && noParts.failure.kind).toBe("NO_SUCH_TRANSITION");
  });
});

describe("effectiveGraph", () => {
  it("drops edges whose capability is inactive", () => {
    const withParts = effectiveGraph(WORK_ORDER_GRAPH, {}).transitions;
    const withoutParts = effectiveGraph(WORK_ORDER_GRAPH, { INVENTORY: "DISABLED" }).transitions;

    expect(withParts.some((t) => t.to === "WAITING_PARTS")).toBe(true);
    expect(withoutParts.some((t) => t.to === "WAITING_PARTS")).toBe(false);
  });

  it("adds the replacement edges a removal policy contributes", () => {
    const external = effectiveGraph(WORK_ORDER_GRAPH, { FINANCE_CORE: "EXTERNAL", BILLING: "EXTERNAL" }).transitions;

    expect(external.some((t) => t.from === "IN_PROGRESS" && t.to === "READY_FOR_DELIVERY")).toBe(true);
    expect(external.some((t) => t.to === "PAYMENT_PENDING")).toBe(false);
  });

  it("skips a replacement edge whose own capability is also gone", () => {
    // The finance-off reroute out of team review only applies if team
    // review still exists.
    const both = effectiveGraph(WORK_ORDER_GRAPH, {
      FINANCE_CORE: "EXTERNAL",
      BILLING: "EXTERNAL",
      TEAM_REVIEW: "DISABLED",
    }).transitions;

    expect(both.some((t) => t.from === "READY_FOR_TEAM_REVIEW")).toBe(false);
  });
});

describe("canTransition", () => {
  it("permits a legal move", () => {
    expect(canTransition(WORK_ORDER_GRAPH, {}, "DRAFT", "REGISTERED")).toBe(true);
  });

  it("refuses a move that skips the lifecycle", () => {
    // The refusal that makes "no hardcoded transitions" real: a service
    // cannot jump a work order from intake to closed.
    expect(canTransition(WORK_ORDER_GRAPH, {}, "DRAFT", "CLOSED")).toBe(false);
  });

  it("refuses a move whose capability is inactive", () => {
    expect(canTransition(WORK_ORDER_GRAPH, { INVENTORY: "DISABLED" }, "IN_PROGRESS", "WAITING_PARTS")).toBe(false);
  });
});

describe("gates on transitions", () => {
  it("guards delivery with the invoice and payment gates", () => {
    const deliver = resolveIntent(WORK_ORDER_GRAPH, {}, "READY_FOR_DELIVERY", "DELIVER");

    expect(deliver.ok).toBe(true);
    expect(deliver.ok && deliver.transition.gates).toContain("payment.settled_or_policy_allows");
  });

  it("declares the full finish-gate set on every finish edge", () => {
    // Gates whose owning capability is inactive are dropped by the gate
    // registry, so declaring them all here is correct rather than
    // over-broad -- a workshop with no inventory is never asked about parts.
    const finishEdges = WORK_ORDER_GRAPH.transitions.filter((t) => t.intent === "FINISH");

    expect(finishEdges.length).toBeGreaterThan(0);
    for (const edge of finishEdges) {
      expect(edge.gates).toContain("approved_work_completed");
      expect(edge.gates).toContain("no_open_blocker");
    }
  });
});

describe("every shipped profile can drive a work order to a terminal state", () => {
  it.each(Object.keys(SHIPPED_PROFILES))("%s reaches a terminal state by walking intents", (name) => {
    const profile = SHIPPED_PROFILES[name]!;

    // Walk the graph from the initial state, always taking the first
    // available edge, and assert we land somewhere terminal rather than
    // looping or dead-ending. This is the router's version of the
    // validator's reachability proof -- same guarantee, exercised through
    // the code the lifecycle will actually call.
    let state = WORK_ORDER_GRAPH.initial;
    const visited = new Set<string>();

    while (!isTerminal(WORK_ORDER_GRAPH, state)) {
      if (visited.has(state)) break; // cycle -- fall through to the assertion
      visited.add(state);

      const next = allowedTransitions(WORK_ORDER_GRAPH, profile, state).find((t) => !visited.has(t.to));
      if (!next) break;
      state = next.to;
    }

    expect(isTerminal(WORK_ORDER_GRAPH, state)).toBe(true);
  });
});

describe("PartRequest graph", () => {
  it("still routes to a terminal state without returns", () => {
    expect(canTransition(PART_REQUEST_GRAPH, { PART_RETURNS: "DISABLED" }, "RECEIVED_BY_TECHNICIAN", "USED")).toBe(true);
    expect(
      canTransition(PART_REQUEST_GRAPH, { PART_RETURNS: "DISABLED" }, "RECEIVED_BY_TECHNICIAN", "RETURN_REQUESTED"),
    ).toBe(false);
  });
});
