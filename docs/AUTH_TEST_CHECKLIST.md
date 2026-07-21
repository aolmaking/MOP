# Auth Test Checklist

Status legend: `PASS` means covered by implementation plus the automated Auth Foundation Gate and TypeScript checks. Runtime PostgreSQL replay should also run in CI.

## Registration

- PASS - Customer can register with a valid workshop code.
- PASS - Registration creates only customer account/profile and tenant link.
- PASS - Missing or invalid workshop context blocks registration before writes.
- PASS - Public UI has no Owner, staff, platform, or role selection.
- PASS - Platform Super Admin creates workshop, invited Owner, role permissions, starter Builder config, and audit.
- PASS - Owner and staff invitation tokens are hashed, expire, activate the invited account, and create a normal authenticated session.
- PASS - Owner/Admin creates staff with role, template, status, and scopes.
- PASS - Inventory Manager without warehouse scope is rejected.
- PASS - Team Leader without team or managed-technician scope is rejected.

## Login And Landing

- PASS - Platform Super Admin lands on Platform Home.
- PASS - Tenant Owner/Admin lands on Builder/Owner area.
- PASS - Branch Manager lands on Branch Home.
- PASS - Technician lands on Technician Home.
- PASS - Inventory Manager lands on Inventory Home.
- PASS - Team Leader lands on Team Review.
- PASS - Customer lands on Customer Portal.
- PASS - Real login has no role switcher or public account picker.

## Tenant Isolation

- PASS - Apex and Delta fixtures use different tenant, branch, warehouse, staff, and customer IDs.
- PASS - Technician work-order filters require tenant plus assignment.
- PASS - Customer work-order, decision, invoice, and history filters require tenant plus customer ownership.
- PASS - Owner configuration requires the session tenant.
- PASS - Inventory queries require tenant plus assigned warehouse.
- PASS - Direct URL navigation is rejected by refreshed server navigation and APIs remain guarded.

## Platform Controls

- PASS - Freeze sets explicit frozen state, disables portal, revokes active tenant sessions, preserves data, and audits.
- PASS - Frozen Owner, staff, and customer sessions are rejected.
- PASS - Inventory disable removes Inventory and Parts permissions/pages.
- PASS - Builder publish lock remains server enforced.
- PASS - Report export controls remove effective export permissions.
- PASS - Owner cannot restore a platform-disabled module or permission.

## Owner Configuration

- PASS - Role permission changes persist to tenant role permissions.
- PASS - User permission differences persist as user overrides.
- PASS - Branch, warehouse, category, and team scopes persist to staff records.
- PASS - Effective permission sources include platform control, tenant configuration, role template, and user override.
- PASS - Platform-locked cells remain blocked.

## Customer Portal

- PASS - Customer sees only the current customer profile and linked assets.
- PASS - Customer-safe work-order/history projections exclude internal notes.
- PASS - Customer cannot access staff, inventory, reports, Builder, or platform routes.
- PASS - Customer finance route disappears when workshop invoice visibility is disabled.
- PASS - Customer never receives inventory cost or margin permissions.

## Workflow And Finance

- PASS - Technician writes require action-specific permissions.
- PASS - Disabled Parts module removes technician part permissions.
- PASS - Inventory issue remains warehouse scoped.
- PASS - Branch operations remain branch scoped.
- PASS - Team Leader records require managed-technician scope.
- PASS - Data Analyst permissions remain read-only.
- PASS - Expired or invalid customer decision links are rejected.
- PASS - Technician cannot record payment.
- PASS - Inventory Manager cannot issue final invoice.
- PASS - Branch Manager payment recording requires `finance.payment.record`.
- PASS - Final invoice immutability remains enforced.

## Platform Live View

- PASS - Live View remains a platform identity and never creates normal tenant staff session.
- PASS - Current tenant Builder page configuration is used for role previews.
- PASS - Preview metadata is read-only and control-block aware.
- PASS - Live View works for frozen tenants because platform identity is separate.
- PASS - Opening Live View creates a platform audit event.

## Automated Verification

Run:

```text
node tools/validate-auth-foundation.mjs
```

Final result: `PASS - Auth foundation is ready.`
