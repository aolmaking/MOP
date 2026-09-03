import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../../runtime/database/database.module";
import { VehicleHistoryModule } from "../vehicle-history/vehicle-history.module";
import { WorkshopHistoryService } from "./workshop-history.service";

/**
 * The workshop's operational memory, as a leaf module.
 *
 * Database + the existing vehicle-history builder, and nothing else. It
 * is imported by the Owner and Technician experiences, which is exactly
 * the shape P-81 already established for `VehicleHistoryModule`: one
 * history builder, reused by every role that legitimately needs it,
 * never one per consumer.
 *
 * Deliberately separate from `OperationsModule`: that module owns the
 * spine that CHANGES work orders, and history may only read. Keeping the
 * read layer out of it means nothing here can quietly acquire the
 * lifecycle service and become a second writer.
 */
@Module({
  imports: [DatabaseModule, VehicleHistoryModule],
  providers: [WorkshopHistoryService],
  exports: [WorkshopHistoryService],
})
export class WorkshopHistoryModule {}
