import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../runtime/database/prisma.service";

export interface ConfiguredCategory {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly parentId: string | null;
  readonly description: string | null;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly technicianVisible: boolean;
  /** Items filed directly here. The manager needs this before deactivating. */
  readonly itemCount: number;
  readonly attributeIds: readonly string[];
  readonly children: readonly ConfiguredCategory[];
}

export interface ConfiguredAttribute {
  readonly id: string;
  readonly key: string;
  readonly label: string;
  readonly showOnCard: boolean;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly usedByCategoryIds: readonly string[];
  readonly values: readonly {
    id: string;
    value: string;
    label: string;
    sortOrder: number;
    isActive: boolean;
    itemCount: number;
  }[];
}

export interface CatalogConfiguration {
  readonly categories: readonly ConfiguredCategory[];
  readonly attributes: readonly ConfiguredAttribute[];
  /** Items with no category at all -- the thing a manager most needs told. */
  readonly uncategorisedItemCount: number;
}

export interface CategoryInput {
  readonly name: string;
  readonly parentId?: string | null;
  readonly description?: string;
  readonly sortOrder?: number;
  readonly isActive?: boolean;
  readonly technicianVisible?: boolean;
}

export interface AttributeInput {
  readonly label: string;
  readonly showOnCard?: boolean;
  readonly sortOrder?: number;
  readonly isActive?: boolean;
}

export interface AttributeValueInput {
  readonly label: string;
  readonly sortOrder?: number;
  readonly isActive?: boolean;
}

/**
 * Catalog configuration -- the vocabulary the inventory manager writes
 * and the technician can only read.
 *
 * The single rule this service exists to hold: **the technician's
 * catalog has no taxonomy of its own.** Categories, filters and filter
 * values live here, and `CatalogBrowseService` renders exactly what is
 * here and nothing else. A hardcoded "Vehicle Type" anywhere in the
 * technician surface would make this page decoration, which is the
 * failure mode this feature was written to remove.
 *
 * Nothing here deletes. A category with items filed under it and a
 * filter value stamped on a hundred parts are both referenced by
 * records that outlive the configuration decision -- deactivating hides
 * them from a browse while leaving every existing part readable, which
 * a delete cannot do.
 */
