# Platform Super Admin — Detailed Page Specifications

> Status: **CALIBRATION DRAFT, confirmed.** Only "Add Workshop Owner" is done to full depth so far. Everything below is derived fresh from `docs/PRODUCT_SPEC_CANONICAL.md`'s intent, cross-checked against the Phase 0 schema (`packages/database/prisma/schema.prisma`) for what's actually representable — not copied or adapted from the old implementation.
>
> **This role's scope grew (2026-08-07):** design, page layout, role experience, workflow policy, and the permission matrix — previously planned as Owner self-service pages — now live here, under Super Admin Control Center → Builder Control, per workshop. See the Amendment note at the top of `docs/PRODUCT_SPEC_CANONICAL.md` and that doc's expanded Control Center section for the full rationale. "Add Workshop Owner" below is unaffected by this change (its "Starter Builder Template" field already assumed a platform-controlled baseline). The remaining pages list below is updated to include Builder Control's absorbed content.

---

## PAGE: Add Workshop Owner

### Purpose
Bootstraps a brand-new tenant (workshop) and its owner account in one atomic action. This is the only way a tenant is ever created — there is no public tenant signup.

### Access
- Role: Platform Super Admin only (`accountType = PLATFORM`).
- Permission key: `platform.workshop.create`.
- Route: `/platform/workshops/new`.
- Entry points: "Workshops" page → **+ Add Workshop** button (top-right of the page header). No other page links here.

### Layout
Single-column form, max-width ~720px, centered in the platform shell. Four visually separated sections in fixed order (Workshop Details → Owner Details → Plan & Limits → Initial Setup), each with a subheading. A sticky footer bar (always visible while scrolling the form) holds **Cancel** (left) and **Create Workshop** (right, primary, disabled until the form is valid).

### Section 1 — Workshop Details

| Field | Type | Required | Validation | Maps to | Notes |
|---|---|---|---|---|---|
| Workshop / Company Name | text | yes | 2–120 chars; must be unique across the platform (case-insensitive), checked via debounced (500ms) async call on blur — shows inline `"A workshop with this name already exists"` if taken | `Tenant.name` | |
| URL slug | text, auto-derived | yes | Auto-generated from the name (`lowercase, spaces→hyphens, strip non [a-z0-9-]`) the moment Name is typed; shown read-only with a small "Edit" link that reveals it as editable. Pattern `^[a-z0-9-]{3,50}$`; async-unique-checked same as Name. | `Tenant.slug` | Used in the customer-portal URL later (`/w/{slug}`) — shown as a live preview: `mop.app/w/{slug}` |
| Country | searchable select | yes | Must be a valid ISO-3166 country; no free text | `Tenant.country` | Full ISO country list, alphabetical, current selection pinned to top |
| City | text | yes | 2–80 chars | `Tenant.city` | |
| Business Type | select | yes | One of: `Independent Garage`, `Franchise / Chain`, `Dealership Service Center`, `Fleet Maintenance Operation`, `Other`. If `Other`, a second text field appears (required, 2–60 chars) | `Tenant.businessType` | |
| Currency | searchable select | yes | ISO 4217 code (e.g. `EGP`, `USD`, `AED`); no free text | `Tenant.currency` | One currency per workshop, fixed at creation — not editable from this page later (changing it after real invoices exist is a data-migration problem, not a form edit). Drives every money display and every `PriceCatalogEntry`/`Invoice`/`Payment` amount for this tenant |
| Timezone | searchable select | yes | IANA identifier (e.g. `Africa/Cairo`, `America/New_York`), grouped by region, defaulted from the selected Country | `Tenant.timezone` | All timestamps are stored in UTC in the database; this only controls display conversion, so unlike Currency it's safe to change later via Super Admin Control Center if the workshop relocates |
| Initial Operating Category | radio-card group (3 large cards with icon + label) | yes | Exactly one of `CARS`, `MOTORCYCLES`, `HEAVY_EQUIPMENT` | `Tenant.primaryCategory` | Helper text under the group: *"Sets default identifiers and terminology (plate number vs. serial number). Additional categories can be requested later through platform support — this isn't final."* |

