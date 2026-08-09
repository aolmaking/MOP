/**
 * The capability model: what a workshop's business shape is, as distinct
 * from what a given user is allowed to do inside that shape.
 *
 * Capability vs permission -- the distinction that makes smart delete work:
 *
 *   capability = "this workshop's business model includes an inventory"
 *   permission = "this user may issue a part from the inventory"
 *
 * A permission can never resurrect a disabled capability. That is why
 * capability sits ABOVE role/user permission in the effective resolver
 * order (see docs/CAPABILITY_MODEL.md).
 *
 * Nothing here imports Prisma or Nest -- it is a pure domain layer so the
 * reachability validator can be proven correct in isolation, which will
 * never be possible again once the lifecycle is entangled with five roles.
 */

import type { GateKey } from "./gates";

export const CAPABILITY_KEYS = [
  "MULTI_BRANCH",
  "MULTI_WAREHOUSE",
  "INVENTORY",
  "PART_RETURNS",
  "TEAMS",
  "TEAM_REVIEW",
  "QC",
  "CUSTOMER_PORTAL",
  "FINANCE_CORE",
  "BILLING",
  "QUICK_INSPECTION",
  "EXTERNAL_PARTS",
] as const;

export type CapabilityKey = (typeof CAPABILITY_KEYS)[number];

export const OWNING_SYSTEMS = [
  "OPERATIONS",
  "INVENTORY",
  "FINANCE_CORE",
  "BILLING",
  "PEOPLE_PERFORMANCE",
  "GOVERNANCE_CONTROL",
] as const;

export type OwningSystem = (typeof OWNING_SYSTEMS)[number];

/**
 * DISABLED removes the capability. EXTERNAL is the important middle
 * ground: the business function still happens, but outside MOP (a
 * workshop that issues legal invoices from separate accounting software
 * is EXTERNAL for BILLING, not DISABLED) -- so MOP must still record a
 * reference and may still gate delivery on it.
 */
export type CapabilityStatus = "ENABLED" | "DISABLED" | "READ_ONLY" | "EXTERNAL" | "LOCKED";

/** Statuses under which the capability's own transitions and gates are live. */
export const ACTIVE_STATUSES: readonly CapabilityStatus[] = ["ENABLED", "READ_ONLY", "LOCKED"];

export type CapabilityProfile = Readonly<Partial<Record<CapabilityKey, CapabilityStatus>>>;

// ---------------------------------------------------------------------------
// Workflow graph
// ---------------------------------------------------------------------------

/**
 * A transition exists in a tenant's effective graph only if every
 * capability in `requires` is active for that tenant. This is what makes
 * the graph capability-aware rather than a fixed state machine with
 * buttons hidden on top of it.
 */
export interface WorkflowTransition {
  readonly from: string;
  readonly to: string;
  readonly requires?: readonly CapabilityKey[];
  /**
   * The action a person takes, as opposed to the states it happens to
   * connect. "Technician finishes" lands on Team Review, QC, invoicing or
   * delivery readiness depending purely on which capabilities the
   * workshop has -- so the branching belongs here, in the graph, not in
   * an if-chain inside a service.
   *
   * Where several intent edges from one state are live at once, the FIRST
   * declared wins. Declaration order is therefore precedence, and the
   * graph must list them accordingly (review before QC before invoicing).
   */
  readonly intent?: WorkflowIntent;
  /** Gates that must pass before this transition may be taken. */
  readonly gates?: readonly GateKey[];
  /** Free-text, for validator output that a human has to act on. */
  readonly label?: string;
}

/** The named actions a person or the system can take on a record. */
export const WORKFLOW_INTENTS = [
  "REGISTER",
  "START_INSPECTION",
  "REQUEST_APPROVAL",
  "APPROVE",
  "START_WORK",
  "REQUEST_PART",
  "PART_RECEIVED",
  "REPORT_BLOCKER",
  "RESOLVE_BLOCKER",
  "ASK_CUSTOMER",
  "CUSTOMER_RESPONDED",
  "FINISH",
  "REVIEW_PASSED",
  "REVIEW_REJECTED",
  "QC_PASSED",
  "QC_FAILED",
  "ISSUE_INVOICE",
  "SETTLE_PAYMENT",
  "DELIVER",
  "CANCEL",
] as const;

export type WorkflowIntent = (typeof WORKFLOW_INTENTS)[number];

