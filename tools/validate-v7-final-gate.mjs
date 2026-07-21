import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const failures = [];
const warnings = [];

function file(path) {
  const fullPath = join(root, path);
  if (!existsSync(fullPath)) {
    failures.push(`Missing file: ${path}`);
    return "";
  }
  return readFileSync(fullPath, "utf8");
}

function expect(path, pattern, label) {
  const text = file(path);
  if (!pattern.test(text)) failures.push(label);
}

function warnIfMissing(path, pattern, label) {
  const text = file(path);
  if (!pattern.test(text)) warnings.push(label);
}

const builderTypes = file("packages/shared/src/builder/types.ts");
const defaults = file("packages/shared/src/builder/defaults.ts");
const registry = file("packages/shared/src/builder/section-registry.ts");
const validation = file("packages/shared/src/builder/validation.ts");
const impact = file("packages/shared/src/builder/impact.ts");
const service = file("apps/api/src/modules/builder/builder.service.ts");
const controller = file("apps/api/src/modules/builder/builder.controller.ts");
const component = file("apps/web/src/app/features/builder/builder.component.ts");
const renderer = file("apps/web/src/app/shared/schema-renderer/schema-renderer.component.ts");
const permissions = file("packages/shared/src/permissions/role-permission-map.ts");
const routes = file("packages/shared/src/product-constants.ts");
const schema = file("packages/database/prisma/schema.prisma");

const checks = [
  [builderTypes, /BuilderConfiguration[\s\S]*pageTemplates[\s\S]*formSchemas[\s\S]*messageTemplates/, "Schema-driven Builder foundation is incomplete."],
  [registry, /ComponentRegistryItem[\s\S]*allowedPages[\s\S]*forbiddenRoles[\s\S]*requiredPermissions[\s\S]*customerSafe[\s\S]*defaultSettings/, "Section/block registry metadata is incomplete."],
  [component, /dragstart[\s\S]*dropSection[\s\S]*reorderActive/, "Drag/reorder sections is missing."],
  [component, /hideSection[\s\S]*restoreSection/, "Hide/restore section methods are missing."],
  [component, /Hidden Sections/, "Hidden Sections panel is missing."],
  [service, /draft[\s\S]*preview[\s\S]*publish[\s\S]*rollback/s, "Draft/preview/publish/rollback backend lifecycle is incomplete."],
  [component, /discardDraft[\s\S]*resetPage[\s\S]*resetSection/, "Discard/reset page/reset section UI support is missing."],
  [validation, /safety-critical and cannot be hidden|safety_hidden/, "Required safety sections cannot be proven locked."],
  [defaults, /Technician Ahmed[\s\S]*Customer Omar[\s\S]*Inventory Manager Mona[\s\S]*Branch Manager Khaled[\s\S]*Team Leader Youssef/, "Real role preview identities are incomplete."],
  [service, /scenarioFixtures[\s\S]*builderPreviewFixtures/, "Preview does not return fixture data."],
  [validation, /validateBuilderConfiguration/, "BuilderValidationService equivalent is missing."],
  [validation, /requiredVariables[\s\S]*must include/, "Message required-variable validation is missing."],
  [defaults, /customer_decision\.whatsapp[\s\S]*decision_link/, "WhatsApp decision template does not require decision_link."],
  [validation, /critical_warning[\s\S]*acknowledge|acknowledgement/, "Critical warning acknowledgement validation is missing."],
  [builderTypes, /fieldId: string[\s\S]*archived: boolean/, "Custom fields archive/restore schema is missing."],
  [component, /archiveField[\s\S]*restoreField/, "Custom field archive/restore UI is missing."],
  [impact, /buildBuilderImpactPreview[\s\S]*affectedPages[\s\S]*riskLevel/, "Impact preview is missing."],
  [permissions, /builder\.brand\.edit[\s\S]*builder\.pages\.edit[\s\S]*builder\.publish[\s\S]*builder\.audit\.view/, "Granular Builder permissions are missing."],
  [controller, /access\.assert\("builder\.publish"/, "Publish is not protected by builder.publish permission."],
  [validation, /raw HTML, JavaScript, SQL[\s\S]*external scripts[\s\S]*custom API calls/, "No raw code customization guard is missing."],
  [defaults, /defaultConfigPrecedence[\s\S]*platform_safety_rules[\s\S]*session_permissions_scopes[\s\S]*runtime_record_workflow_rules/, "Config precedence rules are missing."],
  [service, /builder\.published[\s\S]*audit/, "Publish audit event is missing."],
  [service, /builder\.rollback[\s\S]*audit/, "Rollback audit event is missing."],
  [service, /High-risk Builder changes require a publish reason/, "High-risk publish reason gate is missing."],
  [renderer, /Preview Mode - actions are not saved[\s\S]*disabled/, "Preview read-only banner/actions are missing."],
  [registry, /inventory_stock_alerts[\s\S]*forbiddenRoles: \["customer"/, "Customer Portal could receive internal inventory block."],
  [registry, /finish_gate_panel[\s\S]*removable: false[\s\S]*safetyCritical: true/, "Finish Gate is not locked as safety-critical."],
  [registry, /critical_warning_acknowledgement[\s\S]*removable: false[\s\S]*safetyCritical: true/, "Critical warning acknowledgement is not locked."],
  [schema, /isTenantOwner/, "Tenant Owner database foundation is missing."],
  [routes, /tenant_owner:[\s\S]*builder-home/, "Tenant Owner route foundation is missing."]
];

for (const [text, pattern, label] of checks) {
  if (!pattern.test(text)) failures.push(label);
}

const fixtureFiles = [
  "tools/fixtures/technician-work-card.fixture.ts",
  "tools/fixtures/customer-decision.fixture.ts",
  "tools/fixtures/inventory-lifecycle.fixture.ts",
  "tools/fixtures/branch-manager-attention.fixture.ts",
  "tools/fixtures/team-leader-review.fixture.ts"
];
for (const fixture of fixtureFiles) {
  if (!existsSync(join(root, fixture))) failures.push(`Missing preview fixture: ${fixture}`);
}

expect("packages/shared/src/builder/preview-fixtures.ts", /team-leader-review[\s\S]*Team Leader Youssef/, "Shared Team Leader preview fixture is missing.");
expect("apps/api/src/modules/builder/builder.controller.ts", /assertDraftEditPermissions[\s\S]*builder\.brand\.edit[\s\S]*builder\.pages\.edit[\s\S]*builder\.workflow\.edit/, "Draft edit permissions are not area-specific.");

warnIfMissing("docs/v7-hardening-addendum.md", /Final V7 Gate/, "V7 hardening doc does not explicitly name the final gate.");

if (failures.length) {
  console.error("FAIL - Do not start Version 8");
  for (const failure of failures) console.error(`- ${failure}`);
  if (warnings.length) {
    console.error("Warnings:");
    for (const warning of warnings) console.error(`- ${warning}`);
  }
  process.exit(1);
}

if (warnings.length) {
  console.log("PASS WITH MINOR FIXES - Fix listed P1 issues later");
  for (const warning of warnings) console.log(`- ${warning}`);
  process.exit(0);
}

console.log("PASS - Ready for Version 8");
