# MOP — Code Map

> "I need to change X, where do I go?" Start here. For the *why* behind the
> layout, see [`REORGANIZATION_REPORT.md`](./REORGANIZATION_REPORT.md).

---

## Backend — `apps/api/src`

| Layer | What lives there | Look here for... |
|---|---|---|
| [`runtime/`](apps/api/src/runtime) | `config`, `database` (Prisma access), `health`, `http` (interceptors, validation), `scheduler` | Env vars, DB connection, cron/heartbeat jobs, request/response plumbing |
| [`identity/`](apps/api/src/identity) | `auth` (login, sessions, tokens), `access` (permission resolver + its layers) | Login/session bugs, "why can't this user do X" — the permission layer chain |
| [`control/`](apps/api/src/control) | `capabilities`, `policies`, `governance`, `platform`, `tenant-relationships` | The capability engine (smart delete), workshop policies, Platform Super Admin features |
| [`systems/`](apps/api/src/systems) | `operations` (work orders, lifecycle), `inventory`, `finance`, `billing`, `people` (org/team/specialization), `customer`, `forms` | Core business logic — work order lifecycle, stock, money, staffing, customer records |
| [`experiences/`](apps/api/src/experiences) | `branch-manager`, `owner`, `team-leader`, `technician` | Role-specific endpoints/composition over `systems/` (these don't own business rules, they present them) |
| [`insights/`](apps/api/src/insights) | `analytics`, `analyst-reporting`, `owner-reports`, `workflow-health` | Dashboards, reports, KPIs, loop/stuck-job detection |
| [`audit/`](apps/api/src/audit) | `audit.service.ts` | The **only** place allowed to write `AuditLog` — enforced by `tools/lint-audit-boundary.mjs` |

**Rule of thumb:** if it's a business rule (can this transition happen, what does this cost), it's in `systems/` or `control/`. If it's "how does role X see/use that rule," it's in `experiences/`.

### `apps/api/src/systems/` subsystems, in detail

| Subsystem | Key files |
|---|---|
| `operations/` | `work-order-lifecycle.service.ts` (the only status writer), `gate-evaluator.service.ts`, `workflow-journey.service.ts`, `work-order-dossier.service.ts`, `intake.service.ts`, `chargeable-items.service.ts`, `vehicle-history/` |
| `inventory/` | `catalog.service.ts`, `stock.service.ts`, `warehouse.service.ts`, `part-request.service.ts`, `inventory-reports.service.ts` |
| `finance/` | `finance.service.ts`, `finance-configuration.service.ts`, `price-catalog.service.ts` |
| `billing/` | `billing.service.ts`, `generic-billing-adapter.service.ts` |
| `people/` | `organization/`, `team/`, `specialization/` |
| `customer/` | `customer-portal.service.ts`, `decision.service.ts` (customer decisions/approvals), `register.service.ts`, `messages/` |
| `forms/` | `custom-fields.service.ts`, `form-registry.ts` |

### `apps/api/src/experiences/` role modules

`branch-manager/`, `owner/`, `team-leader/`, `technician/` — each is a thin controller layer composing `systems/` services for that role's endpoints. (`branch-manager` includes approvals/delivery/attention-queue/work-order-board.)

---

## Frontend — `apps/web/src/app`

| Layer | What lives there | Look here for... |
|---|---|---|
| [`runtime/`](apps/web/src/app/runtime) | `http` (error interceptor), `i18n` (locale service) | Global HTTP error handling, language switching |
| [`identity/`](apps/web/src/app/identity) | `auth.store`, `auth.guard`, `landing`, `access.api` | Login flow, route guards, "can this user do X" client-side |
| [`ui/`](apps/web/src/app/ui) | `button`, `charts`, `error-banner`, `form-field`, `identifier`, `status-pill`, `toast`, `dismiss-on-escape` | Reusable presentational primitives with no business meaning |
| [`domain/`](apps/web/src/app/domain) | `journey` (workflow strip, read by 3 roles), `dossier` (job history drawer), `decisions` (customer decision UI) | Cross-role business concepts — one implementation, several roles consume it |
| [`experiences/`](apps/web/src/app/experiences) | One folder per role: `analyst`, `branch-manager`, `customer`, `finance`, `home`, `inventory`, `owner`, `platform`, `public`, `team-leader`, `technician` | Pages/components specific to one role's screens and routes |

**Rule of thumb:** if two+ roles need the exact same behavior, it belongs in `domain/`. If it's just markup/styling with no business logic, it belongs in `ui/`. Otherwise it's under the owning role in `experiences/`.

### `apps/web/src/app/experiences/` — role folders, in detail

| Role folder | Pages/areas inside |
|---|---|
| `analyst/` | decisions, feature-adoption, home, inventory, operations, people pages + `shell/` |
| `branch-manager/` | `approvals/` (incl. record-approval drawer), `attention-center/`, `intake/`, `team/`, `work-orders/`, `shell/` |
| `customer/` | portal home, current-service, my-assets, my-decisions, decision-page, invoice-status, safe-history, `shell/` |
| `finance/` | `take-payment` |
| `home/` | `placeholder-home` (unauthenticated fallback), `shell/` |
| `inventory/` | catalog, home, item, reports, requests, returns, stock, `shell/` |
| `owner/` | `audit-page`, `forms/`, `messages/`, `organization/`, `pricing/`, `reports/`, `workflow-health/`, `shell/` |
| `platform/` | `add-workshop/` *(orphaned — routes use `onboarding/` instead)*, `capabilities/`, `control-center/`, `live-view/`, `onboarding/`, `reports/`, `workshops/`, `shell/` |
| `public/` | `invite/`, `login/`, `register/`, `tenant-frozen/` — the unguarded pages, no shell |
| `team-leader/` | team-leader-home, team-reports, team-work-orders, technician-drawer, technicians-page, `shell/` |
| `technician/` | `parts-picker`, `tech-my-work`, `tech-now`, `tech-work-card`, `shell/` |

Route registration for all of the above lives in [`apps/web/src/app/app.routes.ts`](apps/web/src/app/app.routes.ts).

---

## Shared & data

| Path | What it is |
|---|---|
| [`packages/shared/src`](packages/shared/src) | Types, permission manifest, capability engine, workflow router, cross-system contracts — consumed by both `apps/api` and `apps/web`. Subfolders: `capabilities/` (capability engine + gate registry), `permissions/` (permission manifest, layer types), `policies/`, `platform/`, `onboarding/`, `operations/` (work-order/lifecycle shared types), `money/` (Decimal helpers), `session/` (`SessionContext`), `contracts/` (cross-system published contracts), `errors/`, `pages/` |
| [`packages/database`](packages/database) | `prisma/` (schema + migrations — immutable history, never reordered/renamed), `generated/` (Prisma client — never hand-edit) |
| [`tools/`](tools) | `doctor.mjs`, `pnpm.mjs` (pnpm shim), `with-env.mjs`/`with-port.mjs` (env loader), and the custom lint scripts: `lint-audit-boundary.mjs`, `lint-directional-css.mjs`, `lint-money.mjs`, `lint-permission-keys.mjs`, `lint-touch-targets.mjs`, `lint-no-hard-delete.mjs` |
| [`docs/`](docs) | Spec, charters, phase plan — see [`docs/README.md`](docs/README.md). Load-bearing docs: `VISION.md`, `PHASE_MAP.md`, `CAPABILITY_MODEL.md`, `SYSTEMS.md`, `SCENARIOS.md`, `DESIGN_LANGUAGE.md`, `UX_PRINCIPLES.md`, `DEVELOPMENT.md`, `DATABASE_STRATEGY.md`, `DATA_DICTIONARY.md`, `POLICY_DECISION_INVENTORY.md`, `PAGE_INVENTORY.md`, `INFRASTRUCTURE.md`. `docs/phases/` has the current phase's detail doc; `docs/archive/` is historical only |

## Root-level / infrastructure

| Path | What it is |
|---|---|
| [`.github/workflows/ci.yml`](.github/workflows/ci.yml) | CI pipeline |
| [`docker-compose.yml`](docker-compose.yml) | Local Postgres (dev + test databases) |
| [`package.json`](package.json) / [`pnpm-workspace.yaml`](pnpm-workspace.yaml) | Root scripts (`typecheck`, `lint`, `test`, `build`, `doctor`) and the workspace member list |
| [`CLAUDE.md`](CLAUDE.md) | Permanent working instructions for AI agents on this repo |
| [`PROJECT_STATE.md`](PROJECT_STATE.md) | Where the project is *right now* (current phase, in-flight work) |
| [`CODE_MAP.md`](CODE_MAP.md) | This file |
| [`REORGANIZATION_REPORT.md`](REORGANIZATION_REPORT.md) | Why the structure looks the way it does |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Commit conventions, PR process |
| `.env.example` / `.env.test` | Environment variable templates (never commit real `.env`) |

---

## Quick lookup by task

| I need to... | Go to |
|---|---|
| Add/change a work order status transition | [`apps/api/src/systems/operations`](apps/api/src/systems/operations) (only `WorkOrderLifecycleService` writes `status`) |
| Change what a capability turns on/off | [`apps/api/src/control/capabilities`](apps/api/src/control/capabilities) + `packages/shared/src` capability engine |
| Fix a permission/access bug | [`apps/api/src/identity/access`](apps/api/src/identity/access) (backend) or [`apps/web/src/app/identity`](apps/web/src/app/identity) (frontend) |
| Change a branch manager screen | [`apps/web/src/app/experiences/branch-manager`](apps/web/src/app/experiences/branch-manager) |
| Change the workflow strip (journey UI) shown to multiple roles | [`apps/web/src/app/domain/journey`](apps/web/src/app/domain/journey) |
| Add a database column/table | [`packages/database`](packages/database) (schema + new migration), then the owning service under `systems/` |
| Fix a money/currency display bug | Check `apps/api` DTOs return `string`, never a JS number — `tools/lint-money.mjs` enforces this |
| Add an audit log entry | [`apps/api/src/audit`](apps/api/src/audit) only — nowhere else is allowed to write `AuditLog` |
| Fix RTL/Arabic layout | Never use `margin-left` etc. — `tools/lint-directional-css.mjs` enforces logical CSS properties |
| Find tests for a subsystem | API: `*.spec.ts` (unit) / `*.integration.spec.ts` (real-Postgres) sit next to the service they test, inside that subsystem's own folder under `systems/`, `identity/`, etc. Web: `*.spec.ts` sits next to its component under `experiences/` or `ui/`. There is no separate top-level `tests/` tree — tests are colocated with the code they cover |
| Change CI or local Postgres setup | [`.github/workflows/ci.yml`](.github/workflows/ci.yml), [`docker-compose.yml`](docker-compose.yml) |
| Add a root script (`pnpm run ...`) | [`package.json`](package.json) at repo root |
