# Gap Analysis: Canonical Spec vs. Current Implementation

> **Source spec:** [`docs/PRODUCT_SPEC_CANONICAL.md`](./PRODUCT_SPEC_CANONICAL.md) (pasted by the product owner, 2026-08-07; truncated at Acceptance Test step 18 — extend this analysis once the rest arrives).
> **Method:** Four parallel research passes over the live codebase (`apps/api`, `apps/web`, `packages/database`, `packages/shared`), each checking a bounded slice of the spec section-by-section and citing file:line evidence for every claim. No code was modified to produce this report.
> **Status legend:** `IMPLEMENTED` = matches spec functionally · `PARTIAL` = exists but incomplete/simplified · `MISSING` = no evidence it exists · `DIVERGES` = exists but behaves differently than specified (sometimes in a *worse* direction than "missing" — see Team Leader below).
> **Caveat on the rest of the `docs/` folder:** this document is the first attempt to check the platform's own `*_AUDIT_REPORT.md`/`*_GATE_REPORT.md` claims against a real target spec and real code, rather than against the build process's own intent. Several things those earlier reports marked "Fixed"/"PASS" are re-examined here against the canonical spec and found to be incomplete in ways the earlier self-audits didn't surface (most notably the Builder/runtime disconnect below).

---

## Executive Summary — Cross-Cutting Core Problems

These are the findings that recur across multiple roles/pages and explain a large share of the individual gaps below. Ordered roughly by how much of the product they undermine.

1. **The Owner Builder/Configuration system is largely a write-only editor disconnected from runtime.** Theme tokens, Role Experience Studio, and — most consequentially — Workflow & Feature Studio all validate, version, and "publish" successfully, but never reach the code paths that actually run the app. The clearest case: the Builder UI persists to a `ControlSetting` row keyed `"builder.configuration"`, while `EffectiveAccessResolverService` — the thing that actually gates every request — reads tenant feature flags from a *separate* `TenantBuilderConfiguration` table that is written exactly once, at tenant provisioning, and never updated again anywhere in the codebase. An Owner can go through the full Draft → Validate → Preview → Impact Preview → Publish flow, get a success response, and nothing downstream will ever reflect the change. The session sent to the browser (`SessionContextDto`) also has no theme/branding field at all, so even a correctly-wired backend couldn't repaint the UI today. The one major exception that *does* work end-to-end is the Permission Matrix (`RolePermission` table) — Platform-over-Owner permission locking is genuinely enforced.

2. **Team Leader is inverted relative to spec.** The one capability the spec explicitly places on this role's forbidden list — "pass/reject maintenance in this version" — is fully built, permission-backed, and is in fact the *only* bespoke page this role has (`team-review.component.ts` + `POST /team-leader/review/:taskId/action`, implementing `approve_qc`/`return_rework`). Meanwhile all 4 pages the spec actually requires (Team Leader Home, Technicians View, Vehicles/WO View with lifecycle drawer, Performance Reports) are missing or fall back to a generic shared component — which also leaks real financial totals to this role, contradicting the spec's explicit "no finance" rule (the redaction check only tests for `accountType === "customer"`, not `team_leader`).

3. **Several safety/privacy-relevant permission gates are hardcoded rather than config-driven.** Technician price visibility (`hasPricingPermission()`) always returns `true` regardless of tenant settings, and the fallback copy doesn't match spec anyway (`'Price hidden'` vs. required `"Price hidden by workshop settings."`). These read as real permission checks in the UI but don't actually gate anything.

4. **Work Order lifecycle is missing 6 of the spec's 16 statuses** (Registered, Approved for Work, Waiting Customer, Blocked, Ready for Team Review, QC Failed all absent from the `WorkOrderStatus` enum) and has **no reopen/relink-to-new-Work-Order logic at all** — nothing in the codebase implements the spec's explicit rule that a recurring issue after closure must become a new linked Work Order rather than silently reopening the old one. Relatedly, `DELIVERED` is a defined terminal status that no code path ever actually sets — every write path stops one step earlier, at `READY_FOR_DELIVERY`.

5. **Platform Super Admin's two flagship oversight tools are thinner than they present.** Workshop Live View renders a schematic "simulated" card grid of page names, not the tenant's actual branded pages/components with live or demo data — there's no read-only rendering of the real tenant UI. The Control Center's ~50 individually-named controls (module states, feature toggles, role states, builder states, emergency actions) collapse into one generic free-text control-key input plus a shared 7-option type dropdown — workable for an admin who already knows the right string, but not the discoverable, safe checklist the spec describes. Only 2 of ~9 Emergency actions (owner login, customer portal) actually force a session revocation server-side; the rest only write a settings row without enforcing anything.

6. **The permission and report catalogs are broad but substantially orphaned.** `packages/shared/src/permissions/role-permission-map.ts` and `packages/shared/src/reports.ts` define a rich, spec-mirroring set of granular permissions and report types, but a large fraction are never asserted by any controller — Team Setup permissions, `customer.asset.view_own`, `customer.history.view_safe`, and nearly all of the `reports.team.*`/`reports.inventory.stock_health.*` catalog exist only as declarations. In practice, reporting is one generic `GET /reports/overview` endpoint reused by nearly every role rather than the role-differentiated report set the spec describes, and Team Leader has no report endpoint at all.

7. **The spec's 11-layer Effective Permission Resolver doesn't exist as one component.** There's a decorative, unused hierarchy array (`platformControlHierarchy` in `packages/shared/src/platform-control-resolver.ts`) that is never iterated, and a separate, structurally different resolver (`EffectiveAccessResolverService`) that actually gates every request. The real one works and correctly enforces Platform-over-Owner precedence and tenant-status freezing, but Tenant Entitlement/Plan and Workflow Status aren't represented as distinct, inspectable layers in it — they're either unused (plan) or reimplemented ad hoc per module (workflow status).

8. **System Automation has no autonomous component.** There is no scheduler/queue/cron dependency anywhere in `apps/api` (`package.json` has no `@nestjs/schedule`/`bullmq`/`node-cron`, no `@Cron` decorator anywhere). Every "system-generated" reminder/alert described in the spec is actually either computed synchronously inside a human-triggered `GET` request, or an explicit staff button click. `SYSTEM_AUTOMATION` is a real, defined account type that is never instantiated anywhere, including the seed data.

9. **One real Operations Engine coverage gap with outsized consequence.** The centralized event system (`OperationEventsService`) is genuinely well-built and used by most domain services — but customer creation, portal invites, and (notably) **asset ownership transfer**, a privacy-sensitive operation the spec calls out by name, bypass it entirely, writing a bare audit row with no before/after, no timeline entry, and no customer-safe projection. This is exactly the "each module updates its own tables independently" failure mode the spec's operations-engine rule exists to prevent — it's real, just localized to one module (`customers.service.ts`) rather than pervasive.

10. **Audit is thinner in practice than the model allows.** `riskLevel` has no dedicated schema column — it's only present ad hoc, inside a JSON blob, for 2 of the many audited action categories (platform-control changes, builder publishes). The one component actually named for centralized audit writing (`AuditEventService`) is unused dead code, while 10 different service files hand-roll their own inconsistent audit-writing helpers. The audit *read* path throws away `before`/`after`/`riskLevel` before they ever reach the Owner-facing UI, even on the rows where they were captured.
11. **Customer Portal is missing 2 of its 6 spec pages** (My Assets, Safe Technical History) despite the backing data model (`SafeTechnicalHistory`) existing and being seeded — the permissions that would gate these pages are declared but never asserted by any controller, and the model has zero application-code reads.

### Acceptance Test verdict (steps 1–17; step 18 onward wasn't in the source spec)

