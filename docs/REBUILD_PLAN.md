# MOP Rebuild Plan — Phase 0 (v2)

> **Status:** Phase 0 re-planned 2026-08-08 after the product owner clarified two things that change its shape: **capability shaping / smart delete** under Super Admin control, and that MOP is **five systems running simultaneously**, not one application with many pages.
> **Supersedes:** the first Phase 0 draft (same day). Items 0.1 and part of 0.2 are already done; the scenario work has grown from a catalogue into a matrix.
> **Why this file exists:** the original rebuild plan lived at `C:\Users\Stanikzai\.claude\plans\glowing-drifting-dragon.md` — outside the repo, under a Windows account this project no longer runs under. It is gone. This file keeps the plan **inside the repo**, versioned, surviving machine moves.

---

## 0. Where the project actually stands

The instruction that started this work was *"the whole project needs to be rebuilt totally."* That was correct about **v11.9** and is no longer correct about this repository: v11.9 was deleted at commit `b0a4e68`, and a disciplined rebuild is roughly two phases in. None of the files the gap analysis criticises still exist. Restarting now would delete working, tested, spec-derived code.

**Verified by running it, not read off a status document:**

| | |
|---|---|
| Typecheck | Clean across `@mop/shared` and `@mop/api` |
| Tests | **192 passing** — 31 shared/capabilities + 112 API unit (22 suites) + 49 web (16 suites) |
| Not yet verified | DB-backed integration tests — Docker not running on this machine |

**Solid foundations already in place:** a 1,409-line schema covering all 16 work-order statuses and 19 part-request states; an 8-layer permission resolver that is a real iterated array with deny-by-default and a `locked` short-circuit; a **lint-enforced** audit boundary (the build fails if anything writes `AuditLog` outside the audit module); the operations event engine with customer-safe projection; auth with four account types and DB-backed sessions; a real design-token system; ~1,600 lines of field-level role specs.

## 1. What the new information changes

### 1.1 Capability shaping is now a first-class architectural concern

Super Admin must be able to remove what a workshop doesn't need — no team leader, no inventory, one branch, one warehouse, a narrow technical specialisation — **without creating logical errors.**

Today's model cannot do this. `TenantConfiguration.enabledModules` is a flat `String[]`, and `ModuleEnabledLayer` denies the permission with *"This module is not enabled for your workshop."* That is a feature flag: it hides a button. It does not know that removing Inventory would leave the Finish Gate's *"parts received must be used or returned"* check in place, stranding every work order in that workshop permanently.

The design is now written: [`CAPABILITY_MODEL.md`](./CAPABILITY_MODEL.md). Its central guarantee — **after any capability change, every reachable non-terminal state must still reach a terminal state**, checked at validate time — is what makes smart delete provable rather than hopeful.

**Critical timing.** The workflow-routing logic *does not exist yet*. The lifecycle is Phase 3+. Building it capability-aware from its first line is nearly free; retrofitting after five roles depend on hardcoded transitions is months. This is the single most time-sensitive decision in the project right now.

### 1.2 Five systems, not one application

Operations, Inventory, Finance, People & Performance, Governance & Control — each a product in its own right, sharing one spine. See [`SYSTEMS.md`](./SYSTEMS.md).

This changes build order. The phases are grouped by **role**, but the systems are how the thing is actually built, and one scenario (a part is unavailable) crosses five systems at once. Building role-by-role without cross-system contracts defined first is precisely how the previous attempt produced pages that each worked alone and did not connect.

**Resolved 2026-08-08 — Billing/Invoicing is a separate bounded system from Finance Core.** Six systems internally; commercially still presentable as five, with *Financial Suite = Finance Core + Billing*. Finance Core owns pricing, discounts, tax policy, payments, refunds and balances; Billing owns the legal invoice document, numbering, immutable snapshots, country adapters, e-invoicing clearance, and credit/debit notes. The split pays for itself immediately by making **External Billing Mode** expressible — MOP owns the money while invoices are issued from separate accounting software — which is now a passing test.

### 1.3 It will travel the world

