/**
 * The policy model: what rule a step behaves under, as distinct from
 * whether the step exists (capability) or what it is called
 * (specialization). Phase 21 (docs/phases/PHASE_21.md) is the design
 * record this file implements -- read it before changing the shape here.
 *
 * The mechanical test that separates a policy from a capability
 * (PHASE_21.md S3.1): a policy may never change reachability. If a
 * setting could change whether a work order can reach a terminal state,
 * it is a mis-classified capability, not a policy.
 *
 * Nothing here imports Prisma or Nest -- same reasoning as
 * capabilities/types.ts: this is a pure domain layer so the relevance
 * graph can be validated in isolation.
 */

import type { CapabilityKey, CapabilityProfile, CapabilityStatus } from "../capabilities/types";
import { isCapabilityActive } from "../capabilities/types";

/**
 * How a policy may be changed once a workshop exists.
 *
 * FREELY -- no in-flight consequence, safe to change any time.
 * GOVERNED -- runs the draft/validate/impact-preview/apply/audit
 *   pipeline capability changes already use, because the impact is the
 *   same kind of thing ("14 jobs are in Payment Pending; turning this
 *   off releases all of them").
 * IMMUTABLE_AFTER_FIRST_USE -- cannot change once real data exists
 *   under it (e.g. an invoice numbering scheme).
 */
export const POLICY_MUTABILITY = ["FREELY", "GOVERNED", "IMMUTABLE_AFTER_FIRST_USE"] as const;
export type PolicyMutability = (typeof POLICY_MUTABILITY)[number];

export interface PolicyOption {
  readonly key: string;
  readonly label: string;
  /** What choosing this option actually means -- shown wherever the policy is presented. */
  readonly meaning: string;
}

/**
 * A policy's relevance predicate. Deliberately a plain function, not a
 * declarative expression language -- PHASE_21.md S3.4's rule against a
 * "second, worse programming language" applies here as much as it does
 * to consumption.
 *
 * Carries all three inputs PHASE_21.md S3.2 names -- capabilities,
 * specializations, and prior policy answers -- completing the interface
 * the design record specifies (Phase 22's conformance review found the
 * first cut had stopped at capabilities only, with the other two named
 * in a comment but not actually wired through).
 *
 * `priorAnswers` carries a real risk PHASE_21.md S9's audit already
 * proved out once: a predicate could read another policy's answer
 * without that dependency ever being declared in `dependsOnPolicies`,
 * which would make the relevance graph a lie -- the validator's
 * acyclicity check only sees declared edges, not what a predicate
 * function actually reads. The discipline that keeps this safe is
 * enforced by convention plus a runtime guard, not by the type system
 * alone: `isPolicyRelevant` builds `priorAnswers` scoped to exactly
 * `dependsOnPolicies`' declared keys, so a predicate reading a key it
 * never declared simply finds it absent rather than silently seeing a
 * real, undeclared answer.
 */
export interface RelevanceContext {
  readonly capabilities: CapabilityProfile;
  readonly specializations: ReadonlySet<string>;
  /** Scoped to this policy's own `dependsOnPolicies` -- see the doc comment above for why that scoping is load-bearing, not incidental. */
  readonly priorAnswers: ReadonlyMap<string, string>;
}

export type RelevancePredicate = (context: RelevanceContext) => boolean;

/**
 * PHASE_21.md S3.7's build-posture taxonomy, recorded on the policy
 * itself so a policy's classification is asserted in code, not only in
 * the inventory document. Not every posture from S3.7 applies to a
 * POLICY entry (CORE/POLICY-CONTROLLED are the only two that make sense
 * for something already classified as a policy rather than a
 * capability) -- kept as the shared type so a future capability-facing
 * registry could reuse it without a second enum drifting from this one.
 */
export const POLICY_BUILD_POSTURES = ["CORE", "POLICY_CONTROLLED"] as const;
export type PolicyBuildPosture = (typeof POLICY_BUILD_POSTURES)[number];

