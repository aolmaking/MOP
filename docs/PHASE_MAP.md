# MOP Phase Map

> **What this is:** the single, linear plan for all remaining work. One numbering scheme, one order, one place.
> **Companion:** [`docs/PAGE_INVENTORY.md`](./PAGE_INVENTORY.md) is the **single canonical source for the page-completion count** — the definition of "done" for Phases 5–12. This file cites its total rather than maintaining a separate one, after the two were previously found to disagree (this file self-contradicted at 23/53 vs. 34/53 in two different sections; `PAGE_INVENTORY.md` independently read 48/53). [`docs/archive/discovery/scenarios/`](./archive/discovery/scenarios/) and [`docs/archive/discovery/scenarios2/`](./archive/discovery/scenarios2/) are the two discovery passes that produced Phases 15–20 (archived — their findings are already absorbed into those phases). [`docs/archive/discovery/scenarios3/`](./archive/discovery/scenarios3/) is a third pass — 20 edge cases, not persona-driven — that did not earn new phases but is attributed against the phases above; see rule 8 below.
> **Date:** 2026-08-21, after a code-verified audit (every route and controller read directly) reconciled this file, `PROJECT_STATE.md`, and `PAGE_INVENTORY.md`, which had drifted from each other and, in two cases, from the actual code.

---

## Where the project stands

**Built and verified** (see `docs/PAGE_INVENTORY.md` for the current page count and `PROJECT_STATE.md` §2 for the current phase-by-phase state; test counts below are from the last full run recorded in `PROJECT_STATE.md` and should be re-confirmed with `corepack pnpm test` rather than trusted as current):

| Area | State |
|---|---|
| Data model | Full Prisma schema, all work-order statuses, part states, capability/audit/control-setting tables |
| Permission resolver | **10 layers** (platform → plan → tenant status → capability → module → feature → workshop config → **delegation** → role template → user override), real iterated array, deny-by-default, `locked` short-circuit, per-request context caching |
| Audit | Module-encapsulated, lint-enforced — build fails on any `AuditLog` write outside `apps/api/src/audit/**` |
| Capability layer | Registry, workflow graphs, reachability validator, 7 profiles |
| Operations engine | `WorkOrderLifecycleService` sole writer of status, capability-aware from its first line |
| Auth | 4 account types, DB-backed sessions, refresh rotation, lockout, rate limiting |
| Money | `Decimal` in DB, `string` across API, dedicated `lint-money.mjs` guarding it |
| Pages | **47 complete + 6 partial + 0 not built, of 53 spec'd** — see `PAGE_INVENTORY.md` for the full per-role breakdown; that document is the only place this count is tracked |
| Test coverage | Business logic is real everywhere (no stubs, no hardcoded fake returns found anywhere in `apps/api/src`), but only Auth, Access/Permissions, and Platform/Super-Admin have tests that exercise a real HTTP request through the session guard — every other subsystem is tested at the service layer only, which proves the logic but not the route wiring |
| Discovery | Three discovery passes complete and archived: 20 workshop-floor scenarios (`docs/archive/discovery/scenarios/`), 40 platform-layer scenarios (`docs/archive/discovery/scenarios2/`), 20 edge cases (`docs/archive/discovery/scenarios3/`) |

**Not yet true:** no country-specific billing/invoicing adapter exists (Egypt ETA, Saudi ZATCA) — `GenericBillingAdapter` is the only one, so every real country is currently compliance-blocked. Phases 15–20's specialization/tenant-relationship/governance/resilience work is real but partially shipped — see the phase table below for exactly how much of each. Phase 21 (Policy & Decision Architecture) is documents-only, by design, awaiting an owner decision before any implementation.

## The rules that set the order

