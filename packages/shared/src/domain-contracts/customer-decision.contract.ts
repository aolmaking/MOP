import type { CategoryCode, CustomerDecisionImportance } from "../contracts";

export interface CreateCustomerDecisionInput {
  workOrderId: string;
  taskId?: string;
  assetId: string;
  customerId: string;
  createdByStaffUserId: string;
  category?: CategoryCode;
  source: "technician_task" | "inspection_finding" | "work_order";
  items: Array<{
    title: string;
    customerExplanation: string;
    importance: CustomerDecisionImportance;
    estimatedPrice: number;
    criticalWarningRequired?: boolean;
    criticalWarningText?: string;
  }>;
}

export interface CustomerDecisionResponseInput {
  decisionRequestId: string;
  customerId: string;
  decisions: Array<{
    itemId: string;
    decision: "approved" | "rejected";
    warningAcknowledged?: boolean;
    note?: string;
  }>;
  customerNote?: string;
}

export interface CustomerDecisionContractResult {
  decisionRequestId: string;
  status: "draft" | "sent" | "viewed" | "responded" | "expired" | "cancelled";
  criticalRejected: boolean;
  auditEvent: string;
}
