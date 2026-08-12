# Edge Cases — Hard (1–10)

> **Third discovery pass.** Where `docs/scenarios/` watched a workshop's
> day and `docs/scenarios2/` watched the platform's console, this pass
> is not persona-driven at all. It is a direct audit for **rare
> conditions that a real, running deployment will eventually hit**: two
> requests landing in the same millisecond, a clock that moves in an
> unexpected direction, a soft-delete distinguishing itself from a hard
> one, a table that exists in the schema but is never actually read.
> None of these are common. All of them are the kind of thing that,
> unhandled, becomes a 2am incident with a customer's money or a
> workshop's data on the wrong side of it.
>
> Each entry names the concrete mechanism, cites the real code where
> possible, and states the fix direction. See
> [`EDGE_CASE_REGISTER.md`](./EDGE_CASE_REGISTER.md) for which phase
> owns each one.

---

## H1 — Two blockers on the same work order, same instant

Two technicians on a two-lift job (a rare but real setup — a large
repair with two people working different areas of the same car) each
hit **Report blocker** within the same request window. Both calls reach
`WorkOrderLifecycleService`'s blocker-routing path concurrently. If the
escalation write (work order → `ESCALATED`, or whatever state a
blocker routes to) is read-then-write rather than a single atomic
update, the second write can silently overwrite the first blocker's
reason and actor, leaving the Attention Center showing only one
blocker when two are real, and leaving the technician who lost the
race believing their report was recorded when it was clobbered.

**Fix direction:** blockers on one work order are a list, not a
singleton the lifecycle service overwrites — verify the schema already
supports multiple concurrent blocker rows per work order, and if the
*routing/escalation* decision is a single derived field, derive it from
the full list on every write rather than trusting the caller's view of
"the" current blocker.

## H2 — A capability is disabled mid-flight, between check and write

`inventory.request.approve` is checked (deny-by-default, per the
resolver) at the start of `PartRequestService.approve()`. Between that
check and the write, a platform capability change disables `INVENTORY`
for the tenant. The approval completes anyway, because the permission
check ran once, at entry, not at the moment of the write itself.

**Fix direction:** for any write whose legitimacy depends on a
capability being active, re-check immediately before the write inside
the same transaction, not only at the controller boundary — the
capability engine's own reachability guarantee assumes transitions
happen under a consistent capability snapshot, and a check-then-write
gap breaks that assumption exactly like a stock check-then-decrement
gap would (see H6).

## H3 — Invoice numbering is `count() + 1`, not a real sequence

`FinanceService.nextInvoiceNumber()` computes the next invoice number
as `tx.invoice.count({ where: { tenantId } }) + 1`, inside the calling
transaction, with the `(tenantId, invoiceNumber)` unique constraint as
"the backstop," per its own comment. **The schema already has an
`invoice_sequences` table** (`@@map("invoice_sequences")`,
`packages/database/prisma/schema.prisma:1225`) that nothing in
`finance.service.ts` reads or writes — the real atomic-sequence
mechanism exists in the data model and is unused.

