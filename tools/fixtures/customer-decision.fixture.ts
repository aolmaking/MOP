export const customerDecisionFixture = {
  scenario: "customer_decision_critical_rejection",
  actors: ["customer", "technician", "branch_manager"],
  records: {
    customerId: "cust_omar",
    assetId: "asset_corolla",
    workOrderId: "wo1021",
    decisionRequestId: "dec_req_brakes"
  },
  steps: [
    "technician creates customer decision request",
    "system sends secure decision link",
    "customer rejects critical item with warning acknowledgement",
    "branch manager sees critical rejection attention card",
    "technician work card finish gate is blocked until follow-up"
  ],
  expectedEvents: ["customer_decision.requested", "customer_decision.sent", "customer_decision.responded"],
  expectedBlockedReasons: ["Critical customer rejection requires follow-up."]
};
