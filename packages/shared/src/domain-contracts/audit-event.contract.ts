import type { CategoryCode } from "../contracts";

export type AuditEventAction =
  | "customer_decision.requested"
  | "customer_decision.sent"
  | "customer_decision.responded"
  | "part.requested"
  | "part.issued"
  | "part.arrived_confirmed"
  | "part.used"
  | "part.return_requested"
  | "part.return_accepted"
  | "task.finish_blocked"
  | "task.sent_to_qc"
  | "task.sent_to_team_review"
  | "stock.low"
  | "stock.out_of_stock"
  | string;

export interface AuditEventContract {
  eventId: string;
  tenantId?: string;
  actorType: "system" | "platform" | "tenant_staff" | "customer";
  actorId?: string;
  actorName?: string;
  action: AuditEventAction;
  targetType: string;
  targetId?: string;
  workOrderId?: string;
  taskId?: string;
  branchId?: string;
  warehouseId?: string;
  category?: CategoryCode;
  before?: unknown;
  after?: unknown;
  timestamp: string;
}
