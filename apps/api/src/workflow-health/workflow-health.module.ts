import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { AccessModule } from "../access/access.module";
import { WorkflowHealthController } from "./workflow-health.controller";
import { WorkflowIntegrityService } from "./workflow-integrity.service";
import { WorkflowBottlenecksService } from "./workflow-bottlenecks.service";

@Module({
  imports: [DatabaseModule, AuthModule, AccessModule],
  controllers: [WorkflowHealthController],
  providers: [WorkflowIntegrityService, WorkflowBottlenecksService],
})
export class WorkflowHealthModule {}
