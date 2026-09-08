import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../runtime/database/database.module";
import { OperationsModule } from "../../systems/operations/operations.module";
import { InventoryModule } from "../../systems/inventory/inventory.module";
import { AccessModule } from "../../identity/access/access.module";
import { AuthModule } from "../../identity/auth/auth.module";
import { OperatorController } from "./operator.controller";
import { OperatorService } from "./operator.service";

@Module({
  imports: [
    DatabaseModule,
    OperationsModule,
    InventoryModule,
    AccessModule,
    AuthModule,
  ],
  controllers: [OperatorController],
  providers: [OperatorService],
  exports: [OperatorService],
})
export class OperatorModule {}
