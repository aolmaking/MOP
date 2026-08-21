import type { WorkflowGraph } from "./types";

/**
 * The lifecycle graphs, capability-annotated. These are the single source
 * of truth for "what transitions exist" -- the WorkflowRouter (Phase 3)
 * will read these rather than hardcoding transitions in service code,
 * which is the whole point of building this before the lifecycle exists.
 *
 * A transition carrying `requires` disappears from a tenant's effective
 * graph when that capability is not active. Removal policies then add
 * replacement edges (see registry.ts).
 *
 * States match the Prisma enums exactly, so a graph state can never drift
 * from a storable status.
 */

export const WORK_ORDER_GRAPH: WorkflowGraph = {
  entity: "WorkOrder",
  initial: "DRAFT",
  terminal: ["CLOSED", "CANCELLED"],
  states: [
    "DRAFT",
    "REGISTERED",
    "UNDER_INSPECTION",
    "AWAITING_CUSTOMER_APPROVAL",
    "APPROVED_FOR_WORK",
    "IN_PROGRESS",
    "WAITING_PARTS",
    "WAITING_CUSTOMER",
    "BLOCKED",
    "READY_FOR_TEAM_REVIEW",
    "READY_FOR_QC",
    "QC_FAILED",
    "READY_FOR_DELIVERY",
    "PAYMENT_PENDING",
    "CLOSED",
    "CANCELLED",
  ],
  transitions: [
    { from: "DRAFT", to: "REGISTERED", intent: "REGISTER", label: "intake completed" },
    { from: "REGISTERED", to: "UNDER_INSPECTION", intent: "START_INSPECTION", label: "technician starts inspection" },
    // A customer who declines inspection and asks for one named service
    // goes straight to approval -- see SCENARIOS.md "intake refusals".
    // ALWAYS_INSPECT removes the skip; START_INSPECTION above is
    // unconditional, so no option of this policy can strand REGISTERED.
    {
      from: "REGISTERED",
      to: "AWAITING_CUSTOMER_APPROVAL",
      intent: "REQUEST_APPROVAL",
      requiresPolicy: [{ policyKey: "INSPECTION_REQUIRED", oneOf: ["CUSTOMER_MAY_DECLINE"] }],
      label: "inspection declined, service requested",
    },

    { from: "UNDER_INSPECTION", to: "AWAITING_CUSTOMER_APPROVAL", intent: "REQUEST_APPROVAL", label: "findings need approval" },
    // The edge this label always claimed. Until policies could reach the
    // graph, nothing named here controlled it -- the route was chosen by
    // whichever intent a service happened to send, and a workshop that
    // required approval on all work could be walked straight past it.
    //
    // ALL_WORK removes the skip. The approval route beside it is
    // unconditional, so no option of this policy can strand an inspection.
    {
      from: "UNDER_INSPECTION",
      to: "APPROVED_FOR_WORK",
      intent: "APPROVE",
      requiresPolicy: [{ policyKey: "APPROVAL_REQUIRED_SCOPE", oneOf: ["BEYOND_INITIAL_SCOPE", "CRITICAL_ONLY"] }],
      label: "findings within what was agreed -- no approval needed",
    },

    { from: "AWAITING_CUSTOMER_APPROVAL", to: "APPROVED_FOR_WORK", intent: "APPROVE", label: "customer approved" },
    { from: "AWAITING_CUSTOMER_APPROVAL", to: "CANCELLED", label: "customer rejected everything" },

    { from: "APPROVED_FOR_WORK", to: "IN_PROGRESS", intent: "START_WORK", label: "work started" },

    // Internal parts lifecycle -- only exists with an inventory.
    { from: "IN_PROGRESS", to: "WAITING_PARTS", requires: ["INVENTORY"], intent: "REQUEST_PART", label: "part requested from stock" },
    { from: "WAITING_PARTS", to: "IN_PROGRESS", requires: ["INVENTORY"], intent: "PART_RECEIVED", label: "part received" },
    { from: "WAITING_PARTS", to: "CANCELLED", requires: ["INVENTORY"], label: "job cancelled while waiting" },

    { from: "IN_PROGRESS", to: "WAITING_CUSTOMER", intent: "ASK_CUSTOMER", label: "further approval needed mid-job" },
    { from: "WAITING_CUSTOMER", to: "IN_PROGRESS", intent: "CUSTOMER_RESPONDED", label: "customer responded" },
    { from: "WAITING_CUSTOMER", to: "CANCELLED", label: "customer withdrew" },

    { from: "IN_PROGRESS", to: "BLOCKED", intent: "REPORT_BLOCKER", label: "blocker reported" },
    { from: "BLOCKED", to: "IN_PROGRESS", intent: "RESOLVE_BLOCKER", label: "blocker resolved" },
    { from: "BLOCKED", to: "CANCELLED", label: "blocker unresolvable" },

    // Finish routing. SEVERAL of these can be live at once -- a workshop
    // with team review, QC and finance has all three -- so declaration
    // order is precedence: review, then QC, then invoicing. The router
    // takes the first live match, which is why these three must stay in
    // this order and why the choice is data rather than an if-chain.
    //
    // Every FINISH edge carries the full finish-gate set. Gates whose
    // owning capability is inactive are dropped by the gate registry, so a
    // workshop with no inventory is never asked about parts.
    // Live only while the workshop makes review compulsory.
    //
    // This fixes a real contradiction as well as adding the policy. The
    // finish edges below are ordered review -> QC -> invoicing, and the
    // router takes the first live match -- so with TEAM_REVIEW on, review
    // was unconditionally forced and there was no way to express
    // TECHNICIAN_DIRECT_SEND's own declared default of DIRECT. The
    // capability meant "review is compulsory" when the policy said it
    // should mean "review is available".
    //
    // Owning the condition here rather than on the two edges below also
    // keeps `policiesOnEdgesDeclareTheirCapability` satisfied: the policy
    // depends on TEAM_REVIEW and so does this edge, so the answer cannot
    // outlive the capability that gives it meaning.
    //
    // Optional review -- a technician choosing to send a particular job
    // for review under DIRECT -- needs its own intent, which the graph
    // does not have. Recorded here rather than faked: under DIRECT,
    // finished work goes onward.
    { from: "IN_PROGRESS", to: "READY_FOR_TEAM_REVIEW", requires: ["TEAM_REVIEW"], intent: "FINISH", requiresPolicy: [{ policyKey: "TECHNICIAN_DIRECT_SEND", oneOf: ["REVIEW_REQUIRED"] }], gates: ["inspection_completed", "approved_work_completed", "customer_decisions_resolved", "critical_warning_acknowledged", "no_open_blocker", "parts.received_used_or_returned", "parts.no_pending_return", "parts.external_resolved"], label: "finish -> team review" },
    // Same QC_MANDATORY split as the IN_PROGRESS -> READY_FOR_QC pair
    // above, for the job that went through review first.
    {
      from: "READY_FOR_TEAM_REVIEW",
      to: "READY_FOR_QC",
      requires: ["TEAM_REVIEW", "QC"],
      intent: "REVIEW_PASSED",
      requiresPolicy: [{ policyKey: "QC_MANDATORY", oneOf: ["MANDATORY_ALWAYS"] }],
      label: "review passed -> QC (always)",
    },
    {
      from: "READY_FOR_TEAM_REVIEW",
      to: "READY_FOR_QC",
      requires: ["TEAM_REVIEW", "QC"],
      intent: "REVIEW_PASSED",
      requiresPolicy: [{ policyKey: "QC_MANDATORY", oneOf: ["RISK_FLAGGED_ONLY"] }],
      requiresFact: ["work_order.has_critical_fault"],
      label: "review passed -> QC (risk-flagged)",
    },
    {
      from: "READY_FOR_TEAM_REVIEW",
      to: "PAYMENT_PENDING",
      requires: ["TEAM_REVIEW", "FINANCE_CORE"],
      intent: "REVIEW_PASSED",
      label: "review passed -> invoice",
    },
    { from: "READY_FOR_TEAM_REVIEW", to: "IN_PROGRESS", requires: ["TEAM_REVIEW"], intent: "REVIEW_REJECTED", label: "returned for rework" },

    // QC_MANDATORY splits what was one unconditional edge into two,
    // ordered before the FINANCE_CORE fallback below so a job the
    // workshop does not consider risk-flagged (RISK_FLAGGED_ONLY, no
    // qualifying fault) falls straight through to invoicing/delivery
    // rather than waiting on a QC step nobody asked for. MANDATORY_ALWAYS
    // keeps today's unconditional behaviour exactly.
    {
      from: "IN_PROGRESS",
      to: "READY_FOR_QC",
      requires: ["QC"],
      intent: "FINISH",
      requiresPolicy: [{ policyKey: "QC_MANDATORY", oneOf: ["MANDATORY_ALWAYS"] }],
      gates: ["inspection_completed", "approved_work_completed", "customer_decisions_resolved", "critical_warning_acknowledged", "no_open_blocker", "parts.received_used_or_returned", "parts.no_pending_return", "parts.external_resolved"],
      label: "finish -> QC (always)",
    },
    {
      from: "IN_PROGRESS",
      to: "READY_FOR_QC",
      requires: ["QC"],
      intent: "FINISH",
      requiresPolicy: [{ policyKey: "QC_MANDATORY", oneOf: ["RISK_FLAGGED_ONLY"] }],
      requiresFact: ["work_order.has_critical_fault"],
      gates: ["inspection_completed", "approved_work_completed", "customer_decisions_resolved", "critical_warning_acknowledged", "no_open_blocker", "parts.received_used_or_returned", "parts.no_pending_return", "parts.external_resolved"],
      label: "finish -> QC (risk-flagged)",
    },
    { from: "READY_FOR_QC", to: "QC_FAILED", requires: ["QC"], intent: "QC_FAILED", label: "QC failed" },
    { from: "QC_FAILED", to: "IN_PROGRESS", requires: ["QC"], intent: "RESOLVE_BLOCKER", label: "rework" },
    { from: "READY_FOR_QC", to: "PAYMENT_PENDING", requires: ["QC", "FINANCE_CORE"], intent: "QC_PASSED", label: "QC passed -> invoice" },
    { from: "READY_FOR_QC", to: "READY_FOR_DELIVERY", requires: ["QC"], intent: "QC_PASSED", label: "QC passed, no internal finance" },

    { from: "IN_PROGRESS", to: "PAYMENT_PENDING", requires: ["FINANCE_CORE"], intent: "FINISH", gates: ["inspection_completed", "approved_work_completed", "customer_decisions_resolved", "critical_warning_acknowledged", "no_open_blocker", "parts.received_used_or_returned", "parts.no_pending_return", "parts.external_resolved"], label: "finish -> invoice" },

    { from: "PAYMENT_PENDING", to: "READY_FOR_DELIVERY", requires: ["FINANCE_CORE"], intent: "SETTLE_PAYMENT", label: "payment settled" },
    { from: "READY_FOR_DELIVERY", to: "CLOSED", intent: "DELIVER", gates: ["invoice.issued", "payment.settled_or_policy_allows"], label: "vehicle delivered" },
    { from: "READY_FOR_DELIVERY", to: "CANCELLED", label: "cancelled before handover" },

    { from: "DRAFT", to: "CANCELLED", label: "abandoned at intake" },
    { from: "REGISTERED", to: "CANCELLED", label: "customer left" },
    { from: "UNDER_INSPECTION", to: "CANCELLED", label: "cancelled during inspection" },
    { from: "APPROVED_FOR_WORK", to: "CANCELLED", label: "cancelled before work started" },
    { from: "IN_PROGRESS", to: "CANCELLED", label: "cancelled mid-work" },
  ],
};

