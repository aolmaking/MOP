/**
 * Phase 2 -- Prompt 8: Root-Cause Analysis Engine Types
 *
 * Strict separation between:
 * - OBSERVED_FACT: directly recorded measurements, timestamps, structured enums.
 * - RULE_BASED_CONTRIBUTOR: deterministic domain rule evaluation where evidence supports a pattern.
 * - STRONG_ASSOCIATION: statistically elevated pattern against an authoritative baseline.
 * - CAUSAL_LINK: reserved ONLY where an explicit authoritative direct domain causal link exists.
 * - INSUFFICIENT_EVIDENCE: when data is sparse, sample size is below threshold, or baseline is missing.
 */

export type DiagnosticSubject =
  | "WORK_ORDER_DELAY"
  | "WORKFLOW_BOTTLENECK"
  | "QC_FAILURE"
  | "TASK_REWORK"
  | "REPEAT_VEHICLE_VISIT"
  | "FAULT_RECURRENCE"
  | "CUSTOMER_DECISION_DROP_OFF"
  | "DELIVERY_DELAY";

export type DiagnosticEvidenceLevel =
  | "OBSERVED_FACT"
  | "RULE_BASED_CONTRIBUTOR"
  | "STRONG_ASSOCIATION"
  | "CAUSAL_LINK"
  | "INSUFFICIENT_EVIDENCE";

export interface DiagnosticEvidenceReference {
  readonly type: "WORK_ORDER" | "TASK" | "EVENT" | "FAULT" | "DECISION_ITEM" | "BLOCKER";
  readonly id: string;
  readonly label?: string;
  readonly workOrderId?: string;
  readonly timestamp?: string;
}

export interface DiagnosticFact {
  readonly key: string;
  readonly label: string;
  readonly value: string | number;
  readonly unit?: string;
  readonly evidenceLevel: "OBSERVED_FACT";
  readonly explanation: string;
  readonly evidenceIds?: readonly string[];
}

export interface DiagnosticFactor {
  readonly key: string;
  readonly label: string;
  readonly category: string;
  readonly observedCount?: number;
  readonly baselineCount?: number;
  readonly rate?: number | null;
  readonly baselineRate?: number | null;
  readonly delta?: number | null;
  readonly evidenceLevel: DiagnosticEvidenceLevel;
  readonly explanation: string;
  readonly evidenceIds?: readonly string[];
}

export interface DiagnosticUnknown {
  readonly key: string;
  readonly question: string;
  readonly reason: string;
}

export interface DiagnosticIntegrity {
  readonly sampleSize: number;
  readonly baselineAvailable: boolean;
  readonly baselineSampleSize?: number;
  readonly insufficientSampleSize: boolean;
  readonly historicalAttributionComplete: boolean;
  readonly causalInferenceSupported: boolean;
  readonly financialAttributionComputable: boolean;
  readonly financialAttributionNote?: string;
}

export interface DiagnosticOutcomeSummary {
  readonly title: string;
  readonly description: string;
  readonly metricName: string;
  readonly metricValue: number | string | null;
  readonly metricUnit?: string;
}

export interface RootCauseAnalysisReport {
  readonly subject: DiagnosticSubject;
  readonly period: { readonly from: string; readonly to: string };
  readonly scope: {
    readonly tenantId: string;
    readonly branchId?: string;
    readonly serviceKey?: string;
    readonly technicianId?: string;
    readonly workOrderId?: string;
  };
  readonly outcome: DiagnosticOutcomeSummary;
  readonly evidenceLevel: DiagnosticEvidenceLevel;
  readonly summary: string;
  readonly observedFacts: readonly DiagnosticFact[];
  readonly contributingFactors: readonly DiagnosticFactor[];
  readonly evidenceReferences: readonly DiagnosticEvidenceReference[];
  readonly unknowns: readonly DiagnosticUnknown[];
  readonly integrity: DiagnosticIntegrity;
}

export interface RootCauseQueryParams {
  readonly subject?: DiagnosticSubject;
  readonly from?: string;
  readonly to?: string;
  readonly branchId?: string;
  readonly serviceKey?: string;
  readonly technicianId?: string;
  readonly workOrderId?: string;
}
