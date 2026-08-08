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
    dependencies: [],
    conflicts: [],
    affectedGates: [],
    affectedRoles: ["BRANCH_MANAGER"],
    affectedReports: ["reports.branch_comparison"],
    historicalRecordPolicy: "PRESERVE_ACTIVE",
    reversible: true,
    removal: {
      // Rule 1: behaviour and presentation change, the data shape does
      // not. The tenant keeps exactly one Branch row and branchId stays
      // required, so re-enabling is a config change, not a migration,
      // and records created meanwhile are still well-formed.
      behavior: "DROP_STEP",
      statesToDisable: [],
      gatesToDrop: [],
      gatesToKeep: [],
      existingRecordsPolicy: "PRESERVE_READ_ONLY",
      orphanedRolePolicy: "READ_ONLY_ROLE",
    },
  },
  {
    key: "MULTI_WAREHOUSE",
    owningSystem: "INVENTORY",
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
  },

  // -------------------------------------------------------------------
  // Inventory
  // -------------------------------------------------------------------
  {
    key: "INVENTORY",
    owningSystem: "INVENTORY",
    dependencies: [],
    conflicts: [],
    affectedGates: ["parts.received_used_or_returned", "parts.no_pending_return"],
    affectedRoles: ["INVENTORY_MANAGER"],
    affectedReports: ["reports.inventory.stock_health", "reports.inventory.consumption"],
    historicalRecordPolicy: "PRESERVE_READ_ONLY",
    reversible: true,
    removal: {
      // The case that proves the model. Dropping the parts gate checks is
      // not a convenience -- leaving them in place is what strands every
      // job in a workshop that has no way to issue or return a part.
      behavior: "REROUTE",
      statesToDisable: ["WAITING_PARTS"],
      // No replacement edge is needed: a workshop without stock records a
      // parts wait as a blocker (BlockerReason.WAITING_PART), and
      // IN_PROGRESS <-> BLOCKED already exists unguarded.
      gatesToDrop: ["parts.received_used_or_returned", "parts.no_pending_return"],
      gatesToKeep: ["approved_work_completed", "no_open_blocker", "customer_decisions_resolved"],
      existingRecordsPolicy: "PRESERVE_READ_ONLY",
      orphanedRolePolicy: "REQUIRE_REASSIGNMENT",
      customerSafeMessage: "We are waiting for a required part. The branch will update you when it arrives.",
    },
  },
  {
    key: "PART_RETURNS",
    owningSystem: "INVENTORY",
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
  },
  {
    key: "EXTERNAL_PARTS",
    owningSystem: "OPERATIONS",
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
  },

  // -------------------------------------------------------------------
  // People / review
  // -------------------------------------------------------------------
  {
    key: "TEAMS",
    owningSystem: "PEOPLE_PERFORMANCE",
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
      // Who supervised job #123 last year must stay answerable.
      existingRecordsPolicy: "PRESERVE_READ_ONLY",
      orphanedRolePolicy: "REQUIRE_REASSIGNMENT",
    },
  },
  {
    key: "TEAM_REVIEW",
    owningSystem: "PEOPLE_PERFORMANCE",
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
      // Finish already has QC and finance-direct routes in the base
      // graph; removing the review edges is enough to reroute it.
      gatesToDrop: ["review.team_review_passed"],
      gatesToKeep: ["approved_work_completed"],
      existingRecordsPolicy: "MIGRATE_TO_TERMINAL",
      orphanedRolePolicy: "REQUIRE_REASSIGNMENT",
    },
  },
  {
    key: "QC",
    owningSystem: "OPERATIONS",
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
  },

  // -------------------------------------------------------------------
  // Customer channel
  // -------------------------------------------------------------------
  {
    key: "CUSTOMER_PORTAL",
    owningSystem: "OPERATIONS",
    dependencies: [],
    conflicts: [],
    affectedGates: [],
    affectedRoles: [],
    affectedReports: ["reports.customer.portal_usage"],
    historicalRecordPolicy: "PRESERVE_READ_ONLY",
    reversible: true,
    removal: {
      // Rule 2: the STEP is core, the CHANNEL is optional. Customer
      // approval does not disappear -- it moves to the counter, recorded
      // by staff, with the same acknowledgement record and audit weight.
      // Without this replacement edge, every decision request would
      // strand at PENDING and no work could ever be approved.
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
  },

  // -------------------------------------------------------------------
  // Money -- Finance Core and Billing are separate bounded systems
  // -------------------------------------------------------------------
  {
    key: "FINANCE_CORE",
    owningSystem: "FINANCE_CORE",
    dependencies: [],
    conflicts: [],
    affectedGates: ["payment.settled_or_policy_allows"],
    affectedRoles: [],
    affectedReports: ["reports.finance.revenue", "reports.finance.outstanding"],
    historicalRecordPolicy: "PRESERVE_READ_ONLY",
    reversible: true,
    removal: {
      // "External Finance Mode": MOP runs operations, money is handled
      // outside. Delivery must still be reachable, so finish routes
      // straight to delivery readiness.
      behavior: "EXTERNALIZE",
      statesToDisable: ["PAYMENT_PENDING"],
      addTransitions: [
        { from: "IN_PROGRESS", to: "READY_FOR_DELIVERY", label: "finish -> delivery (external finance)" },
        {
          from: "READY_FOR_TEAM_REVIEW",
          to: "READY_FOR_DELIVERY",
          requires: ["TEAM_REVIEW"],
          label: "review passed -> delivery (external finance)",
        },
      ],
      gatesToDrop: ["payment.settled_or_policy_allows"],
      gatesToKeep: ["approved_work_completed"],
      existingRecordsPolicy: "PRESERVE_READ_ONLY",
      orphanedRolePolicy: "READ_ONLY_ROLE",
    },
  },
  {
    key: "BILLING",
    owningSystem: "BILLING",
    dependencies: ["FINANCE_CORE"],
    conflicts: [],
    affectedGates: ["invoice.issued"],
    affectedRoles: [],
    affectedReports: ["reports.billing.compliance"],
    // An issued legal invoice can never be rewritten or removed, only
    // referenced -- which is why Billing is its own bounded system.
    historicalRecordPolicy: "EXTERNAL_REFERENCE_ONLY",
    reversible: true,
    removal: {
      // "External Billing Mode": MOP tracks charges and payments; the
      // legal invoice is issued elsewhere and its reference recorded.
      // Finance Core is untouched -- this is the split earning its keep.
      behavior: "EXTERNALIZE",
      statesToDisable: [],
      gatesToDrop: ["invoice.issued"],
      gatesToKeep: ["payment.settled_or_policy_allows"],
      existingRecordsPolicy: "PRESERVE_READ_ONLY",
      orphanedRolePolicy: "READ_ONLY_ROLE",
    },
  },

  // -------------------------------------------------------------------
  // Modes
  // -------------------------------------------------------------------
  {
    key: "QUICK_INSPECTION",
    owningSystem: "OPERATIONS",
    dependencies: [],
    conflicts: [],
    affectedGates: [],
    affectedRoles: [],
    affectedReports: [],
    historicalRecordPolicy: "PRESERVE_READ_ONLY",
    reversible: true,
    removal: {
      // Inspection is core; Quick Inspection is a mode of it.
      behavior: "DROP_STEP",
      statesToDisable: [],
      gatesToDrop: [],
      gatesToKeep: ["inspection_completed"],
      existingRecordsPolicy: "PRESERVE_READ_ONLY",
      orphanedRolePolicy: "HIDE_ROLE",
    },
  },
];

export const CAPABILITY_REGISTRY: ReadonlyMap<CapabilityKey, CapabilityDefinition> = new Map(
  DEFINITIONS.map((definition) => [definition.key, definition]),
);

export function capabilityDefinition(key: CapabilityKey): CapabilityDefinition | null {
  return CAPABILITY_REGISTRY.get(key) ?? null;
}

export { DEFINITIONS as CAPABILITY_DEFINITIONS };
