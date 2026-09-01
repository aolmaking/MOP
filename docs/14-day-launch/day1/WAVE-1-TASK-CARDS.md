# WAVE 1 TASK CARDS — Day 1 (frozen contracts v0 apply)

Card rules: 30–90 min · ≤ ~6 files · explicit acceptance · evidence = commit SHA + command output.
Coordinator splits this file into `board\tasks\<ID>.md` at board seed (or workers read here directly until split).

Legend — sizes: S ≤30m · M ≤60m · L ≤90m.

---

## A1 — Integrator / Infra / Verification (Claude, worktree `w-int`, branch `develop`)

### W1-A1-001 — Provisioning verification & gate baseline
Owner: A1 · Size M · Why first: nothing merges until environment + gate cost are known.
Dependencies: setup-fleet.ps1 executed. Files: none modified (read-only probes) except `runs/` evidence.
Must NOT touch: product code.
Acceptance: `corepack pnpm run doctor` exits 0 in `w-int`; scoped gate passes; **full gate** executed once with wall-clock recorded.
Tests: full suite once (baseline timing).
Evidence: `board/runs/D1-baseline.md` (doctor out, gate duration, test counts).
Next unlocked: all other A1 cards; merge authority active.

### W1-A1-002 — CI live on GitHub
Owner: A1 · Size M–L (unknown breakages) · Why first: every later proof cites a CI URL.
Dependencies: W1-A1-001. Files: `.github/workflows/ci.yml`, possibly lockfile/toolchain fixes on a branch `infra/ci-fixes` PR'd to `main`.
Must NOT touch: application code beyond workflow/config.
Acceptance: one fully green run on GitHub containing lint+typecheck+tests+build; artifacts uploaded (jest results).
Tests: the pipeline itself.
Evidence: run URL recorded in `decisions.md`.
Next unlocked: protected-`main` regime credible; D7/D12 checkpoint proofs possible.

### W1-A1-003 — Honesty Harness scaffold (RED pinned)
Owner: A1 · Size L · Why first: the ultimate progress arbiter must exist before features land.
Dependencies: W1-A1-001. Files (new): `apps/api/src/testing/http-kit.ts` (bootApp/loginAs/expectCode helpers modeled on `auth.controller.integration.spec.ts`), `apps/api/src/testing/walkthrough.http.spec.ts`.
Must NOT touch: existing services/controllers.
Acceptance: spec creates workshop via `POST /platform/workshops` over HTTP (real Postgres), accepts invite, books intake, then asserts `POST /technician/work-orders/:id/start-inspection` — currently failing at REGISTERED (no route ⇒ 404 or 409) — **pinned `xit` with tracked ticket reference in header comment**; kit compiles; one trivial passing use of kit (health check).
Tests: the scaffold itself.
Evidence: commit + output showing the intentional red.
Next unlocked: D4 golden-path turn-green; A3 gets a ready-made HTTP vehicle.

### W1-A1-004 — Integration harness scripts + migration lock
Owner: A1 · Size M · Why first: merges begin Day 2; rules must be mechanical before then.
Dependencies: W1-A1-001. Files (new, outside app): `harness\integrate.ps1`, `harness\gate.ps1`, `harness\mop-push.ps1`, `board\claims\migrations.lock` convention.
Must NOT touch: repo source.
Acceptance: `gate.ps1 -scoped` green on `develop`; `integrate.ps1` performs a dry-run rebase-check of `track/a3-backend` (no-op merge) and refuses correctly when a fake hotspot overlap is injected; `mop-push.ps1` refuses `main` and force flags.
Tests: self-evident dry-runs recorded.
Evidence: transcript in `board/runs/D1-harness.md`.
Next unlocked: daily integration windows operational.

