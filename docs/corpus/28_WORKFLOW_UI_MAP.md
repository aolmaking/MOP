# MOP — Workflow ↔ UI Map

> **Document ID:** DOC-28
> **Purpose:** for any business state, find the page, the control, the endpoint and the transition — and the reverse.
> **Authority:** REFERENCE, derived.
> **Scope:** all 16 work-order states, plus the part-request and decision graphs.
> **Last verified:** 2026-09-01 against commit `a8c8bb5`.
> **Related:** 07 (lifecycle), 15 (pages), 19 (endpoints), 16 (matrix).

---

## The chain

```
BUSINESS STATE → PAGE → COMPONENT → CONTROL → ENDPOINT → DOMAIN COMMAND → TRANSITION
```

**Read it forwards** to answer *"where does a user deal with this state?"*
**Read it backwards** to answer *"what does this button actually do?"*

A state with no page is a state nobody can act on. A control with no endpoint is a lie. Both appear below, marked ⚠️.

---

## 1. Work-order states → where they are handled

| State | Who acts | Page | Control | Endpoint | Intent |
|---|---|---|---|---|---|
| `DRAFT` | Branch Manager | `/branch/intake` | *Book in* | `POST /branch-manager/intake` | `REGISTER` |
| `REGISTERED` | Technician | `/tech/card/:id` | *Start inspection* | `POST /technician/work-orders/:id/inspection` | `START_INSPECTION` |
| `REGISTERED` | Branch Manager | `/branch/intake` | *Customer declined inspection* | `POST /branch-manager/intake` | `REQUEST_APPROVAL` — only under `INSPECTION_REQUIRED = CUSTOMER_MAY_DECLINE` |
| `UNDER_INSPECTION` | Technician | `/tech/card/:id` | *Raise decision* | `POST …/:id/decisions` | `REQUEST_APPROVAL` |
| `UNDER_INSPECTION` | Technician | `/tech/card/:id` | *Proceed* | `POST …/:id/finish` routing | `APPROVE` — only under `APPROVAL_REQUIRED_SCOPE ∈ {BEYOND_INITIAL_SCOPE, CRITICAL_ONLY}` |
| `AWAITING_CUSTOMER_APPROVAL` | **Customer** | `/decide/:token` or `/customer/decisions` | *Approve / Reject* | `POST /public/decisions/:token/respond` | `APPROVE` |
| `AWAITING_CUSTOMER_APPROVAL` | Branch Manager | `/branch/approvals` | *Record on behalf* | `POST …/approvals/:requestId/record` | `APPROVE` — under `PORTAL_COUNTER_APPROVAL` |
| `APPROVED_FOR_WORK` | Technician | `/tech/card/:id` | *Start task* | `POST /technician/tasks/:id/start` | `START_WORK` |
| `IN_PROGRESS` | Technician | `/tech/card/:id` | *Request part* | `POST …/:id/parts` | `REQUEST_PART` |
| `IN_PROGRESS` | Technician | `/tech/card/:id` | *Ask customer* | `POST …/:id/decisions` | `ASK_CUSTOMER` |
| `IN_PROGRESS` | Technician | `/tech/card/:id` | *Report blocker* | `POST /technician/tasks/:id/blocker` | `REPORT_BLOCKER` |
| `IN_PROGRESS` | Technician | `/tech/card/:id` | *Finish* | `POST …/:id/finish` | `FINISH` |
| `WAITING_PARTS` | Inventory Manager | `/inventory/requests` | *Issue* | `POST /inventory/requests/:id/issue` | — |
| `WAITING_PARTS` | Technician | `/tech/card/:id` | *Receive part* | `POST /technician/parts/:id/receive` | `PART_RECEIVED` |
| `WAITING_CUSTOMER` | **Customer** | `/decide/:token` | *Respond* | `POST /public/decisions/:token/respond` | `CUSTOMER_RESPONDED` |
| `BLOCKED` | Branch Manager | ⚠️ **no page** | ⚠️ **no control** | ⚠️ **no endpoint** | `RESOLVE_BLOCKER` |
| `READY_FOR_TEAM_REVIEW` | Team Leader | `/team-leader/work-orders` → Branch workspace | *Pass / Reject* | `POST /branch-manager/work-orders/:id/advance` | `REVIEW_PASSED` / `REVIEW_REJECTED` |
| `READY_FOR_QC` | Branch Manager | `/branch/work-orders/:id` | *Pass / Fail* | `POST …/:id/advance` | `QC_PASSED` / `QC_FAILED` |
| `QC_FAILED` | Technician | `/tech/card/:id` | *Rework* | via task actions | `RESOLVE_BLOCKER` |
| `PAYMENT_PENDING` | Branch Manager | `/branch/delivery` → `/branch/payments/:id` | *Take payment* | `POST /finance/invoices/:id/payments` | `SETTLE_PAYMENT` |
| `READY_FOR_DELIVERY` | Branch Manager | `/branch/delivery` | *Release vehicle* | `POST /branch-manager/work-orders/:id/deliver` | `DELIVER` |
| `CLOSED` | Branch Manager | `/branch/work-orders/:id` | *Add note* | `POST …/:id/notes` | — (`POST_CLOSE_ADDENDA`) |
| `CANCELLED` | — | — | — | — | terminal |

