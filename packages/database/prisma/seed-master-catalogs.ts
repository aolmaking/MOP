import { PrismaClient, type CategoryCode, Prisma } from "../generated/client";
import { CARS_CATEGORIES, CARS_ATTRIBUTES, CARS_ITEMS, CARS_SERVICES } from "../../../apps/api/src/systems/inventory/master-catalog/cars-catalog.dataset";
import { MOTORCYCLES_CATEGORIES, MOTORCYCLES_ATTRIBUTES, MOTORCYCLES_ITEMS, MOTORCYCLES_SERVICES } from "../../../apps/api/src/systems/inventory/master-catalog/motorcycles-catalog.dataset";
import { HEAVY_EQUIPMENT_CATEGORIES, HEAVY_EQUIPMENT_ATTRIBUTES, HEAVY_EQUIPMENT_ITEMS, HEAVY_EQUIPMENT_SERVICES } from "../../../apps/api/src/systems/inventory/master-catalog/heavy-equipment-catalog.dataset";

const prisma = new PrismaClient();

async function main() {
  console.log("=== Seeding / Upgrading Master Catalogs for All Workshops ===");

  const tenants = await prisma.tenant.findMany({
    select: { id: true, name: true, slug: true, primaryCategory: true },
  });

  console.log(`Found ${tenants.length} tenants in database.`);

  for (const tenant of tenants) {
    if (tenant.slug === "titan-diesel-hub" && tenant.primaryCategory !== "HEAVY_EQUIPMENT") {
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: { primaryCategory: "HEAVY_EQUIPMENT" },
      });
      (tenant as any).primaryCategory = "HEAVY_EQUIPMENT";
      console.log(`  Updated tenant ${tenant.slug} primaryCategory to HEAVY_EQUIPMENT`);
    }

    console.log(`\nProcessing Tenant: ${tenant.name} (${tenant.slug}) - Category: ${tenant.primaryCategory}`);

    let categories = CARS_CATEGORIES;
    let attributes = CARS_ATTRIBUTES;
    let items = CARS_ITEMS;
    let services = CARS_SERVICES;

    if (tenant.primaryCategory === "MOTORCYCLES") {
      categories = MOTORCYCLES_CATEGORIES;
      attributes = MOTORCYCLES_ATTRIBUTES;
      items = MOTORCYCLES_ITEMS;
      services = MOTORCYCLES_SERVICES;
    } else if (tenant.primaryCategory === "HEAVY_EQUIPMENT") {
      categories = HEAVY_EQUIPMENT_CATEGORIES;
      attributes = HEAVY_EQUIPMENT_ATTRIBUTES;
      items = HEAVY_EQUIPMENT_ITEMS;
      services = HEAVY_EQUIPMENT_SERVICES;
    }

    // Resolve or create warehouse
    let warehouse = await prisma.warehouse.findFirst({
      where: { tenantId: tenant.id },
      orderBy: { id: "asc" },
    });

    if (!warehouse) {
      warehouse = await prisma.warehouse.create({
        data: {
          tenantId: tenant.id,
          name: "Main Parts Warehouse",
          code: "MAIN-WH",
        },
      });
      console.log(`  Created default warehouse for ${tenant.name}`);
    }

    // 1. Categories
    const categoryIdBySlug = new Map<string, string>();
    for (const cat of categories) {
      let root = await prisma.catalogCategory.findUnique({
        where: { tenantId_slug: { tenantId: tenant.id, slug: cat.slug } },
      });
      if (!root) {
        root = await prisma.catalogCategory.create({
          data: {
            tenantId: tenant.id,
            name: cat.name,
            slug: cat.slug,
            description: cat.description,
            sortOrder: cat.sortOrder,
            isActive: true,
            technicianVisible: true,
          },
        });
      }
      categoryIdBySlug.set(cat.slug, root.id);

      for (const sub of cat.subcategories) {
        let subRow = await prisma.catalogCategory.findUnique({
          where: { tenantId_slug: { tenantId: tenant.id, slug: sub.slug } },
        });
        if (!subRow) {
          subRow = await prisma.catalogCategory.create({
            data: {
              tenantId: tenant.id,
              name: sub.name,
              slug: sub.slug,
              description: sub.description,
              sortOrder: sub.sortOrder,
              parentId: root.id,
              isActive: true,
              technicianVisible: true,
            },
          });
        }
        categoryIdBySlug.set(sub.slug, subRow.id);
      }
    }
    console.log(`  Categories processed.`);

    // 2. Attributes & Values
    const attributeValueIdByPair = new Map<string, string>();
    const attributeIdByKey = new Map<string, string>();

    for (const attr of attributes) {
      let attrRow = await prisma.catalogAttribute.findUnique({
        where: { tenantId_key: { tenantId: tenant.id, key: attr.key } },
      });
      if (!attrRow) {
        attrRow = await prisma.catalogAttribute.create({
          data: {
            tenantId: tenant.id,
            key: attr.key,
            label: attr.label,
            showOnCard: attr.showOnCard,
            sortOrder: attr.sortOrder,
            isActive: true,
          },
        });
      }
      attributeIdByKey.set(attr.key, attrRow.id);

      for (const val of attr.values) {
        let valRow = await prisma.catalogAttributeValue.findUnique({
          where: { attributeId_value: { attributeId: attrRow.id, value: val.value } },
        });
        if (!valRow) {
          valRow = await prisma.catalogAttributeValue.create({
            data: {
              tenantId: tenant.id,
              attributeId: attrRow.id,
              value: val.value,
              label: val.label,
              sortOrder: val.sortOrder,
              isActive: true,
            },
          });
        }
        attributeValueIdByPair.set(`${attr.key}:${val.value}`, valRow.id);
      }

      for (const catSlug of attr.applicableCategorySlugs) {
        const catId = categoryIdBySlug.get(catSlug);
        if (catId) {
          const existingLink = await prisma.catalogCategoryAttribute.findUnique({
            where: { categoryId_attributeId: { categoryId: catId, attributeId: attrRow.id } },
          });
          if (!existingLink) {
            await prisma.catalogCategoryAttribute.create({
              data: {
                tenantId: tenant.id,
                categoryId: catId,
                attributeId: attrRow.id,
                sortOrder: attr.sortOrder,
              },
            });
          }
        }
      }
    }
    console.log(`  Attributes & filter bindings processed.`);

    // 3. Items & Stock Balances
    let itemsAdded = 0;
    for (const item of items) {
      const categoryId = categoryIdBySlug.get(item.categorySlug) ?? null;

      let itemRow = await prisma.inventoryItem.findUnique({
        where: { tenantId_sku: { tenantId: tenant.id, sku: item.sku } },
      });

      if (!itemRow) {
        itemRow = await prisma.inventoryItem.create({
          data: {
            tenantId: tenant.id,
            sku: item.sku,
            name: item.name,
            itemType: item.itemType,
            catalogCategoryId: categoryId,
            compatibleCategories: [tenant.primaryCategory],
            sellingPrice: new Prisma.Decimal(item.sellingPrice),
            cost: new Prisma.Decimal(item.cost),
            workOrderUsable: true,
            posVisible: true,
            stockTracked: item.stockTracked,
            barcode: item.barcode,
            supplier: item.supplier,
            summary: item.summary,
            notes: `Master catalog item for ${tenant.primaryCategory}`,
          },
        });
        itemsAdded++;

        for (const pair of item.attributeValueKeys) {
          const valId = attributeValueIdByPair.get(`${pair.attributeKey}:${pair.value}`);
          const attrId = attributeIdByKey.get(pair.attributeKey);
          if (valId && attrId) {
            await prisma.inventoryItemAttributeValue.create({
              data: {
                tenantId: tenant.id,
                inventoryItemId: itemRow.id,
                attributeId: attrId,
                valueId: valId,
              },
            });
          }
        }
      }

      if (warehouse && item.stockTracked) {
        const existingStock = await prisma.warehouseStockBalance.findUnique({
          where: {
            inventoryItemId_warehouseId: {
              inventoryItemId: itemRow.id,
              warehouseId: warehouse.id,
            },
          },
        });

        if (!existingStock) {
          const initialQty = Math.max(item.initialStockQty, 0);
          await prisma.warehouseStockBalance.create({
            data: {
              tenantId: tenant.id,
              inventoryItemId: itemRow.id,
              warehouseId: warehouse.id,
              availableQty: initialQty,
              reservedQty: 0,
              issuedQty: 0,
              returnPendingQty: 0,
              damagedQty: 0,
            },
          });

          if (initialQty > 0) {
            await prisma.stockMovement.create({
              data: {
                tenantId: tenant.id,
                inventoryItemId: itemRow.id,
                warehouseId: warehouse.id,
                type: "SUPPLIER_RECEIPT",
                quantity: initialQty,
                beforeQty: 0,
                afterQty: initialQty,
                referenceType: "INITIAL_PROVISIONING",
                referenceId: `seed_${item.sku}`,
                actorId: "seed-script",
              },
            });
          }
        }
      }
    }
    console.log(`  Items & Stock processed: ${itemsAdded} new items.`);

    // 4. Services
    let servicesAdded = 0;
    for (const srv of services) {
      const existing = await prisma.priceCatalogEntry.findFirst({
        where: { tenantId: tenant.id, itemKey: srv.itemKey, isActive: true },
      });
      if (!existing) {
        await prisma.priceCatalogEntry.create({
          data: {
            tenantId: tenant.id,
            itemKey: srv.itemKey,
            itemType: "SERVICE",
            unitPrice: new Prisma.Decimal(srv.unitPrice),
            laborPrice: new Prisma.Decimal(srv.laborPrice),
            isActive: true,
          },
        });
        servicesAdded++;
      }
    }
    console.log(`  Services processed: ${servicesAdded} new price catalog entries.`);
  }

  console.log("\n=== Master Catalog Seeding Complete! ===");
}

main()
  .catch((e) => {
    console.error("Seeding error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