export const PART_REQUEST_GRAPH: WorkflowGraph = {
  entity: "PartRequest",
  // No inventory, no part requests -- the entity is never created, which
  // is different from it being created and then stranded.
  requires: ["INVENTORY"],
  initial: "DRAFT",
  terminal: ["USED", "RETURNED_TO_STOCK", "REJECTED", "CANCELLED", "UNAVAILABLE"],
  states: [
    "DRAFT",
    "REQUESTED",
    "APPROVED",
    "ISSUED",
    "ARRIVED",
    "RECEIVED_BY_TECHNICIAN",
    "USED",
    "RETURN_REQUESTED",
    "RETURN_ACCEPTED",
    "RETURNED_TO_STOCK",
    // Both declared in the Prisma enum since the RETURN_CLARIFICATION_REQUESTED
    // gap-fix migration, and both unreachable here until this fix -- the
    // graph is what canTransition() actually checks, not the enum, so a
    // state absent from `transitions` might as well not exist.
    "RETURN_REJECTED",
    "RETURN_CLARIFICATION_REQUESTED",
    "REJECTED",
    "UNAVAILABLE",
    "CANCELLED",
  ],
  transitions: [
    { from: "DRAFT", to: "REQUESTED" },
    { from: "REQUESTED", to: "APPROVED" },
    { from: "REQUESTED", to: "REJECTED" },
    { from: "REQUESTED", to: "UNAVAILABLE" },
    { from: "APPROVED", to: "ISSUED" },
    { from: "ISSUED", to: "ARRIVED" },
    { from: "ARRIVED", to: "RECEIVED_BY_TECHNICIAN" },
    { from: "RECEIVED_BY_TECHNICIAN", to: "USED" },
    // Returns are separately removable: a workshop may issue parts but not
    // accept them back.
    { from: "RECEIVED_BY_TECHNICIAN", to: "RETURN_REQUESTED", requires: ["PART_RETURNS"] },
    { from: "RETURN_REQUESTED", to: "RETURN_ACCEPTED", requires: ["PART_RETURNS"] },
    // A rejected RETURN is not the same event as a rejected REQUEST -- the
    // part was already handed over, so the technician has to resolve it
    // (typically by marking it Used after all) rather than the whole
    // request quietly dying. Landing this on the top-level REJECTED
    // terminal, as the graph did before this fix, was the exact bug
    // Returns/Movements' spec named "the previous build was missing
    // entirely" -- the state existed in the enum with nowhere to go.
    { from: "RETURN_REQUESTED", to: "RETURN_REJECTED", requires: ["PART_RETURNS"] },
    { from: "RETURN_REJECTED", to: "USED", requires: ["PART_RETURNS"] },
    // Clarification: a question without a decision. Loops back to
    // RETURN_REQUESTED on reply so the manager's next action (accept,
    // reject, or ask again) is the same decision they'd have made from a
    // first-time request -- the loop can repeat any number of times.
    { from: "RETURN_REQUESTED", to: "RETURN_CLARIFICATION_REQUESTED", requires: ["PART_RETURNS"] },
    { from: "RETURN_CLARIFICATION_REQUESTED", to: "RETURN_REQUESTED", requires: ["PART_RETURNS"] },
    { from: "RETURN_ACCEPTED", to: "RETURNED_TO_STOCK", requires: ["PART_RETURNS"] },
    { from: "DRAFT", to: "CANCELLED" },
    { from: "REQUESTED", to: "CANCELLED" },
    { from: "APPROVED", to: "CANCELLED" },
  ],
};

