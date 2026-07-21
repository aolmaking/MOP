import type { CategoryCode } from "../contracts";
import type { PartRequestLifecycleStatus } from "../lifecycles";

export interface RequestPartInput {
  workOrderId: string;
  taskId: string;
  technicianId: string;
  branchId?: string;
  category: CategoryCode;
  assetIdentifier: string;
  itemId: string;
  quantity: number;
  urgency: "normal" | "high" | "critical";
  reason: string;
}

export interface IssuePartInput {
  requestId: string;
  inventoryManagerId: string;
  warehouseId: string;
  quantity: number;
}

export interface ConfirmPartArrivedInput {
  requestId: string;
  issuedItemId?: string;
  technicianId: string;
}

export interface MarkPartUsedInput {
  requestId: string;
  issuedItemId?: string;
  technicianId: string;
  quantity: number;
}

export interface PartRequestLifecycleResult {
  requestId: string;
  status: PartRequestLifecycleStatus;
  workOrderId: string;
  taskId?: string;
  itemId: string;
  quantity: number;
  auditEvent: string;
}
