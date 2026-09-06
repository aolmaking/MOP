# 13 — Production Readiness Audit

**Feature completeness ≠ production readiness.** This report is the latter.

## 1. Deployment & runtime

| Area | State | Evidence |
|---|---|---|
| Dockerfile (api/web) | **None** | repo-wide glob |
| docker-compose | Postgres dev only | `docker-compose.yml` |
| CI | Single job: pg16 service, pnpm 9.15/Node 24, shared-build-first ordering, 6 custom linters + eslint, full tests, build. **Never executed** per its own docs; no artifacts; no deploy | `.github/workflows/ci.yml`, docs/INFRASTRUCTURE.md:16 |
| Environments | Boot-validated (`loadEnvironment`, exit 78), CORS https-only in prod, PORT validated — genuinely good config hygiene for a non-deployed app | `runtime/config/environment.ts` |
| Process model | In-process scheduler w/ advisory-lock single-flight (multi-replica safe); graceful shutdown hooks; no worker separation (deliberate, documented) | `scheduler-lock.service.ts`, `main.ts` |

## 2. Observability
Nest default text logging only (3 instantiation sites); request-id middleware emits correlation ids **nothing consumes**; exception filter logs stacks without ids; no metrics/tracing/error-tracking SDKs anywhere in lockfile imports; health check = SELECT 1 + scheduler heartbeat (decent liveness, no readiness/migration-depth). Structured logging has been "owed" since Phase 1.4.

## 3. Data safety
Backups/PITR/per-tenant logical restore/failover runbook (P-66 STONITH): mature **docs**, zero tooling. Migration strategy disciplined (forward-only, expand→migrate→contract rehearsed on seeds; CI applies chain fresh); PG≥12 required by three `ALTER TYPE ADD VALUE` migrations inside transactions. Retention: audit INDEFINITE default; archive sets 7-year retention with no read-path yet (18.x deferral).

## 4. Security posture at the edge
Helmet defaults only (no CSP tuning despite charter asking); body capped 256kb explicit (photos will need their own route — none exists); throttling env-tunable and tested; cookie flags sane (Report 11 for S1/S2 findings); no secrets manager (single dev credential committed in four places — clearly dev-scoped but structurally indistinguishable from real secrets).

## 5. Market/legal blockers (feature-side but gating production)
- **No country billing adapter:** `ADAPTER_COVERED_COUNTRIES` empty ⇒ every tenant `compliantBlocked` unless External Billing Mode; QR null; clearance synthetic. No legal invoice can be issued in any named market.
- **No messaging transport** ⇒ no customer notifications, no password-reset delivery, no invite emails.
- **No i18n strings** despite RTL-ready layout and Arabic-primary market claim (Phase 14 never done).
- Country support: 127-entry registry deriving currency/timezone/working week — data present, compliance absent.

## 6. Scale/concurrency evidence
Real concurrency proofs exist where money/stock demanded them (invoice numbering 10-way, payment idempotency race, stock FOR UPDATE, freeze race, blocker/team locks). Load testing: none (20.A open). REPEATABLE READ permission snapshot; no cache layer (fresh DB reads per request) — correct-first, scale-later posture.

## 7. Runbook/ops artifacts
Doctor script covers real failure modes; DEVELOPMENT.md documents environment traps honestly. No runbooks for deploy/restore/incident beyond INFRASTRUCTURE.md prose.

## Verdict
**Not production-ready, and not close on infrastructure** — no image to deploy, CI unexecuted, observability absent, backups theoretical. The codebase underneath is unusually deployable-in-spirit (validated env, safe defaults, transactional discipline), so the gap is buildable rather than architectural. Legal invoicing remains the single hardest external dependency.

Maturity: deployment Missing · observability Missing · data-safety design Strong/implementation Absent · edge security Partial+ · market blockers 3 (billing adapters, messaging, i18n).
