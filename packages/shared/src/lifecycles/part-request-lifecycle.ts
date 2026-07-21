import type { LifecycleMap } from "./types";

export type PartRequestLifecycleStatus =
  | "draft"
  | "requested"
  | "pending_inventory_review"
  | "approved"
  | "issued"
  | "in_transit"
  | "awaiting_technician_confirmation"
  | "received_by_technician"
  | "used"
  | "return_requested"
  | "return_accepted"
  | "returned_to_stock"
  | "return_rejected"
  | "unavailable"
  | "waiting_transfer"
  | "waiting_supplier"
  | "rejected"
  | "cancelled";

export const partRequestLifecycle: LifecycleMap<PartRequestLifecycleStatus> = {
  name: "part_request",
  statuses: {
    draft: { status: "draft", internalLabel: "Draft", roleLabels: { technician: "Draft request" }, tone: "gray", icon: "file-pen" },
    requested: { status: "requested", internalLabel: "Requested", roleLabels: { technician: "Sent to inventory", branch_manager: "Waiting inventory" }, tone: "blue", icon: "send" },
    pending_inventory_review: { status: "pending_inventory_review", internalLabel: "Pending Inventory Review", roleLabels: { inventory_manager: "Review request", branch_manager: "Inventory review pending" }, tone: "gold", icon: "clipboard-list" },
    approved: { status: "approved", internalLabel: "Approved", roleLabels: { inventory_manager: "Approved", technician: "Approved" }, tone: "green", icon: "check" },
    issued: { status: "issued", internalLabel: "Issued", roleLabels: { technician: "On the way", branch_manager: "Issued by inventory" }, tone: "blue", icon: "package-check" },
    in_transit: { status: "in_transit", internalLabel: "In Transit", roleLabels: { technician: "On the way", branch_manager: "In transit" }, tone: "blue", icon: "truck" },
    awaiting_technician_confirmation: { status: "awaiting_technician_confirmation", internalLabel: "Awaiting Technician Confirmation", roleLabels: { technician: "Confirm arrived", branch_manager: "Waiting technician arrival" }, tone: "gold", icon: "package-open" },
    received_by_technician: { status: "received_by_technician", internalLabel: "Received by Technician", roleLabels: { technician: "Received", branch_manager: "Technician received" }, tone: "green", icon: "hand" },
    used: { status: "used", internalLabel: "Used", roleLabels: { technician: "Used", inventory_manager: "Consumed", branch_manager: "Used in work order" }, tone: "green", icon: "wrench", terminal: true },
    return_requested: { status: "return_requested", internalLabel: "Return Requested", roleLabels: { technician: "Return pending", inventory_manager: "Review return", branch_manager: "Return pending" }, tone: "gold", icon: "undo-2" },
    return_accepted: { status: "return_accepted", internalLabel: "Return Accepted", roleLabels: { inventory_manager: "Accepted", branch_manager: "Return accepted" }, tone: "green", icon: "check-check" },
    returned_to_stock: { status: "returned_to_stock", internalLabel: "Returned to Stock", roleLabels: { inventory_manager: "Returned to stock", branch_manager: "Returned" }, tone: "green", icon: "archive-restore", terminal: true },
    return_rejected: { status: "return_rejected", internalLabel: "Return Rejected", roleLabels: { technician: "Return rejected", branch_manager: "Return rejected" }, tone: "red", icon: "circle-x" },
    unavailable: { status: "unavailable", internalLabel: "Unavailable", roleLabels: { technician: "Unavailable", branch_manager: "Part unavailable" }, tone: "red", icon: "ban" },
    waiting_transfer: { status: "waiting_transfer", internalLabel: "Waiting Transfer", roleLabels: { inventory_manager: "Waiting transfer", branch_manager: "Waiting transfer" }, tone: "gold", icon: "move-right" },
    waiting_supplier: { status: "waiting_supplier", internalLabel: "Waiting Supplier", roleLabels: { inventory_manager: "Waiting supplier", branch_manager: "Waiting supplier" }, tone: "gold", icon: "factory" },
    rejected: { status: "rejected", internalLabel: "Rejected", roleLabels: { technician: "Rejected", branch_manager: "Rejected by inventory" }, tone: "red", icon: "x", terminal: true },
    cancelled: { status: "cancelled", internalLabel: "Cancelled", roleLabels: { technician: "Cancelled", branch_manager: "Cancelled" }, tone: "gray", icon: "slash", terminal: true }
  },
  transitions: [
    { from: "draft", to: "requested", action: "submit_request", roles: ["technician"], auditEvent: "part.requested" },
    { from: "requested", to: "pending_inventory_review", action: "queue_for_inventory", roles: ["technician", "inventory_manager"], auditEvent: "part.pending_inventory_review" },
    { from: "pending_inventory_review", to: "approved", action: "approve", roles: ["inventory_manager"], auditEvent: "part.request_approved" },
    { from: "approved", to: "issued", action: "issue", roles: ["inventory_manager"], blockedWhen: ["PART_NOT_AVAILABLE", "WAREHOUSE_SCOPE_DENIED"], auditEvent: "part.issued" },
    { from: "issued", to: "in_transit", action: "dispatch", roles: ["inventory_manager"], auditEvent: "part.in_transit" },
    { from: "issued", to: "awaiting_technician_confirmation", action: "mark_arrived", roles: ["inventory_manager"], auditEvent: "part.arrived" },
    { from: "in_transit", to: "awaiting_technician_confirmation", action: "mark_arrived", roles: ["inventory_manager"], auditEvent: "part.arrived" },
    { from: "awaiting_technician_confirmation", to: "received_by_technician", action: "confirm_arrived", roles: ["technician"], auditEvent: "part.arrived_confirmed" },
    { from: "received_by_technician", to: "used", action: "mark_used", roles: ["technician"], auditEvent: "part.used" },
    { from: "received_by_technician", to: "return_requested", action: "request_return", roles: ["technician"], auditEvent: "part.return_requested" },
    { from: "return_requested", to: "returned_to_stock", action: "accept_to_stock", roles: ["inventory_manager"], auditEvent: "part.return_accepted" },
    { from: "return_requested", to: "return_rejected", action: "reject_return", roles: ["inventory_manager"], auditEvent: "part.return_rejected" },
    { from: "pending_inventory_review", to: "waiting_transfer", action: "request_transfer", roles: ["inventory_manager"], auditEvent: "part.waiting_transfer" },
    { from: "pending_inventory_review", to: "waiting_supplier", action: "request_supplier", roles: ["inventory_manager"], auditEvent: "part.waiting_supplier" },
    { from: "pending_inventory_review", to: "unavailable", action: "mark_unavailable", roles: ["inventory_manager"], auditEvent: "part.unavailable" },
    { from: "pending_inventory_review", to: "rejected", action: "reject", roles: ["inventory_manager"], auditEvent: "part.rejected" },
    { from: "requested", to: "cancelled", action: "cancel", roles: ["technician", "branch_manager"], auditEvent: "part.cancelled" }
  ]
};
