# Edge Case Register

> Maps all 20 edge cases (`EDGE_CASES_HARD.md`, `EDGE_CASES_EXTREME.md`)
> to the phase that owns fixing them. Unlike `docs/scenarios/` and
> `docs/scenarios2/`, this pass did not earn new phase numbers — every
> finding here is a hardening item against a system that already exists
> or is already planned, not a missing structural concept. Per
> `PHASE_MAP.md`'s rule 7, a discovery pass earns a phase only when the
> gap is structural; these are the opposite case, and are recorded
> against the phase that already owns the affected system.
>
> A phase is not "done," per `PHASE_MAP.md`'s definition of done, while
> an edge case attributed to it below is neither fixed nor explicitly,
> reasonedly deferred with that deferral recorded here.

| # | Finding | Owning phase | Status |
|---|---|---|---|
| H1 | Concurrent blockers on one work order can overwrite each other | 4 — Operations Spine | ✅ **fixed** — the real gap was the WorkOrder-unblock decision: `resolveBlocker`'s "is anything else still open" count, and the resulting move back to `IN_PROGRESS`, were a separate query and a separate transaction from a concurrent `reportBlocker`'s insert, so the count could read zero a moment before a genuinely new blocker committed. Closed two-part: (1) both methods now take a `FOR UPDATE` lock on the work order first, serializing report/resolve against each other, same discipline as H6/E16; (2) `WorkOrderLifecycleService.apply()` gained an optional `tx` so the actual status write folds into that same locked transaction instead of a second one afterward -- the first attempt at this fix (lock only, decision still applied via a separate transaction) was caught by its own regression test failing 2 of 3 runs, which is what surfaced the need for part 2 |
| H2 | Capability check-then-write gap around `PartRequestService.approve()` | 3 / 7 | ✅ **fixed** — `transition()`, the single shared writer behind every status change on the entity (approve, reject, issue, return flows, all of it), read `request.status` before its transaction opened and wrote a plain update-by-id with no guard against it having changed since. Rewritten to `updateMany({ where: { id, status: request.status } })`, checked against `.count`, mirroring `WorkOrderLifecycleService`'s own guarded update. Proven by a concurrent approve/reject integration test |
| H3 | Invoice numbering is `count()+1`, not the unused `invoice_sequences` table | 8 — Finance Core | ✅ **fixed** — rewritten to a single atomic `INSERT ... ON CONFLICT DO UPDATE` against `invoice_sequences`, proven by a 10-way concurrent-issuance integration test |
| H4 | Customer decision can land against an already-closed work order | 4 — Operations Spine | ⬜ open |
| H5 | Idempotency key check-then-insert race in `recordPayment()` | 8 — Finance Core | ✅ **fixed** — the upfront `findUnique` was always a fast path, never the guarantee; the DB's unique constraint on `idempotencyKey` was already real, but its violation propagated as a raw 500 instead of resolving as a retry. Now caught (P2002) and re-resolved through the same same-invoice/same-amount comparison the upfront check uses. A second race found while testing this one: the "already settled" check could also misfire against a legitimate concurrent retry of the exact payment that had just settled the invoice — fixed the same way. Proven by two new concurrency tests firing simultaneous real requests at Postgres |
| H6 | Stock decrement may be read-then-write rather than one atomic `UPDATE` | 7 — Inventory | ✅ **fixed** — confirmed broken (plain `findUnique`, no lock), rewritten to `SELECT ... FOR UPDATE`, proven by a concurrent-request integration test |
| H7 | No described path for deactivating a warehouse with nonzero stock | 7 — Inventory | ⬜ open |
| H8 | Double-click on team-membership move can race its own transaction | 5 — Branch Manager (Team Setup) | ✅ **fixed** — the schema has no partial unique index enforcing "at most one active membership per technician" (Prisma's `@@unique` can't express a `WHERE endedAt IS NULL` condition), so that guarantee lived in application logic alone, and the `current` membership read happened before `moveTechnician`'s transaction opened. Two concurrent moves of the same technician could both read the same current membership and both create a new one. Fixed by locking the `StaffUser` row and re-reading `current` inside that same locked transaction. Proven by a concurrency test firing two simultaneous moves at real Postgres |
| H9 | RTL-override/zero-width characters break slugs, PDFs, audit rendering | 1 — Runnable and Provable (i18n/RTL foundation) | ⬜ open |
| H10 | `ControlSetting` rows must never be hard-deleted, only deactivated | 18 — Tenant Relationships (Delegation, from Phase 5) | ⬜ open |
| E11 | No stated policy for a warranty period landing on Feb 29 | 15 — Specialization Discovery (warranty field) | ⬜ **decide before build** |
| E12 | Clock skew between API replicas disagrees about token/window expiry | 13 — System Automation, 20 — Operational Resilience | ⬜ open |
| E13 | Capability rollback racing an in-flight lifecycle transition | 3 — Governance Runtime | ⬜ **design spike required** |
| E14 | Two opposite platform actions (freeze/reactivate) race the same tenant | 19 — Governance Depth (24.1–24.3's control lever) | ⬜ open |
| E15 | Halfway-point rounding needs one named, explicitly documented rule | 8 — Finance Core | ✅ **already resolved** — verified on inspection: `roundHalfUp()` in `packages/shared/src/money/money.ts` is the single named function, used everywhere, and the convention (half-up, matching a human's paper arithmetic) is documented inline and in `PHASE_8.md` §2 |
| E16 | `READ COMMITTED` anomaly verification for the stock decrement statement | 7 — Inventory | ✅ **fixed** — same fix as H6; `stock.integration.spec.ts`'s "concurrent issues of the last unit" suite fires genuinely simultaneous requests and asserts exactly one wins |
| E17 | Schema migrations against a dormant/archived tenant's data | 18 — Tenant Relationships (18.D) | ⬜ open |
| E18 | No lazy-rehash path or version tracking for password hashes | 1 — Runnable and Provable (auth baseline) | ⬜ open |
| E19 | Stale decision-link token resolves against a since-reassigned asset | 4 — Operations Spine / 11 — Customer Portal | ⬜ open |
| E20 | No documented database-failover recovery procedure | 20 — Operational Resilience at Scale | ⬜ **documentation + config decision** |

## How to read "verify first"

Three items (H6, E16, E13) are flagged differently from the rest: they
are not confirmed bugs, they are confirmed **unverified claims**. The
codebase's own comments and migration names assert the stock-never-
negative guarantee is real; this pass could not confirm from static
reading alone whether the underlying `UPDATE` is atomic or read-then-
write. The honest next step for these three is a targeted read of the
generated SQL plus a concurrency-specific integration test — exactly
the kind of test this project's rigorous-but-sequential integration
suite has never needed before, because no scenario before this pass
ever asked "what if two of these happen at literally the same time."

## Severity note

Of the 20, four touch money or legal correctness directly (H3, H5, E11,
E15) and should be prioritized over the rest regardless of numeric
difficulty — a rounding or invoice-numbering defect compounds silently
over volume and is far more likely to actually occur than a database
failover (E20), even though E20 reads as the more dramatic finding.
