import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../runtime/database/database.module";
import { AuthModule } from "../../identity/auth/auth.module";
import { AccessModule } from "../../identity/access/access.module";
import { InventoryModule } from "../../systems/inventory/inventory.module";
import { ReportsController } from "./reports.controller";
import { ReportsOverviewService } from "./reports-overview.service";
import { ReportsOperationsService } from "./reports-operations.service";
import { ReportsFinancialService } from "./reports-financial.service";
import { ReportsInventoryService } from "./reports-inventory.service";
import { ReportsCustomersService } from "./reports-customers.service";
import { ActionDeckService } from "./action-deck.service";
import { ReportsLaborService } from "./reports-labor.service";
import { ReportsPipelineService } from "./reports-pipeline.service";
import { ReportsSalesConversionService } from "./reports-sales-conversion.service";

/**
 * Owner's Reports & Analytics. Distinct from `insights/analyst-reporting/`
 * (Data Analyst's company-wide report) and `control/platform/reports/` (Platform
 * Super Admin's view of this workshop as a customer of MOP).
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
    ActionDeckService,
    ReportsLaborService,
    ReportsPipelineService,
    ReportsSalesConversionService,
  ],
})
export class ReportsModule {}
