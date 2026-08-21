# Development Setup

> Everything needed to go from a fresh clone to a green test run. If a step here is wrong or missing, that is a bug — this file is the only setup instruction, by design.

---

## Prerequisites

| | Version | Notes |
|---|---|---|
| Node | 24.x (see `.nvmrc`) | CI runs 24 (`.github/workflows/ci.yml`); `package.json` requires `>=22.22.3` |
| pnpm | 9.15.0 | Via corepack — do **not** `npm i -g pnpm` |
| Docker | any recent | For local Postgres |
| Git | any recent | |

Enable pnpm through corepack (ships with Node):

```bash
corepack enable
```

---

## First run

```bash
corepack pnpm install
```

Then:

```bash
docker compose up -d
```

```bash
corepack pnpm db:generate && corepack pnpm db:migrate
```

```bash
corepack pnpm run build:shared
```

`packages/database`'s seed scripts import `@mop/shared` at runtime (via `tsx`, not through the TypeScript compiler), so they resolve the package's compiled `dist/`, not its source. Skip this step and `db:seed:demo` fails immediately with `Cannot find module '.../@mop/shared/dist/index.js'` — the plain `db:seed` below doesn't happen to import `@mop/shared`, so it will misleadingly succeed even without this step.

```bash
corepack pnpm db:seed
```

Seeds plans, the platform admin, and two structurally-different tenants (empty shells — no work orders, no logins beyond the owner). For a workshop with real jobs, customers, and a login per role to actually browse, also run:

```bash
corepack pnpm db:seed:demo
```

This is idempotent and safe to re-run; it prints every seeded login (owner, manager, technician, inventory, customer, etc.) at the end.

```bash
corepack pnpm run doctor
```

Note the `run`: `pnpm doctor` on its own is a pnpm built-in command and will not execute this project script.

`doctor` verifies the whole toolchain and tells you exactly what is wrong if anything is. Run it first whenever something behaves strangely.

Then run the app:

```bash
corepack pnpm dev
```

API on `http://localhost:4000`, web on `http://localhost:4200`.

---

## Everyday commands

```bash
corepack pnpm test        # shared + api + web
corepack pnpm typecheck   # shared + api
corepack pnpm lint        # eslint + the audit-boundary check
corepack pnpm build       # all packages
corepack pnpm run doctor      # environment health
```

Single package:

```bash
corepack pnpm --filter @mop/api run test
```

---

## Three traps this project has actually hit

These are not hypothetical. Each one cost real time.

### 1. `pnpm install` silently does nothing

If a previous install left the workspace in a partial state, plain `pnpm install` hits an interactive prompt:

> The modules directories will be removed and reinstalled from scratch. Proceed? (Y/n)

With no TTY it **no-ops and still exits 0**, so it looks like it worked. Force it non-interactively:

```bash
CI=true corepack pnpm install
```

### 2. `pnpm` is not on PATH

On some machines only `corepack` is installed. Every command in this file therefore uses `corepack pnpm`, and the root `package.json` scripts are written to work when invoked that way.

### 3. Git refuses the repository — "dubious ownership"

If the folder was copied between Windows accounts, git refuses to touch it and **every `node_modules` symlink points at the old account's path**, so nothing builds. Two separate fixes:

```bash
git config --global --add safe.directory "<absolute path to this repo>"
```

```bash
CI=true corepack pnpm install
```

The second rewrites the symlinks. `corepack pnpm run doctor` detects both conditions.

---

## Database

Local Postgres runs in Docker (`docker-compose.yml`): database `mop_platform_dev`, user `mop_dev`, port 5432. Connection string lives in `.env` (gitignored; copy `.env.example`).

```bash
corepack pnpm db:migrate    # apply migrations (dev)
corepack pnpm db:seed       # seed plans, platform admin, two demo tenants
corepack pnpm db:studio     # browse data
corepack pnpm db:reset      # DESTRUCTIVE — drop, re-migrate, re-seed
```

The seed deliberately creates **two tenants with different capability profiles**. That is not decoration: a single-tenant database makes tenant-isolation bugs invisible, and leaves the product's configurability claim untested by construction.

### Integration tests

Tests ending `.integration.spec.ts` run against a **real** Postgres — mocked databases prove nothing about constraints, transactions or cascades. They use `mop_platform_test` (see `.env.test`).

```bash
corepack pnpm db:test:prepare   # create + migrate the test database
corepack pnpm test
```

Without a running Postgres those tests fail. To run only the rest:

```bash
corepack pnpm --filter @mop/api exec jest --testPathIgnorePatterns='.*integration\.spec\.ts$'
```

---

## Layout

```
apps/api        NestJS API
apps/web        Angular app
packages/shared Types, permission manifest, capability model + validator
packages/database  Prisma schema, migrations, seed
tools/          Repo-level checks (audit boundary, doctor)
docs/           Specs, charters, phase plan
```

Start with [`docs/README.md`](./README.md) for the documentation map, and [`docs/PHASE_MAP.md`](./PHASE_MAP.md) for what is being built next.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Cannot find module '@nestjs/common'` | Broken symlinks after a folder copy | `CI=true corepack pnpm install` |
| `ERR_PNPM_OUTDATED_LOCKFILE` | `package.json` changed without the lockfile | `corepack pnpm install --no-frozen-lockfile`, then commit the lockfile |
| `'pnpm' is not recognized` | pnpm only via corepack | Use `corepack pnpm`, or `corepack enable` |
| `dubious ownership` | Folder copied between accounts | `git config --global --add safe.directory <path>` |
| Prisma types are stale / `{}` | Client not regenerated after a schema edit | `corepack pnpm db:generate` |
| Integration tests fail to connect | Postgres not running | `docker compose up -d` |
| `Can't reach database server` | Docker Desktop not started | Start Docker Desktop, wait for the whale icon |
