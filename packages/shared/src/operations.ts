export type OperationActorType = "tenant_staff" | "customer" | "platform" | "system";
export type OperationVisibility = "internal" | "customer_safe" | "audit_only";
export type WorkflowHealthSeverity = "critical" | "high" | "medium" | "low";

export type OperationNotificationTarget =
  | "technician"
  | "inventory_manager"
  | "branch_manager"
  | "team_leader"
  | "customer"
  | "tenant_owner"
  | "data_analyst"
  | "platform_super_admin"
  | "qc_queue"
  | "reports_engine"
  | "work_order_timeline";

export interface OperationEventActorDto {
  actorType: OperationActorType;
  actorId?: string;
  actorName: string;
  roleId?: string;
}

export interface OperationStatusChangeDto {
  entityType: "work_order" | "task" | "part_request" | "issued_item" | "return_request" | "customer_decision" | "inventory_item" | "tenant_control" | "quotation" | "running_invoice" | "invoice" | "payment" | "refund";
  entityId: string;
  fromStatus?: string;
  toStatus?: string;
  label?: string;
}

export interface OperationReportHookDto {
  reportKey: string;
  metric: string;
  delta?: number;
  scope: Array<"self" | "team" | "branch" | "warehouse" | "category" | "company" | "platform" | "customer_own">;
}

export interface OperationCustomerSafeOutputDto {
  title: string;
  message: string;
  source: string;
  customerId?: string;
  assetId?: string;
  workOrderId?: string;
}

export interface OperationPermissionCheckDto {
  requiredPermission?: string;
  granted: boolean;
  source: "platform" | "tenant" | "role" | "customer" | "system";
}

export interface OperationEventDto {
  eventId: string;
  eventKey: string;
  canonicalEventKey: string;
  tenantId?: string;
  branchId?: string;
  warehouseId?: string;
  workOrderId?: string;
  taskId?: string;
  customerId?: string;
  assetId?: string;
  actor: OperationEventActorDto;
  statusChanges: OperationStatusChangeDto[];
  notificationTargets: OperationNotificationTarget[];
  pageUpdates: string[];
  reportHooks: OperationReportHookDto[];
  auditAction: string;
  targetType: string;
  targetId?: string;
  visibility: OperationVisibility;
  permissionCheck: OperationPermissionCheckDto;
  canUndo: boolean;
  customerSafeOutput?: OperationCustomerSafeOutputDto;
  payload?: Record<string, unknown>;
  occurredAt: string;
}

export interface OperationEventCreateDto extends Omit<OperationEventDto, "eventId" | "occurredAt" | "canonicalEventKey" | "visibility" | "permissionCheck"> {
  reason: string;
  canonicalEventKey?: string;
  visibility?: OperationVisibility;
  permissionCheck?: OperationPermissionCheckDto;
}

export interface WorkflowStatusResolutionDto {
  eventKey: string;
  statusChanges: OperationStatusChangeDto[];
  blocked: boolean;
  blockedReasons: string[];
}

export interface NotificationRouteDto {
  eventKey: string;
  targets: OperationNotificationTarget[];
  pageUpdates: string[];
}

export interface CrossRoleActionContractDto {
  action: string;
  actorRoles: string[];
  requiredPermission?: string;
  requiredInput: string[];
  validationRules: string[];
  eventsEmitted: string[];
  statusesUpdated: string[];
  pagesAffected: string[];
  reportsAffected: string[];
  auditRequired: boolean;
  customerSafeOutput: boolean;
  blockedCases: string[];
  rollbackBehavior: string;
}

export interface WorkflowHealthIssueDto {
  id: string;
  code: string;
  severity: WorkflowHealthSeverity;
  title: string;
  detail: string;
  affectedWorkflow: string;
  affectedEntityType?: string;
  affectedEntityId?: string;
  suggestedFix: string;
  ownerLocked: boolean;
  platformLocked: boolean;
  detectedAt: string;
}

