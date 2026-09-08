import { PrismaClient, Prisma } from "../generated/client";
import { CARS_SERVICES } from "../../../apps/api/src/systems/inventory/master-catalog/cars-catalog.dataset";
import { MOTORCYCLES_SERVICES } from "../../../apps/api/src/systems/inventory/master-catalog/motorcycles-catalog.dataset";
import { HEAVY_EQUIPMENT_SERVICES } from "../../../apps/api/src/systems/inventory/master-catalog/heavy-equipment-catalog.dataset";

const prisma = new PrismaClient();

const CURRENT_MASTER_CATALOG_VERSION = 2;

async function runMigration() {
  console.log(`================================================================`);
  console.log(` Starting Master Catalog Migration to Version ${CURRENT_MASTER_CATALOG_VERSION} `);
  console.log(` Non-Destructive Invariant: Tenant custom labor prices are NEVER touched.`);
  console.log(`================================================================\n`);

  const tenants = await prisma.tenant.findMany({
    select: { id: true, name: true, slug: true, primaryCategory: true },
    orderBy: { id: "asc" },
  });

  console.log(`Found ${tenants.length} tenants in database.\n`);

  for (const tenant of tenants) {
    console.log(`--> Processing Tenant: ${tenant.name} (${tenant.slug}) | Category: ${tenant.primaryCategory}`);

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

      const existing = await prisma.priceCatalogEntry.findFirst({
        where: {
          tenantId: tenant.id,
          itemKey: { in: candidateKeys },
          effectiveTo: null,
        },
      });

      if (existing) {
        // Invariant: Custom labor price is preserved!
        customPricesPreserved++;
      } else {
        await prisma.priceCatalogEntry.create({
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

    console.log(`    Catalog v${CURRENT_MASTER_CATALOG_VERSION} Synchronized: ${newServicesCreated} new canonical services added, ${customPricesPreserved} existing/custom prices preserved.`);
  }

  console.log(`\n================================================================`);
  console.log(` Master Catalog Migration Complete! All ${tenants.length} tenants are on v${CURRENT_MASTER_CATALOG_VERSION}`);
  console.log(`================================================================`);
}

runMigration()
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
