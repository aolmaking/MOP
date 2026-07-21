export const technicianWorkCardFixture = {
  scenario: "technician_finish_gate_with_parts_and_customer_decision",
  actors: ["technician", "inventory_manager", "branch_manager", "customer"],
  records: {
    technicianId: "u_tech",
    workOrderId: "wo1021",
    taskId: "task_brake",
    partRequestId: "req_issued_brake"
  },
  steps: [
    "technician starts assigned task",
    "technician requests part from work card",
    "inventory manager issues part",
    "technician confirms arrived",
    "technician marks part used",
    "technician attempts finish",
    "finish gate routes to team review when policy is on"
  ],
  expectedEvents: ["part.requested", "part.issued", "part.arrived_confirmed", "part.used", "task.sent_to_team_review"],
  expectedPages: ["technician", "my-work", "work-card"]
};
