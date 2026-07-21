# Auth Audit Report

## Final Result

`PASS - Auth foundation is ready.`

## What Existed

- Separate Prisma account types for platform, tenant staff, and customers.
- Password verification with scrypt and constant-time hash comparison.
- Opaque server sessions with expiry and revocation.
- Session guard on operational API controllers.
- Role permissions, role pages, branch scopes, warehouse scopes, and category scopes.
- Customer-owned work-order and decision filtering.
- Workshop freeze logic that preserved data and revoked sessions.

## P0 Gaps Found

- The public login screen exposed seeded account identities and simulated account-type selection.
- Public customer registration did not exist.
- Staff creation did not exist.
- Team Leader scope was not represented in the data model.
- Platform controls hid some UI but did not consistently subtract effective permissions from sessions.
- Tenant role permissions did not correctly model tenant overrides over platform defaults.
- Owner-created workshops used a shared demo password and did not persist a real starter Builder configuration.
- Sessions lacked enabled modules, features, permission sources, builder version, tenant status, and linked customer assets.
- Team Leader data queries could fall back to broad branch visibility.
- Read-only tenant state did not consistently block mutations.

## P0 Fixes Applied

- Public registration is customer-only and requires a valid workshop code or workshop slug.
- Customer registration atomically creates only a customer account and profile inside the resolved tenant.
- Owner accounts are created only by Platform Super Admin and begin as invited accounts.
- New workshops receive role templates, permissions, pages, starter Builder configuration, and audit records.
- Staff accounts are created only by Tenant Owner or Tenant Admin through Organization & Access.
- Staff creation validates role-specific branch, warehouse, category, team, technician, and template scopes.
- Added system automation identity, locked account state, explicit tenant lifecycle states, team scope, managed technician scope, and user overrides.
- Added an effective access resolver for platform controls, tenant configuration, role templates, user overrides, modules, features, and Builder version.
- Active sessions are re-evaluated on every API request and every guarded route navigation.
- Frozen, suspended, and archived tenants reject Owner, staff, and customer sessions.
- Read-only tenant sessions can read but cannot perform mutation permissions.
- Team Leader queries are restricted to managed technicians.
- Finance visibility and actions remain permission and platform controlled.
- Platform Live View remains a platform session, is read-only, audited, and reads current tenant Builder page configuration.
- Added Apex and Delta tenant fixtures for isolation testing.

## Remaining P1/P2 Work

- Connect the implemented secure invitation link and password-setup flow to the selected email/SMS delivery provider.
- Add refresh-token rotation, device/session management UI, password reset, MFA, and enterprise SSO.
- Add distributed login throttling and lockout backed by Redis or an equivalent shared store.
- Add a dedicated support-access approval workflow around Platform Live View.
- Execute the runtime integration suite against a provisioned PostgreSQL test database in CI.

These are production hardening items, not unresolved P0 authorization bypasses in the current foundation.
