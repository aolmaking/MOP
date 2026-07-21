import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const read = (file) => readFileSync(resolve(process.cwd(), file), "utf8");
const checks = [];

try {
  execFileSync(process.execPath, ["tools/validate-english-only.mjs"], { cwd: process.cwd(), stdio: "pipe" });
  checks.push({ area: "language", pass: true, message: "Project contains no Arabic Unicode in first-party paths or files" });
} catch {
  checks.push({ area: "language", pass: false, message: "Project contains no Arabic Unicode in first-party paths or files" });
}

try {
  execFileSync(process.execPath, ["tools/validate-production-hardening.mjs"], { cwd: process.cwd(), stdio: "pipe" });
  checks.push({ area: "production-hardening", pass: true, message: "Production hardening gate passes" });
} catch {
  checks.push({ area: "production-hardening", pass: false, message: "Production hardening gate passes" });
}

function requireText(file, patterns, area) {
  const source = read(file);
  for (const pattern of patterns) {
    checks.push({
      area,
      pass: source.includes(pattern),
      message: `${file} contains ${pattern}`
    });
  }
}

function forbidText(file, patterns, area) {
  const source = read(file);
  for (const pattern of patterns) {
    checks.push({
      area,
      pass: !source.includes(pattern),
      message: `${file} excludes ${pattern}`
    });
  }
}

