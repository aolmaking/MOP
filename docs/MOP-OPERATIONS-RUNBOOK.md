# MOP — Local Operations & Runbook

**Start here if you need to run MOP locally.**

> **What this is.** Exact, copy-paste-ready instructions for taking this repository from a fresh machine to a working local development environment, using it, testing it, stopping it, and recovering it when it breaks.
>
> **What this is not.** A product or architecture explanation. For that, read the documents linked in [`docs/README.md`](./README.md).

---

## Verification status of this document

| | |
|---|---|
| **Written against** | branch `reconciled` @ `60c2841`, 2026-09-02 |
| **Verified live on** | Windows 11, Git Bash, Node 24.18.0, pnpm 9.15.0, PostgreSQL 16.4 |
| **What was actually executed** | `pnpm run doctor` (all 7 checks pass) · `GET /api/v1/health` (200, live) · `POST /api/v1/auth/login` with a seeded account (200, real session) · `GET /api/v1/auth/me` with the returned cookie (200) · `pg_isready` · `psql` database listing |
| **What was read but not executed** | `pnpm dev`, the test suites, `db:reset`, the backup/restore scripts, the staging edge, both Dockerfiles |
| **Marked UNVERIFIED below** | anything not executed on this machine |

**Every command below was checked against the actual `package.json` scripts and script files in this repository.** Where a command exists only outside the repository, that is stated explicitly.

---

## ⚠️ Read this before anything else: two facts that will waste your day

### 1. PostgreSQL on this machine is **not** Docker, and the start script is **not in this repository**

The repository ships a `docker-compose.yml`, and `README.md` / `CLAUDE.md` both tell you to run `docker compose up -d`. **On this machine that does not work — Docker is not installed** (`docker: command not found`, verified).

The database that actually runs here is a **user-space PostgreSQL 16 install outside the repository**, started by a script that is also outside the repository:

```
E:\mop-fleet\pg\pgsql\bin     PostgreSQL binaries
E:\mop-fleet\pg\data          the data directory
E:\mop-fleet\pg\log\postgres.log
E:\mop-fleet\harness\pg-start.sh   start
E:\mop-fleet\harness\pg-stop.sh    stop
```

