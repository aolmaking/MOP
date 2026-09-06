import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../runtime/database/prisma.service";
import { resolveDateRange, safeDivide, toDecimalNumber, type ReportQueryParams } from "../owner-reports/date-range.util";
import { workOrderScopeFilter, type AnalyticsScope } from "./analytics-scope.util";
import {
  OUTCOME_LABEL,
  resolveOutcome,
  type RecommendationOutcome,
} from "../../systems/operations/history/recommendation-outcome";

export interface FulfillmentFunnel {
  readonly recommendationsCreated: number;
  readonly sent: number;
  readonly viewed: number;
  readonly responded: number;
  readonly approved: number;
  readonly planned: number;
  readonly started: number;
  readonly performed: number;
  readonly invoiced: null;
  readonly invoicedNotComputableReason: string;
  readonly collected: null;
  readonly collectedNotComputableReason: string;
}

export interface DecisionConversionRates {
  readonly responseRate: number;
  readonly approvalRate: number;
  readonly rejectionRate: number;
  readonly planningRate: number;
  readonly executionRate: number;
  readonly fulfillmentRate: number;
  readonly dropOffRate: number;
}

export interface DecisionValueSummary {
  readonly currency: string;
  readonly totalRecommendedValue: number;
  readonly approvedValue: number;
  readonly plannedValue: number;
  readonly performedValue: number;
  readonly unperformedApprovedValue: number;
  readonly invoicedValue: null;
  readonly invoicedValueNotComputableReason: string;
  readonly collectedValue: null;
  readonly collectedValueNotComputableReason: string;
}

export interface UnperformedBreakdownItem {
  readonly count: number;
  readonly value: number;
}

export interface UnperformedBreakdown {
  readonly noWorkLinked: UnperformedBreakdownItem;
  readonly plannedNotStarted: UnperformedBreakdownItem;
  readonly inProgress: UnperformedBreakdownItem;
  readonly partiallyPerformed: UnperformedBreakdownItem;
  readonly abandonedTerminal: UnperformedBreakdownItem;
}

export interface DecisionOutcomeRow {
  readonly outcome: RecommendationOutcome;
  readonly label: string;
  readonly count: number;
  readonly totalValue: number;
}

export interface DecisionTimingSummary {
  readonly averageResponseHours: number | null;
  readonly averagePlanningHours: number | null;
  readonly averageExecutionHours: number | null;
}

export interface ApprovalByImportanceRow {
  readonly importance: string;
  readonly total: number;
  readonly approved: number;
  readonly rejected: number;
  readonly pending: number;
  readonly performed: number;
  readonly approvedValue: number;
  readonly performedValue: number;
  readonly lostValue: number;
}

export interface DecisionIntegrityAnomalies {
  readonly approvedWithoutTasks: number;
  readonly terminalWithoutExecution: number;
}

export interface DecisionsAnalyticsReport {
  readonly range: { from: string; to: string };
  // Backward-compatible top-level properties
  readonly approvalRate: number;
  readonly rejectionRate: number;
  readonly byImportance: readonly ApprovalByImportanceRow[];
  readonly averageResponseHours: number | null;
  readonly overdueRate: number;
  readonly criticalRejections: number;
  readonly criticalRejectionsLaterApproved: number;
  readonly linkOpenRate: number;

  // New Closed-Loop Intelligence properties
  readonly planningRate: number;
  readonly executionRate: number;
  readonly fulfillmentRate: number;
  readonly dropOffRate: number;

  readonly funnel: FulfillmentFunnel;
  readonly rates: DecisionConversionRates;
  readonly value: DecisionValueSummary;
  readonly unperformedBreakdown: UnperformedBreakdown;
  readonly outcomes: readonly DecisionOutcomeRow[];
  readonly timing: DecisionTimingSummary;
  readonly integrity: DecisionIntegrityAnomalies;
}

const ALL_OUTCOMES: readonly RecommendationOutcome[] = [
  "AWAITING_CUSTOMER",
  "DECLINED",
  "EXPIRED",
  "CANCELLED",
  "APPROVED_NO_WORK_LINKED",
  "APPROVED_PLANNED",
  "APPROVED_IN_PROGRESS",
  "PARTIALLY_PERFORMED",
  "PERFORMED",
  "NOT_PERFORMED",
];