const productConstants = read("packages/shared/src/product-constants.ts");
const ownerPages = productConstants.match(/tenant_owner:\s*\[([\s\S]*?)\],\s*tenant_admin:/)?.[1] || "";
const technicianPages = productConstants.match(/technician:\s*\[([\s\S]*?)\],\s*team_leader:/)?.[1] || "";
for (const page of ["builder-home", "users-access", "customers", "work-orders", "inventory", "reports", "audit"]) {
  checks.push({ area: "roles", pass: ownerPages.includes(`"${page}"`), message: `Owner navigation includes ${page}` });
}
for (const page of ["tenant", "control", "permissions"]) {
  checks.push({ area: "roles", pass: !ownerPages.includes(`"${page}"`), message: `Owner navigation excludes duplicate ${page} placeholder` });
}
for (const page of ["technician", "my-work", "work-card"]) {
  checks.push({ area: "roles", pass: technicianPages.includes(`"${page}"`), message: `Technician navigation includes ${page}` });
}
checks.push({
  area: "roles",
  pass: (technicianPages.match(/"[^"]+"/g) || []).length === 3,
  message: "Technician has exactly three pages"
});

requireText("apps/api/src/modules/platform/platform.service.ts", [
  "AccountStatus.INVITED",
  "inviteTokenHash",
  "customerRegistrationCode",
  "createDefaultBuilderConfiguration"
], "flow");
requireText("apps/api/src/auth/auth.controller.ts", [
  '@Get("invitations/:token")',
  '@Post("invitations/accept")'
], "flow");
requireText("apps/api/src/auth/auth.service.ts", [
  "invitationInfo",
  "acceptInvitation",
  "auth.invitation.accepted"
], "flow");
requireText("apps/api/src/modules/identity/identity.service.ts", [
  "Only Tenant Owner or Tenant Admin can create staff accounts.",
  "inviteTokenHash",
  "organization.staff.created"
], "flow");
requireText("apps/api/src/modules/branch-manager/branch-manager.controller.ts", [
  '@Post("intake")',
  '@Post("work-orders/:id/action")',
  '@Post("delivery/:id/action")'
], "flow");
requireText("apps/api/src/modules/technician/technician.service.ts", [
  'action === "inspection.saved"',
  'action === "part.requested"',
  'action === "part.arrived"',
  'action === "part.marked_used"',
  "applyFinishGate",
  "customerDecisionsPending",
  "partRequestsPending",
  "blockersOpen"
], "flow");
requireText("apps/api/src/modules/customer-decisions/customer-decisions.service.ts", [
  "customer_decision.responded",
  "runningInvoice.upsert",
  "runningInvoiceLine"
], "flow");
requireText("apps/api/src/modules/inventory/inventory.controller.ts", [
  '@Post("technician-requests/:id/action")',
  '@Post("returns/:id/action")'
], "flow");
requireText("apps/api/src/modules/inventory/inventory.service.ts", [
  'action === "issue"',
  "warehouseStockBalance",
  "stockMovement"
], "flow");
requireText("apps/api/src/modules/finance/finance.controller.ts", [
  '@Post("work-orders/:id/issue")',
  '@Post("invoices/:id/payments")'
], "flow");
requireText("apps/api/src/modules/finance/finance.service.ts", [
  'status: "FINALIZED"',
  "deliveryGate",
  "payment.recorded"
], "flow");
requireText("apps/api/src/modules/team-leader/team-leader.controller.ts", [
  '@Get("review")',
  '@Post("review/:taskId/action")'
], "roles");
requireText("apps/api/src/modules/team-leader/team-leader.service.ts", [
  'action === "approve_qc"',
  'action === "return_rework"',
  "task.sent_to_qc"
], "roles");
requireText("apps/api/src/modules/reports/reports.controller.ts", ['@Get("overview")'], "reports");
requireText("apps/api/src/modules/reports/reports.service.ts", [
  "branches: branchRows",
  "technicians:",
  "recentActivity:"
], "reports");

requireText("apps/web/src/app/app.routes.ts", [
  '{ path: "invite/:token", component: InvitationComponent }',
  '{ path: "team-review", component: TeamReviewComponent',
  '{ path: "reports", component: ReportsComponent',
  '{ path: "analytics-home", component: ReportsComponent'
], "ux");
forbidText("apps/web/src/app/app.routes.ts", [
  '{ path: "team-review", component: DashboardComponent',
  '{ path: "reports", component: DashboardComponent',
  '{ path: "analytics-home", component: DashboardComponent'
], "ux");
requireText("apps/web/src/app/features/team-leader/team-review.component.ts", [
  "Approve for QC",
  "Return for Rework",
  "Subtasks complete"
], "ux");
requireText("apps/web/src/app/features/reports/reports.component.ts", [
  "Export CSV",
  "Branch performance",
  "Technician workload"
], "ux");
requireText("apps/web/src/app/features/invitation/invitation.component.ts", [
  "Activate Account",
  "Confirm password",
  "acceptInvitation"
], "ux");

requireText("packages/database/prisma/seed.ts", [
  'id: "tenant_apex"',
  'id: "tenant_delta"',
  'id: "tenant_frozen_demo"',
  'const demoPassword = "0000000"',
  'loginIdentifier: "platform_super_admin"',
  'login: "tenant_admin"',
  'login: "branch_manager"',
  'login: "technician"',
  'login: "team_leader"',
  'login: "inventory_manager"',
  'login: "data_analyst"',
  'loginIdentifier: "customer"',
  'loginIdentifier: "tenant_owner"',
  'loginIdentifier: "delta_technician"',
  'loginIdentifier: "delta_customer"',
  "TenantStatus.FROZEN",
  'id: "wo1021"',
  'id: "cdr_1021"',
  'id: "req_issued_brake"',
  'id: "invoice_paid_demo"',
  'id: "payment_paid_demo"',
  "PaymentStatus.CONFIRMED",
  "applyBuilderPreset",
  "tenantBuilderConfiguration.create",
  "tenantBuilderVersion.createMany",
  "builder.published"
], "demo");
requireText("package.json", ['"db:demo-logins": "node tools/update-demo-role-logins.mjs"'], "demo");
requireText("package.json", ['"db:doctor": "node tools/db-doctor.mjs"', '"db:reset-local"'], "demo");
requireText("pnpm-workspace.yaml", ["onlyBuiltDependencies", "@prisma/client", "@prisma/engines", "prisma", "esbuild"], "demo");
requireText("tools/update-demo-role-logins.mjs", ['const demoPassword = "0000000"', '["acc_platform_nour", "platform_super_admin"]'], "demo");
requireText("tools/update-demo-role-logins.mjs", ["createRequire", "packages/database", "package.json"], "demo");
requireText("tools/db-doctor.mjs", ["Prisma Client delegates match schema", "required Prisma tables exist"], "demo");
requireText("packages/database/prisma/seed.ts", ["assertSeedRuntimeReady", "DATABASE_URL is missing", "Generated Prisma Client is out of sync"], "demo");
forbidText("packages/database/prisma/seed.ts", [
  "MopDemo" + "#2026",
  "nour" + "@mop.dev",
  "salma" + "@apex.dev",
  "khaled" + "@apex.dev",
  "ahmed.tech" + "@apex.dev",
  "youssef" + "@apex.dev",
  "mona.stock" + "@apex.dev",
  "dina.reports" + "@apex.dev",
  "owner" + "@delta.dev",
  "tech" + "@delta.dev"
], "demo");

requireText("apps/api/src/modules/audit/audit.service.ts", ["auditLog.findMany"], "audit");
requireText("apps/api/src/app.module.ts", ["TeamLeaderModule", "ReportsModule"], "architecture");
requireText("packages/database/prisma/schema.prisma", [
  "inviteTokenHash",
  "inviteExpiresAt",
  "model TenantBuilderConfiguration",
  "model WarehouseStockBalance",
  "model RunningInvoice"
], "architecture");

const failed = checks.filter((check) => !check.pass);
for (const check of checks) {
  console.log(`${check.pass ? "PASS" : "FAIL"} [${check.area}] ${check.message}`);
}

const areaSummary = [...new Set(checks.map((check) => check.area))].map((area) => {
  const areaChecks = checks.filter((check) => check.area === area);
  return `${area}: ${areaChecks.filter((check) => check.pass).length}/${areaChecks.length}`;
});
console.log(`\nAreas: ${areaSummary.join(" | ")}`);

if (failed.length) {
  console.error(`RELEASE CANDIDATE GATE: FAIL (${failed.length}/${checks.length} failed)`);
  process.exit(1);
}
console.log(`RELEASE CANDIDATE GATE: PASS (${checks.length}/${checks.length})`);
