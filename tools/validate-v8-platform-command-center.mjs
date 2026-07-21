import { readFileSync } from "node:fs";

const checks = [];

function file(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function expect(name, condition) {
  checks.push({ name, condition: Boolean(condition) });
}

function has(text, ...patterns) {
  return patterns.every((pattern) => text.includes(pattern));
}

const product = file("packages/shared/src/product-constants.ts");
const routes = file("apps/web/src/app/app.routes.ts");
const component = file("apps/web/src/app/features/platform/platform-command-center.component.ts");
const service = file("apps/api/src/modules/platform/platform.service.ts");
const controller = file("apps/api/src/modules/platform/platform.controller.ts");
const auth = file("apps/api/src/auth/auth.service.ts");
const sharedTypes = file("packages/shared/src/platform.ts");
const resolver = file("packages/shared/src/platform-control-resolver.ts");
const seed = file("packages/database/prisma/seed.ts");

expect("route catalog has five V8 platform pages", has(product, "platform-add-workshop", "platform-reports", "platform-live-view", "platform-control"));
expect("platform super admin default pages are V8 pages", has(product, 'platform_super_admin: ["platform", "platform-add-workshop", "platform-reports", "platform-live-view", "platform-control", "audit"]'));
expect("seed grants V8 platform pages", has(seed, "platform-add-workshop", "platform-reports", "platform-live-view", "platform-control"));
expect("Angular routes use PlatformCommandCenterComponent", has(routes, "PlatformCommandCenterComponent", "platformPage: \"workshops\"", "platformPage: \"control\""));
expect("component renders workshops/add/reports/live/control", has(component, "Workshops", "Add Workshop Owner", "Platform Reports", "Workshop Live View", "Super Admin Control Center"));
expect("component calls platform command center API", has(component, "/platform/command-center", "/platform/workshops", "/platform/live-view/session", "/platform/control/preview", "/platform/control/apply"));
expect("component supports freeze, reactivate and rollback", has(component, "/freeze", "/reactivate", "/platform/control/rollback"));
expect("shared types include control domains and control types", has(sharedTypes, "reports_visibility", "data_visibility", "hard_disable", "read_only", "frozen"));
expect("service creates workshop owner and audit", has(service, "addWorkshopOwner", "platform.workshop.created", "Tenant Owner"));
expect("service freezes/reactivates with session revoke", has(service, "freezeWorkshop", "reactivateWorkshop", "revokedAt", "portalEnabled: false"));
expect("service reports include builder adoption and feature usage", has(service, "builderAdoption", "Customer Decision Requests", "Workshop Builder", "Payment risk"));
expect("service has live view logging", has(service, "logLiveViewSession", "platform.live_view.opened", "read_only"));
expect("service has impact preview, apply, rollback and resolver", has(service, "previewControl", "applyControl", "rollbackControl", "resolveEffectivePlatformControls"));
expect("controller exposes V8 endpoints", has(controller, "command-center", "workshops/:tenantId/freeze", "live-view/session", "control/rollback", "control/effective"));
expect("auth blocks frozen/suspended tenant access", has(auth, "assertPlatformTenantAccess", "Your workspace is temporarily unavailable", "Customer portal is temporarily unavailable"));
expect("resolver declares hierarchy and blocks platform controls", has(resolver, "platform_hard_safety_rules", "platform_emergency_controls", "CAPABILITY_DISABLED_BY_PLATFORM", "TENANT_BLOCKED_BY_PLATFORM"));

const failed = checks.filter((check) => !check.condition);
for (const check of checks) {
  console.log(`${check.condition ? "PASS" : "FAIL"} ${check.name}`);
}

if (failed.length) {
  console.error(`\nV8 validation failed: ${failed.length} check(s).`);
  process.exit(1);
}

console.log("\nPASS - V8 Platform Command Center acceptance checks passed.");
