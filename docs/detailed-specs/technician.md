# Technician — Detailed Page Specifications

> Status: **COMPLETE.** This is the largest single role in the product — the operational heart, per the rebuild plan — so this document goes deeper than the others, tool-by-tool inside Work Card. Derived fresh from `docs/PRODUCT_SPEC_CANONICAL.md`, cross-checked against the Phase 0 schema.
>
> **Hard constraint restated up front because it shapes every page below:** exactly 3 pages, no admin sidebar, no payment recording, no final invoice, no inventory admin, no reports except a personal summary. The Angular route guard and the nav component must make this structurally true (the shell that renders the sidebar for every other role does not render at all under `/technician`, `/my-work`, `/work-card` — see Phase 1's app-shell spec), not just a matter of this role's pages not linking anywhere else.
>
> **Mobile/tablet-first:** every layout below assumes a touch target ≥44px, single-column-first responsive layout, and is designed to be fully usable one-handed while standing next to a vehicle — this is not a desktop admin tool with a responsive breakpoint bolted on.

---

## Lifecycle Strip (shared component, appears on Home, My Work cards, and Work Card's sticky header)

`Intake → Assigned → Inspection → Approval → Parts → In Progress → Review/QC → Invoice/Payment → Delivery`

Each stage renders as a segment; the current stage is highlighted, completed stages are checked, and — critically — **the strip is computed server-side from the Work Order/Task's actual state** (status, decision state, parts state, blocker state), not a client-side guess. The same computation backs the strip wherever it appears, so a technician never sees Home say "Parts" while Work Card says "In Progress" for the same job.

---

## PAGE: Technician Home

### Purpose
Answer "what do I do right now" the instant the page loads — this is the landing page, and for a technician mid-shift it needs to answer that question without any navigation.

### Access
Permission: `task.view_assigned`.

### Content
- **Current Job Card** — the technician's most urgent/active assignment (computed: in-progress work takes priority over not-yet-started; ties broken by due time): asset, plate/serial, Work Order number, current task, lifecycle stage, next action, blocker (if any), **Open Work Card** button.
- **My Work** summary tile — total count, links to the My Work page.
- **Needs Inspection / Waiting Customer / Waiting Parts / Blocked** — count tiles, each a filtered shortcut into My Work.
- **Returned for Rework** — count tile, visually distinct (warning color) since this needs prompt attention.
- **Quick Service / Quick Inspection** shortcut — starts a new quick flow without first navigating into a specific existing Work Order (for walk-in quick jobs that don't need the full Customer Intake wizard — Branch Manager still owns formal intake, but a technician can trigger a Quick Inspection against an already-registered vehicle standing in front of them right now).
- **Scan Vehicle / WO** — camera-based barcode/QR scan (plate sticker or Work Order tag) that jumps straight to that Work Order's Work Card if it's assigned to this technician, or shows a clear "Not assigned to you" message with an option to notify the Branch Manager if it's assigned to someone else (never silently opens someone else's job).

---

## PAGE: My Work

### Purpose
Every job assigned to this technician, grouped by what state it's actually in — this is the page a technician checks between jobs, not a general list to search.

### Access
Permission: `task.view_assigned` (same as Home; results are inherently scoped to `assignedTo = current technician`, there is no "view other technicians' work" mode anywhere in this role).

### Groups (tabs or collapsible sections, technician's choice via a display preference — not a spec-mandated layout, but each group must be independently collapsible so a technician with 20 active jobs can focus)
Active Now, Needs Inspection, Due Today, Waiting Customer, Waiting Parts, Blocked, Returned for Rework, Ready to Finish, Completed Today.

### Each job card
Asset, identifier (plate/serial per category), Work Order number, task title, lifecycle stage (strip, condensed), next action, customer decision state (small badge), parts state (small badge), blocker state (small badge if any), **Open Work Card** button. No card in this role ever shows a price or cost figure — that's Work Card's Services/POS concern, gated separately, never leaked into a summary card.

---

## PAGE: Work Card

### Purpose
The execution command center for one vehicle — everything a technician does for a single Work Order happens through this page's tools.

### Access
Permission: `task.view_assigned` for view; each tool below has its own more specific permission for its actions, listed per tool.

### Sticky header (always visible while scrolling any tool below)
Asset, identifier, Work Order number, current task title, lifecycle stage (strip), **next required action** (plain language, e.g. "Waiting on customer approval for brake pads"), blocker state (badge, tappable to jump to Blocker Panel), finish readiness (a small traffic-light indicator — green only when Finish Panel's checklist is fully clear).

### Tool tabs
Inspect, Quick Inspection, Codes, Services / POS, Parts, Ask Customer, Blocker, Notes, History, Finish. Rendered as a horizontally-scrollable tab bar on mobile width, a sidebar on tablet/desktop width — same components, responsive layout only.

---

### Tool: Quick Inspection

**Purpose:** fast triage, not a full diagnostic pass — this is usually the first thing a technician does on a new assignment.

**Access:** `inspection.quick.create`.

**Fields:**

| Field | Type | Notes |
|---|---|---|
| Complaint confirmed | yes/no | Against the customer's stated complaint from Customer Intake, shown alongside the field for reference |
| Odometer / Hours | number | Label and unit adapt to category (odometer for Cars/Motorcycles, hour-meter reading for Heavy Equipment) |
| Quick visual condition | select (Good / Fair / Poor) | |
| Warning lights / visible issues | multi-select checklist + free text | Checklist options are category-specific (a Heavy Equipment checklist differs from a Car's) |
| Leak / safety concern | yes/no, with a required note if yes | |
| Category-specific checklist | dynamic, from `TenantConfiguration.forms` custom fields for this form + category | This is exactly where an Owner-added custom field like "Battery Voltage" (see Tenant Owner spec) appears automatically |
| Technician note | textarea | Internal by default — see Notes tool for the visibility toggle |
| Recommended next step | select, drives the Outputs below | |

**Outputs (each a distinct action, not a single generic "Save"):**
- No issue found → closes this inspection pass, Work Order can proceed toward Finish if nothing else is pending.
- Proceed to quick service → opens Services/POS pre-scoped to quick-service items.
- Create fault → opens a fault-creation form (name, description, severity, recommended service) pre-filled from this inspection's findings.
- Full inspection required → flags the Work Order and surfaces the Inspect tool as the recommended next tab.
- Add service/part to quotation → jumps to Services/POS.
- Ask customer approval → jumps to Ask Customer, pre-filled with whatever was just flagged.
- Report blocker → jumps to Blocker Panel.

Every output writes an `inspection.saved` operation event regardless of which output was chosen — the choice determines what happens *next*, not whether this inspection pass itself gets recorded.

---

### Tool: Inspect (Full Inspection)

**Purpose:** the deep diagnostic pass, when Quick Inspection isn't enough.

**Access:** `inspection.full.create`.

**Content:**
- Category-specific checklist (a longer, structured version of Quick Inspection's — every item has a status: OK / Needs Attention / Critical / Not Checked / Not Applicable).
- **Faults** — one or more, each with severity (Low/Medium/High/Critical), a photo-attachment placeholder (file upload UI exists; actual storage/CDN integration is a later concern, flagged as placeholder consistent with the canonical spec's own "photos placeholder" note), and whether it needs customer approval (default: yes for anything above Low severity, technician can override with a reason).
- **Diagnostic codes** — free entry or picked from the Codes tool's lookup (see below), attached to a specific fault.
- **Recommended services / parts** — line items that become the seed for Services/POS and Ask Customer, so a technician doesn't have to re-type a recommendation they just diagnosed.

Saving a Full Inspection emits `inspection.saved` plus one `fault.created` event per fault recorded.

---

### Tool: Codes

**Purpose:** diagnostic trouble code lookup, attached to a fault.

**Access:** `inspection.codes.view`.

**Content:** search/lookup against the platform's diagnostic-code reference table (seeded platform-wide, not per-tenant — a P0301 misfire code means the same thing at every workshop), returning code, description, and typical affected system. Selecting a code attaches it to the current fault (from Inspect) or, if reached standalone from Quick Inspection's "create fault" output, creates a new fault with that code pre-attached. Codes with no reference-table match can still be entered as free text, flagged `unverified` rather than rejected — a technician's real-world diagnosis shouldn't be blocked by an incomplete reference table.

---

### Tool: Services / POS

**Purpose:** the Technician's own Work Order POS — adding billable items to the current Work Order. Explicitly **not** a cashier POS; nothing here takes a payment.

**Access:** `finance.running_invoice.add_line` (not automatically granted — see the Tenant Owner Pricing page's "Who Can Handle Money" note; this specific permission is about adding *line items*, distinct from issuing an invoice or recording payment, which stay firmly out of this role regardless of any Owner delegation).

**Adding an item:** search the workshop's Service Catalog (from Pricing & Financial Configuration), or a package. Each line: name, type, quantity, unit price (**only if** `FinanceConfiguration.technicianPriceVisible` is true for this workshop — see below), labor price (same gate), total (same gate), whether customer approval is required for this line (defaults from the item's own configuration, e.g. anything above a threshold or category defaults to "needs approval"), stock requirement (if it's a part, this triggers the Parts Panel flow rather than being addable as a simple line), status.

**Price visibility:** when `technicianPriceVisible` is false, every price/total field on this tool renders the literal text **"Price hidden by workshop settings."** instead of a number — not blank, not zero, that exact string, so a technician never mistakes "hidden" for "free." The technician can still add the line item (name, quantity) without seeing its price; approval and pricing happen through Ask Customer / Branch Manager regardless. Cost and margin are never sent to the frontend for this role under any configuration — this isn't a visibility toggle at all, it's simply never in the API response this role's endpoint returns.

Adding a line writes to `RunningInvoiceLine` (not `InvoiceLine` — that only exists after final issuance, which this role can never trigger) and updates the Work Order's running total, visible to Branch Manager and (once approved) the customer, live.

---

### Tool: Parts Panel

**Purpose:** the technician's side of the parts request lifecycle — request, track, use, or return.

**Access:** `parts.request.create` to request; view-only for the rest of the lifecycle, which Inventory Manager drives from their side.

**Sections:** Search / Add Part, Requested Parts, Issued / On the Way, Arrived / Received, Used, Return Unused, Returned / Rejected.

**Status labels shown to the technician** (mapped from the real `PartRequestStatus` enum's more granular internal values to these plain-language labels — the mapping itself is a small, explicit lookup table, not left to each frontend call site to reinvent):

| Internal status | Technician-facing label |
|---|---|
| `DRAFT`, `REQUESTED`, `WAREHOUSE_REVIEWING` | Pending |
| `APPROVED` | Approved |
| `ISSUED`, `IN_TRANSIT` | On the way |
| `ARRIVED` | Arrived |
| `RECEIVED_BY_TECHNICIAN` | Received |
| `USED` | Used |
| `RETURN_REQUESTED` | Return Pending |
| `RETURN_ACCEPTED`, `RETURNED_TO_STOCK` | Returned |
| `RETURN_REJECTED` | Rejected |
| `REJECTED` | Rejected |
| `UNAVAILABLE`, `WAITING_TRANSFER`, `WAITING_SUPPLIER` | Unavailable |
| `RETURN_CLARIFICATION_REQUESTED` | Return — Clarification Needed (with the Inventory Manager's question shown inline; technician can respond directly from this card rather than needing a separate page) |

**Rules enforced (not just documented — these are literal state-machine guards):**
- Requested is not Used — there is no direct UI path from "Requested" to "Used"; the states between must actually be traversed.
- Arrived means the technician has physically received it (a separate confirmation tap from "Issued" — the system doesn't assume delivery equals receipt).
- Used means installed/consumed — marking Used is a distinct, deliberate action (confirms quantity used, which may be less than quantity received for a multi-unit request), and it's what causes the running invoice line for that part to finalize its quantity.
- **Return Unused** creates a `PartReturnRequest`; the technician's stock does not decrease and the warehouse's available stock does not increase until Inventory Manager accepts it — from the technician's side, this state (Return Pending) can sit for a while, and that's expected, not a bug to work around.
- **Finish Gate blocks** if any part is `RECEIVED_BY_TECHNICIAN` (Received) but neither `Used` nor has an open Return request — see Finish Panel.

---

### Tool: Ask Customer Panel

**Purpose:** turn a recommended item/service/labor into a real customer decision request — the technician-facing half of the platform's signature WhatsApp-decision-link flow.

**Access:** `customer_decision.create`; **sending** it is `customer_decision.send`, which per Owner's Configuration example may be revoked for Technician at a given workshop (in which case this tool still lets the technician build the request, but the final Send action is replaced with "Send for Branch Manager review," which creates the request in a pending-review state instead of dispatching it — same form, different terminal action, driven entirely by which permission this technician actually holds).

**Fields per item:** item/service/labor (pulled from Services/POS or Inspect's recommendations, or added fresh here), customer-facing explanation (plain language — this is what the customer reads, deliberately separate from any internal technical note), importance (Low/Medium/High/Critical), price (subject to the same `technicianPriceVisible` gate as Services/POS — a technician who can't see the price can still send a request; the customer always sees the price regardless of what the technician can see, since price visibility is a *staff* configuration, not a customer one), labor, total, a generated customer-facing message preview (rendered from the workshop's Messages & Templates decision template — **not** a hardcoded string; see the Tenant Owner Messages spec's explicit architectural commitment on this point).

**Send:** generates the `CustomerDecisionRequest` + items, a `secureToken`, renders the WhatsApp message from the template, and (once real delivery integration exists) sends it — until then, surfaces the generated link for the technician to share manually, clearly labeled as such rather than silently pretending to have sent something.

**Creates/updates, atomically:** the `CustomerDecisionRequest` itself, a `CustomerTimelineEvent` (customer-safe projection of "we've sent you a decision to review"), Branch Manager's Approvals view (new pending row), this technician's own Work Card (shows the pending request), Team Leader's lifecycle view if enabled, the Running Invoice (a pending-approval line, not yet finalized), Reports, and Audit.

---

### Tool: Blocker Panel

**Purpose:** report why work can't continue right now, and get it routed to whoever can actually unblock it.

**Access:** `blocker.report`.

**Reasons (exactly these 7, matching the canonical spec verbatim):** Waiting Part, Waiting Customer, Need Team Leader, Tool Missing, Safety Issue, Unclear Diagnosis, Other (free-text required if Other).

**Routing (server-side, on report):**
| Reason | Routed to |
|---|---|
| Waiting Part | Inventory Manager + Branch Manager + Team Leader (if enabled at this workshop) |
| Waiting Customer | Branch Manager |
| Need Team Leader | Team Leader (if disabled at this workshop, falls back to Branch Manager with a note explaining the fallback, rather than routing to nobody) |
| Tool Missing | Branch Manager |
| Safety Issue | Branch Manager + Team Leader, marked urgent (distinct visual treatment on their receiving end — not just another list row) |
| Unclear Diagnosis | Team Leader if enabled, else Branch Manager |
| Other | Branch Manager |

A blocker stays open until explicitly resolved (by whoever it was routed to, or by the technician marking it resolved once the underlying issue is actually gone — e.g. the part arrived). **Finish Gate blocks while any blocker on this Work Order is open**, regardless of reason.

---

### Tool: Notes

**Purpose:** free-text notes on the Work Order, with an explicit internal-vs-customer-visible choice per note — never an accidental leak in either direction.

**Access:** `notes.create`.

**Fields:** note text, visibility toggle (**Internal** — default, never leaves staff view; **Customer-visible** — routes through Customer-Safe Projection exactly like any other customer-facing event, producing sanitized `CustomerTimelineEvent` text, not the raw note verbatim, consistent with the platform-wide rule that customers never see raw internal text).

---

### Tool: History

**Purpose:** everything that's happened on this Work Order so far, from the technician's own vantage point.

**Access:** `task.view_assigned` (same as the page itself — no separate permission, since this is just a different view of data the technician can already see elsewhere, consolidated).

**Content:** merged timeline of inspections, faults, parts activity, decision requests/responses, blockers, notes (internal notes shown to the technician who wrote them and to any technician also assigned; customer-visible notes shown as what the customer saw) — same underlying event log Branch Manager's Work Order Workspace Timeline reads, filtered to what this role is allowed to see.

---

### Tool: Finish Panel / Finish Gate

**Purpose:** the gate, not a button — this is where "is this job actually done" gets decided by the system, not by the technician's own judgment alone.

**Access:** `task.finish_attempt`.

**Checklist (every item computed live from real current state, not cached from when the tab was opened):**
- Inspection completed
- Required faults handled (every fault marked `customerApprovalRequired` has either been approved-and-completed or explicitly declined-and-acknowledged)
- Customer decisions resolved (no `PENDING`/`SENT`/`VIEWED`/`PARTIALLY_RESPONDED` requests remain open)
- Approved work completed (every approved line item is either delivered/used or explicitly noted as not-applicable)
- Parts used or returned (no part sitting at Received with neither Used nor an open Return)
- No pending return (no `RETURN_REQUESTED` awaiting Inventory Manager)
- No open blocker
- Required notes completed (if the workshop's Workflow Policy marks specific note fields required — this is a real, evaluated check here, not a hardcoded pass)
- Time tracking completed if required (same — evaluated against actual logged time when the workshop's policy requires tracking, not hardcoded)

**If blocked**, each failing item shows its own specific, plain-language reason (not a generic "cannot finish" banner) with a **Fix** button that deep-links straight into the exact tool that would resolve it — e.g. "Part received but not used or returned" links directly into Parts Panel, scrolled to the specific offending item.

**If clear:** Finish transitions the Task (and, once every task on the Work Order is finished, the Work Order itself) forward — to `READY_FOR_TEAM_REVIEW` if this workshop's Workflow Policy requires Team Leader review, otherwise directly to `READY_FOR_QC` (or further, if QC itself isn't required either) — the same Workflow Policy read that gates the "Team Leader Review" toggle's validity against whether Team Leader is even enabled at this workshop (see Super Admin's Builder Control spec).

**Read-only delivery status**, shown below the checklist once Finish succeeds: Waiting QC → Ready for Invoice → Payment Pending → Ready for Delivery → Closed — the technician can always see where their finished job stands afterward, without any control to change it.

**Technician cannot, from anywhere in Work Card:** issue a final invoice, record a payment, release delivery, or close the financial workflow — none of those actions exist in this role's permission set or anywhere in this UI.
