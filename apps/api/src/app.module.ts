import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AccessModule } from "./access/access.module";
import { AuditModule } from "./modules/audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { BranchManagerModule } from "./modules/branch-manager/branch-manager.module";
import { BuilderModule } from "./modules/builder/builder.module";
import { CustomersModule } from "./modules/customers/customers.module";
import { CustomerDecisionsModule } from "./modules/customer-decisions/customer-decisions.module";
import { DatabaseModule } from "./database/database.module";
import { DomainServicesModule } from "./domain/domain-services.module";
import { IdentityModule } from "./modules/identity/identity.module";
import { FinanceModule } from "./modules/finance/finance.module";
import { HealthModule } from "./health/health.module";
import { InventoryModule } from "./modules/inventory/inventory.module";
import { PlatformModule } from "./modules/platform/platform.module";
import { OperationEventsModule } from "./operations/operation-events.module";
import { TechnicianModule } from "./modules/technician/technician.module";
import { TeamLeaderModule } from "./modules/team-leader/team-leader.module";
import { WorkOrdersModule } from "./modules/work-orders/work-orders.module";
import { ReportsModule } from "./modules/reports/reports.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    DomainServicesModule,
    OperationEventsModule,
    AccessModule,
    AuthModule,
    IdentityModule,
    HealthModule,
    FinanceModule,
    BuilderModule,
    BranchManagerModule,
    CustomersModule,
    CustomerDecisionsModule,
    WorkOrdersModule,
    ReportsModule,
    InventoryModule,
    PlatformModule,
    TechnicianModule,
    TeamLeaderModule,
    AuditModule
  ]
})
export class AppModule {}
