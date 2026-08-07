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

## Remaining pages in this role (pending — same depth)

- Workshops
- Super Admin Control Center — Tenant Status, Modules, Features, Limits & Entitlements, Access & Accounts, Emergency
- Super Admin Control Center — Builder Control: Theme/Identity
- Super Admin Control Center — Builder Control: Page Layout
- Super Admin Control Center — Builder Control: Role Experience
- Super Admin Control Center — Builder Control: Workflow & Feature Policy (incl. Role Control / disable-a-role dependency check)
- Super Admin Control Center — Builder Control: Permission Matrix
- Platform Reports
- Workshop Live View
