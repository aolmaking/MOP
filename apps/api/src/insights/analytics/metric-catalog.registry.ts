import { BadRequestException } from "@nestjs/common";
import type { DrillDownMetricDefinition } from "./drill-down.types";

export const REGISTERED_METRICS: readonly DrillDownMetricDefinition[] = [
  // --------------------------------------------------------------------------
  // Operations & Workflow (Phase 1 / Prompt 3/4/5)
  // --------------------------------------------------------------------------
  {
    metricKey: "completedWorkOrders",
    label: "Completed Work Orders",
    sourceSystem: "OperationsAnalyticsService",
    canonicalResolverKey: "OPERATIONS_COMPLETED_JOBS",
    supportedDimensions: ["branch", "service"],
    supportsEntityDrillDown: true,
    supportsEventEvidence: true,
    supportsHistoricalAsOf: true,
    defaultUnit: "jobs",
  },
  {
    metricKey: "delayedWorkOrders",
    label: "Delayed Work Orders",
    sourceSystem: "OperationsAnalyticsService",
    canonicalResolverKey: "OPERATIONS_DELAYED_JOBS",
    supportedDimensions: ["branch", "waitingStatus"],
    supportsEntityDrillDown: true,
    supportsEventEvidence: true,
    supportsHistoricalAsOf: true,
    defaultUnit: "jobs",
  },
  {
    metricKey: "waitingTime",
    label: "Waiting Time Dwell",
    sourceSystem: "OperationsAnalyticsService",
    canonicalResolverKey: "OPERATIONS_WAITING_DWELL",
    supportedDimensions: ["branch", "status"],
    supportsEntityDrillDown: true,
    supportsEventEvidence: true,
    supportsHistoricalAsOf: true,
    defaultUnit: "hours",
  },
  {
    metricKey: "bottleneckCount",
    label: "Workflow Bottleneck Jobs",
    sourceSystem: "WorkflowBottlenecksService",
    canonicalResolverKey: "WORKFLOW_BOTTLENECK_JOBS",
    supportedDimensions: ["branch", "stage"],
    supportsEntityDrillDown: true,
    supportsEventEvidence: true,
    supportsHistoricalAsOf: true,
    defaultUnit: "jobs",
  },

  // --------------------------------------------------------------------------
  // Quality & Rework (Phase 2 / Prompt 7)
  // --------------------------------------------------------------------------
  {
    metricKey: "qcEvaluations",
    label: "QC Evaluations",
    sourceSystem: "QualityAnalyticsService",
    canonicalResolverKey: "QUALITY_QC_EVALUATIONS",
    supportedDimensions: ["branch", "service", "result"],
    supportsEntityDrillDown: true,
    supportsEventEvidence: true,
    supportsHistoricalAsOf: true,
    defaultUnit: "evaluations",
  },
  {
    metricKey: "firstPassYield",
    label: "First Pass Yield",
    sourceSystem: "QualityAnalyticsService",
    canonicalResolverKey: "QUALITY_FIRST_PASS_YIELD",
    supportedDimensions: ["branch", "service"],
    supportsEntityDrillDown: true,
    supportsEventEvidence: true,
    supportsHistoricalAsOf: true,
    defaultUnit: "percent",
  },
  {
    metricKey: "qcFailures",
    label: "QC Failures",
    sourceSystem: "QualityAnalyticsService",
    canonicalResolverKey: "QUALITY_QC_FAILURES",
    supportedDimensions: ["branch", "service", "reason"],
    supportsEntityDrillDown: true,
    supportsEventEvidence: true,
    supportsHistoricalAsOf: true,
    defaultUnit: "failures",
  },
  {
    metricKey: "taskReworkRate",
    label: "Task Rework Rate",
    sourceSystem: "QualityAnalyticsService",
    canonicalResolverKey: "QUALITY_TASK_REWORK",
    supportedDimensions: ["branch", "service", "technician", "reason"],
    supportsEntityDrillDown: true,
    supportsEventEvidence: true,
    supportsHistoricalAsOf: true,
    defaultUnit: "percent",
  },
  {
    metricKey: "repeatVehicleVisits",
    label: "Repeat Vehicle Visits (30d)",
    sourceSystem: "QualityAnalyticsService",
    canonicalResolverKey: "QUALITY_REPEAT_VISITS",
    supportedDimensions: ["branch", "serviceOverlap"],
    supportsEntityDrillDown: true,
    supportsEventEvidence: true,
    supportsHistoricalAsOf: true,
    defaultUnit: "visits",
  },
  {
    metricKey: "faultRecurrence",
    label: "Fault Recurrence",
    sourceSystem: "QualityAnalyticsService",
    canonicalResolverKey: "QUALITY_FAULT_RECURRENCE",
    supportedDimensions: ["branch", "severity", "code"],
    supportsEntityDrillDown: true,
    supportsEventEvidence: true,
    supportsHistoricalAsOf: true,
    defaultUnit: "occurrences",
  },

  // --------------------------------------------------------------------------
  // Customer Decisions (Phase 2 / Prompt 6)
  // --------------------------------------------------------------------------
  {
    metricKey: "recommendations",
    label: "Repair Recommendations",
    sourceSystem: "DecisionsAnalyticsService",
    canonicalResolverKey: "DECISION_RECOMMENDATIONS",
    supportedDimensions: ["branch", "importance"],
    supportsEntityDrillDown: true,
    supportsEventEvidence: false,
    supportsHistoricalAsOf: true,
    defaultUnit: "items",
  },
  {
    metricKey: "approvedDecisions",
    label: "Customer Approved Repairs",
    sourceSystem: "DecisionsAnalyticsService",
    canonicalResolverKey: "DECISION_APPROVED",
    supportedDimensions: ["branch", "importance"],
    supportsEntityDrillDown: true,
    supportsEventEvidence: false,
    supportsHistoricalAsOf: true,
    defaultUnit: "items",
  },
  {
    metricKey: "plannedDecisions",
    label: "Approved Repairs Planned into Tasks",
    sourceSystem: "DecisionsAnalyticsService",
    canonicalResolverKey: "DECISION_PLANNED",
    supportedDimensions: ["branch", "service"],
    supportsEntityDrillDown: true,
    supportsEventEvidence: true,
    supportsHistoricalAsOf: true,
    defaultUnit: "items",
  },
  {
    metricKey: "startedDecisions",
    label: "Approved Repairs with Started Work",
    sourceSystem: "DecisionsAnalyticsService",
    canonicalResolverKey: "DECISION_STARTED",
    supportedDimensions: ["branch", "technician"],
    supportsEntityDrillDown: true,
    supportsEventEvidence: true,
    supportsHistoricalAsOf: true,
    defaultUnit: "items",
  },
  {
    metricKey: "performedDecisions",
    label: "Approved Repairs Performed (Completed)",
    sourceSystem: "DecisionsAnalyticsService",
    canonicalResolverKey: "DECISION_PERFORMED",
    supportedDimensions: ["branch", "technician"],
    supportsEntityDrillDown: true,
    supportsEventEvidence: true,
    supportsHistoricalAsOf: true,
    defaultUnit: "items",
  },
  {
    metricKey: "unperformedDecisions",
    label: "Approved Repairs Unperformed (Drop-Off)",
    sourceSystem: "DecisionsAnalyticsService",
    canonicalResolverKey: "DECISION_UNPERFORMED",
    supportedDimensions: ["branch", "dropOffStage"],
    supportsEntityDrillDown: true,
    supportsEventEvidence: false,
    supportsHistoricalAsOf: true,
    defaultUnit: "items",
  },

  // --------------------------------------------------------------------------
  // Financial Intelligence (Phase 1 / Prompt 2)
  // --------------------------------------------------------------------------
  {
    metricKey: "invoicedRevenue",
    label: "Invoiced Revenue",
    sourceSystem: "ReportsFinancialService",
    canonicalResolverKey: "FINANCIAL_INVOICED_REVENUE",
    supportedDimensions: ["branch", "status"],
    supportsEntityDrillDown: true,
    supportsEventEvidence: false,
    supportsHistoricalAsOf: true,
    defaultUnit: "currency",
  },
  {
    metricKey: "collectedCash",
    label: "Collected Cash",
    sourceSystem: "ReportsFinancialService",
    canonicalResolverKey: "FINANCIAL_COLLECTED_CASH",
    supportedDimensions: ["branch", "paymentMethod"],
    supportsEntityDrillDown: true,
    supportsEventEvidence: false,
    supportsHistoricalAsOf: true,
    defaultUnit: "currency",
  },

  // --------------------------------------------------------------------------
  // Root-Cause Findings (Phase 2 / Prompt 8)
  // --------------------------------------------------------------------------
  {
    metricKey: "diagnosticFindings",
    label: "Root-Cause Diagnostic Findings",
    sourceSystem: "RootCauseAnalysisService",
    canonicalResolverKey: "ROOT_CAUSE_FINDINGS",
    supportedDimensions: ["subject", "evidenceLevel"],
    supportsEntityDrillDown: true,
    supportsEventEvidence: true,
    supportsHistoricalAsOf: true,
    defaultUnit: "findings",
  },
];

const METRIC_MAP = new Map<string, DrillDownMetricDefinition>(
  REGISTERED_METRICS.map((m) => [m.metricKey, m]),
);

export function getMetricDefinition(metricKey: string): DrillDownMetricDefinition {
  const def = METRIC_MAP.get(metricKey);
  if (!def) {
    throw new BadRequestException({
      code: "unregistered_metric",
      message: `Metric '${metricKey}' is not registered for universal drill-down. Only authoritative, evidence-traceable metrics are supported.`,
    });
  }
  return def;
}
