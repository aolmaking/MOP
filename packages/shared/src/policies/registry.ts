import type { PolicyDefinition } from "./types";

/**
 * The policy registry. Lives in code, not the database, for the same
 * reason the capability registry does: it encodes behaviour, and
 * behaviour must be type-checked and tested.
 *
 * Seeded from docs/POLICY_DECISION_INVENTORY.md -- only entries the
 * Phase 21 review resolved to DECIDED or EVIDENCE-BACKED with no
 * blocking OPEN dependency are registered here. Entries still marked
 * OPEN in that document (e.g. anything needing the owner/Super-Admin
 * authority decision, PHASE_21.md S8.C) are deliberately absent: adding
 * them here, even inertly, would let an implementation detail (which
 * options exist, what the default is) get ahead of a product decision
 * that has not been made. Add an entry only once its inventory row
 * carries a status other than OPEN.
 */

const DEFINITIONS: readonly PolicyDefinition[] = [
  // -------------------------------------------------------------------
  // P-10 -- Is time tracking off, optional, or required?
  // -------------------------------------------------------------------
  {
    key: "TIME_TRACKING",
    question: "Is time tracking off, optional, or required?",
    options: [
      { key: "OFF", label: "Off", meaning: "No time capture; the controls are absent from the Work Card." },
      {
        key: "OPTIONAL",
        label: "Optional",
        meaning: "Available to a technician, never blocking a task's completion.",
      },
      {
        key: "REQUIRED",
        label: "Required",
        meaning: "A task cannot be marked complete without recorded time.",
      },
    ],
    default: "OPTIONAL",
    defaultReason:
      "Required time tracking with gloved hands on a tablet is exactly the friction that loses to a paper " +
      "notebook (VISION.md SS2); OFF entirely removes the data People & Performance reporting depends on. " +
      "OPTIONAL is the only option that costs nothing when unused and gains something when used.",
    relevantWhen: () => true,
    mutability: "FREELY",
    buildPosture: "POLICY_CONTROLLED",
    dependsOnCapabilities: [],
    dependsOnPolicies: [],
  },

  // -------------------------------------------------------------------
  // P-71 -- Is QC mandatory for every job, or only above a threshold?
  // -------------------------------------------------------------------
  {
    key: "QC_MANDATORY",
    question: "Is QC required for every finished job, or only above a value/risk threshold?",
    options: [
      {
        key: "MANDATORY_ALWAYS",
        label: "Always",
        meaning: "Every finished job routes through QC. The workflow graph's own current, only behaviour.",
      },
      {
        key: "ABOVE_VALUE_THRESHOLD",
        label: "Above a value threshold",
        meaning: "Only jobs over a declared value require QC.",
      },
      {
        key: "RISK_FLAGGED_ONLY",
        label: "Risk-flagged only",
        meaning: "Only jobs flagged risky by their specialization severity require QC.",
      },
    ],
    default: "MANDATORY_ALWAYS",
    defaultReason:
      "The only option requiring no new data, and it matches every workshop that has the QC capability " +
      "enabled today -- the workflow graph currently has no conditional path, so loosening this is real " +
      "future work (a threshold value, or reading specialization severity), not an assumption to make now.",
    relevantWhen: () => true,
    mutability: "GOVERNED",
    buildPosture: "POLICY_CONTROLLED",
    dependsOnCapabilities: ["QC"],
    dependsOnPolicies: [],
  },

  // -------------------------------------------------------------------
  // P-18 -- May staff record an approval the customer gave verbally?
  // -------------------------------------------------------------------
  {
    key: "PORTAL_COUNTER_APPROVAL",
    question: "May staff record a customer decision the customer gave verbally, rather than through the portal?",
    options: [
      {
        key: "ALLOWED_ATTRIBUTED",
        label: "Allowed, attributed to staff",
        meaning:
          "Staff may record the decision. The recording staff member is the actor of record -- never the " +
          "customer -- so the audit trail never implies the customer clicked when they did not.",
      },
      {
        key: "ALLOWED_WITH_EVIDENCE",
        label: "Allowed, evidence required",
        meaning: "As above, and the recording staff member must attach a reference (a call note, a signature).",
      },
      {
        key: "PORTAL_ONLY",
        label: "Portal only",
        meaning: "Only the customer, through their own portal session or public link, may answer.",
      },
    ],
    default: "ALLOWED_ATTRIBUTED",
    defaultReason:
      "CAPABILITY_MODEL.md Rule 3 promises that removing the customer portal moves approval to the counter, " +
      "never deletes consent -- most real approvals happen on a phone call, and PORTAL_ONLY would make that " +
      "promise false for every workshop with the portal disabled. Attribution to staff, never the customer, " +
      "is the one part of this that is not a choice; see CustomerDecisionService.recordOnBehalf's own doc.",
    // CORE per PHASE_21.md S13.A: the capability model's own worked example
    // (Rule 3) requires SOME answer to this question to exist, even though
    // which option a given workshop runs under is configurable.
    relevantWhen: () => true,
    mutability: "GOVERNED",
    buildPosture: "CORE",
    dependsOnCapabilities: [],
    dependsOnPolicies: [],
  },
];

export const POLICY_REGISTRY: ReadonlyMap<string, PolicyDefinition> = new Map(
  DEFINITIONS.map((definition) => [definition.key, definition]),
);

export function policyDefinition(key: string): PolicyDefinition | undefined {
  return POLICY_REGISTRY.get(key);
}
