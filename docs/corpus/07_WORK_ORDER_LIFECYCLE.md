# MOP — Work Order Lifecycle

> **Document ID:** DOC-07
> **Purpose:** every state a work order can be in, every transition between them, who may take each one, what must be true first, and what happens as a result.
> **Authority:** ARCHITECTURAL. The graph in `workflow-graphs.ts` is authoritative; this document explains it.
> **Scope:** `WorkOrder` (16 states), plus pointers to the two other lifecycle graphs.
> **Last verified:** 2026-09-01 against commit `a8c8bb5`.
> **Source of truth:** `packages/shared/src/capabilities/workflow-graphs.ts`, `apps/api/src/systems/operations/work-order-lifecycle.service.ts`, `gate-evaluator.service.ts`, `packages/database/prisma/schema.prisma` (`WorkOrderStatus`).
> **Related:** 08 (the engine), 02 (capabilities), 04 (policies), 28 (state → UI map), 35 (golden journeys).

---

## 1. The rule that governs everything below

> **`WorkOrderLifecycleService` is the only thing in MOP that changes a work order's status.**

Every other service asks for an **intent** — *finish*, *approve*, *deliver* — and the lifecycle service decides where that lands by consulting the capability-aware graph. No service anywhere contains `status: "READY_FOR_QC"`, so a workshop without QC cannot end up there by accident, and adding a capability later does not mean hunting through services for hardcoded transitions.

A grep for a hardcoded status write outside this service must return nothing.

**Why this is load-bearing.** The previous implementation's lifecycle was spread across whichever services happened to need it, and it drifted: **six of sixteen statuses had no code path that set them at all**, and one was set by a free-text label while the real enum stayed behind.

## 2. The 16 states

```
                    ┌──────── DRAFT ─────────┐
                    ↓                        ↓
                REGISTERED ──────────────────┤
                    ↓         ↘ (policy)     │
            UNDER_INSPECTION   ↘             │
                    ↓            ↘           │
         AWAITING_CUSTOMER_APPROVAL ←────────┤
                    ↓                        │
            APPROVED_FOR_WORK ───────────────┤
                    ↓                        │
              ┌── IN_PROGRESS ──┐            │
              ↓        ↕        ↓            │
      WAITING_PARTS  BLOCKED  WAITING_CUSTOMER
              ↓        ↕        ↓            │
              └──→ IN_PROGRESS ←┘            │
                    ↓ FINISH                 │
      ┌─────────────┼──────────────┐         │
      ↓             ↓              ↓         │
READY_FOR_TEAM   READY_FOR_QC   PAYMENT_     │
   _REVIEW          ↓ ↑          PENDING     │
      ↓          QC_FAILED         ↓         │
      └──────────────┴──→ READY_FOR_DELIVERY │
                              ↓              ↓
                            CLOSED       CANCELLED
```

Initial state: `DRAFT`. Terminal states: `CLOSED`, `CANCELLED`.

---

## 3. State reference

Each entry gives the state's meaning, how a job enters and leaves it, who acts, and what blocks it.

---

### `DRAFT`
**Meaning.** Intake has started; the record exists but is not yet a job.
**Entered by.** Creation.
**Left by.** `REGISTER` → `REGISTERED`, or abandonment → `CANCELLED`.
**Actor.** Branch Manager, `customer.intake.create`.
**Customer sees.** Nothing.

---

### `REGISTERED`
**Meaning.** The vehicle is booked in. Nobody has looked at it yet.
**Entered by.** `REGISTER` from `DRAFT`.
**Left by.**
- `START_INSPECTION` → `UNDER_INSPECTION` — **unconditional**, which is what guarantees this state can never strand.
- `REQUEST_APPROVAL` → `AWAITING_CUSTOMER_APPROVAL` — live only while `INSPECTION_REQUIRED = CUSTOMER_MAY_DECLINE`. The customer declined inspection and asked for one named service.
- → `CANCELLED` ("customer left").

