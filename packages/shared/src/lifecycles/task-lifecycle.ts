import type { LifecycleMap } from "./types";

export type TaskLifecycleStatus = "assigned" | "in_progress" | "blocked" | "awaiting_customer_approval" | "ready_for_qc" | "ready_for_delivery" | "completed";

export const taskLifecycle: LifecycleMap<TaskLifecycleStatus> = {
  name: "technician_task",
  statuses: {
    assigned: { status: "assigned", internalLabel: "Assigned", roleLabels: { technician: "Assigned", branch_manager: "Assigned" }, tone: "blue", icon: "user-check" },
    in_progress: { status: "in_progress", internalLabel: "In Progress", roleLabels: { technician: "Active", branch_manager: "Technician active" }, tone: "blue", icon: "play" },
    blocked: { status: "blocked", internalLabel: "Blocked", roleLabels: { technician: "Blocked", branch_manager: "Blocker needs follow-up" }, tone: "red", icon: "octagon-alert" },
    awaiting_customer_approval: { status: "awaiting_customer_approval", internalLabel: "Awaiting Customer Approval", roleLabels: { technician: "Waiting customer", branch_manager: "Customer decision pending" }, tone: "gold", icon: "message-circle" },
    ready_for_qc: { status: "ready_for_qc", internalLabel: "Ready for QC", roleLabels: { technician: "Sent for review", branch_manager: "Ready for QC" }, tone: "green", icon: "shield-check" },
    ready_for_delivery: { status: "ready_for_delivery", internalLabel: "Ready for Delivery", roleLabels: { branch_manager: "Ready for delivery" }, tone: "green", icon: "check-check" },
    completed: { status: "completed", internalLabel: "Completed", roleLabels: { technician: "Completed", branch_manager: "Completed" }, tone: "green", icon: "badge-check", terminal: true }
  },
  transitions: [
    { from: "assigned", to: "in_progress", action: "start", roles: ["technician"], auditEvent: "task.started" },
    { from: "in_progress", to: "blocked", action: "report_blocker", roles: ["technician"], auditEvent: "task.blocker_reported" },
    { from: "blocked", to: "in_progress", action: "resolve_blocker", roles: ["branch_manager", "team_leader"], auditEvent: "task.blocker_resolved" },
    { from: "in_progress", to: "awaiting_customer_approval", action: "request_customer_decision", roles: ["technician"], auditEvent: "customer_decision.requested" },
    { from: "awaiting_customer_approval", to: "in_progress", action: "customer_responded", roles: ["customer"], auditEvent: "customer_decision.responded" },
    { from: "in_progress", to: "ready_for_qc", action: "finish", roles: ["technician"], blockedWhen: ["CUSTOMER_DECISION_PENDING", "PART_REQUEST_PENDING", "RETURN_PENDING_REVIEW", "FINISH_BLOCKED"], auditEvent: "task.sent_to_qc" },
    { from: "ready_for_qc", to: "completed", action: "qc_pass", roles: ["team_leader"], auditEvent: "task.completed" },
    { from: "ready_for_qc", to: "in_progress", action: "return_for_rework", roles: ["team_leader"], auditEvent: "task.returned_for_rework" }
  ]
};
