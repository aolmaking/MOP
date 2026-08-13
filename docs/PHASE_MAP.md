# MOP Phase Map

> **What this is:** the single, linear plan for all remaining work. One numbering scheme, one order, one place.
> **Companion:** [`docs/PAGE_INVENTORY.md`](./PAGE_INVENTORY.md) tracks the 53 spec'd pages against what's built — the definition of "done" for Phases 5–12. [`docs/scenarios/`](./scenarios/) and [`docs/scenarios2/`](./scenarios2/) are the two discovery passes that produced Phases 15–20. [`docs/scenarios3/`](./scenarios3/) is a third pass — 20 edge cases, not persona-driven — that did not earn new phases but is attributed against the phases above; see rule 8 below.
> **Date:** 2026-08-12, after the 40-scenario platform-layer discovery pass, its synthesis, and a 20-item edge-case hardening pass.

---

## Where the project stands

**Built and verified** (377 tests passing across shared/API/web, typecheck clean, all four custom lint rules passing, full build green):

| Area | State |
|---|---|
| Data model | Full Prisma schema, all work-order statuses, part states, capability/audit/control-setting tables |
| Permission resolver | **10 layers** (platform → plan → tenant status → capability → module → feature → workshop config → **delegation** → role template → user override), real iterated array, deny-by-default, `locked` short-circuit, per-request context caching |
| Audit | Module-encapsulated, lint-enforced — build fails on any `AuditLog` write outside `apps/api/src/audit/**` |
| Capability layer | Registry, workflow graphs, reachability validator, 7 profiles |
| Operations engine | `WorkOrderLifecycleService` sole writer of status, capability-aware from its first line |
| Auth | 4 account types, DB-backed sessions, refresh rotation, lockout, rate limiting |
| Money | `Decimal` in DB, `string` across API, dedicated `lint-money.mjs` guarding it |
| Pages | **23 of 53 spec'd pages built** — see `PAGE_INVENTORY.md` for the full per-role breakdown |
| Discovery | Three discovery passes complete: 20 workshop-floor scenarios (`docs/scenarios/`), 40 platform-layer scenarios (`docs/scenarios2/`), 20 edge cases (`docs/scenarios3/`) |

**Not yet true:** Phases 9–14 (Billing, People, Customer Portal, Reporting, Automation, i18n release) have not started. Phases 18–20, named by this session's platform-layer discovery pass, did not exist before today.

## The rules that set the order

1. **Nothing is trusted until it is provably runnable.** Verification infrastructure comes before features.
2. **Design decisions that change the schema come before the schema is depended upon.**
3. **The capability-aware lifecycle comes before any role page**, because retrofitting capability-awareness into hardcoded transitions across five roles is the single most expensive mistake available.
4. **Decisions that are cheap now and ruinous later happen at their cheapest moment** — i18n/RTL while there are 8 components, not 80.
5. **Every role phase closes with a cross-system scenario walkthrough**, never a page checklist. This is the specific discipline that would have caught v11.9's disconnected-pages failure.
6. **A phase may not be marked complete while any page or scenario finding it owns is unaddressed.** `PAGE_INVENTORY.md` and the two scenario syntheses are the definitions of done; measuring "complete" against what was built rather than what was required is the exact mistake Phase 7 was originally marked complete under.
7. **A discovery pass earns a phase, not a patch.** When a scenario walkthrough finds a gap that is structural — missing vocabulary, missing platform-relationship model, missing resilience story — it gets its own phase with its own exit criteria, not a scattered set of tickets absorbed silently into whichever phase happens to be active.
8. **A hardening pass earns a register entry, not a phase.** When a discovery pass finds gaps that are *not* structural — a race condition, an unverified claim, an undocumented rule — those attach to the phase that already owns the affected system, tracked in a register, not spun into a new phase number. `docs/scenarios3/EDGE_CASE_REGISTER.md` is this project's first such register; a phase is not done while an edge case attributed to it is neither fixed nor explicitly, reasonedly deferred.

---

## Progress

