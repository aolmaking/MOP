import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../runtime/database/prisma.service";
import { resolveDateRange, safeDivide, type ReportQueryParams } from "../owner-reports/date-range.util";
import { workOrderScopeFilter, type AnalyticsScope } from "./analytics-scope.util";

export interface ApprovalByImportanceRow {
  readonly importance: string;
  readonly approved: number;
  readonly rejected: number;
  readonly pending: number;
}

export interface DecisionsAnalyticsReport {
  readonly range: { from: string; to: string };
  readonly approvalRate: number;
  readonly rejectionRate: number;
  readonly byImportance: readonly ApprovalByImportanceRow[];
  /** Hours from sentAt to respondedAt, across every responded request in scope. Null with no data yet. */
  readonly averageResponseHours: number | null;
  readonly overdueRate: number;
  readonly criticalRejections: number;
  /** Of critical rejections, how many were followed by ANY later approval on the same work order -- a real, if simple, "eventually approved" signal. */
  readonly criticalRejectionsLaterApproved: number;
  readonly linkOpenRate: number;
}

/**
 * Data Analyst -- Customer Decision Analytics
 * (docs/detailed-specs/data-analyst.md). No customer name, phone, or any
 * identifying detail anywhere in this service's output -- every row is
 * scoped to CustomerDecisionRequest/Item fields only, never joined out to
 * Customer beyond what's needed for the WHERE clause itself.
 */
@Injectable()
export class DecisionsAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async build(tenantId: string, scope: AnalyticsScope, params: ReportQueryParams): Promise<DecisionsAnalyticsReport> {
    const range = resolveDateRange(params);
    const scopeFilter = { workOrder: workOrderScopeFilter(scope) };

    const requests = await this.prisma.customerDecisionRequest.findMany({
      where: { tenantId, createdAt: { gte: range.from, lte: range.to }, ...scopeFilter },
      select: {
        id: true,
        workOrderId: true,
        sentAt: true,
        respondedAt: true,
        expiresAt: true,
        status: true,
        items: { select: { decision: true, importance: true } },
      },
    });

    let approved = 0;
    let rejected = 0;
    let pending = 0;
    let criticalRejections = 0;
    const byImportance = new Map<string, { approved: number; rejected: number; pending: number }>();

    for (const request of requests) {
      for (const item of request.items) {
        const entry = byImportance.get(item.importance) ?? { approved: 0, rejected: 0, pending: 0 };
        if (item.decision === "APPROVED") {
          approved += 1;
          entry.approved += 1;
        } else if (item.decision === "REJECTED") {
          rejected += 1;
          entry.rejected += 1;
          if (item.importance === "CRITICAL") criticalRejections += 1;
        } else {
          pending += 1;
          entry.pending += 1;
        }
        byImportance.set(item.importance, entry);
      }
    }
    const totalItems = approved + rejected + pending;

    const responded = requests.filter((r) => r.respondedAt && r.sentAt);
    const averageResponseHours =
      responded.length === 0
        ? null
        : responded.reduce((sum, r) => sum + (r.respondedAt!.getTime() - r.sentAt!.getTime()) / (60 * 60 * 1000), 0) /
          responded.length;

    const now = new Date();
    const overdueCount = requests.filter((r) => r.expiresAt && r.expiresAt < now && r.status !== "RESOLVED").length;

    const criticalRejectionWorkOrders = requests
      .filter((r) => r.items.some((i) => i.decision === "REJECTED" && i.importance === "CRITICAL"))
      .map((r) => r.workOrderId);
    let criticalRejectionsLaterApproved = 0;
    if (criticalRejectionWorkOrders.length > 0) {
      const laterApprovals = await this.prisma.customerDecisionItem.findMany({
        where: {
          tenantId,
          decision: "APPROVED",
          decisionRequest: { workOrderId: { in: criticalRejectionWorkOrders } },
        },
        select: { decisionRequest: { select: { workOrderId: true } } },
        distinct: ["decisionRequestId"],
      });
      criticalRejectionsLaterApproved = new Set(laterApprovals.map((a) => a.decisionRequest.workOrderId)).size;
    }

    const viewedOrLater = requests.filter((r) => r.status !== "PENDING" && r.status !== "SENT").length;
    const sentCount = requests.filter((r) => r.sentAt !== null).length;

    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      approvalRate: safeDivide(approved, totalItems) * 100,
      rejectionRate: safeDivide(rejected, totalItems) * 100,
      byImportance: [...byImportance.entries()].map(([importance, counts]) => ({ importance, ...counts })),
      averageResponseHours,
      overdueRate: safeDivide(overdueCount, requests.length) * 100,
      criticalRejections,
      criticalRejectionsLaterApproved,
      linkOpenRate: safeDivide(viewedOrLater, sentCount) * 100,
    };
  }
}
