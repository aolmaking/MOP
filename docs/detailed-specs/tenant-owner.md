# Tenant Owner / Tenant Admin — Detailed Page Specifications

> Status: **IN PROGRESS.** Derived fresh from `docs/PRODUCT_SPEC_CANONICAL.md` (post-restructuring — Owner no longer controls design/layout/role-experience/workflow-policy/the general permission matrix; see the Amendment note there and `docs/detailed-specs/platform-super-admin.md` for where that capability now lives). Cross-checked against the Phase 0 schema. Shared UI conventions already established in the Platform Super Admin spec (server-side pagination for any list, the Freeze-style confirm-with-reason dialog pattern, lock-icon-plus-tooltip for anything Super-Admin-locked) are reused here by reference, not re-explained.
>
> **A cross-cutting rule that applies to every page below:** two finance- and reporting-specific settings on this page set ("who can issue invoice / record payment" under Pricing, and report-category visibility under Reports & Analytics) are narrow, domain-scoped slices of the same `RolePermission` mechanism Super Admin's Permission Matrix manages — Owner can toggle them, but only within whatever Super Admin's matrix has left as `Allowed`/`Inherited` (not `Denied`/`Locked by Platform`/`Locked by Plan`) for that specific permission key. Where Super Admin has locked one, Owner sees it here read-only with the lock reason, identical in spirit to how a locked cell renders in Builder Control's Permission Matrix tab. This is the one place Owner still touches permissions at all, and it's deliberately narrow.

---

## PAGE: Organization & Access

### Purpose
The Owner's own people, branches, and warehouses. This is the first page that has to work — nothing else in the product is usable for a given workshop until staff exist, and per the build plan it's built before any other Owner page.

### Access
Permission: `organization.access.manage` (Owner, Tenant Admin).

### Layout
Four tabs: **Staff**, **Branches**, **Warehouses**, **Teams**. Each is an independent, server-side-paginated list (same discipline as the Workshops page — a workshop with 3 staff and one with 300 use the identical table shape).

### Tab: Staff

**Table columns:** Name, Role, Branch scope (chips, or "All branches" if unscoped), Warehouse scope (chips), Category scope (chips), Status (Active/Inactive/Locked), Last login.

**+ Invite Staff** button opens a form:

