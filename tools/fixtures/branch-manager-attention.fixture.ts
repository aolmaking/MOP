export const branchManagerAttentionFixture = {
  scenario: "branch_manager_attention_center_exceptions",
  actors: ["branch_manager", "technician", "inventory_manager", "customer"],
  expectedPages: ["branch-home", "branch-intake", "branch-work-orders", "branch-workspace", "branch-decisions", "branch-delivery"],
  cards: [
    "New / Active Work Orders",
    "Waiting Customer Decisions",
    "Waiting Parts",
    "Blockers",
    "Critical Rejections",
    "Rework / QC Failed",
    "Ready for Delivery",
    "Payment Pending",
    "Technician Load"
  ],
  expectedActions: ["assign_technician", "change_priority", "send_customer_reminder", "escalate_blocker", "record_manual_note", "mark_ready_delivery"]
};