const NOT_COMPUTABLE_INVOICED_REASON =
  "InvoiceLine lacks direct foreign key or source attribution to CustomerDecisionItem. Attributing rendered invoice totals by approximate description or price is disallowed to prevent financial fabrication.";

const NOT_COMPUTABLE_COLLECTED_REASON =
  "Payments are collected against the invoice balance as a whole and are not allocated to individual decision lines.";

/**
 * Data Analyst -- Customer Decision -> Execution -> Revenue Intelligence
 * Closed-loop intelligence tracing customer repairs from recommendation to execution.
 * Respects strict privacy (no customer PII) and financial integrity (no fuzzy line attribution).
 */
@Injectable()
export class DecisionsAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async build(tenantId: string, scope: AnalyticsScope, params: ReportQueryParams): Promise<DecisionsAnalyticsReport> {
    const range = resolveDateRange(params);
    const scopeFilter = { workOrder: workOrderScopeFilter(scope) };

    const [tenant, requests] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { currency: true },
      }),
      this.prisma.customerDecisionRequest.findMany({
        where: { tenantId, createdAt: { gte: range.from, lte: range.to }, ...scopeFilter },
        select: {
          id: true,
          workOrderId: true,
          sentAt: true,
          viewedAt: true,
          respondedAt: true,
          expiresAt: true,
          status: true,
          createdAt: true,
          workOrder: {
            select: {
              id: true,
              status: true,
              closedAt: true,
            },
          },
          items: {
            select: {
              id: true,
              name: true,
              importance: true,
              decision: true,
              decidedAt: true,
              price: true,
              laborPrice: true,
              total: true,
              tasks: {
                select: {
                  id: true,
                  title: true,
                  status: true,
                  startedAt: true,
                  completedAt: true,
                  createdAt: true,
                  updatedAt: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const currency = tenant?.currency ?? "USD";

    let totalItems = 0;
    let sentItems = 0;
    let viewedItems = 0;
    let respondedItems = 0;

    let approvedCount = 0;
    let rejectedCount = 0;
    let pendingCount = 0;
    let plannedCount = 0;
    let startedCount = 0;
    let performedCount = 0;

    let totalRecommendedValue = 0;
    let approvedValue = 0;
    let plannedValue = 0;
    let performedValue = 0;

    let criticalRejections = 0;

    const outcomeCounts = new Map<RecommendationOutcome, { count: number; totalValue: number }>();
    for (const o of ALL_OUTCOMES) {
      outcomeCounts.set(o, { count: 0, totalValue: 0 });
    }

    const unperformedBreakdown = {
      noWorkLinked: { count: 0, value: 0 },
      plannedNotStarted: { count: 0, value: 0 },
      inProgress: { count: 0, value: 0 },
      partiallyPerformed: { count: 0, value: 0 },
      abandonedTerminal: { count: 0, value: 0 },
    };

    const byImportanceMap = new Map<
      string,
      {
        total: number;
        approved: number;
        rejected: number;
        pending: number;
        performed: number;
        approvedValue: number;
        performedValue: number;
        lostValue: number;
      }
    >();

    const planningDurationsMs: number[] = [];
    const executionDurationsMs: number[] = [];

    for (const request of requests) {
      const isSent = request.sentAt !== null;
      const isViewed = request.viewedAt !== null || (request.status !== "PENDING" && request.status !== "SENT");
      const isResponded = request.respondedAt !== null;

      for (const item of request.items) {
        totalItems += 1;
        const itemTotal = toDecimalNumber(item.total);
        totalRecommendedValue += itemTotal;

        if (isSent) sentItems += 1;
        if (isViewed) viewedItems += 1;
        if (isResponded) respondedItems += 1;

        // Canonical 10-state outcome resolution evaluated as of period end boundary
        const outcomeResult = resolveOutcome({
          decision: item.decision,
          decidedAt: item.decidedAt,
          requestStatus: request.status,
          sentAt: request.sentAt,
          viewedAt: request.viewedAt,
          respondedAt: request.respondedAt,
          expiresAt: request.expiresAt,
          workOrderStatus: request.workOrder.status,
          workOrderClosedAt: request.workOrder.closedAt,
          tasks: item.tasks,
          now: range.to,
        });

        const oEntry = outcomeCounts.get(outcomeResult.outcome)!;
        oEntry.count += 1;
        oEntry.totalValue += itemTotal;

        const importanceKey = item.importance;
        const impEntry = byImportanceMap.get(importanceKey) ?? {
          total: 0,
          approved: 0,
          rejected: 0,
          pending: 0,
          performed: 0,
          approvedValue: 0,
          performedValue: 0,
          lostValue: 0,
        };
        impEntry.total += 1;

        if (item.decision === "APPROVED") {
          approvedCount += 1;
          approvedValue += itemTotal;
          impEntry.approved += 1;
          impEntry.approvedValue += itemTotal;

          const hasTasks = item.tasks.length > 0;
          if (hasTasks) {
            plannedCount += 1;
            plannedValue += itemTotal;

            if (item.decidedAt) {
              const earliestTaskCreated = Math.min(...item.tasks.map((t) => t.createdAt.getTime()));
              planningDurationsMs.push(Math.max(0, earliestTaskCreated - item.decidedAt.getTime()));
            }
          }

          const hasStarted = item.tasks.some(
            (t) => t.status === "IN_PROGRESS" || t.status === "DONE" || t.startedAt !== null,
          );
          if (hasStarted) {
            startedCount += 1;
          }

          if (outcomeResult.outcome === "PERFORMED") {
            performedCount += 1;
            performedValue += itemTotal;
            impEntry.performed += 1;
            impEntry.performedValue += itemTotal;

            const startTimes = item.tasks.map((t) => (t.startedAt ?? t.createdAt).getTime());
            const endTimes = item.tasks.map((t) => (t.completedAt ?? t.updatedAt).getTime());
            if (startTimes.length > 0 && endTimes.length > 0) {
              const earliestStart = Math.min(...startTimes);
              const latestEnd = Math.max(...endTimes);
              executionDurationsMs.push(Math.max(0, latestEnd - earliestStart));
            }
          } else {
            // Unperformed approved work breakdown
            impEntry.lostValue += itemTotal;

            if (outcomeResult.outcome === "APPROVED_NO_WORK_LINKED") {
              unperformedBreakdown.noWorkLinked.count += 1;
              unperformedBreakdown.noWorkLinked.value += itemTotal;
            } else if (outcomeResult.outcome === "APPROVED_PLANNED") {
              unperformedBreakdown.plannedNotStarted.count += 1;
              unperformedBreakdown.plannedNotStarted.value += itemTotal;
            } else if (outcomeResult.outcome === "APPROVED_IN_PROGRESS") {
              unperformedBreakdown.inProgress.count += 1;
              unperformedBreakdown.inProgress.value += itemTotal;
            } else if (outcomeResult.outcome === "PARTIALLY_PERFORMED") {
              unperformedBreakdown.partiallyPerformed.count += 1;
              unperformedBreakdown.partiallyPerformed.value += itemTotal;
            } else if (outcomeResult.outcome === "NOT_PERFORMED") {
              unperformedBreakdown.abandonedTerminal.count += 1;
              unperformedBreakdown.abandonedTerminal.value += itemTotal;
            }
          }
        } else if (item.decision === "REJECTED") {
          rejectedCount += 1;
          impEntry.rejected += 1;
          if (item.importance === "CRITICAL") {
            criticalRejections += 1;
          }
        } else {
          pendingCount += 1;
          impEntry.pending += 1;
        }

        byImportanceMap.set(importanceKey, impEntry);
      }
    }

    const unperformedApprovedValue = Math.max(0, approvedValue - performedValue);

    // Response timing
    const respondedRequests = requests.filter((r) => r.respondedAt && r.sentAt);
    const averageResponseHours =
      respondedRequests.length === 0
        ? null
        : respondedRequests.reduce(
            (sum, r) => sum + (r.respondedAt!.getTime() - r.sentAt!.getTime()) / (60 * 60 * 1000),
            0,
          ) / respondedRequests.length;

    // Planning & Execution timing
    const averagePlanningHours =
      planningDurationsMs.length === 0
        ? null
        : planningDurationsMs.reduce((sum, ms) => sum + ms / (60 * 60 * 1000), 0) / planningDurationsMs.length;

    const averageExecutionHours =
      executionDurationsMs.length === 0
        ? null
        : executionDurationsMs.reduce((sum, ms) => sum + ms / (60 * 60 * 1000), 0) / executionDurationsMs.length;

    // Overdue evaluated against period boundary `range.to`
    const overdueCount = requests.filter((r) => r.expiresAt && r.expiresAt < range.to && r.status !== "RESOLVED").length;

    // Critical rejections later approved on the same job
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

    const sentRequestsCount = requests.filter((r) => r.sentAt !== null).length;
    const viewedRequestsCount = requests.filter((r) => r.status !== "PENDING" && r.status !== "SENT").length;

    const approvalRate = safeDivide(approvedCount, totalItems) * 100;
    const rejectionRate = safeDivide(rejectedCount, totalItems) * 100;
    const planningRate = safeDivide(plannedCount, approvedCount) * 100;
    const executionRate = safeDivide(startedCount, approvedCount) * 100;
    const fulfillmentRate = safeDivide(performedCount, approvedCount) * 100;
    const dropOffRate = safeDivide(approvedCount - performedCount, approvedCount) * 100;
    const responseRate = safeDivide(respondedItems, sentItems) * 100;

    const outcomes: DecisionOutcomeRow[] = ALL_OUTCOMES.map((outcome) => {
      const entry = outcomeCounts.get(outcome)!;
      return {
        outcome,
        label: OUTCOME_LABEL[outcome],
        count: entry.count,
        totalValue: entry.totalValue,
      };
    });

    const byImportance: ApprovalByImportanceRow[] = [...byImportanceMap.entries()].map(([importance, row]) => ({
      importance,
      total: row.total,
      approved: row.approved,
      rejected: row.rejected,
      pending: row.pending,
      performed: row.performed,
      approvedValue: row.approvedValue,
      performedValue: row.performedValue,
      lostValue: row.lostValue,
    }));

    return {
      range: { from: range.from.toISOString(), to: range.to.toISOString() },

      // Backward compatibility top-level fields
      approvalRate,
      rejectionRate,
      planningRate,
      executionRate,
      fulfillmentRate,
      dropOffRate,
      byImportance,
      averageResponseHours,
      overdueRate: safeDivide(overdueCount, requests.length) * 100,
      criticalRejections,
      criticalRejectionsLaterApproved,
      linkOpenRate: safeDivide(viewedRequestsCount, sentRequestsCount) * 100,

      // Closed-Loop Intelligence structures
      funnel: {
        recommendationsCreated: totalItems,
        sent: sentItems,
        viewed: viewedItems,
        responded: respondedItems,
        approved: approvedCount,
        planned: plannedCount,
        started: startedCount,
        performed: performedCount,
        invoiced: null,
        invoicedNotComputableReason: NOT_COMPUTABLE_INVOICED_REASON,
        collected: null,
        collectedNotComputableReason: NOT_COMPUTABLE_COLLECTED_REASON,
      },
      rates: {
        responseRate,
        approvalRate,
        rejectionRate,
        planningRate,
        executionRate,
        fulfillmentRate,
        dropOffRate,
      },
      value: {
        currency,
        totalRecommendedValue,
        approvedValue,
        plannedValue,
        performedValue,
        unperformedApprovedValue,
        invoicedValue: null,
        invoicedValueNotComputableReason: NOT_COMPUTABLE_INVOICED_REASON,
        collectedValue: null,
        collectedValueNotComputableReason: NOT_COMPUTABLE_COLLECTED_REASON,
      },
      unperformedBreakdown,
      outcomes,
      timing: {
        averageResponseHours,
        averagePlanningHours,
        averageExecutionHours,
      },
      integrity: {
        approvedWithoutTasks: unperformedBreakdown.noWorkLinked.count,
        terminalWithoutExecution: unperformedBreakdown.abandonedTerminal.count,
      },
    };
  }
}
