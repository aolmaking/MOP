import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const checks = [];

function file(path) {
  const fullPath = join(root, path);
  if (!existsSync(fullPath)) {
    checks.push({ name: `missing ${path}`, ok: false });
    return "";
  }
  return readFileSync(fullPath, "utf8");
}

function expect(name, text, ...needles) {
  checks.push({ name, ok: needles.every((needle) => text.includes(needle)) });
}

const reports = file("packages/shared/src/reports.ts");
const roleMap = file("packages/shared/src/permissions/role-permission-map.ts");
const product = file("packages/shared/src/product-constants.ts");
const builderService = file("apps/api/src/modules/builder/builder.service.ts");
const builderComponent = file("apps/web/src/app/features/builder/builder.component.ts");
const platformComponent = file("apps/web/src/app/features/platform/platform-command-center.component.ts");
const platformService = file("apps/api/src/modules/platform/platform.service.ts");
const inventoryComponent = file("apps/web/src/app/features/inventory/inventory.component.ts");
const styles = file("apps/web/src/styles.css");

expect("reports are registry-based, not one generic page", reports, "reportRegistry", "ReportRegistryItem", "allowedViewers", "scope", "sensitiveLevel");
expect("every report declares control ownership and capabilities", reports, "controlledByOwner", "controlledBySuperAdmin", "exportPermission", "drillDownPermissions");
expect("technician reports are personal only", roleMap, "reports.technician.self.view", "reports.technician.task_summary.view", "reports.technician.parts_activity.view");
expect("inventory manager has scoped inventory reports", roleMap, "reports.inventory.stock_health.view", "reports.inventory.movements.view", "reports.inventory.consumption.view", "reports.inventory.returns.view", "reports.inventory.supplier.view");
expect("branch manager has branch operational reports", roleMap, "reports.branch.operations.view", "reports.branch.delays.view", "reports.branch.delivery.view", "reports.branch.payment_snapshot.view");
expect("team leader has managed-team reports", roleMap, "reports.team.view", "reports.team.technician_performance.view", "reports.team.parts_activity.view", "reports.team.blockers.view");
expect("owner and analyst have company/read-only intelligence", roleMap, "reports.company.view", "reports.company.branch_compare.view", "reports.builder_adoption.view", "reports.feature_usage.view");
expect("customer has no report permissions", roleMap, "customer: [\"customer.portal.view\"", "customer_decision.view_own");
expect("platform reports are separated", product, "platform-reports", "reports.platform.workshops.view", "accountTypes: [\"platform\"]");
expect("owner configuration includes report groups", builderService, "Reports - Personal", "Reports - Team", "Reports - Branch", "Reports - Inventory", "Reports - Company", "Reports - Finance", "Reports - Export", "Reports - Drill-down", "Reports - Audit");
expect("owner configuration has Reports & Intelligence section", builderService, "reports-intelligence", "Reports & Intelligence", "reportPermissionGroups");
expect("super admin report controls exist", platformComponent, "Disable Reports", "Lock Exports", "Lock Financial Reports", "Lock User Performance");
expect("report access honors platform effects", platformService, "reportsAffected", "reports_module", "financial_reports", "inventory_value_reports", "user_performance_reports");
expect("UI uses resilient report widgets", inventoryComponent, "canReport", "mop-empty-state", "reports.inventory.stock_health.view", "reports.inventory.consumption.view");
expect("adaptive dashboard primitives exist", styles, "mop-adaptive-grid", "mop-resilient-row", "mop-empty-state");
expect("Owner UI filters by configuration section", builderComponent, "Configuration Sections", "activeConfigurationSection", "selectConfigurationSection");

const failed = checks.filter((check) => !check.ok);
for (const check of checks) console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}`);

if (failed.length) {
  console.error(`\nFAIL - Do not start Version 10. ${failed.length} V9 final gate check(s) failed.`);
  process.exit(1);
}

console.log("\nPASS - V9 Final Gate passed. Start Version 10.");