export const CUSTOMER_DECISION_GRAPH: WorkflowGraph = {
  entity: "CustomerDecisionRequest",
  initial: "PENDING",
  terminal: ["RESOLVED", "EXPIRED", "CANCELLED"],
  states: ["PENDING", "SENT", "VIEWED", "PARTIALLY_RESPONDED", "RESOLVED", "EXPIRED", "CANCELLED"],
  transitions: [
    // The portal/link channel. Removing CUSTOMER_PORTAL removes these --
    // the removal policy adds a counter-approval edge in their place, so
    // the approval STEP survives the loss of the channel.
    { from: "PENDING", to: "SENT", requires: ["CUSTOMER_PORTAL"] },
    { from: "SENT", to: "VIEWED", requires: ["CUSTOMER_PORTAL"] },
    { from: "VIEWED", to: "PARTIALLY_RESPONDED", requires: ["CUSTOMER_PORTAL"] },
    { from: "VIEWED", to: "RESOLVED", requires: ["CUSTOMER_PORTAL"] },
    { from: "PARTIALLY_RESPONDED", to: "RESOLVED", requires: ["CUSTOMER_PORTAL"] },
    { from: "SENT", to: "EXPIRED", requires: ["CUSTOMER_PORTAL"] },
    { from: "VIEWED", to: "EXPIRED", requires: ["CUSTOMER_PORTAL"] },
    { from: "PENDING", to: "CANCELLED" },
  ],
};

export const ALL_GRAPHS: readonly WorkflowGraph[] = [
  WORK_ORDER_GRAPH,
  PART_REQUEST_GRAPH,
  CUSTOMER_DECISION_GRAPH,
];
