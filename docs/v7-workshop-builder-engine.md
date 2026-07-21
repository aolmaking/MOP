# Version 7.1 - Workshop Builder Engine Foundation

Version 7 reframes Tenant Admin from a settings screen into the product's customization engine.

The Builder is Shopify-inspired, but operationally safe. Tenants can customize brand tokens, page templates, section order, optional visibility, role experiences, workflow policies, form fields, and message templates. They cannot break authentication, tenant isolation, permission checks, stock lifecycle correctness, customer privacy, critical warning acknowledgement, or finish gate safety.

## Foundation Added

- Shared Builder contracts in `packages/shared/src/builder`.
- Default tenant-safe Builder configuration.
- Section/component registry with allowed pages, allowed roles, permissions, feature dependencies, customer visibility, and safety-critical metadata.
- Validation engine for required sections, safety-critical visibility, dependency checks, customer-safe pages, Quick Service service-type limits, workflow locks, and message variables.
- Nest Builder module with draft, preview, validate, publish, rollback, and history endpoints.
- Angular Builder API facade.
- Angular schema renderer for role-safe page preview.
- Tenant Admin Builder shell with ten Builder pages:
  - Builder Home
  - Brand & Theme
  - Page Builder
  - Role Experience Studio
  - Workflow & Feature Studio
  - Forms & Fields
  - Messages & Templates
  - Organization & Access
  - Publish Center
  - Audit & Rollback
- Tenant Admin route catalog and role pages updated.
- Builder permissions added to shared role map and seed data.
- Prisma-ready Builder models added for future migration.
- V7.2 hardening adds editor panels, drag/reorder, hidden section restore, undo/redo, discard draft, presets, impact/risk preview, high-risk publish reason guards, role/device preview, form archival, message versioning, and Tenant Owner separation.

## Safety Rules

The Builder supports customization only through schema and policies.

Tenants can customize:

- Colors and design tokens.
- Logos and theme modes.
- Labels and section titles.
- Optional section visibility.
- Section order.
- Role modes and landing pages.
- Feature and workflow policies.
- Custom form fields.
- Message templates with controlled variables.

Tenants cannot customize:

- Raw JavaScript.
- Raw database queries.
- Authentication behavior.
- Tenant isolation.
- Permission bypasses.
- Audit log behavior.
- Required operational identifiers.
- Stock lifecycle correctness.
- Critical warning acknowledgement.
- Required finish gate checks.
- Old-owner privacy protections.

## Draft, Preview, Publish, Rollback

The first implementation stores Builder configuration through `ControlSetting` keys:

- `builder.configuration`
- `builder.publish.history`

This lets V7.1 work without depending on a regenerated Prisma Client. The schema also includes future models:

- `TenantBuilderConfiguration`
- `TenantBuilderVersion`
- `TenantBuilderAuditEvent`

Publish flow:

1. Tenant Admin edits draft.
2. Tenant Admin previews as role/page.
3. Validation runs.
4. Publish is blocked if errors exist.
5. Publish creates audit evidence and a snapshot.
6. Rollback restores a published snapshot.

## Next Versions

- V7.2: Brand & Theme editor depth, live theme provider across all role pages.
- V7.3: Page Builder MVP with addable allowed blocks and richer drag/reorder UX.
- V7.4: Role Experience Studio connected to navigation generation.
- V7.5: Workflow & Feature Studio connected to finish gate, quick service, decisions, inventory, and Team Leader policies.
- V7.6: Forms & Fields runtime integration for intake, inspection, part request, and customer decision forms.
- V7.7: Messages & Templates runtime integration with WhatsApp/customer portal messages.
- V7.8: Publish Center impact analysis, rollback diff, and full audit viewer.
