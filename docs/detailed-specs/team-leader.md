# Team Leader — Detailed Page Specifications

> Status: **COMPLETE.** Derived fresh from `docs/PRODUCT_SPEC_CANONICAL.md`, cross-checked against the Phase 0 schema.
>
> **The one thing to get right above all else in this role:** the gap analysis of the previous build found Team Leader had been given exactly the one capability the spec explicitly forbids it (QC pass/reject) while missing the pages it actually needs. This document is written to make that mistake structurally hard to repeat — nowhere below does Team Leader gain a maintenance-decision action, and every "Forbidden" item is a real, absent permission, not a hidden button.
>
> **Scope is `managedTechnicianIds`, not `branchScope`.** Team Leader sees exactly the technicians assigned to them (via `TeamMembership`) and, derived from that, exactly the Work Orders those technicians are currently touching — never a whole branch's worth of data just because it overlaps geographically. A Team Leader managing technicians across more than one branch (possible, since `Team.branchId` is optional and membership is what actually scopes visibility) sees those technicians' work regardless of branch, and never sees a branch-mate's work if that other technician isn't on their team.

---

## PAGE: Team Leader Home

### Purpose
Same triage spirit as Branch Manager's Attention Center and Inventory Home, scoped to managed technicians only.

### Access
Permission: `team.home.view`. Default landing page for this role. If this Team Leader currently manages zero technicians (a freshly-created account before Owner/Branch Manager assigns anyone), every card below renders its honest empty state rather than a blank dashboard: *"You have no assigned technicians yet."*

### Cards
- **My Team** — roster count, tappable into Technicians View.
- **Active Work** — count of in-progress tasks across managed technicians.
- **Blocked Technicians** — count of managed technicians with at least one open blocker on their current task.
- **Waiting Parts** — count of managed technicians' Work Orders currently `WAITING_PARTS`.
- **Waiting Customer** — same, for decision-pending Work Orders.
- **Rework / QC Issues** — count of managed technicians' tasks currently `RETURNED_FOR_REWORK` or Work Orders `QC_FAILED` — **visible, not actionable**; Team Leader can see that a job failed QC and needs rework, and can flag/discuss it, but the pass/reject decision itself was made elsewhere and stays elsewhere.
- **Recent Technician Activity** — a live feed (inspections saved, faults created, parts requested, notes marked supervisor-visible) across the whole managed roster, newest first.

---

## PAGE: Technicians View

### Purpose
The roster — one row per managed technician, with a drill-into-detail drawer.

### Access
Permission: `team.technicians.view`.

### Technician cards
Name, status (Active on a job / Idle / Blocked / Off shift), current task, asset, Work Order, last action (relative time), tasks completed today, open blockers, pending parts, pending decisions, **Open Details** button.

### Details drawer
- Current work (the same Current Job Card shape the technician sees on their own Home, so Team Leader is looking at literally the same summary the technician has, not a reinterpretation of it).
- Actions timeline, inspection activity, parts activity, customer decision activity, blockers — same underlying event feed Branch Manager's Work Order Workspace reads, filtered to this one technician across all their current Work Orders rather than one Work Order across all technicians (the complementary slice of the same data).
- **Internal supervision note** — a note field visible only to Team Leader and, if the workshop's permissions allow, Branch Manager; never visible to the technician themself and never customer-facing. This is explicitly the one place in the product where a note is deliberately hidden *from the person it's about*, which is why it's called out by name here rather than reusing the Technician's own Notes tool.

### Allowed
View activity, add internal supervision note, flag an issue to Branch Manager (a lightweight escalation — creates a notification + optional note, does not itself change any Work Order or task state).

### Forbidden (genuinely absent permissions, not hidden UI)
Complete a task, issue parts, record a payment, make a customer decision, **pass or reject maintenance/QC**. None of `task.complete`, `parts.issue`, `finance.payment.record`, `customer_decision.respond`, `task.review`/`task.return_for_rework` exist in this role's `RolePermission` set. If the (still partially truncated) rest of the canonical spec later assigns QC pass/reject to a specific role, it is **not** Team Leader by default — that decision gets made explicitly when the rest of the spec arrives, not inherited by this role by omission.

---

## PAGE: Vehicles / Work Orders View

### Purpose
Every Work Order currently touched by a managed technician — the Work-Order-centric complement to the technician-centric roster above.

### Access
Permission: `team.workorders.view`. Scope: `WorkOrder`s with an active `WorkOrderAssignment`/`TaskAssignment` to any technician in `managedTechnicianIds` — computed the same way the platform's central scope resolver computes every other role's data boundary, not a bespoke query for this one page.

### Card
Asset, identifier, Work Order number, technician, lifecycle status, task, decision status, parts status, blocker, delivery status, last update — deliberately the same field set Branch Manager's Work Orders board shows, so a Team Leader and a Branch Manager discussing the same job are looking at cards with the same vocabulary, differing only in which jobs each of them sees. **No price, cost, or payment figure anywhere on this card or view** — Team Leader's explicit "no finance" rule, enforced the same way Customer Portal's data is enforced: the field simply isn't in the API response for this role, not hidden client-side after being fetched.

### Lifecycle drawer (per Work Order)
Intake, Inspection, Customer Decisions, Parts & Inventory, Technician Work, Blockers, Quality/Rework Status, Delivery Status — a read-only walk through the same sections Branch Manager's Work Order Workspace has, minus the Invoice/Payment Snapshot section entirely (not present, not present-and-blank) and minus any action buttons (assign/reassign, issue invoice, release delivery) that Branch Manager's version has — this drawer is pure visibility, no controls.

---

## PAGE: Technician Performance Reports

### Purpose
Team Leader's own reporting, scoped to their managed roster only — distinct from Owner's company-wide Reports & Analytics and from Data Analyst's broader (if separately scoped) analytics.

### Access
Permission: `reports.team.view`.

### Reports
Tasks completed, active tasks, average task time, blockers by technician (a small per-technician breakdown, not just a team total — useful for spotting one person consistently blocked versus a systemic issue), rework/returned count, QC issues (count, still not actionable from here), parts requested/used/returned, customer decision requests, diagnostic codes activity, technician comparison table (side-by-side across the managed roster only — never including a technician outside this Team Leader's scope, even for comparison purposes, since that would leak another team's performance data).

### Explicitly absent from this page (per spec, enforced by simply not being in the report-data API response for this role)
No finance figures anywhere. No inventory value (quantities/usage are fine per the reports above — item *cost* or stock *value* is not). No customer private data (names/contact info never appear; a report row references a Work Order/asset identifier, not a customer). No company-wide reports — every number on this page is provably reachable only through the managed-technician scope, the same scope resolver used everywhere else in this role.