Every step from 1 through 17 is **plausible against real, non-stub code** — Super Admin → Owner creation, Owner → staff creation with scope validation, Branch Manager intake/Work Order/assignment, Technician home/work-card/inspection/fault, customer decision request/response, part request/issue/arrival/use are all backed by genuine transactional service methods, not mocks. The one soft spot: **step 11** (technician adds a service/part/labor line via Work Order POS) requires `finance.invoice.view`, which is **not** in Technician's default role-permission template — it only works if the Owner has explicitly extended Technician's permissions first. That's arguably consistent with the spec's own "if allowed" phrasing, but it means the flow doesn't work turnkey on a freshly-provisioned tenant.

---

## What's Genuinely Solid

For balance — these held up well under direct code inspection, not just "documented as done":

- **Multi-tenant isolation is real and centralized**, not frontend-only. `AccessService` (`apps/api/src/access/access.service.ts`) is the single source of tenant-scoped Prisma where-clauses reused across work orders, customers, inventory, and decision requests; spot-checks of inventory and finance services confirmed `tenantId` is consistently applied, not just available on the schema.
- **Four distinct account types genuinely exist** in both the Prisma schema and the auth service (`AccountType.PLATFORM/TENANT_STAFF/CUSTOMER/SYSTEM_AUTOMATION`), each with its own login-time validation rules — not just a conceptual distinction.
- **Financial immutability rules are enforced in the service layer with real transactional protection**, not just schema fields or UI copy: locked invoices provably can't be mutated (`ConflictException` if a locked invoice already exists), the delivery payment gate blocks the actual status-transition function (not just a UI warning), and catalog price changes are provably future-only (new `PriceCatalogEntry` rows, existing approved/locked lines never touched).
- **Customer-safe projection is a real, dedicated translation layer** with defense-in-depth: a canned-message map per event type plus a regex blocklist (`supplier`, `stock quantity`, `margin`, `cost price`, etc.) that sanitizes even freely-supplied text before it can reach a customer.
- **The core inventory invariant — stock only increases after Inventory Manager explicitly accepts a return — is genuinely enforced** at the one place stock balances are actually written in code, not just documented as policy.
- **Technician Finish Gate is server-computed with specific, distinct blocking-reason strings** ("Cannot finish: Parts received but not marked as Used or Returned," etc.), deep-linking to the offending panel — a real gate, not a client-side guess. (Two of its eight checklist items are hardcoded-true stubs, noted below.)
- **Page Builder's safety-critical section protection is enforced at three separate layers** (UI disablement, client-side guard, and server-side publish validation) for Finish Gate and Critical Warning Acknowledgement specifically — genuinely hard to bypass through the builder. (Caveat: Payment Gate itself isn't in the protected block registry at all — see Owner section.)
- **Customer decision response handling is atomic and fully server-validated** — the client can only send `{itemId, decision, warningAcknowledged, note}`; price/quantity/identity are server-stored and can't be tampered with, and critical rejections require acknowledgment before being accepted, guarded by an atomic status-claim update.
- **Branch Manager's exclusion from technician-only actions is enforced at the permission/guard layer**, not just hidden UI — confirmed by checking Branch Manager's actual permission list and the technician/inventory endpoints it would need to bypass it.
- **The Operations Engine pattern itself is real and well-designed** — event emission fanning out to workflow status, notification routing, customer-safe projection, audit, and timeline updates in one place (`OperationEventsService`) — and is used by most domain services. The gaps in it (below) are coverage gaps in specific modules, not an absence of the underlying architecture.

---

## 1. Tenancy, Auth, Session, Permission Resolver, Operating Categories, Work Order Lifecycle, Platform Super Admin

### Multi-Tenant Rule
**Status: IMPLEMENTED** (query-layer enforcement, not just frontend)

- All top-level tenant-owned models carry `tenantId` and relate back to `Tenant` (`packages/database/prisma/schema.prisma:307-357` lists 30+ back-relations: branches, accounts, staffUsers, customers, assets, workOrders, tasks, inventoryItems, invoices, payments, auditLogs, controlSettings, builder* models, etc.). Child/line-item records (InvoiceLine, QuotationItem, TaskAssignment, AssetOwnershipHistory) omit `tenantId` and rely on parent-record scoping — a normal pattern, not a violation.
- Tenant scoping is centralized: `AccessService.workOrderWhere/customerWhere/inventoryWhere/decisionRequestWhere` (`apps/api/src/access/access.service.ts:41-118`) all inject `tenantId: session.tenantId` (or deny-all if absent) and are reused across modules rather than each service hand-rolling filters.
- Spot-checked `inventory.service.ts` (42 Prisma calls, 36 explicit `tenantId` references) and `finance.service.ts` (Invoice/Payment/Quotation lookups consistently scoped).
- Minor gap: some `workOrder.update({ where: { id } })` calls (branch-manager.service.ts:485,515,597,674; technician.service.ts; team-leader.service.ts:80,92) key only by `id`, relying on an earlier tenant-scoped fetch rather than re-asserting `tenantId` in the same call — functionally safe today but not defense-in-depth. One true miss: `inventory.service.ts:878` resolves staff names via `staffUser.findMany({ where: { id: { in: ids } } })` with no `tenantId` filter.

### Login and Auth Model
**Status: PARTIAL**

- 4 account types are real: `AccountType` enum = `PLATFORM | TENANT_STAFF | CUSTOMER | SYSTEM_AUTOMATION` (schema.prisma:20-25), backed by `Account`/`StaffUser`/`Customer`/`Session` models. `AuthService.assertAccountAndTenantAccess` (`apps/api/src/auth/auth.service.ts:348-372`) enforces distinct rules per type.
- `SYSTEM_AUTOMATION` is schema-only: referenced solely as a login-blocker and label mapper — no code path or seed data ever creates or drives an account of this type.
- Owner/staff creation correctly gated: `PlatformService.addWorkshopOwner` (`platform.service.ts:65-212`) is the only owner-creation path (invite-only); staff creation is tenant-scoped and restricted to the spec's 7 tenant-staff roles.
- Customer registration resolves workshop context via **one mechanism only**: a `workshopCode` field matched against `Tenant.customerRegistrationCode` OR `Tenant.slug` (auth.service.ts:56-73), prefilled from a `?workshop=`/`?code=` query param. There is **no distinct invite-link token flow for customers** (unlike staff, which has `inviteTokenHash`) and **no branch-QR-specific resolution path** — `branchId` is just an optional field validated against the already-resolved tenant, not an independent context-resolution mechanism.
- No manual role switcher anywhere in `apps/web`; `AuthStore.acceptSession` navigates strictly to the server-computed `session.landingPage`.

### Session Context
**Status: IMPLEMENTED**, with one notable absence

- `AuthService.buildContext` (`auth.service.ts:242-284`) is the single place that assembles the full session context — accountType, tenantId, roleId, branch/warehouse/category/team scope, managedTechnicianIds, permissions, enabledModules, enabledFeatures, tenantStatus, readOnly, landingPage — matching nearly the entire spec list.
- Landing-page redirect is server-computed and role-specific (though naming diverges from spec: tenant_owner/tenant_admin → `"builder-home"` rather than a page literally called "Owner Home" — see Owner Home finding below, which is a functional gap, not just naming).
- **Gap**: "platform controls" and "builder/theme configuration" are pointers only, not payloads — session carries `builderConfigVersion?: string` but no actual design tokens/role-experience config, and grepping the frontend found **zero** references to `builderConfigVersion` anywhere outside the Builder module itself. "Role experience configuration" as a session field does not exist at all.

### Effective Permission Resolver
**Status: DIVERGES** — the single most architecturally significant finding in this section

