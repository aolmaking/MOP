# MOP — Concurrency, Idempotency and Transactions

> **Document ID:** DOC-23
> **Purpose:** every place two things can happen at once, and what stops them corrupting each other.
> **Authority:** ARCHITECTURAL.
> **Scope:** row locks, advisory locks, transaction boundaries, idempotency keys, retry safety.
> **Last verified:** 2026-09-01 against commit `a8c8bb5`.
> **Source of truth:** `scheduler-lock.service.ts`, `stock.service.ts`, `technician-work.service.ts`, `finance.service.ts`, `team-setup.service.ts`, `docs/archive/discovery/scenarios3/EDGE_CASE_REGISTER.md`.
> **Related:** 22 §10, 10 (payments), 09 (stock), 26 (schema).

---

## 1. Why this is its own document

MOP's central claim is that *five systems must agree about one physical event*. Concurrency is where that claim is hardest to keep: two people pressing two buttons a hundred milliseconds apart, on two replicas, against one row.

Every mechanism below exists because a specific race was found — most of them recorded in the edge-case register with an id.

## 2. The four mechanisms

| Mechanism | Used for | Where |
|---|---|---|
| **Row lock** (`SELECT … FOR UPDATE`) | Serialising two writers against one record | Stock, blockers, team membership |
| **Transaction-scoped advisory lock** (`pg_try_advisory_xact_lock`) | Single-flight across replicas | Scheduler |
| **Unique constraint** | Idempotency and duplicate prevention | Payments, sequences, `sku`, tenant identifiers |
| **Caller-supplied transaction** | Keeping a decision and the write that acts on it inseparable | Lifecycle, audit, stock |

**Preference order: constraint > lock > check-then-write.** A constraint is a fact; a lock is a discipline; a check-then-write is a hope with a window in it.

---

## 3. Payment idempotency — the flagship

> *"The thing that actually prevents a duplicate payment is `Payment.idempotencyKey`'s unique constraint."*

`FinanceService.recordPayment`:

```
1. look up by idempotencyKey
     found, same amount and method  → return the original result
2. not found → insert inside a transaction
3. concurrent insert wins the race → the unique constraint fires
     → re-read by key → return that result
4. same key, different amount or method → 409 idempotency_conflict
```

Step 4 matters as much as step 3. Replaying a key with different content is a **client bug, not a retry**, and letting it succeed silently would produce two different truths under one identity.

Step 3 is why the constraint is load-bearing rather than decorative: the lookup in step 1 has a window, and the constraint closes it. `[VERIFIED]` by `finance.integration.spec.ts` against real Postgres.

---

## 4. Stock issue — `FOR UPDATE` on the balance row

Two technicians requesting the last brake pad at the same instant would both be issued it under a naive read-then-write. `StockService.record()` takes `FOR UPDATE` on the balance row inside its transaction, so the second waits and then sees the real remaining quantity.

Behind it sits the DB `CHECK` constraint (S-1): even if a lock were ever missed, a negative quantity of a physical object cannot be written.

`record()` accepts a caller's transaction, so a movement and the domain change that caused it commit together — a stock movement without its part-request transition, or the reverse, is exactly the "product lies" failure of doc 01 §1.

---

## 5. Blockers — edge case H1, and the `tx` parameter

The race: `reportBlocker` on task A and `resolveBlocker` on task B, on the same work order, at the same moment. `resolveBlocker`'s decision — *"nothing else is blocking this work order any more"* — is computed, and then the status write happens. In between, `reportBlocker` lands a new blocker. The job goes to `IN_PROGRESS` while blocked.

Two halves to the fix:

1. **Both methods take the same `FOR UPDATE` lock** on the work-order row, so they serialise.
2. **`WorkOrderLifecycleService.apply()` accepts `options.tx`**, so the caller that already holds the lock folds the status write into *that* transaction rather than opening a second one afterwards.

Without the second half, the decision and the write are still two transactions and a second caller's decision can land in the gap. Every other caller omits `tx` and gets the original self-contained transaction, unchanged.

> This is the general shape worth remembering: **a lock that does not extend to the write it authorises is not a lock.**

---

## 6. Team membership — edge case H8

Double-clicking *move technician* raced the membership transaction. `TeamSetupService` takes `FOR UPDATE` on the `staff_users` row.

---

## 7. Invoice issuance — one transaction, including the refusal

```
resolve UNCOVERED_COUNTRY_BILLING          ← outside, before opening
enforceDiscountAuthority                    ← outside, before opening
BEGIN
  freeze running lines → invoice lines
  allocate the number from InvoiceSequence
  create Invoice
  BillingService.issueDocument(...)         ← may THROW
  emit invoice.issued
  audit finance.invoice.issued
COMMIT
```

The compliance refusal happens **inside** the transaction, so under `BLOCK` the entire invoice rolls back — not just the billing document. An invoice existing without a legally valid document is precisely the inconsistency the Finance/Billing split exists to prevent.

The policy is resolved **before** the transaction opens, deliberately: a policy read is a query, and holding a transaction open across avoidable work widens every window in it.