Arabic/RTL from the first component. Tax as a pluggable policy, snapshotted per invoice. And government e-invoicing (Egypt ETA, Saudi ZATCA) means **invoice document generation must be a per-country adapter behind a stable interface** — in those markets, an uncleared invoice is not a valid invoice. A Finance architecture constraint, decided before Finance is built.

## 2. Done since the first draft

- **0.1 — all outstanding work committed.** ~40 files (the whole `access/`, `platform/`, `scheduler/` API modules, the entire web app, CI, seed, a migration) existed only in the working tree. Now in 7 commits; tree clean.
- **Environment repaired.** Every `node_modules` symlink pointed at `C:\Users\Stanikzai\...` — the folder had been copied between Windows accounts, so nothing could build. Reinstalled; Prisma client regenerated.
- **Lockfile synced.** `@nestjs/schedule`, eslint 10, supertest and Angular CDK were in `package.json` but never in the lockfile. CI installs `--frozen-lockfile`, so the first CI run was a guaranteed failure.
- **Engineering charters written:** [`VISION.md`](./VISION.md), [`DATABASE_STRATEGY.md`](./DATABASE_STRATEGY.md), [`INFRASTRUCTURE.md`](./INFRASTRUCTURE.md), [`UX_PRINCIPLES.md`](./UX_PRINCIPLES.md), [`SYSTEMS.md`](./SYSTEMS.md), [`CAPABILITY_MODEL.md`](./CAPABILITY_MODEL.md).

## 3. Phase 0 work items

Ordered by what blocks the most downstream work.

### 0.A — Capability registry and the reachability check ✅ **DONE**

`packages/shared/src/capabilities/` — registry with a complete `RemovalPolicy` per capability, capability-annotated workflow graphs for Work Order / Part Request / Customer Decision, the reachability validator, and seven shipped profiles. **31 tests, all passing, wired into `pnpm test` and CI.**

Built standalone, before any lifecycle code depends on it: a pure function over a graph with no database, framework or clock, so it can be proven correct in isolation — which will never be true again once it is entangled with five roles.

All six required smart-delete cases are covered by tests: Inventory, Customer Portal, Team Review, Multi-Branch, Billing-off-with-Finance-on, and Finance externalised. The decisive test reconstructs the naive implementation (deny `inventory.*`, hide the pages, leave the transition *into* `WAITING_PARTS` ungated) and asserts the validator **rejects** it.

**One design bug was caught by a failing test rather than by review:** two removal policies disagreed about a shared gate, and the original "keep wins" resolution resurrected a parts check nothing could satisfy — re-creating the exact stranding the layer exists to prevent. Fixed by making gate ownership explicit (`CAPABILITY_MODEL.md` Rule 2a). This is the layer paying for itself before it has a single caller.

**Remaining in this item:** live-data preconditions (counting in-flight records a removal would strand) need the database, so they land with 0.D.

### 0.B — The scenario matrix *(grew from a catalogue)*

`docs/SCENARIOS.md`. Not a flat list — a matrix of **scenario × capability profile**, because "customer approves a part" is a different flow in a workshop with inventory than in one without.

Each entry: trigger, actors, happy path, every branch, what each role sees at each step, which systems and records change, terminal states, and — new — **which capability profiles it applies to and how it degrades under each.**

The named gap that started this: *customer declines inspection, brings their own part, wants labour only.* It appears nowhere in the spec or the detailed specs, and it is **unrepresentable** — `PartRequest.inventoryItemId` is a required FK, so a customer-supplied part has no inventory row, no stock movement, no cost, and no way to be billed as labour-only.

