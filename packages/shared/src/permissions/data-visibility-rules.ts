export type DataVisibilityAudience = "customer" | "technician" | "inventory_manager" | "branch_manager" | "tenant_admin";

export interface DataVisibilityRule {
  field: string;
  visibleTo: DataVisibilityAudience[];
  reason: string;
}

export const dataVisibilityRules: DataVisibilityRule[] = [
  { field: "customer.private_financial_data", visibleTo: ["branch_manager", "tenant_admin"], reason: "Old owner financial/private data must not be visible after ownership transfer." },
  { field: "customer.safe_status_message", visibleTo: ["customer", "branch_manager", "technician"], reason: "Customer-safe status is allowed across customer-facing flows." },
  { field: "inventory.internal_cost", visibleTo: ["inventory_manager", "tenant_admin"], reason: "Inventory cost is not customer or technician visible." },
  { field: "inventory.warehouse_internal_note", visibleTo: ["inventory_manager", "tenant_admin"], reason: "Warehouse internals stay out of customer and technician views." },
  { field: "task.internal_note", visibleTo: ["technician", "branch_manager", "tenant_admin"], reason: "Internal notes are never customer visible." },
  { field: "audit.before_after_payload", visibleTo: ["tenant_admin"], reason: "Raw audit payloads are administrative evidence." }
];

export function isFieldVisible(field: string, audience: DataVisibilityAudience) {
  const rule = dataVisibilityRules.find((item) => item.field === field);
  return rule ? rule.visibleTo.includes(audience) : false;
}
