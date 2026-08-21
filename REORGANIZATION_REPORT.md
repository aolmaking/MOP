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

---

## Phase 2 — `apps/web` (Angular frontend) and `packages/**`

**Scope:** `apps/web/src`, 369 of 377 source files moved. `packages/shared`
and `packages/database` were audited and **deliberately not moved** — see
"The packages verdict" below. `packages/database/prisma/migrations/` was
not touched. No generated code (`packages/database/generated/`, `dist/`)
was hand-edited.

### The problem

`apps/web/src/app` had three top-level directories — `core/`,
`features/`, `shared/` — that name the *kind* of file rather than the
boundary it sits on. Tracing imports and route registrations (not
directory names) found three concrete consequences:

1. **`core/` was four unrelated things.** Framework plumbing (the HTTP
   error interceptor, the locale service), the session identity layer
   (auth store, guard, landing), *and* eight per-role layout shells. A
   shell is presentation for exactly one route subtree — `branch-shell`
   is loaded by `/branch` and by nothing else — so it is not "core" in
   any sense the other three occupants share.

2. **`core/api/` held two feature API clients.**
   `platform-workshops.api.ts` is imported by `add-workshop-page`,
   `workshops-page`, `workshop-drawer` and `uniqueness.validator`;
   `platform-reports.api.ts` by `platform/reports` only. Both are used
   by nothing outside `features/platform/`. They sat in the app-wide
   layer purely because they were written early.

3. **`shared/` mixed UI primitives with cross-role domain logic.**
   `button`, `form-field`, `error-banner`, `toast`, `identifier`,
   `status-pill`, `dismiss-on-escape` and the four chart components are
   genuine presentation primitives with no domain knowledge. But
   `workflow-strip/` (the journey — read by Branch Manager, Customer
   *and* Technician) and `dossier/` (read by Branch Manager and Owner)
   are **business concepts**, and `dossier/` even ships its own
   `dossier.api.ts`. Filing domain logic under "shared UI" is precisely
   what lets a second copy get written for the next role.

A fourth was found inside `features/`: `branch-manager/approvals`
imports `features/customer/decision-answer`. The same business concept —
what the customer was asked and what they answered — presented to two
roles, reaching across a role boundary to get it.

### The target structure, and why

The vocabulary deliberately mirrors Phase 1's `apps/api/src`, so one
word means the same thing on both sides of the wire.

```
apps/web/src/app/
  app.ts  app.config.ts  app.routes.ts  app.html

  runtime/       framework plumbing, no business meaning
    http/        error.interceptor -- the ApiError shape every page reads
    i18n/        locale.service

  identity/      who you are, and what you may do
    auth.store  auth.guard  landing
    access.api   "may I?" for the current session (deny-by-default:
                 a failed check falls back to false)

  ui/            presentation primitives with NO domain knowledge
    button/  form-field/  error-banner/  toast/  identifier/
    status-pill/  dismiss-on-escape/
    charts/      was shared/reports/ -- bar-list, kpi-card,
                 trend-chart, volume-chart

  domain/        cross-role business concepts: ONE source of truth,
                 many role presentations
    journey/     was shared/workflow-strip/ (+ journey-poller)
    dossier/     drawer + dossier.api
    decisions/   was features/customer/decision-answer

  experiences/   was features/ -- one directory per role, each now
                 owning its own shell/
    analyst/  branch-manager/  customer/  finance/  inventory/
    owner/  platform/  team-leader/  technician/
    home/        the fallback frame (shell/) + placeholder-home
    public/      the four unguarded pages, outside every shell:
                 login/  register/  invite/  tenant-frozen/
```

**Dependency direction is now readable off the tree.** `runtime/` and
`ui/` import nothing above them. `domain/` imports `runtime/` only.
`experiences/` imports everything below it and — with the shells now
co-located — nothing sideways. The one former sideways edge
(`branch-manager` → `customer`) became a `domain/` edge.

**Three decisions worth recording:**

