# Phase 1 — Runnable and Provable

> **Goal:** anyone can clone this repository, run it, and trust the result — automatically, on every push.
> **Why first:** the DB integration tests have never executed on this machine, CI has never run, and the environment has already broken once badly enough that nothing could build at all. Every later phase is verified by this machinery. If it is unreliable, so is everything built on it.
> **Size:** small. Days, not weeks. None of it is speculative.
> **Detail level:** this is the working spec. Each task states what to do, why, and how it is known to be done.

---

## Task 1.1 — Reproducible environment

**The problem.** Every `node_modules` symlink pointed at `C:\Users\Stanikzai\...` after the project folder was copied between Windows accounts. Nothing could build, typecheck, test, or run. The repository folder is literally named `..._Pnpm_Install_Root_Fix_...`, so this has bitten before. It will bite again on the next machine.

**Work:**

1. **`docs/DEVELOPMENT.md`** — prerequisites (Node 20+, corepack, Docker), first-run sequence, and the three environment traps found so far, each stated plainly:
   - `pnpm install` must run as `CI=true pnpm install` — the plain form hits an interactive "modules directories will be removed, proceed?" prompt, no-ops, and **still exits 0**, which makes it look like it worked.
   - `pnpm` may not be on `PATH`; `corepack pnpm` is the supported invocation.
   - Git may refuse the repository with "dubious ownership" if the folder was copied between accounts — `git config --global --add safe.directory <path>`.
2. **`.nvmrc`** pinned to match `engines.node`.
3. **Fix the root scripts.** `db:generate`, `build`, `test`, `lint`, `typecheck` all shell out to a nested bare `pnpm` and fail when pnpm is only reachable through corepack. They must work under both.
4. **`pnpm doctor`** — one command that checks: Node version matches `.nvmrc`; a workspace symlink resolves; Postgres answers; the generated Prisma client matches `schema.prisma`; `.env` is present and parseable. Every failure mode encountered so far, caught in one command with a plain-language fix.

**Done when:** a clean clone reaches green tests following `DEVELOPMENT.md` alone, with no undocumented step.

---

## Task 1.2 — Verify the database path end-to-end

**The problem.** The integration tests — covering auth, the access layers, and operation events, the three most load-bearing parts of the API — have never run here. Docker is not up. They are the only tests in the project that touch real Postgres, and mocked databases prove nothing about constraints, transactions, or cascades.

**Work:**

1. `docker compose up -d`, confirm health.
2. `prisma migrate deploy` against an **empty** database — proving the migration chain works from zero, not just from the current dev state.
3. Run the seed.
4. **Rewrite the seed to produce at least two tenants with different capability profiles** — e.g. one `MULTI_BRANCH_FULL_SERVICE` and one `SINGLE_BAY_QUICK_SERVICE`. This is not cosmetic:
   - A single-tenant seed makes tenant-isolation bugs *invisible* — there is no second tenant to leak from.
   - It leaves configurability untested by construction, which is the product's core claim.
5. Run the full integration suite; fix what fails.

**Done when:** `pnpm test` passes in full, integration tests included, against a database seeded from scratch.

---

## Task 1.3 — CI green on a real push

**The problem.** `.github/workflows/ci.yml` is well-built — real Postgres service, migrate, lint, typecheck, test, build — and has never executed once. Until it runs, it is a hypothesis.

**Work:** push to `origin/main`, watch the first run, fix what breaks. Expect breakage: CI runs on Linux with a cold cache and `--frozen-lockfile`, none of which has been exercised.

**Blocked on:** the push itself. Git Credential Manager is broken on this machine and there is no SSH key, so this needs the repository owner's own terminal.

**Done when:** a green run exists on a real commit.

---

## Task 1.4 — API security baseline

**The problem.** `main.ts` sets a global prefix, CORS, cookie-parser, a global exception filter, and a strict `ValidationPipe` (`whitelist` + `forbidNonWhitelisted`, which correctly closes mass-assignment). It has nothing else.

**Ordered by real exposure:**

1. **Rate limiting — the urgent one.** Password hashing is scrypt at `N=131072`: roughly **128MB of memory and significant CPU per attempt**. That is excellent against offline cracking and a gift to an online attacker — a few dozen concurrent login attempts exhaust the server. **Strong hashing without throttling converts credential-stuffing into denial-of-service.** Needs per-IP and per-account throttling on `/auth/login`, `/auth/refresh`, and the public decision-link endpoints.
2. **Boot-time config validation.** `cookie.util.ts` sets `secure: process.env.NODE_ENV === "production"`. If that variable is ever unset or misspelled in production, session cookies silently begin travelling over plain HTTP. The app must refuse to start rather than infer this.
3. **Helmet** — CSP, HSTS, `X-Content-Type-Options`, frame-ancestors.
4. **Body size limits** — Express defaults are generous; inspection payloads with photos need explicit, much smaller caps.
5. **Request IDs** — without a correlation id, "it failed around 3pm" is unresolvable across replicas.
6. **Graceful shutdown** — in-flight transactions must finish before a replica dies mid-deploy.
7. **Structured JSON logging** with `requestId` / `tenantId` / `actorId`, and **never** customer names, phone numbers, plate numbers, or decision tokens.

