# MOP — The Technician Workspace

> **Document ID:** DOC-12
> **Purpose:** the technician's whole job, end to end — what they see, what they can do, what each action changes downstream.
> **Authority:** DESCRIPTIVE.
> **Scope:** the three technician pages, `TechnicianController`, `TechnicianWorkService`, `TechnicianWorkViewService`.
> **Last verified:** 2026-09-01 against commit `a8c8bb5`; the catalog-driven
> part request (section appended at the end) verified 2026-09-03 against the
> working tree, by `apps/api/src/testing/catalog-cart.http.spec.ts` and a
> browser journey.
> **Source of truth:** `apps/api/src/experiences/technician/`, `apps/api/src/systems/operations/technician-work.service.ts`, `apps/web/src/app/experiences/technician/`, `docs/detailed-specs/technician.md`, `docs/phases/PHASE_6.md`.
> **Related:** 07 (lifecycle), 09 (parts), 05 (permissions), 27 (why the UI is shaped this way).

---

## 1. Who this person is and what that implies

A technician has dirty hands, is holding a phone or a tablet, is standing up, and is often wearing gloves. Their competition is a paper notebook and a WhatsApp group.

> **Its risk is friction. If it is slower than the notebook, it loses to the notebook.**

Three design consequences, all `[IMPLEMENTED]`:

- **No sidebar.** The technician shell is bottom-navigation, three pages, mobile- and tablet-first. The Inventory Manager sits at a desk for long sessions and gets a rail; the technician does not. That is why they are separate shells rather than one shell branching on role.
- **A density layer built for a gloved hand.** Touch targets are enforced by `tools/lint-touch-targets.mjs`.
- **Next-action primacy.** The landing page answers *"what am I doing right now?"* with no click, no filter and no memory of where they were.

## 2. The three pages

| Page | Route | Answers |
|---|---|---|
| **Now** | `/tech` | What am I doing right now? |
| **My Work** | `/tech/work` | What else is mine? |
| **Work Card** | `/tech/card/:id` | Everything about this one job |

All three `[INTEGRATED]`, `✅` in `PAGE_INVENTORY.md`.

## 3. The endpoints

`TechnicianController`, all behind `SessionGuard`.

### Reads

| Endpoint | Returns |
|---|---|
| `GET /technician/active` | The current job — the Now page |
| `GET /technician/my-work` | Everything assigned to this technician |
| `GET /technician/work-orders/:id` | The full work card |
| `GET /technician/work-orders/:id/journey` | The stage strip (shared `domain/journey` component) |
| `GET /technician/work-orders/:id/vehicle-history` | This asset's prior work |
| `GET /technician/work-orders/:id/finish-check` | **The gate checklist, before pressing anything** |
| `GET /technician/parts-catalog` | What can be requested |

`finish-check` deserves note: it calls `WorkOrderLifecycleService.previewGates`, so the technician sees exactly which conditions are unmet **before** attempting to finish, with the gate registry's own `blockedMessage` / `satisfiedMessage` wording. Passed rows read as English next to failed ones — the reason both message forms exist on every gate.

### Writes

| Endpoint | Intent / effect | Permission |
|---|---|---|
| `POST /technician/tasks/:id/start` | Task starts | `task.view_assigned` |
| `POST /technician/tasks/:id/complete` | Task completes; `TIME_TRACKING` enforced here | `task.complete` |
| `POST /technician/tasks/:id/blocker` | `REPORT_BLOCKER` → `BLOCKED` | `blocker.report` |
| `POST /technician/work-orders/:id/inspection` | Records an `Inspection` | `inspection.quick.create` / `inspection.full.create` |
| `POST /technician/work-orders/:id/faults` | Records a `Fault` | — |
| `POST /technician/work-orders/:id/decisions` | Raises a customer decision | `customer_decision.create` |
| `POST /technician/work-orders/:id/parts` | `REQUEST_PART` → `WAITING_PARTS` | `inventory.request.create` |
| `POST /technician/parts/:id/receive` | → `RECEIVED_BY_TECHNICIAN` | — |
| `POST /technician/parts/:id/used` | → `USED`; produces a chargeable line | — |
| `POST /technician/work-orders/:id/finish` | `FINISH` → review / QC / invoicing / delivery | `task.finish_attempt` |

