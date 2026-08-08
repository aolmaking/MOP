/**
 * The closed set of domain events systems use to talk to each other.
 *
 * MOP is six systems on one spine (see docs/SYSTEMS.md). The rule that
 * keeps them from collapsing into one mud ball with six names is:
 *
 *   A system never reads or writes another system's tables directly.
 *   Cross-system reads go through a published contract; cross-system
 *   changes go through a domain event.
 *
 * A closed union rather than free strings, so a typo is a compile error
 * and "which events exist" has one answer instead of being discovered by
 * grepping for emit calls -- which is how the previous implementation
 * ended up with modules that quietly bypassed the event pipeline
 * altogether.
 */

export const OPERATION_EVENT_KEYS = [
  // --- Operations ----------------------------------------------------
  "work_order.created",
  "work_order.status_changed",
  "technician.assigned",
  "inspection.saved",
  "fault.created",
  "blocker.reported",
  "blocker.resolved",
  "task.finish_attempted",
  "task.finish_blocked",
  "task.completed",
  "task.sent_to_review",
  "asset.ownership_transferred",

  // --- Customer decisions (the step, whatever the channel) -----------
  "customer_decision.requested",
  "customer_decision.sent",
  "customer_decision.responded",
  "customer_decision.expired",

  // --- Inventory ------------------------------------------------------
  "part.requested",
  "part.issued",
  "part.arrived_confirmed",
  "part.used",
  "part.unavailable",
  "part.return_requested",
  "part.return_accepted",
  "part.return_rejected",
  "stock.movement_recorded",

  // --- Finance Core ---------------------------------------------------
  "chargeable_item.added",
  "chargeable_item.removed",
  "running_balance.updated",
  "invoice_candidate.created",
  "payment.recorded",
  "refund.requested",
  "refund.approved",

  // --- Billing / Invoicing --------------------------------------------
  // Separate from Finance Core because in several markets an invoice is a
  // compliance artifact, not a formatted total: it must be cleared by a
  // government portal before it is legally valid.
  "invoice.issued",
  "invoice.document_generated",
  "invoice.cleared",
  "invoice.clearance_failed",
  "invoice.rejected",
  "invoice.cancelled",
  "credit_note.issued",
  "debit_note.issued",

  // --- Governance & Control -------------------------------------------
  "capability.changed",
  "permission.changed",
  "platform_control.changed",
  "workshop.frozen",
  "workshop.reactivated",
] as const;

export type OperationEventKey = (typeof OPERATION_EVENT_KEYS)[number];

/** Which system is allowed to emit a given event. */
export type EmittingSystem =
  | "OPERATIONS"
  | "INVENTORY"
  | "FINANCE_CORE"
  | "BILLING"
  | "PEOPLE_PERFORMANCE"
  | "GOVERNANCE_CONTROL";

export interface DomainEventEnvelope<TPayload = unknown> {
  readonly key: OperationEventKey;
  readonly tenantId: string;
  readonly emittedBy: EmittingSystem;
  readonly actorId: string;
  readonly actorType: "SYSTEM" | "PLATFORM" | "TENANT_STAFF" | "CUSTOMER";
  readonly occurredAt: string;
  /** Correlates an event with the HTTP request that caused it. */
  readonly requestId?: string;
  readonly payload: TPayload;
}
