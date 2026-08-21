# Repository Reorganization

Physical restructuring of the MOP source tree. Structural only — no
business behaviour, route, provider, permission or contract changed in
any phase recorded here.

---

## Phase 1 — `apps/api` (NestJS backend)

**Scope:** `apps/api/src`, 293 source files. `apps/web`, `packages/**`
and `packages/database/prisma/migrations` were deliberately left alone;
`packages/database/prisma/seed.ts` was touched only to correct one stale
path in a comment.

### The problem

`apps/api/src` had **31 flat top-level directories**. `config/` sat as a
sibling of `finance/`, which sat as a sibling of `technician/`. Three
different kinds of thing were mixed at one level with nothing to
distinguish them:

- framework plumbing (`config`, `database`, `common`, `health`, `scheduler`)
- bounded business systems (`operations`, `inventory`, `finance`, …)
- per-role presentation surfaces (`owner`, `technician`, `team-leader`,
  `branch-manager`)

and two directories one character apart, `reporting/` and `reports/`,
which are genuinely different products for different audiences — a fact
recorded only in a doc comment inside one of them.

The tree gave no signal about where the load-bearing engines were. A new
reader could not tell that the permission resolver, the capability
engine and the work-order lifecycle engine were the three files most of
the platform's guarantees rest on.

### The target structure, and why

Derived from `docs/SYSTEMS.md` (which names six systems on one spine)
and from tracing actual imports and `@Module()` registrations — not from
directory names.

```
apps/api/src/
  main.ts
  app.module.ts

  audit/                     the AuditLog WRITE boundary. Deliberately
                             left at the top level -- see below.

  runtime/                   framework plumbing, no business meaning
    config/  database/  http/  health/  scheduler/

  identity/                  who you are, and what you may do
    auth/                    sessions, invites, guards, tokens
    access/                  the permission resolver + its 11 layers

  control/                   the plane that shapes and governs tenants
    capabilities/            capability engine (runtime half)
    policies/  governance/  tenant-relationships/
    platform/                the Platform Super Admin console

  systems/                   the bounded business systems
    operations/              + vehicle-history/
    inventory/
    finance/    billing/     kept separate, per SYSTEMS.md's decision
    people/                  organization/  team/  specialization/
    customer/                + messages/
    forms/

  experiences/               per-role composition over system services
    branch-manager/  technician/  team-leader/  owner/

  insights/                  read-only derived views
    analytics/
    analyst-reporting/       was reporting/
    owner-reports/           was reports/
    workflow-health/
```

**Core engines are now addressable by path:**

| Engine | Path |
|---|---|
| Permission resolver + layer stack | `identity/access/` |
| Capability engine (runtime half) | `control/capabilities/` |
| Workflow / lifecycle engine | `systems/operations/work-order-lifecycle.service.ts` |
| Policy engine | `control/policies/` |
| Audit write boundary | `audit/` |
| Money handling | `systems/finance/`, `systems/inventory/`, `systems/operations/`, `experiences/branch-manager/` (the money-lint roots) |
| Tenant context / scoping | `identity/access/scope-resolver.service.ts` |
| Auth | `identity/auth/` |

**Two decisions worth recording:**

1. **`audit/` stays at the top level.** `tools/lint-audit-boundary.mjs`
   matches the literal prefix `audit/`, and `CLAUDE.md` states the rule
   as "no `AuditLog` write outside `apps/api/src/audit/**`". Moving it
   would have meant rewording a load-bearing rule to gain nothing.

2. **Role directories are not façades, but they are not systems
   either.** Tracing imports settled it: `technician/` holds only a view
   service (the writes live in `systems/operations/technician-work.service.ts`),
   while `branch-manager/` owns real approval and delivery paths but
   composes them over `OperationsModule` and `CustomerModule`. They are
   surfaces over systems, which is what `experiences/` says. Merging
   them into the systems would have hidden the per-role scoping and
   permission differences that are the whole point of having them.

3. **`reporting/` and `reports/` were NOT merged.** They are three
   distinct audiences (Data Analyst, Tenant Owner, Platform Super Admin)
   reading overlapping data through different scoping and permission
   rules. The confusion was the naming, so the directories were renamed
   to `insights/analyst-reporting/` and `insights/owner-reports/`, and
   `control/platform/reports/` stayed where it was. Controller route
   strings are unchanged (`reporting`, `organization/reports`).

### Migration table

