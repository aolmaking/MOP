# Auth Architecture Notes

## Account Types

- `PLATFORM`: MOP platform operators. Never tenant-bound.
- `TENANT_STAFF`: Owner, Admin, Branch Manager, Technician, Inventory Manager, Team Leader, and Analyst.
- `CUSTOMER`: Customer portal identity bound to one workshop and one customer profile.
- `SYSTEM_AUTOMATION`: Non-interactive identity with no login UI.

## Registration

- Public: customer only through `POST /auth/register/customer`.
- Customer registration requires `customerRegistrationCode` or workshop slug.
- Owner: Platform Super Admin through Add Workshop Owner.
- Staff: Tenant Owner/Admin through `POST /identity/staff-users`.
- Platform and system identities have no public registration route.

## Login And Session

The login flow validates credentials, account type/status, staff/customer profile status, tenant state, portal state, and platform controls. The session is resolved into:

- tenant and role identity
- branch, warehouse, category, team, and managed-technician scopes
- permission template and user overrides
- effective permissions and their sources
- enabled modules and features
- Builder configuration version
- tenant lifecycle and read-only state
- customer-owned asset IDs and portal status
- backend-selected landing page

Every bearer-token request rebuilds effective context. Existing sessions therefore observe freeze, permission, module, and Builder policy changes without trusting stale browser state.

## Effective Authorization Order

1. Platform control and tenant lifecycle.
2. Tenant entitlement/module state.
3. Builder feature policy.
4. Tenant role configuration.
5. Permission template.
6. User override.
7. Branch/warehouse/category/team scope.
8. Workflow and record rules inside domain services.

Platform-disabled capabilities are removed from effective permissions and pages. Lower levels cannot restore them.

## Guard Strategy

- Route: Angular guard refreshes `/auth/me`, then validates server-provided navigation.
- API: Nest `SessionGuard` validates and rebuilds session context.
- Action: controllers and services call `AccessService.assert`.
- Read-only: mutation permissions are rejected centrally.
- Data: `AccessService` builds tenant, branch, warehouse, assignment, customer-own, and managed-team query filters.
- Sensitive changes: login denials, registration, staff creation, owner creation, freeze, controls, permissions, and live view are audited.

UI hiding is only presentation. Server guards remain authoritative.

## Platform Live View

Live View does not impersonate tenant staff and does not create a tenant session. It stays under the platform identity, reads the tenant's current Builder pages and fixtures, exposes read-only role previews, and logs the session.
