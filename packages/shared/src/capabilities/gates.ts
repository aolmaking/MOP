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

export type GateCheckpoint = "FINISH" | "DELIVERY";

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
}

const DEFINITIONS: readonly GateDefinition[] = [
  {
    key: "inspection_completed",
    checkpoint: "FINISH",
    owner: null,
    blockedMessage: "Complete the inspection before finishing.",
  },
  {
    key: "approved_work_completed",
    checkpoint: "FINISH",
    owner: null,
    blockedMessage: "Some approved work is still outstanding.",
  },
  {
    key: "customer_decisions_resolved",
    checkpoint: "FINISH",
    // Core, not owned by CUSTOMER_PORTAL: the portal is a channel, the
    // approval is the business step. A workshop with no portal still
    // needs the customer's answer, recorded at the counter.
    owner: null,
    blockedMessage: "The customer has not answered every request yet.",
  },
  {
    key: "critical_warning_acknowledged",
    checkpoint: "FINISH",
    owner: null,
    blockedMessage: "A critical item was rejected and needs the customer's acknowledgement.",
  },
  {
    key: "no_open_blocker",
    checkpoint: "FINISH",
    owner: null,
    blockedMessage: "Resolve or escalate the open blocker before finishing.",
  },
  {
    key: "parts.received_used_or_returned",
    checkpoint: "FINISH",
    owner: "INVENTORY",
    blockedMessage: "A received part is neither marked used nor returned.",
  },
  {
    key: "parts.no_pending_return",
    checkpoint: "FINISH",
    owner: "PART_RETURNS",
    blockedMessage: "A return is still waiting for the inventory manager to accept it.",
  },
  {
    key: "parts.external_resolved",
    checkpoint: "FINISH",
    owner: "EXTERNAL_PARTS",
    blockedMessage: "A customer-supplied or externally-sourced part is still unresolved.",
  },
  {
    key: "review.team_review_passed",
    checkpoint: "FINISH",
    owner: "TEAM_REVIEW",
    blockedMessage: "Waiting for the team leader's review.",
  },
  { key: "qc.passed", checkpoint: "FINISH", owner: "QC", blockedMessage: "Waiting for quality control to pass." },
  {
    key: "invoice.issued",
    checkpoint: "DELIVERY",
    owner: "BILLING",
    blockedMessage: "The final invoice has not been issued.",
  },
  {
    key: "payment.settled_or_policy_allows",
    checkpoint: "DELIVERY",
    owner: "FINANCE_CORE",
    blockedMessage: "Payment is outstanding and this workshop does not allow unpaid delivery.",
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