Under concurrent invoice issuance for the same tenant (two branches of
a multi-branch workshop both closing out at end of day), two
transactions can both count `N` before either commits, both compute
`INV-00000N+1`, and the second's insert fails on the unique
constraint — a real transaction abort, at the worst possible moment
(closing a customer's invoice), with no described retry.

**Fix direction:** either use `invoice_sequences` as a real atomic
counter (`SELECT ... FOR UPDATE` or a Postgres sequence), or, if
`count()+1` is being kept deliberately for auditability reasons, add an
explicit retry-on-conflict loop around the transaction so a losing
request quietly gets the next available number instead of surfacing a
raw constraint error to whoever is closing the till.

## H4 — A customer approves a decision after the work order is closed

The customer-decision link is real, tested, and correctly scoped by
token. It has no check, at the moment the customer's approval is
submitted, for whether the work order it targets has since been
cancelled or closed by the branch manager for an unrelated reason (the
car was towed away, the customer paid cash and left). The approval
write lands against a dead work order.

**Fix direction:** `DecisionService`'s accept path should re-check the
work order's current status immediately before writing the decision,
and return a distinct, honest response — "this job has already been
closed" — rather than silently recording an approval nobody will ever
read.

## H5 — Idempotency key: check-then-insert has its own race

`FinanceService.recordPayment()` does `prisma.payment.findUnique({
where: { idempotencyKey } })`, then, if nothing is found, inserts a new
payment inside a transaction. Two retried requests carrying the same
key, arriving within milliseconds of each other (a flaky client retry
firing twice before the first response returns), can both pass the
`findUnique` check before either has inserted, and both attempt the
insert — the second fails on the `idempotencyKey` unique constraint
rather than being recognized as the legitimate replay the whole
mechanism exists to handle gracefully.

**Fix direction:** catch the unique-constraint violation on insert and,
on catching it, re-run the existing-payment comparison (same
invoice, same amount → return the original result; otherwise the real
409) — the same graceful-replay outcome the code already correctly
implements for the *sequential* case, extended to the *concurrent* one.

## H6 — Stock check-then-decrement under real concurrency

Per `CLAUDE.md` and the schema's own comment, stock is "never negative,
enforced in the database" via a CHECK constraint added in migration
`20260809203000_stock_never_negative`. What has not been verified: does
`StockService.record()` compute the new `availableQty` in application
code and then `UPDATE ... SET availableQty = <computed>`, or does it
issue an atomic `UPDATE ... SET availableQty = availableQty - x WHERE
availableQty >= x`? If it's the former, two technicians requesting the
last unit of a part at the same instant can both read `availableQty:
1`, both compute `0`, and the CHECK constraint only catches a
transaction that would drive the value *below* zero — it does not
prevent two transactions from both legitimately decrementing from 1 to
0, over-issuing one unit that was never really there twice.

**Fix direction:** confirm the actual `UPDATE` statement shape in
`stock.service.ts`; if it is read-then-write, convert to a single
conditional `UPDATE` (or a `SELECT ... FOR UPDATE` row lock) so the
CHECK constraint is a true backstop for a bug, not the primary
correctness mechanism for a case that happens routinely.

## H7 — A warehouse is deactivated with nonzero stock still on the books

Nothing in the inventory scenarios or the current schema review
describes what happens when a `Warehouse` is deactivated (a branch
closes, per Workshop 6's split scenario, or simply a storeroom is
retired) while its `WarehouseStockBalance` rows are still nonzero.
Deactivation, if it exists at all as an action distinct from deleting
the row outright, leaves that stock permanently unreachable — not
issuable, not transferable, not written off — because every stock
operation in `PART_REQUEST_GRAPH`'s issue/transfer paths presumably
requires the source warehouse to be active.

**Fix direction:** deactivating a warehouse should require its stock
balances to be zero first, or should force an explicit write-off/
transfer-out step as part of the deactivation flow — never leave phantom
stock behind a closed door.

## H8 — Double-click on a team-membership move

`TeamSetupService.moveTechnician()` is correctly written as one
transaction ending the old membership and starting the new one
together — a real, good fix for the single-request case. A double-click
on the "Add technician" button (the exact kind of accidental double-
submit any web form is vulnerable to) fires two requests for the same
technician and team in quick succession. The first's transaction ends
the old membership and starts the new one; if the second request's
`findFirst` for the "current" membership races against the first's
write and reads the pre-transaction state, the second request could
attempt to end an already-ended membership and start a second, duplicate
active row for the same technician on the same team.

**Fix direction:** either debounce the button client-side (already the
pattern used elsewhere in this codebase for search inputs) or add a
partial unique index / check ensuring at most one `endedAt: null`
`TeamMembership` row exists per `(tenantId, technicianId)`, so the
database itself refuses the duplicate regardless of client behavior.

## H9 — Right-to-left override characters in a workshop or customer name

A workshop name or customer name containing a Unicode RTL-override
character (U+202E) or a zero-width joiner, entered accidentally by a
customer pasting from a messaging app, can visually reorder or hide
characters wherever it's rendered — in an audit-log actor name, in a
generated invoice PDF, in the Workshops list's search results — and can
break naive slug generation (`deriveSlug()` in the Add Workshop page)
if it isn't stripped before the lowercase/hyphenate pass.

**Fix direction:** sanitize or reject bidi-control characters at the
point of entry for any field that becomes a slug, a filename, or a
legal document's printed text — an RTL-aware product (this one,
deliberately) has to be more careful here than an LTR-only one, not
less, because legitimate Arabic text and a malicious override character
look identical to a naive length/charset check.

## H10 — A `ControlSetting` row is hard-deleted instead of deactivated

`ControlSetting` (the table backing platform locks and the team-setup
delegation flag) has an `active: Boolean` column specifically so a
setting can be turned off without losing its history — the delegation
layer's own read filters on `active: true`. If a row is ever
hard-deleted directly (a manual cleanup script, a support engineer
"tidying up" without going through the product), the distinction
between "never granted" and "granted, then explicitly revoked, for a
recorded reason" is destroyed — which matters the moment anyone needs
to answer "was team management ever delegated at this workshop, and
when was it taken back" for an audit or a dispute.

**Fix direction:** no code path outside the platform's own service
layer should ever delete a `ControlSetting` row; if a cleanup need is
real, it should be a documented, reviewed, audited operation, and
ideally the table should not expose a delete capability in its Prisma
client usage at all — only `active: false` writes, mirroring the
audit-boundary discipline already enforced for `AuditLog`.
