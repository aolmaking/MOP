import { join } from "node:path";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DatabaseModule } from "./database/database.module";
import { AuditModule } from "./audit/audit.module";
import { OperationEventsModule } from "./operations/operation-events.module";
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
  ],
  controllers: [HealthController],
})
export class AppModule {}
