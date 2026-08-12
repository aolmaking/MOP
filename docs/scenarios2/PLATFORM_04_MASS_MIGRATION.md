# Platform Scenario Set — Workshop 4: Al-Masry Group (mass migration)

> **Scenarios 16–20 of 40.**

---

## The workshop

**Al-Masry Group** — a 50-branch national tyre-and-service chain
migrating from a legacy competitor system onto MOP in one coordinated
cutover weekend, negotiated at the executive level, contractually
obligated to be live Monday morning. Chosen to test the platform's
**bulk-provisioning and concurrent-onboarding story**, which — unlike a
single workshop's day, tested exhaustively by the first scenario set —
has never been tested at all, because every tenant so far in either set
was created one at a time, by hand, through `Add Workshop Owner`.

| | |
|---|---|
| Branches | 50, across 11 governorates |
| Staff being migrated | ~600 (owners, branch managers, ~500 technicians, inventory staff) |
| Existing data | 4 years of the legacy system's history: customers, assets, completed work orders, warranty records |
| Cutover window | One weekend. Contractually, the business must be running Monday |
| Regulatory | Egyptian tax, but the sheer **scale** (50 branches at once) is the axis this workshop tests, not jurisdiction |

---

## SCENARIO 16 — Fifty branches, one Saturday, and no tool exists to
create them

**The super admin needs to create 50 branches, ~600 staff accounts, and
50 branches' worth of specialization configuration in one weekend. She
discovers the entire onboarding path assumes one branch, one owner,
created by hand.**

### What happens

`Add Workshop Owner` creates **one** tenant. It does not create branches
at all — branch creation, per `docs/scenarios/`'s Workshop B finding
(scenario 6, "there is no owner-side branch-creation flow"), may not
even exist for the *owner* yet, let alone for the super admin doing
bulk setup. Even granting that gap is fixed, the form is built for one
click producing one thing: one name, one slug, one owner invite. There
is no CSV import, no bulk-branch tool, no batch staff-invite mechanism
anywhere in the product.

Fifty branches by hand, through one form, one submission at a time, each
requiring a name-availability check, a slug-availability check, and an
owner-email-availability check (all three debounced HTTP round-trips
per `create-workshop.dto.ts`'s async-validation pattern) is not a
weekend task for one person — **it's not designed to be a bulk task for
anyone**, because nothing about this system was ever asked to create
more than one workshop-shaped thing in a sitting.

She ends up needing an engineer to write a script that calls the
platform's own internal service layer directly, bypassing the HTTP API
and its validation entirely — the same SQL-escape-hatch failure this
scenario set keeps finding, now for the single most consequential
operation a platform can perform (mass tenant/branch creation), done
**without the product's own validation running at all**, under weekend
deadline pressure, by someone who is not the person who understands the
business rules the validation exists to enforce.

### The core mistakes

**16.1 — There is no bulk-provisioning tool anywhere in the platform —
every onboarding flow, from `Add Workshop Owner` down to inviting one
staff member, is built for exactly one thing at a time, and nothing in
the roadmap (Phases 15–17, focused on specialization depth, not scale)
currently plans to build one.**

**16.2 — The name/slug/email availability checks, debounced and
designed for a human filling in one form, become the actual bottleneck
at bulk scale — 50 sequential debounced round-trips is not a batch
operation, it's 50 individual ones with no batching primitive
underneath them at all.**

**16.3 — Under deadline pressure, the only path that actually works is
bypassing the product's own service layer directly — meaning the
platform's business-rule validation (uniqueness, plan limits, required
fields) is most likely to be skipped at exactly the moment (mass,
unreviewed, high-volume creation) it matters most.**

---

## SCENARIO 17 — Importing four years of legacy history, and MOP has
never had to accept data it did not create itself

**Assuming a bulk-import path is hastily built for this cutover: what
happens when 4 years of a *different* system's data — different
customer records, different asset histories, different completed-work
records — needs to become MOP data?**

