import { Injectable } from "@nestjs/common";
import { RootCauseAnalysisService } from "../root-cause-analysis.service";
import type { AnalyticsScope } from "../analytics-scope.util";
import type {
  DrillDownQuery,
  DrillDownResult,
  DrillDownRecord,
  DrillDownDimensionBreakdown,
  EvidenceReference,
  EvidenceEntityType,
} from "../drill-down.types";
import type { DrillDownResolver } from "./drill-down-resolver.interface";
import { decodeCursor, paginateRecords, resolvePageLimit } from "../drill-down-pagination.util";
import type { DiagnosticSubject } from "../root-cause-analysis.types";

@Injectable()
export class RootCauseDrillDownResolver implements DrillDownResolver {
  readonly supportedMetrics = ["diagnosticFindings"] as const;

  constructor(private readonly rcaService: RootCauseAnalysisService) {}

  async resolve(
    tenantId: string,
    scope: AnalyticsScope,
    query: DrillDownQuery,
    range: { from: Date; to: Date },
  ): Promise<DrillDownResult> {
    const subject = (query.dimensionValue as DiagnosticSubject) ?? "WORK_ORDER_DELAY";
    const limit = resolvePageLimit(query.limit);
    const cursor = decodeCursor(query.cursor);

    // Call Prompt 8 Canonical Root Cause Analysis Service
    const rcaReport = await this.rcaService.analyze(tenantId, scope, {
      subject,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      branchId: query.branchId,
      serviceKey: query.serviceKey,
      technicianId: query.technicianId,
      workOrderId: query.workOrderId,
    });

    const rawRecords: DrillDownRecord[] = [];
    const dimensionCounts = new Map<string, number>();

    // Add Contributing Factors
    for (const factor of rcaReport.contributingFactors) {
      const dimVal = factor.evidenceLevel;
      dimensionCounts.set(dimVal, (dimensionCounts.get(dimVal) ?? 0) + 1);

      const evidenceReferences: EvidenceReference[] = rcaReport.evidenceReferences
        .filter((ref) => !factor.evidenceIds || factor.evidenceIds.includes(ref.id))
        .map((ref) => ({
          entityType: ref.type as EvidenceEntityType,
          entityId: ref.id,
          tenantId,
          workOrderId: ref.workOrderId,
          occurredAt: ref.timestamp,
          label: ref.label,
        }));

      rawRecords.push({
        entityType: "OPERATION_EVENT",
        entityId: `rca-factor-${factor.key}`,
        label: `${factor.label} (${factor.evidenceLevel})`,
        occurredAt: range.to.toISOString(),
        branchId: query.branchId,
        attributes: {
          factorKey: factor.key,
          category: factor.category,
          evidenceLevel: factor.evidenceLevel,
          observedCount: factor.observedCount,
          rate: factor.rate,
          baselineRate: factor.baselineRate,
          delta: factor.delta,
          explanation: factor.explanation,
        },
        evidenceReferences,
      });
    }

    // Add Observed Facts
    for (const fact of rcaReport.observedFacts) {
      dimensionCounts.set("OBSERVED_FACT", (dimensionCounts.get("OBSERVED_FACT") ?? 0) + 1);

      rawRecords.push({
        entityType: "OPERATION_EVENT",
        entityId: `rca-fact-${fact.key}`,
        label: `${fact.label}: ${fact.value} ${fact.unit ?? ""}`,
        occurredAt: range.to.toISOString(),
        branchId: query.branchId,
        attributes: {
          factKey: fact.key,
          evidenceLevel: "OBSERVED_FACT",
          value: fact.value,
          unit: fact.unit,
          explanation: fact.explanation,
        },
      });
    }

    const { items, nextCursor } = paginateRecords(rawRecords, limit, cursor);

    const dimensions: DrillDownDimensionBreakdown[] = Array.from(dimensionCounts.entries()).map(([val, cnt]) => ({
      key: "evidenceLevel",
      value: val,
      label: val,
      count: cnt,
    }));

    return {
      metric: {
        key: "diagnosticFindings",
        label: `Diagnostic Findings: ${rcaReport.outcome.title}`,
        value: rawRecords.length,
        unit: "findings",
        period: { from: range.from.toISOString(), to: range.to.toISOString() },
      },
      activeFilters: {
        branchId: query.branchId,
        dimension: "subject",
        dimensionValue: subject,
      },
      dimensions,
      records: items,
      nextCursor,
      integrity: {
        totalMatchingRecords: rawRecords.length,
        returnedRecords: items.length,
        historicalAttributionPreserved: true,
        financialAttributionComputable: rcaReport.integrity.financialAttributionComputable,
        financialAttributionNote: rcaReport.integrity.financialAttributionNote,
        dataHonestyDisclaimer:
          "Root-cause findings preserve strict Prompt 8 evidence tiers: OBSERVED_FACT, RULE_BASED_CONTRIBUTOR, STRONG_ASSOCIATION, CAUSAL_LINK, and INSUFFICIENT_EVIDENCE.",
      },
    };
  }
}
