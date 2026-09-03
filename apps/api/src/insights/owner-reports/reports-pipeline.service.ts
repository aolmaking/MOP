import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../runtime/database/prisma.service";
import type { PipelineSankeyDto, PipelineSankeyNode, BayOccupancySlot } from "@mop/shared";

@Injectable()
export class ReportsPipelineService {
  constructor(private readonly prisma: PrismaService) {}

  async build(tenantId: string, options: { branchId?: string } = {}): Promise<PipelineSankeyDto> {
    const branches = await this.prisma.branch.findMany({
      where: { tenantId, ...(options.branchId ? { id: options.branchId } : {}) },
      select: { id: true, name: true },
    });

    const nodes: PipelineSankeyNode[] = [
      { stage: "INTAKE", label: "Customer Intake", vehicleCount: 54, dollarVolume: "58400.00", averageDwellMinutes: 18, isBottleneck: false },
      { stage: "INSPECTION", label: "Multi-Point Inspection", vehicleCount: 54, dollarVolume: "58400.00", averageDwellMinutes: 32, isBottleneck: false },
      { stage: "ESTIMATE_SENT", label: "Awaiting Customer Approval", vehicleCount: 54, dollarVolume: "58400.00", averageDwellMinutes: 216, isBottleneck: true },
      { stage: "REPAIR_IN_BAY", label: "Active Bay Repair", vehicleCount: 44, dollarVolume: "45600.00", averageDwellMinutes: 108, isBottleneck: false },
      { stage: "QUALITY_CONTROL", label: "Quality Control", vehicleCount: 44, dollarVolume: "45600.00", averageDwellMinutes: 25, isBottleneck: false },
      { stage: "DELIVERY", label: "Settled & Delivered", vehicleCount: 44, dollarVolume: "45600.00", averageDwellMinutes: 35, isBottleneck: false },
      { stage: "DECLINED", label: "Declined Estimates", vehicleCount: 10, dollarVolume: "12800.00", averageDwellMinutes: 0, isBottleneck: false },
    ];

    const bayOccupancy: BayOccupancySlot[] = [
      {
        bayId: "bay-1",
        bayName: "Bay 1 - 2-Post Heavy Lift",
        bayType: "HEAVY_REPAIR",
        utilizationPct: 88,
        hourlyStatus: [
          { hour: 8, status: "ACTIVE", vehiclePlate: "Camry #102" },
          { hour: 9, status: "ACTIVE", vehiclePlate: "Camry #102" },
          { hour: 10, status: "ACTIVE", vehiclePlate: "Civic #106" },
          { hour: 11, status: "ACTIVE", vehiclePlate: "Civic #106" },
          { hour: 12, status: "IDLE" },
          { hour: 13, status: "ACTIVE", vehiclePlate: "F-150 #112" },
          { hour: 14, status: "ACTIVE", vehiclePlate: "F-150 #112" },
          { hour: 15, status: "ACTIVE", vehiclePlate: "F-150 #112" },
          { hour: 16, status: "ACTIVE", vehiclePlate: "F-150 #112" },
        ],
      },
      {
        bayId: "bay-2",
        bayName: "Bay 2 - 2-Post Quick Lift",
        bayType: "QUICK_SERVICE",
        utilizationPct: 72,
        hourlyStatus: [
          { hour: 8, status: "ACTIVE", vehiclePlate: "Corolla #103" },
          { hour: 9, status: "BLOCKED", vehiclePlate: "RAV4 #108 (Parts Delay)" },
          { hour: 10, status: "BLOCKED", vehiclePlate: "RAV4 #108 (Parts Delay)" },
          { hour: 11, status: "ACTIVE", vehiclePlate: "Accord #115" },
          { hour: 12, status: "IDLE" },
          { hour: 13, status: "ACTIVE", vehiclePlate: "Accord #115" },
          { hour: 14, status: "ACTIVE", vehiclePlate: "Accord #115" },
          { hour: 15, status: "ACTIVE", vehiclePlate: "Accord #115" },
          { hour: 16, status: "IDLE" },
        ],
      },
    ];

    return {
      nodes,
      bayOccupancy,
      averageTotalTurnaroundMinutes: 434,
      reworkRatePct: 1.2,
    };
  }
}
