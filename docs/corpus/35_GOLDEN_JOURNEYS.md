# MOP — Golden Journeys

> **Document ID:** DOC-35
> **Purpose:** the journeys that must work end to end, each with its actor sequence, records, expected states and acceptance criteria.
> **Authority:** ACCEPTANCE. A journey is not passing because its parts have tests; it is passing when it has been walked.
> **Scope:** 10 journeys across every system boundary.
> **Last verified:** 2026-09-01 against commit `a8c8bb5`.
> **Related:** 07 (lifecycle), 28 (state → UI), 34 (verification), 37 (gaps).

---

## How to read a journey

Each names its **actor sequence**, the **pages** used, the **records** written, the **expected states**, the **side effects**, and the **acceptance criteria** — the specific observations that make it passing rather than plausible.

A journey is **BLOCKED** when a step has no reachable control, even if every service behind it is implemented and tested. That distinction is the whole point of this document.

| | |
|---|---|
| ✅ **PASSING** | Walked end to end, recorded |
| 🟡 **PARTIAL** | Reachable, with a named piece missing |
| ⚠️ **BLOCKED** | A step has no door |

---

## GJ-1 · The full repair — intake to closed
**Status: 🟡 PARTIAL**

**Actors.** Branch Manager → Technician → Customer → Technician → Inventory Manager → Technician → Team Leader → Branch Manager → Customer

```
/branch/intake      book in                    DRAFT → REGISTERED
/tech/card/:id      inspect, record faults     → UNDER_INSPECTION
/tech/card/:id      raise decision             → AWAITING_CUSTOMER_APPROVAL
/decide/:token      customer approves          → APPROVED_FOR_WORK
/tech/card/:id      start work                 → IN_PROGRESS
/tech/card/:id      request part               → WAITING_PARTS
/inventory/requests approve + issue            StockMovement ISSUE
/tech/card/:id      receive, mark used         → IN_PROGRESS, chargeable line
/tech/card/:id      finish                     → READY_FOR_TEAM_REVIEW | READY_FOR_QC | PAYMENT_PENDING
/branch/…/advance   review / QC pass           → PAYMENT_PENDING
/branch/payments/:id take payment              → READY_FOR_DELIVERY
/branch/delivery    release                    → CLOSED
```

**Records.** `WorkOrder` · `Task` · `Inspection` · `Fault` · `CustomerDecisionRequest` + `Item` · `PartRequest` · `IssuedItem` · `StockMovement` · `WorkOrderPartLine` · `RunningInvoice` + lines · `Invoice` + lines · `BillingDocument` · `Payment` · `CustomerTimelineEvent` · `SafeTechnicalHistory` · `AuditLog` · `OperationEvent`

**Acceptance criteria.**
1. Every state transition goes through `WorkOrderLifecycleService`.
2. Stock falls by exactly the issued quantity, and `replay()` reproduces the balance.
3. The invoice total equals the sum of its lines.
4. The customer's timeline never contains internal wording.
5. Delivery is refused while the Delivery Gate fails.
6. The audit trail reconstructs who decided what.
7. **The same journey runs on a second, differently-shaped tenant without code changes.**

**Why PARTIAL.** ⚠️ **`Task` cannot be created through the product** — `createTask` has no endpoint, so the journey depends on seeded tasks. Every other step is reachable. Gap G-OPS-03.

---

## GJ-2 · The part return loop
**Status: ⚠️ BLOCKED**

```
/tech/card/:id      request return   ⚠️ NO ENDPOINT     → RETURN_REQUESTED
/inventory/returns  accept                              → RETURN_ACCEPTED → RETURNED_TO_STOCK
                    reject                              → RETURN_REJECTED → USED
                    clarify                             → RETURN_CLARIFICATION_REQUESTED
/tech/card/:id      reply            ⚠️ NO ENDPOINT     → RETURN_REQUESTED (loop)
```

**Acceptance criteria.** Stock rises **only** on manager acceptance · `RETURN_PENDING` is always reversed, never left standing · a rejected return returns to the technician, not to the top-level `REJECTED` terminal · the clarify loop may repeat.

**Why BLOCKED.** The manager's half is complete, integrated and tested. The technician's half has no door: `requestReturn`, `respondToClarification`, `resolveRejectedReturn` and `markArrived` all lack endpoints. **The Returns queue can only be filled by the demo seed.** Gaps G-INV-02..05.

---

## GJ-3 · Customer approval, portal and counter
**Status: ✅ PASSING**

Two paths to one outcome, and both matter: the token link is what a message points at; the counter path is what a workshop without a portal uses.

```
/tech/card/:id       raise decision              PENDING
/decide/:token       read (no auth) → respond    → RESOLVED
   or /branch/approvals  record on behalf        → RESOLVED   (attributed to staff)
```

**Acceptance criteria.**
1. The token page needs no login and is scoped to one request. ✅ walked
2. An unacknowledged **critical** rejection is refused server-side. ✅ walked
3. A smuggled price field is refused. ✅ walked
4. Counter approval is **always attributed to staff, never the customer**, under all three `PORTAL_COUNTER_APPROVAL` options.
5. The job leaves the manager's Approvals queue. ✅ walked
6. With `CUSTOMER_PORTAL` disabled, the counter edge still reaches `RESOLVED` — **no decision strands at `PENDING`.**

---

