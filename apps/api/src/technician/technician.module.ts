import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { AccessModule } from "../access/access.module";
import { OperationsModule } from "../operations/operations.module";
import { VehicleHistoryModule } from "../vehicle-history/vehicle-history.module";
import { CustomerModule } from "../customer/customer.module";
import { InventoryModule } from "../inventory/inventory.module";
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
