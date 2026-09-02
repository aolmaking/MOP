# MOP — Data Integrity and Invariants

> **Document ID:** DOC-22
> **Purpose:** the rules that must never break, and where each one is enforced.
> **Authority:** ARCHITECTURAL. **Read this before "fixing" anything.**
> **Scope:** the whole product.
> **Last verified:** 2026-09-01 against commit `a8c8bb5`.
> **Related:** 06 (entities), 09 (stock), 10 (money), 23 (concurrency), 33 (tenancy), 40 (agent guide).

---

## 0. Why this document exists

An agent fixing a symptom can satisfy the symptom and break a guarantee elsewhere. Each rule below is load-bearing: something else in the product is *correct only because this holds*.

**Enforcement column legend:**
`LINT` build fails · `DB` database constraint · `SVC` service refuses · `TEST` asserted · `TYPE` compile error · `CONV` convention only, no mechanism

A rule marked **CONV** is the fragile kind. It is listed so it can be strengthened, not so it can be trusted.

---

## 1. Tenancy

| # | Invariant | Enforcement |
|---|---|---|
| T-1 | Every tenant-scoped row carries `tenantId` | DB (schema) |
| T-2 | Every query filters on the session's tenant | SVC + TEST |
| T-3 | No endpoint accepts a client-supplied `tenantId` | SVC + TEST |
| T-4 | A user in Workshop A cannot see, infer or affect Workshop B — not by URL, aggregate, search box, error message or realtime channel | SVC + TEST |
| T-5 | The only cross-tenant read is Live View, and it carries **counts and event kinds only, never payload** | SVC |
| T-6 | `Tenant.nameNormalized`, `slug` and `customerRegistrationCode` are unique platform-wide | DB |
| T-7 | Saved views resolve ownership from the session, never from the request body | SVC + TEST |
| T-8 | **The seed creates two differently-shaped tenants** — a single-tenant database makes isolation bugs invisible | CONV |

---

## 2. Money

| # | Invariant | Enforcement |
|---|---|---|
| M-1 | Money is `Decimal(12,2)` in the database | DB |
| M-2 | Money crosses the API as a **string**, never a number | **LINT** (`lint-money.mjs`) |
| M-3 | Arithmetic happens in integer minor units | SVC |
| M-4 | More than two decimal places is **refused**, not rounded | SVC |
| M-5 | A value too large to represent exactly is refused | SVC |
| M-6 | `invoice.total = Σ lineTotal (+ tax − discount)` | SVC + TEST |
| M-7 | `amountPaid = Σ completed payments` | SVC + TEST |
| M-8 | `0 ≤ amountPaid ≤ total`, unless a credit note applies | SVC |
| M-9 | An issued `Invoice` is never mutated — only a `CreditNote` follows | SVC + CONV |
| M-10 | `InvoiceSequence` and `CreditNoteSequence` are gap-free per tenant | DB + SVC |
| M-11 | A discounted invoice has an `APPROVED DiscountRequest` **for that work order and that amount**, unless `DISCOUNT_AUTHORITY = ANY_STAFF_UNLIMITED` | SVC + TEST |
| M-12 | A price edit **closes the old `PriceCatalogEntry` and opens a new one** — an old invoice never reprices | SVC |
| M-13 | An approved price is frozen on the chargeable item | SVC |
| M-14 | ⚠️ Halfway rounding has **no single named rule** | **CONV** — E15, doc 37 |

---

## 3. Stock

| # | Invariant | Enforcement |
|---|---|---|
| S-1 | No stock bucket may go negative | **DB CHECK + SVC** |
| S-2 | Every balance change has a `StockMovement`; a balance with no movement is a defect | SVC + TEST (`replay()`) |
| S-3 | **`availableQty` rises from a return only when the Inventory Manager accepts it** | SVC |
| S-4 | `RETURN_PENDING` is always reversed by a `RETURN_TO_STOCK` or `DAMAGED` of the same quantity — **never left standing** | SVC |
| S-5 | A warehouse holding stock cannot be deactivated (`BLOCK_UNTIL_ZERO`) | SVC + TEST |
| S-6 | `(inventoryItemId, warehouseId)` is unique in `WarehouseStockBalance` | DB |
| S-7 | `sku` is unique per tenant | DB |
| S-8 | Cost is absent from the response without `inventory.cost.view` | SVC + TEST |
| S-9 | `returnPendingQty` may go transiently negative — it is a reconciliation counter, not a count of objects | DB (deliberate exception) |

