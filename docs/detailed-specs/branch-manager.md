# Branch Manager — Detailed Page Specifications

> Status: **COMPLETE.** Derived fresh from `docs/PRODUCT_SPEC_CANONICAL.md`, cross-checked against the Phase 0 schema. Reuses established conventions (server-side pagination, lock-icon-plus-tooltip for anything Super-Admin/Owner-restricted) by reference.
>
> **Multi-branch Branch Managers:** `StaffUser.branchScope` is an array — a Branch Manager can be scoped to more than one branch (common at a mid-size chain where one manager covers 2–3 nearby locations). Every page below that shows "the branch" actually shows **the currently selected branch from a branch switcher** in the page header, defaulting to the first in scope, persisted per-session. A Branch Manager scoped to exactly one branch never sees the switcher at all — it's simply not rendered rather than rendered-with-one-option, so a small workshop's Branch Manager gets a page that never looks like it's missing something.
>
> **The "cannot" lists in this document are enforced at the permission-guard level, not by hiding buttons** — Branch Manager's `RolePermission` set genuinely lacks `task.*`, `parts.mark_used`, `inventory.stock.adjust`, and platform/owner-configuration keys. Calling the underlying endpoint directly (not through this UI at all) still 403s. This is the one pattern the previous build's gap analysis found *already done correctly*, and it's carried forward deliberately rather than reinvented.

---

## PAGE: Branch Home / Attention Center

### Purpose
Daily operational triage for the Branch Manager's selected branch — "what needs my attention right now," not a general dashboard.

### Access
Permission: `branch.home.view`. Default landing page for this role.

### Cards
Each a count + a one-click filtered view of Work Orders:

- **New / Active Work Orders** — created today or in a non-terminal, non-waiting status.
- **Waiting Customer Decisions** — `CustomerDecisionRequest.status` in (SENT, VIEWED, PARTIALLY_RESPONDED).
- **Waiting Parts** — Work Orders currently `WAITING_PARTS`.
- **Blockers** — open `TaskBlocker` rows across this branch's Work Orders.
- **Critical Rejections** — decision items rejected where `importance = CRITICAL`, needing acknowledgement/follow-up.
- **Rework / QC Failed** — Work Orders currently `QC_FAILED` or Tasks `RETURNED_FOR_REWORK`.
- **Ready for Delivery** — Work Orders `READY_FOR_DELIVERY`.
- **Payment Pending** — Work Orders `PAYMENT_PENDING`.
- **Technician Load** — not a single count but a small per-technician bar list (active task count per technician currently on shift/scoped to this branch) — this is what lets a Branch Manager see at a glance who's free before assigning a new Work Order, and it's the one card whose content genuinely differs in shape between a 2-technician branch (short list) and a 40-technician branch (scrollable, sorted busiest-first, same component either way).
- **Today Intake** — Work Orders created today at this branch.
- **Completed Today** — Work Orders that reached `CLOSED` today.

### Actions available from cards
Open Work Order (from any WO-backed card), Follow Up Customer (deep-links into Approvals & Customer Decisions pre-filtered), Assign/Reassign Technician (opens a lightweight picker inline, doesn't require opening the full Work Order Workspace for a quick reassignment), Escalate Blocker (routes per the Blocker Panel rules already specified for Technician — Branch Manager escalating does the same routing, just from this side), View Waiting Parts (deep-links into a parts-focused filter of Work Orders), View Delivery Readiness (deep-links into Delivery & Payments Status).

### Refresh behavior
Poll every 60 seconds while the page is open (not a websocket — no page on this platform currently requires sub-minute realtime, and a simple poll is one less moving part); a manual refresh control is also present for "I just did something in another tab and want to see it now."

---

## PAGE: Customer Intake

### Purpose
Register a customer, their asset, and the resulting Work Order, in one guided flow — this is the page that creates the data every later phase depends on, which is why it's first in the Branch Manager build order.

### Access
Permission: `customer.intake.create`.

### Wizard

**Step 1 — Find/Create Customer**
Search by phone (primary key for lookup — the most reliable dedup field in this domain) or name. Existing-customer results show name, phone, and asset count so the Branch Manager can confirm it's the right person before selecting. If no match: **Create Customer** inline form (Full Name, Phone, Email optional).

**Step 2 — Find/Register Asset**
Search by plate number (Cars/Motorcycles) or serial number (Heavy Equipment) — the search field's label and placeholder adapt to the workshop's operating category (or, for a workshop that operates more than one category, a category selector appears first). If no match: **Register Asset** inline form, fields adapting to category per the canonical spec's identifier table (plate + VIN/chassis for Cars; plate + chassis/engine for Motorcycles; serial/equipment ID + hour meter/site/fleet/operator for Heavy Equipment).

**Step 3 — Confirm Ownership**
If the found asset's `currentOwnerCustomerId` differs from the customer selected in Step 1, this step is **not skippable** — it shows both parties (current owner name, new customer name) and requires an explicit "Confirm ownership transfer" checkbox plus a one-line reason (sold / gifted / other) before proceeding. This is the UI surface for `AssetOwnershipHistory`'s closed-row/open-row transition already defined in the schema: confirming here closes the old ownership row and opens a new one server-side, in the same transaction as the rest of this wizard's final submit — not as a separate action that could be half-done.
If the asset's current owner already matches the selected customer, this step is skipped entirely (no confirmation needed for "the same person is servicing their own car again").

**Step 4 — Create Work Order**
Fields: priority (Normal/Urgent), customer's stated complaint (free text, becomes the seed for the Technician's Quick Inspection "complaint confirmed" field), any custom Work Order fields Owner has added via Forms & Fields.

