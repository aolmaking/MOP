import { BadRequestException, Injectable } from "@nestjs/common";
import type { StockMovementContract, WarehouseStockContract } from "@mop/shared";

@Injectable()
export class InventoryLedgerService {
  movement(input: {
    balance: WarehouseStockContract;
    type: string;
    quantity: number;
    direction: "in" | "out" | "neutral";
    source?: string;
    reason?: string;
    createdBy?: string;
  }): StockMovementContract {
    if (input.quantity <= 0) throw new BadRequestException("Stock movement quantity must be positive.");
    const beforeQty = input.balance.availableQty;
    const afterQty = input.direction === "in" ? beforeQty + input.quantity : input.direction === "out" ? beforeQty - input.quantity : beforeQty;
    if (afterQty < 0) throw new BadRequestException("Stock movement would create negative available quantity.");
    return {
      warehouseId: input.balance.warehouseId,
      itemId: input.balance.itemId,
      type: input.type,
      quantity: input.quantity,
      beforeQty,
      afterQty,
      source: input.source,
      reason: input.reason,
      createdBy: input.createdBy
    };
  }

  apply(balance: WarehouseStockContract, movement: StockMovementContract): WarehouseStockContract {
    return { ...balance, availableQty: movement.afterQty };
  }
}
