# Platform Super Admin — Detailed Page Specifications

> Status: **COMPLETE.** All 5 Platform Super Admin pages (Add Workshop Owner, Workshops, Super Admin Control Center — Governance Controls, Super Admin Control Center — Builder Control, Platform Reports, Workshop Live View — Control Center counted as its two sub-areas) are done to full depth. Everything below is derived fresh from `docs/PRODUCT_SPEC_CANONICAL.md`'s intent, cross-checked against the Phase 0 schema (`packages/database/prisma/schema.prisma`) for what's actually representable — not copied or adapted from the old implementation.
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

## PAGE: Super Admin Control Center — Governance Controls

(Builder Control — theme, layout, role experience, workflow policy, permission matrix — is specified separately as its own page below, since it's large enough to need its own document. Everything else lives here.)

### Purpose
The single control plane for everything Super Admin can do to a specific workshop, and the few things that apply platform-wide (Emergency). Every control on this page follows the same governed flow — no exceptions, no shortcuts, because a control plane where some actions skip the safety pipeline is worse than not having one.

### Access
Permission: `platform.control_center.access`, plus a specific permission per control category below (so a future second platform role — e.g. read-only "Platform Support" — could see this page without being able to act on it).

### The governed flow (applies to every control on this page)
1. **Select Target** — a workshop (search-as-you-type, same data as the Workshops page). Nothing below is usable until a target is selected. Deep-linking here from Workshops or another page pre-fills the target.
2. **Choose Control** — pick a left-nav category, then a specific control within it.
3. **Impact Preview** — computed live, every time, never cached from a previous look at this control: affected users (exact count, not an estimate), affected roles, affected pages, affected modules, whether the tenant/Owner can override this once set, risk level (Low/Medium/High/Critical, computed from the control category + current tenant state, not manually chosen by the admin), rollback availability.
4. **Confirm with Reason** — a reason field, required for every control on this page without exception (some earlier drafts of this spec implied only "high-risk" actions need a reason; here, all of them do, because "why was this changed" should never be a mystery for a production platform, and the marginal cost of always asking is low compared to the cost of an unexplained change six months later).
5. **Apply** — the control activates. UI shows a brief "Applying…" state, then confirms.
6. **Audit** — an `AuditLog` row is written before the response returns to the admin, not fire-and-forget after — if audit-writing fails, the control change itself must not silently succeed unaudited (same "state and audit can't diverge" rule as the rest of the platform).
7. **Rollback if possible** — every control category states explicitly, in its own section below, whether it's rollback-eligible and what rollback actually restores.

High-risk and Critical-risk actions add a **double confirmation**: after step 4's reason is entered, a second modal restates exactly what will happen in plain language (not just "Confirm?") and requires typing the workshop's name to proceed — deliberately friction-heavy, because these are the actions most likely to be clicked by habit otherwise.

### Layout
- **Top bar**: Target selector (workshop search), then once selected: workshop status badge, current plan, current risk level, "last control change: {action} by {admin} {relative time}".
- **Left nav**: Overview, Tenant Status, Modules, Features, Roles, Builder, Access & Accounts, Limits & Entitlements, Reports, Finance, Emergency, Audit & Rollback.
- **Center**: the selected category's specific controls (detailed per category below).
- **Right panel**: Impact Preview, always visible once a control is selected, updates live as the admin changes options before confirming — never a preview of last time's action.

### Overview (left-nav default when a target is first selected)
A read-only summary before touching anything: current status, plan, risk, module/feature enablement summary (chip list), role states summary, last 5 control changes for this workshop (mini audit feed with a "View all" link to Audit & Rollback), and quick links into each other category. Exists so an admin opening Control Center for an unfamiliar workshop orients before acting, rather than the first thing they see being a form.

### Tenant Status

Single-select control: Active, Trial, Pending Setup, Frozen, Suspended, Read-only, Archived.

- Changing *to* **Frozen** or **Suspended** triggers the full Freeze effect set (from the Workshops page spec: blocks owner/staff login, blocks customer portal, blocks decision links, revokes all active sessions, preserves all data, Platform Live View stays available read-only). Frozen and Suspended are functionally identical in what they block; they exist as separate states so Super Admin can record *why* (Frozen = platform-initiated, e.g. policy violation; Suspended = commercial, e.g. non-payment) without needing a free-text reason to convey that distinction at a glance elsewhere in the UI (the reason field still captures specifics either way).
- Changing *to* **Read-only**: all write actions blocked platform-wide for every role at that workshop, but logins and viewing still work — distinct from Frozen, where login itself is blocked.
- Changing *to* **Archived**: same effect as Frozen, plus the workshop drops out of default list views everywhere (Workshops, Platform Reports) unless an explicit "show archived" filter is applied. Archiving is rollback-eligible (returns to whatever status it had before) but is flagged Critical risk regardless of the tenant's current activity level, since it's the state furthest from "business as usual."
- Changing *to* **Active** or **Trial**: reverses login blocks; sessions are not automatically restored (users log in fresh) — a deliberate choice, since silently re-establishing old sessions after a status change is exactly the kind of thing that should require a fresh login, not a resumed one.
- Rollback: available for every transition, restores the immediately-prior status only (not an arbitrary earlier one — for that, use the Audit & Rollback history and select a specific past event).

### Modules

Per-workshop on/off list: Customer Portal, Technician Workspace, Inventory Management, Branch Management, Team Leader Module, Workshop Builder, Reports, Finance, Multi-Branch, Multi-Warehouse.

- Each is a toggle plus a state badge showing where it sits in the permission hierarchy: `Enabled (Platform)` (default, tenant-editable — wait, no: modules are Super-Admin-only per the Amendment, so there is no tenant-editable case here anymore; the only states are `Enabled` and `Disabled`, both Super-Admin-set) — corrected: **Enabled** / **Disabled**, full stop, no tenant override tier, since Owner no longer has any module-toggling surface at all.
- Disabling a module removes its pages from navigation for every role at that workshop and blocks its endpoints server-side (not just hides the nav item) — this is what the platform's Effective Permission Resolver's layer 4 ("Module Enabled") directly reads.
- Disabling **Multi-Branch** or **Multi-Warehouse** on a workshop that currently has more than one branch/warehouse is blocked with an inline explanation, not allowed to silently orphan existing branches/warehouses — Impact Preview shows the exact count that would be affected and the control refuses to apply until the admin either keeps the module on or first reduces the workshop down to one branch/warehouse through Organization & Access.
- Rollback: restores prior enabled/disabled state for that module only.

### Features

Per-workshop on/off list: Quick Inspection, Quick Service, Computer Codes, Customer Decision Requests, WhatsApp Decision Links, Critical Warning Acknowledgement, Part Request Lifecycle, Return Unused, Builder Publishing, Custom Fields, Message Templates, Report Export, Finance Payments, Refunds.

- Same Enabled/Disabled model as Modules, one layer lower in the resolver (layer 5).
- Some features have hard dependencies on others, checked before Impact Preview even renders an Apply button: **WhatsApp Decision Links** requires **Customer Decision Requests** to be on; disabling Customer Decision Requests while WhatsApp Decision Links is on auto-includes disabling both in the same Impact Preview, shown as a single combined change, not two separate ones the admin has to notice and do in the right order.
- **Critical Warning Acknowledgement** cannot be disabled at all from this screen — it's greyed out with a tooltip: *"This is a safety-critical feature and cannot be turned off from any control surface."* (matches the Builder Control section's "hard rules baked into the application itself" note — this is enforced the same way, just surfaced here too so the admin doesn't have to already know that to understand why the toggle won't move).
- Rollback: restores prior state for that feature only, re-applying any dependency it had auto-included at disable time.

