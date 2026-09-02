# MOP — Working Instructions for Claude Code

> Permanent project knowledge. Loaded at the start of every session.
> For *where we are right now*, read [`PROJECT_STATE.md`](./PROJECT_STATE.md).

---

## What this project is

**MOP — Maintenance Operations Platform.** A multi-tenant SaaS for running maintenance/service workshops. One codebase serves many workshops, each with its own staff, customers, branches, inventory, pricing — and its own **shape**: a one-bay quick-service shop and a twelve-branch dealership run the same code with different capabilities switched on.

Repository: `github.com/aolmaking/MOP` (**private** — the GitHub API returns 404 without credentials).

The mental model, in one sentence:

> A single repair is a distributed transaction across five roles, and MOP's job is to make sure it never silently lies to anyone.

Read [`docs/VISION.md`](docs/VISION.md) before making architectural decisions.

## Development method

**Waterfall, not agile.** The structure laid down early is inherited by every phase after it, so foundations are deliberately over-invested in. Work follows [`docs/PHASE_MAP.md`](docs/PHASE_MAP.md) in order; the current phase has a detail document under `docs/phases/`.

Re-planning at a phase boundary is expected and healthy. **Silently drifting from the plan is not** — if a task cannot be completed, record it in the phase document with the reason and the phase by which it must land.

---

## Toolchain — read this before running anything

This machine has quirks that will waste an hour if rediscovered.

| Thing | Reality |
|---|---|
| `pnpm` | **Not on PATH.** Use `corepack pnpm`. Node must be added first in Bash: `export PATH="/c/Program Files/nodejs:$PATH"` |
| `pnpm install` | Must be `CI=true corepack pnpm install` — otherwise it hits an interactive prompt, **no-ops, and still exits 0** |
| `pnpm doctor` | This is a **pnpm built-in** that shadows our script. Use `corepack pnpm run doctor` |
| Git | Needs `git -c safe.directory=<repo path>` — the folder is owned by a different Windows account |
| PowerShell tool | Broken in this environment (error 80070002). Use the Bash tool |
| Docker | Docker Desktop must be running; `docker compose up -d` for Postgres |

### Commands

```bash
corepack pnpm run doctor       # environment health — run first when anything is odd
corepack pnpm typecheck        # shared + api
corepack pnpm lint             # eslint + audit-boundary + directional-CSS + touch-targets + money + permission-keys
corepack pnpm test             # shared + api + web
corepack pnpm build
```

Integration tests need `DATABASE_URL` pointed at the **test** database:

```bash
export DATABASE_URL="postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public"
```

### Two traps that cost real time

1. **After adding an export to `packages/shared`, rebuild it** (`corepack pnpm --filter @mop/shared run build`) or `apps/api` typecheck will not see it.
2. **After creating a migration, run `corepack pnpm db:test:prepare`** or integration tests hit a test database missing the new table and fail with a confusing 500.

---

## Architecture

Six systems on one spine — see [`docs/SYSTEMS.md`](docs/SYSTEMS.md):
Operations · Inventory · Finance Core · Billing/Invoicing · People & Performance · Governance & Control.

**A system never reads or writes another system's tables directly.** Cross-system reads go through published contracts (`packages/shared/src/contracts/`), changes through domain events.

```
apps/api          NestJS — auth, access control, capabilities, operations, platform
apps/web          Angular
packages/shared   Types, permission manifest, capability engine, workflow router, contracts
packages/database Prisma schema, migrations, seed
tools/            doctor, pnpm shim, env loader, two custom linters
docs/             Spec, charters, phase plan
```

Inside `apps/api/src`, the layout names the boundary rather than the file
kind. Full rationale and migration table in [`REORGANIZATION_REPORT.md`](./REORGANIZATION_REPORT.md).

```
audit/         the AuditLog WRITE boundary — stays top-level, the lint rule matches this literal path
runtime/       config, database, http, health, scheduler — framework plumbing, no business meaning
identity/      auth/ (sessions, guards) and access/ (permission resolver + its 11 layers)
control/       capabilities, policies, governance, tenant-relationships, platform — the plane that shapes tenants
systems/       operations, inventory, finance, billing, people, customer, forms — the six bounded systems
experiences/   branch-manager, technician, team-leader, owner — per-role surfaces composed over systems
insights/      analytics, analyst-reporting, owner-reports, workflow-health — read-only derived views
```

`experiences/` never writes directly: a role surface calls the owning
system's service. `systems/` never imports `experiences/`.

`apps/web/src/app` uses the same vocabulary, so one word means one thing
on both sides of the wire:

```
runtime/       http/ (error interceptor), i18n/ — framework plumbing
identity/      auth store, guard, landing, access.api ("may I?")
ui/            presentation primitives with no domain knowledge, + charts/
domain/        cross-role business concepts — journey/, dossier/, decisions/
experiences/   one directory per role, each owning its own shell/;
               plus public/ (the unguarded pages) and home/ (fallback frame)
```

Dependency direction: `runtime/` and `ui/` import nothing above them,
`domain/` imports `runtime/`, `experiences/` imports downward and never
sideways. A business concept used by two roles belongs in `domain/` —
one source of truth, one presentation per role.

