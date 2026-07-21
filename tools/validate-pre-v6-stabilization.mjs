import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const requiredFiles = [
  "packages/shared/src/lifecycles/part-request-lifecycle.ts",
  "packages/shared/src/lifecycles/return-lifecycle.ts",
  "packages/shared/src/lifecycles/task-lifecycle.ts",
  "packages/shared/src/lifecycles/customer-decision-lifecycle.ts",
  "packages/shared/src/lifecycles/work-order-lifecycle.ts",
  "packages/shared/src/lifecycles/stock-status.ts",
  "packages/shared/src/lifecycles/delivery-readiness-lifecycle.ts",
  "packages/shared/src/lifecycles/payment-status.ts",
  "packages/shared/src/domain-contracts/api-error.contract.ts",
  "packages/shared/src/domain-contracts/audit-event.contract.ts",
  "apps/api/src/domain/services/part-lifecycle.service.ts",
  "apps/api/src/domain/services/return-lifecycle.service.ts",
  "apps/api/src/domain/services/inventory-ledger.service.ts",
  "apps/api/src/domain/services/technician-finish-gate.service.ts",
  "apps/api/src/domain/services/customer-safe-timeline.service.ts",
  "packages/shared/src/permissions/permissions.ts",
  "packages/shared/src/permissions/action-guards.ts",
  "packages/shared/src/permissions/role-permission-map.ts",
  "packages/shared/src/permissions/route-guards.ts",
  "packages/shared/src/permissions/data-visibility-rules.ts",
  "packages/shared/src/permissions/scope-rules.ts",
  "apps/web/src/app/core/api/technician-api.service.ts",
  "apps/web/src/app/core/api/inventory-api.service.ts",
  "apps/web/src/app/core/api/customer-decisions-api.service.ts",
  "apps/web/src/app/core/api/work-orders-api.service.ts",
  "apps/web/src/app/core/api/branch-manager-api.service.ts",
  "apps/web/src/app/core/api/customer-portal-api.service.ts",
  "apps/web/src/app/core/api/auth-api.service.ts",
  "apps/web/src/app/core/api/api-errors.ts",
  "tools/fixtures/customer-decision.fixture.ts",
  "tools/fixtures/technician-work-card.fixture.ts",
  "tools/fixtures/inventory-lifecycle.fixture.ts"
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const file of requiredFiles) {
  assert(fs.existsSync(path.join(root, file)), `Missing Pre-V6 P0 file: ${file}`);
}

const sharedIndex = fs.readFileSync(path.join(root, "packages/shared/src/index.ts"), "utf8");
for (const exportName of ["./lifecycles", "./domain-contracts", "./permissions"]) {
  assert(sharedIndex.includes(exportName), `Shared index does not export ${exportName}`);
}

const appModule = fs.readFileSync(path.join(root, "apps/api/src/app.module.ts"), "utf8");
assert(appModule.includes("DomainServicesModule"), "API AppModule must import DomainServicesModule.");

const lifecycleDir = path.join(root, "packages/shared/src/lifecycles");
for (const file of fs.readdirSync(lifecycleDir).filter((item) => item.endsWith(".ts") && item !== "index.ts" && item !== "types.ts")) {
  const content = fs.readFileSync(path.join(lifecycleDir, file), "utf8");
  assert(content.toLowerCase().includes("auditevent"), `Lifecycle ${file} must define audit events for transitions.`);
  assert(content.includes("roleLabels"), `Lifecycle ${file} must define role-safe labels.`);
}

const branchManagerComponent = fs.readFileSync(path.join(root, "apps/web/src/app/features/branch-manager/branch-manager.component.ts"), "utf8");
assert(branchManagerComponent.includes("BranchManagerApiService"), "Branch Manager component must use its feature API facade.");

console.log("Pre-V6 stabilization validation passed.");