### What happens

The legacy system's export is a set of CSVs: customers, vehicles,
completed jobs, parts used. None of it matches MOP's schema shape.
Customers in the legacy system have no distinction between individual
and business accounts (a gap `docs/scenarios/`'s Workshop B already
found MOP itself shares, 10.1 — so the import at least doesn't *lose*
information MOP couldn't represent anyway, small mercy). But:

- **Completed work orders in the legacy system have no equivalent to
  MOP's `WorkOrderLifecycleService`-governed state machine** — they are
  just "done," with no record of which intermediate states (inspection,
  approval, blocker) a real MOP work order would have passed through.
  Does the import fabricate a plausible state history to satisfy
  whatever invariants the schema assumes (foreign keys, non-null
  timestamps for each lifecycle step), and if so, is that fabricated
  history distinguishable from a real one anywhere — in the Owner's
  Audit page, in a customer's service record — or does imported history
  silently masquerade as MOP-native history forever?
- **`AuditLog`, per `CLAUDE.md`'s explicit rule, has exactly one writer**
  (`AuditService`, enforced by the audit-boundary lint rule). A bulk
  import of 4 years of history is either written through that one path
  600,000+ times (assuming a plausible per-branch-per-year job count),
  which is a very different load pattern than anything the audit
  boundary was designed against, or the import bypasses `AuditLog`
  entirely for historical rows — meaning **imported history has no
  audit trail at all**, a silent, permanent gap in exactly the
  governance record the whole product is built around.
- **Warranty and part-cost data from the legacy system may not map to
  MOP's units, categories, or even currency conventions cleanly** (the
  legacy system might have recorded costs inclusive of tax where MOP's
  `Decimal`-in-DB, `string`-across-API convention assumes exclusive, or
  vice versa) — and nothing has ever tested importing financial data
  from an *external, untrusted-shape* source into a system this
  disciplined about money correctness.

### The core mistakes

**17.1 — There is no data-import concept anywhere in the product, and
"import 4 years of a different system's history" is a fundamentally
different problem than "onboard a new, empty workshop" — every design
decision in the onboarding flow (starter templates, empty state
messaging on every list page, the seed's own philosophy of two
differently-shaped *empty* tenants) assumes a tenant starts with
nothing, never with an inherited past.**

**17.2 — Historical data imported from outside MOP cannot honestly
satisfy `WorkOrderLifecycleService`'s state-machine invariants, because
it never actually passed through them — any import either fabricates a
plausible-looking history (deceptive) or the schema has to accept
that some rows are exempt from the invariants the rest of the product
depends on (a hole in the "no hardcoded transitions" guarantee
`CLAUDE.md` treats as load-bearing).**

**17.3 — `AuditLog`'s single-writer discipline has never been tested
against genuine bulk-write volume, and imported historical rows have no
honest answer for what their audit trail should even say — "created by
whom, when" is meaningless for a job that was actually done four years
ago in a different system, but the schema's `actorId`/`actorType`/
`createdAt` columns don't have a way to say "this is imported history,
treat its provenance differently."**

**17.4 — Financial data from an externally-sourced, differently-
convention'd system (tax-inclusive vs. exclusive, different rounding
rules) has never been tested against the money-correctness discipline
(`Decimal` in DB, `string` across the API, the dedicated `lint-money.mjs`
linter) this codebase otherwise enforces rigorously — an import script
written under deadline pressure by someone unfamiliar with those rules
is exactly the kind of code the linter was built to catch, and imports
are typically one-off scripts run outside the normal lint/CI path
entirely.**

---

## SCENARIO 18 — Monday morning: 600 people log in for the first time,
simultaneously, and the invite-token system has never been tested at
this volume

**Every one of ~600 staff accounts needs an invite, an accept, a
password set. All at once, at the start of a single shift, across 11
governorates.**

### What happens