> S-1 is enforced twice on purpose. **Service code is a promise; a constraint is a fact.**

---

## 4. Workflow

| # | Invariant | Enforcement |
|---|---|---|
| W-1 | **`WorkOrderLifecycleService` is the only writer of `WorkOrder.status`** | CONV + TEST + code review. *A grep for a hardcoded status write must return nothing* |
| W-2 | After any capability change, **every reachable non-terminal state still reaches a terminal state** | **TEST** — validator, all shipped profiles |
| W-3 | **A policy may never change reachability** | **TEST** — `graph-safety.spec.ts`, every option × every profile |
| W-4 | A policy condition on an edge depends on the same capability the edge requires | TEST |
| W-5 | Graph states match the Prisma enum exactly | CONV + TEST |
| W-6 | **A state with no edge reaching it does not exist**, whatever the enum says | CONV — ⚠️ currently violated by four `PartRequestStatus` values |
| W-7 | Declaration order is precedence for edges sharing an intent | CONV — carries a comment saying so |
| W-8 | A gate belongs to the capability that produces what it checks, and dies with it | TYPE + TEST |
| W-9 | Core gates (`owner: null`) can never be dropped | TEST |
| W-10 | A gate refusal returns **every** unsatisfied gate | SVC + TEST |
| W-11 | Gates are evaluated against the same profile that routed the transition | SVC |
| W-12 | A missing fact is false — never assumed risk-flagged, never assumed exempt | SVC |
| W-13 | "Open" is derived from `WORK_ORDER_GRAPH.terminal`, never a second hardcoded list | CONV |

---

## 5. Capability and policy

| # | Invariant | Enforcement |
|---|---|---|
| C-1 | **An absent capability key means `ENABLED`** — a profile records deviations | SVC (`isCapabilityActive`, one function) |
| C-2 | Every non-core capability carries a complete `RemovalPolicy` | TYPE |
| C-3 | A core capability (`removal: null`) can never be disabled | TEST |
| C-4 | Capability sits **above** role and user override in the resolver | TEST |
| C-5 | `TenantCapability` and `WorkshopPolicy` are time-ranged, never overwritten | SVC |
| C-6 | Historical records are interpreted against the profile in force at the time | SVC (`resolveAsOf`) |
| C-7 | An `ENFORCED` policy names real, existing consumers | **TEST** — `policy-consumers.spec.ts` |
| C-8 | A `RECORDED` policy names no consumers, and the UI says so | TYPE + CONV |
| C-9 | The policy relevance graph is acyclic | TEST |
| C-10 | A relevance predicate cannot read an undeclared dependency | SVC (scoped `priorAnswers`) |

---

## 6. Permissions

| # | Invariant | Enforcement |
|---|---|---|
| P-1 | **Deny by default.** If every layer defers, deny stands | SVC + TEST |
| P-2 | The layer array is iterated in order | TEST |
| P-3 | `locked: true` short-circuits — no lower layer may override | TEST |
| P-4 | Layers are pure over a per-request context; none queries the database | TYPE + TEST |
| P-5 | Every literal reaching the resolver is a declared key | **LINT** |
| P-6 | An absent role-template row is safe (defer → deny) | SVC |
| P-7 | A permission is not a claim about a specific record — ownership is checked separately | CONV + TEST |
| P-8 | **Restricted data is absent from the response, never hidden client-side** | CONV + TEST |
| P-9 | A control the user may never reach is absent, not disabled | CONV |
| P-10 | A delegated permission is denied until its switch is on, whatever the template says | SVC + TEST |

---

## 7. Audit and events

| # | Invariant | Enforcement |
|---|---|---|
| A-1 | **No `AuditLog` write outside `apps/api/src/audit/**`** | **LINT** — build fails |
| A-2 | Audit rows are insert-only | CONV |
| A-3 | `actorName` is denormalised so a row stays readable after the account is gone | SVC |
| A-4 | Event keys come from the closed union | TYPE |
| A-5 | Every significant action emits its event **before** fanning out | CONV |
| A-6 | `requestId` correlates events with the request that caused them | SVC |
| A-7 | Closing a time-ranged row is itself audited (`policy.expired`) | SVC |

