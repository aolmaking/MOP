export const deliveryPaymentSnapshotFixture = {
  scenario: "delivery_payment_snapshot_blocks_handover",
  actors: ["branch_manager", "customer"],
  records: {
    workOrderId: "wo1021",
    invoiceId: "inv_wo1021"
  },
  checks: [
    "customer decisions clear",
    "parts resolved",
    "no open blockers",
    "payment clear",
    "customer notified"
  ],
  blockedReasons: ["Customer decision pending or critical rejection exists", "Parts lifecycle is not resolved", "Open technician blocker exists", "Payment is not clear"],
  expectedEvents: ["delivery.ready", "delivery.customer_notified", "delivery.handover_completed"]
};
