import type { LifecycleStatusDefinition } from "./types";

export type StockHealthStatus = "healthy" | "watch" | "low" | "critical" | "out_of_stock" | "disabled";

export const stockStatusMap: Record<StockHealthStatus, LifecycleStatusDefinition<StockHealthStatus>> = {
  healthy: { status: "healthy", internalLabel: "Healthy", roleLabels: { inventory_manager: "Healthy", branch_manager: "Available" }, tone: "green", icon: "check-circle" },
  watch: { status: "watch", internalLabel: "Watch", roleLabels: { inventory_manager: "Watch", branch_manager: "Monitor stock" }, tone: "blue", icon: "eye" },
  low: { status: "low", internalLabel: "Low Stock", roleLabels: { inventory_manager: "Low stock", branch_manager: "Low stock risk" }, tone: "gold", icon: "triangle-alert" },
  critical: { status: "critical", internalLabel: "Critical Stock", roleLabels: { inventory_manager: "Critical stock", branch_manager: "Critical stock risk" }, tone: "red", icon: "octagon-alert" },
  out_of_stock: { status: "out_of_stock", internalLabel: "Out of Stock", roleLabels: { inventory_manager: "Out of stock", technician: "Request anyway", branch_manager: "Work order may be delayed" }, tone: "red", icon: "ban" },
  disabled: { status: "disabled", internalLabel: "Disabled", roleLabels: { inventory_manager: "Disabled", technician: "Unavailable" }, tone: "gray", icon: "slash" }
};

export const stockStatusAuditEvent: Partial<Record<StockHealthStatus, string>> = {
  low: "stock.low",
  critical: "stock.low",
  out_of_stock: "stock.out_of_stock"
};

export function stockHealth(available: number, lowThreshold: number, criticalThreshold: number): StockHealthStatus {
  if (available <= 0) return "out_of_stock";
  if (available <= criticalThreshold) return "critical";
  if (available <= lowThreshold) return "low";
  return "healthy";
}
