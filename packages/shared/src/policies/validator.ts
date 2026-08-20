import type { PolicyDefinition } from "./types";

/**
 * Registration-time integrity checks for the policy registry, mirroring
 * capabilities/validator.ts's role for the capability registry: a policy
 * that fails these is not safe to register, the same way a capability
 * with no removal policy is not safe to register.
 *
 * Run in validator.spec.ts against the real POLICY_REGISTRY, so a badly
 * formed policy fails CI rather than surfacing as a runtime bug the
 * first time a workshop's questionnaire is generated.
 */

export type PolicyValidationCode =
  | "DUPLICATE_KEY"
  | "TOO_FEW_OPTIONS"
  | "DUPLICATE_OPTION_KEY"
  | "DEFAULT_NOT_AN_OPTION"
  | "MISSING_DEFAULT_REASON"
  | "MISSING_ENFORCEMENT_NOTE"
  | "UNKNOWN_POLICY_DEPENDENCY"
  | "RELEVANCE_CYCLE";

export interface PolicyValidationIssue {
  readonly code: PolicyValidationCode;
  readonly policyKey: string;
  readonly message: string;
}

export interface PolicyValidationResult {
  readonly valid: boolean;
  readonly issues: readonly PolicyValidationIssue[];
}

export function validatePolicyRegistry(definitions: readonly PolicyDefinition[]): PolicyValidationResult {
  const issues: PolicyValidationIssue[] = [];
  const byKey = new Map(definitions.map((d) => [d.key, d]));

  if (byKey.size !== definitions.length) {
    const seen = new Set<string>();
    for (const d of definitions) {
      if (seen.has(d.key)) {
        issues.push({ code: "DUPLICATE_KEY", policyKey: d.key, message: `"${d.key}" is registered more than once.` });
      }
      seen.add(d.key);
    }
  }

  for (const definition of definitions) {
    if (definition.options.length < 2) {
      issues.push({
        code: "TOO_FEW_OPTIONS",
        policyKey: definition.key,
        message: "A policy needs at least two real options -- one option is not a decision.",
      });
    }

    const optionKeys = new Set<string>();
    for (const option of definition.options) {
      if (optionKeys.has(option.key)) {
        issues.push({
          code: "DUPLICATE_OPTION_KEY",
          policyKey: definition.key,
          message: `Option "${option.key}" is declared more than once.`,
        });
      }
      optionKeys.add(option.key);
    }

    if (!optionKeys.has(definition.default)) {
      issues.push({
        code: "DEFAULT_NOT_AN_OPTION",
        policyKey: definition.key,
        message: `Default "${definition.default}" is not one of this policy's declared options.`,
      });
    }

    // TypeScript's `readonly string` cannot enforce non-empty, so this is
    // the actual gate PHASE_21.md SS3.3's "a default without a written
    // reason cannot be registered" rule depends on.
    if (definition.defaultReason.trim().length < 20) {
      issues.push({
        code: "MISSING_DEFAULT_REASON",
        policyKey: definition.key,
        message: "defaultReason must be a real, written reason, not a placeholder.",
      });
    }

    // Same reasoning as defaultReason above: the onboarding experience
    // shows this string to a super admin as the answer to "what will
    // this actually do?", so a placeholder here is a lie with a UI in
    // front of it.
    if (definition.enforcement.where.trim().length < 20) {
      issues.push({
        code: "MISSING_ENFORCEMENT_NOTE",
        policyKey: definition.key,
        message: "enforcement.where must name the real consumer, or what has to exist before there is one.",
      });
    }

    for (const dep of definition.dependsOnPolicies) {
      if (!byKey.has(dep)) {
        issues.push({
          code: "UNKNOWN_POLICY_DEPENDENCY",
          policyKey: definition.key,
          message: `Depends on policy "${dep}", which is not registered.`,
        });
      }
    }
  }

  // Relevance-graph acyclicity, over dependsOnPolicies edges only --
  // PHASE_21.md SS9.1's finding was that most apparent cycles were a
  // thematic relationship mis-recorded as a formal one; this checks the
  // graph as declared, which is why keeping dependsOnPolicies edges rare
  // and deliberate (per the field's own doc comment in types.ts) matters.
  for (const definition of definitions) {
    const cyclePath = findCycleFrom(definition.key, byKey);
    if (cyclePath) {
      issues.push({
        code: "RELEVANCE_CYCLE",
        policyKey: definition.key,
        message: `Relevance dependency cycle: ${cyclePath.join(" -> ")}.`,
      });
      break; // one report is enough to force a fix; the cycle repeats per node otherwise.
    }
  }

  return { valid: issues.length === 0, issues };
}

function findCycleFrom(start: string, byKey: ReadonlyMap<string, PolicyDefinition>): readonly string[] | null {
  const path: string[] = [];
  const onPath = new Set<string>();

  function visit(key: string): readonly string[] | null {
    if (onPath.has(key)) return [...path, key];
    const definition = byKey.get(key);
    if (!definition) return null;

    path.push(key);
    onPath.add(key);
    for (const dep of definition.dependsOnPolicies) {
      const found = visit(dep);
      if (found) return found;
    }
    path.pop();
    onPath.delete(key);
    return null;
  }

  return visit(start);
}