export interface WorkflowHealthResultDto {
  checkedAt: string;
  status: "healthy" | "attention" | "critical";
  score: number;
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  issues: WorkflowHealthIssueDto[];
}

export const operationEventAliases: Record<string, string> = {
  "branch.intake.created": "work_order.created",
  "technician.part.requested": "part.requested",
  "technician.part.arrived": "part.arrived_confirmed",
  "technician.part.used": "part.used",
  "technician.part.return_requested": "part.return_requested",
  "inventory.part.issued": "part.issued",
  "inventory.return.accepted": "part.return_accepted",
  "inventory.return.accept_stock": "part.return_accepted",
  "inventory.return.accept_damaged": "part.return_accepted",
  "customer_decision.sent": "customer_decision.requested",
  "technician.blocker.reported": "blocker.reported",
  "technician.finish_gate.blocked": "task.finish_blocked",
  "technician.finish_gate.completed": "task.finish_completed",
  "owner.configuration.applied": "owner.permission_changed",
  "platform.control.applied": "platform_control.changed"
};

export const canonicalOperationEvents = [
  "work_order.created",
  "technician.assigned",
  "task.started",
  "inspection.saved",
  "diagnostic_code.added",
  "fault.created",
  "customer_decision.requested",
  "customer_decision.responded",
  "part.requested",
  "part.issued",
  "part.arrived_confirmed",
  "part.used",
  "part.return_requested",
  "part.return_accepted",
  "blocker.reported",
  "task.finish_attempted",
  "task.finish_blocked",
  "task.sent_to_team_review",
  "task.sent_to_qc",
  "owner.permission_changed",
  "builder.published",
  "price_catalog.item_created",
  "price_catalog.price_changed",
  "quote.created",
  "quote.sent_to_customer",
  "quote.approved",
  "quote.rejected",
  "running_invoice.updated",
  "invoice.ready",
  "invoice.issued",
  "payment.recorded",
  "payment.failed",
  "payment.cancelled",
  "discount.applied",
  "discount.approval_requested",
  "refund.requested",
  "refund.approved",
  "refund.paid",
  "delivery.blocked_payment",
  "delivery.allowed_payment",
  "platform_control.changed",
  "workshop.frozen",
  "workshop.reactivated"
] as const;

