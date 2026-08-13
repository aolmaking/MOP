# Phase 19 — Governance Depth

> **Status:** 🟠 19.B, 19.C, 19.D shipped and proven; 19.A shipped its
> data foundation only (enforcement reverted, see below); 19.E and 19.F
> deferred with reasons; 19.G not attempted. See "What actually shipped."
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

## What actually shipped

- **19.A — separation of duties: data foundation only, enforcement reverted.** `PartRequest.approvedById` is now recorded on every approval, proven by test. A hard block in `PartRequestService.issue()` (refusing the same account to both approve and issue) was built, then **reverted** after it broke 22 of this codebase's own existing Inventory integration tests -- every one of them models a single storekeeper legitimately handling both steps, which is a real, common shape (Nafath's single-operator shop, named explicitly in this project's own scenario set) that a blanket rule would have made impossible. This is exactly the finding 19.A itself describes in miniature: a rule that is correct for Cedar Motors' 20-technician shop is wrong, unconditionally applied, for a one-person garage. The real fix is a per-workshop opt-in policy (a capability or `TenantConfiguration` flag), not a global rule -- that policy design is deferred, named here rather than shipped broken or silently reverted without explanation.
- **19.B — dispute state.** `WorkOrderDispute`, non-destructive by construction (a new row, never an edit to `WorkOrder`). Proven by test: raising a dispute leaves `WorkOrder.status` untouched; resolving one adds a resolution without deleting the original row.
- **19.C — forensic-reason refund taxonomy.** `RefundRequest.reasonCategory` (`ROUTINE | DISPUTE_REMEDIATION`), wired through `FinanceService.requestRefund()`'s existing signature with a `ROUTINE` default. Proven by test for both the default and an explicit override.
- **19.D — restricted-pending-investigation account state, fully wired.** `StaffUser.restrictionStatus` + `StaffRestrictionService` (restrict/lift, both writing a HIGH-risk audit row) + a new `StaffRestrictionLayer` in the permission resolver, positioned beside `TenantStatusLayer` as the same kind of true ceiling, scoped to one account instead of the whole tenant. Same read-only shape as `TenantStatusLayer`'s own Phase 18.D fix: a restricted account still passes every `.view`-suffixed key, denied on everything else. This is the missing narrower lever Workshop 5 scenario 24 asked for, in full, not just its schema.

## What was deferred, with reasons

- **19.A's enforcement** (see above) -- needs a per-workshop policy design, not a global rule.
- **19.E — historical permission reconstruction.** Named by the phase document itself as "the hardest item in this phase." A genuine offline forensic tool -- replaying `capability.changed`/role-permission-change audit rows in order to answer "what could this account do on a past date" -- deserves real design attention (what's the replay algorithm, how far back does audit history realistically go, how is a wrong reconstruction distinguished from a right one) rather than a rushed implementation appended to a session already covering five other sub-items.
- **19.F — support impersonation.** The phase document itself says this should be "designed only after 19.A–19.E establish the governance vocabulary" and ships "with an explicit, written threat-model review before merge, given its sensitivity." Given 19.A's enforcement was reverted and 19.E was not attempted, that vocabulary is not fully established yet, and a rushed threat-model review would be worse than none -- deferred honestly rather than checked off with a shallow one.
- **19.G — point-in-time reporting snapshots.** Not attempted this pass. `ReportingService` (Phase 12) remains explicitly live-only, as already documented in `docs/phases/PHASE_12.md`.

## Exit criteria

**Not fully met, and not claimed to be.** 19.B, 19.C, and 19.D shipped and are proven against real data. 19.A shipped a real, useful piece (who approved what, now recorded) but not the enforcement the phase asked for -- reverted for a concrete, tested reason rather than silently weakened. 19.E, 19.F, and 19.G are deferred with specific reasons above, matching this project's own standing rule that a deferred item is named, never silently dropped.
