import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const requiredFiles = [
  "package.json",
  "pnpm-workspace.yaml",
  "docker-compose.yml",
  "angular.json",
  "apps/web/package.json",
  "apps/web/src/main.ts",
  "apps/web/src/app/app.routes.ts",
  "apps/web/src/app/core/auth/auth.store.ts",
  "apps/web/src/app/features/identity-gateway/identity-gateway.component.ts",
  "apps/web/src/app/features/customer-decisions/customer-decisions.component.ts",
  "apps/web/src/app/features/customer-decision-public/customer-decision-public.component.ts",
  "apps/web/src/app/features/technician/technician-home.component.ts",
  "apps/web/src/app/features/technician/technician-my-work.component.ts",
  "apps/web/src/app/features/technician/technician-work-card.component.ts",
  "apps/api/src/modules/technician/technician.service.ts",
  "apps/api/package.json",
  "apps/api/src/main.ts",
  "apps/api/src/app.module.ts",
  "apps/api/src/auth/auth.service.ts",
  "apps/api/src/modules/customer-decisions/customer-decisions.service.ts",
  "apps/api/src/access/access.service.ts",
  "packages/shared/src/contracts.ts",
  "packages/database/prisma/schema.prisma",
  "packages/database/prisma/seed.ts",
  "docs/architecture.md",
  "docs/migration-plan.md",
  "docs/v2-customer-decision-flow.md",
  "docs/v3-technician-simple-execution-mode.md"
];

const requiredModels = [
  "Tenant",
  "Branch",
  "Warehouse",
  "Account",
  "Session",
  "StaffUser",
  "Customer",
  "Asset",
  "AssetOwnershipHistory",
  "WorkOrder",
  "Task",
  "InventoryItem",
  "PartRequest",
  "CustomerDecisionRequest",
  "CustomerDecisionItem",
  "CustomerTimelineEvent",
  "Quotation",
  "Invoice",
  "Payment",
  "AuditLog"
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const file of requiredFiles) {
  assert(fs.existsSync(path.join(root, file)), `Missing required file: ${file}`);
}

for (const file of ["package.json", "apps/web/package.json", "apps/api/package.json", "packages/shared/package.json", "packages/database/package.json"]) {
  JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
}

const schema = fs.readFileSync(path.join(root, "packages/database/prisma/schema.prisma"), "utf8");
for (const model of requiredModels) {
  assert(schema.includes(`model ${model} `), `Prisma schema is missing model ${model}`);
}

const routes = fs.readFileSync(path.join(root, "apps/web/src/app/app.routes.ts"), "utf8");
for (const route of ["platform", "tenant", "users-access", "customers", "customer-decisions", "branch", "work-orders", "quotations", "pos", "billing", "inventory", "reports", "control", "permissions", "technician", "my-work", "work-card", "team-review", "audit", "customer"]) {
  assert(routes.includes(`routeId: "${route}"`), `Angular routes missing ${route}`);
}

const tsFiles = requiredFiles
  .filter((file) => file.endsWith(".ts"))
  .concat(
    fs
      .readdirSync(path.join(root, "apps/api/src"), { recursive: true })
      .filter((file) => String(file).endsWith(".ts"))
      .map((file) => path.join("apps/api/src", String(file))),
    fs
      .readdirSync(path.join(root, "apps/web/src"), { recursive: true })
      .filter((file) => String(file).endsWith(".ts"))
      .map((file) => path.join("apps/web/src", String(file)))
  );

for (const file of new Set(tsFiles)) {
  const absolute = path.join(root, file);
  const source = fs.readFileSync(absolute, "utf8");
  for (const match of source.matchAll(/from\s+["'](\.[^"']+)["']/g)) {
    const target = path.resolve(path.dirname(absolute), match[1]);
    const candidates = [`${target}.ts`, path.join(target, "index.ts")];
    assert(candidates.some((candidate) => fs.existsSync(candidate)), `Broken relative import in ${file}: ${match[1]}`);
  }
}

console.log("MOP v4 structure validation passed.");
