import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../runtime/database/prisma.service";
import { AuditService } from "../../audit/audit.service";
import type { FinanceConfigActor } from "./finance-configuration.service";

export interface PriceCatalogItemView {
  readonly id: string;
  readonly itemKey: string;
  readonly itemType: string;
  readonly unitPrice: string;
  readonly laborPrice: string | null;
  readonly isActive: boolean;
  readonly effectiveFrom: string;
}

/** What a caller gets back when it asks the catalogue what something costs. */
export interface ResolvedPrice {
  readonly itemKey: string;
  readonly itemType: string;
  /** Decimal as string, never a JS number -- money crosses this boundary as text. */
  readonly unitPrice: string;
  readonly laborPrice: string | null;
}

export interface SetPriceInput {
  readonly itemKey: string;
  readonly itemType: string;
  readonly unitPrice: number;
  readonly laborPrice?: number;
  readonly isActive?: boolean;
}

/**
 * Service Catalog. Effective-dated exactly as PriceCatalogEntry's own
 * comment demands: "editing a price... only affects quotes created after
 * you save," so a save never UPDATEs an existing row -- it closes the
 * currently-open one (effectiveTo = now) and opens a new one, same
 * discipline as WorkshopPolicy/TenantCapability/MessageTemplate. Nothing
 * that already read a price (an approved QuotationItem, an issued
 * InvoiceLine) is stored by reference to this table, so closing an old
 * row here can never retroactively change a number that already printed
 * on a document.
 */
@Injectable()
export class PriceCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(tenantId: string): Promise<PriceCatalogItemView[]> {
    const rows = await this.prisma.priceCatalogEntry.findMany({
      where: { tenantId, effectiveTo: null },
      orderBy: { itemKey: "asc" },
    });
    return rows.map((r) => this.toView(r));
  }

  /**
   * What does this workshop currently charge for `itemKey`?
   *
   * This method is the reason the Service Catalog is a catalogue rather
   * than a list. Until it existed, PriceCatalogEntry was written by the
   * Owner's Pricing page and read by nothing at all: every priced line in
   * the product took its unit price from whatever the caller passed in,
   * so setting "Replace battery = 450" changed no number anywhere and the
   * price was retyped by hand at the point of sale.
   *
   * "Currently" means the open row -- `effectiveTo: null` -- which is the
   * same window `list()` shows the Owner, so what they see on the Pricing
   * page is exactly what a quote will use. Inactive entries resolve to
   * null rather than to their old price: a price the Owner switched off
   * should stop being offered, not keep quietly applying.
   *
   * Returns null when the workshop has never priced this item. That is a
   * normal answer, not an error -- a workshop is allowed to charge for
   * something ad hoc -- so callers decide whether to fall back or refuse.
   */
  async resolve(tenantId: string, itemKey: string): Promise<ResolvedPrice | null> {
    const key = itemKey.trim();
    if (!key) return null;

    const row = await this.prisma.priceCatalogEntry.findFirst({
      where: { tenantId, itemKey: key, effectiveTo: null, isActive: true },
      select: { itemKey: true, itemType: true, unitPrice: true, laborPrice: true },
    });
    if (!row) return null;

    return {
      itemKey: row.itemKey,
      itemType: row.itemType,
      unitPrice: String(row.unitPrice),
      laborPrice: row.laborPrice === null ? null : String(row.laborPrice),
    };
  }

  /**
   * The same question for many keys in one round trip, for a quote or a
   * picker that would otherwise issue one query per line.
   */
  async resolveMany(tenantId: string, itemKeys: readonly string[]): Promise<Map<string, ResolvedPrice>> {
    const keys = [...new Set(itemKeys.map((k) => k.trim()).filter(Boolean))];
    if (keys.length === 0) return new Map();

    const rows = await this.prisma.priceCatalogEntry.findMany({
      where: { tenantId, itemKey: { in: keys }, effectiveTo: null, isActive: true },
      select: { itemKey: true, itemType: true, unitPrice: true, laborPrice: true },
    });

    return new Map(
      rows.map((row) => [
        row.itemKey,
        {
          itemKey: row.itemKey,
          itemType: row.itemType,
          unitPrice: String(row.unitPrice),
          laborPrice: row.laborPrice === null ? null : String(row.laborPrice),
        },
      ]),
    );
  }

  async setPrice(tenantId: string, input: SetPriceInput, actor: FinanceConfigActor): Promise<PriceCatalogItemView> {
    const itemKey = input.itemKey.trim();
    const itemType = input.itemType.trim();
    if (!itemKey) throw new BadRequestException({ code: "item_key_required", message: "An item needs a name." });
    if (!itemType) throw new BadRequestException({ code: "item_type_required", message: "An item needs a type." });
    if (!Number.isFinite(input.unitPrice) || input.unitPrice < 0) {
      throw new BadRequestException({ code: "invalid_price", message: "Unit price cannot be negative." });
    }
    if (input.laborPrice !== undefined && (!Number.isFinite(input.laborPrice) || input.laborPrice < 0)) {
      throw new BadRequestException({ code: "invalid_price", message: "Labour price cannot be negative." });
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const current = await tx.priceCatalogEntry.findFirst({
        where: { tenantId, itemKey, effectiveTo: null },
      });

      if (current) {
        await tx.priceCatalogEntry.update({ where: { id: current.id }, data: { effectiveTo: now } });
      }

      return tx.priceCatalogEntry.create({
        data: {
          tenantId,
          itemKey,
          itemType,
          unitPrice: input.unitPrice,
          laborPrice: input.laborPrice ?? null,
          isActive: input.isActive ?? true,
          effectiveFrom: now,
        },
      });
    });

    await this.audit.record({
      tenantId,
      actorId: actor.accountId,
      actorType: "TENANT_STAFF",
      actorName: actor.displayName,
      targetType: "PriceCatalogEntry",
      targetId: created.id,
      action: "price_catalog.set",
      after: { itemKey, itemType, unitPrice: input.unitPrice },
      riskLevel: "MEDIUM",
    });

    return this.toView(created);
  }

  private toView(row: {
    id: string;
    itemKey: string;
    itemType: string;
    unitPrice: unknown;
    laborPrice: unknown;
    isActive: boolean;
    effectiveFrom: Date;
  }): PriceCatalogItemView {
    return {
      id: row.id,
      itemKey: row.itemKey,
      itemType: row.itemType,
      unitPrice: String(row.unitPrice),
      laborPrice: row.laborPrice === null ? null : String(row.laborPrice),
      isActive: row.isActive,
      effectiveFrom: row.effectiveFrom.toISOString(),
    };
  }
}