07:00 Monday. Every branch manager, every technician, across 50
branches, was told "log in this morning" for the first time. The invite-
accept flow (`/invite/accept`, real, tested, working per this session's
own earlier work) is built and correct **for one person clicking one
link**. What has never been tested is:

- **600 simultaneous token lookups** against whatever table stores
  `inviteTokenHash` — is it indexed for this access pattern at this
  concurrency, or does it become a hot row / hot index contention point
  for one brief, brutal hour?
- **Password-hashing cost.** `CLAUDE.md`'s own Phase 1 notes flag scrypt
  at "~128MB/attempt" as a documented DoS vector requiring rate
  limiting on the *auth* endpoints. Six hundred **legitimate** users
  setting a password within the same 20-minute window is not an attack,
  but it is the same computational shape as one — 600 concurrent
  scrypt hashes is a genuine memory and CPU spike, and the rate limiting
  built to stop malicious repeated attempts was never designed to
  distinguish "one attacker hammering one account" from "600 different
  legitimate people, once each, at the same moment."
- **What happens to the 30th technician in a branch who mistypes his
  password on the first try, at 07:03, while 599 other people are also
  hitting the login endpoint** — does the auth rate limiter, tuned
  against a single-tenant, low-volume assumption, start throttling
  *legitimate* Monday-morning traffic because the raw request volume
  looks anomalous by the standard it was calibrated against?

Nobody has load-tested the auth path at this scale, because no prior
scenario, in either set, involved more than a handful of concurrent
logins.

### The core mistakes

**18.1 — The invite/accept flow's correctness has been verified for one
user at a time; its behavior under genuine concurrent load (hundreds of
simultaneous token lookups and password-set operations) has never been
tested, and index/locking behavior under that load is unknown.**

**18.2 — The auth rate limiter, built specifically to stop a scrypt-cost
DoS, has never been evaluated for false positives against a legitimate
mass-onboarding event — the two situations (attack, and 600 genuine
first-time logins) can look identical from the request-volume side, and
nothing distinguishes them.**

**18.3 — There is no "staged rollout" concept for a mass onboarding —
inviting all 600 people to log in at the exact same hour is an
operational choice nothing in the product warns against or offers an
alternative to (e.g., staggering invite-accept windows by branch), and
the platform has no visibility into "this tenant is about to generate
an unusual login spike" ahead of time to prepare for it.**

---

## SCENARIO 19 — A branch's data arrives corrupted, and rolling back
one branch out of fifty has never been designed

**Branch #37's import turns out to be broken — mismatched VINs, prices
off by a currency-conversion error someone made in the legacy export.
It needs to be undone and redone, without touching the other 49
branches, which are fine and already live.**

### What happens

The super admin needs to **roll back one branch's imported data** —
delete or invalidate branch #37's imported customers, assets, and
historical work orders, without cascading into or disturbing anything
for the other 49 branches of the same tenant, some of which have
**already had live, real, Monday-morning work orders created against
them** in the hours since cutover.

Nothing in the schema's cascade rules (`onDelete: Cascade` /
`onDelete: SetNull`, used throughout, e.g. `Team.branch` on
`SetNull`, `Tenant.branches` presumably on `Cascade`) was designed with
"delete a subset of one tenant's branch-scoped data, precisely, without
touching sibling branches or anything created by real users since
cutover" in mind — every cascade relationship in the schema is scoped
to **tenant**, not to **branch**, because until this scenario, nothing
needed branch-level surgical rollback; deleting a whole tenant (the only
cascade granularity that exists) is not an option here, because 49 of 50
branches are correct and already in active use.

There is also no **transactional boundary around "one branch's worth of
an import,"** so a partial, failed import (which is exactly what
happened to #37) may have already left half-written rows referencing
half-imported customers, with no clean way to identify "everything that
came from branch #37's import batch" after the fact unless the import
script itself, written under deadline pressure (16), happened to tag
every row with a batch identifier — which nothing in the schema
requires or provides.