1. **Nothing is trusted until it is provably runnable.** Verification infrastructure comes before features.
2. **Design decisions that change the schema come before the schema is depended upon.**
3. **The capability-aware lifecycle comes before any role page**, because retrofitting capability-awareness into hardcoded transitions across five roles is the single most expensive mistake available.
4. **Decisions that are cheap now and ruinous later happen at their cheapest moment** — i18n/RTL while there are 8 components, not 80.
5. **Every role phase closes with a cross-system scenario walkthrough**, never a page checklist. This is the specific discipline that would have caught v11.9's disconnected-pages failure.
6. **A phase may not be marked complete while any page or scenario finding it owns is unaddressed.** `PAGE_INVENTORY.md` and the two scenario syntheses are the definitions of done; measuring "complete" against what was built rather than what was required is the exact mistake Phase 7 was originally marked complete under.
7. **A discovery pass earns a phase, not a patch.** When a scenario walkthrough finds a gap that is structural — missing vocabulary, missing platform-relationship model, missing resilience story — it gets its own phase with its own exit criteria, not a scattered set of tickets absorbed silently into whichever phase happens to be active.
8. **A hardening pass earns a register entry, not a phase.** When a discovery pass finds gaps that are *not* structural — a race condition, an unverified claim, an undocumented rule — those attach to the phase that already owns the affected system, tracked in a register, not spun into a new phase number. `docs/archive/discovery/scenarios3/EDGE_CASE_REGISTER.md` is this project's first such register; a phase is not done while an edge case attributed to it is neither fixed nor explicitly, reasonedly deferred.

---

## Progress