**Step 5 — Assign Technician**
Picker scoped to technicians whose branch/category scope covers this branch and this asset's category — a technician who doesn't cover Heavy Equipment simply doesn't appear in the list for a Heavy Equipment Work Order, rather than appearing and failing on assignment. "Assign later" is a valid choice — the Work Order is created in `REGISTERED` status either way; a technician can be assigned from the Work Orders board afterward.

**Step 6 — Communication Preference**
WhatsApp opt-in (default on, since decision links are delivered this way), preferred contact language if the workshop supports more than one, SMS fallback opt-in if configured.

### Submit
One transaction: customer (if new) → asset (if new) → ownership transfer (if applicable) → Work Order → technician assignment (if selected) → `work_order.created` and `technician.assigned` operation events. All-or-nothing, same discipline as Add Workshop Owner.

### Ownership transfer's downstream guarantee
Once transferred, the **new** owner's Customer Portal shows only `SafeTechnicalHistory` entries scoped to their own ownership period going forward (plus any entries explicitly marked visible-to-future-owners, if the product ever adds that distinction) — the previous owner's financial data and any pre-transfer private notes are never reachable from the new owner's account. This is enforced by `AssetOwnershipHistory`'s date-ranged rows, not by a manual redaction step.

---

## PAGE: Work Orders

### Purpose
The branch's operational board — every Work Order at this branch, groupable and filterable.

### Access
Permission: `workorders.branch.view`.

### Layout
**List view by default** (a sortable, server-side-paginated table — chosen over a free-drag kanban board deliberately: status changes are guarded transitions with side effects, `4.` and dragging a card between columns implies a casual "just move it" interaction that doesn't fit a workflow where e.g. moving to `READY_FOR_DELIVERY` requires the delivery-readiness checks to actually pass). A **grouped view** toggle re-renders the same data clustered under status headers (Registered, Under Inspection, Waiting Customer, Waiting Parts, In Progress, Blocked, Ready for Review/QC, Ready for Delivery, Payment Pending, Closed) for a faster visual scan, still read-only groupings — clicking a card always opens Work Order Workspace, where any real status-changing action actually happens through its own guarded control.

### Card / row content
Customer name, asset (with plate/serial as the primary visible identifier per category), technician (avatar + name, or "Unassigned"), lifecycle status badge, parts state summary (e.g. "2 pending"), customer decision state summary (e.g. "1 awaiting response"), payment/delivery state, and a computed **next action** string (e.g. "Waiting on customer decision," "Ready to invoice") — the same next-action language used on the Technician's own cards, so a Branch Manager and a Technician looking at the same Work Order from their different pages see consistent language, not two different vocabularies describing the same state.

### Filters
Status (multi-select), Technician (single-select, "Unassigned" included as an option), Category, date range (created), a quick "Needs my attention" toggle that applies the same criteria as the Branch Home cards combined.

---

## PAGE: Work Order Workspace

### Purpose
Full single-Work-Order view for the Branch Manager — everything about one vehicle's job, in one place, without the ability to do the Technician's or Inventory Manager's actual hands-on work.

### Access
Permission: `workorders.branch.view` (view all sections); individual action buttons additionally gated per the specific permission noted below.

### Sections
- **Summary** — status, priority, created date, branch, category.
- **Customer & Asset** — contact info, asset identifiers, ownership history (read-only here — transfers happen through Customer Intake, not mid-workspace).
- **Assigned Technician / Team** — current assignee, reassign control (permission: `workorders.branch.reassign_technician`).
- **Technician Activity** — read-only feed of what the Technician has logged (inspections saved, faults created, parts requested/used, notes marked customer-visible) — internal-only Technician notes do **not** appear here by default (Branch Manager isn't automatically privy to a Technician's private working notes) unless a note was explicitly flagged for supervisory visibility, mirroring the same visibility discipline the product applies to customer-facing data.
- **Customer Decisions** — every `CustomerDecisionRequest`/item for this Work Order, status, price, decision, timestamps.
- **Parts & Inventory** — every `PartRequest` for this Work Order with its current status label (view-only; Branch Manager cannot mark a part used or adjust stock from here — those actions genuinely don't exist in this section's permission set).
- **Blockers** — open and resolved, with resolve/escalate controls (permission: `workorders.branch.manage_blockers`).
- **QC / Rework** — read-only status; the actual pass/reject action lives with whichever role the (still-to-be-finalized rest of the) spec assigns it, not Branch Manager.
- **Invoice / Payment Snapshot** — running total, locked/issued invoice if one exists, payments recorded — with **Issue Final Invoice** and **Record Payment** buttons shown only if this Branch Manager's role currently has `finance.invoice.issue`/`finance.payment.record` (the Owner-delegatable toggle from Pricing & Financial Configuration, itself bounded by Super Admin's matrix).
- **Delivery Readiness** — the same checklist Delivery & Payments Status shows, embedded here for this one Work Order, with a **Release Delivery** button gated the same way (permission: `workorders.branch.release_delivery`, itself only actionable when every readiness check actually passes — not just permission-gated, also state-gated).
- **Timeline** — the full `OperationEvent`/`AuditLog`/`CustomerTimelineEvent` history for this Work Order, merged into one chronological feed, each entry tagged with which of the three sources it came from (useful for support/debugging, not just narrative).

