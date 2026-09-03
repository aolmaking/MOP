import type { Money } from "../money/money";
import { add, compare, fromMinor, isZero, multiply, subtract, toMinor, ZERO } from "../money/money";

export interface PrescriptiveActionItem {
  readonly id: string;
  readonly severity: "CRITICAL" | "WARNING" | "OPPORTUNITY";
  readonly title: string;
  readonly explanation: string;
  readonly impactEstimate: string;
  readonly primaryActionLabel: string;
  readonly targetRoute: string;
}

export interface OwnerHomePulseDto {
  readonly mtdRevenue: Money;
  readonly mtdRevenueTrendPct: number;
  readonly blendedGrossMarginPct: number;
  readonly blendedGrossMarginTrendPct: number;
  readonly effectiveLaborRate: Money;
  readonly doorLaborRate: Money;
  readonly elrDelta: Money;
  readonly activeShopPulse: {
    readonly activeVehiclesCount: number;
    readonly liftsOccupiedCount: number;
    readonly totalBaysCount: number;
    readonly bayOccupancyPct: number;
    readonly projectedTodaySettlement: Money;
  };
  readonly actionDeck: readonly PrescriptiveActionItem[];
}

export interface FinancialPnlDto {
  readonly laborRevenue: Money;
  readonly laborCogs: Money;
  readonly laborGrossProfit: Money;
  readonly laborGrossMarginPct: number;
  readonly partsRevenue: Money;
  readonly partsCogs: Money;
  readonly partsGrossProfit: Money;
  readonly partsGrossMarginPct: number;
  readonly subletRevenue: Money;
  readonly subletCogs: Money;
  readonly subletGrossProfit: Money;
  readonly subletGrossMarginPct: number;
  readonly totalRevenue: Money;
  readonly totalCogs: Money;
  readonly totalGrossProfit: Money;
  readonly totalGrossMarginPct: number;
  readonly doorLaborRate: Money;
  readonly effectiveLaborRate: Money;
  readonly elrLeakagePerHour: Money;
  readonly discountsTotal: Money;
  readonly paymentMethods: readonly { readonly method: string; readonly amount: Money }[];
  readonly agingBalances: readonly { readonly bracket: string; readonly amount: Money }[];
}

export interface TechnicianTriadMember {
  readonly technicianId: string;
  readonly displayName: string;
  readonly paidShiftHours: number;
  readonly clockedTaskHours: number;
  readonly billedBookHours: number;
  readonly productivityPct: number;
  readonly efficiencyPct: number;
  readonly proficiencyPct: number;
  readonly reworkCount: number;
  readonly reworkRatePct: number;
  readonly revenueProduced: Money;
  readonly performanceQuadrant: "CHAMPION" | "APPRENTICE" | "RUSHING_HAZARD" | "UNDERPERFORMER";
}

export interface LaborTriadDto {
  readonly averageProductivityPct: number;
  readonly averageEfficiencyPct: number;
  readonly averageProficiencyPct: number;
  readonly totalUnappliedLaborCost: Money;
  readonly technicians: readonly TechnicianTriadMember[];
}

export interface PipelineSankeyNode {
  readonly stage: string;
  readonly label: string;
  readonly vehicleCount: number;
  readonly dollarVolume: Money;
  readonly averageDwellMinutes: number;
  readonly isBottleneck: boolean;
}

export interface BayOccupancySlot {
  readonly bayId: string;
  readonly bayName: string;
  readonly bayType: string;
  readonly hourlyStatus: readonly {
    readonly hour: number;
    readonly status: "ACTIVE" | "IDLE" | "BLOCKED";
    readonly workOrderId?: string;
    readonly vehiclePlate?: string;
  }[];
  readonly utilizationPct: number;
}

export interface PipelineSankeyDto {
  readonly nodes: readonly PipelineSankeyNode[];
  readonly bayOccupancy: readonly BayOccupancySlot[];
  readonly averageTotalTurnaroundMinutes: number;
  readonly reworkRatePct: number;
}

export interface SalesWaterfallDto {
  readonly totalEstimatesIdentified: Money;
  readonly criticalSafetySold: Money;
  readonly criticalSafetyConversionPct: number;
  readonly maintenanceSold: Money;
  readonly maintenanceConversionPct: number;
  readonly cosmeticSold: Money;
  readonly cosmeticConversionPct: number;
  readonly totalRealizedRevenue: Money;
  readonly totalConversionPct: number;
  readonly unrealizedRevenueGap: Money;
  readonly advisorScorecards: readonly {
    readonly advisorId: string;
    readonly displayName: string;
    readonly workOrdersCount: number;
    readonly totalQuoted: Money;
    readonly totalSold: Money;
    readonly conversionPct: number;
    readonly avgServicesRecommended: number;
  }[];
}

export interface CohortRetentionDto {
  readonly heatmap: readonly {
    readonly cohortMonth: string;
    readonly newCustomersCount: number;
    readonly retentionByMonthPct: readonly { readonly monthOffset: number; readonly retentionPct: number }[];
  }[];
  readonly churnRiskList: readonly {
    readonly customerId: string;
    readonly customerName: string;
    readonly vehiclePlate: string;
    readonly lastServiceDate: string;
    readonly daysOverdue: number;
    readonly preferredContact: string;
  }[];
}

// --- Mathematical Helper Utilities ---

export function calculateGrossMarginPct(revenue: Money, cogs: Money): number {
  const revMinor = toMinor(revenue);
  if (revMinor <= 0) return 0;
  const cogsMinor = toMinor(cogs);
  const profitMinor = revMinor - cogsMinor;
  return Math.round((profitMinor / revMinor) * 1000) / 10;
}

export function calculateElr(collectedLaborRevenue: Money, billedLaborHours: number): Money {
  if (billedLaborHours <= 0) return ZERO;
  const revMinor = toMinor(collectedLaborRevenue);
  const elrMinor = Math.round(revMinor / billedLaborHours);
  return fromMinor(elrMinor);
}

export function calculateLaborTriadRatios(
  paidShiftHours: number,
  clockedTaskHours: number,
  billedBookHours: number
): { productivityPct: number; efficiencyPct: number; proficiencyPct: number } {
  const productivityPct = paidShiftHours > 0 ? Math.round((clockedTaskHours / paidShiftHours) * 1000) / 10 : 0;
  const efficiencyPct = clockedTaskHours > 0 ? Math.round((billedBookHours / clockedTaskHours) * 1000) / 10 : 0;
  const proficiencyPct = paidShiftHours > 0 ? Math.round((billedBookHours / paidShiftHours) * 1000) / 10 : 0;
  return { productivityPct, efficiencyPct, proficiencyPct };
}