/**
 * A capability a policy's relevance hangs on.
 *
 * A bare key means the engine's ordinary reading: relevant only while
 * that capability is active (`ACTIVE_STATUSES`). The object form exists
 * for the one case the bare reading gets wrong, and it is the flagship
 * policy that forced it -- P-01, "is delivery blocked until the invoice
 * is paid?", is relevant when `FINANCE_CORE` is *any* status other than
 * DISABLED, EXTERNAL included. A workshop running External Finance Mode
 * still hands cars back; MOP still decides whether an outstanding
 * balance holds one. Reading EXTERNAL as "not active" would silently
 * stop asking that workshop a question whose answer still governs its
 * delivery gate.
 *
 * The key stays introspectable in both forms, so the relevance graph
 * (PHASE_21.md S9) can be built without evaluating a single predicate.
 */
export interface PolicyCapabilityCondition {
  readonly key: CapabilityKey;
  /** Statuses this policy is relevant under. Required in this form -- an object that omitted it would just be the bare key spelled longer. */
  readonly relevantUnder: readonly CapabilityStatus[];
}

export type PolicyCapabilityDependency = CapabilityKey | PolicyCapabilityCondition;

/** The capability key of a dependency in either form. */
export function policyCapabilityKey(dependency: PolicyCapabilityDependency): CapabilityKey {
  return typeof dependency === "string" ? dependency : dependency.key;
}

function dependencySatisfied(dependency: PolicyCapabilityDependency, profile: CapabilityProfile): boolean {
  if (typeof dependency === "string") return isCapabilityActive(profile, dependency);
  // Absent means ENABLED, the same convention `isCapabilityActive` uses
  // -- a profile records deviations from the full product, so a workshop
  // with no row for this capability has it.
  const status = profile[dependency.key] ?? "ENABLED";
  return dependency.relevantUnder.includes(status);
}

/**
 * Whether a policy's chosen value actually changes runtime behaviour
 * today, or is recorded now and consumed when named work lands.
 *
 * This exists because the onboarding experience shows a super admin what
 * each answer will do, and a configuration screen that implies a stored
 * string is changing behaviour when nothing reads it is the same class
 * of defect as a gate hardcoded to `true` (CLAUDE.md's "no silent
 * stubs"): believable, visible, and false. `RECORDED` is not a lesser
 * state to be hidden -- the row is real, audited and time-ranged the
 * moment it is written, and the UI says exactly that.
 */
export const POLICY_ENFORCEMENT_STATUSES = ["ENFORCED", "RECORDED"] as const;
export type PolicyEnforcementStatus = (typeof POLICY_ENFORCEMENT_STATUSES)[number];

export interface PolicyEnforcement {
  readonly status: PolicyEnforcementStatus;
  /**
   * ENFORCED: the service or gate that reads this value today.
   * RECORDED: what has to exist before it can be read, named honestly.
   */
  readonly where: string;
  /**
   * The code paths that really read this value, as `File.method`.
   *
   * Required for an ENFORCED policy and asserted against the source tree
   * in CI (`policy-consumers.spec.ts`) -- a policy cannot claim to be
   * live while naming a consumer that does not exist, and a consumer
   * renamed out from under it fails the build rather than quietly
   * turning the claim into a lie.
   *
   * Empty for a RECORDED policy, which is the honest shape: nothing
   * reads it yet.
   */
  readonly consumers: readonly string[];
}

/**
 * What a policy actually touches, beyond the value it stores.
 *
 * A policy is a cross-system behavioural decision, not a question -- one
 * answer can move a work order's route, change who may act, alter what a
 * customer sees and decide whether a car may leave. Recording that here
 * is what lets the onboarding experience state the consequence, and what
 * lets an audit ask "is anything left unaccounted for" and get an answer.
 *
 * Everything derivable is derived instead: the capabilities a policy
 * depends on come from `dependsOnCapabilities`, and the states it can
 * narrow come from the graph itself (`policiesAppearingOnEdges`). Only
 * what cannot be computed is written down.
 */
