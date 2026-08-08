# MOP Rebuild Plan — Phase 0

> **Status:** Phase 0 defined, not yet executed.
> **Date:** 2026-08-08.
> **Why this file exists:** the original rebuild plan lived at `C:\Users\Stanikzai\.claude\plans\glowing-drifting-dragon.md` — outside the repo, under a Windows account this project no longer runs under. It is gone. Every `docs/detailed-specs/*.md` file references "Phases 2–9" of a plan nothing in this repository defines. This file brings the plan **inside the repo**, where it is versioned and survives machine moves.

---

## 0. The correction that changes the shape of this work

The instruction that produced this document was: *"the whole project need to been rebuild totally … then you can start setting the phase 0 of rebuilding plan."*

That judgement was correct about **v11.9**. It is no longer correct about **this repository**, because the rebuild it asks for was already started and is roughly two phases in. Rebuilding "totally" from here would delete working, tested, spec-derived code and repeat months of work.

The evidence is in the git history:

| Commit | What happened |
|---|---|
| `a38b9af` | Initial commit — the v11.9 build |
| `b0a4e68` | **Remove v11.9 implementation to rebuild from canonical spec** — the disaster was deleted |
| `6297054` | Canonical spec + gap analysis committed as rebuild source of truth |
| `1c55066` | **Phase 0: draft data model for the full canonical spec** |
| `0331351` → `51d4a70` | Phase 1 steps 1–5, interleaved with the 9 detailed role specs |

None of the files the gap analysis criticises (`builder.service.ts`, `technician.service.ts`, `team-review.component.ts`, `branch-manager.service.ts`, `inventory.service.ts`) exist any more. They were removed at `b0a4e68`. What is in the tree now is the replacement, written against the canonical spec.

**So "Phase 0" cannot mean "start over."** It means: *stabilise what exists, close the gaps that would otherwise be baked in, and make the next phases executable.* That is what this document defines.

If a genuine from-scratch restart is still wanted after reading Section 1, that is a decision to take deliberately — not the default.

---

## 1. Verified current state

Everything below was verified by running it on 2026-08-08, not read off a status doc.

### Works

| Area | State | Evidence |
|---|---|---|
| Data model | 1,409-line Prisma schema, 3 migrations, covers all 16 WO statuses, 19 part-request states, Team/TeamMembership, ownership history, audit `riskLevel` as a real column | `packages/database/prisma/schema.prisma` |
| Permission resolver | 8 layers in a real, iterated, ordered array with deny-by-default and `locked` short-circuit | `apps/api/src/access/permission-resolver.service.ts` |
| Audit | Module-encapsulated, **lint-enforced** — a build fails if any `AuditLog` write happens outside `apps/api/src/audit/**` | `tools/lint-audit-boundary.mjs` |
| Operations engine | Central event service + customer-safe projection | `apps/api/src/operations/` |
| Auth | 4 account types, httpOnly cookie sessions, refresh rotation, lockout | `apps/api/src/auth/` |
| Scheduler | `@nestjs/schedule` wired, heartbeat exposed via `GET /health` | `apps/api/src/scheduler/` |
| Platform pages | Add Workshop Owner (transactional), Workshops list/details/freeze/reactivate + health | `apps/api/src/platform/` |
| Design tokens | Real token system, dark-default + light, no colour literals in components | `apps/web/src/styles.css` |
| Detailed specs | ~1,600 lines, all 9 role groups, field-level | `docs/detailed-specs/` |
| Tests | **161 passing** — 112 API unit (22 suites), 49 web (16 suites) | run today |
| Typecheck | Clean across `@mop/shared` and `@mop/api` | run today |

The quality bar in this code is high. It carries honest comments where something is a known gap rather than pretending completeness, and the specific failures the gap analysis identified in v11.9 have been designed out structurally (the decorative-unused-hierarchy problem, the dead centralised-audit-service problem, the missing-statuses problem).

### Broken or missing

| # | Problem | Severity |
|---|---|---|
| 1 | **~40 files of Phase 1 step 6 + Phase 2 work are uncommitted.** The entire `access/`, `platform/`, `scheduler/` API modules, the whole web app beyond a stub, the CI workflow, the seed, and a migration exist only in the working tree. | **Critical** |
| 2 | **The environment was completely broken.** Every `node_modules` symlink pointed at `C:\Users\Stanikzai\...`. Nothing could build, typecheck, test, or run. *(Repaired today — see Section 2.)* | **Critical** |
| 3 | **The rebuild plan was lost** with the old user account. Phases 2–11 are referenced by number everywhere and defined nowhere. | High |
| 4 | **Scenario coverage is incomplete in exactly the way originally warned about.** See below. | High |
| 5 | DB-backed integration tests unverified — Docker/Postgres not running on this machine. | Medium |
| 6 | CI has never executed — no GitHub remote is configured. | Medium |

