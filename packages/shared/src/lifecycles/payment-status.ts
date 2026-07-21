import type { LifecycleMap } from "./types";

export type PaymentLifecycleStatus = "not_started" | "pending" | "partial" | "paid" | "cancelled";

export const paymentStatusLifecycle: LifecycleMap<PaymentLifecycleStatus> = {
  name: "payment_status",
  statuses: {
    not_started: { status: "not_started", internalLabel: "Not Started", roleLabels: { branch_manager: "No invoice yet" }, customerSafeLabel: "No payment requested yet", tone: "gray", icon: "file" },
    pending: { status: "pending", internalLabel: "Pending", roleLabels: { branch_manager: "Payment pending" }, customerSafeLabel: "Payment pending", tone: "gold", icon: "credit-card" },
    partial: { status: "partial", internalLabel: "Partial", roleLabels: { branch_manager: "Partial payment" }, customerSafeLabel: "Remaining amount pending", tone: "gold", icon: "wallet" },
    paid: { status: "paid", internalLabel: "Paid", roleLabels: { branch_manager: "Paid" }, customerSafeLabel: "Payment complete", tone: "green", icon: "badge-check", terminal: true },
    cancelled: { status: "cancelled", internalLabel: "Cancelled", roleLabels: { branch_manager: "Payment cancelled" }, customerSafeLabel: "Payment cancelled", tone: "gray", icon: "slash", terminal: true }
  },
  transitions: [
    { from: "not_started", to: "pending", action: "issue_invoice_placeholder", roles: ["branch_manager"], auditEvent: "payment.pending" },
    { from: "pending", to: "partial", action: "record_partial_payment", roles: ["branch_manager"], auditEvent: "payment.partial" },
    { from: "pending", to: "paid", action: "record_full_payment", roles: ["branch_manager"], auditEvent: "payment.paid" },
    { from: "partial", to: "paid", action: "record_remaining_payment", roles: ["branch_manager"], auditEvent: "payment.paid" },
    { from: "pending", to: "cancelled", action: "cancel_payment", roles: ["branch_manager"], auditEvent: "payment.cancelled" }
  ]
};

export function paymentStatus(total: number, paid: number, balance: number): PaymentLifecycleStatus {
  if (total <= 0) return "not_started";
  if (balance <= 0) return "paid";
  if (paid > 0) return "partial";
  return "pending";
}
