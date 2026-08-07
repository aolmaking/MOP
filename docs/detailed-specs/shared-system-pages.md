# Shared / Public / System Pages — Detailed Specifications

> Status: **COMPLETE.** These pages exist outside any single role's namespace — reachable before login, during account activation, or as a guard's fallback destination from any role. Derived fresh from `docs/PRODUCT_SPEC_CANONICAL.md`'s Login/Auth Model section, expanded to full page depth after a review pass against an older draft document that (correctly) flagged this whole category as missing from the per-role spec files.

---

## PAGE: Login / Identity Gateway

### Purpose
The single entry point for every account type except public customer registration — identifies the account and routes to the correct landing page. No other page in the product is reachable without going through this one first (aside from token-based entry points like Invite Accept and the public Decision Page, which are their own narrow exceptions).

### Access
Public, unauthenticated.

### Content
Email/phone field, password field, **Login** button, **Register as Customer** link (this is the *only* self-registration path offered — there is no link, hint, or path toward owner/staff/platform registration anywhere on this page). No role selector, ever — the account itself determines the role; asking the user to pick one would imply a choice that doesn't exist.

### States
- **Invalid credentials** — generic "Incorrect email/phone or password," deliberately not revealing which half was wrong (consistent with Phase 1's timing-attack-safe verification).
- **Account locked** (too many failed attempts) — "This account is temporarily locked. Try again in {actual remaining minutes}."
- **Account suspended/deactivated** (staff) — "This account has been deactivated. Contact your workshop owner."
- **Tenant frozen/suspended/archived** — credentials are valid, but instead of a login error the user is redirected to the dedicated **Tenant Frozen / Workspace Unavailable** page below — this is a materially different situation from a wrong password and gets a materially different page, not a variant error message on this one.

### On success
Resolves the full session context in one call (account type, tenant, role, every scope, effective permissions, enabled modules/features, tenant status, landing page — the same `buildSessionContext` Phase 1 builds), then redirects to that role's landing page. Never a generic post-login page that then figures out where to go.

---

## PAGE: Register as Customer

### Purpose
The only public self-registration path in the entire product.

### Access
Public, unauthenticated.

### Fields
Workshop code (pre-filled if arriving via a `?workshop=`/`?code=` query param from a branch QR/invite link/workshop-specific portal URL), full name, phone, email (optional), password.

### Workshop context resolution
The code is matched against `Tenant.slug` or `Tenant.customerRegistrationCode`. An unresolvable code shows an inline error immediately, before the rest of the form even enables — nothing else on this page is meaningful without a resolved tenant, so the form doesn't pretend otherwise.

### Blocked, explicitly
No owner registration, no staff registration, no platform registration, no role selection — this page has exactly one outcome: a new `Account` (`CUSTOMER`) + `Customer` row scoped to the resolved tenant. There is no floating customer account without a workshop, structurally — the form cannot submit without a resolved `tenantId`.

---

## PAGE: Invite Accept / Set Password

### Purpose
How an Owner (invited via Add Workshop Owner) or Staff member (invited via Organization & Access) actually activates their account.

### Access
Token-based (the invite link's `secureToken`-equivalent), not authenticated.

### Content
- **Invite validation**, with distinct states rather than one generic error: *expired* ("This invite has expired. Ask your workshop owner to resend it.") vs. *already used* ("This invite was already accepted — try logging in instead," with a Login link).
- **User info preview** — name, role, workshop name, read-only, so the person accepting can confirm they're accepting the right invite before doing anything else.
- **Set password** (with confirmation field and strength validation).
- **Accept terms** placeholder checkbox.

### On submit
`Account.status` moves `INVITED → ACTIVE`, password hash is set, the token is invalidated (single-use), the user is auto-logged-in and redirected to their role's landing page — no separate "now go log in" step.

---

## PAGE: Access Denied

### Purpose
The route/action guard's fallback destination — every denial reason gets its own specific message, never one generic "not allowed" blob.

### Access
Reachable by any authenticated user who was just blocked.

### Reasons, each with distinct copy
Permission denied for this specific action, module disabled for this workshop, feature disabled, platform-locked, outside your assigned scope (branch/warehouse/category — names which one), record not found or not visible to you. (Tenant-frozen is handled by the dedicated Tenant Frozen page instead of landing here — this page is for "you're logged in and your tenant is fine, but *this specific thing* isn't available to you.")

### Always includes
A link back to the user's own role landing page — this page is never a dead end the way Tenant Frozen deliberately is.

---

## PAGE: Tenant Frozen / Workspace Unavailable

### Purpose
Shown to any tenant user (staff or customer) whose credentials are valid but whose tenant is currently `FROZEN`/`SUSPENDED`/`ARCHIVED`.

### Content
Exactly: *"Your workspace is temporarily unavailable. Please contact MOP support."* No further detail about *why* the tenant was frozen is shown here — that reason lives in Super Admin's audit trail only, a deliberate choice (a suspended tenant's staff/customers don't need, and shouldn't necessarily get, the internal reason on a public-facing error page).

### No navigation elsewhere
This is intentionally a dead end — consistent with Freeze blocking essentially everything else, there's nothing else on this platform for this session to usefully link to.

---

## PAGE: Password Reset (placeholder)

### Purpose
Flagged explicitly as placeholder, consistent with how this spec set treats invite-email delivery elsewhere (Organization & Access's Reset Invite control, the WhatsApp decision-link send). The flow/UI shape exists — request by email/phone → token link → set new password, structurally identical to Invite Accept's second half — but actual message delivery depends on the same not-yet-built email/SMS integration.

---

## Shared UI States & Components

Established once here, reused by reference throughout every role's detailed spec rather than being redefined per page.

### Empty state vs. no-results state
Every list/table in this product distinguishes **"genuinely no data yet"** (e.g. a brand-new workshop's Workshops table, first established on that page) from **"no results matching your current filter"** (search/filter active, data exists elsewhere) — two different messages, never conflated, applied identically across every list in every role.

### Locked-by-Platform / Locked-by-Plan badge
A small lock icon plus a tooltip naming the *specific* reason (not just "locked") — established first in Builder Control's Permission Matrix tab, reused verbatim in Modules/Features/Limits & Entitlements and in Owner's finance/report-visibility toggles. One implementation, one visual language, everywhere a Super-Admin or plan-level restriction disables a control.

### Role Preview / "preview as role"
Used in Page Builder's page-editor and Builder Control generally — reuses the exact same rendering path Workshop Live View uses (already a hard architectural commitment there: real components, real config, read-only session type). There is one "render page X as role Y" implementation in the whole product, not a preview-specific approximation and a separate real Live View.

### No-Permission inline state
Distinct from the full-page Access Denied above — used when a single section/widget within an otherwise-accessible page isn't available to this user (e.g. a report tab this role can't see within a page they can otherwise reach). Renders as a small in-place message ("You don't have access to this section"), never a redirect away from the rest of the page.

### Pagination vs. virtualization
Server-side pagination is the default for anything that could grow large across tenants/time (Workshops, any staff/branch/warehouse/item table, audit logs, movements ledgers) — established first on the Workshops page. A small number of specific **in-page, non-paginated** lists that can still get long within a single view (a Details drawer's branch sub-list, the Permission Matrix's row set) use client-side virtualization instead, since paginating a sub-list *inside* an already-open drawer would be a worse experience than a smoothly-scrollable virtualized list — a deliberate distinction, not an inconsistency.
