import { BadRequestException, Injectable } from "@nestjs/common";

export interface WarehouseAccessOption {
  warehouseId: string;
  warehouseName?: string;
  accessType: "PRIMARY" | "BACKUP" | "SHARED" | "TRANSFER_ONLY";
  priority: number;
  availableQty?: number;
}

@Injectable()
export class WarehouseResolutionService {
  resolveForIssue(options: WarehouseAccessOption[], requestedWarehouseId?: string) {
    const sorted = [...options].sort((a, b) => a.priority - b.priority);
    if (requestedWarehouseId) {
      const selected = sorted.find((option) => option.warehouseId === requestedWarehouseId);
      if (!selected) throw new BadRequestException("Warehouse is outside branch or inventory scope.");
      if (selected.accessType === "TRANSFER_ONLY") throw new BadRequestException("Warehouse is transfer-only for this branch.");
      return selected;
    }
    const available = sorted.find((option) => option.accessType !== "TRANSFER_ONLY" && (option.availableQty ?? 0) > 0);
    if (!available) throw new BadRequestException("No accessible warehouse has available stock.");
    return available;
  }
}