## 4. What each action changes downstream

This is the chain the technician cannot see and must never be able to break.

**Marking a part used** — one press — changes: the `PartRequest` (`→ USED`), the stock ledger (`StockMovement`), the warehouse balance (`issuedQty ↓`), the `WorkOrderPartLine`, the running invoice, the customer's sanitised timeline, the team leader's view, the branch attention centre, the reports, and the audit trail. One write path, `OperationEventsService`, so it cannot be half-done by a module written in a hurry six months from now.

**Recording a `CRITICAL` fault** sets the `work_order.has_critical_fault` routing fact, which under `QC_MANDATORY = RISK_FLAGGED_ONLY` is what sends this job — and only this job — through QC.

**Pressing Finish** does not choose a destination. It sends the `FINISH` intent; the router picks the first live edge in declaration order (review → QC → invoicing), and the full Finish-Gate set is evaluated against the tenant's capability profile so a workshop with no inventory is never asked about parts.

## 5. Policies the technician feels

| Policy | What changes on the Work Card |
|---|---|
| `TIME_TRACKING` | `OFF` — the minutes control **is not rendered and no minutes are posted**. `OPTIONAL` — minute entry offered. `REQUIRED` — completion refused without whole minutes. `completeTask` discards a value under `OFF` even if a caller sends one, so the column never holds a stray value from before the policy changed |
| `INSPECTION_REQUIRED` | Whether a job can reach approval without an inspection at all |
| `APPROVAL_REQUIRED_SCOPE` | Whether findings can go straight to work or must stop at the customer |
| `TECHNICIAN_DIRECT_SEND` | Where Finish lands — through the team leader, or straight onward |
| `QC_MANDATORY` | Whether this job waits for QC |
| `RETURN_UNUSED_BEFORE_FINISH` | Whether an unaccounted part blocks Finish or is only flagged |
| `PARTS_SEPARATION_OF_DUTIES` | Whether the technician's own part request can be self-approved |

`Task.actualMinutes` is the technician's **reported** figure, never derived from start/complete timestamps — a task blocked and resumed later would make wall-clock time overstate work done.

## 6. What the technician never sees

- **Price, cost or margin.** `finance.running_invoice.add_line` is explicitly `false` in the baseline map, not merely absent — an owner delegates it deliberately. `finance.discount.request` likewise.
- **Another technician's jobs.** Scope is their own assignments.
- **The supervision note written about them.** `SupervisionNote` is internal to the team leader.

## 7. ⚠️ The integration gaps in this role

Four service methods exist, are tested, and have **no HTTP endpoint** — reachable only from integration tests. Under this project's own standard (*implemented is not integrated*), each is an open gap, and they are listed in doc 37.

| Method | Consequence in the running product |
|---|---|
| `TechnicianWorkService.createTask` | **`Task` rows can only be created by the demo seed.** It is the only writer of `Task` anywhere, and nothing routes to it. Task start/complete, `task.*` permissions, the `approved_work_completed` gate and `TIME_TRACKING` all operate on rows the product cannot produce |
| `TechnicianWorkService.resolveBlocker` | A blocker can be **reported and never cleared** through the product. `RESOLVE_BLOCKER` has no door, and `no_open_blocker` is a core Finish gate — so a job that hits a blocker cannot be finished |
| `PartRequestService.requestReturn` | A technician **cannot return an unused part.** The whole `PART_RETURNS` branch of the graph is unreachable from the technician's side, while the Inventory Manager's accept/reject/clarify queue is fully built and waiting for requests that cannot arrive |
| `PartRequestService.respondToClarification` | The clarify↔reply loop has an **ask** half and no **reply** half |