export const crossRoleActionContracts: CrossRoleActionContractDto[] = [
  {
    action: "work_order.create",
    actorRoles: ["branch_manager"],
    requiredPermission: "branch.work_order.create",
    requiredInput: ["customerId", "assetId", "branchId", "category", "complaint"],
    validationRules: ["tenant_scope", "branch_scope", "asset_customer_ownership"],
    eventsEmitted: ["work_order.created"],
    statusesUpdated: ["work_order.registered"],
    pagesAffected: ["branch-work-orders", "my-work", "customer"],
    reportsAffected: ["reports.branch.operations.view"],
    auditRequired: true,
    customerSafeOutput: true,
    blockedCases: ["invalid_customer_asset", "branch_out_of_scope"],
    rollbackBehavior: "Cancel only before execution starts."
  },
  {
    action: "technician.assign",
    actorRoles: ["branch_manager", "team_leader"],
    requiredPermission: "work_order.assign_technician",
    requiredInput: ["workOrderId", "taskId", "technicianId"],
    validationRules: ["technician_branch_scope", "category_compatibility"],
    eventsEmitted: ["technician.assigned"],
    statusesUpdated: ["task.not_started"],
    pagesAffected: ["my-work", "branch-workspace", "team-review"],
    reportsAffected: ["reports.team.technician_performance.view"],
    auditRequired: true,
    customerSafeOutput: false,
    blockedCases: ["technician_out_of_scope", "inactive_technician"],
    rollbackBehavior: "Reassign with an audit reason."
  },
  {
    action: "customer_decision.create",
    actorRoles: ["technician", "branch_manager"],
    requiredPermission: "customer_decision.create",
    requiredInput: ["workOrderId", "taskId", "items"],
    validationRules: ["customer_safe_text", "critical_warning_present", "price_snapshot"],
    eventsEmitted: ["customer_decision.requested"],
    statusesUpdated: ["task.waiting_customer", "work_order.awaiting_customer_approval"],
    pagesAffected: ["work-card", "branch-decisions", "customer"],
    reportsAffected: ["reports.team.customer_decisions.view"],
    auditRequired: true,
    customerSafeOutput: true,
    blockedCases: ["unsafe_customer_message", "missing_critical_warning"],
    rollbackBehavior: "Cancel only while the request has no customer response."
  },
  {
    action: "customer_decision.respond",
    actorRoles: ["customer"],
    requiredInput: ["decisionRequestId", "itemDecisions"],
    validationRules: ["valid_token", "not_expired", "critical_acknowledgement"],
    eventsEmitted: ["customer_decision.responded"],
    statusesUpdated: ["customer_decision.responded", "task.resolved_from_waiting_customer"],
    pagesAffected: ["work-card", "branch-decisions", "team-review", "customer"],
    reportsAffected: ["reports.team.customer_decisions.view", "reports.branch.operations.view"],
    auditRequired: true,
    customerSafeOutput: true,
    blockedCases: ["expired_request", "missing_warning_acknowledgement"],
    rollbackBehavior: "Staff records a new decision request; the original response remains immutable."
  },
  {
    action: "part.request",
    actorRoles: ["technician"],
    requiredPermission: "parts.request",
    requiredInput: ["workOrderId", "taskId", "itemId", "quantity", "urgency"],
    validationRules: ["assigned_task", "warehouse_resolution", "positive_quantity"],
    eventsEmitted: ["part.requested"],
    statusesUpdated: ["part.pending_inventory_review", "task.waiting_parts"],
    pagesAffected: ["inventory-requests", "work-card", "branch-workspace", "team-review"],
    reportsAffected: ["reports.inventory.movements.view", "reports.technician.parts_activity.view"],
    auditRequired: true,
    customerSafeOutput: true,
    blockedCases: ["no_warehouse_link", "item_out_of_scope"],
    rollbackBehavior: "Technician may cancel before issue."
  },
  {
    action: "part.issue",
    actorRoles: ["inventory_manager"],
    requiredPermission: "inventory.request.issue",
    requiredInput: ["requestId", "warehouseId", "quantity"],
    validationRules: ["atomic_stock_check", "warehouse_scope", "request_transition"],
    eventsEmitted: ["part.issued"],
    statusesUpdated: ["part.issued", "part.awaiting_technician_confirmation"],
    pagesAffected: ["inventory-requests", "work-card", "branch-workspace", "team-review"],
    reportsAffected: ["reports.inventory.movements.view"],
    auditRequired: true,
    customerSafeOutput: false,
    blockedCases: ["stock_not_available", "request_not_issuable"],
    rollbackBehavior: "Use return or corrective stock movement; never delete the issue."
  },
  {
    action: "part.arrived_confirm",
    actorRoles: ["technician"],
    requiredPermission: "parts.mark_used",
    requiredInput: ["issuedItemId"],
    validationRules: ["assigned_technician", "issued_or_in_transit"],
    eventsEmitted: ["part.arrived_confirmed"],
    statusesUpdated: ["part.received_by_technician"],
    pagesAffected: ["work-card", "inventory-requests", "team-review"],
    reportsAffected: ["reports.inventory.movements.view"],
    auditRequired: true,
    customerSafeOutput: false,
    blockedCases: ["wrong_technician", "invalid_part_state"],
    rollbackBehavior: "Inventory review is required to correct an incorrect confirmation."
  },
  {
    action: "part.use",
    actorRoles: ["technician"],
    requiredPermission: "parts.mark_used",
    requiredInput: ["issuedItemId", "taskId", "workOrderId"],
    validationRules: ["received_by_technician", "customer_approval_if_required"],
    eventsEmitted: ["part.used"],
    statusesUpdated: ["part.used", "running_invoice.updated"],
    pagesAffected: ["work-card", "inventory-requests", "branch-workspace", "team-review"],
    reportsAffected: ["reports.inventory.consumption.view", "reports.technician.parts_activity.view"],
    auditRequired: true,
    customerSafeOutput: false,
    blockedCases: ["not_received", "customer_approval_pending"],
    rollbackBehavior: "Use return or financial adjustment according to invoice state."
  },
  {
    action: "part.return_unused",
    actorRoles: ["technician"],
    requiredPermission: "parts.mark_used",
    requiredInput: ["issuedItemId", "reason", "condition", "quantity"],
    validationRules: ["received_not_used", "positive_quantity"],
    eventsEmitted: ["part.return_requested"],
    statusesUpdated: ["part.return_pending"],
    pagesAffected: ["work-card", "inventory-returns", "team-review"],
    reportsAffected: ["reports.inventory.returns.view"],
    auditRequired: true,
    customerSafeOutput: false,
    blockedCases: ["part_already_used", "return_already_open"],
    rollbackBehavior: "Inventory may reject or request clarification."
  },
  {
    action: "part.return_accept",
    actorRoles: ["inventory_manager"],
    requiredPermission: "inventory.stock.return",
    requiredInput: ["returnId", "destinationWarehouseId", "conditionResult"],
    validationRules: ["atomic_stock_increment", "warehouse_scope", "pending_return"],
    eventsEmitted: ["part.return_accepted"],
    statusesUpdated: ["part.returned_to_stock", "finish_gate.recheck"],
    pagesAffected: ["inventory-returns", "work-card", "branch-workspace"],
    reportsAffected: ["reports.inventory.returns.view", "reports.inventory.movements.view"],
    auditRequired: true,
    customerSafeOutput: false,
    blockedCases: ["return_not_pending", "warehouse_out_of_scope"],
    rollbackBehavior: "Create a corrective ledger movement with an audit reason."
  },
  {
    action: "blocker.report",
    actorRoles: ["technician"],
    requiredPermission: "task.blocker.report",
    requiredInput: ["taskId", "reason", "urgency", "visibility"],
    validationRules: ["assigned_task", "known_blocker_type"],
    eventsEmitted: ["blocker.reported"],
    statusesUpdated: ["task.blocked", "work_order.blocked"],
    pagesAffected: ["work-card", "branch-workspace", "team-review"],
    reportsAffected: ["reports.team.blockers.view", "reports.branch.delays.view"],
    auditRequired: true,
    customerSafeOutput: true,
    blockedCases: ["task_closed", "unsafe_customer_detail"],
    rollbackBehavior: "Resolve blocker with actor and resolution audit."
  },
  {
    action: "task.finish",
    actorRoles: ["technician"],
    requiredPermission: "task.complete",
    requiredInput: ["taskId"],
    validationRules: ["finish_gate", "assigned_task", "workflow_transition"],
    eventsEmitted: ["task.finish_attempted", "task.finish_blocked", "task.sent_to_team_review", "task.sent_to_qc"],
    statusesUpdated: ["task.ready_for_review_or_qc"],
    pagesAffected: ["work-card", "team-review", "branch-workspace"],
    reportsAffected: ["reports.team.technician_performance.view", "reports.branch.operations.view"],
    auditRequired: true,
    customerSafeOutput: false,
    blockedCases: ["pending_decision", "pending_part", "open_blocker", "inspection_incomplete"],
    rollbackBehavior: "Reviewer sends the task back through the rework lifecycle."
  },
  {
    action: "owner.permission.change",
    actorRoles: ["tenant_owner", "tenant_admin"],
    requiredPermission: "configuration.permissions.edit",
    requiredInput: ["draft", "impactPreview"],
    validationRules: ["platform_lock", "plan_lock", "scope_rule"],
    eventsEmitted: ["owner.permission_changed"],
    statusesUpdated: ["effective_permissions.invalidated"],
    pagesAffected: ["affected-role-navigation", "permissions", "audit"],
    reportsAffected: ["reports.permissions_audit.view"],
    auditRequired: true,
    customerSafeOutput: false,
    blockedCases: ["platform_locked", "privacy_override", "tenant_isolation_override"],
    rollbackBehavior: "Apply a prior permission snapshot through audited rollback."
  },
  {
    action: "platform.control.change",
    actorRoles: ["platform_super_admin"],
    requiredPermission: "platform.control.apply",
    requiredInput: ["target", "controlDomain", "value", "reason"],
    validationRules: ["platform_scope", "high_risk_confirmation"],
    eventsEmitted: ["platform_control.changed", "workshop.frozen", "workshop.reactivated"],
    statusesUpdated: ["effective_platform_state.changed"],
    pagesAffected: ["platform-live-view", "builder-home", "affected-role-navigation"],
    reportsAffected: ["reports.platform.workshops.view", "reports.permissions_audit.view"],
    auditRequired: true,
    customerSafeOutput: false,
    blockedCases: ["missing_reason", "invalid_control_target"],
    rollbackBehavior: "Use explicit platform rollback with confirmation and reason."
  },
  {
    action: "builder.publish",
    actorRoles: ["tenant_owner", "tenant_admin"],
    requiredPermission: "builder.publish",
    requiredInput: ["draftVersion", "impactPreview", "reason"],
    validationRules: ["builder_validation", "safety_sections", "platform_lock"],
    eventsEmitted: ["builder.published"],
    statusesUpdated: ["builder.published_version"],
    pagesAffected: ["configured-role-pages", "builder-publish-center"],
    reportsAffected: ["reports.permissions_audit.view"],
    auditRequired: true,
    customerSafeOutput: false,
    blockedCases: ["validation_error", "unsafe_section_change", "platform_conflict"],
    rollbackBehavior: "Rollback to a published version; never mutate history."
  },
  {
    action: "invoice.issue",
    actorRoles: ["tenant_owner", "tenant_admin", "branch_manager"],
    requiredPermission: "finance.invoice.issue",
    requiredInput: ["workOrderId", "runningInvoiceId"],
    validationRules: ["all_decisions_resolved", "parts_resolved", "price_snapshots_locked", "platform_finance_enabled"],
    eventsEmitted: ["invoice.ready", "invoice.issued"],
    statusesUpdated: ["running_invoice.finalized", "invoice.issued_locked"],
    pagesAffected: ["invoices-payments", "branch-invoices", "customer-finance", "branch-delivery"],
    reportsAffected: ["finance.reports.view"],
    auditRequired: true,
    customerSafeOutput: true,
    blockedCases: ["pending_customer_approval", "no_billable_lines", "platform_locked"],
    rollbackBehavior: "Issued invoices are immutable; use a credit note or refund."
  },
  {
    action: "payment.record",
    actorRoles: ["tenant_owner", "tenant_admin", "branch_manager"],
    requiredPermission: "finance.payment.record",
    requiredInput: ["invoiceId", "amount", "method"],
    validationRules: ["issued_invoice", "enabled_payment_method", "platform_payment_enabled"],
    eventsEmitted: ["payment.recorded", "delivery.allowed_payment", "delivery.blocked_payment"],
    statusesUpdated: ["invoice.partially_paid_or_paid", "delivery.payment_gate"],
    pagesAffected: ["invoices-payments", "branch-invoices", "customer-finance", "branch-delivery"],
    reportsAffected: ["finance.reports.view"],
    auditRequired: true,
    customerSafeOutput: true,
    blockedCases: ["invoice_not_issued", "invalid_amount", "platform_locked"],
    rollbackBehavior: "Cancel or refund through a separate audited ledger entry."
  },
  {
    action: "refund.request",
    actorRoles: ["tenant_owner", "tenant_admin", "branch_manager"],
    requiredPermission: "finance.refund.request",
    requiredInput: ["invoiceId", "amount", "reason"],
    validationRules: ["paid_amount_limit", "approval_permission", "platform_refunds_enabled"],
    eventsEmitted: ["refund.requested", "refund.approved", "refund.paid"],
    statusesUpdated: ["invoice.partially_refunded_or_refunded"],
    pagesAffected: ["discounts-refunds", "invoices-payments", "customer-finance"],
    reportsAffected: ["finance.reports.view"],
    auditRequired: true,
    customerSafeOutput: true,
    blockedCases: ["amount_exceeds_paid", "platform_locked"],
    rollbackBehavior: "Preserve invoice and issue an audited credit note."
  }
];

