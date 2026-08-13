import { validatePolicyRegistry } from "./validator";
import { POLICY_REGISTRY } from "./registry";
import type { PolicyDefinition } from "./types";

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

describe("the real POLICY_REGISTRY", () => {
  it("is entirely valid", () => {
    const result = validatePolicyRegistry([...POLICY_REGISTRY.values()]);
    expect(result.issues).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("every policy has a real, non-placeholder defaultReason", () => {
    for (const policy of POLICY_REGISTRY.values()) {
      expect(policy.defaultReason.length).toBeGreaterThan(20);
    }
  });

  it("every policy's default is one of its own declared options", () => {
    for (const policy of POLICY_REGISTRY.values()) {
      expect(policy.options.map((o) => o.key)).toContain(policy.default);
    }
  });
});

describe("policy registration integrity", () => {
  it("rejects a policy with only one option", () => {
    const result = validatePolicyRegistry([definition({ options: [{ key: "A", label: "A", meaning: "only one" }] })]);
    expect(result.valid).toBe(false);
    expect(result.issues.map((i) => i.code)).toContain("TOO_FEW_OPTIONS");
  });

  it("rejects a default that is not one of the declared options", () => {
    const result = validatePolicyRegistry([definition({ default: "NOT_REAL" })]);
    expect(result.issues.map((i) => i.code)).toContain("DEFAULT_NOT_AN_OPTION");
  });

  it("rejects a placeholder defaultReason", () => {
    const result = validatePolicyRegistry([definition({ defaultReason: "because" })]);
    expect(result.issues.map((i) => i.code)).toContain("MISSING_DEFAULT_REASON");
  });

  it("rejects a duplicate option key within one policy", () => {
    const result = validatePolicyRegistry([
      definition({
        options: [
          { key: "A", label: "A", meaning: "one" },
          { key: "A", label: "A again", meaning: "two" },
        ],
      }),
    ]);
    expect(result.issues.map((i) => i.code)).toContain("DUPLICATE_OPTION_KEY");
  });

  it("rejects a dependency on a policy that doesn't exist", () => {
    const result = validatePolicyRegistry([definition({ dependsOnPolicies: ["GHOST_POLICY"] })]);
    expect(result.issues.map((i) => i.code)).toContain("UNKNOWN_POLICY_DEPENDENCY");
  });

  it("rejects two policies registered under the same key", () => {
    const result = validatePolicyRegistry([definition(), definition()]);
    expect(result.issues.map((i) => i.code)).toContain("DUPLICATE_KEY");
  });

  // The exact failure mode PHASE_21.md SS9.1 found and fixed by hand in
  // the document -- this proves the registry itself would now catch a
  // repeat of that mistake automatically, in CI, rather than requiring
  // another manual audit.
  it("rejects a two-policy relevance cycle", () => {
    const a = definition({ key: "POLICY_A", dependsOnPolicies: ["POLICY_B"] });
    const b = definition({ key: "POLICY_B", dependsOnPolicies: ["POLICY_A"] });
    const result = validatePolicyRegistry([a, b]);
    expect(result.valid).toBe(false);
    expect(result.issues.map((i) => i.code)).toContain("RELEVANCE_CYCLE");
  });

  it("rejects a longer, three-policy relevance cycle", () => {
    const a = definition({ key: "POLICY_A", dependsOnPolicies: ["POLICY_B"] });
    const b = definition({ key: "POLICY_B", dependsOnPolicies: ["POLICY_C"] });
    const c = definition({ key: "POLICY_C", dependsOnPolicies: ["POLICY_A"] });
    const result = validatePolicyRegistry([a, b, c]);
    expect(result.issues.map((i) => i.code)).toContain("RELEVANCE_CYCLE");
  });

  it("accepts a real one-directional dependency chain, no cycle", () => {
    const a = definition({ key: "POLICY_A", dependsOnPolicies: ["POLICY_B"] });
    const b = definition({ key: "POLICY_B", dependsOnPolicies: [] });
    const result = validatePolicyRegistry([a, b]);
    expect(result.valid).toBe(true);
  });
});
