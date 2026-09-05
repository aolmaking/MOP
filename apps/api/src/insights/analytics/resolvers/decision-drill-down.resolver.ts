import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../runtime/database/prisma.service";
import type { AnalyticsScope } from "../analytics-scope.util";
import type {
  DrillDownQuery,
  DrillDownResult,
  DrillDownRecord,
  DrillDownDimensionBreakdown,
  EvidenceReference,
} from "../drill-down.types";
import type { DrillDownResolver } from "./drill-down-resolver.interface";
import { decodeCursor, paginateRecords, resolvePageLimit } from "../drill-down-pagination.util";
import { resolveOutcome } from "../../../systems/operations/history/recommendation-outcome";
import { toDecimalNumber } from "../../owner-reports/date-range.util";

@Injectable()
export class DecisionDrillDownResolver implements DrillDownResolver {
  readonly supportedMetrics = [
    "recommendations",
    "approvedDecisions",
    "plannedDecisions",
    "startedDecisions",
    "performedDecisions",
    "unperformedDecisions",
  ] as const;

  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    tenantId: string,
    scope: AnalyticsScope,
    query: DrillDownQuery,
    range: { from: Date; to: Date },
  ): Promise<DrillDownResult> {
    const effectiveBranchId = query.branchId ?? (scope.branchIds.length === 1 ? scope.branchIds[0] : undefined);
    const scopeFilter = effectiveBranchId ? { workOrder: { branchId: effectiveBranchId } } : {};
    const limit = resolvePageLimit(query.limit);
    const cursor = decodeCursor(query.cursor);

    const requests = await this.prisma.customerDecisionRequest.findMany({
      where: {
        tenantId,
        createdAt: { gte: range.from, lte: range.to },
        ...scopeFilter,
      },
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
            branchId: true,
            asset: { select: { plateNumber: true } },
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
                serviceKey: true,
                startedAt: true,
                completedAt: true,
                createdAt: true,
                updatedAt: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const rawRecords: DrillDownRecord[] = [];
    const dimensionCounts = new Map<string, number>();

    for (const request of requests) {
      for (const item of request.items) {
        const itemTotal = toDecimalNumber(item.total);

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

        const isApproved = item.decision === "APPROVED";
        const hasTasks = item.tasks.length > 0;
        const hasStarted = item.tasks.some(
          (t) => t.status === "IN_PROGRESS" || t.status === "DONE" || t.startedAt !== null,
        );
        const isPerformed = outcomeResult.outcome === "PERFORMED";

        let matchesMetric = false;
        switch (query.metric) {
          case "recommendations":
            matchesMetric = true;
            break;
          case "approvedDecisions":
            matchesMetric = isApproved;
            break;
          case "plannedDecisions":
            matchesMetric = isApproved && hasTasks;
            break;
          case "startedDecisions":
            matchesMetric = isApproved && hasStarted;
            break;
          case "performedDecisions":
            matchesMetric = isApproved && isPerformed;
            break;
          case "unperformedDecisions":
            matchesMetric = isApproved && !isPerformed;
            break;
        }

        if (!matchesMetric) continue;

        // Apply dimension filter
        const dimKey = query.dimension ?? "importance";
        let dimVal: string = item.importance;
        if (dimKey === "branch") dimVal = request.workOrder.branchId ?? "UNASSIGNED";
        if (dimKey === "dropOffStage") dimVal = outcomeResult.outcome;
        if (dimKey === "decision") dimVal = item.decision;

        if (query.dimension && query.dimensionValue && dimVal !== query.dimensionValue) {
          continue;
        }

        dimensionCounts.set(dimVal, (dimensionCounts.get(dimVal) ?? 0) + 1);

        const occurredAt = item.decidedAt
          ? item.decidedAt.toISOString()
          : request.createdAt.toISOString();

        const evidenceReferences: EvidenceReference[] = [
          {
            entityType: "CUSTOMER_DECISION_ITEM",
            entityId: item.id,
            tenantId,
            workOrderId: request.workOrderId,
            occurredAt,
            label: `Decision Item: ${item.name} ($${itemTotal})`,
          },
          {
            entityType: "WORK_ORDER",
            entityId: request.workOrderId,
            tenantId,
            workOrderId: request.workOrderId,
            label: `Work Order #${request.workOrderId.slice(-6)}`,
          },
        ];

        for (const task of item.tasks) {
          evidenceReferences.push({
            entityType: "TASK",
            entityId: task.id,
            tenantId,
            workOrderId: request.workOrderId,
            taskId: task.id,
            occurredAt: task.createdAt.toISOString(),
            relation: "PLANNED_TASK_LINK",
            label: `Linked Task: ${task.title} (${task.status})`,
          });
        }

        rawRecords.push({
          entityType: "CUSTOMER_DECISION_ITEM",
          entityId: item.id,
          label: `${item.name} - ${item.decision} ($${itemTotal})`,
          occurredAt,
          status: item.decision,
          branchId: request.workOrder.branchId,
          workOrderId: request.workOrderId,
          attributes: {
            itemName: item.name,
            importance: item.importance,
            decision: item.decision,
            totalPrice: itemTotal,
            canonicalOutcome: outcomeResult.outcome,
            tasksPlannedCount: item.tasks.length,
            tasksCompletedCount: item.tasks.filter((t) => t.status === "DONE").length,
            plateNumber: request.workOrder.asset?.plateNumber ?? null,
            workOrderStatus: request.workOrder.status,
          },
          evidenceReferences,
        });
      }
    }

    const { items, nextCursor } = paginateRecords(rawRecords, limit, cursor);

    let label = "Customer Decision Intelligence";
    switch (query.metric) {
      case "recommendations":
        label = "Repair Recommendations";
        break;
      case "approvedDecisions":
        label = "Approved Decisions";
        break;
      case "plannedDecisions":
        label = "Planned Decisions";
        break;
      case "startedDecisions":
        label = "Started Decisions";
        break;
      case "performedDecisions":
        label = "Performed Decisions";
        break;
      case "unperformedDecisions":
        label = "Unperformed Approved Decisions";
        break;
    }

    const dimensions: DrillDownDimensionBreakdown[] = Array.from(dimensionCounts.entries()).map(([val, cnt]) => ({
      key: query.dimension ?? "importance",
      value: val,
      label: val,
      count: cnt,
    }));

    return {
      metric: {
        key: query.metric,
        label,
        value: rawRecords.length,
        unit: "items",
        period: { from: range.from.toISOString(), to: range.to.toISOString() },
      },
      activeFilters: {
        branchId: query.branchId,
        dimension: query.dimension,
        dimensionValue: query.dimensionValue,
      },
      dimensions,
      records: items,
      nextCursor,
      integrity: {
        totalMatchingRecords: rawRecords.length,
        returnedRecords: items.length,
        historicalAttributionPreserved: true,
        financialAttributionComputable: false,
        financialAttributionNote:
          "Invoiced and collected values at the decision item level are strictly not computable because invoice lines do not have authoritative direct links to decision items.",
        dataHonestyDisclaimer:
          "Customer approval is distinct from workshop task execution. Canonical outcomes are resolved per recommendation-outcome.ts.",
      },
    };
  }
}
