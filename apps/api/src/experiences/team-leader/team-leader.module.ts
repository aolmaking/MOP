import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../runtime/database/database.module";
import { AuthModule } from "../../identity/auth/auth.module";
import { AccessModule } from "../../identity/access/access.module";
import { WorkshopHistoryModule } from "../../systems/operations/history/history.module";
import { OperationsModule } from "../../systems/operations/operations.module";
import { TeamLeaderController } from "./team-leader.controller";
import { TeamLeaderService } from "./team-leader.service";

@Module({
  imports: [DatabaseModule, AuthModule, AccessModule, WorkshopHistoryModule, OperationsModule],
  controllers: [TeamLeaderController],
  providers: [TeamLeaderService],
})
export class TeamLeaderModule {}
