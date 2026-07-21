export type ReportLevel =
  | "personal"
  | "operational"
  | "inventory"
  | "performance"
  | "business"
  | "platform";

export type ReportSensitivity = "low" | "internal" | "sensitive" | "restricted";

export interface ReportRegistryItem {
  id: string;
  title: string;
  level: ReportLevel;
  ownerRole: string;
  allowedViewers: string[];
  permission: string;
  scope: Array<"self" | "team" | "branch" | "warehouse" | "category" | "company" | "platform" | "customer_own">;
  sensitiveLevel: ReportSensitivity;
  exportPermission?: string;
  drillDownPermissions: string[];
  controlledByOwner: boolean;
  controlledBySuperAdmin: boolean;
  embeddedRoutes: string[];
}

export const reportPermissionGroups = [
  "Reports - Personal",
  "Reports - Team",
  "Reports - Branch",
  "Reports - Inventory",
  "Reports - Company",
  "Reports - Finance",
  "Reports - Builder Adoption",
  "Reports - Feature Usage",
  "Reports - Export",
  "Reports - Drill-down",
  "Reports - Audit",
  "Reports - Platform"
] as const;

export const reportRegistry: ReportRegistryItem[] = [
  {
    id: "technician_self_summary",
    title: "Technician Personal Work Summary",
    level: "personal",
    ownerRole: "technician",
    allowedViewers: ["technician", "team_leader"],
    permission: "reports.technician.self.view",
    scope: ["self", "team"],
    sensitiveLevel: "internal",
    drillDownPermissions: ["reports.technician.task_summary.view"],
    controlledByOwner: true,
    controlledBySuperAdmin: true,
    embeddedRoutes: ["technician", "my-work", "work-card"]
  },
  {
    id: "technician_parts_activity",
    title: "Technician Parts Activity",
    level: "personal",
    ownerRole: "technician",
    allowedViewers: ["technician", "team_leader", "inventory_manager"],
    permission: "reports.technician.parts_activity.view",
    scope: ["self", "team", "warehouse"],
    sensitiveLevel: "internal",
    drillDownPermissions: ["reports.drilldown.inventory_item"],
    controlledByOwner: true,
    controlledBySuperAdmin: true,
    embeddedRoutes: ["work-card", "inventory-requests"]
  },
  {
    id: "inventory_stock_health",
    title: "Inventory Stock Health",
    level: "inventory",
    ownerRole: "inventory_manager",
    allowedViewers: ["inventory_manager", "tenant_owner", "tenant_admin", "data_analyst"],
    permission: "reports.inventory.stock_health.view",
    scope: ["warehouse", "category", "branch"],
    sensitiveLevel: "sensitive",
    exportPermission: "reports.inventory.export",
    drillDownPermissions: ["reports.drilldown.inventory_item"],
    controlledByOwner: true,
    controlledBySuperAdmin: true,
    embeddedRoutes: ["inventory-home", "inventory-quantity", "inventory-reports", "reports"]
  },
  {
    id: "inventory_consumption",
    title: "Inventory Consumption",
    level: "inventory",
    ownerRole: "inventory_manager",
    allowedViewers: ["inventory_manager", "tenant_owner", "tenant_admin", "data_analyst"],
    permission: "reports.inventory.consumption.view",
    scope: ["warehouse", "category", "branch"],
    sensitiveLevel: "sensitive",
    exportPermission: "reports.inventory.export",
    drillDownPermissions: ["reports.drilldown.inventory_item", "reports.drilldown.work_order"],
    controlledByOwner: true,
    controlledBySuperAdmin: true,
    embeddedRoutes: ["inventory-reports", "reports"]
  },
  {
    id: "inventory_returns_supplier",
    title: "Inventory Returns & Supplier Status",
    level: "inventory",
    ownerRole: "inventory_manager",
    allowedViewers: ["inventory_manager", "tenant_owner", "tenant_admin", "data_analyst"],
    permission: "reports.inventory.returns.view",
    scope: ["warehouse", "category", "branch"],
    sensitiveLevel: "internal",
    exportPermission: "reports.inventory.export",
    drillDownPermissions: ["reports.drilldown.inventory_item"],
    controlledByOwner: true,
    controlledBySuperAdmin: true,
    embeddedRoutes: ["inventory-returns", "inventory-reports"]
  },
  {
    id: "branch_operations",
    title: "Branch Operations",
    level: "operational",
    ownerRole: "branch_manager",
    allowedViewers: ["branch_manager", "tenant_owner", "tenant_admin", "data_analyst"],
    permission: "reports.branch.operations.view",
    scope: ["branch"],
    sensitiveLevel: "sensitive",
    exportPermission: "reports.export.csv",
    drillDownPermissions: ["reports.drilldown.work_order"],
    controlledByOwner: true,
    controlledBySuperAdmin: true,
    embeddedRoutes: ["branch-home", "branch-work-orders", "reports"]
  },
  {
    id: "branch_delivery_payment_snapshot",
    title: "Branch Delivery & Payment Snapshot",
    level: "operational",
    ownerRole: "branch_manager",
    allowedViewers: ["branch_manager", "tenant_owner", "tenant_admin"],
    permission: "reports.branch.payment_snapshot.view",
    scope: ["branch"],
    sensitiveLevel: "restricted",
    exportPermission: "reports.export.excel",
    drillDownPermissions: ["reports.drilldown.work_order"],
    controlledByOwner: true,
    controlledBySuperAdmin: true,
    embeddedRoutes: ["branch-delivery", "reports"]
  },
  {
    id: "team_performance",
    title: "Team Performance",
    level: "performance",
    ownerRole: "team_leader",
    allowedViewers: ["team_leader", "branch_manager", "tenant_owner", "tenant_admin", "data_analyst"],
    permission: "reports.team.technician_performance.view",
    scope: ["team", "branch"],
    sensitiveLevel: "sensitive",
    exportPermission: "reports.export.csv",
    drillDownPermissions: ["reports.drilldown.user"],
    controlledByOwner: true,
    controlledBySuperAdmin: true,
    embeddedRoutes: ["team-review", "reports"]
  },
  {
    id: "company_overview",
    title: "Company Overview",
    level: "business",
    ownerRole: "tenant_owner",
    allowedViewers: ["tenant_owner", "tenant_admin", "data_analyst"],
    permission: "reports.company.view",
    scope: ["company"],
    sensitiveLevel: "restricted",
    exportPermission: "reports.export.excel",
    drillDownPermissions: ["reports.company.branch_compare.view", "reports.drilldown.work_order"],
    controlledByOwner: true,
    controlledBySuperAdmin: true,
    embeddedRoutes: ["tenant", "reports"]
  },
  {
    id: "builder_feature_adoption",
    title: "Builder & Feature Adoption",
    level: "business",
    ownerRole: "tenant_owner",
    allowedViewers: ["tenant_owner", "tenant_admin", "data_analyst"],
    permission: "reports.builder_adoption.view",
    scope: ["company"],
    sensitiveLevel: "internal",
    exportPermission: "reports.export.csv",
    drillDownPermissions: ["reports.feature_usage.view"],
    controlledByOwner: true,
    controlledBySuperAdmin: true,
    embeddedRoutes: ["builder-home", "reports"]
  },
  {
    id: "permissions_audit",
    title: "Permissions & Configuration Audit",
    level: "business",
    ownerRole: "tenant_owner",
    allowedViewers: ["tenant_owner", "tenant_admin"],
    permission: "reports.permissions_audit.view",
    scope: ["company"],
    sensitiveLevel: "restricted",
    exportPermission: "reports.export.pdf",
    drillDownPermissions: ["reports.audit.view"],
    controlledByOwner: true,
    controlledBySuperAdmin: true,
    embeddedRoutes: ["builder-configuration-permissions", "audit"]
  },
  {
    id: "platform_workshop_success",
    title: "Platform Workshop Success",
    level: "platform",
    ownerRole: "platform_super_admin",
    allowedViewers: ["platform_super_admin"],
    permission: "reports.platform.workshops.view",
    scope: ["platform"],
    sensitiveLevel: "restricted",
    exportPermission: "reports.platform.export",
    drillDownPermissions: ["reports.drilldown.user"],
    controlledByOwner: false,
    controlledBySuperAdmin: true,
    embeddedRoutes: ["platform-reports"]
  }
];

export const reportPermissionCodes = [...new Set(reportRegistry.flatMap((report) => [
  report.permission,
  report.exportPermission,
  ...report.drillDownPermissions
]).filter(Boolean) as string[])];
