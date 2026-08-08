import type { StaffRole } from "../session/session-context";

/**
 * The canonical page-ID list per tenant-staff role, taken directly from
 * each role's detailed spec in docs/detailed-specs/ -- this is what
 * RolePage rows are keyed against (page-level nav visibility, coarser
 * than a PermissionKey). TENANT_ADMIN mirrors TENANT_OWNER's page set:
 * the specs don't yet distinguish them, so matching Owner honestly
 * reflects what's actually known rather than guessing at a split.
 */
export const ROLE_PAGES: Readonly<Record<StaffRole, readonly string[]>> = {
  TENANT_OWNER: [
    "owner.organization-access",
    "owner.forms-fields",
    "owner.messages-templates",
    "owner.pricing-financial-configuration",
    "owner.reports-analytics",
    "owner.audit-change-history",
    "owner.workflow-health",
    "owner.home",
  ],
  TENANT_ADMIN: [
    "owner.organization-access",
    "owner.forms-fields",
    "owner.messages-templates",
    "owner.pricing-financial-configuration",
    "owner.reports-analytics",
    "owner.audit-change-history",
    "owner.workflow-health",
    "owner.home",
  ],
  BRANCH_MANAGER: [
    "branch_manager.customer-intake",
    "branch_manager.work-orders-board",
    "branch_manager.work-order-workspace",
    "branch_manager.approvals-customer-decisions",
    "branch_manager.delivery-payments-status",
    "branch_manager.home",
    "branch_manager.team-setup",
  ],
  TECHNICIAN: ["technician.home", "technician.my-work", "technician.work-card"],
  INVENTORY_MANAGER: [
    "inventory_manager.pos-catalog-control",
    "inventory_manager.technician-requests",
    "inventory_manager.quantity-control-stock-status",
    "inventory_manager.returns-movements",
    "inventory_manager.home",
    "inventory_manager.reports-stock-insights",
  ],
  TEAM_LEADER: [
    "team_leader.technicians-view",
    "team_leader.vehicles-work-orders-view",
    "team_leader.home",
    "team_leader.technician-performance-reports",
  ],
  DATA_ANALYST: [
    "data_analyst.home",
    "data_analyst.operations-analytics",
    "data_analyst.technician-team-analytics",
    "data_analyst.inventory-analytics",
    "data_analyst.customer-decision-analytics",
    "data_analyst.feature-adoption-analytics",
    "data_analyst.saved-views-exports",
  ],
};
