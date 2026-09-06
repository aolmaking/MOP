import { Injectable } from "@nestjs/common";
import type { Prisma } from "@mop/database";
import { PrismaService } from "../../runtime/database/prisma.service";

/**
 * One card in a browse result. Deliberately has no `cost` field at all --
 * not a nulled one. The technician surface and the manager's preview
 * share this shape, and a preview that carried margin would leak it the
 * first time someone screen-shared the page.
 */
export interface BrowseCard {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly summary: string | null;
  readonly imageUrl: string | null;
  readonly categoryId: string | null;
  readonly categoryName: string | null;
  /** Money as a string, always. */
  readonly sellingPrice: string;
  readonly stockTracked: boolean;
  readonly onHand: number;
  /** What the card says about the shelf, in one word the UI can style. */
  readonly availability: "IN_STOCK" | "LOW" | "OUT_OF_STOCK" | "NOT_TRACKED";
  /** The configured attributes worth printing under the name. */
  readonly attributes: readonly { attributeId: string; label: string; valueLabel: string }[];
}

export interface BrowseCategoryNode {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly parentId: string | null;
  readonly itemCount: number;
  readonly children: readonly BrowseCategoryNode[];
}

export interface BrowseFilterOption {
  readonly valueId: string;
  readonly value: string;
  readonly label: string;
  /** How many items in the current browse would remain if this were picked. */
  readonly count: number;
  readonly selected: boolean;
}

export interface BrowseFilterDefinition {
  readonly attributeId: string;
  readonly key: string;
  readonly label: string;
  readonly options: readonly BrowseFilterOption[];
}

export interface BrowseResult {
  readonly categories: readonly BrowseCategoryNode[];
  /** Empty until a category is chosen -- see `filtersFor`. */
  readonly filters: readonly BrowseFilterDefinition[];
  readonly items: readonly BrowseCard[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly categoryId: string | null;
  readonly query: string | null;
}

export interface BrowseQuery {
  readonly query?: string;
  readonly categoryId?: string;
  /** attributeId -> chosen valueIds. AND across attributes, OR within one. */
  readonly attributes?: Readonly<Record<string, readonly string[]>>;
  readonly inStockOnly?: boolean;
  readonly page?: number;
  readonly pageSize?: number;
}

const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 96;

/**
 * The catalog as somebody browsing it sees it.
 *
 * This is the ONE query engine behind both the technician's shopping
 * surface and the inventory manager's "what will they see?" preview.
 * Two engines was the obvious shortcut and the wrong one: the preview
 * exists precisely to catch a misconfiguration, and a preview that
 * renders through different code proves nothing about the page it claims
 * to be previewing.
 *
 * What it will not do:
 *
 * - **It never returns cost.** `BrowseCard` has no field for it.
 * - **It never invents taxonomy.** Categories and filters come from what
 *   the inventory manager configured; an empty catalog browses as an
 *   empty catalog rather than falling back to hardcoded categories.
 * - **It reads stock, it does not decide it.** `onHand` is a balance
 *   owned by StockService; nothing here writes one.
 */
@Injectable()
export class CatalogBrowseService {
  constructor(private readonly prisma: PrismaService) {}

