# MOP Phase Map

> **What this is:** the single, linear plan for all remaining work. One numbering scheme, one order, one place.
> **Replaces:** the previous numbering, which had accumulated into "Phase 0.A done" sitting alongside a half-built "Phase 1 step 5" and "Phase 2" — three overlapping schemes describing the same codebase. Everything below is renumbered from where the project actually is today.
> **Date:** 2026-08-08.

---

## Where the project stands

**Built and verified** (192 tests passing, typecheck + lint clean):

| Area | State |
|---|---|
| Data model | 1,409-line Prisma schema, 3 migrations, all 16 WO statuses, 19 part states |
| Permission resolver | 8 layers, real iterated array, deny-by-default, `locked` short-circuit |
| Audit | Module-encapsulated, **lint-enforced** — build fails on any write outside the audit module |
| Operations engine | Central event service + customer-safe projection |
| Auth | 4 account types, DB-backed sessions, refresh rotation, lockout |
| Platform | Add Workshop Owner (transactional), Workshops list/details/freeze |
| Web | Shell, design tokens, UI kit, login, Add Workshop page |
| **Capability layer** | Registry, workflow graphs, reachability validator, 7 profiles, 31 tests |
| Specs | Canonical spec + 9 role specs + 6 engineering charters |

**Not yet true:** the DB integration tests have never run on this machine, CI has never executed, and no work order has ever moved through a lifecycle — because the lifecycle does not exist yet.

## The rules that set the order

1. **Nothing is trusted until it is provably runnable.** Verification infrastructure comes before features.
2. **Design decisions that change the schema come before the schema is depended upon.**
3. **The capability-aware lifecycle comes before any role page**, because retrofitting capability-awareness into hardcoded transitions across five roles is the single most expensive mistake available.
4. **Decisions that are cheap now and ruinous later happen at their cheapest moment** — i18n/RTL while there are 8 components, not 80.
5. **Every role phase closes with a cross-system scenario walkthrough**, never a page checklist. This is the specific discipline that would have caught v11.9's disconnected-pages failure.

---

## Progress

| Phase | State |
|---|---|
| 1 — Runnable and Provable | 🟡 6 of 7 done. 1.6 landed in Phase 3; only 1.3 (CI green) outstanding |
| 2 — Design Completeness | ✅ complete |
| 3 — Governance Runtime | 🟢 4 of 5 done; capability UI moved to Phase 5 |
| 4 — Operations Spine | ✅ complete |
| 5 — Branch Manager | ⬜ next (plus the Super Admin capability UI deferred from Phase 3) |
| 6–14 | ⬜ not started |

**346 tests** green (81 shared + 207 API + 58 web), typecheck clean, two custom lint rules passing, full build green.

## The phases

### Phase 1 — Runnable and Provable 🟡
Make the project verifiable by anyone, on any machine, automatically.
- Reproducible environment: `DEVELOPMENT.md`, `.nvmrc`, fixed root scripts, `pnpm doctor`
- Database path verified end-to-end: clean migrate → seed → integration tests pass
- CI green on a real push
- API security baseline: **rate limiting** (urgent — scrypt at ~128MB/attempt is a DoS vector without it), helmet, body limits, request IDs, graceful shutdown, boot-time config validation
- Money serialization made systematic rather than three ad-hoc call sites
- Permission resolver per-request caching (today: 5 DB queries per `can()`)
- **i18n/RTL foundation** — logical CSS properties, string extraction, `dir` handling, bidi isolation for plate numbers

**Exit:** clean clone → green tests from `DEVELOPMENT.md` alone; `pnpm test` fully green including integration; CI green.
**Detail:** [`phases/PHASE_1.md`](./phases/PHASE_1.md)

### Phase 2 — Design Completeness ✅
Close every open design question that would otherwise force a migration later. Writing, plus typed contracts and one migration.
- **Scenario × capability matrix** (`SCENARIOS.md`) — including the customer who declines inspection and brings their own part
- Cross-system contracts typed: `ChargeableWorkItem`, `InvoiceCandidate`, part/decision/payment events
- Gate registry — gate keys are currently free strings in the capability registry with no canonical list or owner
- Schema verdicts for every scenario: representable, or a named change

**Exit:** every scenario has a defined path, terminal state, and schema verdict; contracts compile; zero unresolved "needs schema change".

### Phase 3 — Governance Runtime
Make the capability layer real at runtime. Super Admin can shape a live workshop, safely.
- `TenantCapability` time-ranged schema + migration
- Capability resolution replaces flat `enabledModules`; capability enters the resolver at position 3
- Change pipeline: draft → validate → **live-data preconditions** → impact preview → apply → audit → rollback
- Super Admin capability shaping UI
- Historical interpretation: a 2026 work order read under 2026's capabilities

**Exit:** disabling Inventory on a live tenant is validated, previewed with real counts, audited, and reversible.

### Phase 4 — Operations Spine ✅
The lifecycle. Capability-aware from its first line.
- `WorkflowRouter` driven by the capability graph — no hardcoded transitions anywhere
- Customer and asset intake, ownership transfer
- Work order and task lifecycle
- Inspections, faults, blockers
- Finish Gate, capability-aware, gates resolved from the registry

