import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../runtime/database/prisma.service";
import { resolveDateRange, safeDivide, type ReportQueryParams } from "../owner-reports/date-range.util";
import { workOrderScopeFilter, type AnalyticsScope } from "./analytics-scope.util";

export interface TechnicianRow {
  readonly staffUserId: string;
  readonly fullName: string;
  readonly tasksCompleted: number;
  readonly averageTaskHours: number | null;
  readonly reworkRate: number;
  readonly blockerCount: number;
}

export interface TeamThroughputRow {
  readonly teamId: string;
  readonly teamName: string;
  readonly tasksCompleted: number;
}

export interface DiagnosticCodeRow {
  readonly code: string;
  readonly count: number;
}

export interface PeopleAnalyticsReport {
  readonly range: { from: string; to: string };
  readonly technicians: readonly TechnicianRow[];
  readonly teamThroughput: readonly TeamThroughputRow[];
  readonly diagnosticCodeActivity: readonly DiagnosticCodeRow[];
}

/**
 * Data Analyst -- Technician & Team Analytics
 * (docs/detailed-specs/data-analyst.md). Explicitly never shows a
 * currency amount tied to a technician -- "who generates the most
 * revenue" stays out of this role's data boundary, the same no-finance
 * discipline Team Leader observes, at a wider (company-or-scoped) reach.
 */
@Injectable()
export class PeopleAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async build(tenantId: string, scope: AnalyticsScope, params: ReportQueryParams): Promise<PeopleAnalyticsReport> {
    const range = resolveDateRange(params);

    const [technicians, teamThroughput, diagnosticCodeActivity] = await Promise.all([
      this.technicianStats(tenantId, scope, range),
      this.teamThroughput(tenantId, scope, range),
      this.diagnosticCodeActivity(tenantId, scope, range),
    ]);

