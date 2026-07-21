import type { LifecycleMap } from "./types";

export type CustomerDecisionLifecycleStatus = "draft" | "sent" | "viewed" | "responded" | "expired" | "cancelled";

export const customerDecisionLifecycle: LifecycleMap<CustomerDecisionLifecycleStatus> = {
  name: "customer_decision",
  statuses: {
    draft: { status: "draft", internalLabel: "Draft", roleLabels: { technician: "Draft", branch_manager: "Draft decision" }, customerSafeLabel: "Not sent yet", tone: "gray", icon: "file-pen" },
    sent: { status: "sent", internalLabel: "Sent", roleLabels: { customer: "Decision needed", technician: "Waiting customer", branch_manager: "Waiting customer" }, customerSafeLabel: "Decision needed", tone: "gold", icon: "send" },
    viewed: { status: "viewed", internalLabel: "Viewed", roleLabels: { customer: "Viewed", branch_manager: "Customer viewed" }, customerSafeLabel: "Decision link opened", tone: "blue", icon: "eye" },
    responded: { status: "responded", internalLabel: "Responded", roleLabels: { customer: "Decision recorded", technician: "Customer responded", branch_manager: "Customer responded" }, customerSafeLabel: "Decision recorded", tone: "green", icon: "check-check", terminal: true },
    expired: { status: "expired", internalLabel: "Expired", roleLabels: { branch_manager: "Decision expired" }, customerSafeLabel: "Decision link expired", tone: "red", icon: "timer-off", terminal: true },
    cancelled: { status: "cancelled", internalLabel: "Cancelled", roleLabels: { branch_manager: "Decision cancelled" }, customerSafeLabel: "Decision cancelled", tone: "gray", icon: "slash", terminal: true }
  },
  transitions: [
    { from: "draft", to: "sent", action: "send", roles: ["technician", "branch_manager"], auditEvent: "customer_decision.sent" },
    { from: "sent", to: "viewed", action: "view_public_link", roles: ["customer"], auditEvent: "customer_decision.viewed" },
    { from: "sent", to: "responded", action: "submit_response", roles: ["customer"], auditEvent: "customer_decision.responded" },
    { from: "viewed", to: "responded", action: "submit_response", roles: ["customer"], auditEvent: "customer_decision.responded" },
    { from: "sent", to: "expired", action: "expire", roles: ["tenant_admin"], auditEvent: "customer_decision.expired" },
    { from: "draft", to: "cancelled", action: "cancel", roles: ["technician", "branch_manager"], auditEvent: "customer_decision.cancelled" }
  ]
};
