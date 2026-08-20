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
 *
 * ---------------------------------------------------------------------
 * WHAT IS AND IS NOT HERE, AND WHY
 * ---------------------------------------------------------------------
 *
 * The eleven entries added alongside the original three are exactly the
 * inventory's Tranche 1 (S2) entries classified POLICY with no blocking
 * dependency. The ones deliberately left out, so the omission reads as
 * a decision rather than an oversight:
 *
 *   P-04, P-25, P-29, P-38  INVARIANT. One defensible answer; the
 *                           inventory records them so nobody "adds an
 *                           option" later.
 *   P-11  ownership-transfer timing. Its `REVIEW_REQUIRED` option is
 *         flagged in the inventory as arguably a capability (it adds a
 *         pending-transfer lifecycle with terminal states). Registering
 *         it would mean shipping a two-option version of a
 *         three-option decision, which is a product call, not a
 *         registration detail.
 *   P-12  warranty basis. IMMUTABLE_AFTER_FIRST_USE, and the inventory
 *         records E11 as blocking the warranty field shipping at all.
 *   P-13  walk-ins. Explicitly BLOCKED on S-01b -- there is no
 *         scheduling capability to be given.
 *
 * An option an inventory entry lists but that needs data this codebase
 * does not have is also left out, per option, with the reason on the
 * entry. Offering `ABOVE_THRESHOLD` with nowhere to store the threshold
 * would be a question whose answer cannot be honoured.
 *
 * Every entry carries an `enforcement` declaration. ENFORCED means a
 * named service reads the value today; RECORDED means the row is
 * written, audited and time-ranged, and the behaviour lands with the
 * named work. The onboarding experience shows this verbatim, because a
 * configuration screen that implies a stored string is changing
 * behaviour when nothing reads it is the same defect class as a gate
 * hardcoded to `true`.
 */

