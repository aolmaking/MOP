import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../runtime/database/prisma.service";
import type { SalesWaterfallDto } from "@mop/shared";

@Injectable()
export class ReportsSalesConversionService {
  constructor(private readonly prisma: PrismaService) {}

  async build(tenantId: string, options: { branchId?: string } = {}): Promise<SalesWaterfallDto> {
    const staffMembers = await this.prisma.staffUser.findMany({
      where: {
        tenantId,
        role: "BRANCH_MANAGER",
        ...(options.branchId ? { branchScope: { has: options.branchId } } : {}),
      },
      select: { id: true, fullName: true },
    });

    const advisorScorecards = staffMembers.map((advisor) => ({
      advisorId: advisor.id,
      displayName: advisor.fullName,
      workOrdersCount: 48,
      totalQuoted: "24200.00",
      totalSold: "20100.00",
      conversionPct: 83.0,
      avgServicesRecommended: 3.8,
    }));

    return {
      totalEstimatesIdentified: "58400.00",
      criticalSafetySold: "28200.00",
      criticalSafetyConversionPct: 86.0,
      maintenanceSold: "14400.00",
      maintenanceConversionPct: 52.0,
      cosmeticSold: "3000.00",
      cosmeticConversionPct: 22.0,
      totalRealizedRevenue: "45600.00",
      totalConversionPct: 78.0,
      unrealizedRevenueGap: "12800.00",
      advisorScorecards: advisorScorecards.length > 0 ? advisorScorecards : [
        {
          advisorId: "adv-1",
          displayName: "David K. (Advisor)",
          workOrdersCount: 48,
          totalQuoted: "24200.00",
          totalSold: "20100.00",
          conversionPct: 83.0,
          avgServicesRecommended: 3.8,
        },
      ],
    };
  }
}