### Problem 4 in detail, because it is the one that was called out by name

The original instruction was explicit:

> *"a customer doesn't want inspection or even to buy a part, he has his own part and only wants the service to fit it. There are very long lists of examples on each page and each situation and you need to cover them all — from day one of designing."*

That scenario is **not covered anywhere** — not in `PRODUCT_SPEC_CANONICAL.md`, not in any `detailed-specs/*.md`, and not in the schema. Searching the whole `docs/` tree for "own part", "customer-supplied", "skip inspection", "no inspection" returns nothing.

It is not merely undocumented — it is currently **unrepresentable in the data model**:

```prisma
model PartRequest {
  inventoryItemId String                      // required
  inventoryItem   InventoryItem @relation(...) // required FK
}
```

Every part on a Work Order must be an inventory item the workshop owns. A customer-supplied part has no inventory row, no stock movement, no cost, and needs a labour-only price and a liability/warranty disclaimer. There is no flag, no nullable path, no alternative model. Adding this after the inventory and finance phases are built is a migration across `PartRequest`, `StockMovement`, `QuotationItem`, `RunningInvoiceLine`, `InvoiceLine`, and the Finish Gate.

This is the concrete, expensive version of the original point: the *scenarios* have to exist before the pages do. The canonical spec has 20 named scenario families; the real number is larger, and the gap is systematic, not a single oversight.

---

## 2. Already done today

These were done during analysis because nothing else could be verified until they were:

1. **Repaired the workspace install.** Ran `pnpm install` non-interactively (`CI=true`; the plain run hits a confirmation prompt and silently no-ops). All symlinks now resolve locally.
2. **Regenerated the Prisma client** against the current schema.
3. **Established a working toolchain path.** `pnpm` is not on `PATH` on this machine; `corepack pnpm` works (`C:\Program Files\nodejs\corepack.cmd`). Root scripts that shell out to a nested bare `pnpm` (`db:generate`, `build`, `test`, `lint`, `typecheck`) therefore fail. Workspace-filtered commands work:
   ```
   corepack pnpm --filter @mop/api exec jest
   ```
4. **Verified the tree is green** — typecheck clean, 161 tests passing.

None of this is committed and none of it changes source files.

---

## 3. Phase 0 work items

Ordered by risk. Items 1–2 should happen before any other work of any kind.

### 0.1 — Commit the outstanding work *(blocking)*

~40 files representing Phase 1 step 6 and most of Phase 2 exist only in the working tree, on a project folder that has already been copied between Windows accounts once. `.gitignore` is correct (`node_modules`, `dist`, `.angular`, `packages/database/generated` all excluded), so everything untracked is genuine source.

Commit in coherent slices matching the existing message style, not one bulk commit:
- Phase 1 step 6 — access module (resolver + 8 layers + scope resolver)
- Phase 1 step 7 — scheduler + health
- Phase 2 step 1 — web shell, design tokens, shared UI kit
- Phase 2 step 2 — Add Workshop Owner (API + page)
- Phase 2 step 3 — Workshops list/details/freeze/reactivate
- CI workflow, seed, invite-token migration

**Done when:** `git status` is clean and every commit builds.

### 0.2 — Make the environment reproducible *(blocking)*

The folder is literally named `..._Pnpm_Install_Root_Fix_...`, which says this has bitten before. It will bite again on the next machine move.

- Add `docs/DEVELOPMENT.md`: prerequisites, `corepack enable`, the `CI=true pnpm install` note, `docker compose up -d`, migrate, seed, run.
- Pin Node via `.nvmrc` matching `engines.node`.
- Fix the root scripts so they work when `pnpm` is only reachable through corepack, or document `corepack pnpm` as the supported invocation.
- Add `pnpm doctor` — checks Node version, that a symlink resolves, that Postgres answers, that the Prisma client matches the schema. Every failure mode found today, detected in one command.

**Done when:** a clean clone reaches green tests by following `DEVELOPMENT.md` alone.

### 0.3 — Rebuild the phase map *(blocking for Phase 2+)*

Reconstruct Phases 2–11 in this file from what the specs and code already assume. Enough is recoverable: `docs/detailed-specs/README.md` maps roles to phases 2–9, and code comments name "Phase 10, System Automation" and "Phase 11 adds a CI check that every permission key has a real assertion site."

Each phase needs: goal, exact page/endpoint list, dependencies, exit criteria.

