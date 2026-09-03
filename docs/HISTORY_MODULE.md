# The History Module — the workshop's operational memory

> **Status:** built, tested through the real HTTP stack against real
> Postgres, and exercised in the browser against real records.
> Claims below are labelled `[VERIFIED]` (a passing test or an observed
> browser run names it), `[BUILT]` (shipped, not separately proven), or
> `[DEFERRED]` (deliberately not done, with the reason).

History is not the audit log, not the live journey, and not a list of old
work orders. It is the answer to *"what has ever happened to this
customer and this vehicle"* — and it is the same truth projected three
ways for three people who need different halves of it.

---

## The five concepts, kept apart

MOP has five things that all sound like "history", and merging any two of
them loses a question somebody actually asks:

| Concept | Question | Where |
|---|---|---|
| **Owner History** | "Show me everything that happened." | `/owner/history` |
| **Technician History** | "What do I need to know before I decide?" | inside `/tech/card/:id` |
| **Customer History** | "Show me the safe history that is mine." | `/customer/history` |
| **Live Journey** | "Where is this job right now?" | the workflow strip, every role |
| **Audit & Changes** | "Who changed the system, and why?" | `/owner/audit` |

Before this module the Owner rail pointed the word *History* at
`/owner/audit`. That is now `Audit & Changes`, and History is its own
page. `[VERIFIED]` — `history.http.spec.ts` asserts both surfaces still
answer independently.

---

## One truth, three projections

There is **no history table**. Nothing is copied into a reporting store
that could later drift from the records it came from. Every field is read
from the system that owns it:

```
Customer ─┐
Asset ────┼─► WorkOrder ──► OperationEvent      (chronology, complaint)
          │             ├─► Inspection ──► Fault (what was found)
          │             ├─► CustomerDecisionRequest ──► CustomerDecisionItem
          │             │        └─► Task.decisionItemId   (what was DONE about it)
          │             ├─► Task ──► TaskBlocker
          │             ├─► WorkOrderPartLine ──► PartRequest ──► IssuedItem
          │             ├─► RunningInvoice / Invoice ──► InvoiceLine, Payment
          └─────────────┴─► AssetOwnershipHistory        (whose history it is)
```

`WorkshopHistoryService`
(`apps/api/src/systems/operations/history/workshop-history.service.ts`)
owns the read. It is a **read layer and nothing else**: it never writes,
never decides a status, never recomputes money. `WorkOrder.status` is
read and never reinterpreted, so History is not a second lifecycle.

**The complaint has no column.** It lives in the `work_order.created`
`OperationEvent` payload, and is read back by
`AssetHistoryService.complaintText` with a JSONB-filtered query so
Postgres does the elimination. `[BUILT]`

---

## The recommendation truth model

This is the part that is easy to get quietly wrong, so it is its own
file with its own tests:
`apps/api/src/systems/operations/history/recommendation-outcome.ts`.

**A recommendation is never "completed" because it was recommended,
approved, planned, or billed.** The evidence chain is:

```
CustomerDecisionItem   what the customer was offered, and answered
  └─► Task.decisionItemId   what the workshop planned in response
        └─► Task.status     what the workshop actually finished
```

The middle link **did not exist before this module**. Without it the only
way to connect an approval to the work was to compare free text, which is
how a history starts lying. `Task.decisionItemId` was added in migration
`20260903120000_task_decision_item_link`.

### The outcomes