### W1-A1-005 — Staging boot + backup skeleton
Owner: A1 · Size L (external friction likely) · Why first: longest external pole after ETA; D4 verification needs a URL.
Dependencies: W1-A1-001. Files: deployment configs (new `deploy/` dir: Dockerfile.api, Dockerfile.web, Caddyfile), `harness\backup.ps1`.
Must NOT touch: app source semantics.
Acceptance: containers build; API container boots against its own DB and answers `/api/v1/health`; TLS terminated by reverse proxy (self-signed acceptable Day 1); `backup.ps1` dumps all four DBs to `backups\<date>\`.
Tests: smoke curl over HTTPS.
Evidence: staging URL + health JSON in `board/runs/D1-staging.md`.
Next unlocked: browser journeys land on staging from D4.

---

## A2 — Frontend / UX (Codex, remote machine, branch `track/a2-frontend`)

### W1-A2-001 — Remote environment bring-up
Owner: A2 · Size M · Why first: everything else depends on it.
Dependencies: receives seeded branch + this file.
Acceptance: own Postgres container with DB `mop_test_w2`; `.env` written; `corepack pnpm install` + `db:generate` succeed; `ng serve` proxies to a locally-running API booted from the same clone (verification-only backend use — no backend edits).
Evidence: screenshot of login page served locally + `pnpm -v` output posted to `a2-STATUS.md` committed on the branch.
Next unlocked: all A2 cards.

### W1-A2-002 — API-client additions per CONTRACTS-v0
Owner: A2 · Size M · Dependencies: contracts published (they ship with this wave).
Files: `apps/web/src/app/experiences/technician/technician.api.ts`, `branch-manager/work-orders/work-orders.api.ts`.
Acceptance: typed methods `startInspection(id)`, `startWork(id)`, `requestApproval(id)`, `addTask(id, dto)` (BM), `returnPart(partId, dto)`, `answerClarification(partId, dto)`, `addExternalPart(id, dto)` matching contracts exactly (URLs, verbs, payload/response types, error codes). No components wired yet.
Evidence: compile-clean typecheck commit.
Next unlocked: W1-A2-003 wiring.

### W1-A2-003 — Work-card contextual action scaffold
Owner: A2 · Size M · Dependencies: W1-A2-002.
Files: `experiences/technician/tech-work-card.ts` (+html/css).
Acceptance: primary action area driven purely by card `status`: REGISTERED⇒"Start inspection"; APPROVED_FOR_WORK⇒"Start work"; else existing tools; buttons disabled-with-reason while calls 409; card + journey refresh after success; feature-flagged constant `LAUNCH_ACTIONS=true` at top of file.
Tests: component spec updated for the three states (mock api).
Evidence: screenshots of the three states (mocked) committed.
Next unlocked: real-API verification at D3–D4.

### W1-A2-004 — Launch-surface narrowing inventory → PR
Owner: A2 · Size M · Why early: pure frontend, zero backend dependency, de-risks D6.
Files: `app.routes.ts` (nav/route gating only), shell templates nav lists.
Acceptance: analyst + team-leader routes hidden from nav (routes may remain registered — capability-off denies), owner forms/messages/reports/audit/workflow-health links hidden, platform reports/live-view marked internal (kept reachable for you), no dead nav entries remain on visible shells; a `SURFACE-NOTES.md` in branch root lists every hidden thing + why.
Evidence: before/after nav screenshots.
Next unlocked: D6 sweep becomes a checklist instead of work.

### W1-A2-005 — Inventory Manager console verification pass
Owner: A2 · Size L · Why Day 1: inventory is launch-core; verifying against the *running local stack* surfaces gaps while A3 still has slack.
Files: verification notes only (+tiny UI fixes if trivially safe and within experiences/inventory).
Acceptance: walk Home→Requests→approve→issue (against locally seeded catalog) →Stock→Item ledger→Returns(empty ok)→Reports; record every broken state/dead button/copy issue into `a2-STATUS.md` as findings F-xx with severity; zero fixes attempted on backend behaviors.
Evidence: findings list committed.
Next unlocked: findings feed A3 queue + D5 polish.

---

## A3 — Backend / Domain (ox-alpha, worktree `w-a3`, branch `track/a3-backend`)

Standing constraints for ALL A3 cards: single-writer rule (only `work-order-lifecycle.service.ts` writes status) · intents never client-chosen · follow CONTRACTS-v0 verbatim · no migrations today (none required) · service-level integration specs allowed immediately; HTTP-level assertions wait for A1's kit (D2 pickup).

### W1-A3-001 — Contracts read-back + intent tests RED
Owner: A3 · Size S · Why first: test-first locks interpretation before code.
Files: `systems/operations/work-order-lifecycle.integration.spec.ts` (extend).
Acceptance: tests added for START_INSPECTION (REGISTERED→UNDER_INSPECTION happy path + wrong-state 409 `transition_not_allowed`) and START_WORK (APPROVED_FOR_WORK→IN_PROGRESS + wrong-state 409) — red because endpoints don't exist yet; committed with `@todo(W1)` markers.
Evidence: red output snippet.
Next unlocked: W1-A3-002/003.

### W1-A3-002 — Implement start-inspection endpoint
Owner: A3 · Size M.
Files: `experiences/technician/technician.controller.ts`, `technician-work.service.ts` (thin wrapper calling `lifecycle.apply(id,"START_INSPECTION",actor)`), dto if body needed (none).
Must NOT touch: graphs/registry, gate evaluator.
Acceptance: route exists under SessionGuard; ownership via existing `view.workCard`; 409 mapping preserved; tests from 001 green (service level); payload matches contract.
Evidence: green test run + curl transcript.
Next unlocked: card button goes live at D3 (A2).

### W1-A3-003 — Implement start-work endpoint
Owner: A3 · Size M. Same pattern as 002 with `START_WORK`; acceptance identical (state APPROVED_FOR_WORK prerequisite verified).
Next unlocked: journey shows IN_PROGRESS progression.

### W1-A3-004 — Task creation endpoint
Owner: A3 · Size M.
Files: `experiences/branch-manager/branch-manager.controller.ts` + small dto; exposes existing `TechnicianWorkService.createTask(workOrderId,title,actor,assignTo?,serviceKey?)`.
Acceptance: `POST /branch-manager/work-orders/:id/tasks` → 201 with created task; 400 `service_not_in_catalog` on dead key (logic exists); BM permission `workorders.branch.view` + explicit write-permission decision recorded (reuse `notes.create`-style pattern: propose `workorders.tasks.manage` ONLY if manifest addition approved in decisions.md — default: reuse existing keys, document choice).
Tests: integration (create/list-visible-on-card payload).
Evidence: green run.
Next unlocked: A2 modal functional at D3; technician execution loop completable.

### W1-A3-005 — Decision auto-moves (APPROVE / CUSTOMER_RESPONDED / REQUEST_APPROVAL)
Owner: A3 · Size L · Why today: approval leg is on the D4 critical path.
Files: `systems/customer/decision.service.ts`.
Acceptance: after `applyAnswers` resolves all-approved (and terminal checks pass), best-effort `moveIfPossible(id,"APPROVE")` then `"CUSTOMER_RESPONDED"` — outside the answer transaction, refusals swallowed-and-logged (mirrors part-request pattern); `raiseAndSend` gains best-effort `REQUEST_APPROVAL` move; responses' shapes UNCHANGED (additive behavior only); stale-state race documented in code comment.
Tests: decision.integration.spec extensions: approve→WO at APPROVED_FOR_WORK (when edge live), partial-response stays put, portal+counter paths inherit behavior.
Evidence: green run + note in contracts "additive side-effect confirmed".
Next unlocked: D3 BM request-approval endpoint (W2-D2 card) and full approval leg.

### W1-A3-006 — External-part entry path verification (R3 groundwork)
Owner: A3 · Size S–M (verification-heavy) · Why Day 1: decides whether a conditional endpoint enters Wave 2.
Acceptance: trace how a CUSTOMER_SUPPLIED/EXTERNAL_PURCHASE `WorkOrderPartLine` can be created through production code today; write findings to `board/blockers/r3-external-part.md` with one of: "path exists via X" (cite) / "missing ⇒ propose `POST /technician/work-orders/:id/external-parts` per contract §8, est M" — no implementation without coordinator approval.
Evidence: the findings note.
Next unlocked: R3 closure decision at D3 checkpoint.