**Records.** `WorkOrder.inspectionDeclined` is written as a **fact** on the declining path, not inferred later from the absence of an `Inspection` row.
**Customer sees.** *Booked in.*

---

### `UNDER_INSPECTION`
**Meaning.** A technician is diagnosing.
**Entered by.** `START_INSPECTION`.
**Left by.**
- `REQUEST_APPROVAL` → `AWAITING_CUSTOMER_APPROVAL` — **unconditional**. Findings need approval.
- `APPROVE` → `APPROVED_FOR_WORK` — live only while `APPROVAL_REQUIRED_SCOPE` ∈ {`BEYOND_INITIAL_SCOPE`, `CRITICAL_ONLY`}. Findings are within what was agreed.
- → `CANCELLED`.

**Records.** `Inspection`, `Fault` rows. A `CRITICAL` fault here is what later makes `QC_MANDATORY = RISK_FLAGGED_ONLY` route through QC.
**Actor.** Technician — `inspection.quick.create` / `inspection.full.create`.
**Note.** Under `APPROVAL_REQUIRED_SCOPE = ALL_WORK` the direct-approve edge is dark and **every** inspection routes through the customer. The unconditional approval route beside it is why no option of this policy can strand an inspection.

---

### `AWAITING_CUSTOMER_APPROVAL`
**Meaning.** The workshop is waiting for the customer's answer before doing anything.
**Entered by.** `REQUEST_APPROVAL` from `REGISTERED` or `UNDER_INSPECTION`.
**Left by.** `APPROVE` → `APPROVED_FOR_WORK`; or → `CANCELLED` when the customer rejects everything.
**Actor.** The **customer**, via the portal or the `/decide/:token` link — or **staff on their behalf**, governed by `PORTAL_COUNTER_APPROVAL`, always attributed to the staff member.
**Blocks.** Everything. No work proceeds.
**Customer sees.** *Your decision is needed* — leading the portal home screen, because that is usually why the portal was opened.

---

### `APPROVED_FOR_WORK`
**Meaning.** The customer said yes. Nobody has started.
**Left by.** `START_WORK` → `IN_PROGRESS`, or → `CANCELLED`.

---

### `IN_PROGRESS`
**Meaning.** Work is happening. **The hub state** — six edges out.

| Intent | To | Condition |
|---|---|---|
| `REQUEST_PART` | `WAITING_PARTS` | requires `INVENTORY` |
| `ASK_CUSTOMER` | `WAITING_CUSTOMER` | — |
| `REPORT_BLOCKER` | `BLOCKED` | — |
| `FINISH` | `READY_FOR_TEAM_REVIEW` | requires `TEAM_REVIEW` **and** `TECHNICIAN_DIRECT_SEND = REVIEW_REQUIRED` |
| `FINISH` | `READY_FOR_QC` | requires `QC` **and** `QC_MANDATORY = MANDATORY_ALWAYS`, or `RISK_FLAGGED_ONLY` + the fact `work_order.has_critical_fault` |
| `FINISH` | `PAYMENT_PENDING` | requires `FINANCE_CORE` |
| — | `CANCELLED` | — |

**Declaration order is precedence.** Where several `FINISH` edges are live at once — a workshop with review, QC and finance has all three — the router takes the **first declared live match**: review, then QC, then invoicing. The graph must stay in that order, and the choice is data rather than an if-chain inside a service.

**Every `FINISH` edge carries the full Finish-Gate set.** Gates whose owning capability is inactive are dropped by the gate registry, so a workshop with no inventory is never asked about parts.

---

### `WAITING_PARTS` — requires `INVENTORY`
**Meaning.** Work is paused for a part.
**Left by.** `PART_RECEIVED` → `IN_PROGRESS`, or → `CANCELLED`.
**Disabled when `INVENTORY` is off.** A workshop with no stock records a parts wait as a **blocker** (`BlockerReason.WAITING_PART`) instead, and `IN_PROGRESS ↔ BLOCKED` already exists unguarded — which is why removing Inventory needs no replacement edge here.
**Customer sees.** *"We are waiting for a required part. The branch will update you when it arrives."* — the `customerSafeMessage` on the capability's removal policy.

