# Infrastructure, Servers, and Operations — Measures and Precautions

> **Scope:** how MOP runs outside a developer's laptop — topology, security posture, sessions, realtime, files, observability, backups, scale.
> **Status of each item:** `DONE` = in the code today · `PARTIAL` = exists but incomplete · `TODO` = decided, not yet built.
> **Date:** 2026-08-08.

---

## 1. Environments

Four, with one non-negotiable property each.

| Environment | Property that matters |
|---|---|
| **Local** | Reproducible from a clean clone by following `DEVELOPMENT.md` alone. Today this is false — see `REBUILD_PLAN.md` item 0.2 |
| **CI** | Real Postgres, migrations applied from scratch, every test run (`DONE` — `.github/workflows/ci.yml`, though it has never actually executed) |
| **Staging** | **Multi-tenant, with at least two differently-configured tenants and realistic data volume.** A single-tenant staging environment cannot catch isolation or configurability bugs — which are precisely this product's two highest-consequence failure classes |
| **Production** | Nothing manual. Every change arrives through the same pipeline |

## 2. Topology

```
                    ┌──────────────┐
   browser ────────▶│  Web (static)│   Angular bundle on a CDN
                    └──────────────┘
                           │  /api/v1
                           ▼
                    ┌──────────────┐
                    │  API (N×)    │   NestJS, stateless, horizontally scalable
                    └──────┬───────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
  ┌──────────┐      ┌────────────┐     ┌────────────┐
  │ Postgres │      │  Worker(1×)│     │  Object    │
  │ (+replica)│     │  scheduler │     │  storage   │
  └──────────┘      └────────────┘     └────────────┘
```

**The API must stay stateless.** Sessions live in Postgres (`DONE`), so any replica can serve any request and a replica can be killed at any moment.

**The worker must be a separate process — and this is an active bug today.** `HeartbeatJob` uses `@Cron` inside the API process (`apps/api/src/scheduler/`). That is correct for one instance and **wrong the moment there are two**: every replica fires every job, so reminders send twice, cleanup races itself, and report snapshots duplicate. Before Phase 10 adds real jobs, one of these must be in place:

- a dedicated worker deployment where the scheduler module is the only thing enabled (simplest, preferred), or
- a distributed lock so exactly one replica executes each tick.

Choosing this late is how "the customer got four identical reminder messages" happens.

## 3. Configuration and secrets

- `.env` is gitignored (`DONE`); `.env.example` is committed (`DONE`).
- **Validate configuration at boot and refuse to start if it is wrong (`TODO`).** A missing `DATABASE_URL` should be a startup crash with a clear message, not a runtime failure on the first request. Same for `CORS_ORIGIN`, cookie domain, and session secrets.
- **`NODE_ENV` currently controls a security-critical flag.** `cookie.util.ts` sets `secure: process.env.NODE_ENV === "production"`. If that variable is ever unset or misspelled in production, session cookies silently start travelling over plain HTTP. Boot-time validation must assert this explicitly rather than inferring it.

## 4. Security posture — what is missing right now

`apps/api/src/main.ts` today sets a global prefix, CORS with credentials, `cookie-parser`, a global exception filter, and a strict `ValidationPipe` (`whitelist` + `forbidNonWhitelisted` — good, that closes mass-assignment). It does **not** have the following, and each is a real exposure:

| Missing | Why it matters here specifically |
|---|---|
| **Rate limiting** | **The most urgent item.** Password hashing is scrypt at `N=131072` — roughly 128 MB of memory and significant CPU *per attempt* (`password.util.ts`). That is excellent against offline cracking and a gift to an attacker online: a few dozen concurrent login attempts can exhaust the server. Strong hashing without rate limiting converts a credential-stuffing attempt into a denial-of-service. Needs per-IP and per-account throttling on `/auth/login`, `/auth/refresh`, and the public decision-link endpoints |
| **Helmet / security headers** | CSP, HSTS, `X-Content-Type-Options`, frame-ancestors |
| **Body size limits** | Default Express limits are generous; inspection payloads with photos will need explicit, and much smaller, caps |
| **Request IDs** | Without a correlation id, an incident report of "it failed around 3pm" is unresolvable across replicas |
| **Graceful shutdown** | In-flight transactions must finish before a replica dies during a deploy. Nest supports shutdown hooks; they are not enabled |
| **Structured logging** | Currently Nest's default text logger. See §8 |

**Cookies (`DONE`, with one production decision pending).** `httpOnly`, `secure` in production, `sameSite: lax`, and — a genuinely good detail — the refresh cookie is path-scoped to `/api/v1/auth/refresh`, so a stolen cookie has a much smaller replay surface. **The pending decision:** `sameSite: lax` requires the web app and API to be same-site in production (`app.mop.com` + `api.mop.com` under `mop.com` works; different registrable domains do not). Serving the API under the same domain is the clean answer and should be settled before launch, not discovered by broken logins.

**Account lockout (`DONE`)** — `failedLoginCount` / `lockedUntil`. Combined with rate limiting, that covers the common attack. Timing-safe comparison and a dummy-verify path for unknown accounts are already there (`password.util.ts`), which is a detail most projects miss.