### ⚠️ The `BLOCKED` hole

`BLOCKED` is the one non-terminal state in the product **with no user-facing exit.**

- `TechnicianWorkService.resolveBlocker` exists and is tested — no endpoint.
- `workorders.branch.manage_blockers` exists and is held by Branch Manager — checked by nothing.
- `no_open_blocker` is a **core Finish gate**, so a job that hits a blocker cannot be finished.

The only remaining route out is `BLOCKED → CANCELLED`, which is not what a blocker means. Gap **G-OPS-01**, and the highest-priority ⚠️ in the corpus: it is a reachable state that traps a real job.

---

## 2. Part-request states → where they are handled

| State | Who acts | Page | Control | Endpoint |
|---|---|---|---|---|
| `REQUESTED` | Inventory Manager | `/inventory/requests` | Approve / Reject / Unavailable | `POST /inventory/requests/:id/{approve,reject,unavailable}` |
| `APPROVED` | Inventory Manager | `/inventory/requests` | Issue | `POST /inventory/requests/:id/issue` |
| `ISSUED` | Technician | `/tech/card/:id` | Receive | `POST /technician/parts/:id/receive` |
| `ARRIVED` | ⚠️ | ⚠️ **no page** | ⚠️ `markArrived` has no endpoint | — |
| `RECEIVED_BY_TECHNICIAN` | Technician | `/tech/card/:id` | Mark used | `POST /technician/parts/:id/used` |
| `RECEIVED_BY_TECHNICIAN` | Technician | ⚠️ | ⚠️ **no return control** | ⚠️ `requestReturn` has no endpoint |
| `RETURN_REQUESTED` | Inventory Manager | `/inventory/returns` | Accept / Reject / Clarify | `POST /inventory/returns/:id/{accept,reject,clarify}` |
| `RETURN_CLARIFICATION_REQUESTED` | Technician | ⚠️ | ⚠️ **no reply control** | ⚠️ `respondToClarification` has no endpoint |
| `RETURN_REJECTED` | Technician | ⚠️ | ⚠️ | ⚠️ `resolveRejectedReturn` has no endpoint |
| `WAREHOUSE_REVIEWING`, `IN_TRANSIT`, `WAITING_TRANSFER`, `WAITING_SUPPLIER` | — | **read** by Inventory Home and the requests view | — | ⚠️ **no writer, no graph edge** |

The manager's half of the return loop is complete and integrated. **The technician's half does not exist**, so the queue can only ever be filled by the demo seed. Gaps G-INV-02..05.

---

## 3. Customer-decision states → where they are handled

| State | Who acts | Page | Endpoint |
|---|---|---|---|
| `PENDING` | Technician raises | `/tech/card/:id` | `POST /technician/work-orders/:id/decisions` |
| `SENT` | *(would be the send step)* | ⚠️ | ⚠️ **no message transport exists** |
| `VIEWED` | Customer opens | `/decide/:token` | `GET /public/decisions/:token` |
| `PARTIALLY_RESPONDED` | Customer | `/decide/:token` | `POST …/respond` |
| `RESOLVED` | Customer, or staff on their behalf | `/decide/:token` · `/branch/approvals` | `POST …/respond` · `POST …/record` |
| `EXPIRED` | *(time)* | — | — |
| `CANCELLED` | — | — | — |

`SENT` is reachable in the graph but nothing dispatches a message — the templates are complete and the transport is absent. This is why the portal path (`/customer/decisions`) and the token path both matter: without either, a decision could only be answered at the counter.

---

## 4. Journey strip — one component, three roles

| Role | Where |
|---|---|
| Branch Manager | `GET /branch-manager/work-orders/:id/journey` |
| Technician | `GET /technician/work-orders/:id/journey` |
| Customer | `GET /customer-portal/service/:workOrderId/journey` |

One implementation: `apps/web/src/app/domain/journey/workflow-strip.ts`.

Stage states: `DONE` · `CURRENT` · `WAITING` · `BLOCKED` · `AHEAD`, computed server-side from the **effective** graph — so a workshop with no QC never shows a QC stage. It is not a fixed picture with steps greyed out.

`journey-poller.ts` refreshes every 20 seconds, matching Live View, and is **never optimistic**: the strip is redrawn only from a server response.

---

## 5. Gate → what the user sees

Gate failures surface as a **checklist**, not a single error, because a technician fixing one thing at a time and pressing again is the slowest possible path.

