import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../runtime/database/prisma.service";

export interface OwnerHome {
  readonly workshopStatus: { activeBranches: number; totalBranches: number; activeUsers: number };
  readonly openWorkOrders: number;
  readonly waitingCustomerApproval: number;
  readonly waitingParts: number;
  readonly waitingPayment: number;
  readonly lowStock: number;
  readonly recentChanges: readonly {
    id: string;
    actorName: string;
    action: string;
    targetType: string;
    createdAt: string;
  }[];
}

const OPEN_WORK_ORDER_STATUSES = [
  "DRAFT",
  "REGISTERED",
  "UNDER_INSPECTION",
  "AWAITING_CUSTOMER_APPROVAL",
  "APPROVED_FOR_WORK",
  "IN_PROGRESS",
  "WAITING_PARTS",
  "WAITING_CUSTOMER",
  "BLOCKED",
  "READY_FOR_TEAM_REVIEW",
  "READY_FOR_QC",
  "QC_FAILED",
  "READY_FOR_DELIVERY",
  "PAYMENT_PENDING",
] as const;

/**
 * Owner Home. Every card is a link, never an action -- this service only
 * reads.
 *
 * Three cards named in the spec (Configuration warnings, Builder draft
 * status, Workflow health alerts) are deliberately absent: they depend on
 * diagnostic systems that do not exist anywhere in this codebase yet.
 * Returning "no warnings" for a check that never ran would be exactly the
 * silent stub CLAUDE.md forbids, so they are omitted rather than faked.
 */
@Injectable()
export class OwnerHomeService {
  constructor(private readonly prisma: PrismaService) {}

  async build(tenantId: string): Promise<OwnerHome> {
    const [branches, activeUsers, openWorkOrders, waitingApproval, waitingParts, waitingPayment, lowStock, recent] =
      await Promise.all([
        this.prisma.branch.findMany({ where: { tenantId }, select: { isActive: true } }),
        this.prisma.staffUser.count({ where: { tenantId, isActive: true } }),
        this.prisma.workOrder.count({ where: { tenantId, status: { in: [...OPEN_WORK_ORDER_STATUSES] } } }),
        this.prisma.workOrder.count({ where: { tenantId, status: "AWAITING_CUSTOMER_APPROVAL" } }),
        this.prisma.workOrder.count({ where: { tenantId, status: "WAITING_PARTS" } }),
        this.prisma.workOrder.count({ where: { tenantId, status: "PAYMENT_PENDING" } }),
        this.lowStockCount(tenantId),
        this.prisma.auditLog.findMany({
          where: { tenantId },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: { id: true, actorName: true, action: true, targetType: true, createdAt: true },
        }),
      ]);

    return {
      workshopStatus: {
        activeBranches: branches.filter((b) => b.isActive).length,
        totalBranches: branches.length,
        activeUsers,
      },
      openWorkOrders,
      waitingCustomerApproval: waitingApproval,
      waitingParts,
      waitingPayment,
      lowStock,
      recentChanges: recent.map((row) => ({
        id: row.id,
        actorName: row.actorName,
        action: row.action,
        targetType: row.targetType,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  private async lowStockCount(tenantId: string): Promise<number> {
    const balances = await this.prisma.warehouseStockBalance.findMany({
      where: { tenantId },
      select: {
        availableQty: true,
        inventoryItem: { select: { stockTracked: true, lowStockThreshold: true } },
      },
    });

    return balances.filter(
      (balance) => balance.inventoryItem.stockTracked && balance.availableQty <= balance.inventoryItem.lowStockThreshold,
    ).length;
  }
}