### The capability engine — the heart of the product

Platform Super Admin shapes each workshop by removing what it does not need. **Removal is workflow rewiring, not feature hiding.** The guarantee:

> After any capability change, every reachable non-terminal state must still have a path to a terminal state.

Checked before a change is applied. See [`docs/CAPABILITY_MODEL.md`](docs/CAPABILITY_MODEL.md).

---

## Rules that must not be broken

These are load-bearing. Changing one silently breaks a guarantee elsewhere.

| Rule | Why |
|---|---|
| **`WorkOrderLifecycleService` is the only writer of `WorkOrder.status`** | A hardcoded transition anywhere makes the capability engine decoration. A grep for hardcoded statuses must return nothing |
| **Permission layer order, `locked` short-circuit, deny-by-default** | Capability sits *above* role and user override so a permission can never resurrect a disabled capability |
| **A gate dies with the capability that owns it** | Derived from the gate registry, never from hand-written lists. Two capabilities disagreeing about a shared gate once stranded work orders |
| **No `AuditLog` write outside `apps/api/src/audit/**`** | Enforced by `tools/lint-audit-boundary.mjs`; the build fails |
| **No physical direction CSS** (`margin-left`) | Enforced by `tools/lint-directional-css.mjs`. Arabic is a primary market |
| **Money is `Decimal` in the DB, `string` across the API** | A money value reaching the browser as a JS number is a bug even when it looks right |
| **Restricted data is absent from the response, never hidden client-side** | Anyone can open developer tools |
| **No silent stubs** | A gate returning hardcoded `true` is a defect. The previous implementation had two, and they could never block while appearing to |
| **Integration tests run against real Postgres** | Mocks prove nothing about constraints, transactions or cascades |
| **The seed creates two differently-shaped tenants** | A single-tenant database makes isolation bugs invisible |

---

## Conventions

**Commits: [Conventional Commits](https://www.conventionalcommits.org/)** — `type(scope): summary`. The body explains *why*; the diff already shows what. See [`CONTRIBUTING.md`](./CONTRIBUTING.md).

**Comments explain why, never what.** A comment earns its place by recording the constraint that forced this shape, or the bug it guards against.

**Design decisions need reasons.** Every visual value — colour, shadow, radius, motion — is justified in [`docs/DESIGN_LANGUAGE.md`](docs/DESIGN_LANGUAGE.md). If a decision cannot be justified from there, it is decoration.

**Report honestly.** If tests fail, say so with the output. If a step was skipped, say that. The single most damaging thing in the previous implementation was code that claimed to work.

---

## Documentation map

**Start at [`docs/corpus/00_DOCUMENTATION_INDEX.md`](docs/corpus/00_DOCUMENTATION_INDEX.md)** — a 41-document corpus covering the product, the architecture and the current implementation state, with every claim labelled by its stage (`[INTENDED]` … `[VERIFIED]`). It exists so a session does not begin with codebase archaeology. Twenty minutes there replaces hours of exploration:

| Read first | For |
|---|---|
| [`corpus/01_PRODUCT_VISION_AND_PHILOSOPHY.md`](docs/corpus/01_PRODUCT_VISION_AND_PHILOSOPHY.md) | What MOP is and what it refuses to be |
| [`corpus/18_SUBSYSTEM_CATALOG.md`](docs/corpus/18_SUBSYSTEM_CATALOG.md) | The map of what exists |
| [`corpus/36_IMPLEMENTATION_STATUS_REGISTER.md`](docs/corpus/36_IMPLEMENTATION_STATUS_REGISTER.md) | Where the build actually is |
| [`corpus/37_KNOWN_GAPS_AND_TECHNICAL_DEBT.md`](docs/corpus/37_KNOWN_GAPS_AND_TECHNICAL_DEBT.md) | **Every known gap, with an id** — read it so you do not rediscover one and call it a finding |
| [`corpus/40_AGENT_ENGINEERING_GUIDE.md`](docs/corpus/40_AGENT_ENGINEERING_GUIDE.md) | The rules you will be held to |

The corpus **cites** the canonical trackers rather than duplicating them: page completion stays in `PAGE_INVENTORY.md`, phase status in `PHASE_MAP.md`, session history in `PROJECT_STATE.md`.

The source documents it is built on — still the deeper record for any single topic:

| Document | For |
|---|---|
| `VISION.md` | What MOP is and where it will break |
| `PHASE_MAP.md` | The 14-phase plan and current position |
| `CAPABILITY_MODEL.md` | Smart delete, removal policies, the reachability guarantee |
| `SYSTEMS.md` | System boundaries and cross-system contracts |
| `SCENARIOS.md` | What must work, per capability profile, with a schema verdict each |
| `DESIGN_LANGUAGE.md` · `UX_PRINCIPLES.md` | Why the interface looks and behaves as it does |
| `DEVELOPMENT.md` | Setup and troubleshooting |
| `GAP_ANALYSIS_CANONICAL_SPEC.md` | **Historical.** Describes v11.9, deleted at commit `b0a4e68`. Read as *why the rebuild happened*, not as current code |