### Section 2 — Owner Details

| Field | Type | Required | Validation | Maps to | Notes |
|---|---|---|---|---|---|
| Owner Full Name | text | yes | 2–100 chars | `StaffUser.fullName` (on the row created for the owner) | |
| Owner Email | email | yes | Valid email format; must be unique across the **entire platform** (an email can only be one Account, ever — not just unique per tenant, since Platform accounts and this new owner account share the same email space at signup time), checked async on blur, error: `"This email is already associated with an account"` | `Account.email` | This is what the invite email goes to |
| Owner Phone | tel, with country-code selector | yes | E.164-validated | `Account.phone` | |

### Section 3 — Plan & Limits

| Field | Type | Required | Validation | Maps to | Notes |
|---|---|---|---|---|---|
| Initial Plan / Package | select, populated from `Plan` table | yes | Must be an existing, active `Plan.code` | `Tenant.planId` | Selecting a plan auto-fills read-only preview chips below (Max Branches / Max Users / Max Warehouses / Monthly Price) sourced from that `Plan` row — **not independently editable here**; changing limits for one workshop without changing its plan happens later via Super Admin Control Center → Limits & Entitlements, not on this page |
| Allowed Branches (starting count) | number stepper | yes | 1 – `Plan.maxBranches` (upper bound enforced client- and server-side; field is disabled at 1 with tooltip `"Selected plan does not allow more than 1 branch"` if `maxBranches = 1`) | consumed at submit only, not stored directly (branches themselves are created later by the Owner in Organization & Access) | This is a *soft target* shown to the Owner on their first login checklist, not a hard record |
| Allowed Users (starting count) | number stepper | yes | 1 – `Plan.maxUsers` | same as above | |
| Allowed Warehouses (starting count) | number stepper | yes | 0 – `Plan.maxWarehouses` | same as above | Can be 0 if the tenant plans to operate without formal warehouse tracking initially |

### Section 4 — Initial Setup

| Field | Type | Required | Validation | Maps to | Notes |
|---|---|---|---|---|---|
| Starter Builder Template | select (visual thumbnail cards) | yes | One of the platform's seeded starter templates (e.g. `Default`, `Minimal`, `High-Volume Branch Network`) — list comes from a platform-level template registry (`ControlSetting` scope=PLATFORM, type=`builder_template`) | seeds `TenantConfiguration` at creation | Selecting a template shows a small live color/layout preview thumbnail |
| Enable Demo Data | toggle, default **off** | no | — | if on, triggers demo-seed job after creation (queued, not synchronous — see Effects below) | Helper text: *"Adds sample branches, staff, customers, and a few work orders so the Owner can explore before entering real data. Safe to enable or skip; can't be run again later from this page."* |
| Initial Status | select, default `Trial` | yes | One of `Active`, `Trial`, `Pending Setup` | `Tenant.status` | Helper text per option shown on hover/focus: **Active** — *"Owner can log in and use the workshop immediately."* **Trial** — *"Owner can log in; a trial-expiry banner is shown platform-wide once trial policy is configured."* **Pending Setup** — *"Tenant is created but Owner login is blocked until you switch status to Active or Trial from Workshops or the Control Center."* |

### Validation & Submit Button State
- **Create Workshop** button is disabled until every required field is valid (including both async-uniqueness checks resolved clean).
- While either async check (name/slug, email) is in flight, the button shows a small inline spinner next to it and stays disabled — never allow submit while a uniqueness check is pending, to avoid a race where the user submits before a duplicate is caught.
- On submit, button becomes disabled + shows `"Creating workshop…"`, whole form becomes read-only (no field edits mid-submit).

