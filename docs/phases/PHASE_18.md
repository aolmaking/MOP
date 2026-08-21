# Phase 18 — Tenant Relationships

> **Status:** 🟠 18.A, 18.D, 18.E shipped and proven end-to-end; 18.B,
> 18.C deferred with reasons; 18.F has its written decision (below), no
> implementation. See "What actually shipped."
> **Source:** [`docs/archive/discovery/scenarios2/SYNTHESIS.md`](../archive/discovery/scenarios2/SYNTHESIS.md),
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

## What actually shipped

- **18.A — `TenantStakeholder`.** A model and `TenantStakeholderService` (`apps/api/src/tenant-relationships/`) independent of `StaffUser`/`StaffRole`: `permissions` is a bare `String[]` of narrow, explicit keys chosen at grant time, never a role. Proven by test: grant, revoke, an active-grants-for-one-account query (the shape 18.B's future multi-tenant identity work would read from). No controller yet — API/service only, same pattern as Phase 15.
- **18.D — archive lifecycle, two clocks.** `Tenant.archivedAt`/`Tenant.retentionUntil`, `TenantLifecycleService.archive()`/`.reactivate()`. Archiving computes a real `retentionUntil` (7 years by default, overridable) independent of `archivedAt`; reactivating clears `archivedAt` but deliberately keeps `retentionUntil` intact — it recorded a real legal fact about data collected during the archived period that reactivation does not retroactively erase. **`TenantStatusLayer` fixed to make "read-only" literally true**: before this phase, `READ_ONLY` and `ARCHIVED` were indistinguishable from `FROZEN`/`SUSPENDED` — a status literally named "read-only" permitted zero reads, which contradicted its own name. Now `READ_ONLY`/`ARCHIVED` defer (allow) on any `.view`-suffixed permission key and still deny everything else; `FROZEN`/`SUSPENDED` are unchanged, fully blocked. Reactivation lands a tenant in `READ_ONLY`, not `ACTIVE` — full read-write access is a deliberate, separate operator decision, never an automatic side effect of un-archiving.
- **18.D's "for whom" answer, made explicit rather than left implicit:** `AuthService.LOGIN_BLOCKED_TENANT_STATUSES` already excluded `READ_ONLY` before this phase (only `FROZEN`/`SUSPENDED`/`ARCHIVED`/`PENDING_SETUP` block login) — so a `READ_ONLY` tenant's own staff can already log in and, with the layer fix above, see their own data with nothing mutable. `ARCHIVED` still blocks ordinary staff login entirely; reading an archived tenant's retained data is reserved for a future platform-admin path that does not exist yet, named here as owed rather than silently assumed.
- **18.E — `TenantGroup`/`TenantGroupMember`, summary-only.** `TenantGroupService.summary()` returns exactly `{ tenantId, tenantName, openWorkOrders }` per member — proven by test to carry no row-level handle (no work order id, no invoice, nothing a caller could use to drill into one tenant), reusing `openWorkOrders`, the one cross-tenant-comparable number `OwnerHomeService` already established a precedent for rather than inventing a new metric.

## 18.F — merge and split: the design decision

**Decision: MOP does not support tenant merge or split as a first-class product operation.** The alternative — rewriting `tenantId` on historical rows across every table that has one, including `AuditLog` — directly conflicts with this project's own audit-boundary discipline (`tools/lint-audit-boundary.mjs` exists specifically so an `AuditLog` row's shape and origin can be trusted; retroactively reassigning its `tenantId` after the fact is indistinguishable from tampering with it, however well-intentioned the tool doing so). Workshop 6 scenario 26 found this collision under deadline pressure; naming it here, deliberately, before it is needed, is the point of this sub-item.

**The documented manual procedure, in place of an in-product tool:** a tenant merge or split is performed as an export from the source tenant(s) and an import into one or more freshly-created tenants (via Phase 17's bulk-data-import path once 17.D ships), followed by archiving the source tenant(s) under 18.D's lifecycle (never deleting them — their historical `AuditLog` rows stay attributed to the tenant that actually generated them, permanently). This preserves tenant-isolation and audit integrity at the cost of some continuity: the new tenant's history starts at the import, not at the original business's founding. That cost is accepted deliberately, not overlooked — a business's operational continuity and MOP's audit integrity are not the same thing, and this decision keeps the second one unconditional.

**What would change this decision:** if a future customer segment needs true historical continuity across a merge (not just current-state data), that is a materially different, harder problem — cross-tenant historical identity, not just current-state migration — and deserves its own design spike against real requirements, not a retrofit of this decision under pressure.

## What was deferred, with reasons

- **18.B — Multi-tenant identity.** Generalizing `Account`/`StaffUser` so one person holds several simultaneous tenant-scoped relationships is a real schema change to the identity model every other phase's permission resolution depends on (`SessionContext` currently assumes one `tenantId` per session). `TenantStakeholder` (18.A, shipped) already lets one `Account` hold narrow view grants across several tenants without this generalization — which covers the scenario evidence's actual cases (an investor, a franchisor) without touching the session model. Full multi-tenant identity (a person who is a real `StaffUser` at two tenants simultaneously) is deferred until a scenario actually needs it, not built speculatively ahead of one.
- **18.C — Time-bounded access grants.** Needs an expiry field and a scheduled sweep across every grant mechanism (`RolePermission`, `UserPermissionOverride`, and now `TenantStakeholder`), the first genuinely temporal concept in the permission model — real, cross-cutting work touching `PermissionResolverService`'s layers, not a single-model addition. `TenantStakeholder.revokedAt` (shipped) gives 18.A's stakeholder grants a manual revoke path today; the *automatic* expiry sweep is deferred to a pass that gives the whole permission model temporal grants at once, not just this one relationship.

## Exit criteria

18.A, 18.D, and 18.E shipped and proven, per "What actually shipped" above. 18.F produced its written decision and documented manual procedure, per the section above — the exit criteria's own explicit allowance ("either answer is acceptable; no answer... is not"). **Not met:** 18.B and 18.C, both deferred with reasons rather than attempted under this pass's remaining budget. Scenario proof: Cedar's stakeholder gap (13) has a working, tested `TenantStakeholder` path; Apex's five-year retention clock (5, 39) has a working, tested two-clock archive path. Masar's 11-tenant portfolio (36–39) is answered by 18.E's summary view for the reporting half of that scenario; the identity half (18.B) remains open, named above.
