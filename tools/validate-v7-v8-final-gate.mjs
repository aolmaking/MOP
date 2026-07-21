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

const ownerTypes = file("packages/shared/src/owner-configuration.ts");
const sharedIndex = file("packages/shared/src/index.ts");
const routesCatalog = file("packages/shared/src/product-constants.ts");
const roleMap = file("packages/shared/src/permissions/role-permission-map.ts");
const seed = file("packages/database/prisma/seed.ts");
const angularRoutes = file("apps/web/src/app/app.routes.ts");
const builderComponent = file("apps/web/src/app/features/builder/builder.component.ts");
const schemaRenderer = file("apps/web/src/app/shared/schema-renderer/schema-renderer.component.ts");
const builderApi = file("apps/web/src/app/core/api/builder-api.service.ts");
const builderService = file("apps/api/src/modules/builder/builder.service.ts");
const builderController = file("apps/api/src/modules/builder/builder.controller.ts");
const platformComponent = file("apps/web/src/app/features/platform/platform-command-center.component.ts");
const platformService = file("apps/api/src/modules/platform/platform.service.ts");
const platformController = file("apps/api/src/modules/platform/platform.controller.ts");
const platformResolver = file("packages/shared/src/platform-control-resolver.ts");

expect("owner configuration shared contract is exported", sharedIndex, "./owner-configuration");
expect("owner configuration contract models matrix and locks", ownerTypes, "OwnerRoleTemplateDto", "OwnerUserPermissionDto", "OwnerScopeRuleDto", "OwnerLockedControlDto", "OwnerPermissionImpactPreviewDto");
expect("configuration route exists in catalog", routesCatalog, "builder-configuration-permissions", "Configuration & Permissions", "configuration.permissions.view");
expectPattern("tenant owner/admin get configuration page", routesCatalog, /tenant_owner:[\s\S]*builder-configuration-permissions[\s\S]*tenant_admin:[\s\S]*builder-configuration-permissions/);
expect("seed grants configuration route and permissions", seed, "builder-configuration-permissions", "configuration.permissions.view", "configuration.permissions.edit", "configuration.templates.edit");
expect("role permission map has owner config powers", roleMap, "configuration.permissions.view", "configuration.permissions.edit", "configuration.templates.edit", "configuration.user_overrides.edit");
expect("role permission map covers major operating roles", roleMap, "technician.work_card.view", "inventory.request.issue", "task.review", "branch.work_order.assign", "inventory.reports.view");

expect("Angular route opens owner configuration page", angularRoutes, "builder-configuration-permissions", "builderPage: \"configuration-permissions\"");
expect("Builder API exposes owner configuration endpoints", builderApi, "configurationPermissions()", "saveConfigurationPermissionsDraft", "previewConfigurationPermissions", "applyConfigurationPermissions", "resetConfigurationRoleTemplate");
expect("Builder controller protects owner configuration endpoints", builderController, "configuration-permissions", "configuration.permissions.view", "configuration.permissions.edit", "configuration.templates.edit");
expect("Builder service has owner configuration lifecycle", builderService, "OWNER_PERMISSION_DRAFT_KEY", "configurationPermissions", "saveConfigurationPermissionsDraft", "previewConfigurationPermissions", "applyConfigurationPermissions", "resetConfigurationRoleTemplate");
expect("Builder service enforces platform locks and impact", builderService, "lockedControls", "lockReasonForPermission", "ownerPermissionImpact", "platformConflicts", "canApply");
expect("Builder service persists templates, scopes, and audit", builderService, "permissionTemplate.upsert", "rolePermission.upsert", "staffUser.update", "owner.configuration.permissions.applied", "owner.configuration.permissions.draft_saved");

expect("Builder component renders owner tabs", builderComponent, "Role Templates", "User Permissions", "Permission Matrix", "Scope Rules", "Locked by Platform", "Change History");
expect("Builder component supports matrix modes and filters", builderComponent, "matrixMode", "permissionSearch", "permissionGroupFilter", "filteredPermissionDefinitions");
expect("Builder component supports locked cells and owner impact", builderComponent, "cell.locked", "ownerConfigurationImpact", "previewOwnerConfigurationImpact", "applyOwnerConfiguration");
expect("Builder component exposes draft/apply/reset controls", builderComponent, "saveOwnerConfigurationDraft", "resetOwnerRoleTemplate", "Configuration permissions applied and audited");

expect("V7 builder foundation remains present", builderComponent, "dragStart", "dropSection", "hideSection", "restoreSection");
expect("V7 preview remains read-only", schemaRenderer, "Preview Mode - actions are not saved", "disabled");
expect("V8 platform command center remains present", platformComponent, "Add Workshop Owner", "Platform Reports", "Workshop Live View", "Super Admin Control Center");
expect("V8 platform service remains control-plane capable", platformService, "addWorkshopOwner", "freezeWorkshop", "reactivateWorkshop", "previewControl", "applyControl", "rollbackControl");
expect("V8 platform controller exposes control plane endpoints", platformController, "command-center", "workshops/:tenantId/freeze", "control/preview", "control/apply", "control/rollback");
expect("platform resolver keeps precedence and safety blocking", platformResolver, "platform_hard_safety_rules", "platform_emergency_controls", "CAPABILITY_DISABLED_BY_PLATFORM", "TENANT_BLOCKED_BY_PLATFORM");

const failed = checks.filter((check) => !check.ok);
for (const check of checks) console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name}`);

if (failed.length) {
  console.error(`\nFAIL - Do not start Version 9. ${failed.length} gate check(s) failed.`);
  process.exit(1);
}

console.log("\nPASS - Ready for Version 9");