| Outcome | Reached when | Label |
|---|---|---|
| `AWAITING_CUSTOMER` | item PENDING, request live | Awaiting the customer |
| `DECLINED` | item REJECTED | Customer declined |
| `EXPIRED` | PENDING, `expiresAt` passed, never answered | Expired without an answer |
| `CANCELLED` | PENDING inside a cancelled request | Cancelled before an answer |
| `APPROVED_NO_WORK_LINKED` | approved, no task links to it | Approved - no work linked |
| `APPROVED_PLANNED` | approved, task(s) exist, none started, job open | Approved - planned, not started |
| `APPROVED_IN_PROGRESS` | approved, a task is IN_PROGRESS | Approved - work in progress |
| `PARTIALLY_PERFORMED` | some linked tasks DONE, others outstanding | Partially performed |
| `PERFORMED` | every linked task DONE (cancelled ones don't count against it) | Performed |
| `NOT_PERFORMED` | approved, task(s) exist, none done, job ended | Not performed |

Every outcome ships the **evidence** that produced it — a list of
`{at, text}` facts, each dated from the record or explicitly `null`.
Nothing in this module dates a historical fact "now". `[VERIFIED]` —
`recommendation-outcome.spec.ts` (11 cases) and
`history.http.spec.ts`.

`APPROVED_NO_WORK_LINKED` is the honest answer for records created before
the link existed. It is deliberately **not** a guessed `PERFORMED`.

### A note on reachability

A workshop running the `approved_work_completed` finish gate **cannot
reach `NOT_PERFORMED` by simply closing a job** — the gate refuses to
finish while approved work is outstanding, which is the capability
engine doing exactly its job. In that shape the reachable state is
`APPROVED_PLANNED`, and the car stays visibly open. `NOT_PERFORMED` is
reachable (and proven) in shapes without that gate. `[VERIFIED]` —
observed on the Apex demo tenant, proven in `history.http.spec.ts` under
`LAUNCH_PROFILE`.

---

## Owner History

**Route:** `/owner/history` · **Permission:** `history.workshop.view`
(module `OPERATIONS`), granted by default to `TENANT_OWNER` and
`TENANT_ADMIN` only.

### The index — `GET /api/v1/owner/history`

One row per **customer + vehicle pair**, because that is the historical
identity a workshop reasons about: a customer with three vehicles has
three histories, and a vehicle that changed hands has two.

Every customer and vehicle that has **ever** been through the workshop is
listed, including ones that came once and never returned. There is no
filter to "active" anything. `[VERIFIED]`

Aggregated in Postgres — search, filter, sort and paging all in one
statement — because a workshop open five years has tens of thousands of
work orders and this must stay a page-sized read.

- **Search** over customer name, phone, plate, VIN and serial.
- **Filter** by activity: everyone / in the workshop now / nothing open.
  Applied as `HAVING`, not `WHERE`, so a relationship's visit counts stay
  whole.
- **Sort** by customer, plate, visits, last visit, first visit,
  outstanding. Sort keys come from a server-side whitelist and are the
  only strings interpolated into SQL; an unknown key is refused with a
  400 rather than silently ignored. `[VERIFIED]`
- **Paging** 25/page, capped at 100.

Money (`billedTotal`, `outstanding`) is summed by Postgres and returned
as text. It never becomes a JavaScript number anywhere on this path.

### The record — `GET /api/v1/owner/history/:customerId/:assetId`

Opened from **More** on a row, into a drawer rather than a route so the
owner keeps their place in the list.

Every visit renders the same bands in the same order, so reading the
fourth visit takes no new learning. Bands with nothing in them **say so**
rather than disappearing — "no inspection was recorded" is a fact about
the visit, and a silently missing band reads as a rendering bug.

1. Identity — customer, vehicle, plate/VIN, ownership period, visit count
2. Customer input — the complaint recorded **for that visit**, not the latest
3. Inspection — type, technician, odometer, note, and the stored form fields
4. Findings — description, severity, code, the service recommended then
5. Recommendations — with outcome and evidence
6. Customer decisions — sent / viewed / responded / expires, per request
7. Operations — tasks, status, minutes, blockers, and which recommendation each carries out
8. Parts — provenance, charged, requested → issued → received → used
9. Financial — invoice, lines, discount, tax, total, payments, outstanding
10. Lifecycle — the real status chain from `OperationEvent`
11. Events — the full ordered event list behind the visit

Assembled in a fixed number of queries regardless of visit count.
`[BUILT]`

---

## Technician History

**Where:** inside the existing Work Card at `/tech/card/:id` — a
technician must not leave the job to understand the vehicle.
**Endpoint:** `GET /api/v1/technician/work-orders/:id/vehicle-history`
**Scope:** the technician's own assignment, resolved from the session.

Three differences from the Owner record are deliberate and load-bearing:

- **The current visit is excluded from every historical list.** A finding
  recorded ten minutes ago must not come back as "previous inspection
  found" — that is how a technician ends up chasing their own note.
  `[VERIFIED]`
- **No money.** The price fields are **absent** from the response, not
  blanked in the template. Anyone can open developer tools on a workshop
  tablet. `[VERIFIED]`
- **Unresolved items are raised to the top** — agreed and not delivered
  is the likeliest explanation for a complaint that has come back.

The panel leads with counts and headings, with detail one tap behind
them, and bounds itself to the **10 most recent** prior visits, reporting
`visitsExamined` alongside `priorVisits` so it can say which it looked at
rather than pretending the tenth-oldest was the oldest.

Opening a recommendation shows its linked work **and its evidence**, so a
technician who disbelieves a status can check it rather than trust it.

---

## Customer History — unchanged

`SafeTechnicalHistory`, scoped per ownership period, still served by
`CustomerSafeProjectionService` through `/customer/history`. This module
added nothing to it and weakened nothing about it. `[VERIFIED]` —
`history.http.spec.ts` re-checks the customer and journey surfaces after
the history work.

---

## Security

| Boundary | How |
|---|---|
| Tenant | every query is `WHERE tenantId = session.tenantId`; the tenant is never a parameter |
| Owner routes | `history.workshop.view`, checked in one place both routes call |
| Cross-tenant ids | answered `404 history_not_found` — identical to "does not exist", so ids cannot be probed |
| Technician routes | scoped by assignment; the asset id is read from the job they are assigned to, never accepted from the caller |
| Not-mine work orders | `404 work_order_not_found`, same as not-found |
| SQL injection | sort keys come from a server-side whitelist; every other value is a bound parameter |
| Money exposure | absent from the technician projection, not hidden |

`[VERIFIED]` — all seven proven in `history.http.spec.ts`.

---

## What a real event does to History

History has no cache and no snapshot: it is computed from the records at
read time, so an event that changes the records changes the next read.
Proven end to end `[VERIFIED]`:

- completing the task linked to an approved recommendation flips its
  outcome from `NOT_PERFORMED` to `PERFORMED`, in the Owner record and in
  the technician's brief, from the same read;
- recording a payment moves the visit's `outstanding` to `0.00` and the
  index row with it.

The Owner page refetches on every search, filter, sort and page change,
and the drawer fetches when opened. There is no poller and no WebSocket:
neither was added for its own sake.

---

## Files

**Backend**

| File | What |
|---|---|
| `systems/operations/history/workshop-history.service.ts` | the shared projection — index, record, brief |
| `systems/operations/history/recommendation-outcome.ts` | the outcome truth model, pure and unit-tested |
| `systems/operations/history/workshop-history.types.ts` | the two role-specific wire shapes |
| `systems/operations/history/history.module.ts` | leaf module: database + vehicle-history only |
| `experiences/owner/history.controller.ts` | the two Owner routes |
| `experiences/owner/history.dto.ts` | index query validation |
| `experiences/technician/technician-work-view.service.ts` | `vehicleHistory` now returns the brief |
| `systems/operations/technician-work.service.ts` | `createTask` accepts and validates `decisionItemId` |

**Frontend**

| File | What |
|---|---|
| `experiences/owner/history/history-page.*` | the index page |
| `experiences/owner/history/history-record-drawer.*` | the complete record |
| `experiences/owner/history/history.api.ts` | both Owner calls and their types |
| `experiences/technician/tech-work-card.*` | the decision-support panel |

**Schema** — `Task.decisionItemId`, migration
`20260903120000_task_decision_item_link`.

---

## Gaps found while building this, and what happened to them

| Gap | Status |
|---|---|
| `Fault.code`, `Fault.recommendedService`, `Fault.inspectionId` were written by the service and absent from the DTO, so no technician could ever fill them | **Fixed.** History is what made it visible — it reports "what did the last technician recommend" from a column that was empty for every fault in the product. |
| No link between an approved recommendation and the work done about it | **Fixed** — `Task.decisionItemId`, plus the write path through the manager's create-task route. |
| The Owner rail called the audit page "History" | **Fixed** — the audit page is `Audit & Changes`; History is its own page. |
| `workorders.branch.reassign_technician` is granted to `BRANCH_MANAGER` and checked by **no endpoint** — there is no way to assign a technician to a work order over HTTP | **Reported, not fixed.** Out of this module's scope. The shipped test harness works around it with a direct write, and so does the demo-data script. |

---

## Deliberately not done

- **No WebSocket or poller on History.** `[DEFERRED]` — the requirement is
  that history must not go stale, and a page that refetches on every
  interaction and opens the record fresh does not. Adding a socket for a
  page nobody watches idle would be architecture for its own sake.
- **Technician brief reads the 10 most recent prior visits.**
  `[DEFERRED]` — a vehicle with sixty visits gets its recent ten, and the
  brief says so via `visitsExamined`. The Owner record is unbounded,
  which is where "all of it" belongs.
- **No per-recommendation "billed" flag.** `[DEFERRED]` — billing is shown
  in the visit's financial band, where it belongs. A per-item billed flag
  would invite reading "billed" as "performed", which is exactly the
  confusion this module exists to prevent.
