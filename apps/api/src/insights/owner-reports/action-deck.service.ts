import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../runtime/database/prisma.service";
import type { PrescriptiveActionItem, OwnerHomePulseDto } from "@mop/shared";
import { ZERO, add, compare, subtract } from "@mop/shared";

@Injectable()
export class ActionDeckService {
  constructor(private readonly prisma: PrismaService) {}

  async buildHomePulse(tenantId: string, branchId?: string): Promise<OwnerHomePulseDto> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    // 1. Invoices MTD vs Previous Month
    const [invoicesMtd, invoicesPrev, activeWorkOrders, branches, pendingSettlementOrders] = await Promise.all([
      this.prisma.invoice.findMany({
        where: {
          tenantId,
          issuedAt: { gte: startOfMonth },
          ...(branchId ? { workOrder: { branchId } } : {}),
        },
        include: {
          lines: true,
          workOrder: {
            include: {
              tasks: {
                where: { status: "DONE" },
                select: { actualMinutes: true },
              },
              partLines: {
                select: { cost: true, quantity: true },
              },
            },
          },
        },
      }),
      this.prisma.invoice.findMany({
        where: {
          tenantId,
          issuedAt: { gte: startOfPrevMonth, lte: endOfPrevMonth },
          ...(branchId ? { workOrder: { branchId } } : {}),
        },
        select: { total: true },
      }),
      this.prisma.workOrder.findMany({
        where: {
          tenantId,
          status: { notIn: ["CLOSED", "CANCELLED"] },
          ...(branchId ? { branchId } : {}),
        },
        select: { id: true, status: true },
      }),
      this.prisma.branch.findMany({
        where: { tenantId, ...(branchId ? { id: branchId } : {}) },
        select: { id: true },
      }),
      this.prisma.workOrder.findMany({
        where: {
          tenantId,
          status: { in: ["READY_FOR_DELIVERY", "PAYMENT_PENDING"] },
          ...(branchId ? { branchId } : {}),
        },
        include: {
          invoice: { select: { total: true, paid: true } },
          runningInvoice: { include: { lines: true } },
        },
      }),
    ]);

    // MTD Revenue
    let mtdRevenueStr = ZERO;
    let mtdLaborRevenueStr = ZERO;
    let mtdPartsCost = 0;
    let mtdLaborMinutes = 0;

    for (const inv of invoicesMtd) {
      mtdRevenueStr = add(mtdRevenueStr, inv.total.toFixed(2));
      for (const line of inv.lines) {
        mtdLaborRevenueStr = add(mtdLaborRevenueStr, line.lockedLaborPrice.toFixed(2));
      }

      if (inv.workOrder) {
        for (const t of inv.workOrder.tasks) {
          mtdLaborMinutes += t.actualMinutes ?? 60;
        }
        for (const pl of inv.workOrder.partLines) {
          if (pl.cost) {
            mtdPartsCost += pl.cost.toNumber() * pl.quantity;
          }
        }
      }
    }

    // Previous Month Revenue
    let prevRevenueStr = ZERO;
    for (const inv of invoicesPrev) {
      prevRevenueStr = add(prevRevenueStr, inv.total.toFixed(2));
    }

    const mtdRevenueNum = Number(mtdRevenueStr);
    const prevRevenueNum = Number(prevRevenueStr);
    const mtdRevenueTrendPct =
      prevRevenueNum > 0 ? Math.round(((mtdRevenueNum - prevRevenueNum) / prevRevenueNum) * 1000) / 10 : 0;

    // Blended Gross Margin
    // COGS = Parts Cost + Direct Labor Cost ($30/hr)
    const directLaborCost = (mtdLaborMinutes / 60) * 30;
    const totalCogs = mtdPartsCost + directLaborCost;
    const grossProfit = Math.max(0, mtdRevenueNum - totalCogs);
    const blendedGrossMarginPct =
      mtdRevenueNum > 0 ? Math.round((grossProfit / mtdRevenueNum) * 1000) / 10 : 0;

    // Target benchmark: 55% gross margin
    const blendedGrossMarginTrendPct =
      blendedGrossMarginPct > 0 ? Math.round((blendedGrossMarginPct - 55.0) * 10) / 10 : 0;

    // Effective Labor Rate (ELR)
    const totalLaborHours = mtdLaborMinutes / 60;
    const effectiveLaborRate =
      totalLaborHours > 0 ? (Number(mtdLaborRevenueStr) / totalLaborHours).toFixed(2) : "0.00";

    // Standard Door Labor Rate
    const catalogEntries = await this.prisma.priceCatalogEntry.findMany({
      where: { tenantId, laborPrice: { gt: 0 } },
      select: { laborPrice: true },
      take: 10,
    });
    let doorLaborRate = "120.00";
    if (catalogEntries.length > 0) {
      const avgCatalog =
        catalogEntries.reduce((acc, e) => acc + (e.laborPrice?.toNumber() ?? 0), 0) / catalogEntries.length;
      doorLaborRate = avgCatalog.toFixed(2);
    }
    const elrDelta = subtract(doorLaborRate, effectiveLaborRate);

