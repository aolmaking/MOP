import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../runtime/database/database.module";
import { AuthModule } from "../../identity/auth/auth.module";
import { AccessModule } from "../../identity/access/access.module";
import { AuditModule } from "../../audit/audit.module";
import { InventoryModule } from "../../systems/inventory/inventory.module";
import { AnalyticsController } from "./analytics.controller";
import { AnalyticsHomeService } from "./analytics-home.service";
import { OperationsAnalyticsService } from "./operations-analytics.service";
import { PeopleAnalyticsService } from "./people-analytics.service";
import { InventoryAnalyticsService } from "./inventory-analytics.service";
import { DecisionsAnalyticsService } from "./decisions-analytics.service";
import { FeatureAdoptionAnalyticsService } from "./feature-adoption-analytics.service";
import { AnalystSavedViewsService } from "./saved-views.service";
import { AnalyticsExportService } from "./analytics-export.service";
import { QualityAnalyticsService } from "./quality-analytics.service";
import { RootCauseAnalysisService } from "./root-cause-analysis.service";
import { UniversalDrillDownService } from "./universal-drill-down.service";
import { QualityDrillDownResolver } from "./resolvers/quality-drill-down.resolver";
import { DecisionDrillDownResolver } from "./resolvers/decision-drill-down.resolver";
import { FinancialDrillDownResolver } from "./resolvers/financial-drill-down.resolver";
import { OperationsDrillDownResolver } from "./resolvers/operations-drill-down.resolver";
import { RootCauseDrillDownResolver } from "./resolvers/root-cause-drill-down.resolver";

@Module({
  imports: [DatabaseModule, AuthModule, AccessModule, AuditModule, InventoryModule],
  controllers: [AnalyticsController],
  providers: [
    AnalyticsHomeService,
    OperationsAnalyticsService,
    PeopleAnalyticsService,
    InventoryAnalyticsService,
    DecisionsAnalyticsService,
    FeatureAdoptionAnalyticsService,
    AnalystSavedViewsService,
    AnalyticsExportService,
    QualityAnalyticsService,
    RootCauseAnalysisService,
    UniversalDrillDownService,
    QualityDrillDownResolver,
    DecisionDrillDownResolver,
    FinancialDrillDownResolver,
    OperationsDrillDownResolver,
    RootCauseDrillDownResolver,
  ],
  exports: [QualityAnalyticsService, RootCauseAnalysisService, UniversalDrillDownService],
})
export class AnalyticsModule {}
