import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { OperationEventsModule } from "../../operations/operation-events.module";
import { TeamLeaderController } from "./team-leader.controller";
import { TeamLeaderService } from "./team-leader.service";

@Module({
  imports: [AuthModule, OperationEventsModule],
  controllers: [TeamLeaderController],
  providers: [TeamLeaderService]
})
export class TeamLeaderModule {}
