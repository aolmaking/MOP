# Phase 20 — Operational Resilience at Scale

> **Status:** 🟠 20.B shipped and proven; 20.E has its written decision;
> 20.A, 20.C, 20.D, 20.F deferred with reasons. See "What actually shipped."
> **Source:** [`docs/scenarios2/SYNTHESIS.md`](../scenarios2/SYNTHESIS.md),
> Workshops 2, 4, and 7 in full.

## Why this phase exists

Every phase before this one, in both the original 14 and Phases 15–19,
was tested — correctly, per this project's own discipline — against one
tenant's correctness at a time. Nothing in the test suite, the roadmap,
or the architecture has ever been evaluated against **many tenants,
many countries, or degraded connectivity, simultaneously, at the scale
the product is actually meant to run at.** Three scenario workshops,
independently, found this is not a hypothetical concern: a second
country's tenant broke unstated assumptions on day one (Workshop 2); a
50-branch bulk migration had no tooling and forced an unsafe database
bypass (Workshop 4); and a low-connectivity workshop exposed that the
entire client architecture assumes an always-available connection
(Workshop 7).

This phase is infrastructure and architecture work, largely invisible
in any UI — which is exactly why it is the most likely item in this
entire plan to be silently deprioritized in favor of visible feature
work, and, per Workshop 4 and 7, the most likely to actually break a
real deployment first.

## What this phase builds

### 20.A — Multi-tenant load and concurrency testing

Workshop 2 scenario 8, Workshop 4 scenario 20. The first load test the
project will have ever run: many tenants, many concurrent sessions,
against one shared Postgres instance and connection pool. Measures
whether `PermissionContextService`'s "six queries per request"
optimization — real and correct for one request — holds up under
genuine concurrent multi-tenant load, and whether one large tenant's
query cost can degrade a small tenant sharing the same pool (the
noisy-neighbor question). Produces a documented connection-pool sizing
strategy and, if the noisy-neighbor risk is confirmed, a per-tenant
fairness or throttling mechanism.

### 20.B — Tenant-configuration-change atomicity

Workshop 2 scenario 8. A plan reassignment or capability change must
not be readable as a partial, internally-inconsistent state by a
request whose permission resolution is mid-flight. This phase closes
that window — at minimum a per-tenant "configuring" flag `SessionGuard`
can check, at most a real transactional boundary around
`PermissionContextService.load()`'s parallel reads.

### 20.C — Bulk provisioning and import

Workshop 4 scenarios 16 and 17. A real, product-native path for
creating many branches and staff accounts at once, and for importing
historical data from an external system, including a branch-scoped
(not only tenant-scoped) cascade-delete and rollback capability so a
single bad import batch can be undone without risking the other 49
branches around it. Depends on Phase 17's specialization-at-creation
work for the "many branches, each correctly specialized" half of the
problem; this phase adds the "at scale, safely, reversibly" half.

### 20.D — Country as a real configuration axis

