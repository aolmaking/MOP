import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { AccessModule } from "../access/access.module";
import { InventoryModule } from "../inventory/inventory.module";
import { ReportsController } from "./reports.controller";
import { ReportsOverviewService } from "./reports-overview.service";
import { ReportsOperationsService } from "./reports-operations.service";
import { ReportsFinancialService } from "./reports-financial.service";
import { ReportsInventoryService } from "./reports-inventory.service";
import { ReportsCustomersService } from "./reports-customers.service";

/**
 * Owner's Reports & Analytics. Distinct from `reporting/` (Data
 * Analyst's company-wide report) and `platform/reports/` (Platform
 * Super Admin's view of this workshop as a customer of MOP) -- three
 * different audiences reading overlapping data through different scoping
 * and permission rules, not one report reused three ways.
 */
@Module({
  imports: [DatabaseModule, AuthModule, AccessModule, InventoryModule],
  controllers: [ReportsController],
  providers: [
    ReportsOverviewService,
    ReportsOperationsService,
    ReportsFinancialService,
    ReportsInventoryService,
    ReportsCustomersService,
  ],
})
export class ReportsModule {}