| Phase | State |
|---|---|
| 1 — Runnable and Provable | ✅ complete |
| 2 — Design Completeness | ✅ complete |
| 3 — Governance Runtime | ✅ complete |
| 4 — Operations Spine | ✅ complete |
| 5 — Branch Manager | ✅ complete — 7/7 pages |
| 6 — Technician | ✅ complete — 3/3 pages, including a real part-request/return lifecycle reachable from the technician's own endpoints |
| 7 — Inventory | ✅ complete — 6/6 pages |
| 8 — Finance Core | 🟢 engine complete; Owner-facing Pricing page shipped |
| 9 — Billing / Invoicing | 🟠 engine, refund workflow, and credit notes complete and tested; **no country-specific legal invoicing adapter exists** — every real country is compliance-blocked until one ships |
| 10 — Team Leader & People/Performance | ✅ complete (narrowed) — API and all 5 web pages (4 Team Leader + Owner Home) built and reachable; see `PHASE_10.md` §6 |
| 11 — Customer Portal | ✅ complete — API + all 6 web pages |
| 12 — Reporting & Data Analyst | ✅ 7/7 Data Analyst pages complete; Saved Views persistence shipped; `Plan.allowedExports`/`analytics.export` gate shipped; CSV export file generation shipped |
| 13 — System Automation | ✅ complete (lock, not a separate worker) — `SchedulerLockService` advisory lock |
| 14 — Internationalization & Release Readiness | 🟠 permission-key lint + a perf fix shipped; the translation pass itself was never done |
| 15 — Specialization Discovery | ✅ schema settled, 3/5 primitives proven end-to-end |
| 16 — Specialization Structure | ✅ minimum bar met (16.A/E/H); 16.I design spike written |
| 17 — Specialization at Creation | 🟠 17.A backend seam shipped; wizard UI and 17.B–E owed |
| **18 — Tenant Relationships** | 🟠 18.A/D/E shipped; 18.B/C deferred; 18.F design decision written |
| **19 — Governance Depth** | 🟠 19.B/C/D shipped; 19.A data-only (enforcement reverted); 19.E/F/G deferred |
| **20 — Operational Resilience at Scale** | 🟠 20.B shipped; 20.E design decision written; 20.A/C/D/F deferred |
| **21 — Policy & Decision Architecture** | 🟠 **architectural resolution pass complete** — relevance graph built and proven acyclic (4 cycles found+fixed), S-01 resolved into 3 sub-questions, QC decomposed (new P-71), owner/Super-Admin money authority recorded as an open conflict rather than assumed; awaiting owner review; no implementation, by design |
| Platform Super Admin (cross-cutting) | 🟢 5/6 pages complete, 1 partial — **Governance Controls and Workshop Live View are both built and working**, correcting an earlier claim in this table (and in two of this project's own now-archived audits) that they were unblocked-but-unbuilt. Only Builder Control's broader scope (theme/layout/workflow-policy editors, config version rollback) remains unbuilt beyond the capability-shaping page that exists today |

**Total page inventory: see `docs/PAGE_INVENTORY.md`** — the only place this count is tracked, currently 47 complete + 6 partial + 0 not built, of 53. This file previously carried its own count and self-contradicted (23/53 in one section, 34/53 in another); both were wrong and neither is repeated here.

## The phases

### Phase 1 — Runnable and Provable ✅
Reproducible environment, DB path verified end-to-end, CI green, rate limiting, boot-time config validation, systematic money serialization, per-request permission-context caching, i18n/RTL foundation (logical CSS, `dir` handling, bidi isolation).
**Edge cases:** none open. H9 partially fixed (slug pattern enforced; PDF/audit rendering unaudited); E18 fixed (versioned password hashes, lazy rehash on login) — see `EDGE_CASE_REGISTER.md`.

### Phase 2 — Design Completeness ✅
Scenario × capability matrix, typed cross-system contracts, gate registry, schema verdict for every scenario.

### Phase 3 — Governance Runtime ✅
`TenantCapability` time-ranged schema, capability resolution in the resolver, change pipeline (draft → validate → live-data preconditions → impact preview → apply → audit → rollback), Super Admin capability-shaping UI, historical interpretation.
**Edge case owed:** E13 — capability rollback racing an in-flight lifecycle transition; design spike required, see `docs/archive/discovery/scenarios3/EDGE_CASE_REGISTER.md`.

### Phase 4 — Operations Spine ✅
`WorkflowRouter` driven by the capability graph, intake, ownership transfer, work order/task lifecycle, inspections/faults/blockers, capability-aware Finish Gate.
**Edge cases:** none open. H1 (concurrent blockers), H2 (capability check-then-write gap), H4 (decision landing on an already-closed work order), and E19 (stale-ownership decision, flagged in the audit trail rather than blocked) fixed — see `EDGE_CASE_REGISTER.md`.

### Phase 5 — Branch Manager ✅
Attention Center · Customer Intake · Work Orders board · Work Order Workspace · Approvals · Delivery & Payments · **Team Setup**, delegation-gated.
**Edge cases owed:** none open. H8 (double-click races the team-membership transaction) and H10 (`ControlSetting` hard-delete) fixed — see `EDGE_CASE_REGISTER.md`.

### Phase 6 — Technician ✅
Now · My Work · Work Card, 10 tools, mobile/tablet-first, no sidebar.

### Phase 7 — Inventory ✅ complete — 6/6 pages
Inventory Home · Technician Requests · Catalog Control · Quantity Control & Stock Status · Returns/Movements (accept/reject/clarify, closed in an earlier arc) · Reports & Stock Insights.
**Edge cases:** none open. H6/E16 and H7 (warehouse deactivation, `BLOCK_UNTIL_ZERO`) fixed — see `EDGE_CASE_REGISTER.md`.

### Phase 8 — Finance Core 🟠
Pricing catalog, discounts, tax policy, running balance, payments, deposits, financial reports engine — all built. **Owed:** the Owner's own Money page (Phase 10), and refunds/credit notes (explicitly deferred to Phase 9, since shipped there).
**Edge cases owed:** E15 — halfway-point rounding needs one named, documented rule (already verified resolved on inspection, see the register). H3 and H5 fixed — see `EDGE_CASE_REGISTER.md`.

### Phase 9 — Billing / Invoicing ✅
Separate bounded system. Legal invoice document, numbering, immutable snapshots, credit/debit notes, `GenericBillingAdapter` behind the country-adapter seam. **Sharpened by Workshop 2 (scenarios 6, 9, 10):** the country-adapter seam is not optional infrastructure for a hypothetical future market — it is the difference between a tenant being legally able to trade and not, the moment a second country's tenant exists. ZATCA (Saudi) and ETA (Egypt) are the two adapters named for this phase's first pass; a tenant onboarded into a country without a ready adapter must be flagged **compliant-blocked** (see Phase 20.D), never silently allowed to issue invoices the law doesn't recognize.

### Phase 10 — Team Leader & People/Performance ✅ (narrowed — see `phases/PHASE_10.md`)
Team Leader's four pages (Home, Technicians, Vehicles/Work Orders, Technician Performance Reports, all `managedTechnicianIds`-scoped) and Owner Home are all built with a real API and a real, reachable web page — closed across three separate passes on the same working tree, recorded rather than smoothed over in `phases/PHASE_10.md` §6–7. **Re-planned at this phase boundary, recorded rather than silently dropped:** the Owner's Money page (folded into the remaining six Owner pages, its own future pass) and exit-reason/rehire-eligibility on staff deactivation (pushed to Phase 19) were both named in this entry originally but did not land this pass. **Detail:** [`phases/PHASE_10.md`](./phases/PHASE_10.md)

### Phase 11 — Customer Portal ✅ — see `phases/PHASE_11.md`
Portal home, my assets, current service, invoice status, safe technical history — API and now all five web pages; decision page and public decision links were already shipped in an earlier phase. Found and documented rather than silently patched: the ten-layer permission resolver has no real opinion about a `CUSTOMER` session, so portal access is checked directly on `session.accountType`/`enabledModules` instead, mirroring the existing public decision controller's own reasoning, still owed as a future permission-engine rework. Current Service renders one plain-language phrase per job rather than the spec's full lifecycle strip, since the API exposes status only — real future work against the same page, not faked client-side (§5).

### Phase 12 — Reporting & Data Analyst ✅ (live-only reporting; see `phases/PHASE_12.md`)
`DATA_ANALYST`'s first real report: company-wide technician performance, work order throughput, finance summary, all gated by the new `reports.company.view` key. Took the phase's own named option: live-only reporting, no point-in-time snapshot (that is Phase 19.G's job). Saved views and CSV exports shipped later as a backed implementation: saved views persist per analyst, `analytics.export` is locked by `Plan.allowedExports`, and the export endpoint generates the current analytical page/filter view rather than an unscoped tenant dump.

### Phase 13 — System Automation ✅ (lock, not a separate deployable — see `phases/PHASE_13.md`)
`SchedulerLockService` wraps every `@Cron` job in a Postgres advisory transaction lock (`pg_try_advisory_xact_lock`), proven by a concurrency test to stop the double-fire two API replicas would otherwise cause. A genuinely separate worker process was not built: the only scheduled job today is the liveness heartbeat, and there is no real recurring business job yet to justify a second deployable — revisit when one exists.

### Phase 14 — Internationalization & Release Readiness 🟠 (permission-key check + a real perf fix shipped; translation/summary tables owed — see `phases/PHASE_14.md`)
**Narrowed by Workshop 2's finding (scenario 9) that this phase originally bundled two separable problems.** Translation (dialect/register accuracy per market — Egyptian vs. Gulf Arabic) and legal country-adaptation (tax, invoicing, business-identity fields) are now two independently-paced tracks: the legal half is pulled forward into Phase 9/20.D because a tenant can need it years before it needs dialect-accurate UI. Shipped this pass: `tools/lint-permission-keys.mjs` (the assertion check `permission-manifest.ts` named as owed since Phase 11), a security review of the diff (no findings), and a real performance fix — `WorkOrder` was missing an index on `customerId` despite Phase 11's Customer Portal filtering by it on every page load. The translation pass proper and summary tables remain owed.

### Phase 15 — Specialization Discovery ✅ (3 of 5 primitives proven end-to-end, 2 schema-only — see `phases/PHASE_15.md`)
Settled the schema for all five specialization primitives. Service card, measurement/diagnostic form (one shared `SpecializationDefinition`/`SpecializationEntry` pair), and credential are proven end-to-end against a seeded Nafath/Delta-shaped tenant — defined, filled by a technician, stored, read back, with definition versioning proven. Position taxonomy has real schema and a read path (category default vs. workshop override, proven both ways) but no consuming page. Blocker reason has schema only — `TaskBlocker.reason` still reads the pre-existing fixed enum; retrofitting it touches a live, tested workflow path and was judged out of this phase's budget. No authoring UI (Phase 17).
**Edge case owed:** E11 — decide and document the leap-year warranty-date rule before the warranty field ships, not after.
**Detail:** [`phases/PHASE_15.md`](./phases/PHASE_15.md)

### Phase 16 — Specialization Structure ✅ (minimum bar met — see `phases/PHASE_16.md`)
Shipped: promised time and expected-duration on `WorkOrder` (16.A/16.E), a real SLA-overrun signal in the Attention Center proven by test, and a generic `Attachment` table (16.H) — the three findings the exit criteria names as mandatory. 16.I (network-scoped specialization override) got the design spike and written recommendation the exit criteria allows in place of implementation: reuse capability-engine override-and-lock machinery rather than invent a second one. Resources, work-order linkage, payer attribution, location entity, and append-only addenda (16.B/C/D/F/G) are each named with a specific reason and no blocking dependency, not silently dropped.
**Detail:** [`phases/PHASE_16.md`](./phases/PHASE_16.md)

### Phase 17 — Specialization at Creation 🟠 (17.A backend seam only — see `phases/PHASE_17.md`)
The super admin declares a workshop's specializations at `Add Workshop Owner`, not as a settings page discovered later. **Sharpened by Workshop 1, scenario 1:** a fixed library of starter profiles will always under-cover reality — the very first specialized tenant tested against this phase's original draft (Apex Motorsport) fit none of the four profiles named. This phase must ship an explicit "start from nothing" authoring path as a first-class option alongside the profile library, not a fallback. **Shipped this pass:** `CreateWorkshopDto.starterSpecializationProfile` + `PlatformService.seedStarterSpecializations()`, seeding Nafath's oil-change card or Delta's hydraulic form atomically inside workshop creation's existing transaction, proven by two new HTTP integration tests — the backend seam, not the wizard UI (no starter-profile picker exists on the form yet, and the "start from nothing" path this note demands is still owed). Branch definition (17.B), bulk staff provisioning (17.C), bulk data import (17.D), and the regional-manager role (17.E) are each real, scoped work not started this pass.
**Detail:** [`phases/PHASE_17.md`](./phases/PHASE_17.md)

### Phase 18 — Tenant Relationships 🟠 (18.A/D/E shipped, 18.B/C deferred, 18.F decided — see `phases/PHASE_18.md`)
External stakeholder access, multi-tenant identity, time-bounded access grants, the tenant archive/retention lifecycle, tenant groups for portfolio reporting, and a deliberate design decision on tenant merge/split. The single most-recurring finding across the 40-scenario platform pass: `Tenant.id` is treated everywhere as permanent and singular, and real businesses are sold, merged, split, invested in, and closed. **Shipped:** `TenantStakeholder` (18.A, narrow view-only grants independent of StaffRole); the archive lifecycle with two clocks never conflated (18.D) plus a real fix making `TenantStatusLayer`'s `READ_ONLY` status literally allow reads, which it previously did not; `TenantGroup` summary-only portfolio aggregation (18.E). **18.F's deliverable is a written decision, not code:** no first-class merge/split — a documented export/reimport-and-archive manual procedure instead, because rewriting `AuditLog.tenantId` on historical rows would conflict with the audit-boundary discipline `tools/lint-audit-boundary.mjs` exists to enforce. 18.B and 18.C deferred, each with a specific reason.
**Edge cases:** none open. H10 (`ControlSetting` hard-delete) and E17 (retention already implemented; the "migration could miss an archived tenant" concern investigated and found architecturally moot under this project's single-shared-schema design) fixed/clarified — see `EDGE_CASE_REGISTER.md`.
**Detail:** [`phases/PHASE_18.md`](./phases/PHASE_18.md)

### Phase 19 — Governance Depth 🟠 (19.B/C/D shipped; 19.A enforcement reverted; 19.E/F/G deferred — see `phases/PHASE_19.md`)
Separation of duties, a dispute state distinct from work-order lifecycle status, a forensic-reason refund taxonomy, a restricted-pending-investigation account state, historical permission reconstruction, properly-bounded support impersonation, point-in-time reporting snapshots. Everything the permission and audit systems need once the platform stops assuming every actor is acting in good faith. **Shipped:** `WorkOrderDispute` (19.B, non-destructive); `RefundRequest.reasonCategory` (19.C); `StaffRestrictionService` + a new `StaffRestrictionLayer` in the permission resolver (19.D, fully wired — a real, narrower lever than the tenant-wide freeze). **19.A shipped `PartRequest.approvedById` tracking but its enforcement was built, then reverted** after it broke 22 existing Inventory tests modeling a legitimate single-storekeeper shop — the real fix needs a per-workshop opt-in policy, not a global rule. 19.E (historical reconstruction, named "hardest item" by the phase doc itself), 19.F (impersonation, needs its own written threat-model review), and 19.G (point-in-time snapshots) deferred with reasons.
**Edge cases:** none open. E14 (freeze/reactivate racing the same tenant) fixed with a guarded update — see `EDGE_CASE_REGISTER.md`.
**Detail:** [`phases/PHASE_19.md`](./phases/PHASE_19.md)

### Phase 20 — Operational Resilience at Scale 🟠 (20.B shipped, 20.E decided, 20.A/C/D/F deferred — see `phases/PHASE_20.md`)
Multi-tenant load/concurrency testing, tenant-configuration-change atomicity, bulk provisioning and import with branch-scoped rollback, country as a real configuration axis (legal identity fields, tenant-configurable working week, compliant-blocked state), a deliberate offline-architecture decision, shared-device identity, and bandwidth-aware client design. The least visible, most likely to be deprioritized, and — per the scenarios that found it — most likely to actually break a real deployment first. **Shipped:** 20.B — `PermissionContextService.load()` now runs its five reads inside one `REPEATABLE READ` transaction, closing the race where a capability change committing mid-flight could produce an internally-inconsistent permission snapshot. **20.E's deliverable is a written decision, not code:** MOP does not commit to offline-capable clients — connectivity is a stated requirement, named explicitly rather than discovered by a workshop the hard way. 20.A (needs a real load-testing harness), 20.C (depends on Phase 17's still-deferred bulk pieces), and 20.D (a multi-part deliverable needing full scenario proof) are deferred with reasons; 20.F's two small items are genuinely available to pick up next.
**Edge cases:** none open. E12 (session expiry via Postgres, never an app-replica clock) and E20 (failover runbook, `docs/INFRASTRUCTURE.md` §9a) fixed — see `EDGE_CASE_REGISTER.md`.
**Detail:** [`phases/PHASE_20.md`](./phases/PHASE_20.md)

### Phase 21 — Policy & Decision Architecture 🟠 (documents only, by design — see `phases/PHASE_21.md`)
The third axis of variation. The capability engine decides *whether a step exists*; the specialization engine decides *what it is called*; nothing decides *under what rule it passes* — so that class of decision keeps getting hardcoded, and Phase 19.A was reverted for exactly this reason. Three independent sources converge on the gap: the canonical spec's own Builder Control describes a **Workflow Policy** tab naming eleven policies, none of which exists as a typed thing; `docs/archive/discovery/scenarios/` recorded the delivery gate drawing **opposite complaints** from two workshops; and 19.A's global separation-of-duties rule broke 22 tests modelling a legitimate single-storekeeper shop.

Its load-bearing idea, from the project owner: **decision sets are derived, not enumerated.** Each policy declares a relevance predicate over capabilities, specializations, and prior answers, so one workshop faces 15 questions and another 40 without either being a special case. Its sharpest design decision: **a policy may never change reachability** — anything that could is a mis-classified capability. That keeps the capability engine's proof intact and gives an objective test for a distinction that prose could not settle.

**Deliverable is documents, not code:** [`POLICY_DECISION_INVENTORY.md`](./POLICY_DECISION_INVENTORY.md), all 70 decisions fully written against the owner's 18-field schema plus a build-posture verdict each, every one carrying a default with a written reason. The posture rollup tests the owner's broader "prebuilt configurable platform" direction against the completed inventory: it holds for ~56% of decisions (policy-controlled or cleanly activatable), fails for 4 that would require a schema fork masquerading as a toggle (multi-role staff, multi-session jobs, cross-tenant staff, broad B2B accounts), and is deliberately withheld from 9 with no second scenario demanding them. **Gates Governance Controls**, which is the page that would surface policies.
**Detail:** [`phases/PHASE_21.md`](./phases/PHASE_21.md)

---

## Dependencies

```
Phase 1 ──┬──> Phase 3 ──> Phase 4 ──┬──> Phase 5 ──> Phase 6
          │                          ├──> Phase 7
Phase 2 ──┘                          ├──> Phase 8 ──> Phase 9 ──> Phase 10 ──> Phase 11 ──> Phase 12 ──> Phase 13 ──> Phase 14
                                     └──> (10, 11, 12 also draw directly from Phase 4)

Phase 15 ──> Phase 16 ──> Phase 17

Phase 3 ──┬──> Phase 18 ──> Phase 19 ──> Phase 12 (point-in-time reports)
          └──> Phase 20 (independent, but gates any real multi-country
                          or 50-branch tenant going live before it lands)

Phase 21 (Policy & Decision Architecture) ──┬──> Governance Controls page
                                            ├──> Phase 19.A (blocked on P-07 today)
                                            └──> Phase 22 (policy engine, unopened)
```

Phases 1 and 2 can run concurrently. Everything in the original 3–14
chain is a hard dependency in the order shown; 5–13 are drawn as
parallel-eligible because they depend only on Phase 4, not because they
should be built simultaneously — Branch Manager and Technician first,
as before, since they exercise the spine hardest.

**Phases 15–17 remain their own chain**, gated behind Phase 4 only, not
behind 5–14. 15 → 16 → 17 is a hard internal order: 15 settles what a
specialization *is* before 16 builds what it attaches to, before 17
builds the screen that declares one.

**Phases 18–20 are a third, new chain**, gated behind Phase 3 (they need
the capability runtime and audit discipline already in place) but
otherwise independent of both the 5–14 chain and the 15–17 chain. They
were not discoverable from inside any single workshop's story — every
scenario in `docs/archive/discovery/scenarios/` watched one tenant's whole life; only
`docs/archive/discovery/scenarios2/`'s platform-console vantage point surfaced them. Two
explicit couplings exist and are called out inline above: Phase 9's
country-adapter work should read Phase 20.D before finalizing scope, and
Phase 12's reporting engine should sequence after Phase 19.G if it is to
support retroactive correction and cross-tenant data movement — or
explicitly name live-only reporting as a stated limitation if it ships
first.

Nothing in Phases 18–20 blocks the original 5–14 chain or the 15–17
chain from proceeding in parallel. They compete for the same
engineering time, not for the same schema surface, with two exceptions:
Phase 18.A/18.B's stakeholder and multi-tenant-identity model should
land before Phase 10's People/Performance work if that work wants to
build tenure/rehire tracking against the same account-relationship
model rather than a narrower one that needs revisiting later.

## What "done" means for any phase

1. Its exit criteria are met and demonstrated, not asserted.
2. Tests exist and run in CI.
3. Nothing in it is a stub reporting success. A hardcoded `true` in a gate is a defect, not a placeholder.
4. It closes with a **cross-system scenario walkthrough** — from `SCENARIOS.md` for Phases 1–14, from `docs/archive/discovery/scenarios/` for Phases 15–17, from `docs/archive/discovery/scenarios2/` for Phases 18–20 — proving the scenarios it touches work end-to-end across every system involved, not that its own pages render.
5. Every page it owns, per `PAGE_INVENTORY.md`, is ✅, or the phase is not marked complete.
6. Every finding a discovery pass attributed to it is either shipped or explicitly, reasonedly deferred in this document with the phase that now carries it — never silently dropped.
