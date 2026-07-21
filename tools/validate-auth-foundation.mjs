import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file) => readFileSync(resolve(process.cwd(), file), "utf8");
const checks = [];
const requireText = (file, patterns) => {
  const source = read(file);
  for (const pattern of patterns) checks.push({ pass: source.includes(pattern), message: `${file} contains ${pattern}` });
};
const forbidText = (file, patterns) => {
  const source = read(file);
  for (const pattern of patterns) checks.push({ pass: !source.includes(pattern), message: `${file} excludes ${pattern}` });
};

requireText("packages/database/prisma/schema.prisma", [
  "SYSTEM_AUTOMATION", "LOCKED", "customerRegistrationCode", "customerRegistrationEnabled",
  "teamScope", "managedTechnicianIds", "userOverrides"
]);
requireText("apps/api/src/auth/auth.service.ts", [
  "registerCustomer", "Please use the workshop registration link or enter a valid workshop code.",
  "accountType: AccountType.CUSTOMER", "portalStatus: PortalStatus.ENABLED",
  "AccountType.SYSTEM_AUTOMATION", "assertAccountAndTenantAccess",
  "assertTenantAvailable", "auth.login.denied", "landingPage", "linkedAssetIds",
  "allowedControlScopes", "supportAccessMode"
]);
forbidText("apps/api/src/auth/auth.controller.ts", ["gateway-accounts", "gatewayAccounts"]);
forbidText("apps/api/src/auth/auth.service.ts", ["MOP_DEMO_GATEWAY", "gatewayAccounts", "GatewayAccountDto"]);
forbidText("apps/web/src/app/core/auth/auth.store.ts", ["gateway-accounts", "gatewayAccounts", "GatewayAccountDto"]);
forbidText("apps/web/src/app/core/api/auth-api.service.ts", ["gateway-accounts", "gatewayAccounts", "GatewayAccountDto"]);
requireText("apps/api/src/auth/effective-access-resolver.service.ts", [
  "platform_control", "tenant_configuration", "role_template", "user_override",
  "disabledModules", "customerInvoiceVisible", "builderConfigVersion", "readOnly"
]);
requireText("apps/api/src/access/access.service.ts", [
  "Workspace is read-only.", "locked by MOP Platform Admin", "managedTechnicianIds",
  "assertBranchScope", "assertWarehouseScope", "__deny_all__"
]);
requireText("apps/api/src/modules/identity/identity.service.ts", [
  "Only Tenant Owner or Tenant Admin can create staff accounts.",
  "Inventory Manager must have at least one warehouse scope.",
  "Team Leader must have at least one team or managed technician scope.",
  "permissionTemplateId", "organization.staff.created"
]);
requireText("apps/api/src/modules/platform/platform.service.ts", [
  "Platform Super Admin created workshop owner.", "AccountStatus.INVITED",
  "createDefaultBuilderConfiguration", "customerRegistrationCode",
  "session.updateMany", "TenantStatus.FROZEN", "mode: \"read_only\""
]);
requireText("apps/api/src/modules/builder/builder.service.ts", [
  "userOverrides: overrides", "teamScope: user.teamScope", "source: \"user_override\""
]);
requireText("apps/web/src/app/features/identity-gateway/identity-gateway.component.ts", [
  "Register as Customer", "Workshop code", "create customer portal access",
  "Staff and Owner accounts are created internally"
]);
forbidText("apps/web/src/app/features/identity-gateway/identity-gateway.component.ts", [
  "Tenant Staff</button>", "Platform</button>", "Choose a seeded account"
]);
requireText("apps/web/src/app/features/users-access/users-access.component.ts", [
  "Add Staff User", "Permission template", "Warehouse scope", "Managed technicians"
]);
requireText("apps/web/src/app/core/auth/auth.guard.ts", ["refreshContext", "access-denied"]);
requireText("packages/database/prisma/seed.ts", [
  'customerRegistrationCode: "APEX2026"', 'customerRegistrationCode: "DELTA2026"',
  'id: "tenant_delta"', 'id: "u_delta_tech"', 'id: "cust_delta"'
]);
requireText("apps/api/src/modules/finance/finance.controller.ts", [
  "finance.payment.record", "finance.invoice.issue", "finance.refund.request"
]);
requireText("apps/api/src/modules/technician/technician.service.ts", [
  '"parts.mark_used"', '"task.complete"'
]);
requireText("packages/shared/src/permissions/role-permission-map.ts", ['"customer_decision.send"']);

const failed = checks.filter((check) => !check.pass);
for (const check of checks) console.log(`${check.pass ? "PASS" : "FAIL"} ${check.message}`);
if (failed.length) {
  console.error(`\nAUTH FOUNDATION GATE: FAIL (${failed.length} checks)`);
  process.exit(1);
}
console.log(`\nAUTH FOUNDATION GATE: PASS (${checks.length} checks)`);
