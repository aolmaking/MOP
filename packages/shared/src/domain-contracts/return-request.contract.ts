import type { ReturnLifecycleStatus } from "../lifecycles";

export interface CreateReturnRequestInput {
  issuedItemId: string;
  workOrderId: string;
  taskId?: string;
  technicianId: string;
  warehouseId: string;
  itemId: string;
  quantity: number;
  reason: string;
  condition: "unused" | "opened" | "damaged" | "wrong_item" | "other";
  note?: string;
}

export interface ReviewReturnRequestInput {
  returnRequestId: string;
  inventoryManagerId: string;
  action: "accept_to_stock" | "accept_damaged" | "reject" | "request_clarification";
  note?: string;
}

export interface ReturnRequestLifecycleResult {
  returnRequestId: string;
  status: ReturnLifecycleStatus;
  auditEvent: string;
}
