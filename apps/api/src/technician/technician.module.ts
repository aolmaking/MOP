import { Module } from "@nestjs/common";
import { DatabaseModule } from "../runtime/database/database.module";
import { AuthModule } from "../identity/auth/auth.module";
import { AccessModule } from "../identity/access/access.module";
import { OperationsModule } from "../systems/operations/operations.module";
import { VehicleHistoryModule } from "../systems/operations/vehicle-history/vehicle-history.module";
import { CustomerModule } from "../systems/customer/customer.module";
import { InventoryModule } from "../systems/inventory/inventory.module";
import { TechnicianController } from "./technician.controller";
import { TechnicianWorkViewService } from "./technician-work-view.service";

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    AccessModule,
    OperationsModule,
    VehicleHistoryModule,
    CustomerModule,
    InventoryModule,
  ],
  controllers: [TechnicianController],
  providers: [TechnicianWorkViewService],
})
export class TechnicianModule {}
