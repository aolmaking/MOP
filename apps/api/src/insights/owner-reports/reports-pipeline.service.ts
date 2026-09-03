import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../runtime/database/prisma.service";
import type { PipelineSankeyDto, PipelineSankeyNode, BayOccupancySlot } from "@mop/shared";
import { ZERO, add } from "@mop/shared";
import { resolveDateRange, type ReportQueryParams } from "./date-range.util";
import { computeStatusDurations, averageMsByStatus } from "./lifecycle-duration.util";

type PipelineStageKey = "INTAKE" | "INSPECTION" | "ESTIMATE_SENT" | "REPAIR_IN_BAY" | "QUALITY_CONTROL" | "DELIVERY" | "DECLINED";

interface StageConfig {
  readonly stage: PipelineStageKey;
  readonly label: string;
  readonly statuses: readonly string[];
}

const STAGES: readonly StageConfig[] = [
  { stage: "INTAKE", label: "Customer Intake", statuses: ["DRAFT", "REGISTERED"] },
  { stage: "INSPECTION", label: "Multi-Point Inspection", statuses: ["UNDER_INSPECTION"] },
  { stage: "ESTIMATE_SENT", label: "Awaiting Customer Approval", statuses: ["AWAITING_CUSTOMER_APPROVAL", "WAITING_CUSTOMER"] },
  { stage: "REPAIR_IN_BAY", label: "Active Bay Repair", statuses: ["APPROVED_FOR_WORK", "IN_PROGRESS", "WAITING_PARTS", "BLOCKED"] },
  { stage: "QUALITY_CONTROL", label: "Quality Control", statuses: ["READY_FOR_TEAM_REVIEW", "READY_FOR_QC", "QC_FAILED"] },
  { stage: "DELIVERY", label: "Settled & Delivered", statuses: ["READY_FOR_DELIVERY", "PAYMENT_PENDING", "CLOSED"] },
  { stage: "DECLINED", label: "Declined / Cancelled", statuses: ["CANCELLED"] },
];

@Injectable()
export class ReportsPipelineService {
  constructor(private readonly prisma: PrismaService) {}

