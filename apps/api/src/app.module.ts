import { join } from "node:path";
import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { loadEnvironment } from "./config/environment";
import { DatabaseModule } from "./database/database.module";
import { AuditModule } from "./audit/audit.module";
import { OperationEventsModule } from "./operations/operation-events.module";
import { OperationsModule } from "./operations/operations.module";
import { AuthModule } from "./auth/auth.module";
import { AccessModule } from "./access/access.module";
import { SchedulerModule } from "./scheduler/scheduler.module";
import { PlatformModule } from "./platform/platform.module";
import { BranchManagerModule } from "./branch-manager/branch-manager.module";
import { TechnicianModule } from "./technician/technician.module";
import { InventoryModule } from "./inventory/inventory.module";
import { TeamModule } from "./team/team.module";
import { FinanceModule } from "./finance/finance.module";
import { CustomerModule } from "./customer/customer.module";
import { OwnerModule } from "./owner/owner.module";
import { TeamLeaderModule } from "./team-leader/team-leader.module";
import { ReportingModule } from "./reporting/reporting.module";
import { HealthController } from "./health/health.controller";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(__dirname, "..", "..", "..", ".env"),
    }),
    // Read through the same validated loader the bootstrap uses, so
    // limits can never drift between what starts the app and what guards
    // it. Individual routes tighten this with @Throttle -- see
    // AuthController, where the real exposure is.
    ThrottlerModule.forRootAsync({
      useFactory: () => {
        const { throttle } = loadEnvironment();
        return [{ name: "default", ttl: throttle.globalTtlMs, limit: throttle.globalLimit }];
      },
    }),
    DatabaseModule,
    AuditModule,
    OperationEventsModule,
    OperationsModule,
    AuthModule,
    AccessModule,
    SchedulerModule,
    PlatformModule,
    BranchManagerModule,
    TechnicianModule,
    InventoryModule,
    TeamModule,
    FinanceModule,
    CustomerModule,
    OwnerModule,
    TeamLeaderModule,
    ReportingModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