### Effects on Submit (all-or-nothing)
All of the following happen inside a single database transaction — **either every row below is created, or none are, and the user sees one clear error**, per the spec's "do not allow partial creation" rule:

1. `Tenant` row created (status = selected Initial Status, planId = selected plan).
2. `TenantConfiguration` row created, seeded from the selected Starter Builder Template.
3. `Account` row created (`accountType = TENANT_STAFF`, `tenantId` = new tenant, email/phone as entered, `status = INVITED`, no password yet).
4. `StaffUser` row created linked to that account (`role = TENANT_OWNER`, `fullName` as entered).
5. `RolePermission` rows seeded for all 7 tenant-staff roles from the platform's default permission map (not just the Owner's — every role gets its baseline so Organization & Access has something real to show once the Owner adds staff).
6. `RolePage` rows seeded the same way.
7. An invite token is generated (hash stored on `Account`, raw token embedded in the invite email/link — never stored in plaintext, never shown in the UI after this point).
8. `AuditLog` row: actor = the platform admin, actorType = `PLATFORM`, action = `platform.workshop.created`, target = new Tenant id, `after` = a snapshot of the created Tenant/Owner (email masked to `o***@domain.com` in the audit *display*, though the raw value is in `after` for legitimate lookup — masking is a read-side concern, not a storage concern).
9. If **Enable Demo Data** was on: a demo-seed job is enqueued (not run synchronously — the transaction above must not block on/depend on demo data generation succeeding). The Owner sees a `"Demo data is being prepared…"` banner on first login until the job completes.