`PartRequestService.markArrived` and `resolveRejectedReturn` are in the same position (doc 09).

These are not "a later phase has not run yet." They are finished, tested systems with no door — the exact failure mode `PAGE_INVENTORY.md` was created to catch, found again one layer deeper. `workorders.branch.manage_blockers` and `workorders.branch.reassign_technician` are the corresponding orphaned permission keys.

## 8. Implementation status

| Element | Status |
|---|---|
| Three pages, own shell, bottom nav, gloved-hand density | ✅ `[INTEGRATED]` |
| Now / My Work / Work Card against real endpoints | ✅ `[INTEGRATED]` |
| Gate checklist preview before Finish | ✅ `[INTEGRATED]` |
| Inspection, fault, decision-raise, blocker-report | ✅ `[INTEGRATED]` |
| Part request → receive → used | ✅ `[VERIFIED]` |
| Finish routed by capability + policy + fact | ✅ `[VERIFIED]` |
| `TIME_TRACKING` across all three options, backend and UI | ✅ `[VERIFIED]` |
| Journey strip shared with two other roles | ✅ `[INTEGRATED]` |
| Vehicle history | ✅ `[INTEGRATED]` |
| **Task creation** | ⚠️ `[IMPLEMENTED]` not `[INTEGRATED]` — no endpoint; seed-only |
| **Blocker resolution** | ⚠️ `[IMPLEMENTED]` not `[INTEGRATED]` — no endpoint |
| **Part return request** | ⚠️ `[IMPLEMENTED]` not `[INTEGRATED]` — no endpoint |
| **Clarification reply** | ⚠️ `[IMPLEMENTED]` not `[INTEGRATED]` — no endpoint |
| Specialisation service cards / measurement forms on the Work Card | 🔴 `[INTENDED]` — definitions and validation are real; no page fills one in |
| Custom-field capture on inspection | 🔴 `[INTENDED]` — authoring exists, recording does not |
| Optional per-job review under `DIRECT` | 🔴 `[INTENDED]` — needs its own intent |


---

## Appendix A — Asking the store for parts, as shopping `[VERIFIED]`

> Added 2026-09-03. Route `/tech/card/:id/parts`
> (`apps/web/src/app/experiences/technician/parts-catalog.*`). Proven by
> `apps/api/src/testing/catalog-cart.http.spec.ts` and a browser journey.

The Work Card's inline parts picker was cards rather than a SKU box,
which was right, but it had no categories, no filters, and asked for one
part per press. A brake job is four presses and four trips through the
same list.

It is now a page rather than a panel: browse a category, cut it down
with the filters that category actually offers, add what you need to a
basket, check it, send it once. `parts-picker.*` was deleted rather than
left beside it — two doors to the same job is how one of them goes
stale.

**This page invents no taxonomy.** Categories, filters and filter values
all arrive from the server, configured by the inventory manager. There
is no `VEHICLE_TYPES` constant in the component and there must never be
one: the moment it hardcodes a filter it stops showing the workshop its
own catalogue. The `@for` over `filters()` is the whole mechanism.

What the cart is and is not: it is an intention, not a transaction.
Nothing is reserved, nothing is priced against the customer, no stock
moves. On submit it becomes real `PartRequest` rows that the existing
store queue already reads, and everything after that is unchanged —
approve, issue, stock movement, receive, fit, bill once at the price
snapshotted when it was issued.

The basket survives a reload (session storage, per work order) together
with the `cartKey` that makes re-submitting it harmless. Losing an
unsent basket is a nuisance; sending it twice costs the store real work.

Out-of-stock parts are **said, not blocked** — "The store will have to
order this." A technician who cannot ask for an out-of-stock part simply
phones instead, and the request leaves the system entirely.

A part the workshop has never carried still has no catalogue entry, so
the page points back at the Work Card's blocker, which remains the door
for that case.
