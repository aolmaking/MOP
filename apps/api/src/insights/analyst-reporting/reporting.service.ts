import { Injectable } from "@nestjs/common";
import { sum } from "@mop/shared";
import { PrismaService } from "../../runtime/database/prisma.service";

export interface CompanyTechnicianPerformanceRow {
  readonly staffUserId: string;
  readonly fullName: string;
  readonly tasksCompleted: number;
  readonly activeTasks: number;
  readonly blockers: number;
  readonly reworkCount: number;
}

export interface ThroughputRow {
  readonly status: string;
  readonly count: number;
}

export interface FinanceSummary {
  readonly totalInvoiced: string;
  readonly totalCollected: string;
  readonly outstandingBalance: string;
}

export interface CompanyReport {
  readonly technicianPerformance: readonly CompanyTechnicianPerformanceRow[];
  readonly workOrderThroughput: readonly ThroughputRow[];
  readonly finance: FinanceSummary;
}

/**
 * Company-wide reporting for Data Analyst and the Owner-shaped roles.
 *
 * Every report is computed live, at request time, against current rows --
 * there is no point-in-time snapshot (that is Phase 19.G's job; see
 * docs/phases/PHASE_12.md section 1). A report run before and after a
 * retroactive correction will differ, and that gap is named rather than
 * hidden.
 *
 * The technician-performance report here is the un-scoped counterpart to
 * Team Leader's own managedTechnicianIds-scoped version (Phase 10): this
 * one deliberately covers every technician in the tenant, reachable only
 * through reports.company.view, which TEAM_LEADER's default permission
 * set does not grant.
 */
@Injectable()
export class ReportingService {
  constructor(private readonly prisma: PrismaService) {}

  async companyReport(tenantId: string): Promise<CompanyReport> {
    const [technicianPerformance, workOrderThroughput, finance] = await Promise.all([
      this.technicianPerformance(tenantId),
      this.throughput(tenantId),
      this.financeSummary(tenantId),
    ]);

    return { technicianPerformance, workOrderThroughput, finance };
  }

  private async technicianPerformance(tenantId: string): Promise<readonly CompanyTechnicianPerformanceRow[]> {
    const technicians = await this.prisma.staffUser.findMany({
      where: { tenantId, role: "TECHNICIAN" },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    });

    const rows = await Promise.all(
      technicians.map(async (person) => {
        const [tasksCompleted, activeTasks, blockers, reworkCount] = await Promise.all([
          this.prisma.taskAssignment.count({ where: { tenantId, staffUserId: person.id, task: { status: "DONE" } } }),
          this.prisma.taskAssignment.count({
            where: { tenantId, staffUserId: person.id, unassignedAt: null, task: { status: "IN_PROGRESS" } },
          }),
          this.prisma.taskBlocker.count({
            where: { tenantId, task: { assignments: { some: { staffUserId: person.id } } } },
          }),
          this.prisma.taskAssignment.count({
            where: { tenantId, staffUserId: person.id, task: { status: "RETURNED_FOR_REWORK" } },
          }),
        ]);

        return { staffUserId: person.id, fullName: person.fullName, tasksCompleted, activeTasks, blockers, reworkCount };
      }),
    );

    return rows;
  }

  private async throughput(tenantId: string): Promise<readonly ThroughputRow[]> {
    const grouped = await this.prisma.workOrder.groupBy({
      by: ["status"],
      where: { tenantId },
      _count: { _all: true },
    });

    return grouped
      .map((row) => ({ status: row.status, count: row._count._all }))
      .sort((a, b) => b.count - a.count);
  }

  private async financeSummary(tenantId: string): Promise<FinanceSummary> {
    const invoices = await this.prisma.invoice.findMany({
      where: { tenantId },
      select: { total: true, paid: true, balance: true },
    });

    return {
      totalInvoiced: sum(invoices.map((invoice) => invoice.total.toFixed(2))),
      totalCollected: sum(invoices.map((invoice) => invoice.paid.toFixed(2))),
      outstandingBalance: sum(invoices.map((invoice) => invoice.balance.toFixed(2))),
    };
  }
}
