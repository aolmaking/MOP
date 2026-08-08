import { validateCapabilityProfile } from "./validator";
import { SHIPPED_PROFILES } from "./profiles";
import { WORK_ORDER_GRAPH } from "./workflow-graphs";
import type { CapabilityProfile, ValidationCode, WorkflowGraph } from "./types";

function codes(profile: CapabilityProfile, graphs?: readonly WorkflowGraph[]): ValidationCode[] {
  return validateCapabilityProfile(profile, graphs ? { graphs } : {}).issues.map((i) => i.code);
}

function reachable(profile: CapabilityProfile, entity: string): readonly string[] {
  const result = validateCapabilityProfile(profile);
  return result.reachability.find((r) => r.entity === entity)?.reachable ?? [];
}

describe("capability validator — shipped profiles", () => {
  // The regression net: a change to the lifecycle graph can never
  // silently strand one of the standard workshop shapes.
  it.each(Object.keys(SHIPPED_PROFILES))("%s is a valid configuration", (name) => {
    const result = validateCapabilityProfile(SHIPPED_PROFILES[name]);
    expect(result.issues).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("always leaves a work order able to reach a terminal state", () => {
    for (const profile of Object.values(SHIPPED_PROFILES)) {
      const workOrder = validateCapabilityProfile(profile).reachability.find((r) => r.entity === "WorkOrder");
      expect(workOrder?.stranded).toEqual([]);
      expect(workOrder?.reachable).toContain("CLOSED");
    }
  });
});

describe("smart delete — Inventory disabled", () => {
  const profile: CapabilityProfile = { INVENTORY: "DISABLED", PART_RETURNS: "DISABLED", MULTI_WAREHOUSE: "DISABLED" };

  it("is valid and strands nothing", () => {
    expect(validateCapabilityProfile(profile).issues).toEqual([]);
  });

  it("makes WAITING_PARTS unreachable rather than stuck", () => {
    expect(reachable(profile, "WorkOrder")).not.toContain("WAITING_PARTS");
  });

  it("stops validating PartRequest entirely — it is never created", () => {
    const entities = validateCapabilityProfile(profile).reachability.map((r) => r.entity);
    expect(entities).not.toContain("PartRequest");
  });

  it("drops the parts gate checks but keeps the work-completion one", () => {
    const result = validateCapabilityProfile(profile);
    expect(result.droppedGates).toContain("parts.received_used_or_returned");
    expect(result.droppedGates).toContain("parts.no_pending_return");
    expect(result.keptGates).toContain("approved_work_completed");
  });

  it("orphans the Inventory Manager role so it must be dealt with explicitly", () => {
    expect(validateCapabilityProfile(profile).orphanedRoles).toContain("INVENTORY_MANAGER");
  });
});

describe("smart delete — the bug this whole layer exists to catch", () => {
  // Exactly the naive implementation: deny inventory.* / hide the pages,
  // but leave the transition INTO waiting-parts ungated. The exits vanish
  // with the capability, the entrance does not, and every job in the
  // workshop is stuck forever.
  const brokenGraph: WorkflowGraph = {
    ...WORK_ORDER_GRAPH,
    transitions: WORK_ORDER_GRAPH.transitions.map((t) =>
      t.from === "IN_PROGRESS" && t.to === "WAITING_PARTS" ? { from: t.from, to: t.to } : t,
    ),
  };

  it("rejects the configuration instead of shipping it", () => {
    const result = validateCapabilityProfile({ INVENTORY: "DISABLED", PART_RETURNS: "DISABLED" }, {
      graphs: [brokenGraph],
    });

    expect(result.valid).toBe(false);
    expect(result.issues.map((i) => i.code)).toEqual(
      expect.arrayContaining(["STRANDED_STATE", "DISABLED_STATE_REACHABLE"]),
    );
    expect(result.issues.some((i) => i.subject === "WAITING_PARTS")).toBe(true);
  });

  it("names the stranded state in a message an operator can act on", () => {
    const result = validateCapabilityProfile({ INVENTORY: "DISABLED", PART_RETURNS: "DISABLED" }, {
      graphs: [brokenGraph],
    });
    const stranded = result.issues.find((i) => i.code === "STRANDED_STATE");

    expect(stranded?.message).toContain("WAITING_PARTS");
    expect(stranded?.message).toContain("no path to a terminal state");
  });
});

describe("smart delete — Customer Portal disabled", () => {
  const profile: CapabilityProfile = { CUSTOMER_PORTAL: "DISABLED" };

  it("is valid — the approval step survives losing the channel", () => {
    expect(validateCapabilityProfile(profile).issues).toEqual([]);
  });

  it("still lets a decision reach RESOLVED, via counter approval", () => {
    expect(reachable(profile, "CustomerDecisionRequest")).toContain("RESOLVED");
  });

  it("removes only the portal states, not the decision itself", () => {
    const states = reachable(profile, "CustomerDecisionRequest");
    expect(states).not.toContain("SENT");
    expect(states).not.toContain("VIEWED");
    expect(states).toContain("PENDING");
  });

  it("keeps the approval and critical-acknowledgement gates", () => {
    const result = validateCapabilityProfile(profile);
    expect(result.keptGates).toContain("customer_decisions_resolved");
    expect(result.keptGates).toContain("critical_warning_acknowledged");
  });
});

describe("smart delete — Team Review disabled", () => {
  const profile: CapabilityProfile = { TEAM_REVIEW: "DISABLED" };

  it("is valid and reroutes finish", () => {
    expect(validateCapabilityProfile(profile).issues).toEqual([]);
  });

  it("makes READY_FOR_TEAM_REVIEW unreachable while QC still absorbs finish", () => {
    const states = reachable(profile, "WorkOrder");
    expect(states).not.toContain("READY_FOR_TEAM_REVIEW");
    expect(states).toContain("READY_FOR_QC");
    expect(states).toContain("CLOSED");
  });

  it("orphans the Team Leader role", () => {
    expect(validateCapabilityProfile(profile).orphanedRoles).toContain("TEAM_LEADER");
  });

  it("still reaches delivery when QC is also off", () => {
    const both: CapabilityProfile = { TEAM_REVIEW: "DISABLED", QC: "DISABLED" };
    expect(validateCapabilityProfile(both).issues).toEqual([]);
    expect(reachable(both, "WorkOrder")).toContain("CLOSED");
  });
});

describe("smart delete — Multi-Branch disabled", () => {
  const profile: CapabilityProfile = { MULTI_BRANCH: "DISABLED" };

  it("is valid and touches no lifecycle state", () => {
    const result = validateCapabilityProfile(profile);
    expect(result.issues).toEqual([]);
    // Rule 1: behaviour and presentation change, data shape does not. The
    // branch dimension stays; only the UI collapses it.
    expect(result.reachability.find((r) => r.entity === "WorkOrder")?.stranded).toEqual([]);
  });
});

describe("smart delete — Billing disabled while Finance Core stays enabled", () => {
  const profile: CapabilityProfile = { BILLING: "EXTERNAL" };

  it("is valid — the two are separate bounded systems", () => {
    expect(validateCapabilityProfile(profile).issues).toEqual([]);
  });

  it("keeps the payment gate and internal money states", () => {
    const result = validateCapabilityProfile(profile);
    expect(result.droppedGates).toContain("invoice.issued");
    expect(result.keptGates).toContain("payment.settled_or_policy_allows");
    expect(reachable(profile, "WorkOrder")).toContain("PAYMENT_PENDING");
  });
});

describe("smart delete — Finance Core externalised", () => {
  const profile: CapabilityProfile = { FINANCE_CORE: "EXTERNAL", BILLING: "EXTERNAL" };

  it("is valid — delivery is still reachable without internal money", () => {
    expect(validateCapabilityProfile(profile).issues).toEqual([]);
  });

  it("routes finish straight to delivery and drops PAYMENT_PENDING", () => {
    const states = reachable(profile, "WorkOrder");
    expect(states).not.toContain("PAYMENT_PENDING");
    expect(states).toContain("READY_FOR_DELIVERY");
    expect(states).toContain("CLOSED");
  });
});

describe("static integrity", () => {
  it("rejects an active capability whose dependency is off", () => {
    // Returns cannot function without an inventory to return into.
    expect(codes({ INVENTORY: "DISABLED" })).toContain("MISSING_DEPENDENCY");
  });

  it("reports the specific dependency that is missing", () => {
    const issue = validateCapabilityProfile({ INVENTORY: "DISABLED" }).issues.find(
      (i) => i.code === "MISSING_DEPENDENCY",
    );
    expect(issue?.message).toContain("INVENTORY");
  });

  it("refuses to disable a core capability", () => {
    const core = new Map([
      [
        "QC" as const,
        {
          key: "QC" as const,
          owningSystem: "OPERATIONS" as const,
          dependencies: [],
          conflicts: [],
          affectedGates: [],
          affectedRoles: [],
          affectedReports: [],
          historicalRecordPolicy: "PRESERVE_READ_ONLY" as const,
          reversible: false,
          removal: null,
        },
      ],
    ]);

    const result = validateCapabilityProfile({ QC: "DISABLED" }, { registry: core, graphs: [] });
    expect(result.issues.map((i) => i.code)).toContain("CORE_CAPABILITY_DISABLED");
  });
});