---

## 8. Records and deletion

| # | Invariant | Enforcement |
|---|---|---|
| R-1 | **No hard delete of anything with history** | **LINT** (`lint-no-hard-delete.mjs`) |
| R-2 | `WorkOrderNote` is append-only — no update or delete path exists | SVC + schema |
| R-3 | `ControlSetting` is soft-deleted | SVC — H10 was a real bug |
| R-4 | Branch, asset and customer are `Restrict` on a work order | DB |
| R-5 | A branch cannot be deactivated while non-terminal work orders exist | SVC |
| R-6 | `SpecializationEntry` pins its definition version | SVC |
| R-7 | One open `AssetOwnershipHistory` row is the current owner; closed rows persist | SVC |

---

## 9. Presentation

| # | Invariant | Enforcement |
|---|---|---|
| U-1 | **No physical-direction CSS** (`margin-left`, `padding-right`, …) | **LINT** |
| U-2 | Touch targets meet the minimum | **LINT** |
| U-3 | A list looks identical at 1 row and 100,000 — scale shows in pagination, never layout | CONV |
| U-4 | A section with nothing meaningful is **absent, not empty** | CONV |
| U-5 | Every page handles all six states: loading, empty, error, restricted, partial, full | CONV |
| U-6 | Empty is a valid, desirable state — an empty Attention Center is a good day | CONV |
| U-7 | The browser never duplicates a policy decision; it reflects what the API resolved | CONV |

---

## 10. Concurrency

Summarised here, detailed in doc 23.

| # | Invariant | Enforcement |
|---|---|---|
| X-1 | Payment idempotency is a **unique constraint**, not a check-then-write | DB |
| X-2 | Replaying a key with different content returns `409`, never a silent success | SVC + TEST |
| X-3 | A caller holding a row lock passes its transaction into the lifecycle, so the decision and the write cannot separate | SVC + TEST (H1) |
| X-4 | Invoice creation and its billing document are one transaction — a compliance refusal rolls back the whole invoice | SVC + TEST |
| X-5 | Staff status writes `Account.status` and the `StaffUser` mirror in one transaction | SVC |
| X-6 | Workshop creation is one transaction — the whole workshop or none of it | SVC |
| X-7 | Scheduled work is serialised by a Postgres advisory lock | SVC |
| X-8 | Team membership changes are transaction-guarded against double-submit (H8) | SVC + TEST |

---

## 11. Testing

| # | Invariant | Enforcement |
|---|---|---|
| V-1 | **Integration tests run against real Postgres.** Mocks prove nothing about constraints, transactions or cascades | CONV — 62 integration specs |
| V-2 | A test asserting isolation must actively try to cross it | CONV |
| V-3 | A restriction is asserted at the **API response level**, not the UI | CONV + TEST |
| V-4 | A claim of completion names its proof | CONV |

---

## 12. Currently violated

Honest register. Each is a defect against a rule above, not a rule that has been relaxed.

| Rule | Violation |
|---|---|
| **W-6** | `WAREHOUSE_REVIEWING`, `IN_TRANSIT`, `WAITING_TRANSFER`, `WAITING_SUPPLIER` exist in `PartRequestStatus`, are **read by three services**, and no edge or writer reaches them |
| **M-14** | Halfway rounding has no single named rule |
| **P-8** *(risk, not breach)* | Customer authorization bypasses the resolver; the rule holds today because the portal services shape their own responses, but it holds by care rather than by mechanism |
| **W-1** *(fragile)* | Enforced by convention and review only. A lint rule would make it structural, matching how A-1 and M-2 are handled |
| **U-3, U-4, U-5, V-1..V-4** | All **CONV**. They are real standards with no mechanism behind them |

## 13. How to add an invariant

1. **State it as something that must always be true**, not as a procedure.
2. **Pick the strongest available enforcement.** Prefer DB > LINT > TYPE > TEST > SVC > CONV. A rule that only lives in a document will be broken by someone in a hurry.
3. **Write the test that proves it, and make it fail first.**
4. **Add it here, with its enforcement.**
5. **If you can only reach CONV, say so** — an honest weak rule is worth more than a strong-sounding one nobody enforces.