@Injectable()
export class CatalogConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async configuration(tenantId: string): Promise<CatalogConfiguration> {
    const [categories, links, attributes, tallies, valueTallies, uncategorised] = await Promise.all([
      this.prisma.catalogCategory.findMany({
        where: { tenantId },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      this.prisma.catalogCategoryAttribute.findMany({
        where: { tenantId },
        orderBy: { sortOrder: "asc" },
        select: { categoryId: true, attributeId: true },
      }),
      this.prisma.catalogAttribute.findMany({
        where: { tenantId },
        orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
        include: { values: { orderBy: [{ sortOrder: "asc" }, { label: "asc" }] } },
      }),
      this.prisma.inventoryItem.groupBy({
        by: ["catalogCategoryId"],
        where: { tenantId },
        _count: { _all: true },
      }),
      this.prisma.inventoryItemAttributeValue.groupBy({
        by: ["valueId"],
        where: { tenantId },
        _count: { _all: true },
      }),
      this.prisma.inventoryItem.count({ where: { tenantId, catalogCategoryId: null } }),
    ]);

    const itemCounts = new Map<string, number>();
    for (const row of tallies) if (row.catalogCategoryId) itemCounts.set(row.catalogCategoryId, row._count._all);

    const valueCounts = new Map<string, number>();
    for (const row of valueTallies) valueCounts.set(row.valueId, row._count._all);

    const attributesByCategory = new Map<string, string[]>();
    const categoriesByAttribute = new Map<string, string[]>();
    for (const link of links) {
      attributesByCategory.set(link.categoryId, [...(attributesByCategory.get(link.categoryId) ?? []), link.attributeId]);
      categoriesByAttribute.set(link.attributeId, [
        ...(categoriesByAttribute.get(link.attributeId) ?? []),
        link.categoryId,
      ]);
    }

    const byParent = new Map<string | null, typeof categories>();
    for (const category of categories) {
      byParent.set(category.parentId, [...(byParent.get(category.parentId) ?? []), category]);
    }

    const build = (parentId: string | null): ConfiguredCategory[] =>
      (byParent.get(parentId) ?? []).map((category) => ({
        id: category.id,
        name: category.name,
        slug: category.slug,
        parentId: category.parentId,
        description: category.description,
        sortOrder: category.sortOrder,
        isActive: category.isActive,
        technicianVisible: category.technicianVisible,
        itemCount: itemCounts.get(category.id) ?? 0,
        attributeIds: attributesByCategory.get(category.id) ?? [],
        children: build(category.id),
      }));

    return {
      categories: build(null),
      attributes: attributes.map((attribute) => ({
        id: attribute.id,
        key: attribute.key,
        label: attribute.label,
        showOnCard: attribute.showOnCard,
        sortOrder: attribute.sortOrder,
        isActive: attribute.isActive,
        usedByCategoryIds: categoriesByAttribute.get(attribute.id) ?? [],
        values: attribute.values.map((value) => ({
          id: value.id,
          value: value.value,
          label: value.label,
          sortOrder: value.sortOrder,
          isActive: value.isActive,
          itemCount: valueCounts.get(value.id) ?? 0,
        })),
      })),
      uncategorisedItemCount: uncategorised,
    };
  }

  /* ---------------------------------------------------------------- *
   * Categories
   * ---------------------------------------------------------------- */

  async createCategory(tenantId: string, input: CategoryInput) {
    const name = this.requireName(input.name, "A category needs a name.");
    const parentId = await this.resolveParent(tenantId, input.parentId ?? null, null);

    return this.prisma.catalogCategory.create({
      data: {
        tenantId,
        name,
        slug: await this.freeSlug(tenantId, name, null),
        parentId,
        description: input.description?.trim() || null,
        sortOrder: input.sortOrder ?? 0,
        isActive: input.isActive ?? true,
        technicianVisible: input.technicianVisible ?? true,
      },
    });
  }

  /**
   * Renaming keeps the slug. The slug is what items, filters and any
   * bookmarked browse hang off, and regenerating it on every rename
   * would turn a typo fix into a broken link.
   */
  async updateCategory(tenantId: string, id: string, input: CategoryInput) {
    const existing = await this.prisma.catalogCategory.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException({ code: "category_not_found", message: "That category is not in this workshop." });

    const name = this.requireName(input.name, "A category needs a name.");
    const parentId = await this.resolveParent(tenantId, input.parentId ?? null, id);

    return this.prisma.catalogCategory.update({
      where: { id },
      data: {
        name,
        parentId,
        description: input.description?.trim() || null,
        sortOrder: input.sortOrder ?? existing.sortOrder,
        isActive: input.isActive ?? existing.isActive,
        technicianVisible: input.technicianVisible ?? existing.technicianVisible,
      },
    });
  }

  /**
   * Which filters this category offers, set as a whole rather than one
   * at a time: the manager is answering "what does someone filtering
   * brake pads need?", and a per-row toggle makes them answer it five
   * times.
   */
  async setCategoryAttributes(tenantId: string, categoryId: string, attributeIds: readonly string[]) {
    const category = await this.prisma.catalogCategory.findFirst({ where: { id: categoryId, tenantId }, select: { id: true } });
    if (!category) throw new NotFoundException({ code: "category_not_found", message: "That category is not in this workshop." });

    const wanted = [...new Set(attributeIds)];
    if (wanted.length > 0) {
      const owned = await this.prisma.catalogAttribute.count({ where: { tenantId, id: { in: wanted } } });
      if (owned !== wanted.length) {
        // Refused rather than silently filtered: a filter id from
        // another workshop means something is wrong upstream, and
        // quietly dropping it hides that.
        throw new BadRequestException({
          code: "attribute_not_found",
          message: "One of those filters is not in this workshop.",
        });
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.catalogCategoryAttribute.deleteMany({ where: { tenantId, categoryId } });
      if (wanted.length > 0) {
        await tx.catalogCategoryAttribute.createMany({
          data: wanted.map((attributeId, index) => ({ tenantId, categoryId, attributeId, sortOrder: index })),
        });
      }
    });

    return { categoryId, attributeIds: wanted };
  }

  /**
   * The order a technician sees, set by the person who knows the shop.
   *
   * Alphabetical is a stranger's guess. A workshop that does brakes all
   * day wants Brakes first, and until this existed `sortOrder` was a
   * column three read paths honoured and nothing could write -- the
   * exact write-only configuration this codebase treats as a defect.
   *
   * Takes the whole sibling list rather than one row's new position.
   * Sending a single row's number is how two categories end up sharing
   * `sortOrder: 2` and the order goes back to being the planner's whim;
   * assigning 0..n-1 across the set in one transaction cannot tie.
   */
  async reorderCategories(tenantId: string, parentId: string | null, orderedIds: readonly string[]) {
    const siblings = await this.prisma.catalogCategory.findMany({
      where: { tenantId, parentId },
      select: { id: true },
    });
    this.requireSameSet(siblings.map((row) => row.id), orderedIds, "category");

    await this.prisma.$transaction(
      orderedIds.map((id, index) =>
        this.prisma.catalogCategory.update({ where: { id }, data: { sortOrder: index } }),
      ),
    );

    return { parentId, orderedIds: [...orderedIds] };
  }

  async reorderAttributes(tenantId: string, orderedIds: readonly string[]) {
    const all = await this.prisma.catalogAttribute.findMany({ where: { tenantId }, select: { id: true } });
    this.requireSameSet(all.map((row) => row.id), orderedIds, "filter");

    await this.prisma.$transaction(
      orderedIds.map((id, index) =>
        this.prisma.catalogAttribute.update({ where: { id }, data: { sortOrder: index } }),
      ),
    );

    return { orderedIds: [...orderedIds] };
  }

  async reorderAttributeValues(tenantId: string, attributeId: string, orderedIds: readonly string[]) {
    const attribute = await this.prisma.catalogAttribute.findFirst({
      where: { id: attributeId, tenantId },
      select: { id: true },
    });
    if (!attribute) throw new NotFoundException({ code: "attribute_not_found", message: "That filter is not in this workshop." });

    const values = await this.prisma.catalogAttributeValue.findMany({
      where: { tenantId, attributeId },
      select: { id: true },
    });
    this.requireSameSet(values.map((row) => row.id), orderedIds, "filter value");

    await this.prisma.$transaction(
      orderedIds.map((id, index) =>
        this.prisma.catalogAttributeValue.update({ where: { id }, data: { sortOrder: index } }),
      ),
    );

    return { attributeId, orderedIds: [...orderedIds] };
  }

  /**
   * A reorder must name every sibling exactly once.
   *
   * Refused rather than reconciled: a list that is missing one, or
   * carries one from another workshop, means the client is working from
   * a stale picture, and quietly ordering the rest would leave the
   * missing row wherever it happened to be with no sign anything went
   * wrong.
   */
  private requireSameSet(actual: readonly string[], given: readonly string[], noun: string): void {
    const unique = new Set(given);
    const known = new Set(actual);
    const sameSize = unique.size === given.length && unique.size === known.size;
    if (!sameSize || [...unique].some((id) => !known.has(id))) {
      throw new BadRequestException({
        code: "reorder_mismatch",
        message: `Reordering needs every ${noun} in the group, listed once each.`,
      });
    }
  }

  /* ---------------------------------------------------------------- *
   * Filter definitions and their values
   * ---------------------------------------------------------------- */

  async createAttribute(tenantId: string, input: AttributeInput) {
    const label = this.requireName(input.label, "A filter needs a name.");
    return this.prisma.catalogAttribute.create({
      data: {
        tenantId,
        key: await this.freeAttributeKey(tenantId, label),
        label,
        showOnCard: input.showOnCard ?? true,
        sortOrder: input.sortOrder ?? 0,
        isActive: input.isActive ?? true,
      },
      include: { values: true },
    });
  }

  async updateAttribute(tenantId: string, id: string, input: AttributeInput) {
    const existing = await this.prisma.catalogAttribute.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException({ code: "attribute_not_found", message: "That filter is not in this workshop." });

    return this.prisma.catalogAttribute.update({
      where: { id },
      data: {
        label: this.requireName(input.label, "A filter needs a name."),
        showOnCard: input.showOnCard ?? existing.showOnCard,
        sortOrder: input.sortOrder ?? existing.sortOrder,
        isActive: input.isActive ?? existing.isActive,
      },
      include: { values: true },
    });
  }

  async addAttributeValue(tenantId: string, attributeId: string, input: AttributeValueInput) {
    const attribute = await this.prisma.catalogAttribute.findFirst({ where: { id: attributeId, tenantId }, select: { id: true } });
    if (!attribute) throw new NotFoundException({ code: "attribute_not_found", message: "That filter is not in this workshop." });

    const label = this.requireName(input.label, "A filter value needs a name.");
    const value = this.slugify(label);
    const clash = await this.prisma.catalogAttributeValue.findFirst({ where: { attributeId, value }, select: { label: true } });
    if (clash) {
      throw new ConflictException({ code: "value_taken", message: `This filter already offers "${clash.label}".` });
    }

    return this.prisma.catalogAttributeValue.create({
      data: {
        tenantId,
        attributeId,
        value,
        label,
        sortOrder: input.sortOrder ?? 0,
        isActive: input.isActive ?? true,
      },
    });
  }

  async updateAttributeValue(tenantId: string, id: string, input: AttributeValueInput) {
    const existing = await this.prisma.catalogAttributeValue.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException({ code: "value_not_found", message: "That filter value is not in this workshop." });

    return this.prisma.catalogAttributeValue.update({
      where: { id },
      data: {
        label: this.requireName(input.label, "A filter value needs a name."),
        sortOrder: input.sortOrder ?? existing.sortOrder,
        isActive: input.isActive ?? existing.isActive,
      },
    });
  }

  /* ---------------------------------------------------------------- *
   * Helpers
   * ---------------------------------------------------------------- */

  private requireName(raw: string | undefined, message: string): string {
    const name = raw?.trim();
    if (!name) throw new BadRequestException({ code: "name_required", message });
    return name;
  }

  /**
   * One level of nesting, and never its own ancestor. Both refusals are
   * about the browse: a cycle makes `withDescendants` walk forever, and
   * a third level puts a part four taps from a technician's thumb.
   */
  private async resolveParent(tenantId: string, parentId: string | null, selfId: string | null): Promise<string | null> {
    if (!parentId) return null;
    if (parentId === selfId) {
      throw new BadRequestException({ code: "category_cycle", message: "A category cannot sit inside itself." });
    }

    const parent = await this.prisma.catalogCategory.findFirst({
      where: { id: parentId, tenantId },
      select: { id: true, parentId: true },
    });
    if (!parent) throw new BadRequestException({ code: "parent_not_found", message: "That parent category is not in this workshop." });
    if (parent.parentId) {
      throw new BadRequestException({
        code: "category_too_deep",
        message: "Categories go one level deep. Pick a top-level category as the parent.",
      });
    }
    if (selfId) {
      const hasChildren = await this.prisma.catalogCategory.count({ where: { tenantId, parentId: selfId } });
      if (hasChildren > 0) {
        throw new BadRequestException({
          code: "category_too_deep",
          message: "This category already has sub-categories, so it cannot sit inside another one.",
        });
      }
    }
    return parent.id;
  }

  private slugify(value: string): string {
    return (
      value
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "item"
    );
  }

  /**
   * Suffixed rather than refused, unlike a SKU. A slug is machinery
   * nobody types or reads off a shelf, so two categories both called
   * "Filters" under different parents is an ordinary thing a workshop
   * should be allowed to do.
   */
  private async freeSlug(tenantId: string, name: string, parentId: string | null): Promise<string> {
    const base = this.slugify(parentId ? `${name}` : name);
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const taken = await this.prisma.catalogCategory.count({ where: { tenantId, slug: candidate } });
      if (taken === 0) return candidate;
    }
    return `${base}-${Date.now()}`;
  }

  private async freeAttributeKey(tenantId: string, label: string): Promise<string> {
    const base = this.slugify(label);
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
      const taken = await this.prisma.catalogAttribute.count({ where: { tenantId, key: candidate } });
      if (taken === 0) return candidate;
    }
    return `${base}-${Date.now()}`;
  }
}
