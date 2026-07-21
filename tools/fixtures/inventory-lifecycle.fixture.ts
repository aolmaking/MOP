export const inventoryLifecycleFixture = {
  scenario: "part_request_issue_arrived_used_stock_movement",
  actors: ["technician", "inventory_manager"],
  records: {
    warehouseId: "wh_nasr_quick",
    itemId: "item_brake_pads",
    workOrderId: "wo1021",
    taskId: "task_brake"
  },
  steps: [
    "request part",
    "inventory manager reviews request",
    "issue part from scoped warehouse",
    "create ledger movement with before and after quantity",
    "technician confirms arrived",
    "technician marks used",
    "usage appears in inventory reports"
  ],
  expectedPartStatuses: ["pending_inventory_review", "issued", "awaiting_technician_confirmation", "received_by_technician", "used"],
  expectedEvents: ["part.requested", "part.issued", "part.arrived_confirmed", "part.used"]
};
