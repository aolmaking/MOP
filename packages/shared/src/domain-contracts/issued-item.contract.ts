export type IssuedItemLifecycleStatus = "issued" | "in_transit" | "arrived" | "received_by_technician" | "used" | "return_requested" | "returned" | "cancelled";

export interface IssuedItemContract {
  issuedItemId: string;
  requestId: string;
  warehouseId: string;
  itemId: string;
  workOrderId: string;
  taskId?: string;
  technicianId?: string;
  quantity: number;
  status: IssuedItemLifecycleStatus;
  issuedBy?: string;
  issuedAt: string;
  technicianReceivedAt?: string;
  usedAt?: string;
}