| Phase | State |
|---|---|
| 1 — Runnable and Provable | ✅ complete |
| 2 — Design Completeness | ✅ complete |
| 3 — Governance Runtime | ✅ complete |
| 4 — Operations Spine | ✅ complete |
| 5 — Branch Manager | ✅ complete — 7/7 pages |
| 6 — Technician | ✅ complete — 3/3 pages |
| 7 — Inventory | 🟢 5/6 pages — Returns/Movements actions owed |
| 8 — Finance Core | 🟠 engine done; Owner Money page owed (Phase 10) |
| 9 — Billing / Invoicing | ✅ complete — GenericBillingAdapter, BillingDocument, credit notes, refund workflow, compliantBlocked all built and tested |
| 10 — Team Leader & People/Performance | ✅ complete (narrowed) — API and all 5 web pages (4 Team Leader + Owner Home) built and reachable; see `PHASE_10.md` §6 |
| 11 — Customer Portal | 🟠 API complete; 4 web pages owed |
| 12 — Reporting & Data Analyst | ⬜ not started |
| 13 — System Automation | ⬜ not started |
| 14 — Internationalization & Release Readiness | 🟠 permission-key lint + a perf fix shipped; translation pass owed |
| 15 — Specialization Discovery | ✅ schema settled, 3/5 primitives proven end-to-end |
| 16 — Specialization Structure | ✅ minimum bar met (16.A/E/H); 16.I design spike written |
| 17 — Specialization at Creation | 🟠 17.A backend seam shipped; wizard UI and 17.B–E owed |
| **18 — Tenant Relationships** | 🟠 18.A/D/E shipped; 18.B/C deferred; 18.F design decision written |
| **19 — Governance Depth** | ⬜ **new** — not started |
| **20 — Operational Resilience at Scale** | ⬜ **new** — not started |
| Platform Super Admin (cross-cutting) | 🟠 3/6 pages — Governance Controls, Reports, Live View owed |

Total page inventory: **28 of 53** spec'd pages built (Owner Home and all four Team Leader pages closed this pass; other phases' page counts may have moved further and not yet be reflected here). See `PAGE_INVENTORY.md` for the per-role table.

## The phases

### Phase 1 — Runnable and Provable ✅
Reproducible environment, DB path verified end-to-end, CI green, rate limiting, boot-time config validation, systematic money serialization, per-request permission-context caching, i18n/RTL foundation (logical CSS, `dir` handling, bidi isolation).
**Edge cases owed:** H9 (RTL-override/zero-width characters must be sanitized wherever a slug, filename, or legal document is generated), E18 (no lazy-rehash path or version tracking for password hashes).

### Phase 2 — Design Completeness ✅
Scenario × capability matrix, typed cross-system contracts, gate registry, schema verdict for every scenario.

### Phase 3 — Governance Runtime ✅
`TenantCapability` time-ranged schema, capability resolution in the resolver, change pipeline (draft → validate → live-data preconditions → impact preview → apply → audit → rollback), Super Admin capability-shaping UI, historical interpretation.
**Edge case owed:** E13 — capability rollback racing an in-flight lifecycle transition; design spike required, see `docs/scenarios3/EDGE_CASE_REGISTER.md`.

### Phase 4 — Operations Spine ✅
`WorkflowRouter` driven by the capability graph, intake, ownership transfer, work order/task lifecycle, inspections/faults/blockers, capability-aware Finish Gate.
**Edge cases owed:** H1 (concurrent blockers can overwrite each other), H2 (capability check-then-write gap), H4 (decision approval landing on an already-closed work order), E19 (stale decision token after asset reassignment).

### Phase 5 — Branch Manager ✅
Attention Center · Customer Intake · Work Orders board · Work Order Workspace · Approvals · Delivery & Payments · **Team Setup**, delegation-gated.
**Edge cases owed:** H8 (double-click races the team-membership transaction), H10 (`ControlSetting` must never be hard-deleted).

### Phase 6 — Technician ✅
Now · My Work · Work Card, 10 tools, mobile/tablet-first, no sidebar.

### Phase 7 — Inventory 🟢
Inventory Home · Technician Requests · Catalog Control · Quantity Control & Stock Status · Reports & Stock Insights. **Owed:** Returns/Movements' accept/reject/clarify actions — the ledger is built and readable; the actions have no page yet.
**Edge cases owed:** H6/E16 — the stock-never-negative guarantee needs verifying as a single atomic `UPDATE`, not read-then-write, plus a concurrency-specific integration test; H7 — no described path for deactivating a warehouse with nonzero stock.

### Phase 8 — Finance Core 🟠
Pricing catalog, discounts, tax policy, running balance, payments, deposits, financial reports engine — all built. **Owed:** the Owner's own Money page (Phase 10), and refunds/credit notes (explicitly deferred to Phase 9).
**Edge cases owed:** H3 — invoice numbering is `count()+1` against a mocked-up unique-constraint backstop; the schema's own `invoice_sequences` table sits unused. H5 — the idempotency check-then-insert has its own race window. E15 — halfway-point rounding needs one named, documented rule.

