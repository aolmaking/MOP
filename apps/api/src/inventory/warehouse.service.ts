import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { AuditService } from "../audit/audit.service";

export interface WarehouseActor {
  readonly accountId: string;
  readonly displayName: string;
}

export interface NonzeroBalanceItem {
  readonly inventoryItemId: string;
  readonly sku: string;
  readonly name: string;
  /** Sum of every bucket -- available, reserved, issued, return-pending, damaged. */
  readonly totalQuantity: number;
}

/**
 * Warehouse administration -- deactivation specifically, per H7/P-32
 * (docs/POLICY_DECISION_INVENTORY.md): "What happens when a warehouse
 * with stock is deactivated?" had no answer anywhere in the product;
 * `Warehouse.isActive` existed and nothing ever set it to false.
 *
 * The default, `BLOCK_UNTIL_ZERO`, was chosen in the inventory document
 * because it is the only option that cannot silently lose a claim about
 * physical goods -- `VISION.md` SS4.3's whole argument about stock being a
 * claim about the physical world that must stay checkable. A workshop
 * that genuinely wants to retire a warehouse with stock still on it
 * needs to move or write that stock off through the existing, audited
 * stock-movement machinery first; this service will not do it silently
 * on a workshop's behalf.
 */
@Injectable()
export class WarehouseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Refuses if any balance bucket, for any item, is nonzero -- damaged
   * stock counts too. A damaged part sitting in a warehouse is still a
   * physical thing that has to go somewhere (write-off, disposal,
   * transfer) before the warehouse it is recorded against can disappear
   * from view; silently dropping it because it is "only" damaged would
   * be exactly the kind of stock-ledger lie this project exists to
   * prevent.
   */
  async deactivate(tenantId: string, warehouseId: string, actor: WarehouseActor, reason: string): Promise<void> {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: warehouseId, tenantId },
      select: { id: true, name: true, isActive: true },
    });
    if (!warehouse) {
      throw new NotFoundException({ code: "warehouse_not_found", message: "That warehouse was not found." });
    }
    if (!warehouse.isActive) {
      throw new ConflictException({ code: "already_inactive", message: "This warehouse is already inactive." });
    }

    const nonzero = await this.nonzeroBalances(warehouseId);
    if (nonzero.length > 0) {
      throw new ConflictException({
        code: "warehouse_has_stock",
        message: `This warehouse still holds stock on ${nonzero.length} item(s). Move or write it off before deactivating.`,
        details: nonzero,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.warehouse.update({ where: { id: warehouseId }, data: { isActive: false } });

      await this.audit.record(
        {
          tenantId,
          actorId: actor.accountId,
          actorType: "TENANT_STAFF",
          actorName: actor.displayName,
          targetType: "Warehouse",
          targetId: warehouseId,
          action: "warehouse.deactivated",
          before: { isActive: true },
          after: { isActive: false },
          reason,
          // Removing a warehouse from view is close enough in
          // consequence to freezing a tenant's location to warrant the
          // same weight as other structural, hard-to-casually-undo
          // changes in this codebase.
          riskLevel: "HIGH",
        },
        tx,
      );
    });
  }

  async reactivate(tenantId: string, warehouseId: string, actor: WarehouseActor, reason: string): Promise<void> {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: warehouseId, tenantId },
      select: { id: true, isActive: true },
    });
    if (!warehouse) {
      throw new NotFoundException({ code: "warehouse_not_found", message: "That warehouse was not found." });
    }
    if (warehouse.isActive) {
      throw new ConflictException({ code: "already_active", message: "This warehouse is already active." });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.warehouse.update({ where: { id: warehouseId }, data: { isActive: true } });

      await this.audit.record(
        {
          tenantId,
          actorId: actor.accountId,
          actorType: "TENANT_STAFF",
          actorName: actor.displayName,
          targetType: "Warehouse",
          targetId: warehouseId,
          action: "warehouse.reactivated",
          before: { isActive: false },
          after: { isActive: true },
          reason,
          riskLevel: "HIGH",
        },
        tx,
      );
    });
  }

  private async nonzeroBalances(warehouseId: string): Promise<readonly NonzeroBalanceItem[]> {
    const balances = await this.prisma.warehouseStockBalance.findMany({
      where: { warehouseId },
      select: {
        availableQty: true,
        reservedQty: true,
        issuedQty: true,
        returnPendingQty: true,
        damagedQty: true,
        inventoryItem: { select: { id: true, sku: true, name: true } },
      },
    });

    return balances
      .map((row) => ({
        inventoryItemId: row.inventoryItem.id,
        sku: row.inventoryItem.sku,
        name: row.inventoryItem.name,
        totalQuantity: row.availableQty + row.reservedQty + row.issuedQty + row.returnPendingQty + row.damagedQty,
      }))
      .filter((row) => row.totalQuantity !== 0);
  }
}