1. **Shells moved *into* their role, not into a `shells/` directory.**
   Each of the eight is loaded by exactly one route subtree and imports
   only `auth.store` plus two UI primitives. Grouping them by kind
   would have re-created the `core/layout/` problem one level down;
   co-locating means everything the Analyst role *is* lives in
   `experiences/analyst/`. The generic fallback `shell.*` went to
   `experiences/home/shell/`, beside `placeholder-home` — the only page
   it ever renders.

2. **`decision-answer` moved to `domain/`, the two role pages did not.**
   Per CLAUDE.md's role guidance: one domain source of truth, multiple
   presentations. `customer/decision-page`, `customer/my-decisions` and
   `branch-manager/approvals/record-approval-drawer` stay distinct and
   role-specific; only the shared concept moved. No domain logic was
   duplicated per role.

3. **`platform/` is an `experiences/` role here, not `control/`.**
   Phase 1 put the platform console under `control/` because on the
   server it *is* the control plane. On the web it is a role with a
   shell, a rail and pages — a surface, not a plane. The divergence is
   deliberate.

### Migration table (directory level)

| Old path | New path | Reason |
|---|---|---|
| `core/api/error.interceptor.*` | `runtime/http/` | Framework plumbing, no business meaning |
| `core/i18n/` | `runtime/i18n/` | Same |
| `core/auth/{auth.store,auth.guard,landing}` | `identity/` | Session identity is its own layer, not "core" |
| `core/api/access.api.ts` | `identity/access.api.ts` | "May I?" is a permission concern, not an API-client concern |
| `core/api/platform-workshops.api.ts` | `experiences/platform/workshops/` | Imported by nothing outside the platform feature |
| `core/api/platform-reports.api.ts` | `experiences/platform/reports/` | Same |
| `core/layout/<role>-shell/` (×8) | `experiences/<role>/shell/` | Each shell serves exactly one route subtree |
| `core/layout/shell.*` | `experiences/home/shell/` | The fallback frame, beside the only page it renders |
| `shared/{button,form-field,error-banner,toast,identifier,status-pill,dismiss-on-escape}/` | `ui/` | Genuine primitives — no domain knowledge |
| `shared/reports/` | `ui/charts/` | Chart components, used by Analyst, Owner Reports and Workflow Health. Renamed: they are not "reports" |
| `shared/workflow-strip/` | `domain/journey/` | The journey is a business concept read by three roles, not a shared widget |
| `shared/dossier/` | `domain/dossier/` | Ships its own API client; read by two roles |
| `features/customer/decision-answer.*` | `domain/decisions/` | Imported by `branch-manager/approvals` — a cross-role concept |
| `features/{login,register,invite,tenant-frozen}/` | `experiences/public/` | The four routes with no `authGuard` and no shell |
| `features/home/` | `experiences/home/` | Fallback page, joined by the fallback shell |
| `features/<role>/` | `experiences/<role>/` | Per-role surfaces, matching Phase 1's word |

Every import specifier, `loadComponent()` string, `templateUrl`,
`styleUrl` and route registration was rewritten by resolving each
specifier against its *old* location and re-resolving it from the new
one — 336 specifiers in total. `app.routes.ts` and `app.config.ts` were
rewritten by the same pass. **No route path, guard, resolver, provider,
component selector, template or style value changed.**

Also updated: `tools/lint-touch-targets.mjs` (its two roots collapse to
one, `apps/web/src/app/experiences/technician`, now that the shell lives
inside the role), four path comments in `apps/web/src/styles.css`, one
live path in `PROJECT_STATE.md`, and the stale `apps/api/src/auth`
comment in `auth.store.ts` that Phase 1 explicitly left for this phase.

`angular.json`, `tsconfig*.json`, `apps/web/package.json` and the vitest
setup needed **no** changes: the web app declares no path aliases and
discovers specs by glob, so the moves were invisible to them.

### The packages verdict — audited, deliberately not moved

