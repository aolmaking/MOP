# Strategy B — Quick-Service Vertical: execution ledger

> **This is now the primary mission tracker**, superseding
> `docs/UI_UX_EXECUTION_LEDGER.md` as the active queue (that file's
> remaining items are folded in under "Also queued" below rather than
> abandoned). The full contract — the four strategies considered, the
> comparison matrix, and the reasoning for choosing B — was given directly
> in chat on 2026-09-02 and is not yet a committed doc; this ledger is the
> durable record of it. If a fuller write-up is wanted later, transcribe it
> here or into `docs/phases/`.
>
> **Operating model:** one continuous, self-managed mission queue, worked
> item by item, session by session, without stopping for confirmation
> (standing instruction, 2026-09-02). "Day N" in the original plan is a
> sequencing label, not a 24-hour deadline. There is no Agent 2/Agent 3 —
> every item below is built by this session, one vertical slice at a time,
> each slice typechecked + linted + tested against real Postgres + built
> before commit, then committed and pushed individually.
>
> **The two facts that decide scope** (from the source audit): (1) the
> spine — `START_INSPECTION`, `REQUEST_APPROVAL`, `APPROVE`, `START_WORK`,
> `ASK_CUSTOMER`, `CUSTOMER_RESPONDED` — had zero production callers, so
> nothing downstream of intake could move without direct Prisma writes or
> test-only lifecycle calls. (2) `ADAPTER_COVERED_COUNTRIES` is empty, so
> every tenant is `compliantBlocked` unless `BILLING=EXTERNAL` — real
> money truth lives in MOP, the legal tax document stays the workshop's
> own process. Both confirmed by direct code read on 2026-09-02.

## Status legend

`DONE` — verified against real Postgres, full gate green, committed.
`IN PROGRESS` — actively being built this session.
`OPEN` — not started.
`PARTIAL` — some of the item is real; see note.

---

## MUST ship

