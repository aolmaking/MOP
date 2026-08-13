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

import type { CapabilityKey, CapabilityProfile } from "../capabilities/types";
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
 * A policy's relevance predicate. Deliberately a plain function over the
 * workshop's active capabilities, not a declarative expression language
 * -- PHASE_21.md S3.4's rule against a "second, worse programming
 * language" applies here as much as it does to consumption. Kept to
 * capability-profile input only for this first slice: relevance derived
 * from specializations or from a PRIOR POLICY ANSWER is real (the model
 * allows for it) but not yet needed by any policy in this registry, and
 * PHASE_21.md S9's relevance-graph audit found that thematic links
 * between decisions are easy to mis-record as formal dependencies when
 * that richer form is used without care. Extend `RelevanceContext` only
 * when a real policy needs it.
 */
export interface RelevanceContext {
  readonly capabilities: CapabilityProfile;
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
   */
  readonly dependsOnCapabilities: readonly CapabilityKey[];
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

/** Convenience most callers want: is this policy active for a workshop with this capability profile? */
export function isPolicyRelevant(definition: PolicyDefinition, profile: CapabilityProfile): boolean {
  if (definition.dependsOnCapabilities.some((key) => !isCapabilityActive(profile, key))) return false;
  return definition.relevantWhen({ capabilities: profile });
}