- Two parallel, unreconciled implementations exist instead of one centralized resolver:
  1. `resolveEffectivePlatformControls` (`packages/shared/src/platform-control-resolver.ts:26-83`) declares a nicely-named `platformControlHierarchy` constant with 10 stages loosely mirroring the spec's 11 layers — **but this array is never iterated.** The function is just 3 sequential if-checks. It's called only from the admin-facing `GET /platform/control/effective` preview endpoint — it does **not** gate any real tenant staff/customer request.
  2. The actual enforcement path used on every guarded route is `EffectiveAccessResolverService.resolve()` (`apps/api/src/auth/effective-access-resolver.service.ts:68-201`), a separately hand-written function: role-template permission → tenant-specific override → user override → filtered by disabled modules/keys derived from `ControlSetting` rows → tenant-status short-circuit. `AccessService.assert` is what every controller actually calls.
- The 11 named layers are not separately inspectable stages anywhere: Tenant Entitlement/Plan is not part of either resolver's permission computation (plan is stored as a JSON blob and never read by the real resolver); Workflow Status and Record-Level Rule are not general layers — they're reimplemented piecemeal per module.
- One real, well-built exception: **Platform-over-Owner precedence for the permission matrix IS genuinely enforced end-to-end.** `builder.service.ts`'s `permissionCell`/`lockReasonForPermission` (lines 690-731) marks platform-locked cells `locked:true, effectiveValue:false`, and `applyConfigurationPermissions` throws if the owner's draft tries to enable a locked permission, additionally skipping any locked cell write even if the check were bypassed.
- Tenant-status blocking ("if tenant is frozen, no staff/customer action is allowed") is solid: enforced both at login and per-request, wiping all permissions to `[]` and `readOnly:true` for frozen/suspended/archived tenants.

### Operating Categories
**Status: IMPLEMENTED**

- `CategoryCode` enum = `CARS | MOTORCYCLES | HEAVY_EQUIPMENT` matches spec exactly. Category is resolved server-side from `StaffUser.categoryScope` or `Asset.category`, never chosen pre-login — no public category picker exists in `apps/web`.

### Core Work Order Lifecycle
**Status: DIVERGES**

- One-Work-Order-per-asset is correctly modeled (`WorkOrder.assetId` is a single scalar FK, not an array/join table).
- **No reopen/relink logic exists at all.** The spec's explicit rule ("if the same issue returns after closure, create a new linked Work Order; do not reopen old closed Work Orders silently") has no corresponding code anywhere.
- `WorkOrderStatus` enum confirmed as 10 values: `DRAFT, INSPECTION, AWAITING_CUSTOMER_APPROVAL, IN_PROGRESS, WAITING_FOR_PARTS, READY_FOR_QC, PAYMENT_PENDING, READY_FOR_DELIVERY, DELIVERED, CANCELLED` — versus the spec's 16-value list:
  - Present/equivalent (8): Draft, Under Inspection, Awaiting Customer Approval, In Progress, Waiting Parts, Ready for QC, Payment Pending, Cancelled.
  - Renamed terminal state: spec's "Closed" is actually `DELIVERED` in code — a different concept/wording, not just casing.
  - **Missing entirely**: Registered, Approved for Work, Waiting Customer, Blocked (at WO level — it exists only on `TaskStatus`), Ready for Team Review, QC Failed.
  - Evidence of workarounds rather than real states: "Registered" is faked via a free-text `statusLabel` while the real `status` enum jumps straight to `INSPECTION`; QC rework reverts a task to `IN_PROGRESS` rather than a distinct `QC_FAILED` state; "team review" is only an audit-log action string, never a stored status.
  - Separately (from the Financial System check, section 4 below): `DELIVERED` itself is never actually set by any code path — every write path stops at `READY_FOR_DELIVERY`.

### PAGE: Workshops
**Status: PARTIAL**

- Implemented content: name, owner name/email/phone, status (7-value enum matches spec exactly), plan, branch count, user count, active users, builder status, health status, usage score. Actions Open Details/Reports/Live View/Control Center/Freeze/Reactivate all present and wired.
- **Missing field**: "Active Work Orders count" is absent from both the DTO and the card UI.
- Freeze/Reactivate genuinely require reason + confirmation server-side (throws if `!body.confirmed || !body.reason`) and write an audit event with before/after.
- Details drawer shows owner info, plan/subscription, branches/usage, system status — but omits several spec-listed fields: enabled modules list, recent activity feed, recent platform controls, itemized health warnings (only a single badge, not a warnings list).

### PAGE: Add Workshop Owner
**Status: IMPLEMENTED** (with one field gap)

- Form fields match spec closely: Workshop/Company Name, Owner Full Name/Email/Phone, Country, City, Business Type, Initial Operating Category, Initial Plan/Package, Allowed Branches, Allowed Staff Users, Starter Builder Template, Enable Demo Data, Initial Status. **"Allowed Warehouses" field is absent.**
- Atomicity is real: `addWorkshopOwner` wraps tenant + owner account + permission templates for all 7 roles + rolePages + rolePermissions + staffUser + control settings + builder configuration/versions + audit log in a single `prisma.$transaction` — satisfying "do not allow partial creation."
- "Enable allowed modules/features" per plan tier is not distinctly implemented — plan is stored but doesn't drive differential module/feature enablement anywhere in the resolver.

### PAGE: Platform Reports
**Status: IMPLEMENTED**

- All 6 spec subsections (Usage Overview, Feature Usage, Builder Adoption, Operational Activity, Commercial Snapshot, Health & Risk) are present with matching labels, populated from real Prisma-derived counts rather than placeholders. No customer PII appears in the report DTOs. Commercial-snapshot revenue/plan-price figures are heuristic rather than tied to a real billing system, matching spec's own "placeholder" language for MRR/overdue.

### PAGE: Workshop Live View
**Status: PARTIAL/DIVERGES**

- Read-only banner exists with close-to-spec text ("Platform Live View — Read-only Mode... Mutations Disabled" badge). Disabled-action messaging exists and matches spec intent.
- Session logging is real but **incomplete**: `PlatformLiveViewSessionDto` has **no `endedAt`/end-time field at all**, so "log start time, end time" is only half-implemented; no session-close event exists anywhere.
- Role coverage gap: spec lists 7 Live View role views including Data Analyst; the actual enumeration only has 6 — Data Analyst is missing.
- **Most significant divergence**: Live View does **not** render "the current actual pages with that workshop's design/configuration." Clicking a role shows a card grid of page-name buttons that on click only pop a disabled-action toast — explicitly labeled in the code as a "simulated read-only interface." It is a schematic summary, not the real tenant UI rendered with that tenant's actual builder theme and live/demo data. There's no dedicated "real tenant data, read-only" endpoint — Platform sessions have no `tenantId`, and the standard tenant-scoped resolvers all key off `session.tenantId`/`session.roleId`, which are undefined for platform sessions, so Live View structurally can't just reuse the normal tenant CRUD endpoints.

### PAGE: Super Admin Control Center
**Status: PARTIAL** — flow is real, granular control catalog is not individually modeled