const DEFINITIONS: readonly PolicyDefinition[] = [
  // -------------------------------------------------------------------
  // P-01 -- Is delivery blocked until the invoice is paid?
  //
  // The flagship case for this whole layer: the same gate drew opposite
  // complaints from two real scenario workshops.
  // -------------------------------------------------------------------
  {
    key: "DELIVERY_BLOCKED_UNTIL_PAID",
    question: "Is delivery blocked until the invoice is paid?",
    options: [
      {
        key: "ALWAYS",
        label: "Always — no vehicle leaves unpaid",
        meaning: "The delivery gate blocks on any outstanding balance.",
      },
      {
        key: "NEVER",
        label: "Never — chase the balance separately",
        meaning: "Delivery ignores the balance; an unpaid job becomes a receivable to collect.",
      },
      {
        key: "REQUIRES_OVERRIDE",
        label: "Blocked, releasable with a reason",
        meaning: "Delivery blocks by default, and a named role may release the vehicle with an audited reason.",
      },
    ],
    default: "NEVER",
    defaultReason:
      "Blocking delivery is the more destructive failure. A workshop that wanted the block and did not get " +
      "it has a receivable to chase; a workshop that did not want the block and got it cannot hand a customer " +
      "their car, which is a same-day operational emergency. Defaults should fail toward the recoverable side.",
    // The inventory's `UNLESS_ACCOUNT_TERMS` option is absent: it reads a
    // customer's agreed terms, and the B2B account entity it needs
    // (P-42) does not exist. An option whose answer cannot be honoured
    // is worse than an option not offered.
    relevantWhen: () => true,
    mutability: "GOVERNED",
    buildPosture: "POLICY_CONTROLLED",
    // Not a bare "FINANCE_CORE": a workshop in External Finance Mode
    // still hands cars back, and MOP still decides whether a balance
    // holds one. See PolicyCapabilityCondition's own doc comment -- this
    // is the case that forced that shape.
    dependsOnCapabilities: [{ key: "FINANCE_CORE", relevantUnder: ["ENABLED", "READ_ONLY", "LOCKED", "EXTERNAL"] }],
    dependsOnPolicies: [],
    enforcement: {
      status: "ENFORCED",
      where:
        "GateEvaluatorService's payment.settled_or_policy_allows check, via FinanceConfiguration.allowUnpaidDelivery. " +
        "REQUIRES_OVERRIDE blocks like ALWAYS today; the audited release action is Governance Controls' work.",
    },
  },

  // -------------------------------------------------------------------
  // P-02 -- Which work requires customer approval before it proceeds?
  // -------------------------------------------------------------------
  {
    key: "APPROVAL_REQUIRED_SCOPE",
    question: "Which work needs the customer's approval before it proceeds?",
    options: [
      { key: "ALL_WORK", label: "All work", meaning: "Nothing proceeds without an explicit decision from the customer." },
      {
        key: "BEYOND_INITIAL_SCOPE",
        label: "Anything beyond what was agreed at intake",
        meaning: "Work agreed at intake proceeds; anything discovered later needs approval.",
      },
      {
        key: "CRITICAL_ONLY",
        label: "Safety-critical findings only",
        meaning: "Only findings marked safety-critical require the customer to decide.",
      },
    ],
    default: "BEYOND_INITIAL_SCOPE",
    defaultReason:
      "It matches what a customer actually consented to. They agreed to a job, not to an open-ended bill, and " +
      "the thing that surprises them is work they never discussed. ALL_WORK makes a five-minute quick service " +
      "a round trip; CRITICAL_ONLY lets an expensive non-critical upsell proceed unasked.",
    // Customer approval is CORE -- the channel is optional, the step is
    // not -- so this is relevant with or without the portal.
    relevantWhen: () => true,
    mutability: "GOVERNED",
    buildPosture: "POLICY_CONTROLLED",
    dependsOnCapabilities: [],
    dependsOnPolicies: [],
    enforcement: {
      status: "RECORDED",
      where:
        "Read once TechnicianWorkService derives decision items from a scope delta rather than from staff choice. " +
        "The scope-delta comparison does not exist yet.",
    },
  },

  // -------------------------------------------------------------------
  // P-03 -- Does every approval carry the same weight?
  // -------------------------------------------------------------------
  {
    key: "APPROVAL_WEIGHT",
    question: "Does every customer decision carry the same weight?",
    options: [
      {
        key: "SINGLE_WEIGHT",
        label: "One formal mechanism for everything",
        meaning: "Every decision item uses the full formal request, whatever it is about.",
      },
      {
        key: "TWO_TIER",
        label: "Formal for critical, lightweight for routine",
        meaning: "Safety-critical and high-value items use the formal request; low-value routine items use a lighter confirm.",
      },
      {
        key: "PER_ITEM_CHOICE",
        label: "Staff choose per item",
        meaning: "The person raising the item picks how heavy the request is.",
      },
    ],
    default: "TWO_TIER",
    defaultReason:
      "A single weight guarantees one of two failures: heavy enough for a safety warning means friction on a " +
      "wiper blade, light enough for a wiper blade means a safety rejection is not properly evidenced. Two " +
      "tiers is the only option correct at both ends; PER_ITEM_CHOICE moves a safety judgement onto a busy technician.",
    relevantWhen: () => true,
    mutability: "GOVERNED",
    buildPosture: "POLICY_CONTROLLED",
    dependsOnCapabilities: [],
    dependsOnPolicies: [],
    enforcement: {
      status: "RECORDED",
      where:
        "Read once CustomerDecisionItem carries a weight/tier field and the decision page renders two forms. " +
        "The critical-rejection acknowledgement gate is an invariant and holds under every option regardless.",
    },
  },

  // -------------------------------------------------------------------
  // P-05 -- Is partial payment accepted?
  // -------------------------------------------------------------------
  {
    key: "PARTIAL_PAYMENT",
    question: "May a customer pay part of the balance?",
    options: [
      { key: "ALLOWED", label: "Allowed", meaning: "Any amount up to the outstanding balance may be recorded." },
      {
        key: "FULL_ONLY",
        label: "Full settlement only",
        meaning: "A payment must clear the whole balance; a short amount is refused.",
      },
    ],
    default: "ALLOWED",
    defaultReason:
      "It is what already ships, it is the least restrictive, and refusing a customer's partial payment is a " +
      "behaviour a workshop must opt into rather than discover at the counter.",
    // `DEPOSIT_THEN_FULL` is absent: it needs a deposit marker on
    // Payment that does not exist.
    relevantWhen: () => true,
    mutability: "GOVERNED",
    buildPosture: "POLICY_CONTROLLED",
    dependsOnCapabilities: ["FINANCE_CORE"],
    dependsOnPolicies: [],
    enforcement: { status: "ENFORCED", where: "FinanceService.recordPayment refuses a short amount under FULL_ONLY." },
  },

  // -------------------------------------------------------------------
  // P-06 -- Who may approve a discount, and above what value?
  // -------------------------------------------------------------------
  {
    key: "DISCOUNT_AUTHORITY",
    question: "Who may approve a discount, and above what value?",
    options: [
      { key: "NONE", label: "No discounts", meaning: "The discount action is not offered at all." },
      {
        key: "ANY_STAFF_UNLIMITED",
        label: "Anyone who can price",
        meaning: "Whoever holds the pricing permission may discount without limit.",
      },
      {
        key: "THRESHOLD_THEN_APPROVAL",
        label: "Free below a threshold, approved above it",
        meaning: "Discounts under the configured value or percent are applied directly; larger ones need a named approver.",
      },
      {
        key: "ALWAYS_APPROVAL",
        label: "Every discount needs a second person",
        meaning: "No discount is applied without an approver, whatever its size.",
      },
    ],
    default: "THRESHOLD_THEN_APPROVAL",
    defaultReason:
      "Unlimited discretionary discounting is the single most common internal-fraud vector in a service " +
      "business, and requiring approval for every 5% goodwill gesture makes staff work around the system -- " +
      "the exact failure VISION.md SS2 warns about. The threshold is the only setting correct at both ends.",
    relevantWhen: () => true,
    mutability: "GOVERNED",
    buildPosture: "POLICY_CONTROLLED",
    dependsOnCapabilities: ["FINANCE_CORE"],
    dependsOnPolicies: [],
    enforcement: {
      status: "RECORDED",
      where:
        "FinanceConfiguration already carries discountApprovalThreshold and maxDiscountPercent; the approval " +
        "step itself (a DiscountRequest raised above the threshold) is Phase 8's owed discount path.",
    },
  },

  // -------------------------------------------------------------------
  // P-07 -- Must a part be approved by someone other than its requester?
  //
  // This is the policy Phase 19.A was missing. Enforcement built as a
  // global rule broke 22 tests modelling a legitimate single-storekeeper
  // shop and was reverted; PHASE_19.md's own conclusion was that the
  // fix needs a per-workshop opt-in policy, which is this.
  // -------------------------------------------------------------------
  {
    key: "PARTS_SEPARATION_OF_DUTIES",
    question: "Must a part request be approved by someone other than the person who raised it?",
    options: [
      {
        key: "NOT_ENFORCED",
        label: "Not enforced",
        meaning: "Who requested and who approved are both recorded; nobody is refused.",
      },
      {
        key: "DIFFERENT_PERSON",
        label: "A different person must approve",
        meaning: "A staff member may not approve their own part request.",
      },
      {
        key: "ROLE_SEPARATED",
        label: "Only an inventory manager may approve",
        meaning: "Approval is restricted to staff holding the inventory manager role.",
      },
    ],
    default: "NOT_ENFORCED",
    defaultReason:
      "The smallest workshops are a large share of the customer base and physically cannot satisfy it -- a " +
      "one-storekeeper shop under DIFFERENT_PERSON cannot issue any part at all, which is exactly the failure " +
      "Phase 19.A produced and had to revert. Enforcement must be opted into by a workshop with the headcount for it.",
    // `DIFFERENT_PERSON_ABOVE_VALUE` is absent: it needs a per-workshop
    // value threshold that has nowhere to live.
    relevantWhen: () => true,
    mutability: "GOVERNED",
    buildPosture: "POLICY_CONTROLLED",
    dependsOnCapabilities: ["INVENTORY"],
    dependsOnPolicies: [],
    enforcement: { status: "ENFORCED", where: "PartRequestService.approve refuses self-approval or a non-manager approver." },
  },

  // -------------------------------------------------------------------
  // P-08 -- Must unused parts be returned before a job can finish?
  // -------------------------------------------------------------------
  {
    key: "RETURN_UNUSED_BEFORE_FINISH",
    question: "Must every issued part be accounted for before a job can be finished?",
    options: [
      {
        key: "REQUIRED",
        label: "Required",
        meaning: "A job cannot be finished while a received part is neither marked used nor returned.",
      },
      {
        key: "WARN_ONLY",
        label: "Warn, do not block",
        meaning: "The finish checklist shows the unaccounted part; the technician may finish anyway.",
      },
      { key: "NOT_REQUIRED", label: "No check", meaning: "The finish gate does not look at parts at all." },
    ],
    default: "REQUIRED",
    defaultReason:
      "It is the point where the physical and digital worlds are forced to agree -- VISION.md SS4.3's whole " +
      "argument about stock drift. Relaxing it is a deliberate trade of stock accuracy for bay throughput, " +
      "which a workshop should make on purpose rather than inherit.",
    relevantWhen: () => true,
    mutability: "GOVERNED",
    buildPosture: "POLICY_CONTROLLED",
    dependsOnCapabilities: ["INVENTORY"],
    dependsOnPolicies: [],
    enforcement: {
      status: "ENFORCED",
      where: "GateEvaluatorService drops or downgrades parts.received_used_or_returned to advisory.",
    },
  },

  // -------------------------------------------------------------------
  // P-09 -- May a technician send work onward directly?
  // -------------------------------------------------------------------
  {
    key: "TECHNICIAN_DIRECT_SEND",
    question: "May a technician send finished work onward directly, or must it pass review?",
    options: [
      {
        key: "DIRECT",
        label: "Directly",
        meaning: "The technician finishes; review is available as a route but never compulsory.",
      },
      { key: "REVIEW_REQUIRED", label: "Review required", meaning: "Every finished job routes through the team leader's review." },
    ],
    default: "DIRECT",
    defaultReason:
      "Compulsory review on every job is a throughput cost most workshops do not want, and enabling the " +
      "TEAM_REVIEW capability already signals that the workshop wants review available -- not that it wants " +
      "it mandatory. Those are two different decisions and the capability only makes the first one.",
    // `REVIEW_ABOVE_VALUE` and `REVIEW_FOR_JUNIOR` are absent: both need
    // conditional routing the workflow router does not do, and the
    // second needs credential-level comparison beyond what
    // StaffCredential records.
    relevantWhen: () => true,
    mutability: "GOVERNED",
    buildPosture: "POLICY_CONTROLLED",
    // TEAM_REVIEW, not TEAMS: without the review state there is nowhere
    // to route, so the question has no answer rather than a defaulted one.
    dependsOnCapabilities: ["TEAM_REVIEW"],
    dependsOnPolicies: [],
    enforcement: {
      status: "RECORDED",
      where:
        "Read once WorkflowRouter picks the FINISH edge by policy rather than by declaration order. The " +
        "reachability test PHASE_21.md flags for REVIEW_REQUIRED must be written before that lands.",
    },
  },

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
    enforcement: {
      status: "RECORDED",
      where: "Read once the Work Card's finish path checks recorded time. The shift record it would read already exists.",
    },
  },

  // -------------------------------------------------------------------
  // P-14 -- No billing adapter for this tenant's country
  // -------------------------------------------------------------------
  {
    key: "UNCOVERED_COUNTRY_BILLING",
    question: "What happens when this country has no billing adapter yet?",
    options: [
      { key: "WARN_ONLY", label: "Flag it, allow issuance", meaning: "Invoices issue; the workshop is flagged as non-compliant." },
      { key: "BLOCK", label: "Refuse issuance", meaning: "No invoice may be issued until an adapter for this country exists." },
      {
        key: "BLOCK_WITH_OVERRIDE",
        label: "Refuse, platform may grant an exception",
        meaning: "Issuance is refused unless the platform records an audited exception for this workshop.",
      },
    ],
    default: "WARN_ONLY",
    defaultReason:
      "BLOCK shipped without warning would end a paying tenant's ability to trade -- the largest blast radius " +
      "available in the product. BLOCK_WITH_OVERRIDE is the right destination once country adapters exist; " +
      "WARN_ONLY is the right default while ADAPTER_COVERED_COUNTRIES is still empty.",
    // Only a workshop issuing its own legal invoices can be caught by
    // this. Under EXTERNAL billing the invoice comes from software MOP
    // does not control, so the question is not MOP's to ask.
    relevantWhen: () => true,
    mutability: "GOVERNED",
    buildPosture: "POLICY_CONTROLLED",
    dependsOnCapabilities: ["BILLING"],
    dependsOnPolicies: [],
    enforcement: {
      status: "RECORDED",
      where:
        "compliantBlocked is computed and stored on every issueDocument call today, visibility-only per " +
        "PHASE_9.md SS6. BLOCK and BLOCK_WITH_OVERRIDE need the refusal path and the override record.",
    },
  },

  // -------------------------------------------------------------------
  // P-15 -- Which days are the working week?
  // -------------------------------------------------------------------
  {
    key: "WORKING_WEEK",
    question: "Which days are this workshop's working week?",
    options: [
      {
        key: "FROM_COUNTRY",
        label: "Derived from the country",
        meaning: "Ageing and SLA arithmetic uses the standard working week for the country entered above.",
      },
      {
        key: "EXPLICIT_DAYS",
        label: "The workshop names its own days",
        meaning: "The owner declares which days count; ageing skips the rest.",
      },
      { key: "SEVEN_DAY", label: "No weekend", meaning: "Ageing is pure elapsed time — every day counts equally." },
    ],
    default: "FROM_COUNTRY",
    defaultReason:
      "Country is already collected at creation, and this is right without being asked in the overwhelming " +
      "majority of cases. It is also the only option that fixes the bug it was raised for: MOP's ageing " +
      "arithmetic assumes Monday-to-Friday, which is silently wrong for every Gulf tenant.",
    relevantWhen: () => true,
    mutability: "FREELY",
    buildPosture: "POLICY_CONTROLLED",
    dependsOnCapabilities: [],
    dependsOnPolicies: [],
    enforcement: {
      status: "RECORDED",
      where:
        "Read once attention-ranking and the SLA overrun calculation take a working-week argument instead of " +
        "counting elapsed hours. Both are pure functions today, which is what makes that change small.",
    },
  },

  // -------------------------------------------------------------------
  // P-16 -- May anything be added to a work order after it closes?
  // -------------------------------------------------------------------
  {
    key: "POST_CLOSE_ADDENDA",
    question: "May anything be added to a work order after it closes?",
    options: [
      { key: "NOTHING", label: "Closed is closed", meaning: "A closed work order takes no further entries of any kind." },
      {
        key: "APPEND_ONLY_NOTES",
        label: "Notes and attachments may be appended",
        meaning: "A note or photo can be added afterwards; nothing already recorded changes.",
      },
    ],
    default: "APPEND_ONLY_NOTES",
    defaultReason:
      "It preserves the immutability money and audit depend on while giving a real-world event -- the customer " +
      "who phones two days later -- somewhere to land. Today it has nowhere, so the information is either " +
      "lost or written into the wrong record.",
    // `REOPEN_ALLOWED` is absent on purpose, and the inventory says why:
    // it makes a terminal state non-terminal, which fails PHASE_21.md
    // SS3.1's test outright. It is a capability, not a policy option.
    // `LINKED_FOLLOW_UP` needs the work-order-to-work-order linkage
    // (P-40) that does not exist.
    relevantWhen: () => true,
    mutability: "GOVERNED",
    buildPosture: "POLICY_CONTROLLED",
    dependsOnCapabilities: [],
    dependsOnPolicies: [],
    enforcement: {
      status: "RECORDED",
      where: "Read once an addendum record exists on the work order. Attachment (16.H) is already the store it would use.",
    },
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
    enforcement: {
      status: "RECORDED",
      where:
        "CustomerDecisionService.recordOnBehalf already attributes to staff unconditionally, which is the " +
        "invariant half. Refusing the call under PORTAL_ONLY is the half that reads this value.",
    },
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
    enforcement: {
      status: "RECORDED",
      where:
        "MANDATORY_ALWAYS is the graph's only behaviour today, so choosing it is honoured. The other two need " +
        "the conditional QC route their own defaultReason names as real future work.",
    },
  },
];

export const POLICY_REGISTRY: ReadonlyMap<string, PolicyDefinition> = new Map(
  DEFINITIONS.map((definition) => [definition.key, definition]),
);

export function policyDefinition(key: string): PolicyDefinition | undefined {
  return POLICY_REGISTRY.get(key);
}

export { DEFINITIONS as POLICY_DEFINITIONS };
