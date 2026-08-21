# Edge Cases — Extremely Hard (11–20)

> Continuation of [`EDGE_CASES_HARD.md`](./EDGE_CASES_HARD.md). These
> ten are harder in a specific sense: each one requires **two or more
> systems to be in an unusual state at the same instant** — a clock
> disagreeing with itself, a migration running against dormant data, a
> database failover mid-transaction. None will show up in ordinary
> testing. All of them are the class of bug that, when it does happen,
> is expensive, hard to reproduce, and easy to misdiagnose as something
> else entirely. See [`EDGE_CASE_REGISTER.md`](./EDGE_CASE_REGISTER.md)
> for phase ownership.

---

## E11 — A warranty period defined in months has no answer for Feb 29

A battery's 12-month warranty, or a Workshop-A-style workshop-defined
service-card warranty field (once Phase 15 exists), fitted on 29
February of a leap year. "Add 12 months" lands on 29 February of the
following year — which does not exist, three years out of four.
Every date library resolves this differently by default (clamp to the
28th, roll forward to 1 March, or throw), and nothing in the codebase
has a stated policy, because no warranty field exists yet to have hit
this. The day this ships, whichever library default was silently
inherited becomes the workshop's actual legal warranty policy, decided
by an implementation detail nobody chose on purpose.

**Fix direction:** decide and document the rule explicitly (this
project's convention of never leaving a decision implicit applies as
much to a date library default as to a schema choice) before Phase 15's
warranty field ships — most defensible answer is "warranty is valid
through the last day of the ending month," stated in the spec, not
inherited from whichever `date-fns`/`Temporal` behavior happens to be
in play.

## E12 — Clock skew between API replicas disagreeing about "now"