- The Select Target → Choose Control → Impact Preview → Confirm with Reason → Apply → Audit → Rollback flow is genuinely implemented end-to-end, including a real impact computation backed by actual `prisma.account.count`/`prisma.workOrder.count` queries (not fake numbers), a reason+confirmation requirement for high/medium risk, an audit-log write, and a working rollback that flips a `ControlSetting` to inactive.
- Left-nav domains present (10 of spec's 12): Tenant Status, Module Control, Feature Control, Role Control, Builder Control, Access & Accounts, Limits & Entitlements, Emergency Control, Reports Control, Finance Control. **Missing dedicated "Overview" and "Audit & Rollback" nav entries** (rollback is available inline at the bottom of every domain instead).
- **The ~50+ individually named controls in the spec are not modeled as discrete UI elements.** Instead there is one generic free-text "Control Key" input + one shared 7-option "Control Type" dropdown (Enabled/Hard Disable/Soft Disable/Read Only/Hidden/Locked/Frozen) reused identically across every domain, plus only 6 "Quick High-Impact Presets" buttons. None of the spec's domain-specific vocabularies (Role states like "Login Locked"/"Actions Limited"; Builder states like "View Only"/"Draft Only"/"Brand Only") exist as selectable options. The backend's pattern-matching recognizes many of these concepts by substring, so a power-user admin who knows the right key string could apply most of them, but there is no discoverable checklist/matrix UI.
- Top summary bar is thinner than spec: only a target/workshop selector dropdown; no persistent "selected workshop status / current plan / current risk / last control change" strip.
- Real enforcement beyond generic `ControlSetting` writes is limited to two hardcoded cases: revoking owner sessions on `access.owner_login=false`, and revoking customer sessions on `feature.customer_portal=false`. Other Emergency actions (Force Logout All Users, Suspend Staff, Disable Decision Links, Disable External Access) have no corresponding session-revocation code — applying them only writes a settings row.
- Limits & Entitlements enforcement is inconsistent: **Max Users is genuinely enforced** (throws when staff count reaches the cap). **Max Branches is not enforced** (only shown as a UI warning, no code path checks it on branch creation). Max Warehouses / Allowed Categories / Allowed Reports / Allowed Builder Features / Allowed Exports / Allowed Finance Features have no dedicated enforcement found.
- Super Admin's cannot-silently-do list (complete tasks, mark parts used, issue stock, approve decisions, record payments, edit invoices, delete operational records) is respected by omission — no platform-role code path touches those write endpoints, enforced implicitly via the `platform_super_admin` permission list containing only `platform.*`/`control.*` permissions.

---

## 2. Tenant Owner / Tenant Admin Role & Builder/Tenant Customization

### PAGE: Owner Home
**Status: DIVERGES**

- A fully spec-matching Owner Home exists — a 13-item hub grid mirroring the spec's exact 13-page list, plus metric cards — but it is **unreachable in normal use**: its route id is absent from `tenant_owner`'s allowed page list, so the standard navigation resolver marks it `allowed:false` and the route guard would redirect to `/access-denied`.
- The Owner's actual default landing page is hardcoded to `"builder-home"`, which renders a sparse 3-tile stub (Pages/Roles/Users counts only).
- The unreachable dashboard's own metrics are hardcoded fallback numbers fetched from `GET /reports/dashboard-summary` — an endpoint that **does not exist anywhere in the API.** The catch block silently swallows the 404 and keeps demo values forever, so even direct navigation wouldn't show real data.
- A real, live-data workflow-health engine does exist elsewhere in the codebase (querying issued items/returns/decisions/tasks), but it's a separate route, not surfaced as an Owner Home card.

### PAGE: Organization & Access
**Status: PARTIAL**

- Scope validation is real and server-enforced at creation time: branch scope for branch_manager/technician/inventory_manager/team_leader, warehouse scope for inventory_manager, category scope for technician/inventory_manager, team/managed-technician scope for team_leader — matching the spec's four rules precisely, at the `createStaffUser` call site.
- No update/activate/deactivate/lock endpoints exist for staff users at all — only create+list. The "activate/deactivate users, lock users" bullet has no implementation.
- No branch/warehouse/team creation exists anywhere in the API, and there is no `Team` Prisma model — `teamScope` is a free-text string array, not a manageable entity.
- **The scope-validation rule is bypassed on a second write path**: the Configuration & Permissions flow directly updates branchScope/warehouseScope/categoryScope/teamScope with no call to the validation function used at creation time — so Owner-driven scope edits via that page can produce, e.g., an Inventory Manager with zero warehouses, which staff creation itself would have rejected.

### PAGE: Configuration & Permissions
**Status: PARTIAL**

- Tabs and structure match spec exactly (role-templates / user-permissions / permission-matrix / scope-rules / locked-platform / change-history).
- Cell-state model matches spec's states in the type definition (allowed/denied/inherited/locked_by_platform/locked_by_plan/not_available, plus an extra `requires_higher_role`), but the resolver only ever emits 4 of these — `not_available` and `requires_higher_role` are declared but never assigned anywhere.
- Worked example 1 from the spec (disable `customer_decision.send` for Technician) is real, server-asserted at the controller and both branch-manager call sites.
- Worked example 3 (price hiding) is **faked on the client**: the technician work-card's `hasPricingPermission()` is hardcoded to always return `true` (comment: "Return true for sandbox demo"), ignoring the real config flag entirely, and the shown fallback string doesn't match the spec's required copy either. Server-side, the pricing catalog endpoint never checks the visibility flag and always returns the base price — the only actual enforcement forbids the technician action outright rather than hiding the price as spec describes, a materially different behavior.

### PAGE: Workshop Builder (theme)
**Status: DIVERGES**

- All named design tokens exist structurally (primaryColor, radius, density, logoUrl; status colors are 3 separate fields rather than one map), edited and validated in the Builder UI.
- **Cross-role application does not happen.** The only consumer of the design tokens anywhere in the frontend is the Builder's own preview mock — used solely inside the Builder page itself. The real app shell that wraps every role's pages is 100% hardcoded, with zero theme binding.
- The session contract carries no theme/design-token field at all, so the frontend has no way to receive tenant theme even if a component wanted to apply it. Technician, branch-manager, and inventory feature components contain zero references to theme/primaryColor.

### PAGE: Page Builder
**Status: PARTIAL**

- The safe block registry exists with all 9 spec metadata fields plus extras, populated with 12 real entries.
- Safety-critical protection is real at three layers: UI disablement, client-side function guard, and server-side publish validation that blocks the publish outright if a safety-critical section were hidden. Finish Gate and Critical Warning Acknowledgement both carry `safetyCritical: true, removable: false`.
- **Payment Gate is missing from the registry entirely** — none of the 12 registered block types is a payment gate; the only trace is a status-label string elsewhere in the codebase, not a Builder-protected section. The spec explicitly lists Payment Gate alongside Finish Gate and Critical Warning as a non-removable safety block.
- Raw-code injection is genuinely blocked: section settings/messages/fields are regex-scanned for `<script`, `javascript:`, SQL keywords, `<iframe`, etc., and flagged as blocking publish errors.

### PAGE: Role Experience Studio
**Status: DIVERGES**

- Exists as a distinct, editable concept (mode, defaultLandingPage, visibleNavigation, shortcuts, density, labels) — but **has zero effect on the live app.** The real landing-page resolver is a separate hardcoded map that never reads this config; the real sidebar nav is built purely from permission-driven navigation, not from the Role Experience settings. These fields are referenced nowhere outside the Builder editor itself.

### PAGE: Workflow & Feature Studio
**Status: DIVERGES** — the most consequential single gap in this section

- Most named spec toggles are modeled in a defaults object (quick_service.enabled, team_leader.review, finish_gate rules, customer_decision.technician_can_send_directly, etc.), editable in the Builder UI.
- **Architectural split discovered**: the Owner-facing Builder engine persists everything to a generic `ControlSetting` row keyed `"builder.configuration"`. But the actual session/runtime feature resolver (`EffectiveAccessResolverService`) reads `enabledFeatures` from a **separate dedicated table**, `TenantBuilderConfiguration`. That table is created exactly once at tenant provisioning and is **never updated anywhere in the codebase.** So Owner publishes via the Builder UI never reach the data the session actually reads. The companion `TenantBuilderVersion`/`TenantBuilderAuditEvent` tables are likewise write-once-at-seed and otherwise dead.
- The one genuinely wired, tenant-scoped, backend-enforced workflow toggle found (a `ControlSetting` key controlling Finish → Team Review vs. QC routing) is seeded once with **no Owner-facing write path at all** — it proves the enforcement mechanism can work, and simultaneously proves Owner currently can't reach it.
- `quickServices()` is a fully hardcoded array, unconditionally returned regardless of the feature-policy flag meant to gate it — Quick Service can't actually be turned off today.
- Counter-example for fairness: discount-approval-threshold config, which lives outside the Builder in `FinanceConfiguration`, **is** genuinely wired end-to-end and enforced.

### PAGE: Forms & Fields
**Status: PARTIAL**

- Archive-not-delete is real: a schema-level `archived` flag with blocking validation rules (`core && archived` forbidden, `archived && required` forbidden), and the UI only exposes Archive/Restore — no delete method exists anywhere.
- Only 2 of the spec's ~9 form targets are actually seeded with schema data (asset registration for cars, and default part request). Quick Inspection, Customer Intake, Full Inspection, Return Unused, Customer Decision Request, Work Order, and Invoice Notes have no schema data for Owner to manage.
- **No "add a new custom field" UI exists at all** — the spec's own worked example ("Owner adds Battery Voltage to Quick Inspection") cannot be performed through the product today.

### PAGE: Messages & Templates
**Status: DIVERGES**

- Required-variable validation is real and blocks publish if a declared variable is missing from the template content.
- Only 3 of the spec's 8 message types are seeded (customer decision WhatsApp, critical warning, ready-for-delivery WhatsApp) — approval request, waiting parts, payment pending, invoice, and reminder messages don't exist as editable templates.
- **The actual outbound WhatsApp message is hardcoded and bypasses this system entirely** — the real customer-decision text is built from a fixed template-literal array in the customer-decisions service, completely independent of the `MessageTemplate` content Owner edits/validates/publishes. The branch-manager reminder send likewise writes a hardcoded English string, not template-driven.

### PAGE: Pricing & Financial Configuration
**Status: IMPLEMENTED** — the strongest page in this section of the audit

- Immutability goes beyond schema fields into real service-layer enforcement: final-invoice issuance uses an atomic claim pattern to prevent race-condition double-issue, snapshots locked unit prices per line, and sets an immutable-version marker. Quote approval snapshots price at decision time, so catalog changes afterward cannot retroactively affect an approved quote.
- No mutation endpoint exists for an issued invoice at all — the only path to change post-issue amounts is `refund()`, which creates a `CreditNote` and only touches paid/balance/status, matching spec's "changes after final invoice require credit/refund/adjustment" rule exactly.
- Recording a payment requires the invoice to already be locked; technician price visibility and discount-threshold config are genuinely read and enforced here.
- Caveat: this page saves directly with immediate effect — no draft/impact-preview/rollback pipeline (see Publish Center below).

### PAGE: Reports & Analytics (Owner)
**Status: PARTIAL**

- The overview report is genuinely real, live Prisma-aggregated data — not a placeholder. But it is the **only** report endpoint. A rich report registry defining 11 distinct report types with their own permission/scope/export/drill-down codes exists only as Permission Matrix decoration — none has a distinct backing endpoint, and no export or drill-down capability exists anywhere in the reports module.

### PAGE: Audit & Change History
**Status: PARTIAL**

- Audit rows genuinely capture before/after JSON from many call sites, but the generic audit DTO strips those down to 8 thin fields (no before/after/affectedPages/affectedRoles/affectedUsers/riskLevel/rollbackAvailable), and the Owner-facing audit list component renders even less.
- The spec's richer fields do exist, but only in a narrower, separate surface — the Configuration & Permissions "Change History" tab, filtered to permission-change actions only.
- The Owner's actual "Audit & Change History" nav entry points at the Builder's publish-version history (rollback per version) — not the fuller Change History tab, and not pricing/role/workflow-policy changes. No single page unifies all 11 spec-listed audit categories with before/after + risk + rollback together.

### PAGE: Publish Center / Impact Preview
**Status: PARTIAL** — pipeline is real but not generalized

- The full 8-step pipeline (Draft → Validate → Preview → Impact → Publish → Apply → Audit → Rollback) is genuinely implemented for the visual Builder scope (theme, page sections, role-experience data, feature/workflow policy definitions, forms, messages) — including a real validation gate that blocks publish on errors and requires a reason for high-risk changes.
- Configuration & Permissions has a **partial** version: draft/impact/apply exist, but there's no distinct "publish" step separate from "apply," and **no rollback endpoint** for permission changes at all.
- **Pricing & Financial Configuration and Organization & Access have no pipeline at all** — both write immediately on save, producing only a single audit-log row, with no draft, impact preview, publish gate, or rollback, despite the spec requiring the same governance for "any major Owner change."

### Builder and Tenant Customization (cross-cutting)
**Status: DIVERGES**

- Login loads `enabledModules`/`enabledFeatures`/`permissions`/scopes but never tenant theme or role-experience data — those fields don't exist on the session contract at all.
- The spec's core claim ("the same Technician page can look different in two different workshops") does not hold today — technician/branch-manager/inventory pages are built with fixed classes and zero theme bindings.
- What IS enforced correctly: raw-code injection is blocked, and platform locks are genuinely un-overridable by the Owner (locked cells are disabled both in validation logic and in the UI).

---

## 3. Branch Manager, Technician, Inventory Manager, Team Leader, Data Analyst

### Branch Manager — PAGE: Branch Home / Attention Center
**Status: PARTIAL** — 9 of 11 spec cards present (missing "Today Intake" and "Completed Today"); actions all route to real endpoints, not dead links.

### Branch Manager — PAGE: Customer Intake
**Status: IMPLEMENTED** — full 6-step wizard backed by a real transactional create. Ownership transfer is enforced server-side (not a UI checkbox): a transfer flag is required if the asset's current owner differs from the intake customer, and the old owner's `AssetOwnershipHistory` row is closed while a new one opens, naturally excluding old-owner financial data from the new owner's view.

### Branch Manager — PAGE: Work Orders (board)
**Status: IMPLEMENTED** — groups by exactly the spec's status set plus cancelled; cards carry all spec-listed fields.

### Branch Manager — PAGE: Work Order Workspace (action-restriction verification)
**Status: IMPLEMENTED — genuine backend enforcement, not UI-only.** The branch work-order action handler is a closed whitelist of exactly 7 actions (assign_technician, change_priority, send_customer_reminder, escalate_blocker, record_manual_note, approve_cancellation, mark_ready_delivery); anything else throws. Cross-checked against the permission map: Branch Manager holds no `task.*`, `parts.*`, or `inventory.stock.adjust` permissions, and calling technician/inventory endpoints directly as Branch Manager would 403. This is real action-layer enforcement matching the spec's "do not only hide buttons" rule.

### Branch Manager — PAGE: Approvals & Customer Decisions
**Status: IMPLEMENTED** — reminder/note/escalate-critical actions present, escalation genuinely gated on the critical-warning-required + rejected condition.

### Branch Manager — PAGE: Delivery & Payments Status
**Status: IMPLEMENTED** — the delivery-readiness check computes real blocking reasons from decision/parts/blocker/payment state and throws if any exist — a genuine gate, not a status label.

### Branch Manager — PAGE: Team Setup
**Status: MISSING**

- Not in the Branch Manager component's page switch, not in the app routes, not in the default role-page list. No `Team`/`TeamMembership` Prisma model exists — `managedTechnicianIds`/`teamScope` are flat string arrays with no history table.
- The permissions meant to gate this page (`team_setup.view`, `team_leader.create`, `technician.assign_to_team`) are declared in Branch Manager's permission list but **never asserted anywhere** in the API. Team assignment is Owner/Admin-only, non-configurable — there is no "Owner delegates to Branch Manager" toggle anywhere because the delegated feature doesn't exist at all.

### Technician — three-page restriction
**Status: IMPLEMENTED** — exactly 3 pages in the role's page list; the app shell explicitly suppresses the admin sidebar for technician routes (not just omits technician-side markup). No finance/inventory-admin/broad-report permissions in the role's permission list.

### Technician — PAGE: Technician Home
**Status: IMPLEMENTED** — Current Job Card and all named groups present with real data binding. Minor gap: no separate "Needs Inspection" tile (folded into general counts).

### Technician — PAGE: My Work
**Status: IMPLEMENTED** — groups match spec almost exactly (active_now, due_today, waiting_customer, waiting_parts, blocked, returned_for_rework, completed_today); all card fields present.

### Technician — Work Card: sticky header & lifecycle strip
**Status: IMPLEMENTED** — the lifecycle strip is a literal match to the spec's 9-stage list, with real derivation logic from job/parts/decision/blocker state.

### Technician — Tool: Quick Inspection
**Status: IMPLEMENTED** — all spec fields present, all 7 output routes wired to actually navigate/pre-fill the target panel.

### Technician — Tool: Inspect (Full Inspection) / Codes
**Status: PARTIAL** — Full Inspection is a real category-aware checklist but has no severity field, no photo placeholder, and no explicit per-finding customer-approval-requirement field — a flat status grid instead. Codes tool is a hardcoded 5-entry lookup with a generic fallback — functions as specified but is a stub catalog, not a real diagnostic database.

### Technician — Tool: Services / POS (price-visibility verification)
**Status: DIVERGES** — `hasPricingPermission()` is hardcoded to always return `true` ("Return true for sandbox demo" per its own comment), not wired to any session permission — technicians always see prices regardless of tenant configuration. The fallback text is `'Price hidden'`, not the spec's required `"Price hidden by workshop settings."` Positive note: the actual parts DTO sent to the frontend never includes cost/margin fields regardless, so cost/margin leakage itself isn't occurring even though the gate is broken.

### Technician — Tool: Parts Panel (status-label verification)
**Status: DIVERGES (semantically superior, presentation-layer mismatch)** — the real `PartRequestStatus` enum has 19 states (confirming the earlier ~19-state note), mapped down to technician-facing codes that are **lowercase snake_case internal tokens** (`on_the_way`, `return_pending`, `waiting_supplier`, etc.), not the spec's Capitalized labels (`On the way`, `Return Pending`). The frontend interpolates these raw values directly with no humanizing/label-mapping layer — so the UI literally renders `on_the_way` rather than "On the way." The underlying state machine is actually richer than spec (separate `approved` and `waiting_supplier` vs. `waiting_transfer` states), but presentation doesn't match.

### Technician — Tool: Ask Customer Panel
**Status: IMPLEMENTED** — all spec fields present; submits through a real create-then-send flow, and the decision DTO carries WhatsApp message/secure-link fields confirming the workflow is real, not mocked.

### Technician — Tool: Blocker Panel
**Status: IMPLEMENTED, one routing gap** — all 7 spec reasons present verbatim; server-side routing sends each reason to the right roles, except "Waiting Part" only notifies Inventory + Branch Manager (spec also wants Team Leader notified).

### Technician — Tool: Notes / History
**Status: IMPLEMENTED** — internal-vs-customer-visible toggle is real; history renders real timeline + decision audit rows.

### Technician — Tool: Finish Panel / Finish Gate
**Status: IMPLEMENTED** — 8 checks rendered with specific, distinct reason strings (not a generic "cannot finish"), computed server-side from live state, with a "Fix" deep-link to the offending panel. Two checklist fields (`requiredNotesCompleted`, `timeTrackingCompleted`) are hardcoded `true` stubs, never actually evaluated — those two gate conditions can never block finishing. Architecture note: a separate `TechnicianFinishGateService` domain service duplicates this logic but is dead code, never imported anywhere — the working enforcement is an inline duplicate inside the technician service.

### Inventory Manager — PAGE: Inventory Home
**Status: IMPLEMENTED** — all 8 spec cards present and computed live.

### Inventory Manager — PAGE: Technician Requests
**Status: IMPLEMENTED** — all 7 spec actions (approve/issue/reject/check-other-warehouse/transfer/supplier-order/mark-unavailable) are real, gated Prisma state transitions, individually permission-checked, not mockups.

### Inventory Manager — PAGE: Inventory POS / Catalog Control
**Status: IMPLEMENTED** — all spec fields manageable.

### Inventory Manager — PAGE: Quantity Control & Stock Status
**Status: IMPLEMENTED** — Available/Issued/Return-pending/Damaged per warehouse plus Healthy/Low/Critical/Out-of-Stock statuses render from real balances.

### Inventory Manager — PAGE: Returns / Movements (stock-increase gating — core rule verification)
**Status: IMPLEMENTED for 3 of 4 actions; 1 missing.** Traced every write site: the **only** place in the entire backend that increments sellable stock is inside the Inventory Manager's "accept to stock" action, gated on the relevant permission and an existing return-request row. The technician's own return submission only increments a separate return-pending bucket — it never touches sellable stock directly. "Accept as damaged" correctly increments a damaged-quantity bucket, not sellable stock. This is genuine, verified enforcement of the spec's core rule, not a policy comment. Gap: the spec's 4th action, **"Request Clarification," does not exist** on either backend or frontend (only 3 buttons: accept/damaged/reject).

### Inventory Manager — PAGE: Reports & Stock Insights
**Status: IMPLEMENTED ("lite")** — usage-by-item, stock-risk, returns, technician-request-summary, category-usage all computed from real data; branch/warehouse-usage split isn't a distinct report but category-usage partially substitutes.

### Team Leader — PAGE: Team Leader Home
**Status: MISSING** — no route, component, or endpoint produces the spec's cards at all.

### Team Leader — PAGE: Technicians View
**Status: MISSING** — the permissions meant to back this page (`team.technicians.view`, `team.supervision_note.create`, `team.issue.flag_to_branch_manager`) are declared in the role map but have **zero usages anywhere in the backend** — no controller, no service. The roster/drawer page (with internal supervision notes, flag-to-Branch-Manager) does not exist in any form.

### Team Leader — PAGE: Vehicles / Work Orders View
**Status: DIVERGES** — only wired to the generic, role-agnostic Work Orders component (also used for Owner/Admin and the Customer Portal), with none of the spec's lifecycle-drawer sections. Scope is correctly restricted to managed technicians, **but field-level redaction is not** — the financial-total redaction check only tests for `accountType === "customer"`, not `team_leader` (which is `tenant_staff`), so real financial totals render on every Team Leader work-order card. This directly contradicts the spec's explicit "No finance" rule for this role.

### Team Leader — PAGE: Technician Performance Reports
**Status: MISSING** — no dedicated route/component/endpoint. The role holds the relevant report permissions, but no page consumes them the way spec describes; the closest thing (the shared generic reports endpoint) isn't even in Team Leader's page list.

### Team Leader — Forbidden-list enforcement (most significant Team Leader finding)
**Status: DIVERGES — a real spec contradiction, not merely a UI gap.** The spec's Team Leader FORBIDDEN list explicitly includes "pass/reject maintenance in this version." The codebase implements exactly this as a full-stack feature: a review endpoint gated by `task.review`/`task.return_for_rework` permissions (both present in Team Leader's permission list), implementing `approve_qc` (moves task/WO to Ready for QC) and `return_rework` (sends the work order back to In Progress labeled "Returned for Rework") as real Prisma transitions, with dedicated "Approve for QC"/"Return for Rework" buttons in the frontend. This is not a hidden-button-only issue (which the spec separately warns against) — the capability is fully implemented and permission-backed for an action the spec says this role must not have yet, and it is notably the *only* bespoke Team Leader page that exists at all. Correctly absent, by contrast: task completion, part request/mark-used, payment recording, and customer-decision creation/response are all genuinely blocked (missing from the role's permission list) — so "complete task," "issue parts," "record payment," and "make customer decision" ARE correctly forbidden; only the QC pass/reject capability is the exception, and it's a significant one.

### Data Analyst — role existence
**Status: IMPLEMENTED (real role), PARTIAL (page depth).** `data_analyst` is a first-class, application-validated role wired end-to-end through login, session, permissions, and routing — not aspirational. Its permission set is genuinely read-only (no mutation permissions at all). However, its scope resolver treats it the same as Owner/Admin for data access — **always tenant-wide, never branch-restricted** even if a `branchScope` is assigned — diverging from the spec's "selected branches if scoped" language.

### Data Analyst — pages
**Status: PARTIAL/MISSING** — only 5 of the spec's 7 pages have routes at all ("Feature Adoption Analytics" and "Saved Views / Exports" have no implementation whatsoever). All 5 existing routes point to the **exact same component and single backend endpoint** — "Operations Analytics," "People Performance," and "Inventory & Customer Decisions" render identical content, distinguished only by a route title string, not 7 distinct analytical views. Structurally the "cannot edit/change permissions/issue stock/record payment/send messages/modify workflows" restrictions do hold (no such permissions exist for this role), but "Saved Views" doesn't exist — export is an ad hoc client-side CSV blob, not a persisted/named view.

---

## 4. Customer Role, System Automation, Relationships, Financial System, Operations Engine, Customer-Safe Projection, Reporting System, Audit, Quality Rules, Acceptance Test

### Customer Role
**Status: PARTIAL** — decision/response security is genuinely strong; 2 of 6 portal pages don't exist server-side.

- Server-side field whitelisting is real, not spread-based: the customer-facing DTOs are hand-built with no cost/margin/SKU/internal-note fields, and the wire type itself has no internal fields. Row-level scoping for customers is centralized and strictly keyed to `session.customerId` — no cross-customer leak path found.
- Customer decision responses are validated server-side end-to-end: unknown items/invalid decisions are rejected, critical rejections require acknowledgment, and the response is claimed atomically to prevent replay/tamper. The client can only send item id, decision, acknowledgment, and note — price/qty/identity are server-stored.
- Of the 6 spec pages, only 4 have any backing (Portal Home + Current Service are one merged component; Decision Page is real; Invoice & Payment reuses the finance component). **My Assets and Safe Technical History are MISSING entirely** — their permissions are declared but never asserted by any controller, and the `SafeTechnicalHistory` Prisma model is seeded but has **zero application-code reads anywhere** — it's DB-only, unreachable data today.

### System Automation
**Status: MISSING** (as an autonomous actor) — the data model exists; nothing runs autonomously.

- `AuditActorType.SYSTEM` and `AccountType.SYSTEM_AUTOMATION` are real enum values, but the only runtime usage of the SYSTEM actor type is reactive (logging failed-login attempts during a real HTTP request). No `SYSTEM_AUTOMATION` account is ever created, including in seed data.
- **No scheduler/queue/cron infrastructure exists at all** — no `@nestjs/schedule`, `bullmq`, `bull`, `node-cron`, or `agenda` dependency; no `@Cron`/`@Interval` decorator anywhere. There is no technical mechanism by which a background job could run.
- Everything the spec calls "system automation output" is actually either computed synchronously at GET-request time inside human-driven dashboards (low stock, overdue decisions, workflow health), or an explicit human button-click mislabeled as automation (reminder sends are Branch-Manager-triggered POSTs, not autonomous).

### Relationships Between Roles
**Status: PARTIAL** — most pairwise relationships are real and permission-driven; Super-Admin Live View and Owner-Builder→real-pages are not (both covered in detail above).

- Super Admin → Owner, Owner → Staff, Branch Manager → Technician, Technician → Inventory Manager chains are all concretely implemented with real business-rule validation.
- Permission delegation is centrally and correctly layered: role-default → tenant override → per-user override, with platform `ControlSetting` rows able to forcibly strip any permission/module/page regardless of tenant config.
- "Super Admin → Live View" and "Owner Builder → All Role Pages" both diverge from spec as detailed in sections 1 and 2 above — reiterated here because the spec frames them as foundational cross-role relationships, not just individual page features.

### Financial System
**Status: IMPLEMENTED** (rules enforced in the service layer, not just schema/UI) — with one real lifecycle gap.

- Locked/immutable invoice enforcement is real code: issuing a second final invoice throws, reversing a finalized running-invoice line throws, and recording payment refuses unless the invoice is already locked.
- The delivery payment gate is enforced in the actual status-transition function, not a UI warning — it calls the real gate check and throws before the work-order update runs if blocked.
- Catalog price changes are genuinely future-only: changing a price creates a new catalog entry with an effective-from date and deactivates the old one; it never touches existing running-invoice/invoice rows, and recalculation only re-sums each line's own already-stored price — approved/locked lines cannot be silently repriced.
- **Gap**: `WorkOrderStatus.DELIVERED` is a defined terminal enum value that **no code ever sets** — every write path stops at `READY_FOR_DELIVERY`. The lifecycle has no final "delivered" confirmation step, so "delivery blocked if unpaid" is enforced for a status transition that itself dead-ends one step early.

### Operations Engine
**Status: PARTIAL — one of the most important findings overall.** A real, hand-rolled centralized event system exists (not a third-party library; no event-emitter dependency), and is genuinely used by most, but not all, domain services.

- A single service (`OperationEventsService`) is the choke point that, per call, resolves workflow status changes, notification/page-update routing, customer-safe projection, writes an audit row, and conditionally writes a customer-timeline entry — mapping almost 1:1 onto the spec's "every event must update workflow status / pages / notifications / reports / timelines / audit / customer-safe projection" requirement, down to matching internal variable naming to the spec's own language.
- Coverage is broad: 8+ of the spec's named example event keys were found as literal string emissions in real code — `work_order.created`, `technician.assigned`, `customer_decision.requested`/`responded`, `part.requested`/`issued`/`arrived_confirmed`/`used`/`return_requested`/`return_accepted`, `invoice.issued`, `payment.recorded`, `builder.published`, `owner.permission_changed`, `platform_control.changed`, `workshop.frozen`, plus `inspection.saved`, `fault.created`, `blocker.reported`, `task.finish_blocked`.
- **Coverage gap**: the customers module (customer creation, portal invite, and — critically — **asset ownership transfer**) never calls this centralized service at all; it writes directly via a raw audit-log create with no before/after, no timeline entry, no report hook, no customer-safe projection. This is exactly the "each module independently updates its own tables" failure mode the spec's operations-engine rule exists to prevent — real, but localized to this one module rather than pervasive.
- **`reportHooks` are write-only** — stored inside the audit row's JSON but never read back by anything; "every event updates reports" holds in practice only because report endpoints independently re-query source tables live, not because of this mechanism. Notably, the codebase's own workflow-health diagnostic already flags work orders that changed with no matching operation event — the tooling to catch the customers-module gap exists, but it's a pull-based diagnostic, not a build-time or runtime guarantee.

### Customer-Safe Projection
**Status: IMPLEMENTED** — a real, dedicated translation layer with defense-in-depth, matching the spec's own example almost verbatim.

- A canned-message map per event key includes a "waiting for a required part" message near-identical to the spec's own brake-pads example.
- It also sanitizes freely-supplied text, not just fallback templates — a regex blocklist (supplier, stock quantity, internal note, technician score/performance/rating, margin, cost price, platform control) catches even caller-supplied strings and falls back to the safe default if matched.
- Confirmed wired to the source: an internal-only "note created" event is kept separate from a "customer-visible note created" event that actually produces customer-safe output; fault/diagnostic-code events never produce customer-safe output.
- Minor gap: the blocklist is fixed (no synonyms like "vendor"/"purchase order"/"warehouse," no numeric-cost detection) — a reasonable but not airtight backstop.

### Reporting System
**Status: DIVERGES** — role-scoping mechanics are centralized and correct, but the spec explicitly wants distinct per-role reports ("not one generic page"), and what's built is largely one generic page.

- The scoping mechanism itself is sound — the single report endpoint reuses the same centralized access resolvers used everywhere else, so each role's data is correctly filtered.
- But it genuinely is a single endpoint reused across nearly every role via one shared permission, returning the same shape to everyone — not Technician-personal vs. Inventory-stock-health vs. Branch-ops vs. Owner-company-wide as separate report types.
- The rich, spec-mirroring permission catalog for granular report types is almost entirely orphaned — only two permissions are ever actually asserted by a controller. **Team Leader has no report endpoint at all** — confirming the same finding from section 3.
- Minor secondary finding: the branches list returned by the overview report isn't scoped by branch, so any authenticated staff role can see all tenant branch names even outside their own scope (though counts/revenue remain correctly zeroed by the already-scoped underlying queries).

### Audit
**Status: PARTIAL/DIVERGES** — most required fields exist on the model, but `riskLevel` is missing from the schema, and the codebase's one "centralized audit service" is dead code while every module hand-rolls its own writer.

- The `AuditLog` model has actorType (System/Platform/TenantStaff/Customer), actor id+name, tenant, target type+id, action, reason, and genuinely structured before/after JSON (not description strings) where populated — matching most of the spec's field list.
- **`riskLevel` has no schema column at all** — it only exists ad hoc inside the `after` JSON blob, and only for platform-control and builder-publish actions specifically. Every other audited action type the spec lists (price changed, invoice issued, payment recorded, refund, customer decision responded, inventory movement, staff created) carries no risk level whatsoever.
- **The read path throws away before/after/riskLevel anyway** — the audit DTO and its backing query service map rows down to actor/action/target/reason/timestamp only, so even where before/after is captured, the Owner-facing UI can never show a diff.
- The one component that would be the "centralized audit service" by name is a 13-line stub that **nothing imports**. Meanwhile 10+ separate service files write directly to the audit table via their own locally-defined, inconsistent helper methods — some of which don't even accept before/after parameters, unlike others.
- "Report export" is in the spec's audited-action list but has no implementation at all (see Reporting System above) — nothing to audit.

### Quality Rules
**Status: PARTIAL** — several of the named centralized components genuinely exist and are non-trivial; a couple are hollow.

- Real and substantive: centralized permission resolver (with the caveats in section 1), centralized workflow status resolver, centralized lifecycle services (11 files under a `domain/services` folder — part lifecycle, return lifecycle, technician finish gate, work-order status, etc.), centralized customer-safe projection.
- Hollow: "centralized audit service" (dead-code stub, see Audit above); there's no distinctly-named "centralized platform control resolver" class — the logic exists but is folded into the effective-access resolver's disabled-modules logic, functionally fine but not the separate component the spec's list implies.
- "Do not silently mutate invoices/stock/permissions/workflows" is well-observed in the finance/inventory paths checked — explicit guard exceptions throughout, atomic claim patterns to prevent races in both customer-decision responses and payment recording.

### Acceptance Test — Full Business Flow (steps 1-17; spec truncated at step 18)

| # | Step | Verdict |
|---|------|---------|
| 1 | Super Admin creates workshop owner | Plausible — transactional, real |
| 2 | Owner logs in to their workshop only | Plausible — tenant scoping pervasive |
| 3 | Owner configures theme, pages, permissions, staff, pricing | Plausible for permissions/staff/pricing; **theme/page changes persist but don't visibly affect any real page** (see section 2) |
| 4 | Owner adds Branch Manager, Technician, Inventory Manager, Team Leader | Plausible — scope validation enforced |
| 5 | Branch Manager creates customer and asset | Plausible — real transactional intake flow |
| 6 | Branch Manager creates Work Order and assigns Technician | Plausible — same intake flow, emits real events |
| 7 | Technician sees job in Home/My Work | Plausible — real, scoped implementations |
| 8 | Technician opens Work Card | Plausible |
| 9 | Technician performs Quick Inspection | Plausible — emits real event |
| 10 | Technician creates fault/recommendation | Plausible |
| 11 | Technician adds service/part/labor through Work Order POS | **Conditionally plausible** — requires `finance.invoice.view`, which is not in Technician's default permission template; only works if Owner has already extended it |
| 12 | Customer decision request created with prices | Plausible |
| 13 | Customer approves from portal/link | Plausible — fully server-validated |
| 14 | Technician requests part | Plausible |
| 15 | Inventory Manager issues part | Plausible |
| 16 | Technician confirms arrived | Plausible |
| 17 | Technician marks used | Plausible — real atomic transaction updating status, task totals, stock balance, and a stock-movement ledger row |

Overall: the chain holds together end-to-end against real (non-stub) code, with one default-configuration soft spot at step 11.

---

## Top Gaps by Section (as originally reported by each research pass)

<details>
<summary>Tenancy / Auth / Platform Admin</summary>

1. No single 11-layer effective permission resolver exists — split between a decorative unused hierarchy and a separate ad hoc resolver that actually gates requests.
2. Work Order lifecycle has 6 of 16 spec statuses entirely missing, and no reopen/relink-to-new-Work-Order logic whatsoever.
3. Workshop Live View doesn't show real tenant pages — a schematic "simulated" card grid, not the actual tenant-branded UI — and its session log never records an end time or platform-admin identity.
4. Super Admin Control Center's ~50-item granular control catalog is a single generic free-text key/type form; only 2 Emergency actions have real forced-session-revocation enforcement.
5. Customer registration supports only one context-resolution mechanism (workshop code/slug); Limits & Entitlements enforcement is inconsistent (Max Users hard-enforced, most others not enforced at all).
</details>

<details>
<summary>Owner / Builder Domain</summary>

1. Two disconnected "Builder configuration" data stores — the Owner-facing engine writes to one table, the runtime resolver reads from another that's never updated after provisioning.
2. Theme and Role Experience are pure editors with no runtime consumer — confirmed absent from the session contract and from every non-Builder frontend file.
3. Messages & Templates is disconnected from actual message generation — real outbound WhatsApp/reminder text is hardcoded, independent of the template system.
4. The best-built Owner Home page is unreachable — excluded from the Owner's permitted route list, landing page defaults to a 3-tile stub whose own metrics call a nonexistent endpoint.
5. Publish Center pipeline (draft/impact-preview/rollback) is Builder-only — Pricing/Financial Configuration and Organization & Access write directly with no governance despite being high-risk areas.
</details>

<details>
<summary>Operational Roles</summary>

1. Team Leader's "Team Review" implements the one thing spec forbids (pass/reject maintenance) while the 4 pages spec actually requires are missing.
2. Team Leader sees real financial data via the shared Work Orders list — the finance-redaction check only excludes customers, not team leaders.
3. Branch Manager's "Team Setup" page is entirely unbuilt, including its data model — no Team/TeamMembership table exists at all.
4. Technician price-visibility gate is non-functional — hardcoded to always allow, with the wrong fallback copy.
5. Data Analyst's 7 distinct analytics pages collapse into one generic, tenant-wide dashboard reused across 5 routes; 2 of the 7 pages don't exist; scope resolver ignores any assigned branch restriction.
</details>

<details>
<summary>Finance / Operations Engine / Customer</summary>

1. System Automation is not autonomous — no scheduler/queue/cron infrastructure anywhere; the dedicated account type is never instantiated.
2. Operations Engine has one high-consequence blind spot — customer creation, portal invites, and asset ownership transfer bypass the centralized event system entirely.
3. Audit's `riskLevel` doesn't exist on the schema and is only populated for 2 of many audited action types; the codebase's one component named for centralized audit writing is dead code.
4. Reporting System is architecturally one generic endpoint, not role-differentiated reports; Team Leader has no report endpoint at all.
5. Customer portal is missing 2 of 6 spec pages (My Assets, Safe Technical History) with zero backing, despite the data model existing and being seeded.
</details>
