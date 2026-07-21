export interface V10OperationFlowFixture {
  id: string;
  events: string[];
  expectedPages: string[];
  expectedReports: string[];
  customerSafe: boolean;
  finalState: string;
}

export const v10OperationFlowFixtures: V10OperationFlowFixture[] = [
  {
    id: "customer-approval",
    events: ["work_order.created", "inspection.saved", "customer_decision.requested", "customer_decision.responded"],
    expectedPages: ["work-card", "branch-decisions", "team-review", "customer"],
    expectedReports: ["reports.team.customer_decisions.view", "reports.branch.operations.view"],
    customerSafe: true,
    finalState: "task.in_progress"
  },
  {
    id: "part-request-full",
    events: ["part.requested", "part.issued", "part.arrived_confirmed", "part.used"],
    expectedPages: ["inventory-requests", "work-card", "branch-workspace", "team-review"],
    expectedReports: ["reports.inventory.movements.view", "reports.inventory.consumption.view"],
    customerSafe: true,
    finalState: "part.used"
  },
  {
    id: "return-unused",
    events: ["part.issued", "part.arrived_confirmed", "part.return_requested", "part.return_accepted"],
    expectedPages: ["inventory-returns", "work-card", "branch-workspace"],
    expectedReports: ["reports.inventory.returns.view", "reports.inventory.movements.view"],
    customerSafe: false,
    finalState: "part.returned_to_stock"
  },
  {
    id: "waiting-parts",
    events: ["part.requested", "inventory.request.unavailable"],
    expectedPages: ["inventory-requests", "branch-workspace", "team-review", "customer"],
    expectedReports: ["reports.branch.delays.view", "reports.inventory.movements.view"],
    customerSafe: true,
    finalState: "work_order.waiting_parts"
  },
  {
    id: "permission-change",
    events: ["owner.permission_changed"],
    expectedPages: ["permissions", "affected-role-navigation", "audit"],
    expectedReports: ["reports.permissions_audit.view"],
    customerSafe: false,
    finalState: "effective_permissions.invalidated"
  },
  {
    id: "platform-control",
    events: ["platform_control.changed", "workshop.frozen", "workshop.reactivated"],
    expectedPages: ["platform-control", "platform-live-view", "builder-home"],
    expectedReports: ["reports.platform.workshops.view", "reports.permissions_audit.view"],
    customerSafe: false,
    finalState: "workshop.active"
  },
  {
    id: "finish-gate",
    events: ["task.finish_attempted", "task.finish_blocked", "task.sent_to_team_review", "task.sent_to_qc"],
    expectedPages: ["work-card", "team-review", "branch-workspace"],
    expectedReports: ["reports.team.technician_performance.view", "reports.branch.operations.view"],
    customerSafe: false,
    finalState: "task.ready_for_review_or_qc"
  }
];