**Exit:** a work order runs to `CLOSED` under at least three different capability profiles, with no transition hardcoded in a service.

### Phase 5 — Branch Manager
First real role UI; proves the spine end-to-end.
Attention Center · Customer Intake · Work Orders board · Work Order Workspace · Approvals · Delivery & Payments.

### Phase 6 — Technician
The operational heart. Mobile/tablet-first, three pages, no sidebar, scan-first.
Home · My Work · Work Card (10 tools).

### Phase 7 — Inventory
Catalog, multi-warehouse stock, part request lifecycle, issue/arrival/use, returns, movements ledger, transfers, supplier orders.

### Phase 8 — Finance Core
Pricing catalog, discounts, tax policy, running balance, payments, refunds, deposits, financial reports.

### Phase 9 — Billing / Invoicing
Separate bounded system. Legal invoice document, numbering, immutable snapshots, credit/debit notes, `GenericBillingAdapter` behind the country-adapter seam.

### Phase 10 — Team Leader & People/Performance
Teams, membership history, supervision, technician performance — managed technicians only, no finance.

### Phase 11 — Customer Portal
Portal home, my assets, current service, decision page, invoice status, safe technical history, public decision links.

### Phase 12 — Reporting & Data Analyst
Role-differentiated reports (not one generic endpoint), drill-down, exports, saved views.

### Phase 13 — System Automation
Real background jobs on a **separate worker process** — the current in-process scheduler double-fires the moment there are two API replicas.

### Phase 14 — Internationalization & Release Readiness
Arabic translation pass on the Phase 1 foundation, country invoice adapters as needed, security review, performance, summary tables, permission-key assertion check.

### Phase 15 — Specialization Discovery
Settle the schema for **specialization primitives** — service cards, measurement/diagnostic forms, position taxonomies, credentials, blocker reasons — the way Phase 2 settled scenario schema questions. Proves each primitive against a real case from `docs/scenarios/`. No authoring UI.

**Exit:** every primitive has a written schema verdict; at least one service card, one measurement form and one credential work end-to-end against a seeded workshop.
**Detail:** [`phases/PHASE_15.md`](./phases/PHASE_15.md)

### Phase 16 — Specialization Structure
Build the structural concepts specializations attach to, found independently across every scenario workshop: scheduling/promise time, resources (lifts, bays, crews), work-order linkage (comeback, follow-up, parent/child), payer attribution, SLA/expected-duration with alerting, a location/site entity, append-only addenda on closed work orders, a generic attachment capability, and a network-vs-branch specialization override (structurally close to the capability engine).

**Exit:** scheduling, SLA and attachments ship; anything deferred is recorded here with the phase that carries it, never dropped silently.
**Detail:** [`phases/PHASE_16.md`](./phases/PHASE_16.md)

### Phase 17 — Specialization at Creation
Where the user's core idea lands: the super admin declares a workshop's specializations — service cards, resource types, branch structure, network-lock policy — **at `Add Workshop Owner`**, not as a settings page discovered later. Adds bulk staff provisioning, bulk customer/asset/catalog import, and a regional-manager role for multi-branch chains.

**Exit:** a super admin can stand up each of the four scenario workshop shapes using only the product, with zero direct database access.
**Detail:** [`phases/PHASE_17.md`](./phases/PHASE_17.md)

---

## Dependencies

```
Phase 1 ──┬──> Phase 3 ──> Phase 4 ──┬──> Phase 5 ──> Phase 6
          │                          ├──> Phase 7
Phase 2 ──┘                          ├──> Phase 8 ──> Phase 9
                                     ├──> Phase 10
                                     ├──> Phase 11
                                     └──> Phase 12 ──> Phase 13 ──> Phase 14

Phase 15 ──> Phase 16 ──> Phase 17
```

Phases 1 and 2 can run concurrently — one is code, the other is writing. Everything else is a hard dependency: Phase 3 needs Phase 2's schema verdicts, and Phase 4 needs Phase 3's capability runtime.

Phases 5–12 are drawn as parallel because they *depend* only on Phase 4, not because they should be built simultaneously. Recommended order is as numbered: Branch Manager and Technician first, since they exercise the spine hardest and will expose its defects while it is still cheap to change.

**Phases 15–17 are a separate chain, numbered after 14 but not gated behind it.** They depend on Phase 4 (the spine) and touch Phase 7/8/9's finance and inventory models, but not on 10–14's specific content — a discovery spike could run earlier if a real pilot workshop needed it sooner. 15 → 16 → 17 is a hard internal order regardless of when the chain starts: 15 settles what a specialization *is* before 16 builds what it attaches to, before 17 builds the screen that declares one. See `phases/PHASE_17.md`'s closing note for why skipping this order repeats a mistake this project already made once, in Phase 7.

## What "done" means for any phase

1. Its exit criteria are met and demonstrated, not asserted.
2. Tests exist and run in CI.
3. Nothing in it is a stub reporting success. A hardcoded `true` in a gate is a defect, not a placeholder.
4. It closes with a **cross-system scenario walkthrough** from `SCENARIOS.md`, proving the scenarios it touches work end-to-end across every system involved — not that its own pages render.