### Roles

Per-workshop, per-role state: Enabled, Disabled, Read-only, Login Locked, Actions Limited — for Tenant Owner, Tenant Admin, Branch Manager, Technician, Inventory Manager, Team Leader, Customer, Data Analyst.

- **Enabled**: normal.
- **Disabled**: the full dependency-safety flow already specified in the canonical spec (current holders reassigned/deactivated, dependent workflow policies force-resolved, in-flight records re-routed or blocking the disable) — Impact Preview here *is* that dependency check, rendered as a checklist the admin must resolve item-by-item before the Apply button activates. If there is nothing to resolve (a role with zero current holders, e.g. a workshop that never used Data Analyst), the checklist is empty and Apply is immediately available.
- **Read-only**: every write permission that role would otherwise have is suppressed at the resolver level for the duration; view permissions remain. Existing sessions for staff in that role are not revoked (unlike Login Locked below) — they simply lose write access on their next action, with a banner explaining why.
- **Login Locked**: new logins for that role are blocked; existing sessions are revoked immediately (this is the one role-state that does force a logout).
- **Actions Limited**: a specific, admin-chosen subset of that role's normal permissions is suppressed (opens a secondary picker listing that role's current permission keys with checkboxes) — the most granular of the five states, and the only one that needs its own sub-form rather than being a single toggle.
- Rollback: restores the prior role state, including re-running the dependency checklist in reverse where relevant (e.g. re-enabling a role that has since had its holders reassigned elsewhere doesn't silently reassign them back — it just makes the role assignable again going forward).

### Access & Accounts

- **Lock Owner Account** / **Unlock Owner Account** — toggle pair, mutually exclusive availability (only one shown depending on current state). Locking blocks that one account's login without touching any other staff.
- **Unlock Staff Account** — a per-person action, distinct from both the Owner-specific pair above and the bulk Suspend/Restore pair below. Found by tracing a real scenario end to end: a technician's account auto-locks after 5 failed logins (Phase 1's `LOCKOUT_THRESHOLD`, normally self-clears after 15 minutes) — if the owner reports it before that window passes, there was no way for Super Admin to unlock *that one person* without this. Staff list (searchable), locked accounts flagged, one-click unlock per row, same reason+audit rigor as everything else on this page.
- **Change Workshop Owner** — a distinct flow, not a toggle: search/select a different existing `StaffUser` at that tenant (must already exist — this does not create a new person), confirm, and the `TENANT_OWNER` role reassigns from the old holder (who reverts to `TENANT_ADMIN` by default, editable) to the new one. Requires the new owner to already have an active account — cannot be done as a one-step invite-and-promote.
- **Revoke All Sessions** — immediate logout for every account at that tenant (staff and customers). Not destructive to data; purely a session action. No rollback (there's nothing to roll back — sessions are simply re-established on next login).
- **Suspend All Staff** / **Restore Staff Access** — mutually exclusive pair, same shape as Lock/Unlock Owner but scoped to every non-owner staff account at once. Customer accounts are unaffected by this pair specifically (Disable Customer Portal Access, below, is the customer-scoped equivalent).
- **Disable Customer Portal Access** — blocks customer login and public decision links for this tenant specifically (distinct from the platform-wide Emergency "Disable Decision Links," which affects every tenant at once).
- **Reset Invite (placeholder)** — regenerates and re-sends the invite token for an account still in `INVITED` status; marked placeholder in the original spec pending the real invite-email delivery integration (see the gap analysis — this was one of the old build's unresolved items), so this control exists in the UI now but its "send" step is a stub until that integration lands.

### Limits & Entitlements

Numeric/list fields, editable independent of the workshop's assigned Plan (a manual override on top of the plan default, shown with a "differs from plan default" indicator when it does):

| Field | Type | Notes |
|---|---|---|
| Max Branches | number | Cannot be set below the workshop's current active branch count — inline validation, not just a save-time error |
| Max Users | number | Same floor rule, against current active `StaffUser` count |
| Max Warehouses | number | Same floor rule |
| Allowed Categories | multi-select (Cars/Motorcycles/Heavy Equipment) | Cannot remove a category that has existing `Asset` rows under it — same floor logic, applied to a set rather than a count |
| Allowed Modules | reference view only here | Actual toggles live under Modules, above — this just shows the plan-level ceiling those toggles can't exceed |
| Allowed Reports | multi-select from the report registry | |
| Allowed Builder Features | multi-select | Which parts of Builder Control (Theme / Layout / Role Experience / Workflow Policy / Permission Matrix) this workshop's plan permits Super Admin to even offer — a plan ceiling, not a per-workshop preference |
| Allowed Exports | multi-select | Which report categories can be exported to file for this workshop |
| Allowed Finance Features | multi-select (Payments / Refunds / Advanced Pricing / etc.) | |

Every field change here goes through the full governed flow individually — this is not a bulk-save form; each field is its own control with its own Impact Preview, so a change to Max Branches can't accidentally bundle in an unreviewed change to Allowed Exports.

### Reports (Control)

Per-workshop toggles: enable/disable reports overall, advanced reports, exports, financial reports, inventory value reports, user performance reports; plus **lock report permissions** (freezes the Owner's ability to change who on their team can see which report category, without disabling the reports themselves).

### Finance (Control)

Per-workshop toggles: enable/disable finance module overall, invoice generation, payment recording, refunds, financial reports, payment methods (multi-select from the platform's supported method list); plus **force finance read-only** (Owner/Branch Manager can view all finance data but no write action succeeds — invoices, payments, refunds all blocked — distinct from disabling finance outright, which also hides it from navigation).

### Emergency

Platform-wide-feeling but still per-workshop-scoped buttons, each a shortcut into an already-defined control above rather than a separate mechanism: Freeze Workshop Immediately, Force Logout All Users, Disable Customer Portal, Disable Decision Links, Lock Builder Publishing, Set Workshop Read-only, Suspend Staff, Lock Owner, Disable External Access.

- Every Emergency button skips step 2 (Choose Control) by pre-selecting its target control, but **never** skips Impact Preview, Confirm with Reason, or Audit — "Emergency" describes how fast an admin can reach the action, not a bypass of the governed flow.
- All Emergency actions are Critical risk by definition and require the double-confirmation (type the workshop name) regardless of the underlying control's own normal risk level.
- **Disable Decision Links** here is platform-wide (every tenant), distinct from the tenant-scoped "Disable Customer Portal Access" under Access & Accounts — the Emergency version exists for a scenario like a platform-wide incident with the WhatsApp/decision-link delivery path itself, not one misbehaving workshop.

### Audit & Rollback

The unified history for everything above, scoped to the selected target: every control change, in order, each row showing actor, action, before/after, reason, timestamp (in Super Admin's own timezone, with a toggle to view in the workshop's timezone instead), risk level, and a **Rollback** button where eligible (per the rollback notes under each category above). Rolling back writes its own new audit row referencing the original — history is append-only; a rollback is a new event, not an edit or deletion of the old one.

---

## PAGE: Super Admin Control Center — Builder Control

### Purpose
The per-workshop design/structure/permission editor. Same Target selector as the rest of Control Center; choosing "Builder" in the left nav opens a dedicated sub-workspace (its own tabs, its own draft state) rather than a simple form, because unlike the governance controls above, changes here are typically made in a batch (several theme tweaks, a couple of layout changes) and reviewed together before publishing — matching the Draft → Validate → Preview → Impact Preview → Publish pipeline already defined.

### Layout
- **Sub-nav (tabs, not left-nav items)**: Theme, Layout, Role Experience, Workflow Policy, Permissions. Switching tabs does not lose unsaved changes in another tab — all five share one draft.
- **Builder Control state banner** at the top of the sub-workspace, reflecting the current state for this workshop (Fully Enabled / View Only / Draft Only / Brand Only / Publishing Locked / Fully Locked) — set from the Governance Controls' Modules/Limits area, not from within Builder Control itself, and shown here as a constraint (e.g. under **Brand Only**, the Layout/Role Experience/Workflow Policy/Permissions tabs are visible but disabled with a tooltip explaining why).
- **Draft / Published toggle** at the top-right of the sub-workspace: viewing Draft shows unpublished changes; viewing Published shows what's actually live for that workshop right now. Defaults to Draft if one exists, Published otherwise.
- **Bottom action bar**, sticky: Discard Draft, Preview as Role (opens a read-only render of the selected workshop's pages under the current draft, for a chosen role — reuses the same rendering path Workshop Live View uses, so what Super Admin previews here is provably the same thing Live View and real users would see, not a separate mock), Save Draft, Publish.

### Tab: Theme
Fields: logo (upload, or URL), primary brand color, primary accent color, card style (select: Sharp / Rounded / Soft), border radius (slider, mapped to `tenant.theme.radius` token), font style (select from a fixed platform font list — not arbitrary font upload, to keep every workshop's typography within a maintained, licensed set), density (Compact / Comfortable / Spacious), status colors (5 color pickers: success, warning, danger, info, neutral — map to `tenant.theme.statusColors`), and separate toggles for whether staff pages and the customer portal inherit the same theme or diverge (customer portal theme can be set independently, since a workshop might want a more conservative public-facing look than its internal staff tools).
Live preview pane alongside the form, rendering a representative staff page and the customer portal home with the in-progress values — updates on every field change, not just on save.

### Tab: Layout
Page picker (Technician Home, Technician Work Card, Branch Manager Home, Work Order Workspace, Inventory Home, Team Leader Home, Customer Portal Home, Owner Dashboard, Reports pages) → once a page is selected, a drag-reorderable list of that page's sections. Each section row shows: name, a lock icon if `safetyCritical` (with the reason on hover — "Finish Gate cannot be removed or reordered below required checks"), a visibility toggle (only for `removable: true` sections), a "Restore" link if previously hidden, and a rename field (for sections where the registry allows title customization). A "Reset this page" link at the bottom returns every section on that page to the starter template's arrangement — itself a draft change, not immediate, so it goes through the same Preview/Publish step as everything else.

### Tab: Role Experience
Role picker (the 8 roles) → per role: default landing page (dropdown of that role's allowed pages), mode (Simple / Advanced), visible shortcuts (checkboxes from that role's available shortcut set), navigation density, card style, optional widgets (checkboxes), role label (text override, e.g. renaming "Technician" to "Mechanic" for a workshop that prefers that term — cosmetic only, does not change permission keys or routes). A persistent note under the picker: *"These settings change what's emphasized, never what's allowed — permission changes are on the Permissions tab."*

### Tab: Workflow Policy
Grouped toggles/selects matching the canonical list (Quick Inspection on/off, Quick Service on/off, customer approval required rules, critical rejection warning required, Team Leader review required, QC required, time tracking optional/required/off, return-unused-required-before-finish, delivery-blocked-until-payment, technician-can-send-directly-or-needs-review, discount approval thresholds). Each control that has a role dependency (per the Roles section of Governance Controls) shows an inline warning chip if the relevant role is currently Disabled at this workshop — e.g. the "Team Leader review required" toggle shows *"Team Leader is disabled at this workshop — enabling this will be blocked at Publish"* rather than letting the admin toggle it on and discover the conflict only at publish time.

### Tab: Permissions
The Permission Matrix: rows = permission keys grouped by the canonical permission groups (Authentication & Access, Customers, Assets, Work Orders, …), columns = the 8 roles. Each cell click-cycles through Allowed / Denied / Inherited (cells locked by Platform-level plan/control settings render non-interactive with a lock icon and the specific reason on hover — "Locked by Plan: Starter plan does not include Advanced Finance"). A per-role "View as this role's nav" side panel shows, live, which nav items and buttons a given permission state would produce — the same worked-example pattern as the canonical spec (toggling `customer_decision.send` off for Technician visibly removes the Send button in the side panel immediately, before Publish).

### Validation before Publish is allowed
- Every Workflow Policy toggle with a role dependency is checked against current Role states — any conflict blocks Publish with a clear list of exactly which toggles conflict with which disabled role, not a generic error.
- Message templates and Forms are Owner-owned and not part of this draft, but Publish still checks whether a Workflow Policy change here would orphan a required-variable reference in an Owner-authored template (e.g. a policy change that removes a decision step referenced by a message template's conditional text) — flagged as a warning, not a hard block, since the Owner may need to be the one to fix their own template.
- Raw-code injection scan runs across every free-text field in the draft (labels, custom section titles, role labels) — same rule as the original spec's "Builder cannot inject raw code," enforced here specifically since this is the only place that rule can actually be violated.

### Publish
Runs the full pipeline: Validate (above) → Preview (the same Preview-as-Role view, now framed as a final check) → Impact Preview (affected pages/roles/users/workflows/reports/customer-portal-behavior, computed for this specific draft's diff against the currently-published version) → Confirm with Reason → Apply Effective Config (this is the moment `TenantConfiguration.draftVersion` becomes the new `publishedVersion`, and it's the single write that `EffectiveAccessResolver` and every page actually read from) → Audit → a new row in `TenantConfigurationVersion` for Rollback.

### Rollback
From Audit & Rollback (Governance Controls) or from a "Version History" link inside Builder Control itself: pick any prior published version for this workshop, see a diff summary against current, confirm, and it becomes the new published version (rollback is itself a publish, audited the same way — not a special-cased revert).

---

## PAGE: Platform Reports

### Purpose
How the platform operator understands the business of running MOP itself — usage, adoption, commercial health, risk — across every workshop. Not a workshop's own operational reporting (that's the Owner/Branch Manager/etc.'s Reports & Analytics, entirely separate data and entirely separate page).

### Access
Permission: `platform.reports.view`.

### Layout
Two levels, like Workshops → Details drawer:

**Level 1 — Aggregated platform view (default landing state):**
A row of platform-wide summary tiles at the top (total workshops, active workshops, total staff users, total customers, aggregate MRR placeholder), then a grid of **workshop cards** (not a dense table like the Workshops page — these carry more visual weight since they're comparison-oriented): workshop name, usage score (0–100, composite), feature adoption (%), last activity, subscription status, health risk badge, builder adoption (%), active users. Same server-side pagination discipline as Workshops (many workshops worldwide, cards paginate, never all-load).

**Level 2 — Per-workshop detail (click a card):**
Opens the six report sections below for that one workshop, as tabs. Each tab is also reachable pre-filtered from a workshop's row on the Workshops page ("Open Reports" action).

A toggle at the top of Level 2 — **"Compare against platform average"** — overlays a faint reference line/value on every chart/metric showing where this workshop sits relative to the median across all workshops on the same plan tier (not all workshops platform-wide, since comparing a Starter-plan single-branch shop against an Enterprise 50-branch chain would be meaningless).

### A. Usage Overview
- Active users (staff + customer, split), daily/weekly active users (line chart, 30/90-day toggle), owner last login (with a staleness warning past a configurable threshold), staff last activity (table: each staff member, role, last action, relative time), customer portal usage (sessions, distinct customers, decision-link open rate).

### B. Feature Usage
- One row per feature (Technician Work Card, Customer Decision Requests, Inventory Requests, Parts Used/Returned, Quick Inspection, Quick Service, Builder, Reports, Team Leader, Finance): usage count this period, trend arrow vs. prior period, and — critically — cross-referenced against that feature's current enablement state from Control Center, so a feature showing zero usage because it's *disabled* reads differently (greyed, labeled "Disabled") than one showing zero usage while *enabled* (a real adoption signal, highlighted).

### C. Builder Adoption
- Theme customized (yes/no + last-changed date), pages customized (count of pages with any non-default layout), forms customized, messages customized, last publish (timestamp + who), rollback count (lifetime), validation failures (count of blocked-publish attempts — a proxy for how much friction Super Admin is hitting configuring this workshop), high-risk changes (count, links into that workshop's Audit & Rollback filtered to risk ≥ High).

### D. Operational Activity
- Work orders created/completed (chart, with a completion-rate percentage), active tasks, waiting-customer count, waiting-parts count, blockers (current open count + resolved-this-period count), inventory movements (count by type), payments recorded (count + total amount **in that workshop's own currency**, never converted or summed across workshops with different currencies — a platform-wide total would be currency-mixing nonsense, so Level 1's aggregate tiles never sum money, only counts), invoices issued.

### E. Commercial Snapshot
- Plan, subscription status, paid/unpaid, renewal date, overdue amount (placeholder — labeled honestly as not yet backed by real billing, same as the Workshops page), MRR contribution placeholder. This section is the most explicitly "not real yet" of the six, and the UI says so plainly rather than implying precision the platform doesn't have.

### F. Health & Risk
- Owner inactivity (days since last login), low staff usage (staff with zero actions in period), failed logins (count, with a spike indicator), builder validation errors (same count as section C, surfaced here too since it's a risk signal not just an adoption one), payment risk (placeholder, ties to Commercial Snapshot), frozen/suspension history (count + dates, last 12 months), low feature adoption (features enabled but unused past a threshold — the inverse of section B's disabled-vs-unused distinction). This section is what actually computes the Health badge shown on Workshops and on the Level 1 cards here — not a separate hidden formula, the same one, so a Super Admin who drills into "why is this workshop At Risk" always finds the literal answer here.

### Privacy discipline (applies to every section above)
- Nothing here ever surfaces a specific customer's name, phone, asset, or financial detail — every number is a count, a rate, or an aggregate. If a metric would require showing customer-identifying data to be useful (e.g. "which customer had the most decision requests"), it is not included on this page at all — that kind of lookup belongs to the workshop's own Owner-facing reports, not the platform operator's.
- Staff-level detail (e.g. "staff last activity" in section A) is fine — staff are the platform's own users in a meaningful sense, and workshop Owners already see this in their own reporting; it's not the customer-privacy line this rule is protecting.

## PAGE: Workshop Live View

### Purpose
Let Super Admin see a specific workshop's actual pages, in that workshop's actual current configuration, for a specific role — without logging in as anyone and without being able to change anything. Exists so "what does this workshop's Technician actually see right now" is answerable by looking, not by inference from config screens.

### Access
Permission: `platform.live_view.access`. Reachable from a workshop's row (Workshops page) or from Control Center's top bar.

### Entry flow
1. Target workshop (pre-filled if entered via a workshop's row).
2. Role selector: Owner / Tenant Admin, Branch Manager, Technician, Inventory Manager, Team Leader, Customer Portal, Data Analyst.
3. Persona selector (optional): either "Generic {role}" (no specific person, uses the role's baseline scope with no branch/warehouse/team narrowing) or a specific existing staff member/customer at that workshop (uses their actual scope — e.g. viewing as a specific Branch Manager shows only their assigned branch's data, not every branch).
4. Data mode: **Live data** (that workshop's real current records) or **Demo data** (if the workshop has demo data seeded — useful for a Pending Setup tenant with no real activity yet to look at).

### Rendering — the important architectural commitment
Live View does not render a separate "simulated" summary of what a page would look like. It renders **the exact same page components** every real user of that role sees, fed the selected workshop's real `TenantConfiguration` (theme, layout, role experience) and real (or demo) data through the same read APIs those pages normally call — just through a read-only session type that has view permissions only, structurally incapable of firing a mutation, rather than a UI-level "these buttons are disabled" trick. If Live View and a real logged-in user of that role would ever show different things for the same workshop/role/persona, that's treated as a bug in Live View, not an acceptable approximation.

### Chrome
- Persistent banner, always visible, cannot be dismissed: **"Platform Live View — Read-only"**.
- Every action surface (buttons, form submits, links that would normally mutate) still renders normally (so the page looks and feels real) but intercepts the click: a small toast — **"This action is disabled in Platform Live View."** — instead of performing it. Navigation between pages within the same role/workshop/persona context still works normally (it's a read action).
- A small floating control (bottom-right) to change Role/Persona/Data-mode without leaving Live View and re-entering from scratch.

### Session logging
Every Live View session writes a row at entry and updates it at exit: platform admin, workshop, role viewed, persona/user viewed, start time, end time, mode (`read_only`, currently the only mode — the field exists as an enum of one so a future mode never requires a schema change). The end time is set on explicit exit *and* on session timeout, so a session an admin simply closes the tab on doesn't stay "open" forever — a background sweep closes out (sets `endedAt`) any Live View session whose underlying auth session has itself expired.

### What Live View deliberately cannot do
No data mutation, ever, including administrative-feeling ones — Live View cannot freeze the workshop, cannot open Control Center from within itself (must exit first), cannot impersonate for the purpose of taking a real action "on behalf of" the workshop. If a Super Admin needs to actually act, that's Control Center, a separate, separately-audited surface — Live View exists purely to look.

---

## Platform Super Admin role: detailed specs complete.
- Super Admin Control Center — Builder Control: Theme/Identity
- Super Admin Control Center — Builder Control: Page Layout
- Super Admin Control Center — Builder Control: Role Experience
- Super Admin Control Center — Builder Control: Workflow & Feature Policy (incl. Role Control / disable-a-role dependency check)
- Super Admin Control Center — Builder Control: Permission Matrix
- Platform Reports
- Workshop Live View
