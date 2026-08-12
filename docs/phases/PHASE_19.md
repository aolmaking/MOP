# Phase 19 — Governance Depth

> **Status:** ⬜ not started. Depends on Phase 18.A–18.C (stakeholder and
> time-bounded access shapes feed the audit-actor model this phase
> extends). Independent of Phases 15–17.
> **Source:** [`docs/scenarios2/SYNTHESIS.md`](../scenarios2/SYNTHESIS.md),
> Workshop 5 (fraud investigation) in full, plus Workshop 1 scenario 4
> and Workshop 8 scenario 38.

## Why this phase exists

Every permission and audit guarantee this project has built —
deny-by-default, the `locked` short-circuit, the single-writer audit
boundary — answers one question: *is this action allowed, and was it
recorded?* Workshop 5's fraud investigation is the first scenario in
either set to need a different question answered: *should one person
have been able to do all of this alone, and can the platform still
prove what was true, not just what was recorded, after the fact?*
Nothing in the current model answers that, because nothing before this
scenario ever needed it to — every prior scenario assumed every actor
was acting in good faith.

This phase does not touch the permission *layers* (platform, plan,
capability, module, feature, workshop config, delegation, role
template, user override) — that architecture is sound and stays as is.
It adds a second dimension alongside it: governance that assumes
someone, eventually, will act in bad faith, and builds for the day
that's discovered rather than the day it happens.

## What this phase builds

### 19.A — Separation of duties

Workshop 5 scenario 21. The role template grants `INVENTORY_MANAGER`
both `inventory.request.approve` and `inventory.request.issue` by
default, letting one account close a request loop with no second
person ever required to look at it. This phase adds an explicit
"requires a second, different actor" flag on specific
permission-pairs or workflow steps, checked at the point of action, not
merely at the point of grant — the same discipline the capability
engine already applies to workflow reachability, extended to require a
*different person*, not just *a person with the right permission*.

### 19.B — Dispute state, distinct from lifecycle status

Workshop 5 scenario 22. A closed work order whose factual accuracy is
formally in question needs a visible, non-destructive flag that travels
everywhere the original record is shown, without altering
`WorkOrderStatus` (which stays `WorkOrderLifecycleService`'s exclusive
domain, unchanged) and without deleting or silently editing history —
the same non-negotiable the audit-boundary discipline already enforces
elsewhere, applied to a new case.

### 19.C — Forensic-reason refund taxonomy

Workshop 5 scenario 22, feeding directly into whichever team owns
Finance Core's deferred refund work (named in `PROJECT_STATE.md`'s
Phase 9 notes). A refund carries a reason category — routine reversal
vs. remediation of a disputed/fraudulent charge — because the two have
different audit, reporting, and potential legal-disclosure weight, and
today's model has no distinction.

### 19.D — A restricted-pending-investigation account state

Workshop 5 scenarios 22 and 24. Today `StaffUser.isActive` is binary.
This phase adds a third state — access curtailed, pending resolution,
not yet a declaration of guilt — and a platform-level equivalent
lightweight enough that a tenant-side restriction can be requested with
platform backing (an independently-witnessed, HIGH-risk-level audit
row) without invoking the platform's tenant-wide freeze, which Workshop
5 scenario 24 found is the only lever that currently exists and is far
too large a hammer for a single-account problem.

### 19.E — Historical permission reconstruction

Workshop 5 scenario 23, the hardest item in this phase.
`PermissionContextService` deliberately, correctly resolves live,
current state for performance and correctness reasons — Phase 1's own
per-request caching decision. This phase does not change that. It adds
a **separate, offline, on-demand reconstruction tool**: given a tenant
and a past timestamp, replay the relevant `capability.changed` /
role-permission-change audit rows in order to answer "what could this
account do on this date" — explicitly a forensic tool, run rarely,
never on the request-serving path, and never claimed to be faster or
more current than live resolution.

### 19.F — Support impersonation, properly bounded

Workshop 1 scenario 4, sharpened into a governance requirement by
Workshop 5 scenario 23. A platform session needs a mode that resolves
permissions and renders pages exactly as a specific tenant user would
see them, for support and investigation purposes, with every write
action taken while impersonating either blocked outright or recorded
under a new `AuditActorType` value distinguishing "platform, acting as
tenant user" from every existing actor type. This is named last in this
list because it is the most security-sensitive item in the phase and
should be designed only after 19.A–19.E establish the governance
vocabulary (dispute states, restricted accounts, historical
reconstruction) it will need to interact correctly with.

### 19.G — Point-in-time reporting snapshots

Workshop 5 scenario 25, recurring independently in Workshop 6 scenario
29. Every report in the product computes live from current data. Once
a tenant's data can move between tenants (Phase 18.F) or a period can
require retroactive correction (a fraud remediation, an accounting
restatement), a report needs the option to be **frozen at generation
time** — an explicit snapshot, distinguishable from a live query,
carrying its own timestamp and, where relevant, a note that the
underlying data was later corrected or reparented.

## What this phase deliberately does not do

- No general-purpose workflow engine for "requires N approvers" beyond
  the specific separation-of-duties pairs named in 19.A — this is a
  targeted fix for a named risk, not a new permission primitive.
- No cross-tenant reputation or reference-check system (Workshop 3
  scenario 14's rehire-eligibility gap, Workshop 8's blocked-from-
  future-employment concern) — flagged as a real, separate need,
  explicitly deferred pending its own privacy and cross-tenant-identity
  design (depends on Phase 18.B).

## Exit criteria

19.A–19.E ship and are proven against Cedar Motors' actual investigation
timeline (Workshop 5, scenarios 21–25) end to end: the separation-of-
duties flag would have surfaced the approve/issue loop; the dispute
state, refund taxonomy, and restricted-account state together let an
owner respond without freezing the tenant; the reconstruction tool
answers "what could this account do on this date" correctly against
seeded historical permission changes. 19.F ships with an explicit,
written threat-model review before merge, given its sensitivity. 19.G
ships for at least one existing report surface.
