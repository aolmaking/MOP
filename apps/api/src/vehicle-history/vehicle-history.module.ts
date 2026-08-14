import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AssetHistoryService } from "./asset-history.service";

/**
 * A leaf module (database only) -- consumed by Technician, Team Leader,
 * and Branch Manager alike, per P-81
 * (docs/POLICY_DECISION_INVENTORY.md §8.B): one history builder, reused
 * by every role that legitimately needs it, not one per consumer.
 */
@Module({
  imports: [DatabaseModule],
  providers: [AssetHistoryService],
  exports: [AssetHistoryService],
})
export class VehicleHistoryModule {}