    return { range: { from: range.from.toISOString(), to: range.to.toISOString() }, technicians, teamThroughput, diagnosticCodeActivity };
  }

  private async technicianStats(
    tenantId: string,
    scope: AnalyticsScope,
    range: { from: Date; to: Date },
  ): Promise<TechnicianRow[]> {
    const technicians = await this.prisma.staffUser.findMany({
      where: {
        tenantId,
        role: "TECHNICIAN",
        ...(scope.branchIds.length > 0 ? { branchScope: { hasSome: [...scope.branchIds] } } : {}),
      },
      select: { id: true, fullName: true },
    });

    return Promise.all(
      technicians.map(async (person) => {
        const completedAssignments = await this.prisma.taskAssignment.findMany({
          where: {
            tenantId,
            staffUserId: person.id,
            task: {
              status: "DONE",
              workOrder: workOrderScopeFilter(scope),
            },
            OR: [
              { task: { completedAt: { gte: range.from, lte: range.to } } },
              { task: { completedAt: null }, assignedAt: { gte: range.from, lte: range.to } },
            ],
          },
          select: {
            assignedAt: true,
            unassignedAt: true,
            task: { select: { startedAt: true, completedAt: true, actualMinutes: true } },
          },
        });

        // Historical attribution: a technician is only credited with completion if they were
        // actively assigned when the task completed (unassignedAt is null, or unassigned after completedAt).
        const validCompletedAssignments = completedAssignments.filter((a) => {
          if (a.unassignedAt === null) return true;
          if (a.task.completedAt && a.unassignedAt.getTime() >= a.task.completedAt.getTime()) return true;
          return false;
        });

        const reworkCount = await this.prisma.taskAssignment.count({
          where: {
            tenantId,
            staffUserId: person.id,
            unassignedAt: null,
            task: {
              status: "RETURNED_FOR_REWORK",
              workOrder: workOrderScopeFilter(scope),
            },
            assignedAt: { gte: range.from, lte: range.to },
          },
        });

        const blockerCount = await this.prisma.taskBlocker.count({
          where: {
            tenantId,
            createdAt: { gte: range.from, lte: range.to },
            task: {
              assignments: {
                some: {
                  staffUserId: person.id,
                  OR: [{ unassignedAt: null }, { unassignedAt: { gte: range.from } }],
                },
              },
              workOrder: workOrderScopeFilter(scope),
            },
          },
        });

        const durationsHours = validCompletedAssignments
          .map((a) => {
            if (a.task.actualMinutes != null) {
              return a.task.actualMinutes / 60;
            }
            if (a.task.completedAt) {
              const start = a.task.startedAt ?? a.assignedAt;
              const diffHours = (a.task.completedAt.getTime() - start.getTime()) / (60 * 60 * 1000);
              return diffHours >= 0 ? diffHours : null;
            }
            return null;
          })
          .filter((h): h is number => h !== null && h >= 0);

        const averageTaskHours =
          durationsHours.length === 0 ? null : durationsHours.reduce((a, b) => a + b, 0) / durationsHours.length;

        return {
          staffUserId: person.id,
          fullName: person.fullName,
          tasksCompleted: validCompletedAssignments.length,
          averageTaskHours,
          reworkRate: safeDivide(reworkCount, validCompletedAssignments.length + reworkCount) * 100,
          blockerCount,
        };
      }),
    );
  }

  private async teamThroughput(
    tenantId: string,
    scope: AnalyticsScope,
    range: { from: Date; to: Date },
  ): Promise<TeamThroughputRow[]> {
    const teams = await this.prisma.team.findMany({
      where: { tenantId, isActive: true, ...(scope.branchIds.length > 0 ? { branchId: { in: [...scope.branchIds] } } : {}) },
      select: { id: true, name: true },
    });

    return Promise.all(
      teams.map(async (team) => {
        // Historical team membership overlap: startedAt <= range.to and (endedAt is null or >= range.from)
        const memberships = await this.prisma.teamMembership.findMany({
          where: {
            tenantId,
            teamId: team.id,
            startedAt: { lte: range.to },
            OR: [
              { endedAt: null },
              { endedAt: { gte: range.from } },
            ],
          },
          select: { technicianId: true, startedAt: true, endedAt: true },
        });

        if (memberships.length === 0) {
          return { teamId: team.id, teamName: team.name, tasksCompleted: 0 };
        }

        let totalCompleted = 0;
        for (const m of memberships) {
          const activeFrom = m.startedAt > range.from ? m.startedAt : range.from;
          const activeTo = m.endedAt && m.endedAt < range.to ? m.endedAt : range.to;

          if (activeFrom <= activeTo) {
            const memberAssignments = await this.prisma.taskAssignment.findMany({
              where: {
                tenantId,
                staffUserId: m.technicianId,
                task: {
                  status: "DONE",
                  workOrder: workOrderScopeFilter(scope),
                },
                OR: [
                  { task: { completedAt: { gte: activeFrom, lte: activeTo } } },
                  { task: { completedAt: null }, assignedAt: { gte: activeFrom, lte: activeTo } },
                ],
              },
              select: {
                unassignedAt: true,
                task: { select: { completedAt: true } },
              },
            });

            const validCount = memberAssignments.filter((a) => {
              if (a.unassignedAt === null) return true;
              if (a.task.completedAt && a.unassignedAt.getTime() >= a.task.completedAt.getTime()) return true;
              return false;
            }).length;

            totalCompleted += validCount;
          }
        }

        return { teamId: team.id, teamName: team.name, tasksCompleted: totalCompleted };
      }),
    );
  }

  private async diagnosticCodeActivity(
    tenantId: string,
    scope: AnalyticsScope,
    range: { from: Date; to: Date },
  ): Promise<DiagnosticCodeRow[]> {
    const faults = await this.prisma.fault.findMany({
      where: {
        tenantId,
        code: { not: null },
        createdAt: { gte: range.from, lte: range.to },
        workOrder: workOrderScopeFilter(scope),
      },
      select: { code: true },
    });

    const counts = new Map<string, number>();
    for (const fault of faults) {
      if (!fault.code) continue;
      counts.set(fault.code, (counts.get(fault.code) ?? 0) + 1);
    }
    return [...counts.entries()].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count);
  }
}