  async browse(tenantId: string, input: BrowseQuery): Promise<BrowseResult> {
    const pageSize = Math.min(Math.max(input.pageSize ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const page = Math.max(input.page ?? 1, 1);
    const query = input.query?.trim() || null;

    // A stale or foreign category id must not silently browse the whole
    // workshop: the caller asked for a category, and answering with
    // everything looks like a working filter that is quietly off.
    const category = input.categoryId
      ? await this.prisma.catalogCategory.findFirst({
          where: { id: input.categoryId, tenantId, isActive: true, technicianVisible: true },
          select: { id: true },
        })
      : null;
    const categoryId = category?.id ?? null;
    const categoryIds = categoryId ? await this.withDescendants(tenantId, categoryId) : null;

    const selections = this.normaliseSelections(input.attributes);
    const where = this.itemWhere(tenantId, { query, categoryIds, selections, inStockOnly: input.inStockOnly });

    const [rows, total, categories, filters] = await Promise.all([
      this.prisma.inventoryItem.findMany({
        where,
        orderBy: [{ name: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          catalogCategory: { select: { id: true, name: true } },
          stockBalances: { select: { availableQty: true } },
          attributeValues: {
            include: {
              attribute: { select: { id: true, label: true, showOnCard: true, sortOrder: true, isActive: true } },
              value: { select: { label: true } },
            },
          },
        },
      }),
      this.prisma.inventoryItem.count({ where }),
      this.categoryTree(tenantId, { query, selections, inStockOnly: input.inStockOnly }),
      this.filtersFor(tenantId, { categoryIds, query, selections, inStockOnly: input.inStockOnly }),
    ]);

    return {
      categories,
      filters,
      items: rows.map((row) => this.toCard(row)),
      total,
      page,
      pageSize,
      categoryId,
      query,
    };
  }

  /**
   * One item, for the detail view behind a card.
   *
   * Returns null rather than throwing for another tenant's id: from a
   * browse surface that is the same answer as "no such part", and the
   * distinction is exactly what a probe would be looking for.
   */
  async card(tenantId: string, itemId: string): Promise<BrowseCard | null> {
    const row = await this.prisma.inventoryItem.findFirst({
      where: { id: itemId, tenantId, workOrderUsable: true },
      include: {
        catalogCategory: { select: { id: true, name: true } },
        stockBalances: { select: { availableQty: true } },
        attributeValues: {
          include: {
            attribute: { select: { id: true, label: true, showOnCard: true, sortOrder: true, isActive: true } },
            value: { select: { label: true } },
          },
        },
      },
    });
    return row ? this.toCard(row) : null;
  }

  /**
   * The part of `browse` a cart submission needs: are these ids real,
   * this workshop's, and usable on a work order?
   *
   * Kept here rather than in the controller because "what a technician
   * may put in a cart" and "what a technician may see" have to be the
   * same rule -- if they drift, the catalog shows something the submit
   * refuses, or worse, accepts something it never showed.
   */
  async requestableItems(tenantId: string, itemIds: readonly string[]) {
    return this.prisma.inventoryItem.findMany({
      where: { tenantId, workOrderUsable: true, id: { in: [...itemIds] } },
      select: { id: true, name: true, sku: true, stockTracked: true },
    });
  }

  /**
   * A category and everything under it. One level deep today, but
   * written as a walk so adding a level later does not silently start
   * hiding items filed in a grandchild.
   */
  private async withDescendants(tenantId: string, rootId: string): Promise<string[]> {
    const collected = [rootId];
    let frontier = [rootId];
    for (let depth = 0; depth < 4 && frontier.length > 0; depth += 1) {
      const children = await this.prisma.catalogCategory.findMany({
        where: { tenantId, parentId: { in: frontier }, isActive: true, technicianVisible: true },
        select: { id: true },
      });
      frontier = children.map((child) => child.id).filter((id) => !collected.includes(id));
      collected.push(...frontier);
    }
    return collected;
  }

  private normaliseSelections(
    raw: Readonly<Record<string, readonly string[]>> | undefined,
  ): { attributeId: string; valueIds: string[] }[] {
    if (!raw) return [];
    return Object.entries(raw)
      .map(([attributeId, valueIds]) => ({ attributeId, valueIds: [...new Set(valueIds)].filter(Boolean) }))
      .filter((entry) => entry.valueIds.length > 0);
  }

  /**
   * The item filter, built once and reused for the page, the count, the
   * category tallies and the facet counts -- so all four can never
   * disagree about what "the current browse" means.
   *
   * `skipAttributeId` is what makes the filter panel usable: a facet's
   * own selection is excluded from its own count, so picking "Toyota"
   * does not make every other brand read zero and strand the technician
   * with a filter they cannot back out of.
   */
  private itemWhere(
    tenantId: string,
    ctx: {
      query: string | null;
      categoryIds: string[] | null;
      selections: { attributeId: string; valueIds: string[] }[];
      inStockOnly?: boolean;
      skipAttributeId?: string;
    },
  ): Prisma.InventoryItemWhereInput {
    const attributeClauses = ctx.selections
      .filter((entry) => entry.attributeId !== ctx.skipAttributeId)
      .map((entry) => ({ attributeValues: { some: { valueId: { in: entry.valueIds } } } }));

    return {
      tenantId,
      // The technician surface is for putting parts on a job, so an item
      // the workshop marked unusable on a work order is not merely
      // greyed out -- it is not in the result at all.
      workOrderUsable: true,
      ...(ctx.categoryIds ? { catalogCategoryId: { in: ctx.categoryIds } } : {}),
      ...(ctx.inStockOnly
        ? { OR: [{ stockTracked: false }, { stockBalances: { some: { availableQty: { gt: 0 } } } }] }
        : {}),
      ...(ctx.query
        ? {
            AND: [
              {
                OR: [
                  { name: { contains: ctx.query, mode: "insensitive" as const } },
                  { sku: { contains: ctx.query, mode: "insensitive" as const } },
                  { barcode: { contains: ctx.query, mode: "insensitive" as const } },
                  { summary: { contains: ctx.query, mode: "insensitive" as const } },
                  { catalogCategory: { name: { contains: ctx.query, mode: "insensitive" as const } } },
                  // Searching the configured vocabulary too: a technician
                  // types "Toyota" long before they think to open the
                  // Brand filter.
                  {
                    attributeValues: {
                      some: { value: { label: { contains: ctx.query, mode: "insensitive" as const } } },
                    },
                  },
                ],
              },
              ...attributeClauses,
            ],
          }
        : attributeClauses.length > 0
          ? { AND: attributeClauses }
          : {}),
    };
  }

  /**
   * Categories with a live tally, so a technician never taps into an
   * empty shelf. The tally respects the search and the filters already
   * applied, which is why it cannot be cached on the category row.
   */
  private async categoryTree(
    tenantId: string,
    ctx: { query: string | null; selections: { attributeId: string; valueIds: string[] }[]; inStockOnly?: boolean },
  ): Promise<BrowseCategoryNode[]> {
    const [categories, tallies] = await Promise.all([
      this.prisma.catalogCategory.findMany({
        where: { tenantId, isActive: true, technicianVisible: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true, slug: true, parentId: true },
      }),
      this.prisma.inventoryItem.groupBy({
        by: ["catalogCategoryId"],
        where: this.itemWhere(tenantId, { ...ctx, categoryIds: null }),
        _count: { _all: true },
      }),
    ]);

    const direct = new Map<string, number>();
    for (const row of tallies) {
      if (row.catalogCategoryId) direct.set(row.catalogCategoryId, row._count._all);
    }

    const byParent = new Map<string | null, typeof categories>();
    for (const category of categories) {
      const bucket = byParent.get(category.parentId) ?? [];
      bucket.push(category);
      byParent.set(category.parentId, bucket);
    }

    const build = (parentId: string | null): BrowseCategoryNode[] =>
      (byParent.get(parentId) ?? []).map((category) => {
        const children = build(category.id);
        return {
          id: category.id,
          name: category.name,
          slug: category.slug,
          parentId: category.parentId,
          // A parent counts what is under it, because tapping "Brakes"
          // shows the pads filed under "Brakes > Pads" too.
          itemCount: (direct.get(category.id) ?? 0) + children.reduce((sum, child) => sum + child.itemCount, 0),
          children,
        };
      });

    return build(null);
  }

  /**
   * The filters this category offers, with counts.
   *
   * Empty when no category is chosen. That is the product rule, not a
   * shortcut: showing every filter in the workshop to a technician
   * browsing "All" is the exact noise this feature was asked to remove.
   */
  private async filtersFor(
    tenantId: string,
    ctx: {
      categoryIds: string[] | null;
      query: string | null;
      selections: { attributeId: string; valueIds: string[] }[];
      inStockOnly?: boolean;
    },
  ): Promise<BrowseFilterDefinition[]> {
    if (!ctx.categoryIds || ctx.categoryIds.length === 0) return [];

    const links = await this.prisma.catalogCategoryAttribute.findMany({
      where: { tenantId, categoryId: { in: ctx.categoryIds }, attribute: { isActive: true } },
      orderBy: [{ sortOrder: "asc" }],
      include: {
        attribute: {
          select: {
            id: true,
            key: true,
            label: true,
            sortOrder: true,
            values: {
              where: { isActive: true },
              orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
              select: { id: true, value: true, label: true },
            },
          },
        },
      },
    });

    // A parent and its child may both offer "Brand"; the technician
    // should see it once.
    const unique = new Map<string, (typeof links)[number]["attribute"]>();
    for (const link of links) unique.set(link.attribute.id, link.attribute);
    const attributes = [...unique.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));

    return Promise.all(
      attributes.map(async (attribute) => {
        const counts = await this.prisma.inventoryItemAttributeValue.groupBy({
          by: ["valueId"],
          where: {
            tenantId,
            attributeId: attribute.id,
            inventoryItem: this.itemWhere(tenantId, { ...ctx, skipAttributeId: attribute.id }),
          },
          _count: { _all: true },
        });
        const byValue = new Map(counts.map((row) => [row.valueId, row._count._all]));
        const chosen = new Set(ctx.selections.find((s) => s.attributeId === attribute.id)?.valueIds ?? []);

        return {
          attributeId: attribute.id,
          key: attribute.key,
          label: attribute.label,
          options: attribute.values.map((value) => ({
            valueId: value.id,
            value: value.value,
            label: value.label,
            count: byValue.get(value.id) ?? 0,
            selected: chosen.has(value.id),
          })),
        };
      }),
    );
  }

  private toCard(row: {
    id: string;
    sku: string;
    name: string;
    summary: string | null;
    imageUrl: string | null;
    sellingPrice: Prisma.Decimal;
    stockTracked: boolean;
    lowStockThreshold: number;
    catalogCategory: { id: string; name: string } | null;
    stockBalances: { availableQty: number }[];
    attributeValues: {
      attribute: { id: string; label: string; showOnCard: boolean; sortOrder: number; isActive: boolean };
      value: { label: string };
    }[];
  }): BrowseCard {
    // money-lint-ok: a count of physical objects, not a currency amount.
    const onHand = row.stockBalances.reduce((sum, balance) => sum + balance.availableQty, 0);

    return {
      id: row.id,
      sku: row.sku,
      name: row.name,
      summary: row.summary,
      imageUrl: row.imageUrl,
      categoryId: row.catalogCategory?.id ?? null,
      categoryName: row.catalogCategory?.name ?? null,
      sellingPrice: row.sellingPrice.toFixed(2),
      stockTracked: row.stockTracked,
      onHand,
      availability: !row.stockTracked
        ? "NOT_TRACKED"
        : onHand === 0
          ? "OUT_OF_STOCK"
          : onHand <= row.lowStockThreshold
            ? "LOW"
            : "IN_STOCK",
      attributes: row.attributeValues
        .filter((entry) => entry.attribute.showOnCard && entry.attribute.isActive)
        .sort((a, b) => a.attribute.sortOrder - b.attribute.sortOrder)
        .map((entry) => ({
          attributeId: entry.attribute.id,
          label: entry.attribute.label,
          valueLabel: entry.value.label,
        })),
    };
  }
}
