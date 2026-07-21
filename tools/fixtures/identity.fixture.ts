export const identityFixture = {
  scenario: "identity_role_page_matrix",
  actors: ["tenant_admin", "branch_manager", "technician", "inventory_manager", "customer"],
  expectedEntryRoutes: {
    branch_manager: "branch-home",
    technician: "technician",
    inventory_manager: "inventory-home",
    customer: "customer"
  },
  expectedRolePages: {
    branch_manager: ["branch-home", "branch-intake", "branch-work-orders", "branch-workspace", "branch-decisions", "branch-delivery"],
    technician: ["technician", "my-work", "work-card"],
    inventory_manager: ["inventory-home", "inventory-requests", "inventory-catalog", "inventory-quantity", "inventory-returns", "inventory-reports"]
  }
};
