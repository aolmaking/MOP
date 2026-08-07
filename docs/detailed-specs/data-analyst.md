# Data Analyst — Detailed Page Specifications

> Status: **COMPLETE.** Derived fresh from `docs/PRODUCT_SPEC_CANONICAL.md`, cross-checked against the Phase 0 schema.
>
> **The mistake this document is written to avoid:** the previous build's gap analysis found all 7 of this role's routes rendering the *same* generic component against a *single* backend endpoint, distinguished only by a page-title string — not 7 analytical views, one view wearing different hats. Every page below has its own real query shape and its own reason to exist as a separate page, not a shared component with a different label.
>
> **Scope:** read-only, always. Not one control, button, or write action exists anywhere in this role. Scope (company-wide vs. specific branches/categories) is set via `StaffUser.branchScope`/`categoryScope` at invite time (Organization & Access) exactly like any other role — a Data Analyst is not automatically company-wide just because their role has no operational duties; an unscoped Data Analyst sees everything, a scoped one sees only their assigned slice, and every page below actually enforces that rather than assuming company-wide by default.

---

## PAGE: Analytics Home

### Purpose
Orientation — a cross-section of the other 6 pages' headline numbers, so a Data Analyst opening the product for the day knows where to look first.

### Access
Permission: `analytics.home.view`. Default landing page for this role.

### Content
One summary tile per other page in this role (Operations, Technician & Team, Inventory, Customer Decision, Feature Adoption), each showing 2–3 headline metrics and linking into that page's full view. Below the tiles, a small "Saved Views" shortcut list (see the Saved Views page) for quick access to whatever this analyst has pinned.

---

## PAGE: Operations Analytics

### Purpose
Work Order flow and throughput — the operational pulse of the workshop(s) in scope.

### Access
Permission: `analytics.operations.view`.

### Content
- Work order volume over time (created vs. completed, chart, selectable date range).
- Status-distribution snapshot (how many Work Orders currently sit in each of the 16 lifecycle statuses — a real distribution, not a single "active count").
- Average time-in-status per stage (where is time actually being spent — e.g. average hours in `WAITING_PARTS` vs. `AWAITING_CUSTOMER_APPROVAL`, a genuinely different question than a simple completion count).
- Branch comparison (only rendered with its comparative layout if scope includes more than one branch — same scale-aware pattern as Owner's Reports & Analytics).
- Blocker analysis (frequency by reason, from the same 7 canonical blocker reasons, across scope).
- Delivery/payment funnel (how many Work Orders reach `READY_FOR_DELIVERY`, and of those, how many actually reach `CLOSED`, and the average gap between the two — a distinct question from Finance's own reporting, since this page never shows a currency amount, only counts and durations).

---

## PAGE: Technician & Team Analytics

### Purpose
People-and-throughput analysis at a level Team Leader's own (managed-roster-only) reports don't reach — this page is genuinely company-wide-or-scoped, not limited to one Team Leader's roster.

### Access
Permission: `analytics.people.view`.

### Content
Per-technician: tasks completed, average task time, rework rate, blocker frequency — aggregated across every technician in scope, not one manager's team. Per-team: team-level throughput comparison. Diagnostic code activity (which codes/faults recur most, a genuinely different lens than Operations Analytics' status-flow view). This page explicitly **does not** show payment or invoice figures tied to a technician — "who generates the most revenue" is a Finance-adjacent question this role's data boundary doesn't cross, consistent with the same no-finance discipline Team Leader observes, just at a wider scope.

---

## PAGE: Inventory Analytics

### Purpose
Stock and consumption analysis, company-wide-or-scoped (distinct from Inventory Manager's own operationally-focused Reports & Stock Insights, which is about *managing* stock; this page is about *understanding trends* in it).

### Access
Permission: `analytics.inventory.view`.

### Content
Consumption trends by item/category over time, stock-risk forecasting (same forward-looking velocity logic as Inventory Manager's own stock-risk report, here viewable across every warehouse in scope rather than one Inventory Manager's assignment), returns/damage rate trends, branch/warehouse comparison (same scale-aware rendering rule as everywhere else — a one-warehouse scope doesn't render a comparison chart with one bar). Inventory *value* (cost × quantity) is shown only if this Data Analyst's permissions additionally include cost visibility — the same gate Inventory Manager's own catalog cost field uses, applied here identically rather than as a separate rule to maintain.

---

## PAGE: Customer Decision Analytics

### Purpose
How customer decisions actually play out — approval/rejection patterns, response time, the effectiveness of the WhatsApp-link flow itself.

### Access
Permission: `analytics.decisions.view`.

### Content
Approval vs. rejection rate (overall, and broken out by importance level — critical-severity items likely have a different approval pattern than routine ones, and this page is where that's actually visible), average response time (sent → responded), overdue rate, critical-rejection frequency and its downstream outcome (does a critical rejection typically end in the customer eventually approving after follow-up, or not — a genuinely useful operational signal), link-open rate (sent vs. viewed). **No customer name, phone, or other identifying detail anywhere** — every row here is a decision record referenced by Work Order/item, never by the customer behind it, the same privacy discipline Platform Reports applies at the platform level, applied here at the tenant level.

---

## PAGE: Feature Adoption Analytics

### Purpose
Which of this workshop's *own* enabled features/modules staff actually use — the tenant-level counterpart to Platform Reports' cross-tenant Feature Usage section (section B there), but scoped to one workshop and available to that workshop's own Data Analyst, not just the platform operator.

### Access
Permission: `analytics.feature_adoption.view`. This page did not exist at all in the previous build — flagged here explicitly since it's a genuinely new capability, not a refinement of something that already worked.

### Content
One row per feature/module currently enabled for this workshop (per Super Admin's Builder Control settings, read here, not editable): usage count this period, trend, and — mirroring the cross-referencing idea from Platform Reports — a feature that's enabled but shows zero usage is flagged distinctly from one that's simply disabled (disabled features don't appear on this list at all, since "adoption" of something unavailable isn't a meaningful question). Quick Inspection usage, Quick Service usage, Customer Decision Request volume, Builder-configured custom field usage (which of Owner's Forms & Fields additions actually get filled in versus sit empty), Message template usage.

---

## PAGE: Saved Views / Exports

### Purpose
Persistence for this analyst's own filtered/configured views of the pages above, and the export mechanism.

### Access
Permission: `analytics.saved_views.manage` for saving; `analytics.export` (separately, since a workshop's plan may allow viewing but not exporting — ties to Super Admin's "Allowed Exports" limit) for the export action.

### Saved Views
From any of the 5 analytical pages above, a **Save this view** action captures the current filter/date-range/chart-configuration state as a named, re-openable entry (distinct from the old build's ad hoc client-side CSV blob, which had nothing persisted or nameable). Saved views list: name, source page, created date, **Open** / **Rename** / **Delete**. Deleting a saved view removes only the saved configuration, never the underlying data.

### Exports
From any page (subject to the export permission and whatever specific categories Super Admin's Limits & Entitlements allows for this workshop's plan), an **Export** action generates a file (CSV to start; format is an implementation choice for whichever phase actually builds this, not fixed by this spec) reflecting exactly the currently-filtered view — never a silent "export everything" that ignores the filters currently applied on screen.
