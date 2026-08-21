import { Injectable } from "@nestjs/common";
import { PrismaService } from "../runtime/database/prisma.service";
import { resolveDateRange, safeDivide, type ReportQueryParams } from "../reports/date-range.util";
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
            task: { status: "DONE", workOrder: workOrderScopeFilter(scope) },
            assignedAt: { gte: range.from, lte: range.to },
          },
          select: { assignedAt: true, task: { select: { updatedAt: true } } },
        });

        const reworkCount = await this.prisma.taskAssignment.count({
          where: {
            tenantId,
            staffUserId: person.id,
            task: { status: "RETURNED_FOR_REWORK", workOrder: workOrderScopeFilter(scope) },
            assignedAt: { gte: range.from, lte: range.to },
          },
        });

        const blockerCount = await this.prisma.taskBlocker.count({
          where: {
            tenantId,
            createdAt: { gte: range.from, lte: range.to },
            task: { assignments: { some: { staffUserId: person.id } }, workOrder: workOrderScopeFilter(scope) },
          },
        });

        const durationsHours = completedAssignments
          .map((a) => (a.task.updatedAt.getTime() - a.assignedAt.getTime()) / (60 * 60 * 1000))
          .filter((h) => h >= 0);
        const averageTaskHours =
          durationsHours.length === 0 ? null : durationsHours.reduce((a, b) => a + b, 0) / durationsHours.length;

        return {
          staffUserId: person.id,
          fullName: person.fullName,
          tasksCompleted: completedAssignments.length,
          averageTaskHours,
          reworkRate: safeDivide(reworkCount, completedAssignments.length + reworkCount) * 100,
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
        const memberIds = await this.prisma.teamMembership.findMany({
          where: { tenantId, teamId: team.id, endedAt: null },
          select: { technicianId: true },
        });
        const tasksCompleted = await this.prisma.taskAssignment.count({
          where: {
            tenantId,
            staffUserId: { in: memberIds.map((m) => m.technicianId) },
            task: { status: "DONE" },
            assignedAt: { gte: range.from, lte: range.to },
          },
        });
        return { teamId: team.id, teamName: team.name, tasksCompleted };
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