Workshop 2 scenarios 6, 7, and 9. `Tenant.country` today is stored and
displayed, not acted on. This phase makes it a real axis: jurisdiction-
specific legal-identity fields (a Saudi CR/VAT number, distinct from an
Egyptian tax ID), a tenant-configurable working week (so
`WorkshopHealthService`'s day-count signals can distinguish "closed for
the weekend" from "concerning"), and an explicit "compliant-blocked"
flag — distinct from a capability the tenant chose to disable — for a
tenant operating in a country the platform doesn't yet fully support.
Separates translation (Arabic dialect/register variation) from legal
country-adaptation (tax, invoicing) as two genuinely different, 
independently-paced tracks, correcting Phase 14's original framing of
them as one task.

### 20.E — Offline architecture decision

Workshop 7 scenarios 31, 33, and 34. The single largest open
architectural question either scenario set raised. This phase's
deliverable is a **written decision**, made deliberately rather than
discovered by omission: does MOP commit to offline-capable clients, and
if so, does the project accept the real cost of re-proving
`WorkOrderLifecycleService`'s gate-checking guarantee, money
idempotency, and the capability model's reachability proof against
out-of-order, replayed, previously-offline actions — or does the
platform deliberately, explicitly decide connectivity is a stated
requirement, documented as such, so a workshop like Wadi Auto is told
plainly rather than discovering the gap the hard way. Either answer is
acceptable; the current silence is not.

### 20.F — Shared-device identity and bandwidth-aware design

Workshop 7 scenarios 32 and 35. Two smaller, concrete items that don't
require 20.E's larger decision: a lightweight re-authentication or
hand-off confirmation for a shared workshop device, so audit
attribution stays honest for a workshop too small to equip everyone
individually; and a bandwidth review of existing debounce timings,
payload shapes, and caching (or its absence) across the Stock, Catalog,
and Workshops pages already built, with changes where a metered-
connection tenant's data cost can be reduced without harming UX for a
tenant on a fast connection.

## What this phase deliberately does not do

- No offline client implementation itself — 20.E is a decision and, if
  the decision is "yes, build it," a scoped follow-on phase, not a
  deliverable of this one.
- No full multi-region database architecture (sharding, per-region
  read replicas) — 20.A's finding may motivate this, but it is a
  larger structural change than this phase's scope; 20.A's deliverable
  is measurement and a documented recommendation, not a rearchitecture.
- No support for every possible country's tax regime — 20.D builds the
  axis and proves it against Saudi Arabia specifically (per Workshop
  2); each additional country's adapter is Phase 9's ongoing,
  incremental work, not a one-time deliverable here.

## What actually shipped

- **20.B — configuration-change atomicity, the stronger of the two named options.** `PermissionContextService.load()`'s five parallel reads (control settings, tenant/plan, capabilities, role permissions, user overrides, configuration) now run inside one `REPEATABLE READ` Postgres transaction rather than as independent `Promise.all` queries each seeing whatever was committed at the instant it ran. Before this fix, a capability change or plan reassignment committing between two of those reads could make one permission-resolution context combine pre-change and post-change data into an internally-inconsistent snapshot -- exactly the race this sub-item names. `CapabilityResolutionService.resolveCurrent()` gained an optional `tx` parameter so it participates in the same transaction rather than reading through its own separate connection. Proven by a unit test asserting the transaction and isolation level are actually used; the full 471-test API suite (including every existing permission-layer and capability test) still passes against real Postgres with this change in place.

## 20.E — offline architecture: the written decision

**Decision: MOP does not commit to offline-capable clients at this time. Connectivity is a stated requirement, not a hidden assumption.** The alternative -- re-proving `WorkOrderLifecycleService`'s gate-checking guarantee, money idempotency, and the capability model's reachability proof against out-of-order, replayed, previously-offline actions -- is not a client feature layered on top of the existing architecture; it is a correctness re-derivation of every guarantee this project has built since Phase 1, each of which currently assumes a request either completes against live, current state or doesn't happen. Wadi Auto's low-connectivity scenario (Workshop 7) is real and not dismissed: it is named here, explicitly, as a known, accepted limitation rather than a gap a workshop discovers the hard way mid-deployment.

**What this decision does not block:** 20.F's two items (shared-device re-authentication, a bandwidth review of existing pages) are real, valuable, and independent of this decision -- a slow connection is not the same problem as no connection, and reducing data cost for a metered-connection tenant needs no offline architecture at all.

**What would change this decision:** a real customer segment whose business cannot function without offline capability (not "would prefer," a hard requirement) is the trigger to revisit this -- at which point the cost named above is the actual scope of that future phase, decided with real requirements in hand rather than guessed at now.

## What was deferred, with reasons

- **20.A — multi-tenant load and concurrency testing.** Needs a real load-testing harness (many concurrent simulated tenants/sessions against a seeded dataset) and a CI environment able to run it repeatably -- infrastructure investment distinct from a single session's application code changes, and the phase's own exit criteria asks for a CI-integrated load test, not a one-off local measurement.
- **20.C — bulk provisioning and import.** Depends on Phase 17's specialization-at-creation work for its "many branches, each correctly specialized" half (17.B/17.C, both themselves deferred in `docs/phases/PHASE_17.md`); building the "at scale, safely, reversibly" half first, ahead of what it would provision, risks guessing the wrong shape.
- **20.D — country as a real configuration axis.** A genuine, multi-part deliverable (jurisdiction-specific legal-identity fields, a configurable working week, a `compliantBlocked`-style flag distinct from a capability) that the exit criteria itself asks to be proven against a full scenario (Al-Safwa, Saudi Arabia) end to end -- real design and product work, not a schema addition alone.
- **20.F — shared-device identity and bandwidth review.** Two small, concrete, independent items correctly named as not requiring 20.E's larger decision -- genuinely available to pick up next, deferred here only for this session's remaining budget, not for any structural reason.

## Exit criteria

**Not fully met, and not claimed to be.** 20.B closed the configuration-change race window with a real fix and a test proving the mechanism is in place. 20.E produced its written decision. 20.A, 20.C, 20.D, and 20.F are deferred with specific, non-structural reasons above -- each is real, scoped work for a future pass, not abandoned.