Starter families (the canonical spec's 20, plus these): intake and scope refusals · asset and ownership · parts (unavailable, damaged, wrong part used, partial fulfilment) · execution (second fault mid-job, shift change, cancellation after issue) · money (dispute, partial payment, refund after delivery, price-lock integrity) · platform (freeze mid-work-order, plan downgrade below usage) · **capability edge cases** (a workshop with no inventory bills a part; no team leader finishes a job; single-branch transfer request).

**Done when:** every scenario has a schema verdict of *representable* or *needs change*, and every needed change is applied or scheduled with a named phase.

### 0.C — Cross-system contracts

Define and type the events and query interfaces in `SYSTEMS.md` §3 before the roles that trigger them exist. Establish the rule in code: **a system never reads another system's tables directly.**

**Done when:** the contracts are typed, and a cross-system read outside a published contract is caught by review or lint.

### 0.D — Schema changes the above demand

Consolidated into one migration set, applied before Phase 3:

- `TenantCapability` — per (tenant, capability), **time-ranged**, because interpreting a two-year-old work order requires knowing which capabilities were active then. A flat array cannot answer that.
- `CapabilityChangeRequest` — the draft/validate/preview/apply record with retained impact and migration counts.
- Customer-supplied parts — whatever 0.B concludes.
- Money-serialisation rule applied systematically (`DATABASE_STRATEGY.md` §2).

### 0.E — Reproducible environment

The folder is named `..._Pnpm_Install_Root_Fix_...`, which says this has bitten before, and it bit again. `docs/DEVELOPMENT.md` (prerequisites, `corepack enable`, the `CI=true pnpm install` note, docker/migrate/seed/run), `.nvmrc`, root scripts fixed to work under corepack, and a `pnpm doctor` that checks Node version, symlink resolution, Postgres reachability, and Prisma-client-vs-schema drift — every failure mode hit today, caught in one command.

**Done when:** a clean clone reaches green tests from `DEVELOPMENT.md` alone.

### 0.F — Verify the database path end-to-end

Start Postgres, migrate a clean database, seed, run the integration tests — the only tests never executed here, covering auth, access layers, and operation events. The seed must produce **at least two tenants with different capability profiles**, because a single-tenant seed makes isolation bugs invisible and leaves configurability untested by construction.

### 0.G — CI actually running

`.github/workflows/ci.yml` is well-built and has never executed. Push, confirm green.

### 0.H — Rebuild the phase map

Reconstruct Phases 2–11 here. Enough is recoverable: `detailed-specs/README.md` maps roles to phases 2–9, and code comments name "Phase 10, System Automation" and "Phase 11 adds a CI check that every permission key has a real assertion site."

**Done when:** every "Phase N" reference in the repo resolves to a definition here.

## 4. Exit criteria

1. Capability registry + reachability check built, tested, and running in CI on every shipped profile.
2. `SCENARIOS.md` complete, every scenario carrying a schema verdict and a capability-profile note.
3. Cross-system contracts typed.
4. Schema changes from 0.D migrated and reviewed against real data.
5. A clean clone reaches green tests from `DEVELOPMENT.md` alone.
6. `pnpm test` fully green, integration tests included, seeded with two differently-shaped tenants.
7. CI green on a real push.
8. Phases 2–11 defined here.

Nothing in Phase 0 builds a page. That is deliberate: every item removes a risk that would otherwise compound through every later phase, and two of them (0.A, 0.C) are only cheap *because* the lifecycle does not exist yet.

## 5. Roadmap after Phase 0

To be expanded under 0.H. Current best reconstruction:

| Phase | Scope |
|---|---|
| 2 | Platform Super Admin — Workshops, Add Workshop Owner, Control Center (incl. capability shaping UI), Platform Reports, Live View |
| 3 | Operations spine — work order lifecycle, **capability-aware workflow router**, Finish Gate |
| 4 | Branch Manager — intake, board, workspace, approvals, delivery/payments |
| 5 | Technician — Home, My Work, Work Card (10 tools) |
| 6 | Inventory Manager — 6 pages |
| 7 | Finance — pricing, invoicing, payments, per-country invoice adapters |
| 8 | Team Leader + People & Performance |
| 9 | Customer portal + Data Analyst |
| 10 | System Automation — real background jobs on a separate worker |
| 11 | Hardening — permission-key assertion check, perf, summary tables |

**Two ordering notes.** The lifecycle (Phase 3) is pulled ahead of the role pages, because the capability-aware router must exist before any role depends on a transition. And every phase closes with a **cross-system scenario walkthrough**, not a page checklist — the specific discipline that would have caught v11.9's disconnected-pages failure.
