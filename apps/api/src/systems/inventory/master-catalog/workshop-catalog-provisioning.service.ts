import { Injectable, Logger } from "@nestjs/common";
import { Prisma, type CategoryCode } from "@mop/database";
import { PrismaService } from "../../../runtime/database/prisma.service";
import {
  CARS_CATEGORIES,
  CARS_ATTRIBUTES,
  CARS_ITEMS,
  CARS_SERVICES,
  type MasterCategoryDef,
  type MasterAttributeDef,
  type MasterItemDef,
  type MasterServiceDef,
} from "./cars-catalog.dataset";
import {
  MOTORCYCLES_CATEGORIES,
  MOTORCYCLES_ATTRIBUTES,
  MOTORCYCLES_ITEMS,
  MOTORCYCLES_SERVICES,
} from "./motorcycles-catalog.dataset";
import {
  HEAVY_EQUIPMENT_CATEGORIES,
  HEAVY_EQUIPMENT_ATTRIBUTES,
  HEAVY_EQUIPMENT_ITEMS,
  HEAVY_EQUIPMENT_SERVICES,
} from "./heavy-equipment-catalog.dataset";

export interface ProvisioningResult {
  readonly categoriesCreated: number;
  readonly attributesCreated: number;
  readonly itemsCreated: number;
  readonly stockBalancesCreated: number;
  readonly servicesCreated: number;
}

