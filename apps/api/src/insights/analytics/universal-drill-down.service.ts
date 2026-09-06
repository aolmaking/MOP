import { ForbiddenException, Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../runtime/database/prisma.service";
import { resolveDateRange } from "../owner-reports/date-range.util";
import type { AnalyticsScope } from "./analytics-scope.util";
import type {
  DrillDownQuery,
  DrillDownResult,
  EvidenceEntityType,
  EvidenceReference,
} from "./drill-down.types";
import { getMetricDefinition } from "./metric-catalog.registry";
import { QualityDrillDownResolver } from "./resolvers/quality-drill-down.resolver";
import { DecisionDrillDownResolver } from "./resolvers/decision-drill-down.resolver";
import { FinancialDrillDownResolver } from "./resolvers/financial-drill-down.resolver";
import { OperationsDrillDownResolver } from "./resolvers/operations-drill-down.resolver";
import { RootCauseDrillDownResolver } from "./resolvers/root-cause-drill-down.resolver";
import { reportToCsv } from "./csv.util";

@Injectable()
export class UniversalDrillDownService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly qualityResolver: QualityDrillDownResolver,
    private readonly decisionResolver: DecisionDrillDownResolver,
    private readonly financialResolver: FinancialDrillDownResolver,
    private readonly operationsResolver: OperationsDrillDownResolver,
    private readonly rootCauseResolver: RootCauseDrillDownResolver,
  ) {}

  async drillDown(
    tenantId: string,
    scope: AnalyticsScope,
    query: DrillDownQuery,
  ): Promise<DrillDownResult> {
    // 1. Validate metric registration
    const metricDef = getMetricDefinition(query.metric);

    // 2. Validate date range
    const range = resolveDateRange(query);

    // 3. Security: Independently enforce branch authorization
    if (query.branchId && scope.branchIds.length > 0 && !scope.branchIds.includes(query.branchId)) {
      throw new ForbiddenException({
        code: "forbidden_branch",
        message: "You are not authorized to view drill-down records for this branch.",
      });
    }

    // 4. Route to domain resolver
    if (this.qualityResolver.supportedMetrics.includes(query.metric as any)) {
      return this.qualityResolver.resolve(tenantId, scope, query, range);
    }
    if (this.decisionResolver.supportedMetrics.includes(query.metric as any)) {
      return this.decisionResolver.resolve(tenantId, scope, query, range);
    }
    if (this.financialResolver.supportedMetrics.includes(query.metric as any)) {
      return this.financialResolver.resolve(tenantId, scope, query, range);
    }
    if (this.operationsResolver.supportedMetrics.includes(query.metric as any)) {
      return this.operationsResolver.resolve(tenantId, scope, query, range);
    }
    if (this.rootCauseResolver.supportedMetrics.includes(query.metric as any)) {
      return this.rootCauseResolver.resolve(tenantId, scope, query, range);
    }

    throw new BadRequestException({
      code: "unhandled_metric",
      message: `Metric '${query.metric}' does not have an active resolver.`,
    });
  }

  // ==========================================================================
  // RESOLVE SINGLE EVIDENCE REFERENCE
  // ==========================================================================
  async resolveEvidence(
    tenantId: string,
    scope: AnalyticsScope,
    entityType: EvidenceEntityType,
    entityId: string,
  ): Promise<Record<string, unknown>> {
    switch (entityType) {
      case "WORK_ORDER": {
        const wo = await this.prisma.workOrder.findFirst({
          where: { id: entityId, tenantId },
          select: {
            id: true,
            status: true,
            branchId: true,
            createdAt: true,
            closedAt: true,
            qcFailureReason: true,
            asset: { select: { plateNumber: true, category: true } },
          },
        });
        if (!wo) throw new NotFoundException("Work order not found");
        if (wo.branchId && scope.branchIds.length > 0 && !scope.branchIds.includes(wo.branchId)) {
          throw new ForbiddenException("Unauthorized branch");
        }
        const events = await this.prisma.operationEvent.findMany({
          where: { workOrderId: wo.id, tenantId },
          orderBy: { createdAt: "asc" },
        });
        return {
          entityType: "WORK_ORDER",
          id: wo.id,
          status: wo.status,
          branchId: wo.branchId,
          createdAt: wo.createdAt.toISOString(),
          closedAt: wo.closedAt?.toISOString() ?? null,
          qcFailureReason: wo.qcFailureReason,
          plateNumber: wo.asset?.plateNumber ?? null,
          timelineEvents: events.map((ev) => ({
            id: ev.id,
            eventType: ev.eventKey,
            createdAt: ev.createdAt.toISOString(),
            payload: ev.payload,
          })),
        };
      }

      case "TASK": {
        const task = await this.prisma.task.findFirst({
          where: { id: entityId, tenantId },
          select: {
            id: true,
            title: true,
            status: true,
            workOrderId: true,
            serviceKey: true,
            originalTaskId: true,
            reworkReason: true,
            reworkNote: true,
            actualMinutes: true,
            createdAt: true,
            completedAt: true,
            workOrder: { select: { branchId: true } },
          },
        });
        if (!task) throw new NotFoundException("Task not found");
        if (task.workOrder.branchId && scope.branchIds.length > 0 && !scope.branchIds.includes(task.workOrder.branchId)) {
          throw new ForbiddenException("Unauthorized branch");
        }
        return {
          entityType: "TASK",
          id: task.id,
          title: task.title,
          status: task.status,
          workOrderId: task.workOrderId,
          serviceKey: task.serviceKey,
          originalTaskId: task.originalTaskId,
          reworkReason: task.reworkReason,
          reworkNote: task.reworkNote,
          actualMinutes: task.actualMinutes,
          createdAt: task.createdAt.toISOString(),
          completedAt: task.completedAt?.toISOString() ?? null,
        };
      }

      case "OPERATION_EVENT": {
        const ev = await this.prisma.operationEvent.findFirst({
          where: { id: entityId, tenantId },
        });
        if (!ev) throw new NotFoundException("Event not found");
        if (ev.branchId && scope.branchIds.length > 0 && !scope.branchIds.includes(ev.branchId)) {
          throw new ForbiddenException("Unauthorized branch");
        }
        return {
          entityType: "OPERATION_EVENT",
          id: ev.id,
          eventKey: ev.eventKey,
          workOrderId: ev.workOrderId,
          branchId: ev.branchId,
          payload: ev.payload,
          createdAt: ev.createdAt.toISOString(),
        };
      }

      case "FAULT": {
        const fault = await this.prisma.fault.findFirst({
          where: { id: entityId, tenantId },
          include: { workOrder: { select: { branchId: true } } },
        });
        if (!fault) throw new NotFoundException("Fault not found");
        if (fault.workOrder.branchId && scope.branchIds.length > 0 && !scope.branchIds.includes(fault.workOrder.branchId)) {
          throw new ForbiddenException("Unauthorized branch");
        }
        return {
          entityType: "FAULT",
          id: fault.id,
          code: fault.code,
          description: fault.description,
          severity: fault.severity,
          workOrderId: fault.workOrderId,
          createdAt: fault.createdAt.toISOString(),
        };
      }

      case "CUSTOMER_DECISION_ITEM": {
        const item = await this.prisma.customerDecisionItem.findFirst({
          where: { id: entityId, tenantId },
          include: { decisionRequest: { include: { workOrder: { select: { branchId: true } } } } },
        });
        if (!item) throw new NotFoundException("Decision item not found");
        const branchId = item.decisionRequest.workOrder.branchId;
        if (branchId && scope.branchIds.length > 0 && !scope.branchIds.includes(branchId)) {
          throw new ForbiddenException("Unauthorized branch");
        }
        return {
          entityType: "CUSTOMER_DECISION_ITEM",
          id: item.id,
          name: item.name,
          importance: item.importance,
          decision: item.decision,
          total: item.total,
          workOrderId: item.decisionRequest.workOrderId,
          createdAt: item.decidedAt ? item.decidedAt.toISOString() : item.decisionRequest.createdAt.toISOString(),
        };
      }

      case "INVOICE": {
        const inv = await this.prisma.invoice.findFirst({
          where: { id: entityId, tenantId },
          include: { workOrder: { select: { branchId: true } } },
        });
        if (!inv) throw new NotFoundException("Invoice not found");
        const branchId = inv.branchId ?? inv.workOrder.branchId;
        if (branchId && scope.branchIds.length > 0 && !scope.branchIds.includes(branchId)) {
          throw new ForbiddenException("Unauthorized branch");
        }
        return {
          entityType: "INVOICE",
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          total: inv.total,
          paid: inv.paid,
          status: inv.status,
          issuedAt: inv.issuedAt?.toISOString() ?? null,
          workOrderId: inv.workOrderId,
        };
      }

      default:
        throw new BadRequestException(`Entity type '${entityType}' cannot be resolved directly.`);
    }
  }

  // ==========================================================================
  // EXPORT DRILL-DOWN RECORDS TO CSV
  // ==========================================================================
  async exportCsv(
    tenantId: string,
    scope: AnalyticsScope,
    query: DrillDownQuery,
  ): Promise<{ filename: string; csv: string }> {
    // Unlimited (max 1000) for export
    const result = await this.drillDown(tenantId, scope, { ...query, limit: 1000 });

    const exportRows = result.records.map((r) => ({
      entityType: r.entityType,
      entityId: r.entityId,
      label: r.label,
      occurredAt: r.occurredAt,
      status: r.status ?? "",
      branchId: r.branchId ?? "",
      workOrderId: r.workOrderId ?? "",
      taskId: r.taskId ?? "",
      ...r.attributes,
    }));

    const reportShape = {
      Metric: result.metric.label,
      Value: result.metric.value,
      Unit: result.metric.unit ?? "",
      From: result.metric.period.from,
      To: result.metric.period.to,
      TotalRecords: result.integrity.totalMatchingRecords,
      HistoricalAttributionPreserved: result.integrity.historicalAttributionPreserved,
      Records: exportRows,
    };

    const csv = reportToCsv(reportShape);
    const filename = `drill-down-${query.metric}-${result.metric.period.from.slice(0, 10)}.csv`;

    return { filename, csv };
  }
}
