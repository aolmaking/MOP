import type { CapabilityKey } from "./types";

/**
 * Every gate check in the product, declared once.
 *
 * A "gate" is a condition that must hold before a work order may move past
 * a checkpoint -- Finish or Delivery. The Finish Gate is the reason a
 * technician cannot mark a job done while a received part is unaccounted
 * for; the Delivery Gate is the reason a vehicle cannot leave unpaid.
 *
 * These were previously free strings inside each capability's removal
 * policy. That made two things possible which must not be:
 *
 *   1. A typo -- "qc.pased" -- silently creating a gate nothing satisfies.
 *   2. Two capabilities disagreeing about a shared gate. That already
 *      happened once: with Inventory and Part Returns both removed, one
 *      dropped `parts.received_used_or_returned` and the other kept it,
 *      resurrecting a check nothing could satisfy and stranding every job.
 *
 * The fix is ownership. **A gate belongs to the capability that produces
 * the thing it checks, and dies with it.** Core gates (`owner: null`) are
 * never dropped by any profile -- they are the product's floor.
 */

export const GATE_KEYS = [
  // --- Finish Gate ---------------------------------------------------
  "inspection_completed",
  "approved_work_completed",
  "customer_decisions_resolved",
  "critical_warning_acknowledged",
  "no_open_blocker",
  "parts.received_used_or_returned",
  "parts.no_pending_return",
  "parts.external_resolved",
  "review.team_review_passed",
  "qc.passed",
  // --- Delivery Gate -------------------------------------------------
  "invoice.issued",
  "payment.settled_or_policy_allows",
] as const;

export type GateKey = (typeof GATE_KEYS)[number];

/**
 * Where a gate is asked.
 *
 * AUTHORIZATION is the newest and the earliest: the moment a job crosses
 * into APPROVED_FOR_WORK. It exists because FINISH was too late to be the
 * only checkpoint -- a condition first enforced when the technician
 * presses "done" has already let the labour be spent and the parts be
 * fitted, so refusing there traps the car instead of preventing the work.
 */
export type GateCheckpoint = "AUTHORIZATION" | "FINISH" | "DELIVERY";

export interface GateDefinition {
  readonly key: GateKey;
  readonly checkpoint: GateCheckpoint;
  /**
   * The capability that produces what this gate checks. `null` means the
   * gate is CORE: no capability profile may ever drop it, because the
   * condition holds regardless of how the workshop is shaped.
   */
  readonly owner: CapabilityKey | null;
  /** Shown to the person who is blocked, so it must say what to do, not what failed. */
  readonly blockedMessage: string;
  /**
   * Shown when the gate is already satisfied.
   *
   * A checklist shows passed rows next to failed ones, so both states
   * need real words. Without this the passing rows were rendered by
   * stripping the separators out of the gate key -- so a technician read
   * "Complete the inspection before finishing." directly above
   * "parts received used or returned", half the list in English and half
   * in database.
   *
   * It lives here rather than in a map beside the view because a gate's
   * text must die with the gate: a hand-kept list elsewhere goes stale
   * the moment a capability removes one.
   */
  readonly satisfiedMessage: string;
}

const DEFINITIONS: readonly GateDefinition[] = [
  {
    key: "inspection_completed",
    // Moved from FINISH. It guards the authorization boundary now, which
    // is the only place it can actually do its job: asked at FINISH it
    // could not stop unauthorized work, only refuse to let the job end
    // afterwards. It still rides the FINISH edges as well, so a job that
    // reached authorization legitimately and then had its inspection
    // removed is still caught.
    checkpoint: "AUTHORIZATION",
    owner: null,
    blockedMessage: "Record the inspection before this job is approved for work.",
    satisfiedMessage: "Inspection is complete.",
  },
  {
    key: "approved_work_completed",
    checkpoint: "FINISH",
    owner: null,
    blockedMessage: "Some approved work is still outstanding.",
    satisfiedMessage: "All approved work is done.",
  },
  {
    key: "customer_decisions_resolved",
    checkpoint: "FINISH",
    // Core, not owned by CUSTOMER_PORTAL: the portal is a channel, the
    // approval is the business step. A workshop with no portal still
    // needs the customer's answer, recorded at the counter.
    owner: null,
    blockedMessage: "The customer has not answered every request yet.",
    satisfiedMessage: "The customer has answered every request.",
  },
  {
    key: "critical_warning_acknowledged",
    checkpoint: "FINISH",
    owner: null,
    blockedMessage: "A critical item was rejected and needs the customer's acknowledgement.",
    satisfiedMessage: "The customer has acknowledged the critical item.",
  },
  {
    key: "no_open_blocker",
    checkpoint: "FINISH",
    owner: null,
    blockedMessage: "Resolve or escalate the open blocker before finishing.",
    satisfiedMessage: "No blocker is open.",
  },
  {
    key: "parts.received_used_or_returned",
    checkpoint: "FINISH",
    owner: "INVENTORY",
    blockedMessage: "A received part is neither marked used nor returned.",
    satisfiedMessage: "Every received part is used or returned.",
  },
  {
    key: "parts.no_pending_return",
    checkpoint: "FINISH",
    owner: "PART_RETURNS",
    blockedMessage: "A return is still waiting for the inventory manager to accept it.",
    satisfiedMessage: "No return is waiting on the inventory manager.",
  },
  {
    key: "parts.external_resolved",
    checkpoint: "FINISH",
    owner: "EXTERNAL_PARTS",
    blockedMessage: "A customer-supplied or externally-sourced part is still unresolved.",
    satisfiedMessage: "Externally-sourced parts are resolved.",
  },
  {
    key: "review.team_review_passed",
    checkpoint: "FINISH",
    owner: "TEAM_REVIEW",
    blockedMessage: "Waiting for the team leader's review.",
    satisfiedMessage: "The team leader has reviewed this job.",
  },
  {
    key: "qc.passed",
    checkpoint: "FINISH",
    owner: "QC",
    blockedMessage: "Waiting for quality control to pass.",
    satisfiedMessage: "Quality control has passed.",
  },
  {
    key: "invoice.issued",
    checkpoint: "DELIVERY",
    owner: "BILLING",
    blockedMessage: "The final invoice has not been issued.",
    satisfiedMessage: "The final invoice has been issued.",
  },
  {
    key: "payment.settled_or_policy_allows",
    checkpoint: "DELIVERY",
    owner: "FINANCE_CORE",
    blockedMessage: "Payment is outstanding and this workshop does not allow unpaid delivery.",
    satisfiedMessage: "Payment is settled, or policy allows delivery.",
  },
];

export const GATE_REGISTRY: ReadonlyMap<GateKey, GateDefinition> = new Map(
  DEFINITIONS.map((definition) => [definition.key, definition]),
);

export const GATE_DEFINITIONS = DEFINITIONS;

/** Gates a capability owns -- i.e. the ones that die when it is removed. */
export function gatesOwnedBy(capability: CapabilityKey): readonly GateKey[] {
  return DEFINITIONS.filter((definition) => definition.owner === capability).map((definition) => definition.key);
}

/** Gates no capability can remove. */
export function coreGates(): readonly GateKey[] {
  return DEFINITIONS.filter((definition) => definition.owner === null).map((definition) => definition.key);
}

export function gateDefinition(key: GateKey): GateDefinition | null {
  return GATE_REGISTRY.get(key) ?? null;
}