## GJ-4 · Partial payment
**Status: ✅ PASSING**

```
issue invoice        → Invoice, gap-free number, BillingDocument
record payment #1    partial, idempotency key A
record payment #2    remainder, key B          → SETTLE_PAYMENT → READY_FOR_DELIVERY
```

**Acceptance criteria.** Under `FULL_ONLY` a short amount is refused · `outstanding = total − Σ completed payments` · **replaying key A returns the original result, and replaying it with a different amount returns `409 idempotency_conflict`** · the Delivery Gate holds the vehicle while a balance remains and `DELIVERY_BLOCKED_UNTIL_PAID = ALWAYS`.

---

## GJ-5 · External and customer-supplied parts
**Status: 🟡 PARTIAL**

**Acceptance criteria.** A customer-supplied part records **zero cost, labour billed separately, and no stock movement** · `parts.external_resolved` blocks finish until resolved · with `EXTERNAL_PARTS` off, the gate is dropped rather than left unsatisfiable.

**Why PARTIAL.** `PartProvenance` and the gate are real; the intake path for a customer-supplied part is not a first-class control on any page.

---

## GJ-6 · Workshop creation to first job
**Status: ✅ PASSING**

```
/platform/workshops/new    9 stages → one transaction
/invite/accept?token=      owner sets a password, signs in as TENANT_OWNER
/owner/organization        invite staff (plan ceilings enforced)
/owner/pricing             service catalogue
/branch/intake             first job
```

**Acceptance criteria.**
1. Creation writes the **whole shape** or nothing.
2. The browser's preview and the server's refusal use **the same `validateDraft`**.
3. The owner can actually sign in. ✅ walked — *this was a four-phase hole*
4. Plan ceilings refuse the branch, warehouse or seat beyond the limit, **naming the actual limit**. ✅ integration-verified
5. Capabilities chosen at creation shape the first job's route.
6. Responsibility answers produce real `RolePermission` rows, so **no capability is turned on that nobody can operate.**

---

## GJ-7 · Capability change on a live tenant
**Status: ✅ PASSING**

```
/platform/workshops/:id/capabilities   preview → apply
```

**Acceptance criteria.** The validator **refuses** a profile that would strand a job · the preview states the real impact (*"14 jobs are in Payment Pending; turning this off releases all of them"*) · gates owned by the removed capability are dropped and core gates are kept · in-flight records follow the declared `existingRecordsPolicy` · a work order opened before the change is still interpreted against **the profile in force when it opened** (`resolveAsOf`) · the change is audited.

---

## GJ-8 · Blocked job recovery
**Status: ⚠️ BLOCKED**

```
/tech/card/:id   report blocker    → BLOCKED
   ⚠️ resolve blocker — NO ENDPOINT
```

`no_open_blocker` is a **core Finish gate**, so a job that hits a blocker cannot be finished. The only remaining exit is `BLOCKED → CANCELLED`, which is not what a blocker means.

**This is the most consequential blocked journey in the corpus**: it is a reachable state that traps a real job, and the service that clears it (`resolveBlocker`) is implemented, tested and door-less. Gap G-OPS-01.

---

## GJ-9 · Frozen tenant mid-flow
**Status: ✅ PASSING**

**Acceptance criteria.** Freeze shows an impact preview first · every staff login returns `tenant_unavailable` → `/tenant-frozen` · **no data is lost** · the freeze reason is not surfaced to staff · reactivation resumes every job from exactly where it stopped · both are audited.

---

## GJ-10 · Analyst export
**Status: ✅ PASSING** — walked over real HTTP against the dev database

**Acceptance criteria.** The export re-runs **the same `build()` the page renders** · gated twice (`analytics.export`, then the category against `Plan.allowedExports`) · a role without the permission gets 403 · a plan with an empty list locks it outright · every export writes a `LOW`-risk `analytics.export.generated` audit row · the CSV contains real bytes.

**Known limitation, stated on the page:** no analytical page has a date-range filter yet, so an export reflects the server's default range.

---

## Summary

| Journey | Status | Blocker |
|---|---|---|
| GJ-1 Full repair | 🟡 | Task creation has no endpoint |
| GJ-2 Part return loop | ⚠️ | Four technician-side commands have no endpoint |
| GJ-3 Customer approval | ✅ | — |
| GJ-4 Partial payment | ✅ | — |
| GJ-5 External parts | 🟡 | No first-class intake control |
| GJ-6 Creation to first job | ✅ | — |
| GJ-7 Capability change | ✅ | — |
| GJ-8 Blocked job recovery | ⚠️ | **Blocker resolution has no endpoint** |
| GJ-9 Frozen tenant | ✅ | — |
| GJ-10 Analyst export | ✅ | — |

**6 passing · 2 partial · 2 blocked.**

Both blocked journeys, and one of the two partials, close with the **same class of work**: give an existing, tested domain command an HTTP endpoint and a control. That is the cheapest high-value work available in the product today, and it is invisible to every test currently in CI.

---

## Adding a journey

1. **Start from a real day's work**, not from a module.
2. **Name every actor and every page** — a journey that never leaves one role is not a journey.
3. **List the records**, and check each is actually written.
4. **Write acceptance criteria as observations**, not as *"it works"*.
5. **Walk it in a browser** and record what you saw.
6. **Then walk it again on the other seeded tenant.** If it needs a code change, the capability model has a hole in it.