export const operationEventContracts: Array<{
  eventKey: string;
  requiredTargets: OperationNotificationTarget[];
  reportHooks: string[];
  customerSafeAllowed: boolean;
}> = [
  { eventKey: "branch.intake.created", requiredTargets: ["technician", "branch_manager", "customer", "reports_engine"], reportHooks: ["reports.branch.operations.view"], customerSafeAllowed: true },
  { eventKey: "technician.part.requested", requiredTargets: ["inventory_manager", "branch_manager", "team_leader", "customer", "reports_engine"], reportHooks: ["reports.inventory.movements.view", "reports.technician.parts_activity.view"], customerSafeAllowed: true },
  { eventKey: "inventory.part.issued", requiredTargets: ["technician", "branch_manager", "team_leader", "reports_engine"], reportHooks: ["reports.inventory.movements.view", "reports.inventory.consumption.view"], customerSafeAllowed: false },
  { eventKey: "technician.part.arrived", requiredTargets: ["inventory_manager", "branch_manager", "work_order_timeline", "reports_engine"], reportHooks: ["reports.inventory.movements.view"], customerSafeAllowed: false },
  { eventKey: "technician.part.used", requiredTargets: ["inventory_manager", "team_leader", "branch_manager", "reports_engine"], reportHooks: ["reports.inventory.consumption.view", "reports.technician.parts_activity.view"], customerSafeAllowed: false },
  { eventKey: "technician.part.return_requested", requiredTargets: ["inventory_manager", "team_leader", "reports_engine"], reportHooks: ["reports.inventory.returns.view"], customerSafeAllowed: false },
  { eventKey: "customer_decision.sent", requiredTargets: ["customer", "technician", "branch_manager", "team_leader", "reports_engine"], reportHooks: ["reports.team.customer_decisions.view", "reports.branch.operations.view"], customerSafeAllowed: true },
  { eventKey: "customer_decision.responded", requiredTargets: ["technician", "branch_manager", "team_leader", "reports_engine"], reportHooks: ["reports.team.customer_decisions.view", "reports.branch.operations.view"], customerSafeAllowed: true },
  { eventKey: "technician.blocker.reported", requiredTargets: ["branch_manager", "team_leader", "reports_engine"], reportHooks: ["reports.team.blockers.view", "reports.branch.delays.view"], customerSafeAllowed: true },
  { eventKey: "technician.finish_gate.completed", requiredTargets: ["team_leader", "branch_manager", "qc_queue", "reports_engine"], reportHooks: ["reports.team.technician_performance.view", "reports.branch.operations.view"], customerSafeAllowed: false },
  { eventKey: "technician.finish_gate.blocked", requiredTargets: ["technician", "branch_manager", "team_leader", "reports_engine"], reportHooks: ["reports.team.blockers.view", "reports.branch.delays.view"], customerSafeAllowed: false },
  { eventKey: "owner.configuration.applied", requiredTargets: ["tenant_owner", "data_analyst", "reports_engine"], reportHooks: ["reports.permissions_audit.view"], customerSafeAllowed: false },
  { eventKey: "platform.control.applied", requiredTargets: ["platform_super_admin", "tenant_owner", "reports_engine"], reportHooks: ["reports.platform.workshops.view"], customerSafeAllowed: false }
];