    // Live Pulse & Occupancy
    const totalBays = Math.max(2, (branches.length || 1) * 4);
    const activeVehiclesCount = activeWorkOrders.length;
    const liftsOccupiedCount = Math.min(activeVehiclesCount, totalBays);
    const bayOccupancyPct = totalBays > 0 ? Math.round((liftsOccupiedCount / totalBays) * 100) : 0;

    // Projected Today Settlement
    let projectedSettlementStr = ZERO;
    for (const wo of pendingSettlementOrders) {
      if (wo.invoice) {
        const unpaid = wo.invoice.total.toNumber() - wo.invoice.paid.toNumber();
        if (unpaid > 0) {
          projectedSettlementStr = add(projectedSettlementStr, unpaid.toFixed(2));
        }
      } else if (wo.runningInvoice?.lines?.length) {
        for (const line of wo.runningInvoice.lines) {
          projectedSettlementStr = add(projectedSettlementStr, line.total.toFixed(2));
        }
      }
    }

    const actionDeck = await this.generatePrescriptiveActions(
      tenantId,
      branchId,
      doorLaborRate,
      effectiveLaborRate,
      totalLaborHours
    );

    return {
      mtdRevenue: mtdRevenueStr,
      mtdRevenueTrendPct,
      blendedGrossMarginPct,
      blendedGrossMarginTrendPct,
      effectiveLaborRate,
      doorLaborRate,
      elrDelta,
      activeShopPulse: {
        activeVehiclesCount,
        liftsOccupiedCount,
        totalBaysCount: totalBays,
        bayOccupancyPct,
        projectedTodaySettlement: projectedSettlementStr,
      },
      actionDeck,
    };
  }

  private async generatePrescriptiveActions(
    tenantId: string,
    branchId?: string,
    doorLaborRate = "120.00",
    effectiveLaborRate = "0.00",
    totalLaborHours = 0
  ): Promise<PrescriptiveActionItem[]> {
    const actions: PrescriptiveActionItem[] = [];

    // 1. Stale Customer Decisions
    const staleDecisions = await this.prisma.customerDecisionRequest.findMany({
      where: {
        tenantId,
        status: { in: ["SENT", "VIEWED"] },
        createdAt: { lte: new Date(Date.now() - 2 * 60 * 60 * 1000) },
        ...(branchId ? { workOrder: { branchId } } : {}),
      },
      include: {
        items: { select: { total: true } },
      },
    });

    if (staleDecisions.length > 0) {
      let potentialRev = ZERO;
      for (const d of staleDecisions) {
        for (const it of d.items) {
          potentialRev = add(potentialRev, it.total.toFixed(2));
        }
      }

      actions.push({
        id: "action-stale-decisions",
        severity: "CRITICAL",
        title: "Customer Approval Bottleneck",
        explanation: `${staleDecisions.length} vehicle(s) are awaiting customer decision for over 2 hours. Shop flow is delayed.`,
        impactEstimate: `+$${potentialRev} Pending Authorization`,
        primaryActionLabel: "Send Customer Reminders",
        targetRoute: "/branch/approvals",
      });
    }

    // 2. Real Labor Rate Leakage
    const elrDiff = Number(doorLaborRate) - Number(effectiveLaborRate);
    if (elrDiff >= 15 && totalLaborHours > 5) {
      const leakageAmount = Math.round(elrDiff * totalLaborHours);
      actions.push({
        id: "action-labor-leakage",
        severity: "WARNING",
        title: "Labor Rate Realization Leakage",
        explanation: `Effective Labor Rate ($${effectiveLaborRate}/hr) is $${elrDiff.toFixed(2)} below standard door rate ($${doorLaborRate}/hr) across ${Math.round(totalLaborHours)} hours logged this month.`,
        impactEstimate: `+$${leakageAmount} Recoverable Revenue`,
        primaryActionLabel: "Review Labor Discounts",
        targetRoute: "/owner/reports",
      });
    }

    // 3. Real Dead Stock Exposure
    const balances = await this.prisma.warehouseStockBalance.findMany({
      where: { tenantId, availableQty: { gt: 0 } },
      include: {
        inventoryItem: { select: { id: true, name: true, sellingPrice: true } },
      },
    });

    const recentMovements = await this.prisma.stockMovement.findMany({
      where: {
        tenantId,
        type: { in: ["ISSUE", "TRANSFER_OUT"] },
        createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
      },
      select: { inventoryItemId: true },
    });
    const movedItemIds = new Set(recentMovements.map((m) => m.inventoryItemId));

    let deadStockValue = 0;
    let deadItemCount = 0;
    for (const b of balances) {
      if (!movedItemIds.has(b.inventoryItemId)) {
        deadItemCount++;
        deadStockValue += b.availableQty * b.inventoryItem.sellingPrice.toNumber();
      }
    }

    if (deadStockValue > 200) {
      actions.push({
        id: "action-dead-stock",
        severity: "OPPORTUNITY",
        title: "Dead Stock Capital Exposure",
        explanation: `${deadItemCount} inventory item(s) have had zero outward movement in the past 90 days.`,
        impactEstimate: `$${Math.round(deadStockValue).toLocaleString()} Tied Liquidity`,
        primaryActionLabel: "Initiate Supplier Return (RMA)",
        targetRoute: "/inventory/returns",
      });
    }

    return actions;
  }
}