### Phase 9 — Billing / Invoicing ✅
Separate bounded system. Legal invoice document, numbering, immutable snapshots, credit/debit notes, `GenericBillingAdapter` behind the country-adapter seam. **Sharpened by Workshop 2 (scenarios 6, 9, 10):** the country-adapter seam is not optional infrastructure for a hypothetical future market — it is the difference between a tenant being legally able to trade and not, the moment a second country's tenant exists. ZATCA (Saudi) and ETA (Egypt) are the two adapters named for this phase's first pass; a tenant onboarded into a country without a ready adapter must be flagged **compliant-blocked** (see Phase 20.D), never silently allowed to issue invoices the law doesn't recognize.

### Phase 10 — Team Leader & People/Performance ✅ (narrowed — see `phases/PHASE_10.md`)
Team Leader's four pages (Home, Technicians, Vehicles/Work Orders, Technician Performance Reports, all `managedTechnicianIds`-scoped) and Owner Home are all built with a real API and a real, reachable web page — closed across three separate passes on the same working tree, recorded rather than smoothed over in `phases/PHASE_10.md` §6–7. **Re-planned at this phase boundary, recorded rather than silently dropped:** the Owner's Money page (folded into the remaining six Owner pages, its own future pass) and exit-reason/rehire-eligibility on staff deactivation (pushed to Phase 19) were both named in this entry originally but did not land this pass. **Detail:** [`phases/PHASE_10.md`](./phases/PHASE_10.md)

### Phase 11 — Customer Portal ✅ (API surfaces; web pages owed) — see `phases/PHASE_11.md`
Portal home, my assets, current service, invoice status, safe technical history (all new this phase); decision page and public decision links were already shipped in an earlier phase. Found and documented rather than silently patched: the ten-layer permission resolver has no real opinion about a `CUSTOMER` session, so portal access is checked directly on `session.accountType`/`enabledModules` instead, mirroring the existing public decision controller's own reasoning.

### Phase 12 — Reporting & Data Analyst ✅ (live-only reporting; see `phases/PHASE_12.md`)
`DATA_ANALYST`'s first real report: company-wide technician performance, work order throughput, finance summary, all gated by the new `reports.company.view` key. Took the phase's own named option: live-only reporting, no point-in-time snapshot (that is Phase 19.G's job). Exports and saved views did not ship — no export mechanism exists anywhere in the codebase yet, and building the first one as a side effect of this phase would be scope creep the waterfall method exists to prevent.

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
**Edge cases owed:** H10 (`ControlSetting` hard-delete, restated here since delegation is this phase's natural home), E17 (schema migrations against a dormant/archived tenant's data need an explicit reconciliation policy).
**Detail:** [`phases/PHASE_18.md`](./phases/PHASE_18.md)

### Phase 19 — Governance Depth 🆕
Separation of duties, a dispute state distinct from work-order lifecycle status, a forensic-reason refund taxonomy, a restricted-pending-investigation account state, historical permission reconstruction, properly-bounded support impersonation, point-in-time reporting snapshots. Everything the permission and audit systems need once the platform stops assuming every actor is acting in good faith.
**Edge case owed:** E14 — two opposite platform actions (freeze/reactivate) racing the same tenant needs an optimistic-concurrency guard, the same shape of fix as 24.1–24.3's missing single-account control lever.
**Detail:** [`phases/PHASE_19.md`](./phases/PHASE_19.md)

### Phase 20 — Operational Resilience at Scale 🆕
Multi-tenant load/concurrency testing, tenant-configuration-change atomicity, bulk provisioning and import with branch-scoped rollback, country as a real configuration axis (legal identity fields, tenant-configurable working week, compliant-blocked state), a deliberate offline-architecture decision, shared-device identity, and bandwidth-aware client design. The least visible, most likely to be deprioritized, and — per the scenarios that found it — most likely to actually break a real deployment first.
**Edge cases owed:** E12 (clock skew between API replicas disagreeing about token/window expiry — 20.A/20.B's natural extension), E20 (no documented database-failover recovery procedure — a config decision and a rehearsed runbook, not a feature).
**Detail:** [`phases/PHASE_20.md`](./phases/PHASE_20.md)

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
scenario in `docs/scenarios/` watched one tenant's whole life; only
`docs/scenarios2/`'s platform-console vantage point surfaced them. Two
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
4. It closes with a **cross-system scenario walkthrough** — from `SCENARIOS.md` for Phases 1–14, from `docs/scenarios/` for Phases 15–17, from `docs/scenarios2/` for Phases 18–20 — proving the scenarios it touches work end-to-end across every system involved, not that its own pages render.
5. Every page it owns, per `PAGE_INVENTORY.md`, is ✅, or the phase is not marked complete.
6. Every finding a discovery pass attributed to it is either shipped or explicitly, reasonedly deferred in this document with the phase that now carries it — never silently dropped.
