import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";

export interface DisputeSummary {
  readonly id: string;
  readonly workOrderId: string;
  readonly raisedById: string;
  readonly reason: string;
  readonly status: "OPEN" | "RESOLVED";
  readonly createdAt: string;
  readonly resolvedAt: string | null;
  readonly resolutionNote: string | null;
}

/**
 * Phase 19.B -- a closed work order's factual accuracy formally in
 * question. Non-destructive by construction: nothing here ever touches
 * `WorkOrder.status` (WorkOrderLifecycleService's exclusive domain) or
 * edits any existing row. A dispute is a fact ADDED alongside the
 * record, visible everywhere the record is shown, never a rewrite of
 * what the record already says.
 */
@Injectable()
export class WorkOrderDisputeService {
  constructor(private readonly prisma: PrismaService) {}

  async raise(tenantId: string, workOrderId: string, raisedById: string, reason: string): Promise<DisputeSummary> {
    const created = await this.prisma.workOrderDispute.create({
      data: { tenantId, workOrderId, raisedById, reason },
    });
    return this.toSummary(created);
  }

  async resolve(disputeId: string, resolvedById: string, resolutionNote: string): Promise<DisputeSummary> {
    const existing = await this.prisma.workOrderDispute.findUnique({ where: { id: disputeId } });
    if (!existing) throw new NotFoundException({ code: "dispute_not_found", message: "No such dispute." });

    const updated = await this.prisma.workOrderDispute.update({
      where: { id: disputeId },
      data: { status: "RESOLVED", resolvedAt: new Date(), resolvedById, resolutionNote },
    });
    return this.toSummary(updated);
  }

  async forWorkOrder(tenantId: string, workOrderId: string): Promise<readonly DisputeSummary[]> {
    const rows = await this.prisma.workOrderDispute.findMany({
      where: { tenantId, workOrderId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row) => this.toSummary(row));
  }

  private toSummary(row: {
    id: string;
    workOrderId: string;
    raisedById: string;
    reason: string;
    status: string;
    createdAt: Date;
    resolvedAt: Date | null;
    resolutionNote: string | null;
  }): DisputeSummary {
    return {
      id: row.id,
      workOrderId: row.workOrderId,
      raisedById: row.raisedById,
      reason: row.reason,
      status: row.status as "OPEN" | "RESOLVED",
      createdAt: row.createdAt.toISOString(),
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      resolutionNote: row.resolutionNote,
    };
  }
}
