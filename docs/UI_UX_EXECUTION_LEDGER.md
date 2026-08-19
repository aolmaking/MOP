# UI/UX + Functional Execution Ledger

Live state for a multi-session execution run. Resume from the first item
that is not `VERIFIED`. Do not restart analysis; the investigation notes
below are the findings, not guesses.

States: `PENDING` -> `IN PROGRESS` -> `IMPLEMENTED` -> `TESTING` -> `VERIFIED` / `BLOCKED`

## Directive summary (owner's words, condensed)

1. Replace the side rail with a top nav bar, everywhere.
2. No sharp corners anywhere; reasonable curves.
3. Loosen the strict 3-colour palette; softer tones + shadows allowed.
4. Real animation, especially on buttons.
5. For every page ask "what should be on this page" and build what is
   missing, backend included.
6. Owner could not open branch operations.
7. Pricing/service must connect to technician + inventory as one system.
8. Reports need volume-per-day/month, charts, hover detail.
9. Workflow Health needs to become a real subsystem (50-point brief).
10. History needs a "More" detail report subsystem.
11. Branch Manager work-order pages need the same detail depth.

## IMPORTANT design-system conflict (flagged, accepted, must be recorded)

`docs/DESIGN_LANGUAGE.md` currently argues FOR the side rail, restrained
radius ("a job card is a rectangle"; "uniformly rounded cards are a
generated-UI tell") and a strict 60/30/10 palette. Items 1-3 above
deliberately reverse that. The product owner has overridden it. When
items 1-3 land, DESIGN_LANGUAGE.md must be updated in the same commit or
the next session will "restore" the old rules as a regression.

## Queue

| # | Item | State | Notes |
|---|------|-------|-------|
| 0 | Owner blocked from branch operations | VERIFIED | Root cause: TENANT_OWNER had no `workorders.branch.view`. Spec (tenant-owner.md:248) wants a read-only company-wide work order view. That key guards GET-only routes; all mutations use other keys. Granted in default-role-permissions.ts. Needs re-seed + browser verify. |
| 1 | Rail -> top nav bar (6 shells) | VERIFIED | Done: all 6 rewritten to a sticky top bar. Measured at 1440px, workspace 1216->1440. DESIGN_LANGUAGE.md updated in the same commit. |
| 2 | Radius pass (tokens + sweep) | VERIFIED | DONE. Tokens 6/8/12 + pill. 5 hardcoded radii tokenised. Added a :where() zero-specificity shape baseline so ~90 rules that painted a surface without a radius are curved by default. Live DOM audit for 'surface with 0px radius' returns empty across all 5 Branch pages. |
| 3 | Palette softening + elevation | IMPLEMENTED | Added --shadow-1/2/3/focus, --info, --accent-cool, --neutral-track (both themes). STILL TO DO: apply elevation to page-level cards. |
| 4 | Button/interaction animation | IMPLEMENTED | Buttons lift/press, nav underline grows from centre, toast enters, inputs glow on focus. STILL TO DO: page/list entrance transitions. |
| 5 | Reports: volume/day+month, charts, hover detail | PENDING | Check what OwnerReports API already returns before adding endpoints. |
| 6 | Workflow Health subsystem | PENDING | Large. Needs capability matrix first (what exists vs missing). |
| 7 | History "More" full-detail report | PENDING | Needs an aggregation service across audit + events + tasks + inventory. |
| 8 | Branch Manager work-order detail depth | PENDING | Shares the detail-report subsystem with #7. |
| 9 | Service <-> technician <-> inventory <-> money chain | VERIFIED | Biggest domain item. Inspect PriceCatalog + InventoryItem + Task first. |

## Verification commands

```
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm --filter @mop/web run test
DATABASE_URL=...mop_platform_test corepack pnpm --filter @mop/api exec jest --runInBand
```

Baseline before this run: API 641/641, web 229/229, 6/6 linters.


---

## Session 2 close-out — exact resumption state

Commits pushed this session: `ef27d48`, `e445932`, `bd06680`
(plus `17455e5` from the prior session).

Verification at close: web 229/229, API 641/641 (clean run), 6/6 custom
linters, typecheck + build clean.

### What is genuinely finished (items 0-4)

Items 0, 1 and 2 are `VERIFIED` — implemented, browser-measured, tested.
Items 3 and 4 are `IMPLEMENTED`: the tokens and the shared-primitive
animations exist and are live, but they have only been applied to the
shared layer (button, input, toast, table wrapper, nav). Page-level cards
and panels still mostly rely on borders rather than `--shadow-*`.

**Next action for #3/#4:** sweep `apps/web/src/app/features/**/*.css` for
rules that set `border: 1px solid var(--border)` on a card/panel and add
`box-shadow: var(--shadow-1)`. Add list/row entrance transitions using
`transform`/`opacity` only.

### What has NOT been started (items 5-9)

These are each a subsystem, not a styling pass. None should be treated as
"nearly done".

#### 5. Reports — volume/day+month, charts, hover detail
Investigate first: `apps/api/src/reports/` and
`apps/web/src/app/features/owner/reports/sections/*`. A `bar-list`
component already exists at `apps/web/src/app/shared/reports/bar-list/`
and is the natural base for a chart primitive. Determine whether the
Owner reports API already returns time-bucketed counts (the analytics
services do bucket by day/week/month — see
`operations-analytics.service.ts` `volume()`), before adding endpoints.

#### 6. Workflow Health subsystem (the 50-point brief)
**Existing code found:** `apps/api/src/workflow-health/` including
`workflow-integrity.integration.spec.ts`. The page already detects
anomalies and renders them. The brief asks for a much larger surface:
issue lifecycle (acknowledge/escalate/resolve), grouping by root cause,
drill-down, filters, trend, freshness, branch scope, KPI definitions.
**Next action:** build the capability matrix demanded by the brief —
for each of the ~16 capabilities, record exists / partial / missing
against the real controller+service before writing any UI.
**Important finding to carry forward:** the 7 critical issues shown in
the demo are almost certainly caused by `seed-demo.ts`, which creates
work orders with `prisma.workOrder.create({ status: ... })` directly
rather than through `WorkOrderLifecycleService`, so no status-history
rows exist. That is a *fixture* artefact, not a production bug — but the
detector is correct to flag it. Decide explicitly: either seed through
the lifecycle service, or document these as intentional fixtures.

#### 7 + 8. History "More" detail report, and Branch Manager work-order depth
These share one subsystem: a work-order dossier aggregating customer
input, prior history, every task with actor+timestamp, inspection
results, decisions, and inventory movements.
Sources that already exist: `AssetHistoryService` (vehicle history),
`OperationEvent` (status changes), `Task`/`TaskAssignment` (who/when),
`AuditLog`, `CustomerDecisionRequest/Item`, inventory issue/return rows.
**Next action:** define one `WorkOrderDossierService` in the API that
composes those, with a single `GET /work-orders/:id/dossier`, then render
it in a shared drawer used by both Owner History and the Branch Manager
work-order page. Respect the audit-boundary linter: no `AuditLog` writes
outside `apps/api/src/audit/**`.

#### 9. Service <-> inventory <-> technician linkage
The largest domain item. The question asked was: if a technician changes
a battery, is that service easy to find, correctly priced, and correctly
tied to stock?
**Investigate first:** `PriceCatalogItem` (owner Pricing page writes it),
`InventoryItem`/catalog, `Task`, and the parts request/issue flow in
`apps/api/src/inventory/`. Establish whether a priced service can
reference an inventory item at all today — if not, that link is the
missing model, and it must be designed before any UI.


---

## Pre-existing test failures found while working (NOT caused by this session)

Four analytics/report suites fail:

```
analytics/people-analytics.integration.spec.ts        (2 failing)
analytics/decisions-analytics.integration.spec.ts     (1 failing)
analytics/inventory-feature-analytics.integration.spec.ts (1)
reports/reports-inventory.integration.spec.ts         (1)
```

**Proof they are not from this session's work:** `git stash push -- apps/api
packages/shared` then re-running `people-analytics` reproduces the identical
failure (2 failed, 1 passed) on a clean tree. None of the four suites
reference `FinanceService`, `PriceCatalogService` or `addLine`.

**Symptom:** the service returns nothing for rows the test just created --
`reworkRate` computes 0 instead of 50, and a `Fault` with code `P0128` does
not appear in `diagnosticCodeActivity`.

**Ruled out so far:**
- `resolveDateRange({})` is a correct trailing-30-days-ending-now window.
- `workOrderScopeFilter()` correctly yields an empty filter for an unscoped
  analyst, so `NO_SCOPE` is not silently matching nothing.
- The technician row itself IS found (`expect(row).toBeDefined()` passes);
  only the counts are zero.

**Note:** they passed 3/3 twice earlier in the same session, so this is
state-dependent rather than a straightforward logic bug.

**Next action:** reset the test database and re-run. This was blocked here
because `prisma migrate reset` cannot rename `query_engine-windows.dll.node`
while the dev server holds it -- stop the preview server first, then:

```
corepack pnpm --filter @mop/database exec prisma migrate reset --force --skip-seed
corepack pnpm --filter @mop/api exec jest people-analytics --runInBand
```

If they pass on a clean database, the defect is test-data accumulation and
the suites need proper per-run isolation. If they still fail, the defect is
in the analytics services' assignment/fault queries and must be fixed there.


---

## Service chain — COMPLETE and browser-verified

The chain Owner -> price -> task -> technician -> stock -> bill now runs
end to end and is proven twice: by integration tests against real
Postgres, and by driving the running application.

Implemented:
- `PriceCatalogService.resolve()` / `resolveMany()` — the lookup the
  catalogue never had.
- `FinanceService.addLine()` consults it when the caller states no price;
  an explicit price still wins; an uncatalogued line is refused rather
  than billed as zero.
- `AddLineDto.unitPrice` made optional — without this the HTTP surface
  could not use the capability the service had gained, and a caller who
  omitted the price got "Validation failed". Found by driving the browser,
  not by the unit tests.
- `Task.serviceKey` (migration `20260819142532_task_service_key`) plus an
  index on `(tenantId, serviceKey)`. Keyed by the stable business key, not
  a row id, because PriceCatalogEntry is effective-dated.
- `createTask()` rejects a serviceKey the workshop has not priced.
- `task.completed` event carries serviceKey; `performedServices()` answers
  "what was actually done, by whom" from the system that owns Task.

Browser evidence (live app, real seeded workshop):
```
Owner   POST /organization/finance-configuration/catalog  -> 201  450 + 90
Owner   GET  .../catalog                                  -> visible 450/90
Owner   POST /finance/work-orders/:id/lines               -> 403 (read-only, correct)
        [Owner delegates finance.running_invoice.add_line]
Manager POST /finance/work-orders/:id/lines  (NO price)   -> 201  total 540.00
Manager POST .../lines  "Never priced service"            -> 400  names the Service Catalog
```

Note on the 403: `finance.running_invoice.add_line` is deliberately
ungranted to every role by default — tenant-owner.md's "Who Can Handle
Money" requires the Owner to delegate it. The 403 is the product working,
not a defect; billing was verified after performing that delegation.

## Analytics suites — RESOLVED, and the cause was a real product bug

Not contamination. `resolveDateRange` defaulted `to` to `new Date()`, so
rows written in the same instant the report was built fell outside a
window claiming to cover "up to now" (assignedAt .809 vs range.to .804).
In production this under-reported the most recent activity. Fixed to end
at end-of-day, with six regression tests.

Full API suite: 658/658 across 88 suites. Web: 229/229. Linters: 6/6.

---

# CHECKPOINT — session 3

Baseline at this point: **API 664/664 across 89 suites · web 229/229 ·
6/6 linters · typecheck + build clean.** Preserve this.

## Completed and VERIFIED this session

| Item | Evidence |
|---|---|
| Analytics red suites | Root cause was a real product bug, not flakiness: `resolveDateRange` ended at `new Date()`, excluding rows written in the same instant (assignedAt .809 vs range.to .804). Fixed to end-of-day. 6 regression tests. |
| Service pricing authority | `PriceCatalogService.resolve()/resolveMany()`; `addLine` consults the catalogue; uncatalogued lines refused. 5 tests. |
| `AddLineDto.unitPrice` optional | HTTP layer could not use the capability; found by browser, not tests. |
| `Task.serviceKey` | Migration `20260819142532_task_service_key`. `createTask` rejects uncatalogued keys. Completion event carries it. `performedServices()` added. |
| End-to-end chain | 14/14 in `technician-work.integration.spec.ts`: catalogued service -> task -> technician -> real stock (availableQty 5->4, issuedQty 0->1, StockMovement row) -> part line with Decimal cost/price -> billing at 500.00 from catalogue -> reprice moves next job to 580.00, leaves billed job at 500.00. |
| Browser proof of chain | Owner priced 450+90; Branch Manager billed with NO price -> 540.00; uncatalogued -> 400 naming the Service Catalog. |
| Seed lifecycle history | `recordLifecycleHistory()` in seed-demo replays real transitions. Workflow Health 7 CRITICAL -> 0, and the two empty analytics panels now carry real data (Payment 7h, Inventory 6h, Quality 6h; 7 stages). |
| Work-order dossier (API) | `WorkOrderDossierService` + `GET /branch-manager/work-orders/:id/dossier`. 6 integration tests incl. tenant isolation, branch-scope refusal, cost gating. |
| Dossier drawer (UI) | `shared/dossier/`. Verified on DEMO-4471: 4 bands, timeline, Escape closes, 375px full-width single-column, scroll contained. |

## Important findings to carry forward

- **`finance.running_invoice.add_line` is ungranted to every role by
  default** — tenant-owner.md's "Who Can Handle Money" requires the Owner
  to delegate it. A 403 there is the product working. It was delegated to
  BRANCH_MANAGER in the **dev database only** to verify billing; a fresh
  seed will not have it. Consider whether the demo seed should delegate
  it so billing is demonstrable out of the box.
- **The parts chain was already correct** (`PartRequest -> IssuedItem ->
  StockMovement -> WorkOrderPartLine`). Do not rebuild it.
- **`Task.serviceKey` is not yet populated by the demo seed**, so the
  dossier shows seeded tasks as "ad-hoc". Wiring the seed's tasks to
  catalogued services would make the demo show the full chain.
- Migration must be applied to BOTH databases: `prisma migrate dev` hits
  dev only; run `corepack pnpm db:test:prepare` for the test DB.
- `prisma migrate reset` fails while the dev server holds
  `query_engine-windows.dll.node`. Stop the preview server first.

## NEXT ACTIONS, in order

1. **Reports/charts.** Owner asked specifically for cars-per-day and
   per-month, plus charts with hover detail. `operations-analytics.service.ts`
   already buckets by day/week/month via `volume()`; check what
   `apps/api/src/reports/` exposes to the Owner before adding endpoints.
   `shared/reports/bar-list/` is the existing chart primitive to build on.
2. **Wire the dossier into Owner History** (`/owner/audit`) as the "More"
   button — the drawer component is already shared and takes only a
   `workOrderId`.
3. **Seed `serviceKey` on demo tasks** so the demo shows a catalogued
   service end to end, and consider seeding one priced catalogue entry.
4. **Workflow Health depth**: issue lifecycle (acknowledge/escalate),
   grouping by root cause, filters, branch/time scope, drill-down. The
   detector itself is correct and its data source is now clean.
5. **Page-by-page capability pass** across all 8 shells.

## Session 3 (cont.) — reports volume + History dossier link

Baseline now: **API 667/667 across 89 suites · web 229/229 · 6/6 linters.**

- `ReportsOperationsService.volume` — created/closed per bucket at
  day/week/month plus `volumeTotals`. This is the "how many cars today /
  this month" report that did not exist: Operations had a snapshot,
  Financial had a trend, nothing counted throughput. Bucketed with
  date_trunc in SQL, matching the financial trend. 3 tests. Verified
  live: 7 created today, correct at both granularities.
- Owner History rows targeting a WorkOrder gained a **More** button that
  opens the shared dossier drawer.

**Full cross-role loop verified in the browser:** technician POSTed a
blocker -> lifecycle moved the job and wrote a WorkOrder audit row ->
Owner History rendered "More" on that row only (TaskBlocker, Invoice and
PriceCatalogEntry rows correctly had none) -> drawer opened on DEMO-4471
showing status Blocked and 7 timeline events, up from 4 before the
blocker.

### Next actions (unchanged order, 1 now done)

1. ~~Reports volume~~ DONE. Still to do on reports: a **chart** for the
   volume series (`shared/reports/bar-list/` is the primitive) and hover
   detail on the existing report figures.
2. ~~Dossier in History~~ DONE.
3. Seed `serviceKey` on demo tasks so the demo shows a catalogued service
   end to end; consider seeding a priced catalogue entry and delegating
   `finance.running_invoice.add_line` so billing is demonstrable from a
   fresh seed.
4. Workflow Health depth: issue lifecycle, grouping, filters, scope,
   drill-down.
5. Page-by-page capability pass across all 8 shells.

## Session 3 (cont. 2) — volume chart, date-only bound, demo chain

Baseline: **API 672/672 across 89 suites · web 229/229 across 47 files ·
6/6 linters · typecheck clean.**

- `shared/reports/volume-chart/` — CSS column chart, two series per
  bucket (booked in vs completed). Each column is a real `<button>` with
  its figures in the accessible name, so the detail is keyboard-reachable
  and readable without the tooltip; the readout area is reserved so
  hovering never shifts the chart. Wired into the Owner's Operations tab.
- **Second date bug, found by the chart rendering empty against real
  data:** the Reports page sends `to=2026-08-19`, which parses to
  midnight at the START of the day, so every Owner report silently
  excluded everything from today. `resolveDateRange` now treats a
  date-only bound as the whole of that day; a full timestamp is still
  exact. 3 more regression tests.
- Demo seed now creates a Service Catalog (3 priced services), links
  seeded tasks to it via `serviceKey`, and grants the branch manager the
  money permissions an Owner would delegate on day one.

**Whole chain verified from a fresh seed:** catalogue "Replace front
brake pads" = 1800 + 400 -> task carries that serviceKey -> dossier reads
it off the job -> billing it while stating NO price returns 2200.00 ->
the dossier's money band shows 2200.00.

### Next actions

1. Workflow Health depth: issue lifecycle (acknowledge / investigate /
   escalate / resolve), grouping by root cause, severity + type + branch
   + time filters, drill-down to the affected entity, freshness. The
   detector is correct and its data source is now clean, so this is
   purely additive. `apps/api/src/workflow-health/workflow-integrity.service.ts`
   returns `IntegrityIssue[]` -- start by giving an issue an identity and
   a status so it can be acknowledged.
2. Hover detail on the remaining report figures (bar-list has no
   tooltip yet).
3. Page-by-page capability pass across all 8 shells.
4. Consider a `WorkOrderPartLine` -> dossier link for parts added
   outside a part request.

## Session 4 — Workflow Health completed as a subsystem

Baseline: **API 681/681 across 89 suites · web 235/235 across 47 files ·
6/6 linters · typecheck + build clean.**

Design decision worth preserving: **issues are never stored.** They are
derived facts, recomputed each scan; persisting them would create a
second copy that drifts from the records it came from -- the exact
failure this page exists to detect. Only the human decision is stored, in
`WorkflowIssueAcknowledgement`, keyed by a deterministic fingerprint
(`type:entityType:entityId`). An issue that stops being detected resolves
itself. There is deliberately no "resolve" action.

Delivered: stable issue ids; OPEN/ACKNOWLEDGED/INVESTIGATING/ESCALATED
with note + actor + timestamp; grouping by fault class with plain-language
meaning, recommended action and who can fix it; severity/type/status
filters that never distort `totals`; `scannedAt`; required note on
acknowledge; `DetectedIssue` split from `IntegrityIssue`.

Browser-verified against two deliberately corrupted jobs -- see commit
message for the full trace. Probes removed, seed verified intact.

### Remaining queue

1. ~~Workflow Health~~ DONE.
2. Reports & Charts: `bar-list` still has no hover detail (the volume
   chart does). Consider whether Financial/Inventory/Customers sections
   need the same treatment as Operations got.
3. Work Order / History dossier depth: the dossier exists and is wired
   into both surfaces. Remaining idea: link `WorkOrderPartLine` rows that
   came from a PartRequest back to that request in the timeline.
4. Page-by-page capability audit across all 8 shells.
5. Phase 16 -> 22 remaining work.

---

## Session 5 — the two dead platform rail links, closed

Both links visible in the owner's very first screenshot pointed at no
route, so they fell through to the placeholder landing page. Both are now
real pages backed by real reads.

### Control Center (`/platform/control-center`)

Governance overrides: permission locks and workshop archive/restore. The
backend already existed and was reachable only by calling the API
directly. Every action demands a written reason.

Live governance cycle proven end to end:
`beforeLock 201 -> afterLock 403 -> remove 201 -> afterRelease 201`.

While building it, lock **removal** turned out to be silently broken:
`RemoveRoleLockDto` rejected the `reason` field with a 400 that the UI
surfaced as nothing. Fixed by making `reason` required end to end, which
also closed a real audit asymmetry — setting a lock recorded why,
removing one did not.

### Live View (`/platform/live-view`)

The last dead link. Nothing existed behind it, so the backend was built:
`LiveViewService` + `LiveViewController`, platform-guarded.

It is the only endpoint in the product that aggregates **across** tenants,
which shapes every decision in it:

- It returns counts and event *kinds* only — never job, customer or money
  detail.
- Activity summaries are derived from `eventKey` alone. The payload is
  never read, because the payload is where plate numbers, customer names
  and amounts live. An integration test asserts a planted
  `SECRET-PLATE-9999` payload does not appear anywhere in the response.
- Nothing is actionable in-page. Acting on a workshop means going to
  Control Center, where it is audited.

The figure the page exists for is **"quiet with open work"** — a workshop
with open jobs and zero events in 24h. That is not calm; it is work
abandoned mid-flow or stuck. Those rows sort to the top and are the only
place the identity red is spent.

Browser-verified against real data, then against a real quiet condition:
a temporary open job in Delta Quick Service made the page re-sort Delta
above Apex, render `needs a look`, and turn the total red (`rgb(212,23,23)`).
Probe rows removed by exact id afterwards; page confirmed back to 0 quiet.

**Two real defects found and fixed during verification:**

1. `platform.controller.integration.spec.ts` logged in via
   `findFirstOrThrow({ accountType: "PLATFORM" })` — any platform account.
   Once a second suite created one, it picked an arbitrary account and the
   suite failed. Now it uses the account it created.
2. The mobile rule used `grid-template-columns: 1fr`, which floors at the
   content's min-content width. The panel rendered 434px wide in a 375px
   viewport and pushed 71px past the screen. `minmax(0, 1fr)` fixed it —
   the same guard the desktop rule already had.

**Gate: API 691/691 across 90 suites · web 235/235 across 47 files ·
7/7 linters · typecheck clean.**

### Remaining queue

1. ~~Workflow Health~~ DONE.
2. ~~Control Center~~ DONE. ~~Live View~~ DONE. No dead nav links remain
   in the Platform shell.
3. Reports & Charts: `bar-list` hover detail landed for Operations.
   Consider whether Financial/Inventory/Customers need the same.
4. ~~Work Order / History dossier depth~~ DONE (below). Remaining idea was
   linking `WorkOrderPartLine` rows back to the `PartRequest` they came
   from.
5. Page-by-page capability audit across the remaining 7 shells.
6. Phase 16 -> 22 remaining work.

---

## Session 6 -- part lines traced back to their PartRequest

`WorkOrderPartLine.partRequestId` already existed on the model (unique,
nullable) -- the field a part-request-issued part carries back to the
request that produced it. The dossier neither selected nor exposed it, so
a job's parts list read identically whether a part came off the shelf
through a real, approved request or was typed in by hand: no way to tell
"properly requested and issued" from "added directly" without leaving the
dossier and opening Inventory separately.

Selected onto `DossierPartLine`, threaded into the PART timeline entries
(`"Part added: X x2 (from parts request)"` plus `partRequestId` in
`detail`), and surfaced in the drawer as a "from parts request" chip.
Proven with a real `PartRequest` + linked `WorkOrderPartLine` against the
pre-existing seeded line that has neither, so both the present and the
absent case are asserted, not just the happy path.

**Gate: API 692/692 across 90 suites · web 235/235 · 7/7 linters ·
typecheck + build clean.**

Browser verification not performed this session -- dev-server preview is
unavailable in this unattended run (a separate concurrent session already
had the dev server open on this machine). Owed: drive a job with a
requested part through `/branch/work-orders/:id` or `/owner/audit` next
session and confirm the chip renders.

### Remaining queue

1. ~~Workflow Health~~ DONE.
2. ~~Control Center~~ DONE. ~~Live View~~ DONE.
3. ~~Work Order / History dossier depth~~ DONE.
4. Reports & Charts: consider whether Financial/Inventory/Customers need
   bar-list hover detail the way Operations got it (a parallel session may
   already be mid-flight on this -- check before starting).
5. Page-by-page capability audit across the remaining 7 shells.
6. Phase 16 -> 22 remaining work.

---

## Session 5 (cont.) — reports detail, and the demo data behind it

### Dead-link sweep: clean

Every `routerLink` and every shell `navigation` route was cross-referenced
against `app.routes.ts`. **No dead nav links remain anywhere.** Control
Center and Live View were the only two, and both are now real pages.

(A first pass reported three more — `/customer/assets`, `/customer/history`,
`/tech/work`. That was a bad parser, not a bug: it only matched route
definitions written across multiple lines and missed single-line ones.
All three are registered. Worth remembering before trusting a sweep like
that again.)

### Hover detail on every report list

Financial, Inventory and Customers had none while Operations had it on
all four lists. Each row now states what the bar cannot: the count behind
a total and the per-unit average it implies. Division guards on zero
instead of printing NaN — confirmed live against empty aging buckets.

### The demo data gap this exposed

Pulling that thread showed two of the five report tabs were empty because
the demo workshop had no data to report on:

- **No invoice was ever issued and no payment ever recorded.** The seed
  now carries twelve jobs through to CLOSED with invoices and payments
  over ten weeks, three payment methods, two part-paid, and three unpaid
  at 10/45/80 days — one per aging bucket. Books balance: 18,970
  collected + 8,530 outstanding = 27,500 invoiced.
- **The workshop owned two warehouses and zero parts.** Six parts now,
  with real costs, plus stock, receipts, issues and part lines. Dead
  stock, profitability and stock risk all read from real rows.

### Four real bugs found by having data at last

1. `clearDemoWork` deleted work orders without unwinding finance first.
   `Invoice -> WorkOrder` is `onDelete: Restrict`, so the second seed run
   failed outright rather than leaving strays.
2. `recordLifecycleHistory` had no CLOSED path and always replayed
   backwards from *now*, so twelve jobs closed weeks apart all reported
   their transitions as today's activity. It now takes the moment the job
   reached its final status.
3. `StockMovement` references a work order by plain string, not a foreign
   key, so nothing cascaded them away — each re-seed drained the shelf
   further. Cleared with their jobs now, balances reset.
4. **`averageTimeInStatus` published terminal states.** That slice
   measures time since the job finished and runs to the end of the report
   range, so the same twelve jobs told a different story depending on the
   dates asked for — a year of history made "average time in CLOSED"
   larger than a month of it.

   Fixed at the report layer, **not** in `computeStatusDurations`. That
   function partitions the whole timeline on purpose, `workflow-bottlenecks`
   reads it that way, and an existing test pins the contract deliberately.
   The unsound part is presenting a terminal slice as a stage duration, so
   both callers that make that claim to a human exclude it. First attempt
   changed the util and broke that test — the test was right.

5. "Most profitable parts" took the top ten by revenue and drew them by
   profit. Sorted where the heading makes the claim.

**Gate: API 693/693 across 90 suites · web 235/235 across 47 files ·
7/7 linters.** API suite run twice consecutively at exit 0 — a single
earlier failure was contention from chaining the web and API suites in one
command, not a flake in the code.

### Remaining queue

1. ~~Workflow Health~~ · ~~Control Center~~ · ~~Live View~~ · ~~report
   hover detail~~ — all DONE.
2. Dossier depth: link `WorkOrderPartLine` rows back to the `PartRequest`
   they came from. Now genuinely reachable — part lines finally exist.
3. Page-by-page capability audit across the remaining 7 shells. The
   Inventory Manager shell in particular has never been seen with real
   stock in it until now, so it is worth a fresh pass.
4. Phase 16 -> 22 remaining work.