| # | Item | Status | Note |
|---|---|---|---|
| M-1 | Spine ignition: `START_INSPECTION`/`START_WORK` endpoints; decision-service auto-moves (`REQUEST_APPROVAL`/`ASK_CUSTOMER` on raise, `APPROVE`/`CUSTOMER_RESPONDED` on answer); BM `request-approval`+task-creation endpoints | **DONE** | 2026-09-02, two commits (backend, then web). Technician `POST work-orders/:id/start-inspection`/`start-work` (`apps/api/src/experiences/technician/technician.controller.ts`) delegate to new `TechnicianWorkService.startInspection`/`.startWork`. `CustomerDecisionService.raiseAndSend`/`applyAnswers` (`apps/api/src/systems/customer/decision.service.ts`) now call `WorkOrderLifecycleService` outside their write transactions, swallowing only `ConflictException` (refusal), via a new `moveIfPossible`. `APPROVE` only fires when at least one item was actually approved — a full rejection never reads as approval. BM gained parity endpoints `POST branch-manager/work-orders/:id/tasks` and `.../decisions` (`branch-manager.controller.ts`), reusing the same services the technician's card uses. New permission keys: `task.start_inspection`, `task.start_work`, `task.branch.create`, `customer_decision.cancel`. Web: `tech-work-card` shows a contextual primary action (Start inspection / Start work) computed from job status; BM `work-order-workspace` gained Add-task and Ask-the-customer panels plus a Cancel action on unanswered decisions. 15 new backend integration tests, full gate green (884/885 API tests — the one failure, `scheduler-lock.integration.spec.ts`, is a pre-existing flaky advisory-lock race, confirmed unrelated, passes clean in isolation; 272/272 web tests; 243/243 shared tests; all 6 lints; full build). **Known gap, not blocking:** no HTTP-level (supertest) test yet for the three new BM controller endpoints specifically — the underlying services are fully covered and the controller wiring mirrors existing, already-HTTP-tested patterns exactly (`recordApproval`/`deliver`/`advance`); worth closing under M-2's Honesty Harness pass rather than as a one-off. |
| M-2 | Honesty Harness: HTTP-only golden-journey walkthrough green on launch profile + one contrasting profile, in CI | OPEN | `scenario-walkthrough.integration.spec.ts` exists and is service-level, not HTTP-only; needs a supertest-driven HTTP pass through the real golden journey (intake → inspection → decision → approve → work → parts → finish → invoice → payment → deliver) once M-1's endpoints are proven wired end to end, plus a second run on a contrasting profile. |
| M-3 | Decision lifecycle hygiene: `VIEWED` on read, staff cancel endpoint | **DONE** | 2026-09-02, same commit as M-1. `CustomerDecisionService.read()` writes `SENT -> VIEWED` (best-effort, never fails the read). New `cancel()` refuses once `respondedAt` is set; wired at `POST branch-manager/approvals/:requestId/cancel`. Read-computed expiry already existed. |
| M-4 | Take Payment reachable from Delivery board + Attention Center | **DONE** | 2026-09-02 (`720b0b5`). `AttentionItem`/`DeliveryCandidate` gained a server-computed `invoiceId` (set only when an unsettled invoice actually exists), so the Attention Center's TAKE_PAYMENT action and the delivery board's held rows can link straight to `/branch/payments/:invoiceId`. Every other Attention row action is still S-1's scope, documented no-op unchanged. |
| M-5 | Technician part-return leg: return + clarification-answer endpoints | **DONE** | 2026-09-02 (`5f1276b`). `POST technician/parts/:id/return` and `.../return/respond`, same ownership check as `receive`/`used`. `WorkCardPart.action` (singular) became `actions` (array) + `clarificationQuestion` — a received part is a real choice (fit it or send it back), and the technician needs to see what the store actually asked. Web parts panel renders every offered action and an inline form for RETURN/RESPOND_CLARIFICATION. 3 new integration tests exercise `TechnicianWorkViewService.workCard()` itself (not just the service layer) against real Postgres. |
| M-6 | Web session refresh (survive a working day past the 20-min access-token TTL) | **DONE** | 2026-09-02 (`8e19d7a`). New `refreshInterceptor` (`apps/web/src/app/runtime/http/refresh.interceptor.ts`), registered after `errorInterceptor`: on a 401 from anything but the auth endpoints, calls `auth/refresh` once (concurrent 401s share one call via `shareReplay`) and retries; either failure mode falls back to the original error unchanged, so `AuthStore.bootstrap()`/the auth guard need no changes. 6 new tests against `HttpTestingController`. |
| M-7 | Launch profile locked: `SINGLE_BAY_QUICK_SERVICE` + PORTAL + EXTERNAL_PARTS + `BILLING=EXTERNAL` + FINANCE_CORE + INVENTORY(+PART_RETURNS) | **VERIFIED-DONE (exists)** | Profile and `EXTERNAL_BILLING` both real in `packages/shared/src/capabilities/profiles.ts`; `BILLING=EXTERNAL` bypasses `compliantBlocked` end to end (`billing.service.ts:239`). Remaining work is choosing/creating the actual pilot tenant on this profile (M-13/M-14), not building the mechanism. |
| M-8 | Surface narrowing: hidden nav/routes for the deferred roles/pages | OPEN | Not started. Web-only. |
| M-9 | Deployment: Dockerfiles, TLS reverse proxy, staging boot, smoke suite | PARTIAL — Dockerfiles written, **not build-verified** | 2026-09-02. `apps/api/Dockerfile` (multi-stage, uses `pnpm deploy` to materialize a self-contained runtime rather than hand-copying pnpm's symlinked node_modules across stages) and `apps/web/Dockerfile` + `nginx.conf` (SPA fallback, `/api/` proxied to an `api` service). **Honesty caveat, not a formality:** this environment has no reachable Docker daemon (confirmed — `docker` absent from PATH, no Docker Desktop install found), so neither Dockerfile has actually been built. Reasoned through carefully, but the first real `docker build` is the real test. Staging VPS boot, TLS, and the smoke suite against it remain fully open and need infrastructure access this session does not have. |
| M-10 | Backups: nightly dump + one scripted restore drill | OPEN | Not started. |
| M-11 | Observability: request-id in logs, error surface, external `/health` check | PARTIAL — logging half **DONE** | 2026-09-02 (`c097e5f`). New `accessLogMiddleware` logs method/path/status/duration/`rid=` on every response (health check excluded); `ApiExceptionFilter`'s 500 log line carries the same id. Verified live against the dev DB, not just unit-tested. **Still open:** an external uptime probe hitting `/health` from outside the process — needs somewhere to probe from, i.e. depends on M-9's staging boot. |
| M-12 | CI running the full gate on every PR | **VERIFIED-DONE** | `.github/workflows/ci.yml` runs install → prisma generate → build shared → migrate → lint → typecheck → test → build. |
| M-13 | Honest seed: pilot workshop created through the real wizard path, no fabricated history | OPEN | Depends on M-9 (needs somewhere to seed it) or can be done against local/dev first. |
| M-14 | Owner service catalog + one trained admin | OPEN | Depends on a real pilot tenant existing (M-13). |

## SHOULD ship (trim under pressure, in this order)

S-1 Attention Center row actions wired · S-2 Security (server-side access TTL, refresh cap) · S-3 Owner Reports overview tab exposed · S-4 Decision expiry sweeper cron · S-5 Dossier polish for counter staff · S-6 Platform Reports Level 1 internal-only.

All OPEN.

## DEFERRED (explicitly out this sprint)

Country adapters · messaging senders · policy setter UI/governance runtime · specialization consumption · analyst role & saved-views export UI (already built, pre-dates this plan) · team-leader role · multi-branch/multi-warehouse · review/QC journeys · platform reports sections 3–6 · i18n string pass · attachments/photos · transfers/supplier orders · disputes/staff-restriction routes · realtime.

## FORBIDDEN this sprint

`shared/capabilities/*` engine internals & graphs (extending the launch profile's own edges is fine; changing graph semantics is not) · permission layer order/resolver · money helpers · gate evaluator semantics · tenant isolation model · audit boundary · Prisma schema changes beyond additive columns a SHOULD genuinely demands.

---

## Also queued (carried over from `docs/UI_UX_EXECUTION_LEDGER.md`, not abandoned)

These remain real, valuable work; they resume once the MUST list above is substantially through, or opportunistically when they overlap with a MUST item already in hand (e.g. M-1's web wiring touches the same work-card/workspace files as several of these):

- Reports: charts for the volume series and hover detail on report figures.
- Seed `serviceKey` on demo tasks, seed a priced catalogue entry, delegate `finance.running_invoice.add_line` so billing is demonstrable from a fresh seed.
- Workflow Health depth (issue lifecycle, root-cause grouping, filters, branch/time scope, drill-down, trend, freshness, KPI definitions).
- Branch Manager work-order detail depth, sharing the dossier subsystem.
- Elevation/animation pass applied at page level (currently only on shared primitives).
- Owner pages still unbuilt: Organization & Access, Forms & Fields, Messages & Templates, Pricing & Financial Configuration, Reports & Analytics, Workflow Health.

## Next item

**Every product-logic MUST item is now done**: M-1, M-3, M-4, M-5, M-6,
M-7, M-12 — commits `015fc6d`, `1c6ef0a`, `5f1276b`, `720b0b5`,
`8e19d7a` plus the two pre-existing verified items. What remains is
infra/ops (M-9/M-10/M-11), a test-harness item (M-2), and two items that
are not code at all (M-13/M-14 need an actual pilot workshop and owner
decision). Honest split of what this session can and cannot do alone:

- **Can do autonomously, next up:** M-11's remaining half (a structured
  logger emitting `requestId` per line — the middleware already exists,
  see `apps/api/src/runtime/http/request-id.ts`), then M-9's *buildable*
  half (Dockerfiles for `apps/api`/`apps/web`, so a deploy target exists
  the moment one is provisioned) — write these, they don't require any
  credential or external account. Then **M-2**: turn
  `scenario-walkthrough.integration.spec.ts` (currently service-level)
  into a real HTTP walkthrough with supertest through the launch profile,
  the single most valuable remaining test-coverage gap per the ledger's
  own G1/G2 audit fact.
- **Cannot do autonomously — needs the workshop owner or infrastructure
  access this session does not have:** M-9's staging VPS boot and TLS
  cert, M-10's actual backup destination/schedule, M-13's real pilot
  tenant (needs a real workshop's real catalogue and staff, not
  fabricated ones — the whole point of "honest seed"), M-14 (the same
  real workshop's owner has to exist first). These are flagged here
  rather than faked; do not synthesize a fake "pilot" to check a box.

Once the autonomously-doable items above are done, the honest state of
this mission is: **product-complete for the quick-service vertical,
blocked only on deployment infrastructure and a real pilot workshop** —
continue past that into the SHOULD list (S-1..S-6) and then the
product-completion-audit loop the standing mandate describes, rather
than stalling.
