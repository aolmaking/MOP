import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../runtime/database/prisma.service";
import { CARS_SERVICES, CARS_CATEGORIES } from "./cars-catalog.dataset";
import { MOTORCYCLES_SERVICES, MOTORCYCLES_CATEGORIES } from "./motorcycles-catalog.dataset";
import { HEAVY_EQUIPMENT_SERVICES, HEAVY_EQUIPMENT_CATEGORIES } from "./heavy-equipment-catalog.dataset";
import { Prisma } from "@mop/database";

export const CURRENT_MASTER_CATALOG_VERSION = 2;

export interface TenantCatalogMigrationResult {
  readonly tenantId: string;
  readonly tenantSlug: string;
  readonly primaryCategory: string;
  readonly targetVersion: number;
  readonly newServicesCreated: number;
  readonly customPricesPreserved: number;
  readonly timestamp: string;
}

/**
 * Production Catalog Migration Service:
 * Replaces risky re-seeding scripts with safe, idempotent, non-destructive catalog versioning.
 *
 * Invariants:
 * 1. Workshop-customized labor prices are NEVER overwritten during migration.
 * 2. New canonical services are provisioned with standard flat-rate default prices.
 * 3. Tenant isolation is strictly preserved.
 */
@Injectable()
export class MasterCatalogMigrationService {
  private readonly logger = new Logger(MasterCatalogMigrationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async migrateTenant(tenantId: string): Promise<TenantCatalogMigrationResult> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, slug: true, primaryCategory: true },
    });

    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    const services =
      tenant.primaryCategory === "MOTORCYCLES"
        ? MOTORCYCLES_SERVICES
        : tenant.primaryCategory === "HEAVY_EQUIPMENT"
          ? HEAVY_EQUIPMENT_SERVICES
          : CARS_SERVICES;

    let newServicesCreated = 0;
    let customPricesPreserved = 0;

    for (const srv of services) {
      const candidateKeys = [srv.itemKey, srv.serviceKey, srv.displayName].filter(Boolean) as string[];

      const existing = await this.prisma.priceCatalogEntry.findFirst({
        where: {
          tenantId: tenant.id,
          itemKey: { in: candidateKeys },
          effectiveTo: null,
        },
      });

      if (existing) {
        // INVARIANT: Never overwrite existing workshop labor price!
        customPricesPreserved++;
      } else {
        // Safe to insert newly introduced canonical service
        await this.prisma.priceCatalogEntry.create({
          data: {
            tenantId: tenant.id,
            itemKey: srv.itemKey,
            itemType: "SERVICE",
            unitPrice: new Prisma.Decimal(0), // Part price is 0 for labor
            laborPrice: new Prisma.Decimal(srv.laborPrice),
            isActive: true,
          },
        });
        newServicesCreated++;
      }
    }

    const result: TenantCatalogMigrationResult = {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      primaryCategory: tenant.primaryCategory,
      targetVersion: CURRENT_MASTER_CATALOG_VERSION,
      newServicesCreated,
      customPricesPreserved,
      timestamp: new Date().toISOString(),
    };

    this.logger.log(
      `Migrated tenant ${tenant.slug} to catalog v${CURRENT_MASTER_CATALOG_VERSION}: ${newServicesCreated} added, ${customPricesPreserved} custom prices preserved.`
    );

    return result;
  }

  async migrateAllTenants(): Promise<readonly TenantCatalogMigrationResult[]> {
    const tenants = await this.prisma.tenant.findMany({
      select: { id: true },
      orderBy: { id: "asc" },
    });

    const results: TenantCatalogMigrationResult[] = [];
    for (const t of tenants) {
      const res = await this.migrateTenant(t.id);
      results.push(res);
    }
    return results;
  }
}