### The core mistakes

**19.1 — Every cascade-delete relationship in the schema is scoped to
the tenant, never to a branch within a tenant — there is no way to
surgically remove one branch's data without either a bespoke, risky,
hand-written deletion script or accepting collateral risk to sibling
branches' data.**

**19.2 — There is no import-batch identifier anywhere in the schema, so
recovering "everything that came from this one failed import" after the
fact depends entirely on whether the ad-hoc import script happened to
tag its own writes — which, written under weekend deadline pressure by
whoever built it fastest, is exactly the kind of provenance metadata
most likely to have been skipped.**

**19.3 — There is no transactional boundary around a bulk import at the
unit that actually matters (one branch), so a failure partway through
branch #37's import can leave the system in a partially-imported state
indistinguishable from a correctly, fully imported one to anyone not
specifically looking for it — which is exactly how this kind of
corruption goes unnoticed until a customer or technician hits it live.**

---

## SCENARIO 20 — Al-Masry's 50 branches are now permanently 40× the
scale of every other tenant on the platform, and nobody decided whether
that's fine

**Weeks later, Al-Masry is live and stable. This scenario is not about
a failure — it's about a question the platform has never had to
answer, and now permanently has to: does one enormous tenant change how
every *other* tenant experiences the platform?**

### What happens

Al-Masry's 50 branches, ~600 staff, and years of imported history make
it, by a wide margin, the largest tenant on the platform — its
`AuditLog` row count, its `StockMovement` history (if inventory is in
scope for this chain), its `WorkOrder` volume, all dwarf every other
tenant combined, likely by an order of magnitude.

Every query in the codebase that is correctly, deliberately scoped by
`tenantId` (the isolation discipline `CLAUDE.md` explicitly praises the
seed's two-tenant design for proving) is **logically** isolated — a
query for tenant X's data cannot return tenant Y's rows. But logical
isolation says nothing about **resource isolation**: a shared Postgres
instance, a shared connection pool, shared disk I/O, and shared query-
planner statistics (which, in Postgres, are collected per-table, not
per-tenant-partition, unless the schema uses some form of partitioning
this codebase's Prisma schema shows no sign of). **A 40×-larger
tenant's table scans, index maintenance, and background vacuum
activity have real potential to degrade query performance for every
other, much smaller tenant sharing the same tables** — this is
Scenario 8's noisy-neighbor concern (from Workshop 2), now not
hypothetical but realized, permanently, by one specific real tenant.

Nobody decided, when Al-Masry's contract was signed, whether the
platform's data architecture — a single shared database, single
connection pool, table-per-model rather than tenant-partitioned or
tenant-sharded — was ever meant to hold a tenant this size alongside
dozens of Nafath-scale ones. It works today. Whether it keeps working
as Al-Masry's own history keeps growing, and as more mid-size tenants
onboard, is an open, unmeasured, unplanned-for question.

### The core mistakes

**20.1 — The platform's single-shared-database architecture has never
been evaluated against a tenant-size skew this large, and nothing in
the roadmap (Phases 1–17, all focused on feature completeness, not
platform architecture) currently plans to revisit data architecture for
scale — this is the single largest structural risk either scenario set
has found, and it is invisible until a tenant exactly like Al-Masry
actually exists.**

**20.2 — There is no tenant-size-aware operational tooling — the super
admin has no dashboard, no alert, no signal that one tenant's growth is
approaching a scale that changes the platform's own risk profile, which
means this kind of skew is discovered reactively, from degraded
performance complaints across *unrelated* tenants, rather than
proactively.**

**20.3 — Nothing in the plan/entitlement model (`maxBranches`,
`maxUsers`, `maxWarehouses`) is designed as a genuine *platform-
capacity* safeguard rather than a *commercial* one — a plan's ceiling
exists to gate what a customer pays for, not to protect the shared
infrastructure's health, and Al-Masry demonstrates those are two
different concerns the current model conflates into one number.**
