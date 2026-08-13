import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { DatabaseModule } from "../database/database.module";
import { HeartbeatJob } from "./heartbeat.job";
import { SchedulerLockService } from "./scheduler-lock.service";

@Module({
  imports: [ScheduleModule.forRoot(), DatabaseModule],
  providers: [HeartbeatJob, SchedulerLockService],
  exports: [HeartbeatJob, SchedulerLockService],
})
export class SchedulerModule {}
