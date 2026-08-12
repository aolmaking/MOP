# Phase 18 — Tenant Relationships

> **Status:** ⬜ not started. Depends on Phase 3's capability runtime and
> Phase 4's audit/lifecycle discipline; does not depend on Phases 15–17.
> **Source:** [`docs/scenarios2/SYNTHESIS.md`](../scenarios2/SYNTHESIS.md),
> the dominant finding — traced through Workshops 1, 3, 5, 6, 8.

## Why this phase exists

`Tenant.id` and `StaffUser.tenantId` are treated everywhere in the
schema as a permanent, isolated, singular fact. That isolation is
correct and one of this project's best-enforced properties — `CLAUDE.md`
names it explicitly as load-bearing, and the seed's two differently-
shaped tenants exist specifically to keep it provably true. But five
independent scenarios, from four unrelated angles, found the same wall
behind it: **real businesses are sold, merged, split, invested in, and
closed, and MOP has no representation for any of these events touching
a tenant that already exists.**

This is not a specialization gap (Phases 15–17 fix what a workshop
*is*; this phase fixes what a workshop's *relationship to other tenants
and to the platform* can be) and not a governance gap (Phase 19 fixes
*how actions inside a tenant are trusted*; this phase fixes *how tenants
relate to each other*). It is its own axis, found nowhere in scenario
set 1 because no single-workshop story could surface it — every
Workshop A–D story in that set watched one tenant's whole life. Only
scenario set 2, watching the platform's console, found tenants
changing shape.

## What this phase builds

### 18.A — External, non-operational stakeholder access

Found three times independently (Workshop 3 scenario 13, Workshop 8
scenarios 36 and 38). A person who is not an employee of a tenant but
has a legitimate, ongoing need to see part of it — an investor, a
franchisor, a parent company — needs a role shape the closed `StaffRole`
enum has no room for: financial-only, branch-scoped, no operational
permissions, explicitly not `TENANT_OWNER`. Minimum bar: a new
relationship type, `TenantStakeholder`, linking an `Account` to a
`Tenant` with its own narrow, explicit permission set, independent of
`StaffUser`.

### 18.B — Multi-tenant identity

Workshop 6 scenario 27, Workshop 8 scenario 36. `StaffUser.tenantId`'s
non-nullable, singular shape assumes one person belongs to exactly one
tenant, forever. This phase adds the concept of one `Account` holding
several tenant-scoped relationships simultaneously — the schema
foundation 18.A's stakeholder role depends on, generalized so a person
moving between tenants (a branch sold to a new owner, an employee who
splits time) is representable without duplicating their identity.

### 18.C — Time-bounded access grants

Workshop 8 scenario 38. An interim manager, installed by a parent
company for a fixed turnaround, needs real operational permissions that
expire automatically on a date, without anyone having to remember to
revoke them. Every permission layer today (platform lock through user
override) is held indefinitely until manually undone. This phase adds
an expiry field to the grant mechanisms that need it and a scheduled
sweep that revokes what's expired — the first genuinely temporal
concept in the permission model.

### 18.D — Tenant lifecycle: archive, and the retention clock

Workshop 1 scenario 5, restated with sharper stakes in Workshop 8
scenario 39. `TenantStatus.ARCHIVED` is a value with no designed
process behind it. This phase specifies: what "archived" means
operationally (data retained, read-only, for whom); the un-archive
path, including how a multi-year-dormant tenant's data is reconciled
against schema migrations that happened while it was archived; whether
`slug` is released for reuse; and — critically — that a **subscription
ending** and a **legal retention obligation ending** are two different
clocks, never conflated, so data a workshop is legally required to keep
(Scenario 2's roll-cage records) survives the tenant's own cancellation.

### 18.E — Tenant groups

Workshop 8 scenario 37. A read-only, explicitly-scoped concept — a set
of tenants related for reporting purposes (a holding company's
portfolio, a franchise's owned-vs-licensed split) — separate from
`TenantStakeholder` (18.A gives one person visibility into one tenant;
this gives a defined, named group an aggregate view across several,
with currency/period normalization decided explicitly rather than
assumed). Deliberately summary-only in this phase; drilling from a
group view into one tenant's row-level detail is a Phase 19 concern
(it re-opens the separation-of-duties question) and is out of scope
here.

### 18.F — Merge and split: a design decision, not yet an implementation

Workshop 6, all five scenarios. The hardest and highest-risk item in
this phase. Every table with a `tenantId` foreign key, every
`AuditLog` row, every piece of history built on the assumption that a
tenant's identity never changes, is implicated. This phase's
deliverable for 18.F is **a written design document and an explicit
platform decision**: does MOP support tenant merge/split as a
first-class operation, in what form, with what guarantees about
historical audit integrity (Workshop 6 scenario 26 found that
rewriting `AuditLog.tenantId` for historical rows directly conflicts
with the audit-boundary discipline) — or does the platform decide,
deliberately, to refuse this operation and instead offer a **documented
manual procedure** (export/reimport as two fresh tenants) that
preserves isolation at the cost of some data continuity. Either answer
is acceptable; no answer, discovered under deadline pressure the way
Workshop 6 found it, is not.

## What this phase deliberately does not do

- No implementation of tenant merge or split itself — 18.F is a
  decision and a design, not a migration tool, unless the decision
  reached is that a documented manual procedure is sufficient, in which
  case that procedure is the deliverable.
- No cross-tenant customer identity resolution (linking the same real
  person's records across two unrelated tenants) — flagged in Workshop
  6 scenario 26 as a distinct, harder problem with real false-positive
  risk, deferred pending its own design spike.
- No tenant-group drill-down into individual-tenant detail (18.E stays
  summary-only; see Phase 19 for why).

## Exit criteria

18.A–18.D ship. 18.E ships in its summary-only form. 18.F produces a
written decision and, if the decision is "no first-class merge/split,"
a documented manual procedure — recorded here with the reasoning,
matching this project's standing rule that a deferred item is named,
never silently dropped. Every deliverable is proven against the actual
scenario that found it: Cedar's stakeholder gap (13), Masar's 11-tenant
portfolio (36–39), and Apex's five-year retention clock (5, 39) each
have a working, tested path through the product by this phase's close.
