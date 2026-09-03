import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../runtime/database/prisma.service";
import type { LaborTriadDto, TechnicianTriadMember } from "@mop/shared";
import { ZERO, add, calculateLaborTriadRatios } from "@mop/shared";
import { resolveDateRange, type ReportQueryParams } from "./date-range.util";

function countWeekdays(from: Date, to: Date): number {
  const cur = new Date(from);
  let days = 0;
  while (cur <= to) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) {
      days++;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return Math.max(1, days);
}

@Injectable()
export class ReportsLaborService {
  constructor(private readonly prisma: PrismaService) {}

  async build(tenantId: string, params: ReportQueryParams = {}): Promise<LaborTriadDto> {
    const range = resolveDateRange(params);
    const branchFilter = params.branchId ? { branchScope: { has: params.branchId } } : {};

    const staffMembers = await this.prisma.staffUser.findMany({
      where: {
        tenantId,
        role: "TECHNICIAN",
        ...branchFilter,
      },
      select: {
        id: true,
        fullName: true,
      },
    });

    const shiftHoursPerDay = 8;
    const standardShiftHours = countWeekdays(range.from, range.to) * shiftHoursPerDay;

    const technicians: TechnicianTriadMember[] = [];
    let totalProductivity = 0;
    let totalEfficiency = 0;
    let totalProficiency = 0;
    let totalUnappliedHours = 0;

    for (const staff of staffMembers) {
      // Fetch task assignments for this technician in range
      const assignments = await this.prisma.taskAssignment.findMany({
        where: {
          tenantId,
          staffUserId: staff.id,
          assignedAt: { lte: range.to },
          OR: [
            { unassignedAt: null },
            { unassignedAt: { gte: range.from } },
          ],
        },
        include: {
          task: {
            include: {
              workOrder: {
                include: {
                  invoice: {
                    include: {
                      lines: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      let clockedTaskMinutes = 0;
      let billedBookHours = 0;
      let reworkCount = 0;
      let revenueProducedStr = ZERO;
      let completedTasksCount = 0;

      const seenTasks = new Set<string>();

      for (const a of assignments) {
        const t = a.task;
        if (!t || seenTasks.has(t.id)) continue;
        seenTasks.add(t.id);

        if (t.status === "DONE" || (t.updatedAt >= range.from && t.updatedAt <= range.to)) {
          completedTasksCount++;
          // Clocked minutes
          const minutes = t.actualMinutes ?? 60;
          clockedTaskMinutes += minutes;

          // Check if rework
          if (t.status === "RETURNED_FOR_REWORK") {
            reworkCount++;
          }

          // Billed book hours & revenue produced from invoice lines
          if (t.workOrder?.invoice?.lines?.length) {
            for (const line of t.workOrder.invoice.lines) {
              const laborAmount = line.lockedLaborPrice.toFixed(2);
              revenueProducedStr = add(revenueProducedStr, laborAmount);
              billedBookHours += Number(laborAmount) / 100;
            }
          } else {
            // Unbilled estimation
            billedBookHours += Math.round((minutes / 60) * 10) / 10;
          }
        }
      }

      const clockedTaskHours = Math.round((clockedTaskMinutes / 60) * 10) / 10;
      const roundedBilledHours = Math.round(billedBookHours * 10) / 10;
      const paidShiftHours = standardShiftHours;

      const { productivityPct, efficiencyPct, proficiencyPct } = calculateLaborTriadRatios(
        paidShiftHours,
        clockedTaskHours,
        roundedBilledHours
      );

      const reworkRatePct = completedTasksCount > 0 ? Math.round((reworkCount / completedTasksCount) * 1000) / 10 : 0;

      let quadrant: TechnicianTriadMember["performanceQuadrant"] = "CHAMPION";
      if (efficiencyPct >= 100 && reworkRatePct <= 3) {
        quadrant = "CHAMPION";
      } else if (efficiencyPct >= 115 && reworkRatePct > 5) {
        quadrant = "RUSHING_HAZARD";
      } else if (efficiencyPct < 100 && reworkRatePct <= 3) {
        quadrant = "APPRENTICE";
      } else {
        quadrant = "UNDERPERFORMER";
      }

      totalProductivity += productivityPct;
      totalEfficiency += efficiencyPct;
      totalProficiency += proficiencyPct;

      const unapplied = Math.max(0, paidShiftHours - clockedTaskHours);
      totalUnappliedHours += unapplied;

      technicians.push({
        technicianId: staff.id,
        displayName: staff.fullName,
        paidShiftHours,
        clockedTaskHours,
        billedBookHours: roundedBilledHours,
        productivityPct,
        efficiencyPct,
        proficiencyPct,
        reworkCount,
        reworkRatePct,
        revenueProduced: revenueProducedStr,
        performanceQuadrant: quadrant,
      });
    }

    const count = technicians.length;
    const avgProductivity = count > 0 ? Math.round((totalProductivity / count) * 10) / 10 : 0;
    const avgEfficiency = count > 0 ? Math.round((totalEfficiency / count) * 10) / 10 : 0;
    const avgProficiency = count > 0 ? Math.round((totalProficiency / count) * 10) / 10 : 0;

    const totalUnappliedLaborCost = (totalUnappliedHours * 25).toFixed(2);

    return {
      averageProductivityPct: avgProductivity,
      averageEfficiencyPct: avgEfficiency,
      averageProficiencyPct: avgProficiency,
      totalUnappliedLaborCost,
      technicians,
    };
  }
}
