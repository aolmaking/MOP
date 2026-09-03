import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@mop/database";
import { PrismaService } from "../../runtime/database/prisma.service";

export interface CatalogItem {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly itemType: string;
  /** The configured category, or null while nobody has filed it. */
  readonly catalogCategoryId: string | null;
  readonly categoryName: string | null;
  readonly compatibleCategories: readonly string[];
  readonly lowStockThreshold: number;
  readonly criticalStockThreshold: number;
  /** Money as a string, always. */
  readonly sellingPrice: string;
  /** Absent unless this reader may see cost -- see the note on list(). */
  readonly cost: string | null;
  readonly workOrderUsable: boolean;
  readonly posVisible: boolean;
  readonly stockTracked: boolean;
  readonly barcode: string | null;
  readonly supplier: string | null;
  readonly notes: string | null;
  readonly imageUrl: string | null;
  readonly summary: string | null;
  /** The configured filter values stamped on this part. */
  readonly attributeValueIds: readonly string[];
  /** Summed across warehouses purely for the list column. */
  readonly onHand: number;
}

export interface CatalogPage {
  readonly items: readonly CatalogItem[];
  readonly total: number;
  /**
   * The workshop's configured categories, flat, for the list's own
   * filter control. The full tree with its filter assignments lives on
   * the configuration endpoint -- this is the picker, not the editor.
   */
  readonly categories: readonly { id: string; name: string; parentId: string | null; isActive: boolean }[];
}

export interface CatalogFilters {
  readonly query?: string;
  readonly categoryId?: string;
  /** "none" is a real choice: the items nobody has filed yet. */
  readonly uncategorised?: boolean;
  readonly stockTracked?: boolean;
  readonly workOrderUsable?: boolean;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface CatalogInput {
  readonly sku: string;
  readonly name: string;
  readonly itemType: string;
  readonly catalogCategoryId?: string | null;
  readonly compatibleCategories?: readonly string[];
  readonly lowStockThreshold?: number;
  readonly criticalStockThreshold?: number;
  readonly sellingPrice: string;
  readonly cost?: string;
  readonly workOrderUsable?: boolean;
  readonly posVisible?: boolean;
  readonly stockTracked?: boolean;
  readonly barcode?: string;
  readonly supplier?: string;
  readonly notes?: string;
  readonly imageUrl?: string;
  readonly summary?: string;
  /**
   * The filter values this part carries, set as a whole. Replacing the
   * set rather than patching it is what makes "I removed Toyota" a
   * thing the manager can actually do in one save.
   */
  readonly attributeValueIds?: readonly string[];
}

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

/**
 * Catalog Control -- item master data.
 *
 * Despite the spec's inherited name, this is not a cashier's POS. It is
 * where an item's identity, pricing and thresholds live.
 *
 * The line this service holds: **a catalog entry describes an item, not a
 * shelf.** Quantity is deliberately absent from every write path here,
 * because stock is a balance produced by movements and owned by
 * StockService. A catalog form that could set a quantity would be a
 * second way to change stock without a movement, which is the one thing
 * Phase 7 exists to prevent.
 */
@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Server-side paginated, per the spec's discipline for every list.
   *
   * `maySeeCost` is passed in rather than read here: the permission check
   * belongs to the controller, and a service that decided visibility for
   * itself would eventually be called from somewhere that forgot to ask.
   */
  async list(tenantId: string, filters: CatalogFilters, maySeeCost: boolean): Promise<CatalogPage> {
    const pageSize = Math.min(Math.max(filters.pageSize ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const page = Math.max(filters.page ?? 1, 1);
    const query = filters.query?.trim();

    const where: Prisma.InventoryItemWhereInput = {
      tenantId,
      ...(filters.uncategorised
        ? { catalogCategoryId: null }
        : filters.categoryId
          ? { catalogCategoryId: filters.categoryId }
          : {}),
      ...(filters.stockTracked !== undefined ? { stockTracked: filters.stockTracked } : {}),
      ...(filters.workOrderUsable !== undefined ? { workOrderUsable: filters.workOrderUsable } : {}),
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" as const } },
              { sku: { contains: query, mode: "insensitive" as const } },
              { barcode: { contains: query, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [rows, total, categories] = await Promise.all([
      this.prisma.inventoryItem.findMany({
        where,
        orderBy: { name: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          catalogCategory: { select: { id: true, name: true } },
          attributeValues: { select: { valueId: true } },
          stockBalances: { select: { availableQty: true } },
        },
      }),
      this.prisma.inventoryItem.count({ where }),
      this.prisma.catalogCategory.findMany({
        where: { tenantId },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true, parentId: true, isActive: true },
      }),
    ]);

    return {
      items: rows.map((row) => this.toItem(row, maySeeCost)),
      total,
      categories,
    };
  }

  async get(tenantId: string, id: string, maySeeCost: boolean): Promise<CatalogItem> {
    const row = await this.prisma.inventoryItem.findFirst({
      where: { id, tenantId },
      include: {
        catalogCategory: { select: { id: true, name: true } },
        attributeValues: { select: { valueId: true } },
        stockBalances: { select: { availableQty: true } },
      },
    });
    if (!row) throw new NotFoundException({ code: "item_not_found", message: "That item is not in this workshop." });
    return this.toItem(row, maySeeCost);
  }

  async create(tenantId: string, input: CatalogInput, maySeeCost: boolean): Promise<CatalogItem> {
    await this.requireFreeSku(tenantId, input.sku);
    await this.requireOwnedCategory(tenantId, input.catalogCategoryId);
    const values = await this.requireOwnedValues(tenantId, input.attributeValueIds);

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.inventoryItem.create({ data: this.toData(tenantId, input) });
      if (values.length > 0) {
        await tx.inventoryItemAttributeValue.createMany({
          data: values.map((value) => ({
            tenantId,
            inventoryItemId: created.id,
            attributeId: value.attributeId,
            valueId: value.id,
          })),
        });
      }
      return tx.inventoryItem.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          catalogCategory: { select: { id: true, name: true } },
          attributeValues: { select: { valueId: true } },
          stockBalances: { select: { availableQty: true } },
        },
      });
    });

