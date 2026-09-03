import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../runtime/database/prisma.service";
import type { SalesWaterfallDto } from "@mop/shared";
import { ZERO, add, compare, subtract } from "@mop/shared";
import { resolveDateRange, type ReportQueryParams } from "./date-range.util";

@Injectable()
export class ReportsSalesConversionService {
  constructor(private readonly prisma: PrismaService) {}

  async build(tenantId: string, params: ReportQueryParams = {}): Promise<SalesWaterfallDto> {
    const range = resolveDateRange(params);

    // 1. Fetch customer decision requests in the date range
    const decisionRequests = await this.prisma.customerDecisionRequest.findMany({
      where: {
        tenantId,
        createdAt: { gte: range.from, lte: range.to },
        ...(params.branchId ? { workOrder: { branchId: params.branchId } } : {}),
      },
      include: {
        items: true,
        workOrder: {
          select: {
            id: true,
            branchId: true,
          },
        },
      },
    });

    let totalIdentified = ZERO;
    let criticalIdentified = ZERO;
    let criticalSold = ZERO;
    let maintenanceIdentified = ZERO;
    let maintenanceSold = ZERO;
    let cosmeticIdentified = ZERO;
    let cosmeticSold = ZERO;
    let totalSold = ZERO;

    for (const req of decisionRequests) {
      for (const item of req.items) {
        const itemTotalStr = item.total.toFixed(2);
        totalIdentified = add(totalIdentified, itemTotalStr);

        const isCritical = item.importance === "CRITICAL" || item.importance === "HIGH";
        const isMaintenance = item.importance === "MEDIUM";
        const isCosmetic = item.importance === "LOW";
        const isApproved = item.decision === "APPROVED";

        if (isCritical) {
          criticalIdentified = add(criticalIdentified, itemTotalStr);
          if (isApproved) {
            criticalSold = add(criticalSold, itemTotalStr);
          }
        } else if (isMaintenance) {
          maintenanceIdentified = add(maintenanceIdentified, itemTotalStr);
          if (isApproved) {
            maintenanceSold = add(maintenanceSold, itemTotalStr);
          }
        } else if (isCosmetic) {
          cosmeticIdentified = add(cosmeticIdentified, itemTotalStr);
          if (isApproved) {
            cosmeticSold = add(cosmeticSold, itemTotalStr);
          }
        }

        if (isApproved) {
          totalSold = add(totalSold, itemTotalStr);
        }
      }
    }

    const unrealizedRevenueGap = subtract(totalIdentified, totalSold);

    const criticalSafetyConversionPct = compare(criticalIdentified, ZERO) > 0
      ? Math.round((Number(criticalSold) / Number(criticalIdentified)) * 1000) / 10
      : 0;

    const maintenanceConversionPct = compare(maintenanceIdentified, ZERO) > 0
      ? Math.round((Number(maintenanceSold) / Number(maintenanceIdentified)) * 1000) / 10
      : 0;

    const cosmeticConversionPct = compare(cosmeticIdentified, ZERO) > 0
      ? Math.round((Number(cosmeticSold) / Number(cosmeticIdentified)) * 1000) / 10
      : 0;

    const totalConversionPct = compare(totalIdentified, ZERO) > 0
      ? Math.round((Number(totalSold) / Number(totalIdentified)) * 1000) / 10
      : 0;

    // 2. Fetch Advisors / Service Writers and build real scorecards
    const staffMembers = await this.prisma.staffUser.findMany({
      where: {
        tenantId,
        role: { in: ["BRANCH_MANAGER", "TENANT_ADMIN", "TENANT_OWNER"] },
        ...(params.branchId ? { branchScope: { has: params.branchId } } : {}),
      },
      select: { id: true, fullName: true },
    });

    const requestsByAdvisor = new Map<string, typeof decisionRequests>();
    for (const req of decisionRequests) {
      const list = requestsByAdvisor.get(req.createdById) ?? [];
      list.push(req);
      requestsByAdvisor.set(req.createdById, list);
    }

    const advisorScorecards = staffMembers.map((advisor) => {
      const reqs = requestsByAdvisor.get(advisor.id) ?? [];
      let totalQuoted = ZERO;
      let totalSoldByAdv = ZERO;
      let totalItems = 0;

      for (const r of reqs) {
        for (const it of r.items) {
          totalItems++;
          const val = it.total.toFixed(2);
          totalQuoted = add(totalQuoted, val);
          if (it.decision === "APPROVED") {
            totalSoldByAdv = add(totalSoldByAdv, val);
          }
        }
      }

      const conversionPct = compare(totalQuoted, ZERO) > 0
        ? Math.round((Number(totalSoldByAdv) / Number(totalQuoted)) * 1000) / 10
        : 0;

      const avgServicesRecommended = reqs.length > 0
        ? Math.round((totalItems / reqs.length) * 10) / 10
        : 0;

      return {
        advisorId: advisor.id,
        displayName: advisor.fullName,
        workOrdersCount: reqs.length,
        totalQuoted,
        totalSold: totalSoldByAdv,
        conversionPct,
        avgServicesRecommended,
      };
    });

    return {
      totalEstimatesIdentified: totalIdentified,
      criticalSafetySold: criticalSold,
      criticalSafetyConversionPct,
      maintenanceSold,
      maintenanceConversionPct,
      cosmeticSold,
      cosmeticConversionPct,
      totalRealizedRevenue: totalSold,
      totalConversionPct,
      unrealizedRevenueGap,
      advisorScorecards,
    };
  }
}