| Old path | New path | Reason |
|---|---|---|
| `config/` | `runtime/config/` | Framework plumbing, not a domain |
| `database/` | `runtime/database/` | Prisma service; global infrastructure |
| `common/` | `runtime/http/` | Contents are all HTTP-layer: exception filter, money-serialization interceptor, request-id, validation factory. Nothing "common" about it |
| `health/` | `runtime/health/` | Liveness endpoint |
| `scheduler/` | `runtime/scheduler/` | Cron + distributed lock |
| `auth/` | `identity/auth/` | Sessions, guards, tokens |
| `access/` | `identity/access/` | Permission resolver + 11 layers; sits directly above auth |
| `capabilities/` | `control/capabilities/` | The engine that shapes a tenant |
| `policies/` | `control/policies/` | Policy resolution, same plane |
| `governance/` | `control/governance/` | Locks, disputes, restrictions |
| `tenant-relationships/` | `control/tenant-relationships/` | Tenant groups and lifecycle |
| `platform/` | `control/platform/` | The Super Admin console — the human interface to this plane |
| `operations/` | `systems/operations/` | SYSTEMS.md system 1 |
| `vehicle-history/` | `systems/operations/vehicle-history/` | Asset history assembled entirely from work orders |
| `inventory/` | `systems/inventory/` | SYSTEMS.md system 2 |
| `finance/` | `systems/finance/` | SYSTEMS.md system 3 |
| `billing/` | `systems/billing/` | SYSTEMS.md system 4, kept a sibling not a child — Billing is downstream of Finance Core and must never be reachable as part of it |
| `organization/` | `systems/people/organization/` | SYSTEMS.md system 5 |
| `team/` | `systems/people/team/` | ditto |
| `specialization/` | `systems/people/specialization/` | ditto |
| `customer/` | `systems/customer/` | Owns real write paths (decision, registration), so a system rather than an experience |
| `messages/` | `systems/customer/messages/` | Customer-safe message templates |
| `forms/` | `systems/forms/` | Custom-field definitions, consumed across systems |
| `branch-manager/` | `experiences/branch-manager/` | Per-role surface |
| `technician/` | `experiences/technician/` | Per-role surface (view service only) |
| `team-leader/` | `experiences/team-leader/` | Per-role surface |
| `owner/` | `experiences/owner/` | Per-role surface, incl. the audit *reader* |
| `analytics/` | `insights/analytics/` | Read-only derived views |
| `reporting/` | `insights/analyst-reporting/` | Renamed to say whose report it is |
| `reports/` | `insights/owner-reports/` | Renamed to say whose report it is |
| `workflow-health/` | `insights/workflow-health/` | See below |
| `audit/` | *(unchanged)* | Lint rule matches the literal path |

**`workflow-health` moved twice.** It was first nested under
`systems/operations/`, which put it inside `tools/lint-money.mjs`'s
`apps/api/src/systems/operations` root. The linter immediately flagged
four lines — summing elapsed milliseconds, sorting by hours, counting
re-entries. None are money. Adding four `money-lint-ok:` suppressions to
a subsystem that handles no money is exactly the outcome that linter's
own comment warns against, so the directory moved to
`insights/workflow-health/` instead and the money rule stayed strict.

### Non-source changes

| File | Change |
|---|---|
| `tools/lint-money.mjs` | Three roots repointed (`systems/finance`, `systems/inventory`, `systems/operations`, `experiences/branch-manager`). It resolves roots literally and throws on a missing directory |
| `apps/api/src/audit/audit.module.ts` | Comment pointer to the reader → `experiences/owner/` |
| `apps/api/src/insights/owner-reports/reports.module.ts` | Its own three-audiences note repointed |
| `apps/api/src/control/governance/*` (3 files) | Comment references to `apps/api/src/access` → `identity/access` |
| `packages/database/prisma/seed.ts` | Password-util provenance comment |

`tools/lint-audit-boundary.mjs`, `lint-no-hard-delete.mjs`,
`lint-permission-keys.mjs`, `apps/api/tsconfig.json`, `nest-cli.json`,
`eslint.config.mjs` and the jest block in `apps/api/package.json` needed
**no** changes — they all walk `src/**` recursively, and there are no
TypeScript path aliases in this project (every intra-api import is
relative, all 293 files).

### Method

A codemod resolved every relative specifier (`from`, `import()`,
`jest.mock`, `require`) to its target file, applied the move map, and
recomputed the specifier from the new location — so a move that failed
to resolve would be reported rather than silently rewritten. Zero
unresolved specifiers across all four batches. Files were relocated with
`git mv`, so rename detection is preserved and there are no duplicate
copies. Typecheck ran after every batch before the next one started.

### Validation results

Run in worktree `.claude/worktrees/agent-a210499fe39ca5ec8`, branch
`worktree-agent-a210499fe39ca5ec8`, at commit `394c748`.

| Command | Result |
|---|---|
| `corepack pnpm typecheck` (shared + api) | **PASS** |
| `corepack pnpm lint` | **PASS** — eslint, audit-boundary, directional-CSS, touch-targets, money, permission-keys (76 keys), no-hard-delete all green |
| `corepack pnpm --filter @mop/api run build` (`nest build`) | **PASS** |
| `corepack pnpm --filter @mop/api run test:unit` | **PASS** — 33 suites, 201 tests |
| `corepack pnpm --filter @mop/api run test` (full, incl. integration vs. real Postgres) | **PASS** — 93 suites, 803 tests, 0 failures |

Integration tests ran against the live `mop-platform-postgres-1`
container on `mop_platform_test`, as `CLAUDE.md` requires — not mocks.

Intermediate typecheck after each of the four batches: PASS, PASS, PASS,
PASS.

**Environment note:** the worktree started with no `node_modules` and no
generated Prisma client; `CI=true corepack pnpm install` and
`corepack pnpm db:generate` were run first, and baseline typecheck was
confirmed green *before* any file moved.

### Stale-reference sweep

`grep` for `apps/api/src/<old-dir>` across all source, tooling, config
and docs. Remaining hits are all in **historical documents** —
`docs/phases/PHASE_*.md`, `docs/archive/audits/**`, `PROJECT_STATE.md`,
`docs/SCENARIOS.md`, `docs/POLICY_DECISION_INVENTORY.md`. These record
where code was at the time they were written and were deliberately left
as-is; rewriting them would falsify the record. One live reference was
also left untouched by scope rule: a comment in
`apps/web/src/app/core/auth/auth.store.ts` pointing at
`apps/api/src/auth/` — `apps/web` is Phase 2's subject and should be
corrected there.

No stale references remain in `apps/api/src`, `tools/`, `packages/`,
`.github/workflows/ci.yml`, or any build/test configuration.

### Not done in this phase

- `apps/web` and `packages/**` — Phase 2.
- File and class names inside moved directories are unchanged
  (`reporting.service.ts` still lives in `insights/analyst-reporting/`).
  Renaming classes is a behaviour-adjacent change and was kept out of a
  structural pass.