| Field | Type | Required | Validation / Behavior |
|---|---|---|---|
| Full Name | text | yes | 2–100 chars |
| Email | email | yes | Unique within this tenant (a person can hold accounts at multiple *different* tenants with the same email — uniqueness is per-tenant here, unlike the platform-wide uniqueness on the Owner's own account at creation) |
| Phone | tel | yes | E.164 |
| Role | select | yes | Options are exactly the 7 tenant-staff roles **minus any Super Admin has disabled for this workshop** — a disabled role does not appear in the list at all, not shown-and-greyed, since an Owner shouldn't need to wonder why a role won't save; it simply isn't offered |
| Branch Scope | multi-select of this tenant's branches | conditional | **Required, min 1**, if Role is Branch Manager or Technician (Technician's requirement is itself conditional — see Workflow Policy note below) |
| Warehouse Scope | multi-select of this tenant's warehouses | conditional | **Required, min 1**, if Role is Inventory Manager |
| Category Scope | multi-select (Cars/Motorcycles/Heavy Equipment) | conditional | Required if Role is Technician or Inventory Manager *and* this workshop operates more than one category (a single-category workshop skips this field entirely — it's implied) |
| Team | select, existing teams only | conditional | Shown only if Role is Technician; assigns them into an existing team's membership immediately (creates a `TeamMembership` row) — optional at invite time, can be done later from the Teams tab instead |

Submitting creates the `Account` (`status = INVITED`) + `StaffUser` in one transaction, seeds no permission rows (those are already seeded per-role at tenant creation and live under Super Admin's control), and sends an invite email/link (same placeholder caveat as Super Admin's Reset Invite control — real delivery is a later integration).

**Row actions:** Edit scope, Activate / Deactivate (toggle, immediate, no reason required — this is routine staffing, not a governance action), Lock / Unlock (blocks login without deactivating — for a suspected-compromised account, distinct from Deactivate which is "this person no longer works here").

**Effects (must actually happen, not just be documented):**
- A new Technician immediately appears in Branch Manager's technician-assignment picker, scoped to their branch.
- A new Inventory Manager immediately appears as an approver in their warehouse's request queue.
- A new Team Leader immediately appears as assignable in the Teams tab.
- Deactivating a staff member does **not** delete their historical records (past task assignments, audit entries) — it blocks future login and removes them from assignment pickers going forward, consistent with the "no silent deletion" principle across the whole product.

### Tab: Branches

Table: Name, Code, City, Warehouse count (linked), Staff count, Active/Inactive. **+ Create Branch**: Name, Code (unique per tenant, auto-suggested from Name, editable), Address, City.

A branch cannot be deactivated while it has active `WorkOrder` rows in a non-terminal status — inline block with a link to that branch's open work orders, same "floor" pattern as Super Admin's Limits & Entitlements.

### Tab: Warehouses

Table: Name, Code, Linked branches (chips), Active/Inactive. **+ Create Warehouse**: Name, Code. A workshop that doesn't formally track inventory can have zero warehouses — this tab's empty state reads *"No warehouses yet. If your workshop tracks parts inventory, add one here — otherwise you can skip this."*, not treated as an error condition.

**Branch ↔ Warehouse linking:** a matrix view (branches as rows, warehouses as columns, checkbox per cell) below the two tables — this is what populates `BranchWarehouseAccess`, and it's what lets a large multi-branch workshop share one central warehouse across several branches, or give each branch its own, without the schema or this page assuming either shape.

### Tab: Teams

Table: Team name, Branch, Team Leader, Member count, Active/Inactive. **+ Create Team**: Name, Branch (optional — a team can be branch-agnostic), Team Leader (select from staff already holding that role — if none exist yet, inline prompt to invite one first from the Staff tab, since a team cannot be created leaderless).

**Manage members** (per team, drawer): add/remove technicians (search from this tenant's technician staff, regardless of which team they're currently in — moving someone closes their current `TeamMembership` row with an `endedAt` and opens a new one, never overwrites history). A "Membership History" toggle on the drawer shows past members with their date ranges, per the spec's explicit "must preserve team membership history" rule.

### Validation summary (enforced server-side, not just inline UI hints)
- Inventory Manager must have ≥1 warehouse scope.
- Branch Manager must have ≥1 branch scope.
- Team Leader must have a managed team with ≥1 technician before they can be relied on anywhere else (a Team Leader with zero managed technicians is allowed to exist as an account, but their Home/Technicians View pages show an explicit "You have no assigned team yet" state rather than crashing on an empty scope).
- Technician's branch/category scope requirement follows whatever Super Admin's Workflow Policy has set for this workshop (`technician requires branch scope` may be off for a very small single-branch workshop where it would just be redundant data entry — this is one of the Workflow Policy toggles Super Admin controls per workshop, read here, not re-decided here).

---

## PAGE: Forms & Fields

### Purpose
Safe, additive customization of the workshop's forms — add a field, don't break history.

### Access
Permission: `organization.forms.manage`.

### Layout
Form picker (9 forms: Customer Intake, Asset Registration, Quick Inspection, Full Inspection, Part Request, Return Unused, Customer Decision Request, Work Order, Invoice Notes) → for the selected form, a field list: **core fields** (locked icon, cannot be reordered out of their structural position or deleted — shown for context, not editable here) followed by **custom fields** (this workshop's additions, in the order they'll render).

### Add Field

| Field | Type | Notes |
|---|---|---|
| Field Name | text | Becomes the form label verbatim |
| Field Type | select | text / number / select (with an options sub-list editor) / checkbox / date / textarea / image-file placeholder |
| Category-specific | multi-select (Cars/Motorcycles/Heavy Equipment) or "All categories" | e.g. "Hour Meter Reading" only makes sense for Heavy Equipment |
| Role-specific | multi-select of roles that fill this field | who *enters* the value |
| Staff only / Customer visible | toggle | whether this field's *value* ever appears on the Customer Portal |
| Reportable | toggle | whether this field's value is available as a report dimension/filter |
| Required / Optional | toggle | |

### Worked example (from the canonical spec, made concrete)
Owner adds "Battery Voltage" (number type) to Quick Inspection, category-specific to Cars and Motorcycles, role-specific to Technician, staff-only, reportable:
- It appears in the Technician's Quick Inspection form immediately, for Cars/Motorcycles work orders only (a Heavy Equipment inspection never shows it).
- The value is stored inside that `Inspection.fields` JSON blob alongside the built-in fields — no schema migration needed for this or any future custom field, which is the entire reason that column is JSON rather than fixed columns (see `docs/DATA_DICTIONARY.md`).
- It's visible to Team Leader (if their role has inspection-detail view permission) since it's staff-only, not customer-visible.
- It appears as a filterable/exportable column in Reports & Analytics because it's marked reportable.
- The Customer Portal never renders it, because it isn't marked customer-visible — this is enforced by the same field-level visibility check the customer-safe DTOs already use, not a separate rule.

### Archive (not delete)
Archiving a custom field: it disappears from the *live* form immediately (new records never collect it again) but every past record that captured a value for it keeps that value, viewable wherever that historical record is viewed, tagged `(archived field)`. A "Restore" action un-archives it back into the live form in its prior position. There is no hard-delete action anywhere on this page — the spec's "custom fields can be archived, not hard deleted" rule has no escape hatch, intentionally.

---

## PAGE: Messages & Templates

### Purpose
Every customer-facing and staff-facing message this workshop sends, in one editable place — and critically, the thing the actual sending code must read from, never a hardcoded fallback (see note below — this was the previous build's failure mode here).

### Access
Permission: `organization.messages.manage`.

### Layout
Template picker (8: WhatsApp decision message, approval request message, waiting parts message, ready for delivery message, payment pending message, critical warning text, invoice message, reminder message) → editor with a variable-insertion toolbar (clicking `{{customer_name}}` inserts it at the cursor rather than requiring the Owner to type the syntax correctly) → live preview pane rendering the template against sample data in the workshop's own language/tone as typed.

### Required variables (per template, validated before Publish)
`customer_name`, `work_order_id`, `decision_link` (decision message only), `total_amount` (where the template implies a price is being communicated), `branch_name`. Publish is blocked with an inline error naming exactly which required variable is missing from the current draft — not a generic "invalid template" message.

### The architectural commitment this page requires downstream
Every place in the product that sends one of these 8 message types — the Technician's Ask Customer panel (Phase 5), Branch Manager's send-reminder action (Phase 4) — must call a shared template-rendering service that reads the *published* `MessageTemplate` for that workshop, with no hardcoded string fallback anywhere in that code path. This is called out explicitly because the prior implementation's gap analysis found exactly this: a real, working template editor whose output was never actually consumed by the real send logic, which had its own hardcoded copy instead. Phase 5's Ask Customer panel spec (written later, in the Technician doc) must be built against this template service from the start, not patched to use it afterward.

### Changes affect
Generated WhatsApp messages, Customer Portal text (the decision page renders the same template-sourced explanation, not a separate customer-portal-specific copy), Branch Manager reminders, the decision workflow's own internal audit trail (which records which template version was sent, so a later template edit doesn't retroactively change what a past audit entry shows was actually sent).

---

## PAGE: Pricing & Financial Configuration

### Purpose
The workshop's own prices and money rules — the single most interconnected page in the Owner's remaining set, since Branch Manager, Technician, and the Customer Portal all read from what's configured here, in this workshop's own currency, for every quote/invoice they touch.

### Access
Permission: `finance.configuration.manage`.

### Layout
Sections: **Service Catalog**, **Tax / VAT**, **Discounts & Deposits**, **Payment Methods**, **Invoice Settings**, **Delivery Payment Gate**, **Who Can Handle Money**.

### Service Catalog
Table of priceable items (services, labor rates, inspection fees, packages), each row: name, type, unit price, labor price, active/inactive. Every price is shown and entered in **this tenant's own currency** (`Tenant.currency` — the page renders the correct symbol/code automatically; there is no currency picker here, since currency is fixed at workshop creation, not editable per price).

Editing a price shows an inline reminder, not just documentation prose: *"This will only affect quotes created after you save. Existing quotes and invoices keep their original price."* — because `PriceCatalogEntry` is effective-dated and nothing here ever rewrites an already-approved `QuotationItem.approvedPrice` or a `RunningInvoiceLine`/`InvoiceLine`. This page cannot violate that rule even if the Owner wanted to; there is no "apply retroactively" option anywhere.

### Tax / VAT
Rate (percentage), inclusive-vs-exclusive toggle (does the entered service price already include tax, or is tax added on top at invoice time) — one setting per workshop, applied uniformly, since a workshop operating in one country has one tax regime (multi-jurisdiction tax handling is out of scope unless a future spec explicitly asks for it).

### Discounts & Deposits
Max discount % (hard ceiling, no invoice line can exceed this without triggering a `DiscountRequest`), discount approval threshold (amount above which a `DiscountRequest` requires approval rather than applying immediately — maps directly to `FinanceConfiguration.discountApprovalThreshold`), max branch-level discount % (a separate, usually lower ceiling for what a Branch Manager can approve without escalating further — `FinanceConfiguration.maxBranchDiscountPercent`), deposit rules (whether a deposit is required before work starts, and as a % or fixed amount).

### Payment Methods
Multi-select checklist (Cash, Card, Bank Transfer, Wallet, Deposit) — but the checklist only *offers* methods Super Admin's Limits & Entitlements has included in "Allowed Finance Features" for this workshop's plan; a method not on the plan doesn't appear as an option to even consider, rather than appearing and then being rejected on save.

### Invoice Settings
Numbering format (prefix + zero-padded sequence, e.g. `INV-2026-000482`, backed by `InvoiceSequence`), invoice terms (free text, appears on the printed/portal invoice), default due-in-days.

### Delivery Payment Gate
`allowUnpaidDelivery` / `allowPartialPaidDelivery` toggles — read directly by the delivery-readiness check (Branch Manager's Delivery & Payments Status page, Phase 4) and by the Technician's read-only delivery-status indicator (Phase 5). Turning this on doesn't just change a label — it changes whether `markReadyForDelivery` actually throws when the balance is nonzero, so the Owner sees a plain-language warning before saving: *"Branches will be able to release vehicles with an unpaid balance."*

### Who Can Handle Money
Two toggles — **Who can issue invoices** and **Who can record payments** — each a role multi-select. Per the cross-cutting rule at the top of this document: this writes to the same `RolePermission` rows Super Admin's matrix manages, scoped to exactly `finance.invoice.issue` and `finance.payment.record`, and any role Super Admin has locked to `Denied` for those two keys is shown here disabled with the lock reason rather than offered as a checkbox. Branch Manager is the only role with these available by default; enabling them for Technician is possible only if Super Admin's plan/matrix permits it at all (most plans won't).

---

## PAGE: Reports & Analytics

### Purpose
Company-wide reporting for the Owner's own workshop — distinct from Platform Reports (that's the platform operator's view of *this workshop as a customer of MOP*; this page is the Owner's own operational view of *their business*).

### Access
Permission: `reports.owner.view`.

### Layout
Section tabs: Operations, Branch Comparison, Technician Performance Summary, Inventory Risk, Customer Decision Trends, Finance Summary, Workflow Health, Configuration & Audit Awareness (renamed from the original "Builder adoption / permission changes" — see note below).

### Branch Comparison — scale-aware by design
A comparison table/chart across the workshop's branches. For a single-branch workshop, this tab shows a friendly degraded state — *"You have one branch. Comparison views become useful once you have more than one — this page will fill in automatically."* — rather than an empty chart that looks broken. For a large multi-branch workshop, the same component just renders more rows/series; the page never needs a different layout for different scale, only different data volume.

### Configuration & Audit Awareness
Since Owner no longer makes design/permission/workflow-policy changes, this section is explicitly **read-only awareness** of what Super Admin has set for this workshop and when it last changed — last publish date, current Builder Control state, current Workflow Policy summary, recent permission-matrix changes — each entry linking into Audit & Change History for detail. Framed to the Owner as "here's your current configuration," not as something to act on from this page.

### Report visibility control
Owner decides which of their own staff roles see which report tabs above (a small, separate multi-select per tab: "Branch Manager can see Branch Comparison: yes/no", etc.) — same narrow finance-style permission slice as Pricing's "Who Can Handle Money," scoped to `reports.*` keys, same lock-respecting behavior.

### Report permissions must affect (not just this page)
Which nav items appear for other roles, which widgets render on their own dashboards, whether drill-down is available, whether export is offered (further gated by Super Admin's "Allowed Exports" limit), and what the underlying API actually returns — a role without visibility into Finance Summary gets a 403 if they somehow hit that endpoint directly, not just a hidden tab.

---

## PAGE: Audit & Change History

### Purpose
Everything that changed about this workshop, who changed it, and why — whether the actor was Super Admin (design/permissions) or the Owner themself (their own remaining pages).

### Access
Permission: `audit.own_tenant.view`.

### Layout
Filterable table: Actor (with a chip distinguishing **Platform** vs **This Workshop**), Action, Target, Before → After (expandable inline diff, not a separate page), Reason, Timestamp (workshop's own timezone), Risk Level, Rollback (button where eligible).

**Filters:** actor type, category (Permission / Scope / Builder / Pricing / Forms / Messages / Staff / Workflow Policy), risk level, date range.

### Rollback availability differs by actor
- Entries authored by **Super Admin** (Builder Control publishes, Control Center governance changes) show a Rollback button only if the underlying Control Center action was itself rollback-eligible (per the rules already specified in the Platform Super Admin doc) — clicking it deep-links into Control Center rather than performing the rollback from this page directly, since rollback there is itself a governed, audited action requiring Super Admin's own session.
- Entries authored by **the Owner's own pages** (a price edit, a message template edit, a form-field archive) show a lighter **Restore previous value** action, since those pages save directly without the full pipeline — restoring just re-applies the prior value as a new direct save, itself newly audited, not a special "undo" that erases the intervening history.

---

## PAGE: Owner Home

### Purpose
The Owner's landing page — a health/status dashboard, not a workspace. Built last among Owner's pages because every card links out to something that must already exist to be meaningful.

### Access
Permission: `dashboard.owner.view` (effectively everyone with the Owner/Tenant Admin role, since this is their default landing page).

### Cards
- **Workshop status** (Tenant.status badge, matches what Super Admin's Tenant Status control shows).
- **Active branches / Active users** (counts, link to Organization & Access).
- **Open Work Orders** (count, link to a company-wide Work Orders view — read-only summary; actually working a Work Order is Branch Manager/Technician territory).
- **Waiting customer approvals / Waiting parts / Payment pending** (counts, each linking to the relevant cross-branch summary).
- **Low stock** (count of items at or below threshold, across all this workshop's warehouses, link to an inventory summary).
- **Configuration warnings** (e.g. "Team Leader review is enabled but no Team Leader is configured" — surfaced here as awareness even though fixing it happens in Organization & Access or is Super-Admin's Workflow Policy to adjust).
- **Builder draft status** (read-only: "Super Admin has a draft configuration for this workshop, not yet published" — informational only, no publish action lives here).
- **Workflow health alerts** (pulled from the same workflow-health diagnostic the platform itself uses, filtered to this tenant).
- **Recent changes** (last 5 Audit & Change History rows, both actor types, "View all" link).

Every card is a link, not an action — Owner Home tells the Owner what's true right now and where to go to do something about it; it never has its own buttons that mutate data.
