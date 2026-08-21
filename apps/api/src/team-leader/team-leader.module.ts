import { Module } from "@nestjs/common";
import { DatabaseModule } from "../runtime/database/database.module";
import { AuthModule } from "../identity/auth/auth.module";
import { AccessModule } from "../identity/access/access.module";
import { VehicleHistoryModule } from "../systems/operations/vehicle-history/vehicle-history.module";
import { TeamLeaderController } from "./team-leader.controller";
import { TeamLeaderService } from "./team-leader.service";

@Module({
  imports: [DatabaseModule, AuthModule, AccessModule, VehicleHistoryModule],
  controllers: [TeamLeaderController],
  providers: [TeamLeaderService],
})
export class TeamLeaderModule {}
