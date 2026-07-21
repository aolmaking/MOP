import type { SessionContextDto } from "../contracts";
import { can } from "./permissions";

export interface ActionGuard {
  action: string;
  permission: string;
}

export const actionGuards: Record<string, ActionGuard> = {
  "parts.request": { action: "parts.request", permission: "parts.request" },
  "parts.mark_used": { action: "parts.mark_used", permission: "parts.mark_used" },
  "inventory.request.issue": { action: "inventory.request.issue", permission: "inventory.request.issue" },
  "inventory.stock.adjust": { action: "inventory.stock.adjust", permission: "inventory.stock.adjust" },
  "customer_decision.send": { action: "customer_decision.send", permission: "customer_decision.send" },
  "branch.work_order.assign": { action: "branch.work_order.assign", permission: "branch.work_order.assign" },
  "branch.delivery.mark_ready": { action: "branch.delivery.mark_ready", permission: "branch.delivery.mark_ready" }
};

export function canAction(session: SessionContextDto, action: keyof typeof actionGuards, record?: Parameters<typeof can>[1]["record"]) {
  return can(session, { permission: actionGuards[action].permission, record });
}
