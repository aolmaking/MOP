import type { PermissionKey, StaffRole } from "@mop/shared";

export const MONEY_HANDLER_ROLES = ["TENANT_ADMIN", "BRANCH_MANAGER", "TECHNICIAN"] as const satisfies readonly StaffRole[];
export type MoneyHandlerRole = (typeof MONEY_HANDLER_ROLES)[number];

export const MONEY_HANDLER_PERMISSION_KEYS = [
  "finance.invoice.issue",
  "finance.payment.record",
] as const satisfies readonly PermissionKey[];
export type MoneyHandlerPermissionKey = (typeof MONEY_HANDLER_PERMISSION_KEYS)[number];

export const MONEY_HANDLER_ROLE_LABELS: Record<MoneyHandlerRole, string> = {
  TENANT_ADMIN: "Tenant Admin",
  BRANCH_MANAGER: "Branch Manager",
  TECHNICIAN: "Technician",
};

export const MONEY_HANDLER_PERMISSION_LABELS: Record<MoneyHandlerPermissionKey, string> = {
  "finance.invoice.issue": "Issue invoices",
  "finance.payment.record": "Record payments",
};

export function isMoneyHandlerRole(value: string): value is MoneyHandlerRole {
  return (MONEY_HANDLER_ROLES as readonly string[]).includes(value);
}

export function isMoneyHandlerPermissionKey(value: string): value is MoneyHandlerPermissionKey {
  return (MONEY_HANDLER_PERMISSION_KEYS as readonly string[]).includes(value);
}