| Gate | Where it is shown | Message |
|---|---|---|
| `inspection_completed` | `GET /technician/work-orders/:id/finish-check` | Complete the inspection before finishing. |
| `approved_work_completed` | same | Some approved work is still outstanding. |
| `customer_decisions_resolved` | same | The customer has not answered every request yet. |
| `critical_warning_acknowledged` | same | A critical item was rejected and needs the customer's acknowledgement. |
| `no_open_blocker` | same | Resolve or escalate the open blocker before finishing. ⚠️ *and there is no control that does* |
| `parts.received_used_or_returned` | same | A received part is neither marked used nor returned. |
| `parts.no_pending_return` | same | A return is still waiting for the inventory manager to accept it. |
| `parts.external_resolved` | same | A customer-supplied or externally-sourced part is still unresolved. |
| `review.team_review_passed` | same | Waiting for the team leader's review. |
| `qc.passed` | same | Waiting for quality control to pass. |
| `invoice.issued` | `/branch/delivery` | The final invoice has not been issued. |
| `payment.settled_or_policy_allows` | `/branch/delivery` | Payment is outstanding and this workshop does not allow unpaid delivery. |

Every gate also carries a `satisfiedMessage`, so passed rows read as English beside failed ones — added after a technician read *"Complete the inspection before finishing."* directly above *"parts received used or returned"*, half the list in English and half in database.

---

## 6. Policy → visible difference

The test of a policy is whether a user could tell which option is set. Every row below passes it.

| Policy | Visible difference |
|---|---|
| `INSPECTION_REQUIRED` | Whether intake offers *customer declined inspection* |
| `APPROVAL_REQUIRED_SCOPE` | Whether an inspection can proceed without stopping at the customer |
| `TECHNICIAN_DIRECT_SEND` | Where *Finish* lands |
| `QC_MANDATORY` | Whether this job waits for QC |
| `TIME_TRACKING` | Whether the minutes control exists, and whether completion is refused without it |
| `RETURN_UNUSED_BEFORE_FINISH` | Whether an unaccounted part blocks *Finish* or is only flagged |
| `PARTS_SEPARATION_OF_DUTIES` | Whether *Approve* is refused for the person who asked |
| `DELIVERY_BLOCKED_UNTIL_PAID` | Whether *Release vehicle* is refused with a balance outstanding |
| `PARTIAL_PAYMENT` | Whether a short amount is accepted |
| `DISCOUNT_AUTHORITY` | Whether issuing refuses without an approved discount request |
| `UNCOVERED_COUNTRY_BILLING` | Whether issuing is flagged or refused |
| `APPROVAL_WEIGHT` | Whether a routine item shows the acknowledgement modal |
| `PORTAL_COUNTER_APPROVAL` | Whether *Record on behalf* is offered, and whether evidence is required |
| `CUSTOMER_INVOICE_VISIBILITY` | Whether a price appears beside a finding |
| `POST_CLOSE_ADDENDA` | Whether *Add note* works on a closed job |
| `WORKING_WEEK` | Every *"waiting two days"* figure in the product |

---

## 7. Capability → what disappears

| Capability off | Pages absent | Controls absent | Gates dropped |
|---|---|---|---|
| `INVENTORY` | All 6 Inventory Manager pages | Request/receive/use part | `parts.received_used_or_returned` |
| `PART_RETURNS` | Returns queue | Return controls | `parts.no_pending_return` |
| `MULTI_WAREHOUSE` | Per-warehouse breakdowns | Transfer | — |
| `MULTI_BRANCH` | Branch picker, branch comparison | — | — |
| `TEAMS` | All 4 Team Leader pages, Team Setup | — | — |
| `TEAM_REVIEW` | Review queue | *Pass review* | `review.team_review_passed` |
| `QC` | QC lane | *Pass/Fail QC* | `qc.passed` |
| `CUSTOMER_PORTAL` | All 6 customer pages | *(counter approval replaces them)* | — |
| `FINANCE_CORE` | Payments, pricing | *Take payment* | `payment.settled_or_policy_allows` |
| `BILLING` | Invoice issuance | *Issue invoice* | `invoice.issued` |
| `EXTERNAL_PARTS` | — | Customer-supplied part entry | `parts.external_resolved` |
| `QUICK_INSPECTION` | — | The quick-inspection mode | — |

**Absent, not disabled.** A control the user may never reach is not rendered greyed out.

---

## 8. Summary of holes

| Hole | Effect | Gap |
|---|---|---|
| `BLOCKED` has no exit control | **A blocked job cannot be finished or unblocked** | G-OPS-01 |
| Technician cannot return a part | The Returns queue can only be seed-filled | G-INV-02 |
| Technician cannot reply to a clarification | The loop has an ask and no reply | G-INV-03 |
| No `markArrived` control | A travelled part cannot be confirmed | G-INV-04 |
| No `resolveRejectedReturn` control | A rejected return cannot be closed out | G-INV-05 |
| No task-creation control | Tasks exist only in the demo seed | G-OPS-03 |
| No reassignment control | The permission is orphaned | G-OPS-02 |
| No message transport | `SENT` is unreachable; templates are ready and unused | G-MSG-01 |
| No specialisation or custom-field capture | Authoring exists; recording does not | G-FORM-01 |
