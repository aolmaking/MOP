import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../runtime/database/database.module";
import { AuthModule } from "../../identity/auth/auth.module";
import { AccessModule } from "../../identity/access/access.module";
import { InventoryModule } from "../../systems/inventory/inventory.module";
import { EntitlementsModule } from "../../control/entitlements/entitlements.module";
import { AnalyticsController } from "./analytics.controller";
import { AnalyticsHomeService } from "./analytics-home.service";
import { OperationsAnalyticsService } from "./operations-analytics.service";
import { PeopleAnalyticsService } from "./people-analytics.service";
import { InventoryAnalyticsService } from "./inventory-analytics.service";
import { DecisionsAnalyticsService } from "./decisions-analytics.service";
import { FeatureAdoptionAnalyticsService } from "./feature-adoption-analytics.service";
import { AnalystSavedViewsService } from "./saved-views.service";
import { AnalyticsExportService } from "./analytics-export.service";

@Module({
  imports: [DatabaseModule, AuthModule, AccessModule, InventoryModule, EntitlementsModule],
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
  ],
})
export class AnalyticsModule {}