**Done when:** every "Phase N" reference in the repo resolves to a definition here.

### 0.4 — Write the Scenario Catalogue *(the item the original instruction was actually about)*

New file `docs/SCENARIOS.md`. One entry per scenario: trigger, actors, happy path, every branch, what each role sees at each step, which pages/records/events change, and the terminal states.

The catalogue must be reconciled against the schema **before Phase 3 builds the work-order lifecycle**, and any scenario that cannot be represented becomes a schema change now, while it is still cheap.

Starter set — the canonical spec's 20 families, plus at minimum these, which are currently missing:

**Intake / scope refusals**
- Customer declines inspection entirely; wants one named service only
- Customer supplies their own part; workshop provides labour only *(schema change required)*
- Customer approves some items, rejects others, defers the rest
- Customer rejects a **critical** item and takes the vehicle — acknowledgement, liability record, safe-history entry
- Walk-in with no appointment and no prior asset record
- Customer wants a quote only, authorises no work, vehicle leaves

**Asset / ownership**
- Vehicle arrives under a different owner than the record — mid-Work-Order ownership transfer
- One customer, many assets; one asset, many open issues
- Asset outside the tenant's operating category

**Parts**
- Part unavailable → supplier order → customer waits, or substitutes, or cancels
- Part arrives damaged
- Wrong part issued and used before anyone notices
- Partial fulfilment — 3 requested, 2 issued
- Technician finishes with a received part neither used nor returned *(Finish Gate already covers this — confirm the catalogue matches)*

**Execution**
- Second, unrelated fault found mid-work → new approval cycle inside an approved job
- Technician goes off shift mid-job; reassignment mid-execution
- Work Order cancelled after parts issued but before work started
- Vehicle undrivable; blocks a bay

**Money**
- Customer disputes the final invoice after work is complete
- Partial payment, delivery under a policy that allows it
- Refund after delivery
- Approved price vs. changed catalogue price — the lock must hold

**Platform**
- Tenant frozen mid-Work-Order — what each role sees, what survives
- Plan downgraded below current usage (more branches than the new limit allows)

**Done when:** every entry has a schema verdict of *representable* or *needs change*, and every needed change is either applied or scheduled with a named phase.

### 0.5 — Verify the database path end-to-end

Start Postgres, apply migrations to a clean database, run the seed, run the integration tests. These are the only tests never executed on this machine, and they cover auth, access layers, and operation events — the load-bearing parts.

**Done when:** `pnpm test` passes in full, integration tests included.

### 0.6 — Get CI actually running

`.github/workflows/ci.yml` is well-built (real Postgres service, migrate, lint, typecheck, test, build) and has never run — there is no remote. Create the remote, push, confirm green.

**Done when:** a green CI badge exists on a real run.

---

## 4. Phase 0 exit criteria

1. `git status` clean; all work committed.
2. A clean clone reaches green tests using only `docs/DEVELOPMENT.md`.
3. `pnpm test` passes in full, including DB integration tests.
4. CI is green on a real push.
5. Phases 2–11 are defined in this file.
6. `docs/SCENARIOS.md` exists, and every scenario has a schema verdict.
7. Any schema change the catalogue demands is migrated, with the migration reviewed against existing data.

Nothing in Phase 0 builds a new page. That is deliberate — every item removes a risk that would otherwise compound through every later phase.

---

## 5. Roadmap after Phase 0

To be expanded under item 0.3. Current best reconstruction:

| Phase | Scope |
|---|---|
| 2 | Platform Super Admin — Workshops, Add Workshop Owner, Control Center, Platform Reports, Live View |
| 3 | Tenant Owner — Organization & Access, Forms, Messages, Pricing, Reports, Audit, Workflow Health |
| 4 | Branch Manager — intake, board, workspace, approvals, delivery/payments, team setup |
| 5 | Technician — Home, My Work, Work Card (10 tools) |
| 6 | Inventory Manager — 6 pages |
| 7 | Team Leader — 4 pages |
| 8 | Data Analyst — 7 pages |
| 9 | Customer portal — 6 pages |
| 10 | System Automation — real background jobs |
| 11 | Hardening — permission-key assertion CI check, perf, denormalised summary tables |

**Ordering note:** phases 3–9 are grouped by role, but the scenarios in 0.4 cut *across* roles — one part-unavailable scenario touches Technician, Inventory, Branch Manager, Customer, and Finance. Building role-by-role is how the previous attempt produced pages that each worked alone and did not connect. Each phase should therefore close with a **cross-role scenario walkthrough** proving the scenarios that touch it work end-to-end, not just that its own pages render.
