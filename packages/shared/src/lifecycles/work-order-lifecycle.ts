import type { LifecycleMap } from "./types";

export type WorkOrderLifecycleStatus =
  | "draft"
  | "inspection"
  | "awaiting_customer_approval"
  | "in_progress"
  | "waiting_for_parts"
  | "ready_for_qc"
  | "payment_pending"
  | "ready_for_delivery"
  | "delivered"
  | "cancelled";

export const workOrderLifecycle: LifecycleMap<WorkOrderLifecycleStatus> = {
  name: "work_order",
  statuses: {
    draft: { status: "draft", internalLabel: "Draft", roleLabels: { branch_manager: "Registered" }, customerSafeLabel: "Registered", tone: "gray", icon: "file" },
    inspection: { status: "inspection", internalLabel: "Inspection", roleLabels: { branch_manager: "Under inspection", technician: "Inspect" }, customerSafeLabel: "Inspection started", tone: "blue", icon: "search" },
    awaiting_customer_approval: { status: "awaiting_customer_approval", internalLabel: "Awaiting Customer Approval", roleLabels: { branch_manager: "Waiting customer", technician: "Waiting customer" }, customerSafeLabel: "Decision needed", tone: "gold", icon: "message-circle" },
    in_progress: { status: "in_progress", internalLabel: "In Progress", roleLabels: { branch_manager: "In progress", technician: "In progress" }, customerSafeLabel: "Service in progress", tone: "blue", icon: "wrench" },
    waiting_for_parts: { status: "waiting_for_parts", internalLabel: "Waiting for Parts", roleLabels: { branch_manager: "Waiting parts", inventory_manager: "Part delay impact" }, customerSafeLabel: "Waiting for required part", tone: "gold", icon: "package" },
    ready_for_qc: { status: "ready_for_qc", internalLabel: "Ready for QC", roleLabels: { branch_manager: "Ready for QC", team_leader: "QC needed" }, customerSafeLabel: "Final checks pending", tone: "green", icon: "shield-check" },
    payment_pending: { status: "payment_pending", internalLabel: "Payment Pending", roleLabels: { branch_manager: "Payment pending" }, customerSafeLabel: "Payment pending", tone: "gold", icon: "credit-card" },
    ready_for_delivery: { status: "ready_for_delivery", internalLabel: "Ready for Delivery", roleLabels: { branch_manager: "Ready for delivery" }, customerSafeLabel: "Ready for delivery", tone: "green", icon: "car-front" },
    delivered: { status: "delivered", internalLabel: "Delivered", roleLabels: { branch_manager: "Delivered", customer: "Delivered" }, customerSafeLabel: "Delivered", tone: "green", icon: "badge-check", terminal: true },
    cancelled: { status: "cancelled", internalLabel: "Cancelled", roleLabels: { branch_manager: "Cancelled" }, customerSafeLabel: "Cancelled", tone: "gray", icon: "slash", terminal: true }
  },
  transitions: [
    { from: "draft", to: "inspection", action: "start_inspection", roles: ["branch_manager", "technician"], auditEvent: "work_order.inspection_started" },
    { from: "inspection", to: "awaiting_customer_approval", action: "request_customer_approval", roles: ["technician"], auditEvent: "customer_decision.requested" },
    { from: "awaiting_customer_approval", to: "in_progress", action: "customer_responded", roles: ["customer"], auditEvent: "customer_decision.responded" },
    { from: "in_progress", to: "waiting_for_parts", action: "part_delay", roles: ["technician", "inventory_manager"], auditEvent: "work_order.waiting_for_parts" },
    { from: "waiting_for_parts", to: "in_progress", action: "parts_resolved", roles: ["technician", "inventory_manager"], auditEvent: "work_order.parts_resolved" },
    { from: "in_progress", to: "ready_for_qc", action: "finish_work", roles: ["technician"], blockedWhen: ["FINISH_BLOCKED"], auditEvent: "task.sent_to_qc" },
    { from: "ready_for_qc", to: "payment_pending", action: "qc_pass_payment_due", roles: ["team_leader"], auditEvent: "work_order.payment_pending" },
    { from: "ready_for_qc", to: "ready_for_delivery", action: "qc_pass_no_payment_due", roles: ["team_leader"], auditEvent: "work_order.ready_for_delivery" },
    { from: "payment_pending", to: "ready_for_delivery", action: "payment_cleared", roles: ["branch_manager"], auditEvent: "work_order.ready_for_delivery" },
    { from: "ready_for_delivery", to: "delivered", action: "handover", roles: ["branch_manager"], auditEvent: "work_order.delivered" },
    { from: "draft", to: "cancelled", action: "cancel", roles: ["branch_manager"], auditEvent: "work_order.cancelled" }
  ]
};
