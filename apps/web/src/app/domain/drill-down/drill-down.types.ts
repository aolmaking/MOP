export type EvidenceEntityType =
  | "WORK_ORDER"
  | "TASK"
  | "TASK_ASSIGNMENT"
  | "OPERATION_EVENT"
  | "FAULT"
  | "CUSTOMER_DECISION"
  | "CUSTOMER_DECISION_ITEM"
  | "INVOICE"
  | "INVOICE_LINE"
  | "PAYMENT"
  | "CREDIT_NOTE"
  | "REFUND"
  | "VEHICLE"
  | "BRANCH"
  | "TECHNICIAN"
  | "SERVICE"
  | "PART"
  | "TASK_BLOCKER";

export interface EvidenceReference {
  readonly entityType: EvidenceEntityType;
  readonly entityId: string;
  readonly tenantId: string;
  readonly workOrderId?: string;
  readonly taskId?: string;
  readonly occurredAt?: string;
  readonly relation?: string;
  readonly label?: string;
}

export interface DrillDownTimelineEvent {
  readonly id: string;
  readonly eventKey: string;
  readonly label: string;
  readonly timestamp: string;
  readonly actorId?: string | null;
  readonly actorType?: string | null;
  readonly payload?: Record<string, unknown>;
}

export interface DrillDownRecord {
  readonly entityType: EvidenceEntityType;
  readonly entityId: string;
  readonly label: string;
  readonly occurredAt: string;
  readonly status?: string;
  readonly branchId?: string;
  readonly branchName?: string;
  readonly workOrderId?: string;
  readonly taskId?: string;
  readonly attributes: Record<string, unknown>;
  readonly timeline?: readonly DrillDownTimelineEvent[];
  readonly evidenceReferences?: readonly EvidenceReference[];
}

export interface DrillDownDimensionBreakdown {
  readonly key: string;
  readonly value: string;
  readonly label: string;
  readonly count: number;
}

export interface DrillDownIntegrity {
  readonly totalMatchingRecords: number;
  readonly returnedRecords: number;
  readonly historicalAttributionPreserved: boolean;
  readonly sampleSizeProtected?: boolean;
  readonly financialAttributionComputable: boolean;
  readonly financialAttributionNote?: string;
  readonly dataHonestyDisclaimer?: string;
}

export interface DrillDownResult {
  readonly metric: {
    readonly key: string;
    readonly label: string;
    readonly value: number | string | null;
    readonly unit?: string;
    readonly period: { readonly from: string; readonly to: string };
  };
  readonly activeFilters: {
    readonly branchId?: string;
    readonly serviceKey?: string;
    readonly technicianId?: string;
    readonly workOrderId?: string;
    readonly dimension?: string;
    readonly dimensionValue?: string;
  };
  readonly dimensions?: readonly DrillDownDimensionBreakdown[];
  readonly records: readonly DrillDownRecord[];
  readonly nextCursor?: string;
  readonly integrity: DrillDownIntegrity;
}

export interface DrillDownQueryParams {
  metric: string;
  from?: string;
  to?: string;
  branchId?: string;
  serviceKey?: string;
  technicianId?: string;
  workOrderId?: string;
  dimension?: string;
  dimensionValue?: string;
  cursor?: string;
  limit?: number;
}