export interface PolicyImpact {
  /** Capabilities whose behaviour changes with this answer, beyond the ones it depends on. */
  readonly capabilities: readonly CapabilityKey[];
  /** Roles whose day changes. Free strings: platform roles, matched against StaffRole at use. */
  readonly roles: readonly string[];
  /** Work-order (or other entity) states this answer can add, remove or redirect. */
  readonly workflowStates: readonly string[];
  /** Permission keys granted, denied or newly consulted because of it. */
  readonly permissions: readonly string[];
  /** Page ids whose content or actions change. */
  readonly pages: readonly string[];
  /** Whether the answer changes what someone is allowed to SEE, not merely do. */
  readonly changesVisibility: boolean;
  /** Whether the answer changes money: what is charged, when, or by whom. */
  readonly changesBilling: boolean;
  /** One line, in the operator's words, naming what actually differs. */
  readonly summary: string;
}

export interface PolicyDefinition {
  readonly key: string;
  readonly question: string;
  /** 2..n. Exhaustive -- every consumer must switch over every key, never read the value as a raw string. */
  readonly options: readonly PolicyOption[];
  readonly default: string;
  /**
   * REQUIRED, matching PHASE_21.md S3.3: a default that is merely "the
   * first option in the list" is an accident that hardens into product
   * behaviour for every workshop that clicks "use recommended
   * defaults". A policy without one cannot be registered -- enforced by
   * the type system (this field is not optional) and by
   * validator.spec.ts (a non-empty check, since TypeScript cannot
   * enforce non-empty strings).
   */
  readonly defaultReason: string;
  readonly relevantWhen: RelevancePredicate;
  readonly mutability: PolicyMutability;
  readonly buildPosture: PolicyBuildPosture;
  /**
   * Capabilities this policy's relevance or options depend on, for the
   * relevance graph (PHASE_21.md S9). Declared separately from
   * `relevantWhen` (a function, not introspectable) so the graph can be
   * built and validated without evaluating every predicate against
   * every possible profile.
   *
   * A bare key requires the capability to be *active*; see
   * `PolicyCapabilityDependency` for the object form and the case that
   * needed it.
   */
  readonly dependsOnCapabilities: readonly PolicyCapabilityDependency[];
  /** Whether answering this policy changes behaviour today. See `PolicyEnforcement`. */
  readonly enforcement: PolicyEnforcement;
  /** What this decision touches across the product. See `PolicyImpact`. */
  readonly impact: PolicyImpact;
  /**
   * Other POLICIES whose existence (not stored value) this policy's
   * option set depends on -- e.g. "this option is only offered if that
   * capability/policy exists". PHASE_21.md S9.1 found and fixed four
   * cases where a thematic relationship was recorded here incorrectly;
   * an edge belongs in this list only if omitting it would let the
   * questionnaire offer a meaningless option, never merely because two
   * policies are about the same subject.
   */
  readonly dependsOnPolicies: readonly string[];
}

/**
 * Full relevance evaluation: capabilities, specializations, and prior
 * answers together, matching PHASE_21.md S3.2's model exactly. `allAnswers`
 * is the workshop's complete current answer set (policy key -> chosen
 * option key); this function narrows it to `definition.dependsOnPolicies`
 * before handing it to the predicate, which is what keeps the relevance
 * graph honest -- see `RelevanceContext`'s own doc comment.
 */
export function isPolicyRelevant(
  definition: PolicyDefinition,
  profile: CapabilityProfile,
  specializations: ReadonlySet<string> = new Set(),
  allAnswers: ReadonlyMap<string, string> = new Map(),
): boolean {
  if (definition.dependsOnCapabilities.some((dep) => !dependencySatisfied(dep, profile))) return false;

  const scopedAnswers = new Map<string, string>();
  for (const depKey of definition.dependsOnPolicies) {
    const value = allAnswers.get(depKey);
    if (value !== undefined) scopedAnswers.set(depKey, value);
  }

  return definition.relevantWhen({ capabilities: profile, specializations, priorAnswers: scopedAnswers });
}
