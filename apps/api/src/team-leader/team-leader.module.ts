import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { AccessModule } from "../access/access.module";
import { TeamLeaderController } from "./team-leader.controller";
import { TeamLeaderService } from "./team-leader.service";

@Module({
  imports: [DatabaseModule, AuthModule, AccessModule],
  controllers: [TeamLeaderController],
  providers: [TeamLeaderService],
})
export class TeamLeaderModule {}