---

### `WAITING_CUSTOMER`
**Meaning.** Mid-job, something new needs the customer's answer.
**Left by.** `CUSTOMER_RESPONDED` → `IN_PROGRESS`, or → `CANCELLED` if they withdraw.
**Distinct from `AWAITING_CUSTOMER_APPROVAL`** because the two are different business situations: one is *before work started*, one is *work is open and paused*. The attention queue and the customer's own wording treat them differently.

---

### `BLOCKED`
**Meaning.** Work cannot continue for a recorded reason.
**Left by.** `RESOLVE_BLOCKER` → `IN_PROGRESS`, or → `CANCELLED` if unresolvable.
**Records.** `TaskBlocker` with a `BlockerReason` from the workshop's own `BlockerReasonDefinition` vocabulary.
**Gate.** `no_open_blocker` is a **core** Finish gate — no capability can drop it.
**Concurrency.** Concurrent blockers were a real bug (H1). The lifecycle's `apply()` accepts a caller's transaction so the decision *"nothing else is blocking this anymore"* and the write that acts on it happen in one transaction, closing the gap a second caller's decision could land in.

---

### `READY_FOR_TEAM_REVIEW` — requires `TEAM_REVIEW`
**Meaning.** The technician has finished; the team leader has not looked yet.
**Left by.**
- `REVIEW_PASSED` → `READY_FOR_QC` (requires `QC`; split by `QC_MANDATORY` into an always route and a risk-flagged route)
- `REVIEW_PASSED` → `PAYMENT_PENDING` (requires `FINANCE_CORE`)
- `REVIEW_PASSED` → `READY_FOR_DELIVERY` (added by `FINANCE_CORE`'s removal policy under External Finance Mode)
- `REVIEW_REJECTED` → `IN_PROGRESS` — returned for rework

**Actor.** Team Leader, `workorders.review.decide` — held by Branch Manager too, so a branch with no team leader can still pass it.
**Removal.** `existingRecordsPolicy: MIGRATE_TO_TERMINAL` — jobs sitting here when the capability is removed are moved on, not stranded.

---

### `READY_FOR_QC` — requires `QC`
**Meaning.** The workshop's own last look before the customer sees the vehicle.
**Left by.** `QC_PASSED` → `PAYMENT_PENDING` (requires `FINANCE_CORE`) or → `READY_FOR_DELIVERY` (no internal finance); `QC_FAILED` → `QC_FAILED`.
**Actor.** `workorders.qc.decide` — Branch Manager by default. **Deliberately a different key from `workorders.review.decide`**: team review is a supervisor reading a technician's work; QC is the workshop's last look. A shop running both must be able to give them to different people.

---

### `QC_FAILED` — requires `QC`
**Meaning.** Quality control refused it.
**Left by.** `RESOLVE_BLOCKER` → `IN_PROGRESS` (rework).
**Visible to.** The team leader — as a **link, never an action**. Deciding what to do about rework is the branch manager's.

---

### `PAYMENT_PENDING` — requires `FINANCE_CORE`
**Meaning.** The work is done and the money is not settled.
**Left by.** `SETTLE_PAYMENT` → `READY_FOR_DELIVERY`.
**Disabled under External Finance Mode**, with replacement edges from `IN_PROGRESS` and `READY_FOR_TEAM_REVIEW` straight to `READY_FOR_DELIVERY`.
**Policies in force.** `PARTIAL_PAYMENT` decides whether a short amount is accepted; `DISCOUNT_AUTHORITY` was already enforced at issuance.

---

### `READY_FOR_DELIVERY`
**Meaning.** Everything is done. The vehicle is waiting to be handed over.
**Left by.** `DELIVER` → `CLOSED`, gated by `invoice.issued` and `payment.settled_or_policy_allows`; or → `CANCELLED` before handover.
**Actor.** Branch Manager, `workorders.branch.release_delivery`.
**The Delivery Gate is the only thing standing between a customer and their vehicle**, which is why `DELIVERY_BLOCKED_UNTIL_PAID` is a `GOVERNED` policy and its `REQUIRES_OVERRIDE` option is honest about not yet having its audited release action.

---

### `CLOSED` — terminal
**Meaning.** Handed over. The job is history.
**Records.** `closedAt` set; `SafeTechnicalHistory` entries become the record a future owner may see.
**After close.** `POST_CLOSE_ADDENDA` decides whether a note may still be appended. `WorkOrderNote` is append-only — no update or delete path exists.

---

### `CANCELLED` — terminal
**Meaning.** The job stopped and will not resume.
**Reachable from.** `DRAFT`, `REGISTERED`, `UNDER_INSPECTION`, `AWAITING_CUSTOMER_APPROVAL`, `APPROVED_FOR_WORK`, `IN_PROGRESS`, `WAITING_PARTS`, `WAITING_CUSTOMER`, `BLOCKED`, `READY_FOR_DELIVERY`.

**These cancel edges are load-bearing, not defensive.** They are what make the reachability guarantee hold: every non-terminal state has at least one path to a terminal state even before capability-specific routes are considered.

---

## 4. The 20 intents

`REGISTER` · `START_INSPECTION` · `REQUEST_APPROVAL` · `APPROVE` · `START_WORK` · `REQUEST_PART` · `PART_RECEIVED` · `REPORT_BLOCKER` · `RESOLVE_BLOCKER` · `ASK_CUSTOMER` · `CUSTOMER_RESPONDED` · `FINISH` · `REVIEW_PASSED` · `REVIEW_REJECTED` · `QC_PASSED` · `QC_FAILED` · `ISSUE_INVOICE` · `SETTLE_PAYMENT` · `DELIVER` · `CANCEL`

**An intent is the action a person takes, as opposed to the states it happens to connect.** *"Technician finishes"* lands on Team Review, QC, invoicing or delivery readiness depending purely on which capabilities the workshop has — so the branching belongs in the graph, not in an if-chain inside a service.

## 5. How a transition is executed

`WorkOrderLifecycleService.apply(workOrderId, intent, actor, { reason?, tx? })`:

1. **Load** the work order (`id`, `tenantId`, `status`).
2. **Build the routing context** — `routingContext(tenantId, workOrderId)` returns the capability `profile`, the relevant `policies` answers, and the per-work-order `facts`.
3. **Resolve** `resolveIntent(WORK_ORDER_GRAPH, profile, status, intent, policies, facts)`. Not allowed → `409 transition_not_allowed`.
4. **Evaluate gates**, if the chosen edge carries any, **against the same capability profile** — so a check whose owning capability is gone is never even asked. Blocked → `409 gate_blocked`, carrying **every** unsatisfied gate so the UI can show the full checklist rather than making the user fix one thing at a time.
5. **Write** the status, emit `work_order.status_changed`, and write the audit row — in one transaction. A caller that already holds a row lock passes its own `tx` so the decision and the write cannot be separated.

Two read-only companions:
- `availableIntents(workOrderId)` — what this job can do right now, used to build the UI's actions rather than guessing.
- `previewGates(workOrderId, intent)` — the checklist, so a technician sees what is blocking before pressing anything.

## 6. Gate evaluation

Gates are evaluated by `GateEvaluatorService` at two checkpoints.

**Finish Gate** (10 possible checks, of which only the live ones are asked):
`inspection_completed` · `approved_work_completed` · `customer_decisions_resolved` · `critical_warning_acknowledged` · `no_open_blocker` — all **core** — plus `parts.received_used_or_returned` (Inventory), `parts.no_pending_return` (Part Returns), `parts.external_resolved` (External Parts), `review.team_review_passed` (Team Review), `qc.passed` (QC).

**Delivery Gate:** `invoice.issued` (Billing) · `payment.settled_or_policy_allows` (Finance Core).

Two policies modulate gates rather than edges:
- `RETURN_UNUSED_BEFORE_FINISH` — `WARN_ONLY` downgrades `parts.received_used_or_returned` to advisory; `NOT_REQUIRED` drops it.
- `DELIVERY_BLOCKED_UNTIL_PAID` — read through `FinanceConfiguration.allowUnpaidDelivery` by the `payment.settled_or_policy_allows` check.

## 7. The other two graphs

| Graph | States | Terminal | Notes |
|---|---|---|---|
| **`PartRequest`** | 15 | `USED`, `RETURNED_TO_STOCK`, `REJECTED`, `CANCELLED`, `UNAVAILABLE` | `requires: ["INVENTORY"]` — **the whole graph is skipped** when there is no inventory, because "this never happens here" is a different fact from "this happens and then gets stuck". Full detail in doc 09 |
| **`CustomerDecisionRequest`** | 7 | `RESOLVED`, `EXPIRED`, `CANCELLED` | The portal channel edges require `CUSTOMER_PORTAL`; removing it adds counter-approval edges so the **step** survives the loss of the **channel**. Full detail in doc 11 |

## 8. Scenarios the lifecycle must handle

Each has a defined path and a defined terminal state — that is the acceptance bar from doc 01 §8.

| Scenario | Path |
|---|---|
| Customer declines inspection, names one service | `REGISTERED → AWAITING_CUSTOMER_APPROVAL` under `CUSTOMER_MAY_DECLINE`; `inspectionDeclined = true` so the Finish Gate never asks for an inspection that was refused |
| Customer rejects everything | `AWAITING_CUSTOMER_APPROVAL → CANCELLED` |
| Customer rejects a **critical** repair and drives away | The rejection is recorded; `critical_warning_acknowledged` must be satisfied before finish; delivery proceeds with the acknowledgement on record |
| Customer brings their own part | `EXTERNAL_PARTS` + `parts.external_resolved` |
| Part never arrives | `WAITING_PARTS → CANCELLED`, or `UNAVAILABLE` on the part request and a supplier order |
| Job cancelled mid-work | `IN_PROGRESS → CANCELLED` |
| Blocker that cannot be cleared | `BLOCKED → CANCELLED` |
| Workshop frozen mid-flow | Every actor is blocked immediately at login/session level; no data is lost, and the job resumes from exactly where it stopped |

## 9. Implementation status

| Element | Status |
|---|---|
| 16 states matching the Prisma enum exactly | ✅ `[VERIFIED]` |
| Single-writer rule for `WorkOrder.status` | ✅ `[VERIFIED]` |
| Intent-based routing from the capability-aware graph | ✅ `[VERIFIED]` — `workflow-router.spec.ts` |
| Policy conditions on 4 edges, reachability-proven | ✅ `[VERIFIED]` — `graph-safety.spec.ts` |
| Per-work-order fact conditions (`has_critical_fault`) | ✅ `[IMPLEMENTED]` |
| Capability-aware gate evaluation at both checkpoints | ✅ `[VERIFIED]` |
| Full-checklist gate errors | ✅ `[INTEGRATED]` |
| `availableIntents` / `previewGates` driving the UI | ✅ `[INTEGRATED]` |
| Caller-supplied transaction to close the decide/write gap | ✅ `[IMPLEMENTED]` — edge case H1 |
| Real state-entry timestamps per status | 🔴 `[INTENDED]` — SLA over-run currently uses `updatedAt` as an honest proxy, named as such |
| Optional review under `DIRECT` (technician chooses per job) | 🔴 `[INTENDED]` — needs its own intent; recorded rather than faked |
| Capability rollback racing an in-flight transition (E13) | 🔴 `[INTENDED]` — design spike owed |
