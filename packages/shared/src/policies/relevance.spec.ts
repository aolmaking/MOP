import { isPolicyRelevant } from "./types";
import type { PolicyDefinition } from "./types";

/**
 * Phase 22's conformance review against PHASE_21.md S3.2 found the
 * first cut of relevance only ever received a capability profile --
 * specializations and prior policy answers were named in a comment but
 * never actually threaded through. These tests prove the completed
 * three-input model (capabilities + specializations + prior answers)
 * and, specifically, that the answer-scoping discipline
 * `RelevanceContext`'s own doc comment describes actually holds: a
 * predicate only ever sees prior answers for policies it declared in
 * `dependsOnPolicies`, never the workshop's full answer set.
 */
function definition(overrides: Partial<PolicyDefinition> = {}): PolicyDefinition {
  return {
    key: "TEST_POLICY",
    question: "A test question?",
    options: [
      { key: "A", label: "A", meaning: "means A" },
      { key: "B", label: "B", meaning: "means B" },
    ],
    default: "A",
    defaultReason: "A real, specific reason this is the sensible default for most workshops.",
    relevantWhen: () => true,
    mutability: "FREELY",
    buildPosture: "POLICY_CONTROLLED",
    dependsOnCapabilities: [],
    dependsOnPolicies: [],
    ...overrides,
  };
}

describe("isPolicyRelevant -- capabilities", () => {
  it("is irrelevant when a required capability is inactive", () => {
    const def = definition({ dependsOnCapabilities: ["QC"] });
    expect(isPolicyRelevant(def, { QC: "DISABLED" })).toBe(false);
  });

  it("is relevant when the required capability is active (including the absent-means-enabled convention)", () => {
    const def = definition({ dependsOnCapabilities: ["QC"] });
    expect(isPolicyRelevant(def, {})).toBe(true);
    expect(isPolicyRelevant(def, { QC: "ENABLED" })).toBe(true);
  });
});

describe("isPolicyRelevant -- specializations", () => {
  it("passes the specialization set through to the predicate", () => {
    const def = definition({ relevantWhen: (ctx) => ctx.specializations.has("WARRANTY") });

    expect(isPolicyRelevant(def, {}, new Set(["WARRANTY"]))).toBe(true);
    expect(isPolicyRelevant(def, {}, new Set(["CREDENTIAL"]))).toBe(false);
    expect(isPolicyRelevant(def, {})).toBe(false); // default empty set
  });
});

describe("isPolicyRelevant -- prior answers, scoped to declared dependencies", () => {
  it("sees the value of a policy it declared in dependsOnPolicies", () => {
    const def = definition({
      dependsOnPolicies: ["OTHER_POLICY"],
      relevantWhen: (ctx) => ctx.priorAnswers.get("OTHER_POLICY") === "SPECIAL_VALUE",
    });
    const answers = new Map([["OTHER_POLICY", "SPECIAL_VALUE"]]);

    expect(isPolicyRelevant(def, {}, new Set(), answers)).toBe(true);
  });

  it("does NOT see the value of a policy it never declared as a dependency -- the scoping is load-bearing", () => {
    const def = definition({
      dependsOnPolicies: [], // deliberately does not declare UNDECLARED_POLICY
      relevantWhen: (ctx) => ctx.priorAnswers.get("UNDECLARED_POLICY") === "SPECIAL_VALUE",
    });
    // The workshop really does have this answer -- but this policy never
    // said it depends on it, so it must not be visible to the predicate.
    const answers = new Map([["UNDECLARED_POLICY", "SPECIAL_VALUE"]]);

    expect(isPolicyRelevant(def, {}, new Set(), answers)).toBe(false);
  });

  it("reads absent as undefined, not as a stale or default value, when the workshop never set the dependency", () => {
    const def = definition({
      dependsOnPolicies: ["OTHER_POLICY"],
      relevantWhen: (ctx) => ctx.priorAnswers.get("OTHER_POLICY") === undefined,
    });
    expect(isPolicyRelevant(def, {}, new Set(), new Map())).toBe(true);
  });
});

describe("isPolicyRelevant -- all three inputs together", () => {
  it("evaluates a predicate that genuinely needs capability, specialization, and prior-answer facts at once", () => {
    const def = definition({
      dependsOnCapabilities: ["INVENTORY"],
      dependsOnPolicies: ["PARENT_POLICY"],
      relevantWhen: (ctx) =>
        ctx.specializations.has("WARRANTY") && ctx.priorAnswers.get("PARENT_POLICY") === "ENABLED_SOMETHING",
    });

    const specializations = new Set(["WARRANTY"]);
    const answers = new Map([["PARENT_POLICY", "ENABLED_SOMETHING"]]);

    expect(isPolicyRelevant(def, { INVENTORY: "ENABLED" }, specializations, answers)).toBe(true);
    expect(isPolicyRelevant(def, { INVENTORY: "DISABLED" }, specializations, answers)).toBe(false);
    expect(isPolicyRelevant(def, { INVENTORY: "ENABLED" }, new Set(), answers)).toBe(false);
    expect(isPolicyRelevant(def, { INVENTORY: "ENABLED" }, specializations, new Map())).toBe(false);
  });
});
