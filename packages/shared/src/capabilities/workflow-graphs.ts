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
    { from: "DRAFT", to: "REGISTERED", label: "intake completed" },
    { from: "REGISTERED", to: "UNDER_INSPECTION", label: "technician starts inspection" },
    // A customer who declines inspection and asks for one named service
    // goes straight to approval -- see SCENARIOS.md "intake refusals".
    { from: "REGISTERED", to: "AWAITING_CUSTOMER_APPROVAL", label: "inspection declined, service requested" },

    { from: "UNDER_INSPECTION", to: "AWAITING_CUSTOMER_APPROVAL", label: "findings need approval" },
    { from: "UNDER_INSPECTION", to: "APPROVED_FOR_WORK", label: "no approval required by policy" },

    { from: "AWAITING_CUSTOMER_APPROVAL", to: "APPROVED_FOR_WORK", label: "customer approved" },
    { from: "AWAITING_CUSTOMER_APPROVAL", to: "CANCELLED", label: "customer rejected everything" },

    { from: "APPROVED_FOR_WORK", to: "IN_PROGRESS", label: "work started" },

    // Internal parts lifecycle -- only exists with an inventory.
    { from: "IN_PROGRESS", to: "WAITING_PARTS", requires: ["INVENTORY"], label: "part requested from stock" },
    { from: "WAITING_PARTS", to: "IN_PROGRESS", requires: ["INVENTORY"], label: "part received" },
    { from: "WAITING_PARTS", to: "CANCELLED", requires: ["INVENTORY"], label: "job cancelled while waiting" },

    { from: "IN_PROGRESS", to: "WAITING_CUSTOMER", label: "further approval needed mid-job" },
    { from: "WAITING_CUSTOMER", to: "IN_PROGRESS", label: "customer responded" },
    { from: "WAITING_CUSTOMER", to: "CANCELLED", label: "customer withdrew" },

    { from: "IN_PROGRESS", to: "BLOCKED", label: "blocker reported" },
    { from: "BLOCKED", to: "IN_PROGRESS", label: "blocker resolved" },
    { from: "BLOCKED", to: "CANCELLED", label: "blocker unresolvable" },

    // Finish routing. Exactly one of these is live for a given tenant,
    // decided by TEAM_REVIEW / QC / FINANCE_CORE.
    { from: "IN_PROGRESS", to: "READY_FOR_TEAM_REVIEW", requires: ["TEAM_REVIEW"], label: "finish -> team review" },
    { from: "READY_FOR_TEAM_REVIEW", to: "READY_FOR_QC", requires: ["TEAM_REVIEW", "QC"], label: "review passed -> QC" },
    {
      from: "READY_FOR_TEAM_REVIEW",
      to: "PAYMENT_PENDING",
      requires: ["TEAM_REVIEW", "FINANCE_CORE"],
      label: "review passed -> invoice",
    },
    { from: "READY_FOR_TEAM_REVIEW", to: "IN_PROGRESS", requires: ["TEAM_REVIEW"], label: "returned for rework" },

    { from: "IN_PROGRESS", to: "READY_FOR_QC", requires: ["QC"], label: "finish -> QC" },
    { from: "READY_FOR_QC", to: "QC_FAILED", requires: ["QC"], label: "QC failed" },
    { from: "QC_FAILED", to: "IN_PROGRESS", requires: ["QC"], label: "rework" },
    { from: "READY_FOR_QC", to: "PAYMENT_PENDING", requires: ["QC", "FINANCE_CORE"], label: "QC passed -> invoice" },
    { from: "READY_FOR_QC", to: "READY_FOR_DELIVERY", requires: ["QC"], label: "QC passed, no internal finance" },

    { from: "IN_PROGRESS", to: "PAYMENT_PENDING", requires: ["FINANCE_CORE"], label: "finish -> invoice" },

    { from: "PAYMENT_PENDING", to: "READY_FOR_DELIVERY", requires: ["FINANCE_CORE"], label: "payment settled" },
    { from: "READY_FOR_DELIVERY", to: "CLOSED", label: "vehicle delivered" },
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
    { from: "RETURN_REQUESTED", to: "REJECTED", requires: ["PART_RETURNS"] },
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