@Injectable()
export class WorkshopCatalogProvisioningService {
  private readonly logger = new Logger(WorkshopCatalogProvisioningService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Automatically provisions the complete real master database, categories,
   * filter attributes, real inventory items, realistic stock levels, and
   * standard services for a workshop based on its vehicle category.
   */
  async provisionCatalog(
    tx: Prisma.TransactionClient,
    tenantId: string,
    primaryCategory: CategoryCode,
    warehouseId?: string,
    actorId = "system-provisioning",
  ): Promise<ProvisioningResult> {
    let categories: readonly MasterCategoryDef[];
    let attributes: readonly MasterAttributeDef[];
    let items: readonly MasterItemDef[];
    let services: readonly MasterServiceDef[];

    switch (primaryCategory) {
      case "MOTORCYCLES":
        categories = MOTORCYCLES_CATEGORIES;
        attributes = MOTORCYCLES_ATTRIBUTES;
        items = MOTORCYCLES_ITEMS;
        services = MOTORCYCLES_SERVICES;
        break;
      case "HEAVY_EQUIPMENT":
        categories = HEAVY_EQUIPMENT_CATEGORIES;
        attributes = HEAVY_EQUIPMENT_ATTRIBUTES;
        items = HEAVY_EQUIPMENT_ITEMS;
        services = HEAVY_EQUIPMENT_SERVICES;
        break;
      case "CARS":
      default:
        categories = CARS_CATEGORIES;
        attributes = CARS_ATTRIBUTES;
        items = CARS_ITEMS;
        services = CARS_SERVICES;
        break;
    }

    let categoriesCount = 0;
    let attributesCount = 0;
    let itemsCount = 0;
    let stockBalancesCount = 0;
    let servicesCount = 0;

    // 1. Categories and Subcategories Tree
    const categoryIdBySlug = new Map<string, string>();

    for (const cat of categories) {
      let root = await tx.catalogCategory.findUnique({
        where: { tenantId_slug: { tenantId, slug: cat.slug } },
      });
      if (!root) {
        root = await tx.catalogCategory.create({
          data: {
            tenantId,
            name: cat.name,
            slug: cat.slug,
            description: cat.description,
            sortOrder: cat.sortOrder,
            isActive: true,
            technicianVisible: true,
          },
        });
        categoriesCount++;
      }
      categoryIdBySlug.set(cat.slug, root.id);

      for (const sub of cat.subcategories) {
        let subRow = await tx.catalogCategory.findUnique({
          where: { tenantId_slug: { tenantId, slug: sub.slug } },
        });
        if (!subRow) {
          subRow = await tx.catalogCategory.create({
            data: {
              tenantId,
              name: sub.name,
              slug: sub.slug,
              description: sub.description,
              sortOrder: sub.sortOrder,
              parentId: root.id,
              isActive: true,
              technicianVisible: true,
            },
          });
          categoriesCount++;
        }
        categoryIdBySlug.set(sub.slug, subRow.id);
      }
    }

    // 2. Attributes & Values
    const attributeValueIdByPair = new Map<string, string>(); // "attrKey:value" -> valueId
    const attributeIdByKey = new Map<string, string>();

    for (const attr of attributes) {
      let attrRow = await tx.catalogAttribute.findUnique({
        where: { tenantId_key: { tenantId, key: attr.key } },
      });
      if (!attrRow) {
        attrRow = await tx.catalogAttribute.create({
          data: {
            tenantId,
            key: attr.key,
            label: attr.label,
            showOnCard: attr.showOnCard,
            sortOrder: attr.sortOrder,
            isActive: true,
          },
        });
        attributesCount++;
      }
      attributeIdByKey.set(attr.key, attrRow.id);

      // Values
      for (const val of attr.values) {
        let valRow = await tx.catalogAttributeValue.findUnique({
          where: { attributeId_value: { attributeId: attrRow.id, value: val.value } },
        });
        if (!valRow) {
          valRow = await tx.catalogAttributeValue.create({
            data: {
              tenantId,
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

      // Link attribute to categories
      for (const catSlug of attr.applicableCategorySlugs) {
        const catId = categoryIdBySlug.get(catSlug);
        if (catId) {
          const existingLink = await tx.catalogCategoryAttribute.findUnique({
            where: { categoryId_attributeId: { categoryId: catId, attributeId: attrRow.id } },
          });
          if (!existingLink) {
            await tx.catalogCategoryAttribute.create({
              data: {
                tenantId,
                categoryId: catId,
                attributeId: attrRow.id,
                sortOrder: attr.sortOrder,
              },
            });
          }
        }
      }
    }

    // Resolve target warehouse for stock balances
    let targetWarehouseId = warehouseId;
    if (!targetWarehouseId) {
      const defaultWh = await tx.warehouse.findFirst({
        where: { tenantId },
        orderBy: { id: "asc" },
      });
      targetWarehouseId = defaultWh?.id;
    }

    // 3. Inventory Items & Stock Realism
    for (const item of items) {
      const categoryId = categoryIdBySlug.get(item.categorySlug) ?? null;

      let itemRow = await tx.inventoryItem.findUnique({
        where: { tenantId_sku: { tenantId, sku: item.sku } },
      });

      if (!itemRow) {
        itemRow = await tx.inventoryItem.create({
          data: {
            tenantId,
            sku: item.sku,
            name: item.name,
            itemType: item.itemType,
            catalogCategoryId: categoryId,
            compatibleCategories: [primaryCategory],
            sellingPrice: new Prisma.Decimal(item.sellingPrice),
            cost: new Prisma.Decimal(item.cost),
            workOrderUsable: true,
            posVisible: true,
            stockTracked: item.stockTracked,
            barcode: item.barcode,
            supplier: item.supplier,
            summary: item.summary,
            notes: `Auto-provisioned master item for ${primaryCategory}`,
          },
        });
        itemsCount++;

        // Attach attribute values
        for (const pair of item.attributeValueKeys) {
          const valId = attributeValueIdByPair.get(`${pair.attributeKey}:${pair.value}`);
          const attrId = attributeIdByKey.get(pair.attributeKey);
          if (valId && attrId) {
            await tx.inventoryItemAttributeValue.create({
              data: {
                tenantId,
                inventoryItemId: itemRow.id,
                attributeId: attrId,
                valueId: valId,
              },
            });
          }
        }
      }

      // Stock Balance & Truthful Movements
      if (targetWarehouseId && item.stockTracked) {
        const existingStock = await tx.warehouseStockBalance.findUnique({
          where: {
            inventoryItemId_warehouseId: {
              inventoryItemId: itemRow.id,
              warehouseId: targetWarehouseId,
            },
          },
        });

        if (!existingStock) {
          const initialQty = Math.max(item.initialStockQty, 0);

          await tx.warehouseStockBalance.create({
            data: {
              tenantId,
              inventoryItemId: itemRow.id,
              warehouseId: targetWarehouseId,
              availableQty: initialQty,
              reservedQty: 0,
              issuedQty: 0,
              returnPendingQty: 0,
              damagedQty: 0,
            },
          });
          stockBalancesCount++;

          // Record initial supplier receipt movement if qty > 0 to keep ledger 100% faithful
          if (initialQty > 0) {
            await tx.stockMovement.create({
              data: {
                tenantId,
                inventoryItemId: itemRow.id,
                warehouseId: targetWarehouseId,
                type: "SUPPLIER_RECEIPT",
                quantity: initialQty,
                beforeQty: 0,
                afterQty: initialQty,
                referenceType: "INITIAL_PROVISIONING",
                referenceId: `prov_${item.sku}`,
                actorId,
              },
            });
          }
        }
      }
    }

    // 4. Standard Flat-Rate Services
    for (const service of services) {
      const existingService = await tx.priceCatalogEntry.findFirst({
        where: { tenantId, itemKey: service.itemKey, isActive: true },
      });

      if (!existingService) {
        await tx.priceCatalogEntry.create({
          data: {
            tenantId,
            itemKey: service.itemKey,
            itemType: "SERVICE",
            unitPrice: new Prisma.Decimal(service.unitPrice),
            laborPrice: new Prisma.Decimal(service.laborPrice),
            isActive: true,
          },
        });
        servicesCount++;
      }
    }

    this.logger.log(
      `Provisioned catalog for tenant ${tenantId} (${primaryCategory}): ` +
        `${categoriesCount} categories, ${attributesCount} attributes, ` +
        `${itemsCount} items, ${stockBalancesCount} stock balances, ${servicesCount} services.`,
    );

    return {
      categoriesCreated: categoriesCount,
      attributesCreated: attributesCount,
      itemsCreated: itemsCount,
      stockBalancesCreated: stockBalancesCount,
      servicesCreated: servicesCount,
    };
  }

  /**
   * Standalone helper to ensure any existing tenant in the DB (e.g. Apex Motors)
   * has its master catalog and stock provisioned.
   */
  async ensureTenantCatalogProvisioned(tenantId: string): Promise<ProvisioningResult> {
    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, primaryCategory: true },
      });
      if (!tenant) throw new Error(`Tenant not found: ${tenantId}`);

      const warehouse = await tx.warehouse.findFirst({
        where: { tenantId },
        orderBy: { id: "asc" },
      });

      return this.provisionCatalog(
        tx,
        tenant.id,
        tenant.primaryCategory,
        warehouse?.id,
        "seed-migration",
      );
    });
  }
}
