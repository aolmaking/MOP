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
      consumers: [
        "GateEvaluatorService.check (payment.settled_or_policy_allows)",
        "PlatformService.writeFinanceConfiguration",
      ],
    },
    impact: {
      capabilities: ["FINANCE_CORE", "BILLING"],
      roles: ["BRANCH_MANAGER", "TENANT_OWNER"],
      workflowStates: ["READY_FOR_DELIVERY", "PAYMENT_PENDING"],
      permissions: ["workorders.branch.release_delivery"],
      pages: ["branch_manager.delivery-payments-status", "branch_manager.work-order-workspace"],
      changesVisibility: false,
      changesBilling: true,
      summary: "Whether an outstanding balance physically holds a vehicle in the yard.",
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
      status: "ENFORCED",
      where:
        "WORK_ORDER_GRAPH narrows the UNDER_INSPECTION -> APPROVED_FOR_WORK edge to BEYOND_INITIAL_SCOPE and " +
        "CRITICAL_ONLY; under ALL_WORK that edge is dark and every inspection must route through customer " +
        "approval. WorkOrderLifecycleService.routingContext supplies the answer the router reads. What is not " +
        "yet built is the scope-delta comparison itself -- TechnicianWorkService still lets staff choose which " +
        "items are decision-worthy rather than deriving that from what the customer actually agreed to at intake.",
      consumers: [
        "WORK_ORDER_GRAPH (UNDER_INSPECTION -> APPROVED_FOR_WORK)",
        "WorkOrderLifecycleService.routingContext",
      ],
    },
    impact: {
      capabilities: ["CUSTOMER_PORTAL", "FINANCE_CORE"],
      roles: ["TECHNICIAN", "BRANCH_MANAGER"],
      workflowStates: ["UNDER_INSPECTION", "AWAITING_CUSTOMER_APPROVAL", "APPROVED_FOR_WORK"],
      permissions: ["customer_decision.create", "customer_decision.send", "customer_decision.record_on_behalf"],
      pages: ["technician.work-card", "branch_manager.approvals-customer-decisions", "customer.decision"],
      changesVisibility: false,
      changesBilling: true,
      summary: "Whether an inspection can go straight to work, or has to stop at the customer first.",
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
      consumers: [],
    },
    impact: {
      capabilities: ["CUSTOMER_PORTAL"],
      roles: ["TECHNICIAN", "BRANCH_MANAGER"],
      workflowStates: [],
      permissions: [],
      pages: ["customer.decision", "branch_manager.approvals-customer-decisions"],
      changesVisibility: false,
      changesBilling: false,
      summary: "How heavy a decision request is -- one formal mechanism for everything, or a lighter path for routine items.",
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
    enforcement: {
      status: "ENFORCED",
      where: "FinanceService.recordPayment refuses a short amount under FULL_ONLY.",
      consumers: [
        "FinanceService.recordPayment",
      ],
    },
    impact: {
      capabilities: ["FINANCE_CORE"],
      roles: ["BRANCH_MANAGER", "TENANT_OWNER"],
      workflowStates: ["PAYMENT_PENDING"],
      permissions: ["finance.payment.record"],
      pages: ["branch_manager.delivery-payments-status"],
      changesVisibility: false,
      changesBilling: true,
      summary: "Whether a customer may pay part of the balance, or must settle it in one go.",
    },
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
      consumers: [],
    },
    impact: {
      capabilities: ["FINANCE_CORE"],
      roles: ["BRANCH_MANAGER", "TENANT_OWNER", "TECHNICIAN"],
      workflowStates: [],
      permissions: ["finance.running_invoice.add_line"],
      pages: ["branch_manager.work-order-workspace", "owner.pricing-financial-configuration"],
      changesVisibility: false,
      changesBilling: true,
      summary: "Who may reduce a price, and above what size a second person has to agree.",
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
    enforcement: {
      status: "ENFORCED",
      where: "PartRequestService.approve refuses self-approval or a non-manager approver.",
      consumers: [
        "PartRequestService.approve",
      ],
    },
    impact: {
      capabilities: ["INVENTORY"],
      roles: ["INVENTORY_MANAGER", "TECHNICIAN", "TENANT_OWNER"],
      workflowStates: [],
      permissions: ["inventory.request.approve"],
      pages: ["inventory_manager.technician-requests", "technician.work-card"],
      changesVisibility: false,
      changesBilling: false,
      summary: "Whether the person who asks for a part may also be the person who releases it.",
    },
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
      consumers: [
        "GateEvaluatorService.suppressedByPolicy",
      ],
    },
    impact: {
      capabilities: ["INVENTORY", "PART_RETURNS"],
      roles: ["TECHNICIAN", "INVENTORY_MANAGER"],
      workflowStates: ["IN_PROGRESS"],
      permissions: [],
      pages: ["technician.work-card", "inventory_manager.returns-movements"],
      changesVisibility: false,
      changesBilling: false,
      summary: "Whether an unaccounted part stops a job being finished, or is only flagged for reconciliation.",
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
      status: "ENFORCED",
      where:
        "WORK_ORDER_GRAPH narrows IN_PROGRESS -> READY_FOR_TEAM_REVIEW to REVIEW_REQUIRED; under DIRECT that " +
        "edge is dark and FINISH must reach a terminal without stopping at review. graph-safety.spec.ts proves " +
        "the reachability guarantee PHASE_21.md S3.1 requires holds across both options and every shipped profile.",
      consumers: [
        "WORK_ORDER_GRAPH (IN_PROGRESS -> READY_FOR_TEAM_REVIEW)",
        "WorkOrderLifecycleService.routingContext",
      ],
    },
    impact: {
      capabilities: ["TEAMS", "TEAM_REVIEW", "QC", "FINANCE_CORE"],
      roles: ["TECHNICIAN", "TEAM_LEADER"],
      workflowStates: ["IN_PROGRESS", "READY_FOR_TEAM_REVIEW", "READY_FOR_QC", "PAYMENT_PENDING"],
      permissions: [],
      pages: ["technician.work-card", "team_leader.home", "team_leader.vehicles-work-orders-view"],
      changesVisibility: false,
      changesBilling: false,
      summary: "Where a finished job goes next -- through the team leader, or straight onward.",
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
      consumers: [],
    },
    impact: {
      capabilities: ["TEAMS"],
      roles: ["TECHNICIAN", "TEAM_LEADER"],
      workflowStates: [],
      permissions: [],
      pages: ["technician.work-card", "team_leader.technician-performance-reports"],
      changesVisibility: false,
      changesBilling: false,
      summary: "Whether a technician may finish a task without saying how long it took.",
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
      consumers: [],
    },
    impact: {
      capabilities: ["BILLING"],
      roles: ["TENANT_OWNER"],
      workflowStates: [],
      permissions: ["finance.invoice.issue"],
      pages: ["owner.pricing-financial-configuration"],
      changesVisibility: false,
      changesBilling: true,
      summary: "What happens when this country has no billing adapter -- flag it, or refuse to issue.",
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
      consumers: [],
    },
    impact: {
      capabilities: [],
      roles: ["BRANCH_MANAGER", "TEAM_LEADER", "DATA_ANALYST"],
      workflowStates: [],
      permissions: [],
      pages: ["branch_manager.home", "owner.reports-analytics"],
      changesVisibility: false,
      changesBilling: false,
      summary: "Which days count when the product says a job has been waiting two days.",
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
      consumers: [],
    },
    impact: {
      capabilities: [],
      roles: ["BRANCH_MANAGER", "TENANT_OWNER"],
      workflowStates: ["CLOSED"],
      permissions: [],
      pages: ["branch_manager.work-order-workspace"],
      changesVisibility: false,
      changesBilling: false,
      summary: "Whether a closed job can still take a note two days later, or is sealed.",
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
      status: "ENFORCED",
      where:
        "CustomerDecisionService.recordOnBehalf reads the resolved value on every call: PORTAL_ONLY refuses the " +
        "request outright, ALLOWED_WITH_EVIDENCE requires a non-empty evidenceReference before the answer is " +
        "applied, and attribution to staff -- never the customer -- holds unconditionally under all three.",
      consumers: [
        "CustomerDecisionService.recordOnBehalf",
      ],
    },
    impact: {
      capabilities: ["CUSTOMER_PORTAL"],
      roles: ["BRANCH_MANAGER"],
      workflowStates: ["AWAITING_CUSTOMER_APPROVAL", "WAITING_CUSTOMER"],
      permissions: ["customer_decision.record_on_behalf"],
      pages: ["branch_manager.approvals-customer-decisions", "customer.decision"],
      changesVisibility: false,
      changesBilling: false,
      summary: "Whether staff may record an answer the customer gave on the phone, or only the customer may answer.",
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
      consumers: [],
    },
    impact: {
      capabilities: ["QC"],
      roles: ["TECHNICIAN"],
      workflowStates: ["READY_FOR_QC", "QC_FAILED"],
      permissions: [],
      pages: ["technician.work-card", "branch_manager.work-orders-board"],
      changesVisibility: false,
      changesBilling: false,
      summary: "Whether every finished job waits for a quality check, or only some of them.",
    },
  },

  // -------------------------------------------------------------------
  // Not in docs/POLICY_DECISION_INVENTORY.md -- that document's P-numbers
  // run to P-84 with none of them this question, so this is a genuinely
  // new entry rather than a numbered one this file is catching up on.
  //
  // May a customer decline inspection and go straight to a named
  // service? The edge WORK_ORDER_GRAPH already ships (REGISTERED ->
  // AWAITING_CUSTOMER_APPROVAL, "inspection declined, service requested")
  // was unconditional -- every workshop allowed the skip, whether or not
  // it wanted to. Registering the question makes that an answer rather
  // than an accident of what the graph happened to contain.
  // -------------------------------------------------------------------
  {
    key: "INSPECTION_REQUIRED",
    question: "May a customer decline inspection and request one named service directly?",
    options: [
      {
        key: "CUSTOMER_MAY_DECLINE",
        label: "Customer may decline",
        meaning: "A customer who names what they want skips straight to approval; the finish gate never demands the inspection they refused.",
      },
      {
        key: "ALWAYS_INSPECT",
        label: "Every job is inspected",
        meaning: "There is no walk-in-and-name-it route. Every job passes through UNDER_INSPECTION before approval.",
      },
    ],
    default: "CUSTOMER_MAY_DECLINE",
    defaultReason:
      "It is what already ships, and SCENARIOS.md's intake-refusals case is a real, recurring situation: a " +
      "customer who wants one named service and nothing else should not be made to sit through a diagnostic " +
      "they did not ask for. ALWAYS_INSPECT is a legitimate choice for a workshop whose liability policy " +
      "requires it, not a safer default for every workshop.",
    relevantWhen: () => true,
    mutability: "GOVERNED",
    buildPosture: "POLICY_CONTROLLED",
    dependsOnCapabilities: [],
    dependsOnPolicies: [],
    enforcement: {
      status: "ENFORCED",
      where:
        "WORK_ORDER_GRAPH narrows REGISTERED -> AWAITING_CUSTOMER_APPROVAL to CUSTOMER_MAY_DECLINE; under " +
        "ALWAYS_INSPECT that edge is dark and every job must pass START_INSPECTION -> UNDER_INSPECTION first. " +
        "graph-safety.spec.ts proves both options reach a terminal under every shipped profile.",
      consumers: [
        "WORK_ORDER_GRAPH (REGISTERED -> AWAITING_CUSTOMER_APPROVAL)",
        "WorkOrderLifecycleService.routingContext",
      ],
    },
    impact: {
      capabilities: [],
      roles: ["TECHNICIAN", "BRANCH_MANAGER"],
      workflowStates: ["REGISTERED", "UNDER_INSPECTION", "AWAITING_CUSTOMER_APPROVAL"],
      permissions: ["customer.intake.create", "inspection.quick.create", "inspection.full.create"],
      pages: ["technician.work-card", "branch_manager.work-orders-board"],
      changesVisibility: false,
      changesBilling: false,
      summary: "Whether a customer who names one service can skip the inspection step entirely.",
    },
  },

  // -------------------------------------------------------------------
  // P-26 -- Are prices shown to the customer before approval?
  //
  // Already catalogued in docs/POLICY_DECISION_INVENTORY.md, and its own
  // "Why" already named the exact gap this closes: "FinanceConfiguration.
  // customerInvoiceVisible exists and decision.service.ts already honours
  // it... The decision was made in code; it was never written down or
  // surfaced." This is that surfacing. Registered here as GOVERNED per
  // that entry's own header, though its "Later: freely" free-text field
  // disagrees with itself -- GOVERNED is kept, since a decision that
  // silently changes what a customer already saw is exactly the kind of
  // in-flight consequence the impact-preview pipeline exists to catch.
  //
  // The inventory's third option, `TOTAL_ONLY` (one figure, no
  // breakdown), is deliberately absent: it needs a new projection
  // CustomerDecisionService does not have, the same "an option whose
  // answer cannot be honoured is worse than an option not offered"
  // discipline P-01/P-05 already use elsewhere in this file.
  // -------------------------------------------------------------------
  {
    key: "CUSTOMER_INVOICE_VISIBILITY",
    question: "Are prices shown to the customer before they approve a repair?",
    options: [
      {
        key: "SHOWN",
        label: "Shown",
        meaning: "Each decision item shows its price, so the customer can weigh cost against the finding.",
      },
      {
        key: "HIDDEN",
        label: "Hidden",
        meaning: "The item still appears, without numbers; pricing is discussed by phone or at the counter instead.",
      },
    ],
    default: "SHOWN",
    defaultReason:
      "Asking someone to approve work without telling them the price is not informed consent, which is the " +
      "entire purpose of the decision step. HIDDEN is a real choice only for a workshop that has a reason to " +
      "negotiate off-portal -- not the safer default for everyone.",
    relevantWhen: () => true,
    mutability: "GOVERNED",
    buildPosture: "POLICY_CONTROLLED",
    dependsOnCapabilities: ["FINANCE_CORE"],
    dependsOnPolicies: [],
    enforcement: {
      status: "ENFORCED",
      where:
        "CustomerDecisionService.pricingVisible reads FinanceConfiguration.customerInvoiceVisible on every " +
        "decision-request read, and PlatformService.writeFinanceConfiguration now sets that column from this " +
        "policy's answer at creation instead of leaving it on the Prisma column default for every tenant.",
      consumers: [
        "CustomerDecisionService.pricingVisible",
        "PlatformService.writeFinanceConfiguration",
      ],
    },
    impact: {
      capabilities: ["FINANCE_CORE", "CUSTOMER_PORTAL"],
      roles: ["TECHNICIAN", "BRANCH_MANAGER"],
      workflowStates: ["AWAITING_CUSTOMER_APPROVAL", "WAITING_CUSTOMER"],
      permissions: ["customer.invoice.view_own"],
      pages: ["customer.decision", "branch_manager.approvals-customer-decisions"],
      changesVisibility: true,
      changesBilling: false,
      summary: "Whether a customer sees a price next to a finding, or only the finding itself.",
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
