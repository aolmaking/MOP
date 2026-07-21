# Version 3 — Technician Simple Execution Mode

## Product Rule

The technician experience must be the simplest experience in MOP.

```text
Many capabilities.
Three pages.
One work screen.
```

## Final Technician Pages

1. Technician Home
   - Current Job
   - Today Jobs
   - Waiting Customer
   - Waiting Parts
   - Rework
   - Quick Service
   - Scan Job as an optional button, not navigation

2. My Work
   - Grouped job cards only
   - Active Now
   - Due Today
   - Waiting Customer
   - Waiting Parts
   - Blocked
   - Returned for Rework
   - Completed Today

3. Work Card
   - Inspect
   - Computer Codes
   - Quick Service
   - Parts
   - Ask Customer
   - Blocker
   - Note
   - History
   - Finish
   - Rework Feedback

## Not Allowed

- No technician reports.
- No billing.
- No users/access.
- No control/settings.
- No inventory admin.
- No direct sale POS.
- No separate Inspection, Parts, Blocker, History, or Customer Decision pages
  for the technician.

## Implemented Foundation

- Technician route matrix now exposes only `technician`, `my-work`, and
  `work-card`.
- The admin sidebar is hidden for technician simple routes.
- `apps/api/src/modules/technician` provides Home, My Work, Work Card, and
  diagnostic code suggestion data.
- Computer Codes supports placeholder diagnostics such as `P0301` with possible
  issue, checks, suggested fix, and video placeholder.
- Quick Service options are controlled by seed Control settings.
- Ask Customer runs from inside Work Card and uses the V2 Customer Decision
  Request API without sending the technician to a separate decision page.
- Work Card action buttons now give immediate feedback and the important
  execution actions call `POST /technician/action` for audit hooks.
- Blocker reporting creates a task blocker and moves the assigned task to the
  blocked state.
- Parts clearly separates `Request` from `Used`, and both actions record
  technician events.
- Home cards open the relevant My Work filter or Work Card panel, and Scan Job
  remains an inline Home action instead of becoming a new page.
- Technician permissions include task execution, inspection, diagnostic code,
  fault, parts request/use, decision request, safe asset history, and QC
  feedback viewing only.
- Technician is explicitly not given invoice issuing, payment, refund,
  inventory admin, supplier order, users, control, reports, direct sale POS,
  tenant settings, or role permission privileges.
- V3 freeze was checked against the Role & Permission Matrix, Scenario Library,
  and Inspection System Architecture references.

## V3 Freeze Rules Before Moving To V4

These rules freeze the Technician experience before Inventory Manager and later
role pages are expanded.

### 1. Technician Has Exactly Three Pages

The only main Technician pages are:

```text
Technician Home
My Work
Work Card
```

Inspection, Computer Codes, Quick Service, Parts, Ask Customer, Blocker, Note,
History, Rework Feedback, and Finish remain drawers/panels inside Work Card.

### 2. Every Technician Action Has An Output

Technician actions must produce structured output for the next owner:

```text
Request Part -> Inventory Manager Queue
Used Part -> Stock movement + running invoice hook
Ask Customer -> Customer Decision Request
Blocker: Waiting Part -> Inventory Manager + Branch Manager
Blocker: Waiting Customer -> Branch Manager + Customer flow
Finish -> Team Leader Review or QC
Computer Code -> Fault / History / Suggested Action
Quick Service -> Work Order update + Parts usage
```

`POST /technician/action` records action output queues in audit payloads so V4
can attach real role queues without changing the technician UI.

### 3. Part Request Contract

Any part request emitted by a technician must follow this contract:

```json
{
  "request_id": "",
  "work_order_id": "",
  "task_id": "",
  "technician_id": "",
  "branch_id": "",
  "category": "",
  "asset_identifier": "",
  "item_id": "",
  "item_name": "",
  "qty": 1,
  "urgency": "normal | high | critical",
  "reason": "",
  "status": "pending_warehouse",
  "requested_at": ""
}
```

Supported lifecycle statuses:

```text
Draft
Requested
Pending Warehouse
Issued
Rejected
Unavailable
Waiting Transfer
Waiting Supplier
Used
Cancelled
```

V3 creates the structured request and, for Used parts, creates the stock
movement hook. V4 owns stock review, transfer, supplier order, and warehouse
operations.

### 4. Computer Codes Are Assistance Only

Computer Codes must never be presented as final diagnosis. The UI labels remain:

```text
Possible issue
Suggested checks
Suggested fix
Video guide placeholder
```

The technician may convert the hint into Fault, Add Part, Ask Customer, or Save
to History.

### 5. Quick Service Cannot Bypass The System

Quick Service can shorten inspection only when the service type and tenant
settings allow it. It still must:

```text
Create or update Work Order record
Record used parts
Respect customer approval if price/decision is needed
Respect payment/delivery gates later
Appear in history
```

### 6. Finish Logic Is A Gate

Finish must block completion when any required dependency is not clean:

```text
Customer decision pending
Part request pending
Open blocker
Required inspection missing
Critical rejected item exists
Time tracking required and incomplete
```

When clean:

```text
Team Leader Review ON -> Send to Team Review
Team Leader Review OFF -> Send to QC
```