Once the platform runs more than one API replica (implied by Phase
13's own stated reason for moving background jobs to a separate worker
— "the current in-process scheduler double-fires the moment there are
two API replicas"), every `Date.now()`-based check — invite-token
expiry, the auth rate limiter's window, an idempotency key's implicit
time bound if one exists — is evaluated against **that replica's**
clock. Real, if small, clock skew between two containers (a few hundred
milliseconds under normal NTP drift, more under a misconfigured
container platform) means a request rejected as "expired" by replica A
at 23:59:59.9 can succeed against replica B still reading 23:59:59.6,
if the load balancer routes the retry differently — a real, if narrow,
window where the same logical request gets two different, both
individually defensible, answers.

**Fix direction:** anything security- or money-sensitive that depends
on wall-clock comparison should either tolerate a documented skew
window explicitly (treat "expired 200ms ago" as still valid) or derive
"now" from the database's clock (`NOW()` in the same query) rather than
the application server's, since the database is the one source of time
every replica already has to agree with for transactional correctness
anyway.

## E13 — Capability rollback while a work order is mid-transition

Phase 3's capability change pipeline is "draft → validate → live-data
preconditions → impact preview → apply → audit → **rollback**." Imagine
a workflow edge that only exists under a capability profile is rolled
back at the exact instant a work order is inside
`WorkOrderLifecycleService`'s own transaction, having already passed
its own gate checks against the *pre-rollback* graph, and is about to
write its new status. If the rollback's `apply` step and the lifecycle
service's transition write are not mutually exclusive — no shared lock,
no serializable isolation between "which capability graph is
current" and "commit this transition" — the work order can complete a
transition into a state the graph, one instant later, no longer
believes is reachable, silently violating the reachability guarantee
the whole capability model exists to make airtight.

**Fix direction:** the capability change pipeline's `apply` step should
take a lock (or use `SERIALIZABLE` isolation) against in-flight
lifecycle transitions for the affected tenant, however briefly, so
"which graph is current" cannot change mid-transition — this is a
genuinely hard concurrency problem and deserves a design spike, not an
assumption that it can't happen because it's rare.

## E14 — Two opposite platform actions race on the same tenant

Two super admins, in two browser tabs, one clicking Freeze and the
other clicking Reactivate on the same tenant within the same second
(a real possibility during a handoff between two support shifts, each
unaware the other is looking at the same account). Both dialogs'
required-reason text is different; both write to `Tenant.status`; both
write an `AuditLog` row with `riskLevel: HIGH`. Whichever transaction
commits last wins the tenant's actual state, and the audit trail now
contains two contradictory HIGH-risk rows with no relationship recorded
between them — a reader of the history cannot tell which one is "what
actually happened" without checking timestamps down to the millisecond,
and even then has no record that the two admins were unaware of each
other.

**Fix direction:** the freeze/reactivate write should be guarded by an
optimistic-concurrency check (a version column, or a `WHERE status =
<expected-current-status>` clause) so the second, now-stale action
fails cleanly with "this tenant's status has already changed, reload
and try again" rather than silently overwriting the first admin's
action a moment after it landed.

## E15 — Rounding at the exact halfway point, multiplied by volume

`packages/shared/src/money` computes exact arithmetic in integer minor
units — real, disciplined work. The one case any money system this
careful still has to decide explicitly: what happens at the exact
halfway point of a rounding operation (a 2.5-piastre line-item
discount, a tax calculation landing precisely on X.XX5). "Round half up"
and "round half to even" (banker's rounding) both exist as legitimate
conventions and disagree on roughly half of all halfway cases. Neither
choice is wrong on its own; an *undocumented* or *inconsistent* choice
— rounding one way in `lineTotal()` and a different way in
`invoiceTotal()`'s "sum rounded lines, never round the sum" rule
(already correctly decided, per this project's own documentation) —
becomes, over thousands of invoices a month, a real, small, systematic
accounting discrepancy that a workshop's accountant will eventually
notice and ask about.

**Fix direction:** verify the halfway-rounding rule is a single,
explicitly named function used everywhere a rounding decision happens,
never re-implemented per call site — and state the chosen convention in
`money.ts`'s own documentation, the same way the discount/tax order was
already decided once and recorded rather than left to be re-decided
differently in different places.

## E16 — Read-committed isolation and the stock CHECK constraint's real behavior

Extending H6: Postgres's default `READ COMMITTED` isolation permits a
specific, well-known anomaly — a transaction can read a row, have
another transaction commit a change to that same row, and then write
based on the now-stale read, with no error, unless the write itself is
expressed as a single atomic statement or the isolation level is raised.
If `StockService.record()`'s decrement is a genuine single `UPDATE ...
SET availableQty = availableQty - x` (the correct shape H6 recommends),
the CHECK constraint on the resulting row is a true backstop against a
buggy caller. If it is instead `SELECT` then `UPDATE` across two
statements even inside one transaction, `READ COMMITTED` does **not**
protect against the race H6 describes — this needs to be verified
against the actual SQL Prisma generates, not assumed correct because a
CHECK constraint exists somewhere in the migration history.

**Fix direction:** this is a verification task, not a design task — read
the generated SQL (or the Prisma query builder call) for
`StockService.record()`'s core update, confirm it is a single
conditional statement, and add a concurrency-specific integration test
that fires two simultaneous `record()` calls against a balance of 1 and
asserts exactly one succeeds — the kind of test this project's
otherwise-rigorous integration suite has never needed because no
scenario before this pass asked "what if two of these happen at
literally the same time."

## E17 — A schema migration lands mid-way through an archived tenant's dormancy

Per Phase 18.D, an archived tenant's data is retained, read-only, for a
legal retention period, potentially spanning years and several schema
migrations. A migration that adds a `NOT NULL` column with no default
(or a data-backfill migration scoped, deliberately or accidentally, to
`WHERE tenant.status != 'ARCHIVED'` for performance reasons) either
fails outright against the archived tenant's rows, or — worse — silently
skips them, leaving that tenant's schema shape permanently one
migration behind every other tenant's, undetectable until the day it is
un-archived and every query written against the "current" schema shape
encounters rows that don't match it.

**Fix direction:** every migration that could plausibly diverge for a
dormant tenant needs an explicit policy decision — either migrations
always run against every tenant regardless of status (simplest, but
means "archived" is never truly inert), or un-archival includes a
mandatory reconciliation step that runs every skipped migration against
that tenant's data before it's usable again, with the reconciliation
step itself tested, not assumed to work the first time it's actually
needed.

## E18 — A password-hashing upgrade has no path to a dormant account

If the platform ever needs to strengthen its password hashing (a
routine, expected event over a product's lifetime — scrypt parameters
that are appropriately expensive today will not be in five years), the
standard, correct approach is lazy re-hashing on next successful login.
An account that never logs in again — an archived tenant's dormant
staff (Phase 18.D), or a customer who was served once and never
returned — keeps its original hash **forever**, with no batch
re-hash path, and, worse, no visibility anywhere in the platform into
*how many* accounts are in this state, because nothing currently tracks
"hash algorithm/parameter version" as a queryable fact per account.

**Fix direction:** store the hash parameters (or a version tag) 
alongside each password hash now, before it's needed, so a future
security upgrade can at minimum answer "how exposed are we" by querying
the distribution — and design the lazy-rehash path to also handle the
"this account will very likely never log in again" case explicitly
(forced reset on next login past some age threshold, rather than
trusting a login that may never come).

## E19 — A stale decision-link token resolves against a car that changed hands

Recall Workshop A's returning-customer continuity fix
(`AssetOwnershipHistory`) and the customer-decision link's own,
separately correct design (scoped to one request, consumed on use). Now
combine them: a car is sold (ownership transferred, per intake's
existing dual-write to `Asset.currentOwnerCustomerId` and
`AssetOwnershipHistory`) at almost the same moment the **previous**
owner, who received the decision request before the sale, finally opens
the link and submits an approval. The token is still cryptographically
valid — it was never about to expire and was never consumed — and the
permission/scoping model for the decision endpoint checks the token,
not a live "does the submitting party still own this asset" fact,
because no scenario before this one required distinguishing "the
customer this request was sent to" from "the customer who currently
owns this asset."

**Fix direction:** a decision link's validity should be evaluated
against the asset-ownership state *at the moment the request was sent*,
which it already implicitly is (the token is scoped to the request, not
re-derived from current ownership) — the real fix is ensuring the
**work order and branch manager** are clearly told, at read time, that
the approving party may no longer be the current owner, so a human
makes the judgment call about whether a stale-ownership approval should
still be honored, rather than the system silently treating it as
current.

## E20 — Database failover mid-transaction, and no documented recovery procedure

The platform's database will, eventually, fail over — a primary
instance goes down, a replica is promoted, whether on managed Postgres
infrastructure or self-hosted. If this happens while a
`WorkOrderLifecycleService` status write is inside its Prisma
`$transaction`, one of three things happens, and nothing in this
project's documentation states which, or what a technician's UI should
show if it does: the client library retries the whole transaction
transparently (the best case, and only true if the connection pool and
driver are configured for it); the connection simply errors, and the
transaction is rolled back cleanly (recoverable, if the UI retries
correctly and doesn't show a false "job saved"); or — the genuinely
dangerous case — the primary had already locally committed and begun
replicating to the now-promoted replica at the moment of failure, and
depending on the replication mode (synchronous vs. asynchronous), the
write may or may not have made it to the new primary, leaving the
actual state of a specific work order **undecidable from the
application's point of view** without manually inspecting WAL/
replication logs.

**Fix direction:** this needs an explicit decision, documented and
tested, not assumed away as "the hosting provider handles it": what
replication mode is actually configured (synchronous replication trades
some write latency for the guarantee that a committed write is never
lost on failover — this may be worth the cost specifically for
`WorkOrderLifecycleService` and `FinanceService` writes, even if not for
everything); what the client's retry behavior actually is under a
connection-reset error mid-transaction; and — the part most likely to
currently not exist at all — a documented, rehearsed recovery
procedure for "we suspect the last N seconds of writes for tenant X may
be inconsistent," because the day this is needed for real is the worst
possible day to be designing it from scratch.