export interface WorkflowGraph {
  /** "WorkOrder", "Task", "PartRequest", ... -- reachability is checked per entity. */
  readonly entity: string;
  readonly initial: string;
  readonly states: readonly string[];
  readonly terminal: readonly string[];
  readonly transitions: readonly WorkflowTransition[];
  /**
   * Capabilities without which this entity is never created at all (a
   * PartRequest cannot exist in a workshop with no inventory). Such a
   * graph is skipped entirely rather than reported as unreachable --
   * "this never happens here" is not the same defect as "this happens
   * and then gets stuck".
   */
  readonly requires?: readonly CapabilityKey[];
}

// ---------------------------------------------------------------------------
// Removal policy
// ---------------------------------------------------------------------------

export type RemovalBehavior =
  | "REROUTE"
  | "DROP_STEP"
  | "EXTERNALIZE"
  | "READ_ONLY"
  | "BLOCK_NEW_ENTRIES";

export type ExistingRecordsPolicy =
  | "PRESERVE_READ_ONLY"
  | "MIGRATE_TO_TERMINAL"
  | "REQUIRE_MANUAL_RESOLUTION";

export type OrphanedRolePolicy = "HIDE_ROLE" | "READ_ONLY_ROLE" | "REQUIRE_REASSIGNMENT";

export type HistoricalRecordPolicy =
  | "PRESERVE_READ_ONLY"
  | "PRESERVE_ACTIVE"
  | "ARCHIVE_NEW_WRITES"
  | "EXTERNAL_REFERENCE_ONLY";

/**
 * What the business process BECOMES without this capability. A capability
 * that is merely "off" with no policy is exactly the failure this whole
 * model exists to prevent, so the registry refuses to accept one.
 */
export interface RemovalPolicy {
  readonly behavior: RemovalBehavior;
  /**
   * States that must become unenterable. Listing a state here without
   * also removing every transition INTO it is the classic smart-delete
   * bug -- the validator catches it as a stranded state.
   */
  readonly statesToDisable: readonly string[];
  /** Replacement edges that keep the graph connected once this capability is gone. */
  readonly addTransitions?: readonly WorkflowTransition[];
  readonly gatesToDrop: readonly GateKey[];
  readonly gatesToKeep: readonly GateKey[];
  readonly existingRecordsPolicy: ExistingRecordsPolicy;
  readonly orphanedRolePolicy: OrphanedRolePolicy;
  /** Replacement customer-facing wording, where removal changes what the customer is told. */
  readonly customerSafeMessage?: string;
}

export interface CapabilityDefinition {
  readonly key: CapabilityKey;
  readonly owningSystem: OwningSystem;
  /** Must be active for this capability to function. */
  readonly dependencies: readonly CapabilityKey[];
  /** Cannot be active at the same time as this capability. */
  readonly conflicts: readonly CapabilityKey[];
  readonly affectedGates: readonly GateKey[];
  readonly affectedRoles: readonly string[];
  readonly affectedReports: readonly string[];
  readonly historicalRecordPolicy: HistoricalRecordPolicy;
  readonly reversible: boolean;
  /**
   * `null` marks a CORE capability -- one that may never be disabled.
   * Enforced by the validator, not by convention.
   */
  readonly removal: RemovalPolicy | null;
}

// ---------------------------------------------------------------------------
// Validation output
// ---------------------------------------------------------------------------

export type ValidationCode =
  | "MISSING_DEPENDENCY"
  | "CONFLICT"
  | "CORE_CAPABILITY_DISABLED"
  | "STRANDED_STATE"
  | "DISABLED_STATE_REACHABLE"
  | "UNKNOWN_STATE_REFERENCE"
  | "TERMINAL_UNREACHABLE"
  | "GATE_NOT_OWNED";

export interface ValidationIssue {
  readonly code: ValidationCode;
  readonly entity: string;
  readonly message: string;
  /** The state / capability the operator has to do something about. */
  readonly subject?: string;
}

export interface EntityReachability {
  readonly entity: string;
  readonly reachable: readonly string[];
  readonly stranded: readonly string[];
}

export interface CapabilityValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ValidationIssue[];
  readonly reachability: readonly EntityReachability[];
  readonly orphanedRoles: readonly string[];
  readonly droppedGates: readonly string[];
  readonly keptGates: readonly string[];
}
