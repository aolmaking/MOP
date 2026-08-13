import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { AuditService } from "../audit/audit.service";
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

  async setPrice(tenantId: string, input: SetPriceInput, actor: FinanceConfigActor): Promise<PriceCatalogItemView> {
    const itemKey = input.itemKey.trim();
    if (!itemKey) throw new BadRequestException({ code: "item_key_required", message: "An item needs a name." });
    if (input.unitPrice < 0) {
      throw new BadRequestException({ code: "invalid_price", message: "Unit price cannot be negative." });
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
          itemType: input.itemType,
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
      after: { itemKey, itemType: input.itemType, unitPrice: input.unitPrice },
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
