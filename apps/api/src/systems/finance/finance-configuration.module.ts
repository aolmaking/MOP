import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../runtime/database/database.module";
import { AuditModule } from "../../audit/audit.module";
import { AuthModule } from "../../identity/auth/auth.module";
import { AccessModule } from "../../identity/access/access.module";
import { FinanceConfigurationController } from "./finance-configuration.controller";
import { FinanceConfigurationService } from "./finance-configuration.service";
import { PriceCatalogService } from "./price-catalog.service";

/**
 * The workshop's finance settings, as a leaf.
 *
 * Extracted for the same reason `StockModule` was: two places outside Finance
 * need one thing from it, and importing the whole of Finance to get it would
 * point Inventory at the system that prices things -- which the module graph
 * deliberately forbids in that direction.
 *
 * What they need is `technicianPriceVisible`. The technician's parts catalogue
 * and the storekeeper's preview of that catalogue must answer identically,
 * because the preview's entire job is showing what the technician will see; a
 * preview that reads the setting differently is the exact lie it exists to
 * prevent. So the setting is read from one service, by both, through a module
 * that depends on nothing but the database and the audit log.
 */
@Module({
  imports: [DatabaseModule, AuditModule, AuthModule, AccessModule],
  controllers: [FinanceConfigurationController],
  providers: [FinanceConfigurationService, PriceCatalogService],
  exports: [FinanceConfigurationService, PriceCatalogService],
})
export class FinanceConfigurationModule {}
