import type { LifecycleMap } from "./types";

export type ReturnLifecycleStatus = "pending_inventory_review" | "accepted_to_stock" | "accepted_damaged" | "rejected" | "clarification_requested";

export const returnLifecycle: LifecycleMap<ReturnLifecycleStatus> = {
  name: "return_request",
  statuses: {
    pending_inventory_review: { status: "pending_inventory_review", internalLabel: "Pending Inventory Review", roleLabels: { technician: "Return pending", inventory_manager: "Review return", branch_manager: "Return pending inventory" }, tone: "gold", icon: "undo-2" },
    accepted_to_stock: { status: "accepted_to_stock", internalLabel: "Accepted to Stock", roleLabels: { technician: "Returned", inventory_manager: "Returned to stock", branch_manager: "Returned to stock" }, tone: "green", icon: "archive-restore", terminal: true },
    accepted_damaged: { status: "accepted_damaged", internalLabel: "Accepted Damaged", roleLabels: { inventory_manager: "Damaged return", branch_manager: "Damaged return accepted" }, tone: "gold", icon: "triangle-alert", terminal: true },
    rejected: { status: "rejected", internalLabel: "Rejected", roleLabels: { technician: "Return rejected", branch_manager: "Return rejected" }, tone: "red", icon: "circle-x", terminal: true },
    clarification_requested: { status: "clarification_requested", internalLabel: "Clarification Requested", roleLabels: { technician: "Clarification needed", inventory_manager: "Waiting technician clarification" }, tone: "blue", icon: "message-square" }
  },
  transitions: [
    { from: "pending_inventory_review", to: "accepted_to_stock", action: "accept_to_stock", roles: ["inventory_manager"], auditEvent: "part.return_accepted" },
    { from: "pending_inventory_review", to: "accepted_damaged", action: "accept_damaged", roles: ["inventory_manager"], auditEvent: "part.return_damaged" },
    { from: "pending_inventory_review", to: "rejected", action: "reject", roles: ["inventory_manager"], auditEvent: "part.return_rejected" },
    { from: "pending_inventory_review", to: "clarification_requested", action: "request_clarification", roles: ["inventory_manager"], auditEvent: "part.return_clarification_requested" },
    { from: "clarification_requested", to: "pending_inventory_review", action: "resubmit", roles: ["technician"], auditEvent: "part.return_clarification_answered" }
  ]
};