### Branch Manager cannot (enforced, not hidden)
Execute a technician task, mark a part used, adjust stock directly, edit platform- or owner-level configuration from within this page (there is no such control here to hide in the first place).

---

## PAGE: Approvals & Customer Decisions

### Purpose
Monitor every customer decision request across the branch — follow-up work, not creation (Technicians create the requests; Branch Manager chases responses).

### Access
Permission: `decisions.branch.view`.

### Filters (tabs, each a count badge)
Pending, Overdue (past a configurable no-response window), Approved, Rejected, Critical Rejected, WhatsApp Link Sent (sent but not yet opened), Needs Follow-up (a manual flag a Branch Manager can set on any request).

### Row content
Customer, asset, Work Order, item summary, price, sent date, current status, days pending.

### Actions
- **View decision** — read-only render of exactly what the customer sees/saw (same rendering the public decision page uses, so there's no ambiguity about what was actually shown).
- **Send reminder** — sends the "reminder message" template (from Messages & Templates), logs a new `CustomerTimelineEvent`, resets the "overdue" clock.
- **Add follow-up note** — internal only, never customer-visible.
- **Escalate critical rejection** — only enabled when the item's `importance = CRITICAL` and `decision = REJECTED`; notifies Team Leader (if the role is enabled at this workshop) and flags the Work Order with a persistent banner until acknowledged.
- **Notify technician** — pings the assigned Technician's Home feed that a decision on their Work Order changed.

---

## PAGE: Delivery & Payments Status

### Purpose
The branch-wide view of "what's blocking delivery," across every Work Order approaching that stage — the aggregate version of the single-Work-Order readiness section in Work Order Workspace.

### Access
Permission: `workorders.branch.view` for the list; `workorders.branch.release_delivery` / `finance.invoice.issue` / `finance.payment.record` for the respective action buttons, identical gating to Work Order Workspace.

### Layout
Table of Work Orders in `READY_FOR_QC` through `PAYMENT_PENDING`/`READY_FOR_DELIVERY`, each row showing the same readiness checklist as a set of small status dots (work completed / QC done if enabled / decisions resolved / invoice issued / payment satisfied or policy allows unpaid) so a Branch Manager scans the whole board and immediately sees which Work Orders are one step away versus genuinely stuck.

### Actions
Issue Final Invoice, Record Payment, Release Delivery — same three actions as Work Order Workspace, available here for speed when working through several Work Orders in a row without opening each one individually. Every action here does exactly what the same action does in Work Order Workspace (same service call, same guard, same audit) — this page is a faster way to reach it, not a separate code path.

---

## PAGE: Team Setup

### Purpose
Branch Manager's scoped view of team management — **only reachable if Owner has delegated it**. This is not a Super-Admin-controlled capability (team/people management stayed with Owner in the restructuring — see `docs/detailed-specs/tenant-owner.md`); it's an Owner choice about their own staff structure, made via a permission grant on the Organization & Access page (`team_setup.delegate`, off by default).

### Access
Permission: `team_setup.branch.manage` — a role-permission key that only becomes assignable if Owner has turned on delegation; if not delegated, this page does not appear in Branch Manager's navigation at all (not shown-and-locked).

### Content
Identical capability set to Owner's Organization & Access → Teams tab, but scoped to teams within this Branch Manager's `branchScope`: create team, assign Team Leader (from staff already in that role, scoped to this branch), assign/move technicians, view membership history. Every write here is visible to the Owner in Audit & Change History exactly as if the Owner had done it themselves, tagged with the actual acting Branch Manager as actor — delegation changes *who can act*, never *who's accountable for what happened*.