**Also decide (not necessarily implement):** `sameSite: lax` requires web and API to be same-site in production. `app.mop.com` + `api.mop.com` under `mop.com` works; separate registrable domains do not. Settle it now rather than discover it through broken logins at launch.

**Done when:** each item is present with a test, and the login endpoint has a test proving throttling engages.

---

## Task 1.5 — Systematic money serialization

**The problem.** Prisma returns `Decimal` objects. `JSON.stringify` on one produces something unhelpful, and converting to `number` silently destroys precision at scale. Today `workshops.service.ts` correctly calls `.toString()` — at three call sites, by hand. The fourth endpoint someone writes will forget.

**Work:** one serialization rule applied at the DTO/interceptor boundary so a future endpoint cannot get it wrong, plus a test asserting money reaches the client as a string.

**The rule:** *a money value that arrives in the browser as a JavaScript number is a bug, regardless of whether it looks right.*

---

## Task 1.6 — Permission resolver caching

**The problem, measured.** Five of the eight permission layers each issue their own Prisma query per `can()` call — `PlatformControl`, `PlanEntitlement`, `RolePermissionTemplate`, `UserOverride`, `WorkshopConfiguration`. There is no caching anywhere in `apps/api/src/access/`. A page checking ten permissions costs **fifty round-trips**, on the hottest path in the entire system.

**Work:**

1. **Per-request resolver context.** Load the tenant's control settings, plan, role template, user overrides and configuration **once per request**; resolve every key against that in-memory snapshot. Layer ordering and the `locked` short-circuit are untouched — only the data source changes.
2. **Batch the page-load case** — ask once for many keys, receive a map.
3. Optional short-TTL cache for slow-moving data, with one hard rule: **anything that revokes access bypasses the cache.** A tenant freeze or a removed permission takes effect immediately. Stale *denial* is acceptable; stale *permission* is a breach.

**Constraint:** the resolver is currently correct. Optimising it must not become an opportunity to quietly simplify the layer model. The existing layer tests must pass unchanged.

**Done when:** a request resolving N permissions issues a constant number of queries, proven by a test that counts them.

---

## Task 1.7 — i18n and RTL foundation

**The problem.** There is **no internationalisation or right-to-left provision anywhere** in the codebase, in a product whose primary market works in Arabic. Retrofitting RTL after six phases of UI touches every component's stylesheet, every directional icon, and every layout assumption.

**This is the cheapest moment this will ever be.** There are currently 8 web components. In Phase 6 there will be dozens.

**Work — foundation only, no translation yet:**

1. **CSS logical properties everywhere.** `margin-inline-start`, `padding-inline-end`, `border-inline-start` — never `left`/`right`. Costs nothing if the direction never flips, and handles most of RTL automatically when it does. Retrofit the existing 8 components now while it is an afternoon.
2. **`dir` set once on `<html>`**, driven by locale. No component ever hardcodes direction.
3. **String extraction from the first component.** Every user-facing string goes through a translation layer even while there is only one locale. Extracting strings later is mechanical, enormous, and always gets skipped.
4. **Directional icons mirror; non-directional icons must not.** A "next" arrow flips; a wrench does not. A property of the icon component, decided once.
5. **Bidi isolation — the real trap.** Plate numbers, VINs, SKUs and invoice numbers are Latin/numeric strings embedded in Arabic sentences. Without `unicode-bidi: isolate` (or `<bdi>`) they render **in visibly wrong order**. A plate number displayed backwards on a work order is an operational error, not a cosmetic one.
6. **Locale-aware formatting** for numbers, dates and currency, driven by the existing `Tenant.currency` / `Tenant.timezone` fields. Formatting is rendering; the stored value never changes.

**Explicitly out of scope:** actual Arabic translation. That is Phase 14, and it is cheap *because* of this task.

**Done when:** a lint rule or review check rejects `margin-left`/`padding-right` in component CSS; flipping `dir="rtl"` produces a correctly mirrored layout with plate numbers still reading correctly.

---

## Phase 1 exit criteria

1. A clean clone reaches green tests from `DEVELOPMENT.md` alone.
2. `pnpm test` passes in full, including DB integration tests, seeded with two differently-shaped tenants.
3. CI is green on a real push.
4. `pnpm doctor` catches every environment failure mode encountered so far.
5. Rate limiting is active and tested on the auth endpoints.
6. Money reaches clients as strings, enforced at the boundary and tested.
7. Permission resolution issues a constant number of queries per request, proven by a test.
8. `dir="rtl"` produces a correctly mirrored layout; no directional CSS remains in components.

## What Phase 1 deliberately does not do

No page is built. No business feature ships. Every task removes a risk that would otherwise compound through all thirteen remaining phases — and three of them (1.6, 1.7, and the seed rewrite in 1.2) are cheap **only** because the lifecycle and the role pages do not exist yet.

---

**Related:** [`../PHASE_MAP.md`](../PHASE_MAP.md) · [`../INFRASTRUCTURE.md`](../INFRASTRUCTURE.md) · [`../DATABASE_STRATEGY.md`](../DATABASE_STRATEGY.md) · [`../UX_PRINCIPLES.md`](../UX_PRINCIPLES.md)