**It does not survive a reboot.** After every restart of the machine you must start it by hand. See [§5](#5-database-startup).

> **If you have the repository only** — a fresh clone on a different machine, with no `E:\mop-fleet` — use the Docker path in [§5.2](#52-option-b--docker-portable-path) instead. Both produce the same database on the same port; only the startup differs.

### 2. This repository is worked on by several agents across several branches at once

At the time of writing there are **four active worktrees of this same repository**, and the branch under `C:\Users\ahmed\Desktop\MOP_...` has been switched **mid-session** by another process. Before you trust anything you see, run:

```bash
git -c safe.directory="$(pwd)" status -sb && git -c safe.directory="$(pwd)" log --oneline -3
```

See [§13](#13-git-branches-and-multi-agent-operations). This is not hypothetical — it happened while this document was being written, and it is documented there.

---

## §0. EMERGENCY QUICK START

**Machine that already has this repo, Node and PostgreSQL** — get running in five commands:

```bash
cd /c/Users/ahmed/Desktop/MOP_Product_Platform_v11_9_Pnpm_Install_Root_Fix_FULL_PROJECT
export PATH="/c/Program Files/nodejs:$PATH"

bash /e/mop-fleet/harness/pg-start.sh          # 1. database (this machine only)
corepack pnpm run doctor                        # 2. must print "All checks passed."
corepack pnpm db:deploy && corepack pnpm db:seed && corepack pnpm db:seed:demo   # 3. schema + data
corepack pnpm dev                               # 4. API :4000 + web :4200, one terminal
```

Then:

```
5. open  http://localhost:4200/login
   sign in  manager@apex-motors.local / ChangeMe-Manager-123
   verify   curl http://localhost:4000/api/v1/health
```

**Truly fresh machine?** Start at [§3](#3-fresh-machine-installation).
**Something already broken?** Jump to [§15](#15-troubleshooting).

---

## Table of contents

[§1 Required stack](#1-the-actual-required-stack) · [§2 Directory structure](#2-directory-structure) · [§3 Fresh machine install](#3-fresh-machine-installation) · [§4 Environment variables](#4-environment-variables) · [§5 Database startup](#5-database-startup) · [§6 Starting the application](#6-starting-the-full-application) · [§7 First login](#7-first-login--seeded-accounts) · [§8 Golden journey](#8-how-to-actually-use-the-system--the-golden-journey) · [§9 Role runbooks](#9-role-by-role-operations) · [§10 Testing](#10-testing) · [§11 Development workflow](#11-development-workflow) · [§12 Stopping](#12-stopping-the-system) · [§13 Git & multi-agent](#13-git-branches-and-multi-agent-operations) · [§14 Database recovery](#14-database-recovery) · [§15 Troubleshooting](#15-troubleshooting) · [§16 Health & observability](#16-health-and-observability) · [§17 Backups](#17-backups) · [§18 Docker, staging, deployment](#18-docker-staging-and-deployment) · [§19 Dev vs staging vs production](#19-development-vs-staging-vs-production) · [§20 What this runbook does not guarantee](#20-what-this-runbook-does-not-guarantee) · [§21 Documentation vs repository](#21-documentation-says--repository-does)

---

## §1. The actual required stack

### Required

| Component | Version | Where it is pinned | Notes |
|---|---|---|---|
| **Node.js** | **24.x** | `.nvmrc` = `24`; root `package.json` `engines.node` = `>=22.22.3` | `doctor` **fails** below the pinned major and **warns** above it. CI uses Node 24 |
| **pnpm** | **9.15.0** | root `package.json` `packageManager` | Invoked via **`corepack pnpm`** — see the trap below |
| **PostgreSQL** | **16** | `docker-compose.yml` uses `postgres:16-alpine`; CI uses `postgres:16-alpine`; this machine runs 16.4 | |
| **Git** | any recent | | This checkout needs `-c safe.directory` — see §1.3 |
| **A POSIX shell** | Git Bash on Windows | | The harness scripts are `bash` |

### Optional

| Component | Needed for |
|---|---|
| **Docker** | Only for the portable Postgres path (§5.2) and the unverified image builds (§18). **Not installed on this machine** |
| **OpenSSL** | Only for the LAN staging certificate (§18.2) |
| `psql` / `pg_dump` / `pg_restore` | Manual database work and backups. Shipped inside `E:\mop-fleet\pg\pgsql\bin` on this machine |

### Ports

| Port | Service | Set where | Fixed? |
|---|---|---|---|
| **5432** | PostgreSQL | `docker-compose.yml`, `pg-start.sh` (`-o "-p 5432"`), every `DATABASE_URL` | Yes, by convention |
| **4000** | API (dev) | `apps/api` `start:dev` → `tools/with-port.mjs 4000` — **pins `PORT=4000`, overriding any inherited value** | Yes, in dev |
| **4200** | Web dev server | Angular default (no explicit port in `angular.json`) | Yes, by default |
| 4100 | API in LAN staging rehearsal | `tools/staging/README.md` | Convention only |
| 8443 | TLS edge in LAN staging | `tools/staging/README.md` | Convention only |

**The web dev server proxies `/api` to `http://localhost:4000`** — `apps/web/proxy.conf.json`. That is why the API port is pinned: if the API is not on 4000, the browser gets 404s from the proxy, not a connection error.

### Databases on this machine (verified via `psql`)

| Database | Purpose |
|---|---|
| `mop_platform_dev` | Local development — what `.env` points at |
| `mop_platform_test` | Integration tests — what `.env.test` points at |
| `mop_platform_staging` | LAN staging rehearsal (§18.2) |
| `mop_dev_int` | The `w-int` worktree's own dev database |
| `mop_test_w3` | A worktree's scratch test database |

Development credentials, used by every default connection string: user **`mop_dev`**, password **`mop_dev_secret`**, host `localhost`, port `5432`. These are development-only defaults committed on purpose in `.env.example`.

### 1.3 Three toolchain traps

These are documented in `CLAUDE.md` and each is real:

| Trap | Reality |
|---|---|
| `pnpm` is **not on PATH** | Use **`corepack pnpm`**. In Git Bash, add Node first: `export PATH="/c/Program Files/nodejs:$PATH"` |
| `pnpm install` | Must be **`CI=true corepack pnpm install`** — otherwise it hits an interactive prompt, **no-ops, and still exits 0** |
| `pnpm doctor` | That is a **pnpm built-in** which shadows this project's script. Use **`corepack pnpm run doctor`** |
| Git ownership | This folder is owned by a different Windows account. Every git command needs `git -c safe.directory="$(pwd)" …`, or run `git config --global --add safe.directory <path>` once |

---

## §2. Directory structure

Only what you need to navigate. Full index: [`CODE_MAP.md`](../CODE_MAP.md).

```
apps/
  api/                    NestJS backend
    src/
      audit/              the ONLY place allowed to write AuditLog
      runtime/            config · database · health · http · scheduler
      identity/           auth (sessions, guards) · access (permission resolver)
      control/            capabilities · policies · governance · platform
      systems/            operations · inventory · finance · billing · people · customer · forms
      experiences/        per-role API surfaces
      insights/           analytics · reports · workflow-health
      testing/            HTTP walkthrough specs (the acceptance suite)
    Dockerfile            UNVERIFIED — never built (§18.1)
  web/                    Angular frontend
    src/app/              runtime · identity · ui · domain · experiences
    proxy.conf.json       /api -> http://localhost:4000
    Dockerfile            UNVERIFIED — never built (§18.1)
packages/
  shared/                 domain types, capability engine, policy registry, permission manifest
    dist/                 GENERATED — build output, do not edit
  database/
    prisma/schema.prisma  the schema
    prisma/migrations/    IMMUTABLE history — never reorder, rename or edit
    prisma/seed.ts        base seed (plans, platform admin, 2 tenants)
    prisma/seed-demo.ts   demo data (staff, jobs, stock, decisions)
    generated/            GENERATED Prisma client — do not edit, gitignored
tools/
  doctor.mjs              environment health check — run this first
  pnpm.mjs                pnpm shim used by every root script
  with-env.mjs            loads root .env for workspace commands
  with-port.mjs           pins PORT for the API dev server
  lint-*.mjs              7 custom lint rules, run by `pnpm lint`
  staging/                backup.sh · restore-drill.sh · edge.mjs · smoke.mjs
docs/                     documentation (this file lives here)
.env                      LOCAL, gitignored — your DATABASE_URL
.env.example              template
.env.test                 test database + relaxed throttles
docker-compose.yml        portable Postgres (needs Docker)
```

### Safe to modify vs generated vs infrastructure

| Path | Status |
|---|---|
| `apps/*/src`, `packages/shared/src`, `tools/`, `docs/` | **Safe to modify** |
| `packages/database/prisma/schema.prisma` | Safe, but **always** create a migration and then run `db:test:prepare` |
| `packages/database/prisma/migrations/` | **Immutable.** Never edit or reorder a migration that has run anywhere |
| `packages/database/generated/`, `packages/shared/dist/`, `apps/*/dist/`, `.angular/`, `node_modules/` | **Generated.** Never edit; safe to delete and rebuild |
| `.env` | **Local only**, gitignored. Never commit |
| `E:\mop-fleet\` | **Outside the repository.** Not version-controlled, not shipped with a clone |
| `/MOP/` at repo root | A stray nested clone, gitignored. Ignore it |

---

## §3. Fresh machine installation

### A. Prerequisites

```bash
node --version     # must be v24.x
git --version
```

Install Node 24 from nodejs.org or via nvm (`nvm install 24 && nvm use 24`). **Do not install pnpm globally** — corepack ships it.

```bash
corepack enable
```
*Enables pnpm at the version pinned in `package.json`. Expected: no output, exit 0. If `corepack` is missing, your Node is too old.*

### B–C. Clone and branch

```bash
git clone <repository-url> mop
cd mop
git status -sb        # confirm which branch you are on
```

**On this machine the repository already exists** at `C:\Users\ahmed\Desktop\MOP_Product_Platform_v11_9_Pnpm_Install_Root_Fix_FULL_PROJECT` — do not re-clone it; other worktrees depend on it (§13).

Ownership fix (Windows, this machine):
```bash
git config --global --add safe.directory "C:/Users/ahmed/Desktop/MOP_Product_Platform_v11_9_Pnpm_Install_Root_Fix_FULL_PROJECT"
```
*Without this every git command fails with "dubious ownership". Alternatively prefix each command with `git -c safe.directory="$(pwd)"`.*

### F. Install dependencies

```bash
export PATH="/c/Program Files/nodejs:$PATH"     # Git Bash only
CI=true corepack pnpm install
```

*Installs the whole workspace from `pnpm-lock.yaml`.*
**Expected:** a package summary and `Done in …`.
**`CI=true` is mandatory** — without it pnpm may hit an interactive prompt, do nothing, and **still exit 0**, leaving you debugging a phantom install.
**If it fails:** delete `node_modules` at the root and in each workspace, then retry. If symlinks look wrong (typically after copying the folder between Windows accounts), see §15.

Optional, to share the fleet's package store:
```bash
export npm_config_store_dir="E:\mop-fleet\.pnpm-store"
```

### G. Environment configuration

```bash
cp .env.example .env
```
*Creates the local `.env` with the development `DATABASE_URL`. It is gitignored. `.env.example` contains only the dev database URL — nothing secret.*

### H–I. PostgreSQL and the database

See [§5](#5-database-startup) — pick option A (this machine) or B (Docker).

The dev role and database (`mop_dev` / `mop_platform_dev`) already exist on this machine and are created automatically by Docker in option B.

### J. Generate the Prisma client

```bash
corepack pnpm db:generate
```
*Generates the typed client into `packages/database/generated/`.*
**Expected:** `Generated Prisma Client (v5.x) to ./generated/client`.
**If it fails:** check `.env` exists and `DATABASE_URL` is set — `tools/with-env.mjs` prints exactly that when it is not.

### K. Apply migrations

```bash
corepack pnpm db:deploy
```
*Applies every migration in order to the database in `.env`. Non-interactive — this is the one to use for an existing database.*
**Expected:** `N migrations found` … `All migrations have been successfully applied.` or `No pending migrations`.
**Use `corepack pnpm db:migrate` instead** only when you are *creating* a new migration during development.

### L. Seed

```bash
corepack pnpm db:seed        # required: plans, platform admin, 2 tenants
corepack pnpm db:seed:demo   # optional but recommended: staff, jobs, stock, decisions
```
*Both are **idempotent** — safe to re-run.* `seed.ts` deliberately creates no operational history; `seed-demo.ts` adds it and prints the sign-in credentials at the end.
**Expected from `db:seed:demo`:** a block starting `Demo data ready.` listing every account. See §7.

### M. Bootstrap build

```bash
corepack pnpm build:shared
```
*Builds `packages/shared` to `dist/`. **Required** — `apps/api` and `apps/web` consume the built output, not the source. Every root `lint`/`test`/`typecheck`/`build` script runs this first, so you rarely need it alone — but after adding a new export to `packages/shared` you must run it or `apps/api` typecheck will not see the change.*

### Verify the install

```bash
corepack pnpm run doctor
```

**Expected — this exact output was produced on this machine:**

```
MOP environment check

[  ok  ] Node version — 24.18.0 (matches .nvmrc)
[  ok  ] Workspace symlinks — resolve inside the repo
[  ok  ] Prisma client — generated after the current schema
[  ok  ] .env — present, DATABASE_URL set
[  ok  ] .gitignore — clean UTF-8
[  ok  ] Git repository — readable
[  ok  ] Postgres — accepting connections on 5432

All checks passed.
```

`doctor` exits 1 if any check **FAILs**; **WARNs never fail it**. Each failure prints its own fix.

---

## §4. Environment variables

Read by `apps/api/src/runtime/config/environment.ts`, which **validates at boot and exits with code 78 (`EX_CONFIG`)** rather than starting misconfigured.

| Variable | Required? | Purpose | Example / default | Where used |
|---|---|---|---|---|
| `DATABASE_URL` | **Required** | Postgres connection. Must match `^postgres(ql)?://` | `postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_dev?schema=public` | API, Prisma CLI, seeds, tests |
| `NODE_ENV` | Optional | One of `development` \| `test` \| `production` | `development` | Boot validation; **decides the session cookie's `Secure` flag** |
| `PORT` | Optional | API listen port | `4000` | API. **Pinned to 4000 in dev** by `tools/with-port.mjs` |
| `CORS_ORIGIN` | Optional | Browser origin allowed to send credentialed requests | `http://localhost:4200` | API CORS. **In production must be `https://` and must not be `*`** — boot refuses otherwise |
| `THROTTLE_GLOBAL_LIMIT` | Optional | Requests per window, all routes | `300` | Throttler |
| `THROTTLE_GLOBAL_TTL_MS` | Optional | Global window | `60000` | Throttler |
| `THROTTLE_AUTH_LIMIT` | Optional | Requests per window on auth routes | `10` | Throttler |
| `THROTTLE_AUTH_TTL_MS` | Optional | Auth window | `60000` | Throttler |
| `PGBIN`, `PGUSER`, `PGHOST`, `PGPORT`, `PGPASSWORD` | Optional | Override binaries/connection for the backup scripts | `E:/mop-fleet/pg/pgsql/bin`, `mop_dev`, `127.0.0.1`, `5432` | `tools/staging/backup.sh`, `restore-drill.sh` |
| `npm_config_store_dir` | Optional | Shared pnpm store | `E:\mop-fleet\.pnpm-store` | pnpm |

### Which values are safe development defaults

**Safe as-is for local development** — committed on purpose: `DATABASE_URL` in `.env.example`, the `mop_dev` / `mop_dev_secret` credentials, and every default in the table above.

**Requires real values before any real deployment**: `DATABASE_URL` (a real host and a real password), `CORS_ORIGIN` (a real `https://` origin), `NODE_ENV=production`, and a review of the throttle limits. Use `<YOUR_SECRET>` placeholders in anything you commit.

**The auth throttle is security-critical.** Password hashing is scrypt at N=131072 — roughly 128 MB and real CPU per attempt — so an unthrottled login endpoint turns credential stuffing into a denial of service. `.env.test` deliberately raises the limits to 1000/10000 because the integration suite logs in many times from one address; **never copy those values into `.env`.**

### Files

| File | Committed? | Purpose |
|---|---|---|
| `.env` | **No** (gitignored) | Your local config. Create from `.env.example` |
| `.env.example` | Yes | Template — dev `DATABASE_URL` only |
| `.env.test` | Yes | Test database + relaxed throttles. Used by `db:test:prepare` |

`tools/with-env.mjs` loads the **root** `.env` for workspace commands, because Prisma resolves `.env` relative to the schema file and would otherwise not find it. **An already-set environment variable always wins**, so exporting `DATABASE_URL` in your shell overrides `.env` — which is exactly how you point a command at the test database.

---

## §5. Database startup

### 5.1 Option A — this machine (user-space PostgreSQL 16, **no Docker**)

**Why it is like this.** This machine has no Docker and no administrator rights, so PostgreSQL is a user-space install started by hand rather than a Windows service. **It does not survive a reboot.**

⚠️ **The start/stop scripts are NOT in this repository.** They live at `E:\mop-fleet\harness\`. A fresh clone on another machine will not have them — use option B there.

#### Start

```bash
bash /e/mop-fleet/harness/pg-start.sh
```

*Starts PostgreSQL on port 5432 from `E:/mop-fleet/pg/data`, logging to `E:/mop-fleet/pg/log/postgres.log`. If it is already up, it says so and exits 0. It polls `pg_isready` for up to 30 seconds rather than using `pg_ctl -w`, which blocks forever under Git Bash.*

**Expected:** `postgres up on 5432` — or `postgres already accepting connections on 5432`.
**If it fails:** the script prints the last 20 lines of the log itself. See §15 and §14.4.

#### Check it is running

```bash
/e/mop-fleet/pg/pgsql/bin/pg_isready.exe -h 127.0.0.1 -p 5432
```
**Expected:** `127.0.0.1:5432 - accepting connections` (exit 0).

Equivalent checks:
```bash
corepack pnpm run doctor          # the Postgres line
netstat -ano | grep ":5432"       # Windows: who is listening
```

#### Stop

```bash
bash /e/mop-fleet/harness/pg-stop.sh
```
*`pg_ctl -m fast stop` — a clean shutdown.*
⚠️ **Always stop it this way.** An unclean stop leaves the cluster needing crash recovery on next start; that has already happened once on this machine.

#### Restart

```bash
bash /e/mop-fleet/harness/pg-stop.sh && bash /e/mop-fleet/harness/pg-start.sh
```

### 5.2 Option B — Docker (portable path)

Use this on any machine that has Docker, and on a fresh clone with no `E:\mop-fleet`.

```bash
docker compose up -d          # start
docker compose ps             # check — expect "healthy"
docker compose stop           # stop, keep data
docker compose down           # stop and remove the container, KEEP the volume
```

*Starts `postgres:16-alpine` with `mop_dev` / `mop_dev_secret` / `mop_platform_dev` on 5432, pinned to `timezone=UTC`, with a healthcheck.*

**The UTC pin is deliberate and load-bearing.** Every timestamp column is `timestamp without time zone` and 64 of them default to `now()`, which Postgres casts through the **session** timezone. On a non-UTC server those land in local time while application-written values land in UTC, and every duration and date bucket that mixes them is silently out by the offset. `pnpm run doctor` fails when the server disagrees.

⚠️ **`docker compose down -v` deletes the data volume.** See the destructive table below.

### 5.3 Creating or recreating the development database

The database already exists on this machine, and Docker creates it automatically. To create it by hand:

```bash
export PGBIN=/e/mop-fleet/pg/pgsql/bin
PGPASSWORD=mop_dev_secret "$PGBIN/createdb.exe" -h 127.0.0.1 -U mop_dev mop_platform_dev
```

List what exists:
```bash
PGPASSWORD=mop_dev_secret "$PGBIN/psql.exe" -h 127.0.0.1 -U mop_dev -d postgres -c "\l"
```

### 5.4 Migrations and seeding

```bash
corepack pnpm db:deploy        # apply pending migrations (non-interactive)
corepack pnpm db:seed          # base seed — idempotent
corepack pnpm db:seed:demo     # demo data — idempotent, replaces demo work
corepack pnpm db:test:prepare  # apply migrations to the TEST database (.env.test)
```

> **The trap that costs an hour.** After creating any new migration, run **`corepack pnpm db:test:prepare`** — otherwise the integration tests hit a test database missing the new table and fail with a confusing 500 that looks like a code bug.

To create a migration during development:
```bash
corepack pnpm db:migrate                                            # interactive, prompts for a name
corepack pnpm --filter @mop/database run migrate:create -- add_thing # explicit name
```

Inspect data:
```bash
corepack pnpm db:studio        # Prisma Studio in a browser
```

### 5.5 Safe vs destructive operations

| | Command | Effect |
|---|---|---|
| ✅ **Safe** | `db:deploy` | Applies pending migrations. Never drops anything |
| ✅ **Safe** | `db:seed`, `db:seed:demo` | Idempotent; look up before creating |
| ✅ **Safe** | `db:generate`, `db:studio`, `db:test:prepare` | |
| ✅ **Safe** | `pg-start.sh`, `pg-stop.sh`, `docker compose stop` | |
| ⚠️ **Destructive** | **`corepack pnpm db:reset`** | `prisma migrate reset --force` — **DROPS the database, re-runs every migration, re-seeds.** All local data is gone |
| ⚠️ **Destructive** | **`docker compose down -v`** | Deletes the Postgres **data volume**. Everything is gone |
| ⚠️ **Destructive** | `dropdb`, `DROP DATABASE`, `TRUNCATE` | As written |
| ⚠️ **Destructive** | `restore-drill.sh` | **Drops and recreates its scratch database** (default `mop_restore_drill`). Never point it at a database you care about |

**Before any destructive operation, take a backup** — §17.

---

## §6. Starting the full application

### 6.1 One terminal (recommended)

```bash
cd /c/Users/ahmed/Desktop/MOP_Product_Platform_v11_9_Pnpm_Install_Root_Fix_FULL_PROJECT
export PATH="/c/Program Files/nodejs:$PATH"
corepack pnpm dev
```

*Runs `pnpm --parallel --filter @mop/api --filter @mop/web run start:dev` — the NestJS watch server (port pinned to 4000) and the Angular dev server (4200) in one process tree.*

**Prerequisite: PostgreSQL must already be running** (§5). The API validates its environment and connects at boot; it will not start without a database.

### 6.2 Three terminals (when you need separate logs)

**TERMINAL 1 — database**
```bash
bash /e/mop-fleet/harness/pg-start.sh
```
Expected: `postgres up on 5432`.

**TERMINAL 2 — API**
```bash
cd /c/Users/ahmed/Desktop/MOP_Product_Platform_v11_9_Pnpm_Install_Root_Fix_FULL_PROJECT
export PATH="/c/Program Files/nodejs:$PATH"
corepack pnpm --filter @mop/api run start:dev
```
Expected, last line:
```
[Nest] ... LOG [Bootstrap] MOP API listening on 4000 (development)
```

**TERMINAL 3 — web**
```bash
cd /c/Users/ahmed/Desktop/MOP_Product_Platform_v11_9_Pnpm_Install_Root_Fix_FULL_PROJECT
export PATH="/c/Program Files/nodejs:$PATH"
corepack pnpm --filter @mop/web run start:dev
```
Expected: `Application bundle generation complete.` and `Local: http://localhost:4200/`.

### 6.3 What belongs to which port

| URL | Service |
|---|---|
| `http://localhost:4200` | Angular application — **open this in the browser** |
| `http://localhost:4000/api/v1/...` | API directly |
| `http://localhost:4200/api/v1/...` | The same API **through the dev-server proxy** — this is what the browser actually uses |
| `localhost:5432` | PostgreSQL |

### 6.4 Verifying it works

**API health — verified live on this machine:**
```bash
curl http://localhost:4000/api/v1/health
```
```json
{"status":"ok","database":"connected","schedulerLastHeartbeatAt":"2026-09-02T18:49:00.012Z"}
```
`database: "connected"` means a real `SELECT 1` succeeded. A non-null `schedulerLastHeartbeatAt` proves the scheduler is **actually running**, not merely wired up at boot.

**Frontend → backend connectivity** (proves the proxy, not just the API):
```bash
curl http://localhost:4200/api/v1/health
```
Same JSON. If this fails while port 4000 works, the proxy or the web dev server is the problem — not the API.

**A real login — verified live:**
```bash
curl -s -c /tmp/mop.txt -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"manager@apex-motors.local","password":"ChangeMe-Manager-123"}'
```
Returns the full session context (`role: "BRANCH_MANAGER"`, `landingPage: "branch-home"`, `tenantStatus: "ACTIVE"`, …) and sets the session cookies. Then:
```bash
curl -s -b /tmp/mop.txt http://localhost:4000/api/v1/auth/me
```
Same context — the cookie round-trips.

**A failed login returns the standard error shape** (verified):
```json
{"code":"unauthorized","message":"Incorrect email/phone or password"}
```

---

## §7. First login — seeded accounts

### How users are created

There is **no self-service staff signup**. Accounts come from exactly four places:

1. **The seed scripts** — the platform admin and both tenant owners (`db:seed`), plus demo staff (`db:seed:demo`).
2. **Platform Super Admin creating a workshop** — writes the owner's `Account` plus a one-time invite token.
3. **An Owner inviting staff** — `/owner/organization`, same invite-token flow.
4. **Customer self-registration** — `/register`, the only self-registration path in the product, resolving a tenant slug or registration code.

An invited user redeems their link at `/invite/accept?token=…` and sets their own password. **The invite is consumed on use.**

### Seeded development credentials

These are **intentionally documented development credentials**, defined as named constants in the seed scripts and printed by `db:seed:demo` on completion. They are not secrets and must never exist outside a development database.

**From `db:seed` (required):**

| Account | Password | Role |
|---|---|---|
| `platform-admin@mop.local` | `ChangeMe-Platform-123` | Platform Super Admin |
| `owner@apex-motors.local` | `ChangeMe-Owner-123` | Tenant Owner — Apex Motors |
| `owner@delta-quick.local` | `ChangeMe-Owner-123` | Tenant Owner — Delta Quick Service |

**From `db:seed:demo` (optional, Apex Motors only):**

| Account | Password | Role | Lands on |
|---|---|---|---|
| `manager@apex-motors.local` | `ChangeMe-Manager-123` | Branch Manager | `/branch/attention` |
| `owner-demo@apex-motors.local` | `ChangeMe-Owner-123` | Tenant Owner | `/owner/home` |
| `tech@apex-motors.local` | `ChangeMe-Tech-123` | Technician | `/tech` |
| `inventory@apex-motors.local` | `ChangeMe-Inventory-123` | Inventory Manager | `/inventory/home` |
| `leader-demo@apex-motors.local` | `ChangeMe-Leader-123` | Team Leader | `/team-leader` |
| `analyst@apex-motors.local` | `ChangeMe-Analyst-123` | Data Analyst | `/analyst/home` |
| `sara.nabil@customer.local` | `ChangeMe-Customer-123` | Customer (has a decision waiting) | `/customer` |

Every demo customer follows `first.last@customer.local` with the same password.

Sign in at **`http://localhost:4200/login`**. The server decides where you land (`SessionContext.landingPage`); the client maps it to a route. An unrecognised landing page routes to `/access-denied` — that is deliberate, not a bug.

### The two seeded tenants — and why there are two

| | **Apex Motors** (`apex-motors`) | **Delta Quick Service** (`delta-quick`) |
|---|---|---|
| Shape | Multi-branch, full service | Single bay |
| Branches | Nasr City, Giza | Main Bay |
| Warehouses | Central Warehouse, Giza Store | none |
| Capabilities | Inventory + teams + QC | **No inventory, no teams, no QC** |
| Currency / timezone | EGP / Africa-Cairo | AED / Asia-Dubai |

A single-tenant database makes tenant-isolation bugs invisible and leaves the product's central claim untested. **Delta is the shape that breaks naive code** — no inventory means no part lifecycle, and a Finish Gate still demanding "parts used or returned" would strand every job.

### Creating a workshop through the product

Sign in as `platform-admin@mop.local` → `/platform/workshops` → **New workshop** (`/platform/workshops/new`).

Nine stages: **Identity · Plan & access · Capabilities · Specialisation · Policies · Responsibility · Structure · Services · Review.**

- **Currency and timezone (stage 1) can never be changed afterwards** — every price and timestamp is recorded against them.
- Stage 3 decides which steps exist at all; stage 5 asks only the policy questions that shape makes meaningful.
- **Stage 6 (Responsibility) matters more than it looks.** Enabling Inventory without anyone holding `inventory.*` permissions produces a capability nobody in the building can operate. This stage grants the covering role the permissions it needs, at creation.
- Stage 7 creates branches and warehouses and grants each branch the stores it may draw from.
- **Creation is one transaction** — the whole workshop or none of it.

Afterwards the new owner must redeem their invite link before they can sign in.

---

## §8. How to actually use the system — the golden journey

The business-critical path. Roles switch between steps; open a private window per role or sign out between them.

> **Reality note.** The journey below is proven end to end over real HTTP against real Postgres by `apps/api/src/testing/walkthrough.http.spec.ts` (21 assertions), `parts-loop.http.spec.ts` (14) and `decision-deadlock.http.spec.ts` (6). Two gaps remain and are flagged inline.

| # | Role | Page | Action | Expected result | State change |
|---|---|---|---|---|---|
| 1 | Branch Manager | `/branch/intake` | Search or create customer + asset, book in | Job appears on the board | `DRAFT → REGISTERED` |
| 2 | Technician | `/tech` → `/tech/card/:id` | **Start inspection** | Card switches to inspection | `REGISTERED → UNDER_INSPECTION` |
| 3 | Technician | `/tech/card/:id` | Record inspection; add a fault with a severity | Fault listed. A `CRITICAL` fault sets the routing fact that sends *this job* through QC | — |
| 4 | Technician | `/tech/card/:id` | Raise a customer decision (price the finding) | Decision created with a secure token | `→ AWAITING_CUSTOMER_APPROVAL` |
| 5 | **Customer** | `/decide/:token` (no login) or `/customer/decisions` | Approve or reject each item | Reading it records `SENT → VIEWED`. **A `CRITICAL` rejection is refused server-side until acknowledged** | `→ APPROVED_FOR_WORK` when at least one item is approved |
| 5a | Branch Manager | `/branch/approvals` | *Alternative:* record the answer given verbally | **Always attributed to staff, never the customer** | same |
| 6 | Technician | `/tech/card/:id` | **Start work** | Job is live | `→ IN_PROGRESS` |
| 7 | Branch Manager | `/branch/work-orders/:id` | Add a task the customer mentioned at the desk | Task appears on the technician's card | — |
| 8 | Technician | `/tech/card/:id` | Request a part | Request lands in the store's queue | `→ WAITING_PARTS` |
| 9 | Inventory Manager | `/inventory/requests` | Approve, then issue | `StockMovement ISSUE`; `availableQty ↓`, `issuedQty ↑`; `beforeQty`/`afterQty` recorded. **A partial issue deliberately does not finish the request** | — |
| 10 | Technician | `/tech/card/:id` | Receive the part | — | `→ IN_PROGRESS` |
| 11 | Technician | `/tech/card/:id` | Mark used **or** send it back | Used → billable line + running invoice. Returned → `RETURN_PENDING` movement | — |
| 12 | Inventory Manager | `/inventory/returns` | Accept / reject / ask a question | **Accepting is the only action in the product that raises available stock from a return** | stock and bill both restored |
| 13 | Technician | `/tech/card/:id` | **Finish check**, then Finish | Every unsatisfied gate is listed at once, not one at a time. Finish is refused until every issued part is accounted for | routed by capability + policy + fact |
| 14 | Team Leader / Branch Manager | `/branch/work-orders/:id` | Pass review / QC | Only where those capabilities are on | `→ PAYMENT_PENDING` |
| 15 | Owner / Branch Manager | `/branch/work-orders/:id` | Issue the invoice | Gap-free number; totals frozen; compliance checked **inside the same transaction** | invoice issued |
| 16 | Branch Manager | `/branch/delivery` → `/branch/payments/:invoiceId` | Take payment | **Replaying an idempotency key records one payment, not two.** The board stops offering to take money no longer owed | `→ READY_FOR_DELIVERY` |
| 17 | Branch Manager | `/branch/delivery` | Release the vehicle | Refused while the Delivery Gate fails | `→ CLOSED` |

**Deadlock escape (verified):** an ask the customer never answers does not strand the job — staff withdraw it from `/branch/approvals` (Cancel) and the finish gate reopens.

**Contrast run (verified):** the same code on a workshop with nothing switched off routes FINISH into team review and then QC before the money (`walkthrough-contrast.http.spec.ts`). That is the capability engine doing real work.

### ⚠️ Two things you cannot do through the product today

| Missing | Consequence | Workaround |
|---|---|---|
| **Clearing a blocker** | `TechnicianWorkService.resolveBlocker` exists and is tested but **has no HTTP route**, and `no_open_blocker` is a core Finish gate. **A job that hits a blocker cannot be finished.** The only exit is Cancel | Do not report a blocker on a job you intend to finish, or clear it directly in the database |
| **Marking a transferred part arrived / resolving a rejected return** | `markArrived` and `resolveRejectedReturn` have no route | Avoid those paths in a demo |

Verified on this branch: `grep` over every controller finds no route to `resolveBlocker`.

---

## §9. Role-by-role operations

### Platform Super Admin — `platform-admin@mop.local`

**Log in:** `/login` → lands on `/platform/workshops`.
**Sees:** every workshop across every tenant.
**Can:** create a workshop (nine stages, one transaction) · shape capabilities with an impact preview · freeze/reactivate with an impact preview · archive/reactivate · set and remove per-role permission locks (**both audited, both require a written reason**) · read Platform Reports · watch Live View.
**Normal workflow:** create a workshop → send the owner their invite → adjust capabilities as the workshop's shape becomes clear.
**Expect:** every destructive action names who it will affect **before** it happens. Live View shows **counts and event kinds only, never payload** — it is the only cross-tenant read in the product.

### Tenant Owner — `owner-demo@apex-motors.local`

**Log in:** `/login` → `/owner/home`.
**Sees:** six triage cards — open work orders, waiting-customer, waiting-parts, waiting-payment, low stock, recent changes. All links.
**Can:** invite and manage staff, branches, warehouses and teams (`/owner/organization`) · author message templates (`/owner/messages`) · author custom fields (`/owner/forms`) · set pricing and financial configuration (`/owner/pricing`) · read reports (`/owner/reports`) · read the audit trail with inline diffs (`/owner/audit`) · read Workflow Health (`/owner/workflow-health`).
**Cannot by default:** book a job in, reassign a technician, or record a customer decision. **The Owner sees the whole company and works none of it** — that is deliberate.
**Expect:** `/owner/pricing` edits are **effective-dated** — a price change closes the old row and opens a new one, so an issued invoice never reprices.

### Branch Manager — `manager@apex-motors.local`

**Log in:** `/login` → `/branch/attention`.
**Sees:** a **ranked** queue (not a list) of what needs them, with counts derived from the same items so the two cannot disagree. Ageing is working-week aware.
**Can:** book in (`/branch/intake`) · work the board (`/branch/work-orders`) · open a job (`/branch/work-orders/:id`) — add tasks, ask the customer, add append-only notes, view the dossier · record a customer's verbal answer and cancel unanswered asks (`/branch/approvals`) · take payment and release vehicles (`/branch/delivery`) · pass review/QC · manage teams **only if the Owner has delegated it** (`/branch/team`).
**Normal workflow:** open Attention Center → clear the top item → repeat.
**Expect:** the Team Setup rail entry is **absent, not greyed out**, until delegated. Releasing a vehicle is refused while the Delivery Gate fails, and the refusal names what is holding it.

### Technician — `tech@apex-motors.local`

**Log in:** `/login` → `/tech`.
**Sees:** *Now* (the current job), *My Work*, and the Work Card. Bottom navigation, no sidebar — built for a phone or tablet held one-handed.
**Can:** start inspection · record inspections and faults · raise a customer decision · start work · start/complete tasks (time entry appears only if the workshop's `TIME_TRACKING` policy allows it) · report a blocker · request, receive, use and **return** parts · answer the store's clarification · record external/customer-supplied parts · preview the finish checklist · finish.
**Normal workflow:** *Now* → do the work → Finish check → Finish.
**Expect:** the finish checklist lists **every** unsatisfied gate at once. **Never sees** price, cost or margin.
⚠️ There is no control to clear a blocker (§8).

### Inventory Manager — `inventory@apex-motors.local`

**Log in:** `/login` → `/inventory/home`.
**Sees:** seven triage cards with a per-warehouse breakdown, each linking to the queue that resolves it.
**Can:** approve / reject / mark-unavailable / issue part requests (`/inventory/requests`) · manage the catalogue (`/inventory/catalog`) · read five-bucket stock and deactivate/reactivate warehouses (`/inventory/stock`) · accept, reject or ask about returns and read the movement ledger (`/inventory/returns`) · read velocity-based stock risk (`/inventory/reports`).
**Expect:** **cost is absent from the catalogue** unless the Owner has granted `inventory.cost.view`. Quantity is deliberately not editable on the catalogue page — stock changes only through a movement. A warehouse holding stock **cannot** be deactivated.

### Team Leader — `leader-demo@apex-motors.local`

**Log in:** `/login` → `/team-leader`. Everything is scoped to their own technicians.
**Can:** read five triage cards · see the roster and write an internal supervision note (**never shown to the technician it is about**) · see the team's jobs · read managed-scope performance reports · decide team review.
**Expect:** **no price, cost or payment field appears anywhere** in this role's data — asserted by test. Rework and QC are a link, never an action.

### Data Analyst — `analyst@apex-motors.local`

**Log in:** `/login` → `/analyst/home`. Read-only.
**Can:** read six analytical surfaces · save named view configurations · export CSV from each analytical page.
**Expect:** no money field in People Analytics and no customer-identifying field in Decision Analytics — both asserted by test. Export is gated twice (the permission, then the category against the plan) and writes an audit row. Exports reflect the server's default date range — there is no date filter UI yet, and the page says so.

### Customer — `sara.nabil@customer.local`

**Log in:** `/login` → `/customer`; or open a decision link at `/decide/:token` **with no login at all**.
**Sees:** pending decisions first when there are any, their assets, current service in plain language, invoice status, and a safe technical history.
**Can:** answer decisions, read status, read invoices.
**Expect:** a **critical** rejection requires an explicit acknowledgement, enforced server-side. Prices appear beside findings only if the workshop's policy says so — when hidden they are **absent from the response**, not merely hidden in the page. **Cannot pay online** — payment happens at the counter.

---

## §10. Testing

### The commands that actually exist

| Command | Runs | Needs a database? | Needs services running? |
|---|---|---|---|
| `corepack pnpm test` | shared → api → web, **the whole suite** | **Yes** — the API suite includes integration and HTTP specs | No |
| `corepack pnpm test:unit` | shared → api **excluding `*.integration.spec.ts`** → web | Only for what remains | No |
| `corepack pnpm --filter @mop/shared test` | 13 spec files, pure domain logic | **No** | No |
| `corepack pnpm --filter @mop/api test` | 112 spec files — 64 integration, 4 HTTP | **Yes** | No |
| `corepack pnpm --filter @mop/api run test:unit` | API, integration specs excluded | Mostly no | No |
| `corepack pnpm --filter @mop/web test -- --watch=false` | 57 Vitest spec files | No | No |
| `corepack pnpm lint` | eslint + **7 custom rules** | No | No |
| `corepack pnpm typecheck` | shared + api (**not web** — it has no typecheck script) | No | No |
| `corepack pnpm build` | shared → api → web | No | No |

**Every root script builds `packages/shared` first.** That is why they can be slow to start and why you rarely need `build:shared` on its own.

### Point the tests at the test database — always

```bash
export DATABASE_URL="postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public"
export THROTTLE_AUTH_LIMIT=1000
export THROTTLE_GLOBAL_LIMIT=10000
corepack pnpm test
```

*Integration specs default to the test database **only when `DATABASE_URL` is unset** — an inherited dev URL would silently run them against your development data. Export it explicitly.*
*The relaxed throttles exist because the suite legitimately logs in many times from one address; throttling itself is proven separately by `auth/throttle.integration.spec.ts`, which sets its own strict limit.*

**Prerequisite:** PostgreSQL running **and** `corepack pnpm db:test:prepare` run after any new migration.

### What each layer proves — and does not

| Layer | Files | Proves | Does **not** prove |
|---|---|---|---|
| **Lint (7 rules)** | — | Audit-write boundary · money as string · declared permission keys · no physical-direction CSS · touch targets · no hard delete · no dead doc links | Anything about behaviour |
| **Shared unit** | 13 | Pure domain logic: workflow router, capability reachability validator, policy graph-safety, money arithmetic | That any service calls it |
| **API unit** | ~48 | One service against stubs | That the database accepts it |
| **API integration** | **64** | **Real Postgres**: constraints, transactions, cascades, races, tenant isolation | That any page reaches it |
| **API HTTP** | **4** | **Real guarded HTTP** through the whole stack: `walkthrough.http.spec.ts` (21 assertions), `parts-loop.http.spec.ts` (14), `decision-deadlock.http.spec.ts` (6), `walkthrough-contrast.http.spec.ts` | That the browser calls those endpoints |
| **Web unit** | 57 | Components render and react correctly | That the API returns that shape |
| **Browser / E2E** | **0** | — | — |

### ❌ There is no browser test suite, and no "Honesty Harness" in this repository

**Verified:** no Playwright, no Cypress, no Selenium, no `harness/` directory inside the repository. `grep` for *honesty* returns only prose in comments.

The closest thing that exists — and it is genuinely valuable — is **`apps/api/src/testing/*.http.spec.ts`**, the HTTP-level golden-journey walkthrough. It runs inside `pnpm test`. It proves the **API** path end to end; it does not open a browser.

```bash
export DATABASE_URL="postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public"
corepack pnpm --filter @mop/api test -- walkthrough.http.spec.ts
corepack pnpm --filter @mop/api test -- parts-loop.http.spec.ts
corepack pnpm --filter @mop/api test -- decision-deadlock.http.spec.ts
corepack pnpm --filter @mop/api test -- walkthrough-contrast.http.spec.ts
```

**What "green" means here:** the golden journey completes over real HTTP, through real guards, against real Postgres, on the launch capability profile — and the contrast spec proves the same code routes differently on a differently-shaped workshop. It does **not** mean any page in the browser calls those endpoints.

### The full gate

The four-stage gate this project uses before a merge:

```bash
corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test && corepack pnpm build
```

A scripted version with per-stage timing exists **outside the repository** at `E:\mop-fleet\harness\full-gate.sh`:

```bash
bash /e/mop-fleet/harness/full-gate.sh [worktree] [output-prefix]
```
*Runs the same four stages against the test database, writing a per-stage log and a `STAGE=… EXIT=… SECONDS=…` summary line. Defaults to the `w-int` worktree.* **UNVERIFIED in this session** — read, not executed.

### CI

`.github/workflows/ci.yml`, on every push to `main` and every PR: real `postgres:16-alpine` service → install (frozen lockfile) → `db:generate` → **`build:shared`** → `db:deploy` → **lint** → **typecheck** → **test** → **build**. Node 24.

The separate `build:shared` step is deliberate: a failure there reports as *"shared did not build"* rather than a wall of *"Cannot find module @mop/shared"*.

---

## §11. Development workflow

The loop, using only scripts that exist:

```bash
# 1. Know where you are (see §13 — this matters here)
git -c safe.directory="$(pwd)" status -sb
git -c safe.directory="$(pwd)" log --oneline -3

# 2. Pull
git -c safe.directory="$(pwd)" pull --ff-only

# 3. Dependencies, if the lockfile moved
CI=true corepack pnpm install

# 4. Environment health
corepack pnpm run doctor

# 5. Database up to date
corepack pnpm db:deploy
corepack pnpm db:test:prepare      # ONLY needed after a new migration, but harmless

# 6. Develop
corepack pnpm dev

# 7. The gate, cheapest failure first
corepack pnpm typecheck
corepack pnpm lint
export DATABASE_URL="postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public"
corepack pnpm test
corepack pnpm build

# 8. Verify in the browser — there is no automated browser test to do this for you
#    Sign in, walk the part of the journey you touched (§8).

# 9. Commit
git -c safe.directory="$(pwd)" add -A
git -c safe.directory="$(pwd)" commit
```

**If you changed `packages/shared`:** every root script rebuilds it, but a direct workspace command does not — run `corepack pnpm build:shared` before `--filter @mop/api` anything.
**If you added a migration:** run `corepack pnpm db:test:prepare` or the integration tests will fail confusingly.

Commit conventions: [`CONTRIBUTING.md`](../CONTRIBUTING.md) — Conventional Commits, body explains *why*.

---

## §12. Stopping the system

### Stopping the dev servers

If you started with `corepack pnpm dev`: **Ctrl+C once** in that terminal stops both. In separate terminals, Ctrl+C each.

**If Ctrl+C leaves something behind** (Windows, Git Bash):

```bash
# Find who holds the port
netstat -ano | grep ":4000"
netstat -ano | grep ":4200"

# Kill by PID (the last column above)
taskkill //PID <pid> //F
```
*The doubled slashes are required in Git Bash — a single slash is rewritten into a path.*

Blunter, kills every Node process on the machine:
```bash
taskkill //IM node.exe //F
```
⚠️ This also kills any other Node work you have running, including other agents' dev servers.

### Stopping PostgreSQL

```bash
bash /e/mop-fleet/harness/pg-stop.sh        # this machine
docker compose stop                          # Docker path
```
⚠️ **Always stop cleanly.** An abrupt kill leaves the cluster needing crash recovery on the next start.

### A clean restart, in order

```bash
# stop
# (Ctrl+C the dev servers, or taskkill as above)
bash /e/mop-fleet/harness/pg-stop.sh

# start
bash /e/mop-fleet/harness/pg-start.sh
corepack pnpm run doctor          # must be all-green before going further
corepack pnpm dev
curl http://localhost:4000/api/v1/health
```

---

## §13. Git, branches, and multi-agent operations

> **Read this before you commit anything.** This repository is worked on by several agents in parallel, and the rules below are enforced by scripts that will refuse you.

### The branches that exist

| Branch | Purpose |
|---|---|
| `main` | Integration target. **Never pushed to directly** |
| `develop` | Where track branches are integrated and the gate is run |
| `track/a3-backend`, `infra/ci-fixes` | Worker branches |
| `reconciled` | **What this checkout is on right now** (`60c2841`) |

### The worktrees — verified live

```
C:\Users\ahmed\Desktop\MOP_Product_Platform_v11_9_...   60c2841  [reconciled]
E:\mop-fleet\w-a3                                       330927e  [track/a3-backend]
E:\mop-fleet\w-infra                                    3320bdd  [infra/ci-fixes]
E:\mop-fleet\w-int                                      60c2841  [develop]
```

**All four share one object database.** A branch checked out in one worktree cannot be checked out in another — git refuses. `git worktree list` is the fastest way to see who is where.

### The rules, enforced by `E:\mop-fleet\harness\mop-push.ps1`

That script is *the only sanctioned way to push a fleet branch*, and it refuses two things before doing anything else:

1. **Pushing to `main` or `master`.** `main` advances **by merge from `develop` after a full green gate**, never by a direct push.
2. **Any force flag** — `--force`, `-f`, **and `--force-with-lease`**. Rewriting a branch another worker has rebased onto loses their work silently.

> If a situation genuinely needs a force push, that is a decision recorded in `E:\mop-fleet\board\decisions.md` and a human running git directly — not a flag on the script.

### Integration

`E:\mop-fleet\harness\integrate.ps1` checks whether a track branch can merge into `develop`, cheapest failure first, and **every check is read-only**:

1. the branch exists and has something to integrate
2. **claims / hotspot** — does it touch files another worker has an active claim on?
3. **migration lock** — if it changes the Prisma schema or the migration chain, does it hold `board/claims/migrations.lock`?
4. **merge** — would merging conflict? (computed with `git merge-tree --write-tree`, so no ref moves and no clean tree is needed)

Passing all four is a statement about **mergeability, not correctness** — the full gate still decides whether the result may land. `-Apply` performs the merge and refuses unless every check passed.

### Migration ordering

Migration history is **immutable** — never reordered, renamed, or edited after it has run anywhere. Because several branches can each add a migration, **a branch that touches the schema or the migration chain must hold `board/claims/migrations.lock`** before integrating. That is check 3 above, and it exists to stop two workers creating sibling migrations that cannot be linearised.

### How to avoid working against stale branches or another agent's work

```bash
# 1. Always start by asking where you are. It may not be where you left it.
git -c safe.directory="$(pwd)" status -sb
git -c safe.directory="$(pwd)" worktree list

# 2. Confirm your branch is not behind
git -c safe.directory="$(pwd)" fetch origin
git -c safe.directory="$(pwd)" log --oneline HEAD..origin/$(git rev-parse --abbrev-ref HEAD)

# 3. Before touching the schema, check the migration lock
ls /e/mop-fleet/board/claims/

# 4. Before editing a hot file, check the claims board
cat /e/mop-fleet/board/current-wave.md
```

**Never** run `git checkout`/`switch` in a worktree another agent is using, and **never** `git reset --hard` a shared branch.

### ⚠️ This is not hypothetical — it happened during this session

While this runbook was being written, **the checkout under `C:\Users\ahmed\Desktop\MOP_...` was switched by another process** from `main` @ `4298d25` to a new branch `reconciled` @ `60c2841`.

Consequences observed and verified:

- The 262 KB master dossier committed earlier in this session at `5308b53` **is not on the current branch** — `git merge-base --is-ancestor 5308b53 HEAD` returns false. The root `README.md` on disk reverted to a 7.5 KB earlier version.
- The commit is **not lost**: `git cat-file -t 5308b53` returns `commit`, and `git show 5308b53:README.md` still yields all 268,012 bytes. It remains on `main`.
- `docs/corpus/` (41 files) is present in the working tree as **staged additions**, not as committed files on this branch.

**The lesson, and the rule:** *check `git status -sb` and `git log --oneline -3` at the start of every session and before every commit.* A checkout you left on one branch may be on another when you return.

---

## §14. Database recovery

### 14.1 Normal restart

```bash
bash /e/mop-fleet/harness/pg-stop.sh && bash /e/mop-fleet/harness/pg-start.sh
corepack pnpm run doctor
```

### 14.2 Backup before anything risky

```bash
bash tools/staging/backup.sh mop_platform_dev /e/mop-fleet/backups
```
See §17.

### 14.3 Restore

```bash
# Verify a dump into a THROWAWAY database first — never straight over a live one
bash tools/staging/restore-drill.sh /e/mop-fleet/backups/<file>.dump mop_restore_drill
```

⚠️ **Restoring over a live database is destructive.** Do it deliberately:
```bash
export PGBIN=/e/mop-fleet/pg/pgsql/bin
export PGPASSWORD=mop_dev_secret
"$PGBIN/pg_restore.exe" -h 127.0.0.1 -U mop_dev -d mop_platform_dev --clean --if-exists --exit-on-error <file>.dump
```

### 14.4 Development reset — ⚠️ DESTRUCTIVE

```bash
corepack pnpm db:reset      # drops, re-migrates, re-seeds. ALL local data is gone
corepack pnpm db:seed:demo  # optional: put the demo data back
```
Use it when migrations have diverged from your local data and you do not care about that data. **Back up first if you are unsure.**

### 14.5 Migration recovery

| Situation | Do |
|---|---|
| A migration failed halfway | Read the error — it names the SQL. Fix the migration **only if it has never run anywhere else**; otherwise write a new one |
| Prisma reports drift | `corepack pnpm --filter @mop/database run validate`, then `db:deploy`. If the local database is disposable, `db:reset` |
| Integration tests fail with a confusing 500 after a migration | **`corepack pnpm db:test:prepare`.** This is the single most common cause |
| The generated client is stale | `corepack pnpm db:generate`. `doctor` flags this as *"Prisma client — generated before the current schema"* |

### 14.6 Scratch database cleanup

```bash
export PGBIN=/e/mop-fleet/pg/pgsql/bin
PGPASSWORD=mop_dev_secret "$PGBIN/psql.exe" -h 127.0.0.1 -U mop_dev -d postgres -c "\l"
PGPASSWORD=mop_dev_secret "$PGBIN/dropdb.exe" -h 127.0.0.1 -U mop_dev mop_restore_drill   # ⚠️ destructive
```
`mop_restore_drill` and `mop_test_w3` are scratch. **`mop_platform_dev`, `mop_platform_test`, `mop_platform_staging` and `mop_dev_int` are not.**

### 14.7 If PostgreSQL will not start

```bash
tail -40 /e/mop-fleet/pg/log/postgres.log
```

| Log says | Cause | Fix |
|---|---|---|
| `could not bind IPv4 address ... Address already in use` | Already running, or another Postgres | `netstat -ano \| grep ":5432"` — it may already be up; `pg_isready` confirms |
| `database system was not properly shut down; automatic recovery in progress` | Unclean stop | Usually recovers on its own. Wait, then `pg_isready` |
| `lock file "postmaster.pid" already exists` | Stale PID from a crash | Confirm no `postgres.exe` is running, then remove `E:\mop-fleet\pg\data\postmaster.pid` and start again |
| `data directory ... has wrong ownership/permissions` | File-permission damage | Beyond this runbook — restore from backup into a fresh cluster |

---

## §15. Troubleshooting

| Symptom | Likely cause | Check | Fix |
|---|---|---|---|
| `pnpm: command not found` | pnpm is not on PATH — by design | `corepack --version` | `export PATH="/c/Program Files/nodejs:$PATH"` then use **`corepack pnpm`** |
| `pnpm doctor` prints pnpm's own diagnostics | You hit pnpm's **built-in**, which shadows the project script | — | Use **`corepack pnpm run doctor`** |
| `pnpm install` finishes instantly, nothing installed | Interactive prompt — **no-ops and still exits 0** | `ls node_modules` | **`CI=true corepack pnpm install`** |
| `fatal: detected dubious ownership` | Folder owned by another Windows account | `git status` | `git config --global --add safe.directory "<repo path>"`, or prefix `git -c safe.directory="$(pwd)"` |
| doctor: **Workspace symlinks do not resolve inside the repo** | The folder was copied between accounts/paths; pnpm symlinks point at the old absolute path | `corepack pnpm run doctor` | Delete every `node_modules`, then `CI=true corepack pnpm install` |
| doctor: **Prisma client generated before the current schema** | Schema changed, client not regenerated | `corepack pnpm run doctor` | `corepack pnpm db:generate` |
| doctor: **Postgres not accepting connections on 5432** | Database not started — **it does not survive a reboot** | `pg_isready` | `bash /e/mop-fleet/harness/pg-start.sh`, or `docker compose up -d` |
| doctor: **.env missing / DATABASE_URL not set** | No local `.env` | `cat .env` | `cp .env.example .env` |
| API exits immediately, code **78** | Boot-time environment validation refused the config | Read the log — it lists every problem by name | Fix the named variable. In production `CORS_ORIGIN` must be `https://` and not `*` |
| `Environment variable not found: DATABASE_URL` from a Prisma command | Prisma resolves `.env` next to the **schema**, not the repo root | — | Use the root scripts (`corepack pnpm db:deploy`), which wrap `tools/with-env.mjs`. Never call `prisma` directly from `packages/database` |
| `EADDRINUSE :4000` | An API is already running | `netstat -ano \| grep ":4000"` | `taskkill //PID <pid> //F`, or reuse the running one |
| `EADDRINUSE :4200` | A web dev server is already running | `netstat -ano \| grep ":4200"` | Same |
| Browser loads, every API call 404s | Web dev server up, **API not on 4000** | `curl http://localhost:4000/api/v1/health` | Start the API. The proxy targets 4000 specifically |
| Browser API calls fail, `curl :4000` works | Proxy or dev server problem, not the API | `curl http://localhost:4200/api/v1/health` | Restart the web dev server |
| CORS error in the browser console | You are hitting `:4000` directly from a page served on `:4200` | — | Use the proxy (relative `/api/...`). To hit 4000 directly, set `CORS_ORIGIN` |
| Logged in, then 401s everywhere | Cookie not sent | DevTools → Application → Cookies | Use `http://localhost:4200`, not `127.0.0.1` — cookies are host-scoped. In production the cookie is `Secure` and needs HTTPS |
| Session drops after ~20 minutes | Access token TTL | — | The refresh interceptor should renew it silently; if it does not, sign in again and report it |
| `429 Too Many Requests` on login | Auth throttle — 10/min by default | — | Wait, or raise `THROTTLE_AUTH_LIMIT` **for tests only** |
| Integration tests fail with a confusing 500 after a migration | Test database missing the new table | — | **`corepack pnpm db:test:prepare`** |
| Integration tests mutate your dev data | `DATABASE_URL` inherited the dev URL | `echo $DATABASE_URL` | Export the **test** URL before running tests (§10) |
| `Cannot find module '@mop/shared'` | `packages/shared` not built | `ls packages/shared/dist` | `corepack pnpm build:shared` |
| A new `@mop/shared` export is invisible to the API typecheck | Stale `dist` | — | `corepack pnpm build:shared` |
| `docker: command not found` | **Docker is not installed on this machine** | `docker --version` | Use `pg-start.sh` (§5.1). Docker is optional here |
| Web build/test fails on Node version | Angular 22 needs Node ≥ 22.22.3 / ≥ 24 | `node --version` | Install Node 24 (`.nvmrc`) |
| `pnpm typecheck` passes but the web build fails | **`typecheck` covers shared + api only** — `apps/web` has no typecheck script | — | Run `corepack pnpm build` |
| Lint fails on `lint-dead-links` | A static Angular `routerLink` points at a route that does not exist, or opens a held-back surface | Read the reported link | Fix the link, or the route. (It checks routerLinks, **not** markdown links) |
| Lint fails on `lint-audit-boundary` | An `AuditLog` write outside `apps/api/src/audit/**` | — | Route it through `AuditService` |
| Lint fails on `lint-money` | A money value crossing the API as a number | — | Money is a **string** across the API |
| Lint fails on `lint-directional-css` | `margin-left` / `padding-right` etc. | — | Use logical properties (`margin-inline-start`) |
| Your branch is not what you left it on | **Another agent switched the checkout** | `git status -sb && git worktree list` | See §13 |
| A file you wrote has reverted | Concurrent agent write, or a branch switch | `git log --oneline -3 -- <file>` | The commit is usually still reachable — `git show <sha>:<path>` |
| `git checkout` refuses: *branch is already checked out* | It is checked out in another **worktree** | `git worktree list` | Work in that worktree, or use a different branch |
| Scheduler heartbeat is `null` in `/health` | The scheduler has not run yet, or is stuck | `curl .../health` twice, a minute apart | If it stays `null`, restart the API |
| Everything is odd and nothing above fits | — | **`corepack pnpm run doctor`** | It checks every environment failure this project has actually hit and prints the fix for each |

---

## §16. Health and observability

### The health endpoint

```bash
curl http://localhost:4000/api/v1/health
```
```json
{"status":"ok","database":"connected","schedulerLastHeartbeatAt":"2026-09-02T18:49:00.012Z"}
```

| Field | Healthy | Meaning |
|---|---|---|
| `status` | `"ok"` | The process answered |
| `database` | `"connected"` | A real `SELECT 1` succeeded — not a cached flag |
| `schedulerLastHeartbeatAt` | a recent ISO timestamp | **The scheduler is actually running.** A stuck or crashed scheduler leaves this stale — that is the point of exposing it |

A failing database makes the request throw, so the endpoint returns an error rather than `status: "ok"` with a lie in it.

### Correlation ids

**Every request and every response carries `x-request-id`** (verified live). An inbound id is honoured so a trace survives a proxy hop; otherwise a UUID is generated.

```bash
curl -D - -o /dev/null http://localhost:4000/api/v1/health | grep -i x-request-id
```

### Logs

`apps/api/src/runtime/http/access-log.middleware.ts` logs **one line per request**, on `finish` so it carries the status and duration:

```
[Nest] ... LOG [HTTP] GET /api/v1/branch-manager/attention 200 41.3ms rid=11767dbd-040b-4605-91de-669faa2df203
```

- **Where they appear:** stdout of the API process — your terminal in dev.
- **`/api/v1/health` is deliberately excluded**, so a load balancer polling it cannot drown every real line.
- **A 500 carries the same id** in `ApiExceptionFilter`'s log line — so a user reporting an error can hand you the id from the response header and you can find the exact request.

### Diagnosing a failed request

1. Get `x-request-id` from the response headers.
2. `grep rid=<that-id>` in the API output — one line gives you method, path, status and duration.
3. For a 500, the filter's line for the same id carries the error.
4. If the API is unreachable at all, check `/health`, then `doctor`, then the Postgres log.

### What does not exist

🔴 No metrics endpoint, no tracing exporter, no log aggregation, no alerting, and **no external uptime probe** — the last one needs somewhere to probe from, which this environment does not have.

---

## §17. Backups

**Real, scripted, in the repository, and the restore drill has actually been executed.**

### Taking a backup

```bash
bash tools/staging/backup.sh [database] [destination]
bash tools/staging/backup.sh mop_platform_dev /e/mop-fleet/backups     # explicit
bash tools/staging/backup.sh                                            # defaults to the same
```

- **Format:** custom (`pg_dump -Fc`) so `pg_restore` can rebuild selectively.
- **Naming:** `<db>-<UTC timestamp>.dump` — UTC deliberately, because a backup named in shifting local time cannot be ordered correctly across a daylight-saving boundary.
- **Checksum:** a `.sha256` written **beside** the dump — a checksum stored elsewhere goes missing separately.
- **Refusal:** anything under 1 KB is **refused** — *"refusing to call that a backup"*, exit 1.
- **Destination default:** `E:/mop-fleet/backups` (override with the second argument or `PGBIN`/`PG*` variables).

**Existing backup on this machine (verified):** `mop_platform_dev-20260902T002434Z.dump` with its `.sha256`.

### Restoring — the drill

```bash
bash tools/staging/restore-drill.sh <dump-file> [scratch-db]
bash tools/staging/restore-drill.sh /e/mop-fleet/backups/mop_platform_dev-20260902T002434Z.dump mop_restore_drill
```

It verifies the checksum, **drops and rebuilds a throwaway database** with `--exit-on-error`, times the restore, and then checks the restored copy **holds a real workshop** — tables, tenants, accounts and migration history. *Schema alone is not a restore: a dump that rebuilt 78 empty tables would satisfy every other check.*

**Executed 2026-09-02 (recorded in `tools/staging/README.md`):** 78 tables, 2 tenants, 16 accounts, 20 work orders, 31 migrations, **restored in 2 seconds**.

All three refusals were watched rather than assumed: a truncated dump fails the checksum and exits 1; a backup of an empty database is refused at 837 bytes; a schema-only dump restores cleanly and is **still failed** for having no tenants, no accounts and no migration history.

⚠️ `restore-drill.sh` **drops its scratch database**. Never point it at anything you care about.

### What is automated, and what is not

| | Status |
|---|---|
| Taking a dump | ✅ Scripted |
| Checksum | ✅ Automatic |
| Restore verification | ✅ Scripted, **and executed** |
| **Scheduling / cron** | 🔴 **None.** Every backup is run by hand |
| **Rotation** | 🔴 None — old dumps accumulate |
| **Encryption** | 🔴 None |
| **Offsite copy** | 🔴 None |

**There is no nightly automation.** Scheduling and somewhere to put the dumps both need a host this environment does not have.

---

## §18. Docker, staging, and deployment

### 18.1 Docker — ⚠️ UNVERIFIED

Two Dockerfiles exist: `apps/api/Dockerfile` and `apps/web/Dockerfile` (+ `nginx.conf`).

**Neither has ever been built.** The Dockerfile says so itself: *"this Dockerfile was written and reasoned through carefully but NOT build-verified — the environment this was authored in has no Docker daemon reachable."* Confirmed independently in this session: `docker: command not found`.

**Build from the repository root**, not from the app directory — the workspace's other packages are dependencies and must be in the build context:

```bash
docker build -f apps/api/Dockerfile -t mop-api .      # UNVERIFIED
docker build -f apps/web/Dockerfile -t mop-web .      # UNVERIFIED
```

The API image uses `pnpm deploy` deliberately rather than copying `node_modules` between stages: pnpm's layout is symlinked into a content-addressed store, and copying it naively produces dangling symlinks that resolve on the builder and not in the runtime image.

**Treat the first real `docker build` as the actual test, not a formality.**

`docker-compose.yml` covers **PostgreSQL only** — it does not run the API or the web app.

### 18.2 LAN staging rehearsal — real, and documented in the repository

`tools/staging/` contains a working TLS edge and a smoke suite. Full instructions: [`../tools/staging/README.md`](../tools/staging/README.md). Summary:

```bash
# 1. A certificate (never committed)
openssl req -x509 -newkey rsa:2048 -nodes -days 90 \
  -keyout tools/staging/certs/staging-key.pem \
  -out   tools/staging/certs/staging-cert.pem \
  -subj "/CN=mop-staging.local" \
  -addext "subjectAltName=DNS:mop-staging.local,DNS:localhost,IP:<your-lan-ip>,IP:127.0.0.1"

# 2. Its own database — never the dev one
export DATABASE_URL="postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_staging?schema=public"
corepack pnpm db:deploy && corepack pnpm db:seed

# 3. The built API in production mode
corepack pnpm build
NODE_ENV=production PORT=4100 CORS_ORIGIN="https://<your-lan-ip>:8443" node apps/api/dist/main.js

# 4. The TLS edge
node tools/staging/edge.mjs --port 8443 --api http://127.0.0.1:4100 \
  --web apps/web/dist/web/browser --cert tools/staging/certs

# 5. The smoke suite, across the network
node tools/staging/smoke.mjs --origin https://<your-lan-ip>:8443 --insecure
```

**TLS is not optional here, even for a rehearsal.** The API refuses to start in production unless `CORS_ORIGIN` is `https://`, because the session cookie's `Secure` flag comes from `NODE_ENV` — an API in production mode behind plain HTTP issues cookies the browser will then decline to send. `--insecure` accepts the self-signed certificate; **against a real deployment it must be omitted**, or *"TLS works"* and *"something answered"* become the same result.

**A green run proves:** TLS terminates · the API answers from a live database · the scheduler is running on the deployed process · every response carries a correlation id · the built bundle is served (not a dev server) · a real account signs in through the edge · the cookie comes back `Secure; HttpOnly; SameSite=Lax` · the session survives the proxy hop · an anonymous request is refused.

**It does not prove:** any of a VPS, public DNS, a real certificate authority, a process supervisor, automated redeploy, offsite or scheduled backups, or edge rate limiting. A browser will refuse the self-signed certificate outright, so **the journey cannot be walked by hand here** — the smoke suite is the evidence.

**UNVERIFIED in this session** — read, not executed.

### 18.3 Production

🔴 **There is no production deployment, and no host to deploy to.** No VPS, no DNS, no CA-issued certificate, no process supervisor, no CD pipeline. Deployment beyond the image build and the LAN rehearsal is out of reach of this repository and of this machine.

---

## §19. Development vs staging vs production

| Concern | Local development | LAN staging rehearsal | Production |
|---|---|---|---|
| **Database** | `mop_platform_dev` on localhost | `mop_platform_staging`, same server, **separate database** | 🔴 Does not exist |
| **Credentials** | `mop_dev` / `mop_dev_secret`, committed in `.env.example` | Same dev credentials — it is a rehearsal, not a secure environment | 🔴 Would need real secrets, never committed |
| **`NODE_ENV`** | `development` | **`production`** | `production` |
| **TLS** | None — plain HTTP on 4200/4000 | **Required.** Self-signed via `edge.mjs` on 8443 | Would need a CA certificate |
| **Session cookie** | Not `Secure` | **`Secure; HttpOnly; SameSite=Lax`** | Same, over real TLS |
| **`CORS_ORIGIN`** | `http://localhost:4200` (default) | `https://<lan-ip>:8443` | Must be `https://`, never `*` — **boot refuses otherwise** |
| **Frontend** | Angular dev server with HMR + `/api` proxy | **Built bundle** served by the edge | Built bundle |
| **Logging** | stdout in your terminal | stdout of the API process | 🔴 No aggregation anywhere |
| **Backups** | Manual `backup.sh`; drill executed | Same | 🔴 No schedule, rotation, encryption or offsite |
| **CI** | — | — | GitHub Actions runs the full gate on every push/PR to `main` |
| **Monitoring** | `/health` by hand | `smoke.mjs` across the network | 🔴 No external probe |
| **Seed data** | `db:seed` + `db:seed:demo`, known credentials | `db:seed` only | 🔴 Would need a real pilot tenant, no fabricated history |
| **Deployment** | `pnpm dev` | Manual, five commands | 🔴 None |
| **Security posture** | Throttling on, scrypt hashing, deny-by-default authorization | Same + TLS + Secure cookies | Would additionally need secret management, a WAF/edge rate limit, and a pen test |
| **Data safety** | Disposable — `db:reset` freely | Disposable | Would need PITR, rotation, offsite |

---

## §20. What this runbook does not guarantee

Honest limits, each supported by something checked in this session.

1. **Docker is not installed on this machine.** Every Docker instruction here is the portable path for *another* machine. Both Dockerfiles are **UNVERIFIED — never built**.
2. **PostgreSQL startup depends on files outside the repository.** `E:\mop-fleet\harness\pg-start.sh` and the whole `E:\mop-fleet\pg` install ship with no clone. On a fresh machine you must use Docker or install PostgreSQL 16 yourself.
3. **The database does not survive a reboot** on this machine, and nothing restarts it automatically.
4. **There is no production environment and no host** — no VPS, DNS, CA certificate, supervisor or CD.
5. **There is no external uptime check.** `/health` is only ever polled by hand.
6. **Backups are manual.** No cron, rotation, encryption or offsite copy.
7. **There is no browser or end-to-end test suite, and no "Honesty Harness" in this repository.** The HTTP walkthrough specs are the closest equivalent and prove the API path only.
8. **A blocked work order cannot be finished through the product** — `resolveBlocker` has no HTTP route and `no_open_blocker` is a core Finish gate. `markArrived` and `resolveRejectedReturn` are likewise unrouted.
9. **No country billing adapter exists**, so no tenant can legally invoice in a regulated market. The launch profile works around this with `BILLING=EXTERNAL`.
10. **The Arabic translation pass was never done.** The RTL mechanism is lint-enforced; the strings are not translated.
11. **This repository is edited concurrently by several agents**, and the checkout was switched mid-session while this was being written (§13). Anything here can be made stale by a branch switch you did not perform.
12. **Not executed in this session:** `pnpm dev`, the test suites, `db:reset`, the backup and restore scripts, the staging edge, both Docker builds. Everything else was run and its real output is quoted.

---

## §21. Documentation says / repository does

Where existing documentation and the repository disagree, both are stated. **The repository wins.**

### 1. How PostgreSQL is started

> **DOCUMENTATION SAYS** — `CLAUDE.md`: *"Docker — Docker Desktop must be running; `docker compose up -d` for Postgres."* Root `README.md` getting-started: `docker compose up -d && corepack pnpm db:generate && ...`.
>
> **REPOSITORY / MACHINE DOES** — `docker: command not found`. PostgreSQL 16.4 runs from a user-space install at `E:\mop-fleet\pg`, started by `E:\mop-fleet\harness\pg-start.sh`, which is **not in the repository**. `tools/staging/README.md` states plainly: *"This machine has no Docker and no administrator rights."*
>
> **THIS RUNBOOK SAYS** — On this machine use `pg-start.sh` (§5.1). On any other machine use `docker compose up -d` (§5.2). Both give the same database on 5432; only the startup differs. `docker-compose.yml` is a real, correct file — it simply cannot run here.

### 2. What the README status block claims

> **DOCUMENTATION SAYS** — the root `README.md` status block (2026-09-02) points at [`docs/LAUNCH_HANDOVER.md`](./LAUNCH_HANDOVER.md) as the first thing to read, and describes `PAGE_INVENTORY.md` and `PHASE_MAP.md` as the fuller *pre-sprint* picture.
>
> **REPOSITORY DOES** — that is accurate on this branch. `docs/PAGE_INVENTORY.md` records 47 complete, 6 partial, 0 unbuilt of 53 pages and remains the canonical per-page tracker.
>
> **THIS RUNBOOK SAYS** — No contradiction here **on this branch**. Note, though, that this README has changed twice during this session as branches moved (§13); an older version carried a stale *"44 of 53 pages… 3 have no implementation"* claim. If you see that wording, you are on an older branch.

### 3. Where the golden journey is proven

> **DOCUMENTATION SAYS** — earlier documents describe the golden journey as service-level only, with no HTTP proof.
>
> **REPOSITORY DOES** — `apps/api/src/testing/` contains four **HTTP-level** specs — `walkthrough.http.spec.ts`, `parts-loop.http.spec.ts`, `decision-deadlock.http.spec.ts`, `walkthrough-contrast.http.spec.ts` — run through real guards against real Postgres.
>
> **THIS RUNBOOK SAYS** — The HTTP walkthrough is real and is the acceptance evidence (§10). There is still no **browser** test.

### 4. Backups

> **DOCUMENTATION SAYS** — the launch scope lists backups (M-10) as *"nightly dump + one scripted restore drill"*.
>
> **REPOSITORY DOES** — `tools/staging/backup.sh` and `restore-drill.sh` exist and the drill **has been executed** (78 tables, 2 tenants, 16 accounts, 31 migrations, 2 seconds). **There is no nightly schedule** — `backup.sh` says so itself.
>
> **THIS RUNBOOK SAYS** — Backup and restore are real and scripted; **scheduling is not** (§17).

### 5. The state of this checkout

> **DOCUMENTATION SAYS** — `CLAUDE.md` and `docs/README.md` describe `main` as the working branch.
>
> **REPOSITORY DOES** — this checkout is on **`reconciled` @ `60c2841`**, one of four worktrees, and it was switched **during this session** by another process.
>
> **THIS RUNBOOK SAYS** — Always start with `git status -sb` and `git worktree list` (§13). Do not assume the branch you left is the branch you have.

---

## Where to go next

| You want | Read |
|---|---|
| What MOP is and how it is built | [`docs/README.md`](./README.md) → the documentation index |
| Setup detail and troubleshooting history | [`docs/DEVELOPMENT.md`](./DEVELOPMENT.md) |
| "Where do I change X?" | [`CODE_MAP.md`](../CODE_MAP.md) |
| Per-page build status (canonical) | [`docs/PAGE_INVENTORY.md`](./PAGE_INVENTORY.md) |
| What is deliberately not built | [`docs/LAUNCH_HANDOVER.md`](./LAUNCH_HANDOVER.md) |
| Staging, backups, restore drill | [`tools/staging/README.md`](../tools/staging/README.md) |
| Commit conventions | [`CONTRIBUTING.md`](../CONTRIBUTING.md) |