    return this.toItem(row, maySeeCost);
  }

  async update(tenantId: string, id: string, input: CatalogInput, maySeeCost: boolean): Promise<CatalogItem> {
    const existing = await this.prisma.inventoryItem.findFirst({ where: { id, tenantId }, select: { sku: true } });
    if (!existing) {
      throw new NotFoundException({ code: "item_not_found", message: "That item is not in this workshop." });
    }
    if (input.sku !== existing.sku) await this.requireFreeSku(tenantId, input.sku);
    await this.requireOwnedCategory(tenantId, input.catalogCategoryId);
    const values = await this.requireOwnedValues(tenantId, input.attributeValueIds);

    const row = await this.prisma.$transaction(async (tx) => {
      await tx.inventoryItem.update({ where: { id }, data: this.toData(tenantId, input) });

      // Replaced wholesale, and only when the caller said something
      // about attributes at all: an update that omits the field is
      // editing a price, not silently stripping the part's filters.
      if (input.attributeValueIds !== undefined) {
        await tx.inventoryItemAttributeValue.deleteMany({ where: { tenantId, inventoryItemId: id } });
        if (values.length > 0) {
          await tx.inventoryItemAttributeValue.createMany({
            data: values.map((value) => ({
              tenantId,
              inventoryItemId: id,
              attributeId: value.attributeId,
              valueId: value.id,
            })),
          });
        }
      }

      return tx.inventoryItem.findUniqueOrThrow({
        where: { id },
        include: {
          catalogCategory: { select: { id: true, name: true } },
          attributeValues: { select: { valueId: true } },
          stockBalances: { select: { availableQty: true } },
        },
      });
    });

    return this.toItem(row, maySeeCost);
  }

  /**
   * Refused rather than silently suffixed. A SKU is how a storekeeper
   * finds a thing on a shelf, and quietly turning "BRK-01" into
   * "BRK-01-2" produces two items nobody can tell apart.
   */
  private async requireFreeSku(tenantId: string, sku: string): Promise<void> {
    const clash = await this.prisma.inventoryItem.findFirst({
      where: { tenantId, sku: sku.trim() },
      select: { id: true, name: true },
    });
    if (clash) {
      throw new ConflictException({
        code: "sku_taken",
        message: `That SKU is already used by "${clash.name}".`,
      });
    }
  }

  /**
   * A category id from another workshop is refused, not ignored. Filing
   * a part under someone else's category would be a tenancy leak
   * disguised as a typo, and silently nulling it would leave the manager
   * looking at an item they believe they filed.
   */
  private async requireOwnedCategory(tenantId: string, categoryId: string | null | undefined): Promise<void> {
    if (!categoryId) return;
    const owned = await this.prisma.catalogCategory.count({ where: { id: categoryId, tenantId } });
    if (owned === 0) {
      throw new BadRequestException({ code: "category_not_found", message: "That category is not in this workshop." });
    }
  }

  private async requireOwnedValues(
    tenantId: string,
    valueIds: readonly string[] | undefined,
  ): Promise<{ id: string; attributeId: string }[]> {
    const wanted = [...new Set(valueIds ?? [])];
    if (wanted.length === 0) return [];

    const rows = await this.prisma.catalogAttributeValue.findMany({
      where: { tenantId, id: { in: wanted } },
      select: { id: true, attributeId: true },
    });
    if (rows.length !== wanted.length) {
      throw new BadRequestException({
        code: "attribute_value_not_found",
        message: "One of those filter values is not in this workshop.",
      });
    }
    return rows;
  }

  private toData(tenantId: string, input: CatalogInput) {
    return {
      tenantId,
      sku: input.sku.trim(),
      name: input.name.trim(),
      itemType: input.itemType,
      catalogCategoryId: input.catalogCategoryId || null,
      // Entered once for every category it fits, never duplicated per
      // category -- the spec is explicit about this.
      compatibleCategories: (input.compatibleCategories ?? []) as never,
      lowStockThreshold: input.lowStockThreshold ?? 0,
      criticalStockThreshold: input.criticalStockThreshold ?? 0,
      sellingPrice: input.sellingPrice,
      cost: input.cost ?? null,
      workOrderUsable: input.workOrderUsable ?? true,
      posVisible: input.posVisible ?? true,
      stockTracked: input.stockTracked ?? true,
      barcode: input.barcode?.trim() || null,
      supplier: input.supplier?.trim() || null,
      notes: input.notes?.trim() || null,
      imageUrl: input.imageUrl?.trim() || null,
      summary: input.summary?.trim() || null,
    };
  }

  private toItem(
    row: {
      id: string;
      sku: string;
      name: string;
      itemType: string;
      catalogCategoryId: string | null;
      catalogCategory: { id: string; name: string } | null;
      attributeValues: { valueId: string }[];
      compatibleCategories: string[];
      lowStockThreshold: number;
      criticalStockThreshold: number;
      sellingPrice: Prisma.Decimal;
      cost: Prisma.Decimal | null;
      workOrderUsable: boolean;
      posVisible: boolean;
      stockTracked: boolean;
      barcode: string | null;
      supplier: string | null;
      notes: string | null;
      imageUrl: string | null;
      summary: string | null;
      stockBalances: { availableQty: number }[];
    },
    maySeeCost: boolean,
  ): CatalogItem {
    return {
      id: row.id,
      sku: row.sku,
      name: row.name,
      itemType: row.itemType,
      catalogCategoryId: row.catalogCategoryId,
      categoryName: row.catalogCategory?.name ?? null,
      compatibleCategories: row.compatibleCategories,
      lowStockThreshold: row.lowStockThreshold,
      criticalStockThreshold: row.criticalStockThreshold,
      sellingPrice: row.sellingPrice.toFixed(2),
      // ABSENT, not blanked. Restricted data is left out of the response
      // rather than hidden client-side -- anyone can open developer tools.
      cost: maySeeCost && row.cost ? row.cost.toFixed(2) : null,
      workOrderUsable: row.workOrderUsable,
      posVisible: row.posVisible,
      stockTracked: row.stockTracked,
      barcode: row.barcode,
      supplier: row.supplier,
      notes: row.notes,
      imageUrl: row.imageUrl,
      summary: row.summary,
      attributeValueIds: row.attributeValues.map((entry) => entry.valueId),
      // money-lint-ok: a count of physical objects, not a currency amount.
      onHand: row.stockBalances.reduce((sum, balance) => sum + balance.availableQty, 0),
    };
  }
}