**Public decision links** are the highest-exposure surface: unauthenticated, sent over WhatsApp, forwardable. They need long random tokens (`DONE` — `secureToken @unique`), expiry (`DONE` — `expiresAt`), single-use semantics, rate limiting, and **no PII in the URL**. A decision link is a bearer credential; it should be treated as one.

## 5. Sessions and instant revocation

Sessions are database-backed rather than stateless JWTs (`DONE`), and that is the right call for this product specifically: **"freeze a workshop" must terminate access immediately.** A self-contained JWT cannot be un-issued, so a frozen tenant's staff would keep working until expiry. `WorkshopsService.changeStatus` already revokes every session for the tenant inside the same transaction as the status change — the freeze is real, not cosmetic.

The cost is a session lookup on every request. If that becomes a bottleneck, cache it — with the same hard rule as the permission cache: **revocation must bypass the cache.** Stale denial is acceptable; stale access is a breach.

## 6. Files and photos

Inspections carry photos (spec: "photos placeholder"), and this is a leakage surface disguised as a storage problem.

- Object storage, never the application filesystem.
- **Keys namespaced by tenant**, and access always brokered by the API — never a public bucket with guessable paths. A URL is not an authorisation.
- **Signed, short-lived URLs** for retrieval.
- **Strip EXIF on upload.** Phone photos carry GPS; a customer's home address should not leak through a photo of their car.
- Validate real content type, cap dimensions and size, and treat every upload as hostile.
- Photos of a vehicle are customer data — they belong in the same retention and anonymisation regime as the rest.

## 7. Realtime — currently absent, and promised

The brief is explicit: progress updates appear "on a timeline that occurs and updates in real time on the technician, team leader and customer pages." **There is no realtime mechanism in the codebase — no WebSocket, no SSE, no polling.**

**Recommendation: Server-Sent Events**, for reasons specific to this product:

- The traffic is one-directional. Servers push state changes; clients act through ordinary POSTs. WebSockets buy bidirectionality nothing here needs, at the cost of a second auth path and a second scaling model.
- SSE runs over plain HTTP, so it inherits the existing cookie auth and the existing permission resolver rather than needing its own.
- Reconnection is built into the browser.

**Design constraints, which matter more than the transport choice:**

1. **A channel is subscribed per session and scoped server-side to that session's tenant, role, and record scope.** A realtime stream is just another API response — every rule about what a Team Leader or a customer may see applies identically. This is a very easy place to leak, because it is easy to think of it as "just a notification."
2. **The stream carries invalidation signals, not authoritative data** — "Work Order X changed" rather than the new state. The client re-fetches through the normal, permission-checked endpoint. This keeps exactly one code path that decides what a user may see.
3. **Fed from `OperationEventsService`**, so realtime is one more projection of the same event, not a parallel system that can disagree.
4. **Polling fallback**, because workshop wifi is bad and corporate proxies break long-lived connections.

## 8. Observability

- **Structured JSON logs** with `requestId`, `tenantId`, `actorId`, route, status, duration. Text logs are unsearchable once there are multiple tenants and replicas.
- **Never log PII** — no customer names, phone numbers, plate numbers, or decision tokens. Log ids and look them up.
- **Logs are not audit.** Logs are for engineers and are disposable; `AuditLog` is for users and is permanent. Never substitute one for the other.
- **Metrics that reflect this domain**, not just CPU: permission-resolution latency, login failure rate, decision links sent vs. answered, stock movements per hour, invoice issuance failures.
- **Error tracking** with tenant tagging, so "is this one workshop or everyone" is answerable in seconds.
- **Health endpoint (`DONE`)** — `GET /health` already exposes the scheduler's last tick, which makes "is the background worker alive" externally checkable rather than a matter of trust. Extend with database connectivity and migration state.

## 9. Backups and disaster recovery

- Point-in-time recovery, retention measured in weeks.
- **Restores are tested on a schedule.** An untested backup is a belief, not a backup.
- **The multi-tenant restore problem, decided in advance:** one workshop corrupts its data and wants a rollback. A full-cluster restore would revert every other tenant too — unacceptable. The answer is a **per-tenant logical export/import path**, built and tested before it is needed at 2am. Note that the schema's pervasive `tenantId` and `onDelete: Cascade` make a per-tenant extract genuinely feasible; that property should be protected deliberately.
- Migrations that touch existing data take a snapshot immediately beforehand.

### 9a. Database failover — the posture, and the runbook (E20, closed)

**P-66** (`docs/POLICY_DECISION_INVENTORY.md`) resolved this to `DOCUMENTED_RUNBOOK_PLUS_RETRY`: the dangerous case is never downtime itself, it is a UI reporting "job saved" for a transaction that actually rolled back — `VISION.md` §6's "fake completion" failure mode arriving via infrastructure instead of code. This section is the deliverable that decision named.

**What actually happens today, per code, not assumption.** Every write of consequence in this codebase goes through `prisma.$transaction(...)` — invoice numbering, stock movements, work-order transitions, policy changes, all of it (grep the phrase; it is the load-bearing primitive this entire correctness story rests on). Prisma's `$transaction` wraps a single logical unit of work in one Postgres transaction:

1. **Connection drops before the transaction commits (the common case — a failover mid-write).** Postgres never received or never applied the `COMMIT`. The transaction is atomically rolled back — partially-applied writes are impossible by construction, the same guarantee that makes every fix in this session's edge-case register work. The client's Prisma call rejects with a connection error. **The API must treat this identically to any other write failure: surface it as an error, never as success.** No code path in this project synthesizes a success response before a write's `$transaction` promise resolves, which is the property that makes this safe — verified by inspection, not merely hoped.
2. **Connection drops after Postgres commits, before the response reaches the client.** The write is real and permanent; the client never learns it succeeded. This is the one genuinely ambiguous case, and it is not new to failover — an ordinary network blip between API and browser produces the identical symptom. The existing idempotency machinery is what already covers it: `Payment.idempotencyKey` (H5, fixed this session) means a client that retries after an ambiguous response gets the same settlement back, not a double charge; the guarded `updateMany` pattern (H1/H2/H8/E14, all fixed this session) means a retried status transition either no-ops correctly or is refused with a real conflict, never silently reapplied. **The failover case does not need a new mechanism — it needs the existing one applied consistently**, which this session's own work already moved toward.
3. **Split-brain — the old primary is still accepting writes after a replica has been promoted.** The only outcome that can silently corrupt data, and the only one that requires an infrastructure guarantee rather than an application-level one: **the deployment target must supply automatic STONITH/fencing** (or the managed-Postgres equivalent — most managed providers, e.g. RDS Multi-AZ, guarantee this by construction) so two primaries never accept writes at once. This is a hosting decision, not application code, and is recorded here as a hard requirement on wherever this is deployed, not a "nice to have."

**The runbook, for whoever is on call:**

1. **Detect.** Health check / connection-pool errors spike. `docker compose`'s Postgres health check (`pg_isready`, already configured for CI) is the same primitive to alert on in production.
2. **Do not manually intervene in the database during an automatic failover.** A managed Postgres provider's failover is faster and safer than a human running `pg_ctl promote` under pressure at 2am. Confirm failover completed (new primary accepting connections) before touching anything else.
3. **Restart or let API replicas reconnect.** Prisma's connection pool retries on the next query by default; a replica wedged in a bad state (repeated connection errors beyond a few seconds) should be recycled rather than left to keep failing — this is what health-checked orchestration (any of them) is for.
4. **Do not trust in-flight client state.** A browser tab open during the failover may show a stale "saving…" spinner. The correct instruction to a technician or branch manager on the phone is "reload the page and check the record" — never "assume it saved" and never "assume it didn't." Every write-confirmation surface in this product reads back from the database rather than trusting its own optimistic state, which is what makes "reload and check" always give the true answer.
5. **After recovery, check `AuditLog` and `OperationEvent` for the failover window specifically** — not because they are expected to show corruption (case 3 above is the only corruption path, and it should be prevented by fencing before it happens), but because a genuinely ambiguous client-side case (2 above) is the one place a human might reasonably want to confirm what actually landed.
6. **This runbook itself must be exercised, not just written.** Restores are tested on a schedule per this section's own existing rule; a failover drill against a real staging replica belongs on the same schedule. An untested runbook is a belief about a runbook, not a runbook.

## 10. The scaling path

In the order the constraints will actually appear:

1. **Permission-resolver query amplification** — the hot path, five queries per check today. Fix per `DATABASE_STRATEGY.md` §9.
2. **Reports on the primary database** — move heavy read queries to a read replica.
3. **Aggregate-heavy list pages** — the `CANDIDATE_CAP = 500` workaround in `WorkshopsService.list()` becomes wrong somewhere between 500 and 5,000 tenants. Replace with a job-refreshed summary table.
4. **Event fan-out** — synchronous today, which is right while it is fast. When projections multiply, move the non-critical ones behind a queue while keeping the transactional core (stock, money) synchronous.
5. **Table size** — partition audit/events/movements by time.

**The rule that keeps all of this possible: the API stays stateless.** No in-memory session state, no in-memory caches that must be coherent across replicas, no local file storage.

## 11. Connectivity reality on a workshop floor

This is not an office product. Wifi near a metal vehicle lift is bad, tablets are handed between people, and phones are used with gloves.

- **Every mutating technician endpoint takes an idempotency key.** A tap that times out and is retried must not create two part requests or two decision requests. `Payment` already does this (`DONE`); the pattern belongs on all technician actions.
- **Optimistic UI with reconciliation**, never optimistic *truth* — a queued action shows as pending, and the server's answer wins.
- **Fail visibly.** A silently dropped "mark used" is far worse than a visible error, because it corrupts stock and the invoice while everyone believes the job is done.
- Full offline mode is explicitly **out of scope for now** — a decision, not an oversight. Offline-first with conflict resolution across stock and money is a product of its own.

---

**Related:** [`VISION.md`](./VISION.md) · [`DATABASE_STRATEGY.md`](./DATABASE_STRATEGY.md) · [`UX_PRINCIPLES.md`](./UX_PRINCIPLES.md)
