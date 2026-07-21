export interface WarehouseStockContract {
  warehouseId: string;
  itemId: string;
  availableQty: number;
  issuedQty: number;
  returnPendingQty: number;
  damagedQty: number;
  lowThreshold: number;
  criticalThreshold: number;
}

export interface StockMovementContract {
  movementId?: string;
  warehouseId: string;
  itemId: string;
  type: string;
  quantity: number;
  beforeQty: number;
  afterQty: number;
  source?: string;
  reason?: string;
  createdBy?: string;
}