**`packages/shared/src`**: eleven directories (`capabilities`,
`contracts`, `errors`, `money`, `onboarding`, `operations`, `pages`,
`permissions`, `platform`, `policies`, `session`) — every one already a
coherent domain concept, and several carrying a doc comment that
*justifies* the placement (`onboarding/presentation.ts` explains it sits
beside the capability registry so the copy dies with the capability;
`platform/workshop-options.ts` explains it is shared with the backend
DTO so the two can never drift). Nothing was found in the wrong
directory. Everything is re-exported through a single `index.ts` barrel
and there are **no deep imports** of `@mop/shared/<path>` anywhere in
`apps/**` (the two grep hits are prose inside comments), so an internal
reshuffle would have bought no clarity at the cost of churn in the one
package both apps depend on. Left alone.

**`packages/database`**: five files plus 27 migrations. Nothing to
reorganize.

**One observation recorded rather than acted on** (out of scope for a
structural pass): several `packages/shared` exports have no consumer in
either app — `SHIPPED_PROFILES` and the five capability profiles,
`GATE_REGISTRY` / `gatesOwnedBy` / `coreGates`, `effectiveGraph`,
`allowedTransitions`, `CUSTOMER_DECISION_GRAPH`. The engines themselves
*are* used (`canTransition`, `gateDefinition`, `WORK_ORDER_GRAPH` and
`PART_REQUEST_GRAPH` all have real call sites), so this is unused
surface area around live code, not a dead engine. Worth a
product-completeness pass; deleting exports is a behaviour change and
was kept out of this one.

### Validation

Run from a clean install (`corepack pnpm install --frozen-lockfile`)
with the Prisma client generated.

| Command | Result |
|---|---|
| `corepack pnpm typecheck` (shared + api) | **PASS** |
| `corepack pnpm lint` | **PASS** — eslint, audit-boundary, directional-CSS, touch-targets, money, permission-keys, no-hard-delete all clean |
| `corepack pnpm test` (shared + api + web) | see the run log below |
| `corepack pnpm build` (shared + api + web) | see the run log below |

**Baseline captured before any file moved:** web build green, 47 test
files / 255 tests passing. After the move: **identical** — 47 files, 255
tests, same count, no skips. The directional-CSS linter passing is the
load-bearing one for this phase: it proves no `margin-left`-class
physical direction property was introduced while CSS paths were being
rewritten, which matters because Arabic is a primary market.

**One first-run failure, not caused by this phase:** the initial
`corepack pnpm typecheck` failed with `Property 'team' does not exist on
type 'PrismaService'`. The worktree had no generated Prisma client;
`corepack pnpm db:generate` fixed it and typecheck went green with no
source change. Recorded because the same trap cost time in Phase 1.

**Not verified in this sandbox:** the app was not driven in a real
browser. `ng build` plus the 255 vitest specs — which include shell,
guard, routing and page-render specs — are the evidence offered; a
click-through of each role's shell is not.

### Stale-reference sweep

`grep` for `src/app/features`, `src/app/core`, `src/app/shared` across
all source, tooling, config and docs. Zero hits remain in `apps/web`,
`tools/`, `packages/`, or any build/test configuration. Remaining hits
are in **historical documents** — `docs/phases/PHASE_10.md`,
`PHASE_11.md`, `docs/archive/audits/**` — which record where the code
was when they were written and were left as-is; rewriting them would
falsify the record. The one live doc reference, in `PROJECT_STATE.md`,
was corrected.

### Not done in this phase

- File and class names inside moved directories are unchanged. One
  directory was renamed (`shared/reports` → `ui/charts`) because the old
  name actively misled; no file or exported symbol was renamed.
- `experiences/platform/add-workshop/` is **orphaned** — `app.routes.ts`
  routes `workshops/new` to `onboarding/` instead, and nothing imports
  `add-workshop-page`. It moved with its role rather than being deleted:
  removing a page is a product decision, not a structural one.
- `ui/status-pill/` has no importer either (only its own spec, plus
  styling in the global `styles.css`). Same reasoning — kept, flagged.
