import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { OperationEventsModule } from "../../operations/operation-events.module";
import { FinanceModule } from "../finance/finance.module";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";

@Module({
  imports: [AuthModule, OperationEventsModule, FinanceModule],
  controllers: [InventoryController],
  providers: [InventoryService]
})
export class InventoryModule {}