---

## 8. The scheduler — advisory lock, not a worker

`@nestjs/schedule`'s `@Cron` fires **inside every process that loads the module**. One replica, one tick; two replicas, two ticks at the same instant, each believing it is the only one.

`SchedulerLockService.runExclusively(jobKey, work)` wraps the job in a transaction and takes `pg_try_advisory_xact_lock(hashtext(jobKey))`.

Four properties, each chosen:

- **Transaction-scoped** — auto-released the instant the transaction ends, so a crashed replica can never leave the lock held forever.
- **`_try_`, not `_lock`** — non-blocking. A losing replica does not wait; it is told *someone else has this tick* and returns immediately.
- **Returns `null`, not a rejection** — losing the race is the expected, common case, not a failure.
- **`hashtext(jobKey)`** — a job name reads as a name in the calling code, instead of a magic integer somebody has to keep unique by hand.

Phase 13 was **deliberately narrowed to a lock rather than a separate worker process**, and recorded as such. A worker remains a `[DEFERRED]` scaling option, not a missing feature.

---

## 9. Other transaction boundaries

| Operation | Why one transaction |
|---|---|
| **Workshop creation** | The whole workshop or none of it — tenant, capabilities, policies, finance config, branches, warehouses, grants, prices, specialisations, permissions, owner, version snapshot |
| **Staff activate / lock** | `Account.status` **and** the `StaffUser` mirror. Two sources of *is this person allowed in* would eventually disagree |
| **Capability apply** | Profile change + audit |
| **Part issue** | `PartRequest` transition + `StockMovement` + balance |
| **Return accept** | Transition + reversing movement + balance |
| **Lifecycle transition** | Status write + `OperationEvent` + audit |
| **Refund approve** | `RefundRequest` + `CreditNote` + sequence |

**Audit writes take the transaction.** An audited action that succeeded while its audit row failed would be worse than no audit at all.

---

## 10. Retry safety

| Operation | Safe to retry? | Why |
|---|---|---|
| `POST /finance/invoices/:id/payments` | **Yes** | Idempotency key |
| Lifecycle transitions | **Yes, harmlessly** | A second attempt from the new state is refused with `transition_not_allowed` |
| Part issue | **No** | No idempotency key — a retry could issue twice. See §12 |
| Staff invite | **Partially** | Plan-limit check runs first; a duplicate email is refused |
| Capability apply | **No** | Not keyed |
| CSV export | **Yes** | Read-only, though each writes an audit row |

---

## 11. Known races, from the edge-case register

| Id | Race | State |
|---|---|---|
| **H1** | Concurrent blockers vs. resolution | ✅ fixed — §5 |
| **H2** | Capability check-then-write gap | ✅ fixed |
| **H3, H5** | Finance races | ✅ fixed |
| **H4** | A decision landing on an already-closed work order | ✅ fixed |
| **H6 / E16, H7** | Warehouse deactivation with stock | ✅ fixed — `BLOCK_UNTIL_ZERO` |
| **H8** | Double-click races team membership | ✅ fixed |
| **H10** | `ControlSetting` hard delete | ✅ fixed — soft delete |
| **E18** | Password-hash upgrade | ✅ fixed — versioned hashes, lazy rehash |
| **E19** | Stale-ownership decision | ✅ fixed — **flagged in the audit trail rather than blocked**, because refusing would strand a real customer answer |
| **E13** | **Capability rollback racing an in-flight lifecycle transition** | 🔴 **open** — design spike owed |
| **E15** | Halfway-point rounding | 🔴 open as a *specification* gap |
| **H9** | Slug pattern / PDF-audit rendering | 🟡 partially fixed |

E19's resolution is worth noting as a pattern: **when refusing would destroy real information, record the anomaly instead of blocking.**

---

## 12. Gaps

| Gap | Detail |
|---|---|
| **E13** | The only open race. A capability rollback applied while a work order is mid-transition has no defined outcome |
| **No idempotency key on non-payment mutations** | Part issue, capability apply, staff invite. A double-submitted issue could move stock twice |
| **No optimistic concurrency on work orders** | Two managers editing one job overwrite each other last-write-wins. No `version` column |
| **No global request-level idempotency** | Only payments carry a key. A general `Idempotency-Key` header convention would generalise the pattern |
| **Advisory lock is scheduler-only** | Nothing else uses one; long-running per-tenant operations (capability apply on a large tenant) are not single-flighted |

## 13. Rules for new code

1. **Prefer a constraint to a lock, and a lock to a check-then-write.**
2. **A lock must extend to the write it authorises** — pass the transaction down, do not re-open one.
3. **A mutation that money or stock depends on needs an idempotency key**, and a replay with different content must return `409`, never succeed.
4. **Resolve policies and capabilities before opening a transaction.** Do not hold one open across avoidable queries.
5. **Take the audit write inside the transaction.**
6. **Losing a race is not an error** when the operation is single-flight — return "someone else has this", not a rejection.
7. **When refusing would destroy real information, record the anomaly instead** (E19).
