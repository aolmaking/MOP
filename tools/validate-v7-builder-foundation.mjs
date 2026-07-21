import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const requiredFiles = [
  "packages/shared/src/builder/types.ts",
  "packages/shared/src/builder/defaults.ts",
  "packages/shared/src/builder/section-registry.ts",
  "packages/shared/src/builder/validation.ts",
  "packages/shared/src/builder/impact.ts",
  "packages/shared/src/builder/index.ts",
  "apps/api/src/modules/builder/builder.service.ts",
  "apps/api/src/modules/builder/builder.controller.ts",
  "apps/api/src/modules/builder/builder.module.ts",
  "apps/web/src/app/core/api/builder-api.service.ts",
  "apps/web/src/app/features/builder/builder.component.ts",
  "apps/web/src/app/shared/schema-renderer/schema-renderer.component.ts",
  "docs/v7-workshop-builder-engine.md"
];

const failures = [];

for (const file of requiredFiles) {
  if (!existsSync(join(root, file))) failures.push(`Missing ${file}`);
}

function read(file) {
  return readFileSync(join(root, file), "utf8");
}

function expect(file, pattern, message) {
  const text = read(file);
  if (!pattern.test(text)) failures.push(`${file}: ${message}`);
}

expect("packages/shared/src/index.ts", /export \* from "\.\/builder";/, "Builder shared exports are missing.");
expect("packages/shared/src/builder/validation.ts", /finish_gate_panel/, "Finish gate validation rule is missing.");
expect("packages/shared/src/builder/validation.ts", /critical_warning_acknowledgement/, "Critical warning validation rule is missing.");
expect("packages/shared/src/builder/validation.ts", /unsafe raw code|raw HTML, JavaScript, SQL/i, "No-raw-code validation is missing.");
expect("packages/shared/src/builder/validation.ts", /contrastRatio/, "Theme accessibility contrast validation is missing.");
expect("packages/shared/src/builder/section-registry.ts", /forbiddenRoles/, "Forbidden role registry metadata is missing.");
expect("packages/shared/src/builder/section-registry.ts", /customerSafe: true/, "Customer-safe registry metadata is missing.");
expect("packages/shared/src/builder/section-registry.ts", /duplicatable/, "Duplicatable registry metadata is missing.");
expect("packages/shared/src/builder/defaults.ts", /builderPresets/, "Builder presets are missing.");
expect("packages/shared/src/builder/defaults.ts", /defaultPreviewIdentities/, "Real role preview identities are missing.");
expect("packages/shared/src/builder/defaults.ts", /defaultConfigPrecedence/, "Configuration precedence is missing.");
expect("packages/shared/src/builder/impact.ts", /riskLevel/, "Builder impact risk model is missing.");
expect("packages/shared/src/product-constants.ts", /builder-home/, "Builder routes are missing from route catalog.");
expect("packages/shared/src/product-constants.ts", /tenant_admin:[\s\S]*builder-publish-center/, "Tenant Admin Builder pages are missing.");
expect("packages/shared/src/product-constants.ts", /tenant_owner:[\s\S]*builder-publish-center/, "Tenant Owner Builder pages are missing.");
expect("packages/shared/src/permissions/role-permission-map.ts", /builder\.publish/, "Builder publish permission is missing.");
expect("packages/shared/src/permissions/role-permission-map.ts", /builder\.brand\.edit/, "Granular Builder brand permission is missing.");
expect("packages/shared/src/permissions/role-permission-map.ts", /builder\.audit\.view/, "Granular Builder audit permission is missing.");
expect("packages/database/prisma/seed.ts", /builder\.rollback/, "Seed Builder rollback permission is missing.");
expect("packages/database/prisma/seed.ts", /tenant_owner/, "Seed Tenant Owner role is missing.");
expect("packages/database/prisma/schema.prisma", /model TenantBuilderConfiguration/, "Prisma-ready Builder configuration model is missing.");
expect("packages/database/prisma/schema.prisma", /isTenantOwner/, "Tenant Owner database foundation is missing.");
expect("packages/database/prisma/schema.prisma", /schemaVersion/, "Builder schema version database foundation is missing.");
expect("apps/api/src/app.module.ts", /BuilderModule/, "API Builder module is not registered.");
expect("apps/api/src/modules/builder/builder.controller.ts", /@Post\("publish"\)/, "Publish endpoint is missing.");
expect("apps/api/src/modules/builder/builder.controller.ts", /discard-draft/, "Discard draft endpoint is missing.");
expect("apps/api/src/modules/builder/builder.controller.ts", /reset-section/, "Reset section endpoint is missing.");
expect("apps/api/src/modules/builder/builder.controller.ts", /apply-preset/, "Apply preset endpoint is missing.");
expect("apps/api/src/modules/builder/builder.service.ts", /validateBuilderConfiguration/, "Backend validation service hook is missing.");
expect("apps/api/src/modules/builder/builder.service.ts", /buildBuilderImpactPreview/, "Backend impact service hook is missing.");
expect("apps/api/src/modules/builder/builder.service.ts", /High-risk Builder changes require a publish reason/, "High-risk publish reason guard is missing.");
expect("apps/web/src/app/app.routes.ts", /builder-audit-rollback/, "Builder routes are missing from Angular router.");
expect("apps/web/src/app/features/builder/builder.component.ts", /mop-schema-renderer/, "Builder preview renderer is missing.");
expect("apps/web/src/app/features/builder/builder.component.ts", /dragstart/, "Drag reorder support is missing.");
expect("apps/web/src/app/features/builder/builder.component.ts", /Hidden Sections/, "Hidden section restore panel is missing.");
expect("apps/web/src/app/features/builder/builder.component.ts", /Undo/, "Undo support is missing from Builder editor.");
expect("apps/web/src/app/features/builder/builder.component.ts", /Discard Draft/, "Discard draft support is missing from Builder editor.");
expect("apps/web/src/app/shared/schema-renderer/schema-renderer.component.ts", /Preview Mode - actions are not saved/, "Read-only preview banner is missing.");

const routeCatalog = read("packages/shared/src/product-constants.ts");
const builderRouteCount = (routeCatalog.match(/builder-/g) || []).length;
if (builderRouteCount < 20) {
  failures.push(`Expected Builder route ids in catalog/default pages; found only ${builderRouteCount} occurrences.`);
}

if (failures.length) {
  console.error("V7 Builder validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("V7 Builder foundation validation passed.");
