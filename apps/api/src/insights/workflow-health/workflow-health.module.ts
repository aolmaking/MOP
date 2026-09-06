import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../runtime/database/database.module";
import { AuthModule } from "../../identity/auth/auth.module";
import { AccessModule } from "../../identity/access/access.module";
import { AnalyticsModule } from "../analytics/analytics.module";
import { WorkflowHealthController } from "./workflow-health.controller";
import { WorkflowIntegrityService } from "./workflow-integrity.service";
import { WorkflowBottlenecksService } from "./workflow-bottlenecks.service";

@Module({
  imports: [DatabaseModule, AuthModule, AccessModule, AnalyticsModule],
  controllers: [WorkflowHealthController],
  providers: [WorkflowIntegrityService, WorkflowBottlenecksService],
})
export class WorkflowHealthModule {}
