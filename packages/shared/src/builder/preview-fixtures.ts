export const builderPreviewFixtures: Record<string, unknown> = {
  "technician-work-card": {
    workOrderNumber: "WO-2026-0001",
    technicianName: "Technician Ahmed",
    taskTitle: "Initial inspection and brake noise diagnosis",
    partsState: "arrived",
    customerDecisionState: "waiting",
    finishGate: ["pending_customer_decision", "arrived_part_not_used_or_returned"]
  },
  "customer-decision": {
    customerName: "Customer Omar",
    assetIdentifier: "ABC-1234",
    requiredVariables: ["customer_name", "asset_identifier", "branch_name", "decision_link"],
    items: ["Brake pads replacement", "Critical safety warning acknowledgement"]
  },
  "inventory-lifecycle": {
    managerName: "Inventory Manager Mona",
    pendingRequests: 4,
    inTransit: 2,
    returnPending: 1,
    zeroStockItems: ["Battery 70Ah"]
  },
  "branch-manager-attention": {
    managerName: "Branch Manager Khaled",
    blockers: 2,
    waitingCustomer: 3,
    waitingParts: 4,
    readyDelivery: 5
  },
  "team-leader-review": {
    teamLeaderName: "Team Leader Youssef",
    awaitingReview: 6,
    reworkRequired: 1,
    readyForQc: 3,
    scopeMode: "assigned_technicians"
  },
  "delivery-payment-snapshot": {
    paymentState: "partial",
    deliveryAllowed: false,
    locks: ["payment_pending", "customer_decision_pending"]
  },
  "multi-warehouse": {
    branch: "Nasr City Branch",
    primaryWarehouse: "Quick Service Warehouse",
    sharedWarehouse: "Alex Shared Warehouse",
    transferNeeded: true
  },
  identity: {
    tenantOwnerRole: "tenant_owner",
    tenantAdminRole: "tenant_admin",
    permissionSplit: ["builder.brand.edit", "builder.pages.edit", "builder.publish"]
  }
};
