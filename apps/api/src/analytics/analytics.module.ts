import { Module } from "@nestjs/common";
import { DatabaseModule } from "../runtime/database/database.module";
import { AuthModule } from "../identity/auth/auth.module";
import { AccessModule } from "../identity/access/access.module";
import { InventoryModule } from "../systems/inventory/inventory.module";
import { AnalyticsController } from "./analytics.controller";
import { AnalyticsHomeService } from "./analytics-home.service";
import { OperationsAnalyticsService } from "./operations-analytics.service";
import { PeopleAnalyticsService } from "./people-analytics.service";
import { InventoryAnalyticsService } from "./inventory-analytics.service";
import { DecisionsAnalyticsService } from "./decisions-analytics.service";
import { FeatureAdoptionAnalyticsService } from "./feature-adoption-analytics.service";

@Module({
  imports: [DatabaseModule, AuthModule, AccessModule, InventoryModule],
  controllers: [AnalyticsController],
  providers: [
    AnalyticsHomeService,
    OperationsAnalyticsService,
    PeopleAnalyticsService,
    InventoryAnalyticsService,
    DecisionsAnalyticsService,
    FeatureAdoptionAnalyticsService,
  ],
})
export class AnalyticsModule {}