### Success State
- Redirects to the "Workshops" page, with the new workshop's row visible at the top (sorted by "just created" until the list's normal sort order — most likely "last activity" — naturally moves it) and a transient success toast: `"{Workshop Name} created. Invite sent to {owner email}."`
- If email delivery itself fails (invite couldn't be sent, e.g. provider error) — the workshop/owner **are still created** (that failure must not roll back tenant creation), but the toast instead reads `"{Workshop Name} created, but the invite email could not be sent. Resend from the workshop's details drawer."` and the Workshops page row shows a small warning badge until resent successfully.

### Error States
- **Validation error** (client-side, before submit is even attempted): inline red text under the specific field(s), submit stays disabled. No toast, no page-level banner — this is normal, expected, not exceptional.
- **Uniqueness conflict caught only at submit time** (race: someone else claimed the same name/slug/email between the blur-check and submit): submit fails, the specific field is highlighted with the same inline error a blur-check would have shown, user does not lose any other entered data.
- **Server/transaction failure** (DB error, plan lookup failure, etc.): page-level error banner above the form: `"Something went wrong creating this workshop. Nothing was saved — you can try again."` — explicit reassurance that partial creation did not happen, matching the transactional guarantee above. Full error detail goes to the audit/error log, not shown raw to the admin.

### Permission Notes
- If the acting platform admin's own account lacks `platform.workshop.create` (e.g., a future lower-privileged platform role), the page itself 403s at the route level — this isn't a "hide the button" case, since Platform Super Admin currently has only one internal role, but the guard exists now so a future second platform role (e.g., "Platform Support," read-only) doesn't get silently granted this by omission.

### Out of Scope for This Page (handled elsewhere, noted so it isn't accidentally duplicated here)
- Branches/warehouses themselves are **not** created here — only soft numeric targets. Real branch/warehouse creation is Owner-side, in Organization & Access (Phase 3).
- Module/feature enablement beyond what the selected Plan implies is **not** set here — that's Super Admin Control Center → Modules/Features, a separate action, separately audited.
- Password is never set here — the Owner sets their own password via the invite link (a separate, not-yet-specified "Accept Invite" flow, which will get the same full-detail treatment when we reach it).

---

## PAGE: Workshops

### Purpose
The Platform Super Admin's default landing page. Every workshop on the platform, one row each — this is the page that has to stay usable whether the platform has 3 workshops or 30,000, and whether a given workshop has 1 branch or 200.

### Access
- Permission: `platform.workshop.view`.
- Route: `/platform/workshops` (also the post-login landing page for `accountType = PLATFORM`).

### Layout
Full-width. Header bar: page title, search box, filter chips, **+ Add Workshop** button (top-right, links to Add Workshop Owner). Below that: the table. Below the table: pagination controls.

### Loading & scale behavior
- **Server-side pagination from day one** — this table is never fully loaded client-side. Default page size 25 (selectable: 25/50/100). Sorting and filtering are server-side query parameters, not client-side array operations, specifically because the platform is meant to run many workshops worldwide, not a handful.
- Each row's Branch Count / User Count / Active Work Orders Count are pre-aggregated counts (single indexed query per column, not N+1 per row) — a workshop with 200 branches shows `200`, exactly like one with 1 shows `1`; the row itself never grows or changes shape based on how large that workshop is. All large-vs-small handling happens in the **Details drawer**, not the row.

### Table Columns

| Column | Type | Source | Notes |
|---|---|---|---|
| Workshop Name | text, clickable | `Tenant.name` | Click opens the Details drawer, not a navigation to another page |
| Owner | name + email, two lines | `StaffUser.fullName` / `Account.email` where `role = TENANT_OWNER` for that tenant | If the owner invite was never accepted (`Account.status = INVITED`), shows a small "Invite Pending" tag next to the name |
| Status | color-coded badge | `Tenant.status` | 7 values per spec; Frozen/Suspended/Archived render in a warning/danger color family, Active/Trial in a positive one |
| Plan | badge | `Plan.name` (via `Tenant.planId`) | |
| Branches | number | `count(Branch where tenantId = this, isActive = true)` | |
| Users | number | `count(StaffUser where tenantId = this, isActive = true)` | |
| Active Work Orders | number | `count(WorkOrder where tenantId = this, status not in (CLOSED, CANCELLED))` | This column did not exist in the platform's own earlier reports — it's here explicitly because "how busy is this workshop right now" is one of the first things Super Admin needs per row |
| Last Activity | relative time (e.g. "2h ago") | `max(latest StaffUser session activity, latest AuditLog.createdAt for this tenant)` | Hover shows the absolute timestamp in **that workshop's own timezone** (`Tenant.timezone`), not the Super Admin's browser timezone — small detail, but every timestamp shown about a specific workshop should read the way that workshop's own staff would read it |
| Subscription | badge | commercial snapshot (plan price × billing interval vs. last recorded payment) | Placeholder-quality until a real billing integration exists — labeled honestly, not left implying more precision than the data supports |
| Builder Status | badge (`Not Customized` / `Customized` / `Draft Pending`) | `TenantConfiguration.publishedVersion` vs. starter template baseline; `draftVersion != publishedVersion` → `Draft Pending` | |
| Health | badge (`Healthy` / `At Risk` / `Critical`) | composite: owner hasn't logged in > N days, failed-login spike, zero staff activity in M days, any Frozen/Suspended history in last 90 days | Badge alone on the row; the *specific* reasons are in the Details drawer, never inferred from the badge color alone |

### Row Actions (icon buttons, right-aligned)
- **Open Details** → opens the drawer described below
- **Open Reports** → navigates to Platform Reports pre-filtered to this workshop
- **Open Live View** → navigates to Workshop Live View pre-selected to this workshop
- **Open Control Center** → navigates to Super Admin Control Center with this workshop pre-selected as Target
- **Freeze Workshop** (shown only if `status` is not already `FROZEN`/`ARCHIVED`) / **Reactivate Workshop** (shown only if it is) — see below

### Freeze / Reactivate flow
1. Click opens a confirmation dialog, not an immediate action.
2. Dialog shows a live-computed Impact Preview: *"This will immediately sign out **{N} staff** and **{M} customers**, and block new logins until reactivated."* (counts computed from that tenant's active sessions right at dialog-open time, not cached)
3. **Reason** field: required textarea, 10–500 chars, no submit without it.
4. Confirm button stays disabled until the reason is filled in.
5. On confirm: `Tenant.status` updates, all active `Session` rows for that tenant are revoked, a `ControlSetting`/`AuditLog` row is written (`riskLevel = HIGH`), the dialog closes, and the row updates in place (no full page reload) with a toast: *"{Workshop Name} frozen."*
6. Reactivate follows the identical pattern (reason required, same audit rigor) — reactivating is not treated as "less risky" just because it restores access rather than blocking it; unexpectedly restoring access to a tenant that was frozen for a real reason (e.g. non-payment, abuse) is exactly the kind of action that also deserves a deliberate reason and an audit trail.

### Workshop Details drawer (slides in from the right, page stays visible/dimmed behind it)

Sectioned, scrollable independently of the page behind it:

- **Basic info**: name, slug, country, city, business type, category, currency, timezone, created date
- **Owner info**: name, email, phone, account status, last login (in the workshop's own timezone)
- **Plan info**: plan name, price, billing interval, `Allowed Branches/Users/Warehouses` limits with **current usage shown against each** (e.g. `Branches: 12 / 20`) so Super Admin immediately sees how close a large workshop is to its plan ceiling — small workshops just show a low number against a high ceiling, same component either way
- **Branches**: a scrollable sub-list (name, city, active/inactive) — for a workshop with many branches this sub-list paginates internally (20 at a time) rather than the drawer ballooning in height; a workshop with 1 branch just shows 1 row, no empty extra chrome
- **Warehouses**: same pattern as Branches — a workshop can have zero (if it doesn't track formal inventory), one, or many; the drawer must not assume any fixed count
- **Users summary**: count by role (small horizontal bar or chip row — e.g. `1 Owner · 2 Branch Managers · 8 Technicians · 1 Inventory Manager`)
- **Enabled modules**: chip list from `TenantConfiguration.enabledModules`
- **Recent activity**: last 10 `AuditLog` rows for this tenant, newest first, actor + action + relative time
- **Recent platform controls**: last 10 `ControlSetting` changes scoped to this tenant, same shape
- **Subscription snapshot**: plan, price, renewal date placeholder, paid/unpaid placeholder — same honesty-about-placeholder-data note as the table column
- **Health warnings**: the *itemized* list behind the Health badge (e.g. *"Owner has not logged in for 14 days," "3 failed login attempts in the last 24 hours"*) — never just the badge with no explanation

### Search & Filters
- Search box: matches workshop name or owner email, server-side, debounced 400ms.
- Filter chips: Status (multi-select), Plan (multi-select), Health (multi-select). Filters combine with AND; each active filter shows as a removable chip under the search box.
- Sort: Last Activity (default, descending), Name (A–Z), Branch Count, User Count, Created Date.

### Empty state
Zero workshops on the whole platform (genuinely first use): search/filter bar and table are hidden, replaced with a centered message — *"No workshops yet."* — and a prominent **+ Add Your First Workshop** button. Zero *matching* a filter/search (workshops do exist, none match): table area shows *"No workshops match these filters"* with a **Clear filters** link — a materially different state from true emptiness, so Super Admin never confuses "no data" with "no results."

---

## Remaining pages in this role (pending — same depth)

- Super Admin Control Center — Tenant Status, Modules, Features, Limits & Entitlements, Access & Accounts, Emergency
- Super Admin Control Center — Builder Control: Theme/Identity
- Super Admin Control Center — Builder Control: Page Layout
- Super Admin Control Center — Builder Control: Role Experience
- Super Admin Control Center — Builder Control: Workflow & Feature Policy (incl. Role Control / disable-a-role dependency check)
- Super Admin Control Center — Builder Control: Permission Matrix
- Platform Reports
- Workshop Live View
