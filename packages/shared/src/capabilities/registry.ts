import type { CapabilityDefinition, CapabilityKey } from "./types";

/**
 * The capability registry. Lives in code, not the database, because it
 * encodes BEHAVIOUR -- what the business process becomes without each
 * capability -- and behaviour must be type-checked and tested.
 *
 * Every non-core capability carries a complete RemovalPolicy. A
 * capability that is merely "off" with no declared policy is precisely
 * the failure mode this model exists to prevent.
 */

const DEFINITIONS: readonly CapabilityDefinition[] = [
  // -------------------------------------------------------------------
  // Structural -- collapse a dimension from many to one/zero
  // -------------------------------------------------------------------
  {
    key: "MULTI_BRANCH",
    owningSystem: "OPERATIONS",
    type: "BOOLEAN",
    supportedStatuses: ["ENABLED", "DISABLED", "LOCKED"],
    governingModule: "ORGANIZATION",
    dependencies: [],
    conflicts: [],
    affectedGates: [],
    affectedRoles: ["BRANCH_MANAGER"],
    affectedReports: ["reports.branch_comparison"],
    historicalRecordPolicy: "PRESERVE_ACTIVE",
    reversible: true,
    removal: {
      behavior: "DROP_STEP",
      statesToDisable: [],
      gatesToDrop: [],
      gatesToKeep: [],
      existingRecordsPolicy: "PRESERVE_READ_ONLY",
      orphanedRolePolicy: "READ_ONLY_ROLE",
    },
    runtimeConsumers: ["PlanLimitsService", "StructureValidator", "SessionContext"],
  },
  {
    key: "MULTI_WAREHOUSE",
    owningSystem: "INVENTORY",
    type: "BOOLEAN",
    supportedStatuses: ["ENABLED", "DISABLED", "LOCKED"],
    governingModule: "INVENTORY",
    dependencies: ["INVENTORY"],
    conflicts: [],
    affectedGates: [],
    affectedRoles: [],
    affectedReports: ["reports.inventory.warehouse_usage"],
    historicalRecordPolicy: "PRESERVE_ACTIVE",
    reversible: true,
    removal: {
      behavior: "DROP_STEP",
      statesToDisable: [],
      gatesToDrop: [],
      gatesToKeep: [],
      existingRecordsPolicy: "PRESERVE_READ_ONLY",
      orphanedRolePolicy: "HIDE_ROLE",
    },
    runtimeConsumers: ["PlanLimitsService", "StructureValidator", "StockTransferService"],
  },

  // -------------------------------------------------------------------
  // Inventory
  // -------------------------------------------------------------------
  {
    key: "INVENTORY",
    owningSystem: "INVENTORY",
    type: "BOOLEAN",
    supportedStatuses: ["ENABLED", "DISABLED", "READ_ONLY", "LOCKED"],
    governingModule: "INVENTORY",
    dependencies: [],
    conflicts: [],
    affectedGates: ["parts.received_used_or_returned"],
    affectedRoles: ["INVENTORY_MANAGER"],
    affectedReports: ["reports.inventory.stock_health", "reports.inventory.consumption"],
    historicalRecordPolicy: "PRESERVE_READ_ONLY",
    reversible: true,
    removal: {
      behavior: "REROUTE",
      statesToDisable: ["WAITING_PARTS"],
      gatesToDrop: ["parts.received_used_or_returned"],
      gatesToKeep: ["approved_work_completed", "no_open_blocker", "customer_decisions_resolved"],
      existingRecordsPolicy: "PRESERVE_READ_ONLY",
      orphanedRolePolicy: "REQUIRE_REASSIGNMENT",
      customerSafeMessage: "We are waiting for a required part. The branch will update you when it arrives.",
    },
    runtimeConsumers: ["PartRequestService", "StockService", "TenantCapabilityLayer", "WorkOrderLifecycleService", "StructureValidator"],
  },
  {
    key: "PART_RETURNS",
    owningSystem: "INVENTORY",
    type: "BOOLEAN",
    supportedStatuses: ["ENABLED", "DISABLED", "LOCKED"],
    governingModule: "INVENTORY",
    dependencies: ["INVENTORY"],
    conflicts: [],
    affectedGates: ["parts.no_pending_return"],
    affectedRoles: [],
    affectedReports: ["reports.inventory.returns"],
    historicalRecordPolicy: "PRESERVE_READ_ONLY",
    reversible: true,
    removal: {
      behavior: "DROP_STEP",
      statesToDisable: ["RETURN_REQUESTED", "RETURN_ACCEPTED", "RETURNED_TO_STOCK"],
      gatesToDrop: ["parts.no_pending_return"],
      gatesToKeep: ["parts.received_used_or_returned"],
      existingRecordsPolicy: "REQUIRE_MANUAL_RESOLUTION",
      orphanedRolePolicy: "HIDE_ROLE",
    },
    runtimeConsumers: ["PartRequestService", "TenantCapabilityLayer", "GateEvaluatorService"],
  },
  {
    key: "EXTERNAL_PARTS",
    owningSystem: "OPERATIONS",
    type: "BOOLEAN",
    supportedStatuses: ["ENABLED", "DISABLED", "LOCKED"],
    governingModule: "OPERATIONS",
    dependencies: [],
    conflicts: [],
    affectedGates: ["parts.external_resolved"],
    affectedRoles: [],
    affectedReports: [],
    historicalRecordPolicy: "PRESERVE_ACTIVE",
    reversible: true,
    removal: {
      behavior: "DROP_STEP",
      statesToDisable: [],
      gatesToDrop: ["parts.external_resolved"],
      gatesToKeep: [],
      existingRecordsPolicy: "PRESERVE_READ_ONLY",
      orphanedRolePolicy: "HIDE_ROLE",
    },
    runtimeConsumers: ["TechnicianWorkService", "GateEvaluatorService"],
  },

  // -------------------------------------------------------------------
  // People / review
  // -------------------------------------------------------------------
  {
    key: "TEAMS",
    owningSystem: "PEOPLE_PERFORMANCE",
    type: "BOOLEAN",
    supportedStatuses: ["ENABLED", "DISABLED", "LOCKED"],
    governingModule: "TEAM_MANAGEMENT",
    dependencies: [],
    conflicts: [],
    affectedGates: [],
    affectedRoles: ["TEAM_LEADER"],
    affectedReports: ["reports.team.performance"],
    historicalRecordPolicy: "PRESERVE_READ_ONLY",
    reversible: true,
    removal: {
      behavior: "DROP_STEP",
      statesToDisable: [],
      gatesToDrop: [],
      gatesToKeep: [],
      existingRecordsPolicy: "PRESERVE_READ_ONLY",
      orphanedRolePolicy: "REQUIRE_REASSIGNMENT",
    },
    runtimeConsumers: ["TeamSetupService", "TenantCapabilityLayer", "TechnicianShiftService"],
  },
  {
    key: "TEAM_REVIEW",
    owningSystem: "PEOPLE_PERFORMANCE",
    type: "BOOLEAN",
    supportedStatuses: ["ENABLED", "DISABLED", "LOCKED"],
    governingModule: "TEAM_MANAGEMENT",
    dependencies: ["TEAMS"],
    conflicts: [],
    affectedGates: ["review.team_review_passed"],
    affectedRoles: ["TEAM_LEADER"],
    affectedReports: ["reports.team.review_time"],
    historicalRecordPolicy: "PRESERVE_READ_ONLY",
    reversible: true,
    removal: {
      behavior: "REROUTE",
      statesToDisable: ["READY_FOR_TEAM_REVIEW"],
      gatesToDrop: ["review.team_review_passed"],
      gatesToKeep: ["approved_work_completed"],
      existingRecordsPolicy: "MIGRATE_TO_TERMINAL",
      orphanedRolePolicy: "REQUIRE_REASSIGNMENT",
    },
    runtimeConsumers: ["WorkOrderLifecycleService", "TenantCapabilityLayer", "GateEvaluatorService"],
  },
  {
    key: "QC",
    owningSystem: "OPERATIONS",
    type: "BOOLEAN",
    supportedStatuses: ["ENABLED", "DISABLED", "LOCKED"],
    governingModule: "OPERATIONS",
    dependencies: [],
    conflicts: [],
    affectedGates: ["qc.passed"],
    affectedRoles: [],
    affectedReports: ["reports.operations.qc_failures"],
    historicalRecordPolicy: "PRESERVE_READ_ONLY",
    reversible: true,
    removal: {
      behavior: "REROUTE",
      statesToDisable: ["READY_FOR_QC", "QC_FAILED"],
      gatesToDrop: ["qc.passed"],
      gatesToKeep: ["approved_work_completed"],
      existingRecordsPolicy: "MIGRATE_TO_TERMINAL",
      orphanedRolePolicy: "HIDE_ROLE",
    },
    runtimeConsumers: ["WorkOrderLifecycleService", "GateEvaluatorService"],
  },

  // -------------------------------------------------------------------
  // Customer channel
  // -------------------------------------------------------------------
  {
    key: "CUSTOMER_PORTAL",
    owningSystem: "OPERATIONS",
    type: "BOOLEAN",
    supportedStatuses: ["ENABLED", "DISABLED", "LOCKED"],
    governingModule: "CUSTOMER_PORTAL",
    dependencies: [],
    conflicts: [],
    affectedGates: [],
    affectedRoles: [],
    affectedReports: ["reports.customer.portal_usage"],
    historicalRecordPolicy: "PRESERVE_READ_ONLY",
    reversible: true,
    removal: {
      behavior: "REROUTE",
      statesToDisable: ["SENT", "VIEWED", "PARTIALLY_RESPONDED"],
      addTransitions: [
        { from: "PENDING", to: "RESOLVED", label: "approval recorded at counter by staff" },
        { from: "PENDING", to: "EXPIRED", label: "customer never returned" },
      ],
      gatesToDrop: [],
      gatesToKeep: ["customer_decisions_resolved", "critical_warning_acknowledged"],
      existingRecordsPolicy: "PRESERVE_READ_ONLY",
      orphanedRolePolicy: "HIDE_ROLE",
    },
    runtimeConsumers: ["CustomerPortalController", "CustomerDecisionService", "TenantCapabilityLayer"],
  },

  // -------------------------------------------------------------------
  // Money -- Finance Core and Billing are separate bounded systems
  // -------------------------------------------------------------------
  {
    key: "FINANCE_CORE",
    owningSystem: "FINANCE_CORE",
    type: "MODE_BASED",
    supportedStatuses: ["ENABLED", "DISABLED", "EXTERNAL", "READ_ONLY", "LOCKED"],
    governingModule: "FINANCE",
    dependencies: [],
    conflicts: [],
    affectedGates: ["payment.settled_or_policy_allows"],
    affectedRoles: [],
    affectedReports: ["reports.finance.revenue", "reports.finance.outstanding"],
    historicalRecordPolicy: "PRESERVE_READ_ONLY",
    reversible: true,
    removal: {
      behavior: "EXTERNALIZE",
      statesToDisable: ["PAYMENT_PENDING"],
      addTransitions: [
        { from: "IN_PROGRESS", to: "READY_FOR_DELIVERY", intent: "FINISH", label: "finish -> delivery (external finance)" },
        {
          from: "READY_FOR_TEAM_REVIEW",
          to: "READY_FOR_DELIVERY",
          requires: ["TEAM_REVIEW"],
          intent: "REVIEW_PASSED",
          label: "review passed -> delivery (external finance)",
        },
      ],
      gatesToDrop: ["payment.settled_or_policy_allows"],
      gatesToKeep: ["approved_work_completed"],
      existingRecordsPolicy: "PRESERVE_READ_ONLY",
      orphanedRolePolicy: "READ_ONLY_ROLE",
    },
    runtimeConsumers: ["FinanceService", "PlatformService", "TenantCapabilityLayer", "GateEvaluatorService", "WorkOrderLifecycleService"],
  },
  {
    key: "BILLING",
    owningSystem: "BILLING",
    type: "MODE_BASED",
    supportedStatuses: ["ENABLED", "DISABLED", "EXTERNAL", "READ_ONLY", "LOCKED"],
    governingModule: "FINANCE",
    dependencies: ["FINANCE_CORE"],
    conflicts: [],
    affectedGates: ["invoice.issued"],
    affectedRoles: [],
    affectedReports: ["reports.billing.compliance"],
    historicalRecordPolicy: "EXTERNAL_REFERENCE_ONLY",
    reversible: true,
    removal: {
      behavior: "EXTERNALIZE",
      statesToDisable: [],
      gatesToDrop: ["invoice.issued"],
      gatesToKeep: ["payment.settled_or_policy_allows"],
      existingRecordsPolicy: "PRESERVE_READ_ONLY",
      orphanedRolePolicy: "READ_ONLY_ROLE",
    },
    runtimeConsumers: ["BillingService", "FinanceService", "GateEvaluatorService"],
  },

  // -------------------------------------------------------------------
  // Modes
  // -------------------------------------------------------------------
  {
    key: "QUICK_INSPECTION",
    owningSystem: "OPERATIONS",
    type: "MODE_BASED",
    supportedStatuses: ["ENABLED", "DISABLED", "LOCKED"],
    governingModule: "OPERATIONS",
    dependencies: [],
    conflicts: [],
    affectedGates: [],
    affectedRoles: [],
    affectedReports: [],
    historicalRecordPolicy: "PRESERVE_READ_ONLY",
    reversible: true,
    removal: {
      behavior: "DROP_STEP",
      statesToDisable: [],
      gatesToDrop: [],
      gatesToKeep: ["inspection_completed"],
      existingRecordsPolicy: "PRESERVE_READ_ONLY",
      orphanedRolePolicy: "HIDE_ROLE",
    },
    runtimeConsumers: ["TechnicianInspectionService"],
  },
];

export const CAPABILITY_REGISTRY: ReadonlyMap<CapabilityKey, CapabilityDefinition> = new Map(
  DEFINITIONS.map((definition) => [definition.key, definition]),
);

export function capabilityDefinition(key: CapabilityKey): CapabilityDefinition | null {
  return CAPABILITY_REGISTRY.get(key) ?? null;
}

export { DEFINITIONS as CAPABILITY_DEFINITIONS };