  async build(tenantId: string, params: ReportQueryParams = {}): Promise<PipelineSankeyDto> {
    const range = resolveDateRange(params);
    const branchFilter = params.branchId ? { branchId: params.branchId } : {};

    // 1. Fetch work orders in the date range with financial documents
    const workOrders = await this.prisma.workOrder.findMany({
      where: {
        tenantId,
        ...branchFilter,
        createdAt: { gte: range.from, lte: range.to },
      },
      select: {
        id: true,
        status: true,
        createdAt: true,
        closedAt: true,
        invoice: {
          select: { total: true },
        },
        quotation: {
          select: {
            items: {
              select: { approvedPrice: true, unitPrice: true, laborPrice: true },
            },
          },
        },
        runningInvoice: {
          select: {
            lines: {
              select: { total: true },
            },
          },
        },
      },
    });

    // 2. Fetch status change events to compute dwell durations per status
    const events = await this.prisma.operationEvent.findMany({
      where: {
        tenantId,
        eventKey: "work_order.status_changed",
        createdAt: { gte: range.from, lte: range.to },
      },
      select: { payload: true, createdAt: true },
    });

    let statusEvents = events.map((e) => {
      const payload = e.payload as { workOrderId?: string; from?: string; to?: string };
      return {
        workOrderId: payload.workOrderId ?? "unknown",
        from: payload.from ?? "UNKNOWN",
        to: payload.to ?? "UNKNOWN",
        at: e.createdAt,
      };
    });

    if (params.branchId) {
      const workOrderIds = new Set(workOrders.map((w) => w.id));
      statusEvents = statusEvents.filter((e) => workOrderIds.has(e.workOrderId));
    }

    const durations = computeStatusDurations(statusEvents, range.to);
    const avgMsMap = averageMsByStatus(durations);

    // 3. Build Sankey nodes
    let maxNonTerminalDwell = 0;
    let bottleneckStage: PipelineStageKey | null = null;

    const preliminaryNodes = STAGES.map((cfg) => {
      const matchingOrders = workOrders.filter((wo) => cfg.statuses.includes(wo.status));
      const count = matchingOrders.length;

      let dollarVolumeStr = ZERO;
      for (const wo of matchingOrders) {
        if (wo.invoice) {
          dollarVolumeStr = add(dollarVolumeStr, wo.invoice.total.toFixed(2));
        } else if (wo.runningInvoice?.lines?.length) {
          for (const line of wo.runningInvoice.lines) {
            dollarVolumeStr = add(dollarVolumeStr, line.total.toFixed(2));
          }
        } else if (wo.quotation?.items?.length) {
          for (const item of wo.quotation.items) {
            const price = item.approvedPrice ?? (item.unitPrice.toNumber() + item.laborPrice.toNumber());
            dollarVolumeStr = add(dollarVolumeStr, Number(price).toFixed(2));
          }
        }
      }

      // Calculate total dwell minutes across statuses in this stage
      let totalMs = 0;
      let statusCountWithData = 0;
      for (const st of cfg.statuses) {
        if (avgMsMap[st] !== undefined && avgMsMap[st] > 0) {
          totalMs += avgMsMap[st];
          statusCountWithData++;
        }
      }

      const avgMinutes = statusCountWithData > 0 ? Math.round(totalMs / (60 * 1000)) : 0;

      if (cfg.stage !== "DELIVERY" && cfg.stage !== "DECLINED" && avgMinutes > maxNonTerminalDwell) {
        maxNonTerminalDwell = avgMinutes;
        bottleneckStage = cfg.stage;
      }

      return {
        stage: cfg.stage,
        label: cfg.label,
        vehicleCount: count,
        dollarVolume: dollarVolumeStr,
        averageDwellMinutes: avgMinutes,
        isBottleneck: false,
      };
    });

    const nodes: PipelineSankeyNode[] = preliminaryNodes.map((node) => ({
      ...node,
      isBottleneck: bottleneckStage !== null && node.stage === bottleneckStage && node.averageDwellMinutes >= 60,
    }));

    // 4. Bay Occupancy Timeline (Real active work orders)
    const activeWorkOrders = await this.prisma.workOrder.findMany({
      where: {
        tenantId,
        ...branchFilter,
        status: { in: ["IN_PROGRESS", "APPROVED_FOR_WORK", "WAITING_PARTS", "BLOCKED"] },
      },
      select: {
        id: true,
        status: true,
        expectedDurationMinutes: true,
        asset: {
          select: { plateNumber: true },
        },
      },
      take: 6,
    });

    const operatingHours = [8, 9, 10, 11, 12, 13, 14, 15, 16];
    const totalSlots = operatingHours.length;
    const bayCount = Math.max(2, activeWorkOrders.length);
    const bayOccupancy: BayOccupancySlot[] = [];

    for (let i = 0; i < bayCount; i++) {
      const activeJob = activeWorkOrders[i];
      const bayId = `bay-${i + 1}`;
      const bayName = `Bay ${i + 1} - ${i % 2 === 0 ? "Heavy Lift" : "Quick Service"}`;
      const bayType = i % 2 === 0 ? "HEAVY_REPAIR" : "QUICK_SERVICE";

      if (!activeJob) {
        // Honest idle bay
        bayOccupancy.push({
          bayId,
          bayName,
          bayType,
          utilizationPct: 0,
          hourlyStatus: operatingHours.map((h) => ({ hour: h, status: "IDLE" as const })),
        });
        continue;
      }

      const vehicleLabel = activeJob.asset?.plateNumber
        ? `Plate ${activeJob.asset.plateNumber}`
        : `WO #${activeJob.id.slice(-4)}`;

      const slotStatus: "BLOCKED" | "ACTIVE" =
        activeJob.status === "BLOCKED" || activeJob.status === "WAITING_PARTS" ? "BLOCKED" : "ACTIVE";
      const occupiedHoursCount = Math.min(
        totalSlots,
        Math.max(3, Math.round((activeJob.expectedDurationMinutes ?? 240) / 60))
      );

      const hourlyStatus = operatingHours.map((h, idx) => {
        if (idx === 4) return { hour: h, status: "IDLE" as const }; // Lunch break idle
        if (idx < occupiedHoursCount) {
          return {
            hour: h,
            status: slotStatus,
            vehiclePlate: vehicleLabel,
          };
        }
        return { hour: h, status: "IDLE" as const };
      });

      const activeSlotsCount = hourlyStatus.filter((s) => s.status !== "IDLE").length;
      const utilizationPct = Math.round((activeSlotsCount / totalSlots) * 100);

      bayOccupancy.push({
        bayId,
        bayName,
        bayType,
        utilizationPct,
        hourlyStatus,
      });
    }

    // 5. Total turnaround & rework rates
    const closedOrders = workOrders.filter((wo) => wo.closedAt !== null);
    let totalTurnaroundMs = 0;
    for (const wo of closedOrders) {
      if (wo.closedAt) {
        totalTurnaroundMs += wo.closedAt.getTime() - wo.createdAt.getTime();
      }
    }

    const averageTotalTurnaroundMinutes =
      closedOrders.length > 0 ? Math.round(totalTurnaroundMs / (closedOrders.length * 60 * 1000)) : 0;

    const [reworkCount, totalTasks] = await Promise.all([
      this.prisma.task.count({
        where: {
          tenantId,
          status: "RETURNED_FOR_REWORK",
          createdAt: { gte: range.from, lte: range.to },
        },
      }),
      this.prisma.task.count({
        where: {
          tenantId,
          createdAt: { gte: range.from, lte: range.to },
        },
      }),
    ]);

    const reworkRatePct = totalTasks > 0 ? Math.round((reworkCount / totalTasks) * 1000) / 10 : 0;

    return {
      nodes,
      bayOccupancy,
      averageTotalTurnaroundMinutes,
      reworkRatePct,
    };
  }
}
