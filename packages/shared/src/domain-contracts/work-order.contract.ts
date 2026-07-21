import type { CategoryCode } from "../contracts";

export interface WorkOrderContract {
  workOrderId: string;
  number: string;
  tenantId: string;
  branchId?: string;
  customerId: string;
  assetId: string;
  category: CategoryCode;
  status: string;
  statusLabel: string;
  priority: "low" | "normal" | "high" | "critical";
  total: number;
  paid: number;
  balance: number;
  customerVisible: boolean;
  customerSummary?: string;
}

export interface BranchManagerWorkOrderActionInput {
  workOrderId: string;
  branchManagerId: string;
  action: "assign_technician" | "change_priority" | "send_customer_reminder" | "escalate_blocker" | "record_manual_note" | "approve_cancellation" | "mark_ready_delivery";
  reason?: string;
  payload?: Record<string, unknown>;
}
