import type { CategoryCode } from "../contracts";

export interface InventoryItemContract {
  itemId: string;
  tenantId: string;
  warehouseId: string;
  name: string;
  sku: string;
  barcode?: string;
  category: string;
  subCategory?: string;
  compatibleCategories: CategoryCode[];
  price: number;
  cost?: number;
  posVisible: boolean;
  workOrderUsable: boolean;
  stockTracked: boolean;
  minStock: number;
  criticalStock: number;
  status: "active" | "watch" | "low_stock" | "disabled";
}
