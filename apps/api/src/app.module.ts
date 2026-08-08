import { join } from "node:path";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DatabaseModule } from "./database/database.module";
import { AuditModule } from "./audit/audit.module";
import { OperationEventsModule } from "./operations/operation-events.module";
import { AuthModule } from "./auth/auth.module";
import { AccessModule } from "./access/access.module";
import { SchedulerModule } from "./scheduler/scheduler.module";
import { PlatformModule } from "./platform/platform.module";
import { HealthController } from "./health/health.controller";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(__dirname, "..", "..", "..", ".env"),
    }),
    DatabaseModule,
    AuditModule,
    OperationEventsModule,
    AuthModule,
    AccessModule,
    SchedulerModule,
    PlatformModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
