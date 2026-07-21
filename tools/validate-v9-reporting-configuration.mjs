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

function expectPattern(name, text, pattern) {
  checks.push({ name, ok: pattern.test(text) });
}

const reports = file("packages/shared/src/reports.ts");
const sharedIndex = file("packages/shared/src/index.ts");
const roleMap = file("packages/shared/src/permissions/role-permission-map.ts");
const product = file("packages/shared/src/product-constants.ts");
const seed = file("packages/database/prisma/seed.ts");
const routes = file("apps/web/src/app/app.routes.ts");
const authStore = file("apps/web/src/app/core/auth/auth.store.ts");
const shell = file("apps/web/src/app/core/layout/shell.component.ts");
const styles = file("apps/web/src/styles.css");
const builderService = file("apps/api/src/modules/builder/builder.service.ts");
const builderComponent = file("apps/web/src/app/features/builder/builder.component.ts");
const inventoryController = file("apps/api/src/modules/inventory/inventory.controller.ts");
const inventoryComponent = file("apps/web/src/app/features/inventory/inventory.component.ts");
const platformComponent = file("apps/web/src/app/features/platform/platform-command-center.component.ts");
const platformService = file("apps/api/src/modules/platform/platform.service.ts");

expect("shared report registry exported", sharedIndex, "./reports");
expect("report registry models V9 report contract", reports, "ReportRegistryItem", "ownerRole", "allowedViewers", "sensitiveLevel", "controlledByOwner", "controlledBySuperAdmin");
expect("report registry covers six report levels", reports, "personal", "operational", "inventory", "performance", "business", "platform");
expect("report registry defines owner/report permission groups", reports, "Reports - Personal", "Reports - Inventory", "Reports - Company", "Reports - Export", "Reports - Drill-down", "Reports - Platform");
expect("role map includes detailed report permissions", roleMap, "reports.technician.self.view", "reports.inventory.stock_health.view", "reports.branch.operations.view", "reports.team.technician_performance.view", "reports.company.view", "reports.export.excel", "reports.platform.workshops.view");
expect("seed includes detailed report permissions", seed, "reports.technician.self.view", "reports.inventory.stock_health.view", "reports.branch.operations.view", "reports.team.technician_performance.view", "reports.company.view", "reports.export.excel");
expect("tenant and platform reports are separate routes", product, "platform-reports", "reports.platform.workshops.view", "analytics-home", "analytics-operations", "analytics-people", "analytics-inventory-customer");
expectPattern("tenant reports route is tenant scoped", product, /\{ id: "reports", label: "Reports", permission: "reports\.company\.view", accountTypes: \["tenant_staff"\] \}/);
expect("Data Analyst has four analytics pages", product, "data_analyst: [\"analytics-home\", \"analytics-operations\", \"analytics-people\", \"analytics-inventory-customer\", \"reports\"]");
expect("Angular routes expose analytics pages", routes, "analytics-home", "analytics-operations", "analytics-people", "analytics-inventory-customer");
expect("Owner Configuration has report section", builderService, "reports-intelligence", "Reports & Intelligence", "reportPermissionGroups", "reportPermissionCodes", "reportRegistry");
expect("Owner Configuration UI groups settings by section", builderComponent, "Configuration Sections", "selectedConfigurationSectionId", "activeConfigurationSection", "selectConfigurationSection");
expect("report permission groups are mapped in permission matrix", builderService, "Reports - Personal", "Reports - Inventory", "Reports - Export", "Reports - Drill-down");
expect("platform control has report presets", platformComponent, "Disable Reports", "Lock Exports", "Lock Financial Reports", "Lock Inventory Value", "Lock User Performance");
expect("platform impact names report effects", platformService, "reportsAffected", "reports_module", "financial_reports", "inventory_value_reports", "user_performance_reports");
expect("frontend exposes permission helpers", authStore, "hasPermission", "hasAnyPermission", "hasAllPermissions");
expect("inventory reports are permission-hidden", inventoryComponent, "canReport", "reports.inventory.stock_health.view", "reports.inventory.consumption.view", "reports.inventory.returns.view", "Inventory reports are hidden by Owner Configuration or Platform Control");
expect("inventory report endpoint uses report permission", inventoryController, "reports.inventory.view");
expect("frontend has resilient adaptive layout utilities", styles, "mop-adaptive-grid", "mop-resilient-row", "mop-empty-state");
expect("sidebar tolerates dynamic navigation length", shell, "overflow-y-auto");

const failed = checks.filter((check) => !check.ok);
for (const check of checks) console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}`);

if (failed.length) {
  console.error(`\nFAIL - V9 Reporting Configuration Gate blocked by ${failed.length} issue(s).`);
  process.exit(1);
}

console.log("\nPASS - V9 Reporting Configuration foundation is ready.");
