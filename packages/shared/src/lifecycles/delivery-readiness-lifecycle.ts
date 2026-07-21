import type { LifecycleMap } from "./types";

export type DeliveryReadinessStatus = "not_ready" | "blocked" | "ready" | "notified" | "delivered";

export const deliveryReadinessLifecycle: LifecycleMap<DeliveryReadinessStatus> = {
  name: "delivery_readiness",
  statuses: {
    not_ready: { status: "not_ready", internalLabel: "Not Ready", roleLabels: { branch_manager: "Not ready" }, customerSafeLabel: "Final checks pending", tone: "gray", icon: "clock" },
    blocked: { status: "blocked", internalLabel: "Blocked", roleLabels: { branch_manager: "Delivery blocked" }, customerSafeLabel: "Delivery is not ready yet", tone: "red", icon: "lock" },
    ready: { status: "ready", internalLabel: "Ready", roleLabels: { branch_manager: "Ready for delivery" }, customerSafeLabel: "Ready for delivery", tone: "green", icon: "check-circle" },
    notified: { status: "notified", internalLabel: "Customer Notified", roleLabels: { branch_manager: "Customer notified" }, customerSafeLabel: "Ready for handover", tone: "green", icon: "bell" },
    delivered: { status: "delivered", internalLabel: "Delivered", roleLabels: { branch_manager: "Delivered", customer: "Delivered" }, customerSafeLabel: "Delivered", tone: "green", icon: "badge-check", terminal: true }
  },
  transitions: [
    { from: "not_ready", to: "blocked", action: "evaluate_blocked", roles: ["branch_manager"], blockedWhen: ["CUSTOMER_DECISION_PENDING", "PART_REQUEST_PENDING", "PAYMENT_PENDING"], auditEvent: "delivery.blocked" },
    { from: "blocked", to: "ready", action: "clear_blocks", roles: ["branch_manager"], auditEvent: "delivery.ready" },
    { from: "not_ready", to: "ready", action: "mark_ready", roles: ["branch_manager"], auditEvent: "delivery.ready" },
    { from: "ready", to: "notified", action: "notify_customer", roles: ["branch_manager"], auditEvent: "delivery.customer_notified" },
    { from: "notified", to: "delivered", action: "handover", roles: ["branch_manager"], auditEvent: "delivery.handover_completed" }
  ]
};
