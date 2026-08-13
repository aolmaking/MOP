# Phase 12 — Reporting & Data Analyst

> **Goal:** the first real, company-wide reporting surface — `DATA_ANALYST`'s own role, previously declared in the schema and the permission manifest but never given a page or a permission.
> **Companion:** `docs/PHASE_MAP.md`'s own Phase 12 entry, which names the scope decision this phase makes explicitly rather than leaving implicit.

---

## 1. The scope decision `PHASE_MAP.md` asks this phase to make

> "Depends on Phase 19.G (point-in-time report snapshots) if this phase's reports are to support the retroactive-correction and tenant-relationship-change cases Workshops 5 and 6 found — build 12 after 19.G lands, or accept live-only reporting as this phase's explicit, named limitation."

This phase takes the second option. **Every report here is computed live, against current rows, at request time.** If a work order's branch changes, or an invoice is corrected, a report run before and after that change will differ — there is no point-in-time snapshot to reproduce "what the report would have shown on that date." This is a real, named gap, not an oversight: building point-in-time snapshots properly means Phase 19.G's infrastructure, and back-filling it into this phase would mean re-doing this work a second time once 19.G exists. Revisit when Phase 19.G lands.

## 2. What ships

`ReportingService`/`ReportingController` (`apps/api/src/reporting/`) — one company-wide report, available to `DATA_ANALYST` and `TENANT_OWNER`/`TENANT_ADMIN` via the new `reports.company.view` permission key:

- **Technician performance, company-wide** — tasks completed, active tasks, blockers, rework count, per technician, across every team — the un-scoped counterpart to Team Leader's own `managedTechnicianIds`-scoped version from Phase 10. The two must never be confused: Team Leader's report is provably reachable only through the managed scope (tested in Phase 10), and this one is provably reachable only through `reports.company.view`, which `TEAM_LEADER`'s default permission set does not include.
- **Work order throughput** — open work orders grouped by status, company-wide, the same status vocabulary Owner Home already uses.
- **Finance summary** — total invoiced, total collected, outstanding balance, computed with `@mop/shared`'s `sum()`, never a JS-number reduction.

Drill-down exists in the minimal sense the rows already support: every technician-performance row carries a real `staffUserId`, so a caller can follow it to `GET /team-leader/technicians/:id` style detail — no separate drill-down endpoint was built, because the roster it would return is identical in shape to data other endpoints already expose.

## 3. What did not ship, named rather than dropped

- **Exports.** No CSV/PDF export endpoint. Nothing in the codebase generates a downloadable file today (Billing's `BillingDocumentArtifact` is the closest precedent and is itself unconsumed by anything that writes bytes to a response), and building the first one as a side effect of a reporting phase would be exactly the kind of scope creep this project's waterfall method exists to avoid.
- **Saved views.** No persistence for a user's chosen filters. Would need its own small model and its own page; deferred to whichever future pass gives Reports & Analytics (still owed from Phase 10's list of six remaining Owner pages) its full scope.
- **Point-in-time snapshots.** Section 1.

## 4. Exit criteria

1. `reports.company.view` exists in the permission manifest, granted to `DATA_ANALYST` and both Owner-shaped roles, and is absent from every other role's default set.
2. The technician-performance report is proven, by test, to include technicians outside any one team leader's managed roster — the property that makes it genuinely company-wide rather than a re-export of Phase 10's scoped version.
3. Every money figure in the finance summary is a string, built via `@mop/shared/money`.
