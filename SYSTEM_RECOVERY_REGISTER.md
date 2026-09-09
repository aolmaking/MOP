# MOP — System Recovery Register

> Every defect discovered during the recovery mission, with its verification level
> and current state. Nothing is removed from this file; items move between states.
> Branch: `recovery/architectural-convergence`, forked from `main` @ `663eecd`.

**States:** `OPEN` · `IN PROGRESS` · `FIXED` · `VERIFIED` · `BLOCKED`

**Verification levels:** `VERIFIED_RUNTIME` · `VERIFIED_HTTP` · `VERIFIED_INTEGRATION` · `VERIFIED_CODE` · `PARTIALLY_VERIFIED` · `UNVERIFIED` · `INFERRED`

---

## Phase 0 — Baseline (recorded 2026-09-09)

| Signal | Before |
|---|---|
| Branch / HEAD | `main` @ `663eecd`, worktree clean |
| Sibling worktrees | `E:/mop-fleet/{w-a3,w-infra,w-int}` — **not touched** |
| Migrations on disk | 41 |
| `pnpm typecheck` | PASS |
| `pnpm lint` | **FAIL** — 71 eslint errors; architectural linters never reached |
| Architectural linters | audit-boundary ✅ · permission-keys ✅ · no-hard-delete ✅ · directional-css ❌ · touch-targets ❌ · money ❌ · dead-links ❌ |
| API tests (migration-built DB) | **43 / 139 suites failing · 431 / 1282 tests failing** |
| Web tests | 8 / 64 files failing · 90 / 382 tests failing |
| Shared tests | 250 / 250 pass |
| Fresh DB → migrate → seed | **FAIL** — `staffUser.create()` impossible |

---

## Phase 1 — Database reality · **COMPLETE**

### REC-001 — Migration history did not reproduce `schema.prisma`
- **System:** Database · **Severity:** P1 (blocks every non-developer environment)
- **Verification:** `VERIFIED_RUNTIME`
- **Symptom:** A database built from migrations lacked `staff_users.specializations` and `teams.specializations`, and carried a stale index the schema no longer declares. Every `staffUser.create()` and `team.findMany()` failed. 43 suites / 431 tests down.
- **Root cause:** Commit `6d92a8b` added both columns to `schema.prisma` and shipped only the OPERATOR-enum migration. `20260904190000` added `operation_events_tenantId_eventKey_createdAt_idx` without dropping the two-column index from `init`. Invisible locally because `migrate dev` / `db push` apply the schema, not the history.
- **Architectural violation:** Two descriptions of one database, with no check that they agree.
- **Fix:** `packages/database/prisma/migrations/20260909000000_reconcile_specializations_and_stale_index/`
- **Migration required:** Yes — added.
- **Runtime test:** empty DB → `migrate deploy` → `migrate diff` reports *empty migration* → `seed` completes → full API suite.
- **Result:** **43 → 6 failing suites; 431 → 11 failing tests.**
- **Status:** **VERIFIED**

### REC-002 — Nothing detected schema/migration drift
- **System:** Tooling · **Severity:** P1 · **Verification:** `VERIFIED_RUNTIME`
- **Fix:** `tools/lint-migration-drift.mjs` — replays every migration into a throwaway shadow database and diffs the result against `schema.prisma`. Creates and drops its own shadow DB so it can never touch real data; skips with a warning (exit 0) when `DATABASE_URL` is unset so a contributor without a database can still lint.
- **Wired into:** `pnpm lint:architecture`, which now runs **before** eslint.
- **Status:** **VERIFIED** — reproduced the exact 3-statement drift before the fix, reports OK after.

### REC-003 — Architectural linters never ran
- **System:** Tooling · **Severity:** P2 · **Verification:** `VERIFIED_RUNTIME`
- **Symptom:** `pnpm lint` ran eslint first; eslint exits 1 on 71 errors, so the seven custom architectural linters were never reached. The load-bearing guarantees were unenforced.
- **Fix:** Split into `lint:architecture` (runs first) and the eslint pass. Architecture is now checked even while eslint is red.
- **Status:** **FIXED** — eslint errors themselves remain open as REC-020.

### REC-004 — No guard on the "only one writer of `WorkOrder.status`" rule
- **System:** Operations · **Severity:** P1 · **Verification:** `VERIFIED_RUNTIME`
- **Symptom:** CLAUDE.md states the rule and says "a grep for hardcoded statuses must return nothing." Nothing ran that grep.
- **Fix:** `tools/lint-status-writers.mjs` — inspects the `data:`/`create:`/`update:` payload of every Prisma write to `workOrder` (never the `where:`, so reading by status stays legal).
- **Status:** **FIXED (instrument)** — currently reports 6 violations, tracked as REC-010.

### REC-005 — No guard on tenant scoping
- **System:** Security · **Severity:** P0 · **Verification:** `VERIFIED_RUNTIME`
- **Fix:** `tools/lint-tenant-scope.mjs` — derives the tenant-owned model list from `schema.prisma` (any model with a `tenantId` column) and bans loading or mutating one by primary key alone.
- **Status:** **FIXED (instrument)** — currently reports **84 violations**, tracked as REC-011.

---

## Phase 2 — Security & tenant isolation · **IN PROGRESS**

### REC-011 — Tenant-owned rows reachable by bare id · **P0**
- **Verification:** `VERIFIED_RUNTIME` (four separate attacks executed against a live API)
- **Symptom, proven at runtime with real sessions:**
  - Alpha's technician started, completed and blocked **Beta's** task (`201` each; `ASSIGNED → IN_PROGRESS → DONE`).
  - Alpha's branch manager read **Beta's** invoice and recorded ₤250 against it — Beta's balance `1000 → 750`, `Payment.tenantId` = **Alpha**.
  - Alpha's inventory manager approved **Gamma's** part request and issued stock — Gamma's stock `18 → 17`, `StockMovement.tenantId` = Gamma, `actorId` = Alpha.
  - Alpha's branch manager read **Beta's** job total (`200`).
- **Root cause:** No global tenant enforcement (`PrismaService` is a bare `PrismaClient`; no `$use`, no `$extends`, no RLS). Controllers resolve `session.tenantId` and hand services a bare id; the tenantId is used for capability and policy lookups but not for row ownership.
- **Scale:** 84 sites flagged by `lint-tenant-scope`.
- **Two pre-existing tests already assert the correct behaviour and are currently failing** — `technician-shift.integration.spec.ts` ("refused another technician's job outright") and `journey.http.spec.ts` ("refuses a job outside the reader's own scope"). These are regressions, not new requirements.
- **Status:** `OPEN`

### REC-010 — `WorkOrder.status` written outside the lifecycle service · **P1**
- **Verification:** `VERIFIED_CODE`
- **Sites:** `operator.service.ts:432, 981` (update), `operator.service.ts:560` + `customer-portal.service.ts:325` (create at `PAYMENT_PENDING`), `technician-work-view.service.ts:1269` (update). `intake.service.ts:102` is legitimate — it creates at `WORK_ORDER_GRAPH.initial` — and needs an exemption comment rather than a change.
- **Consequence:** no graph check, no gate, no `OperationEvent`, no audit row; cycle-time analytics and the `ORPHANED_STATUS_CHANGE` detector both go blind.
- **Status:** `OPEN`

---

## Carried forward from the two prior audits (unfixed)

| ID | Issue | Severity | Level | State |
|---|---|---|---|---|
| REC-012 | Operator `update-quote` / `approve-repair` return **HTTP 400** — page sends `note`/`tasks`, DTOs declare `notes` and no `tasks` | P1 | `VERIFIED_RUNTIME` | OPEN |
| REC-013 | No frontend calls `POST /finance/work-orders/:id/invoice`; `READY_FOR_DELIVERY → CLOSED` is gated on `invoice.issued` | P1 | `VERIFIED_CODE` | OPEN |
| REC-014 | Inspection domain `CRITICAL` collapses to Prisma `HIGH`; `has_critical_fault`, `QC_MANDATORY=RISK_FLAGGED_ONLY`, `APPROVAL_REQUIRED_SCOPE=CRITICAL_ONLY` and `critical_warning_acknowledged` all unreachable | P1 | `VERIFIED_CODE` | OPEN |
| REC-015 | `OperatorService` writes `WarehouseStockBalance` directly with no `StockMovement`; no `RESERVE`/`RELEASE` movement type exists, so `replay()` cannot reproduce `reservedQty` | P1 | `VERIFIED_CODE` | OPEN |
| REC-016 | Duplicate fault projection — `submitInspectionReport` writes Faults twice, the second without dedupe | P2 | `VERIFIED_CODE` | OPEN |
| REC-017 | Catalog provisioned regardless of the `INVENTORY` capability and of `plan.maxWarehouses` — Beta got 42 items and a warehouse on a plan allowing 0 | P2 | `VERIFIED_RUNTIME` | OPEN |
| REC-018 | Only `firstWarehouseId` is stocked — a second warehouse is created empty and its branch cannot be served | P2 | `VERIFIED_RUNTIME` | OPEN |
| REC-019 | Two sources of truth for enabled modules — `TenantConfiguration.enabledModules` vs `modulesForProfile(capabilities)`; `CapabilityChangeService.apply()` never updates the stored list | P2 | `VERIFIED_CODE` | OPEN |
| REC-020 | 71 eslint errors | P3 | `VERIFIED_RUNTIME` | OPEN |
| REC-021 | `OperatorController` gates on a hardcoded role allow-list instead of `EffectiveAccessService`; its three work-order routes never check branch scope | P1 | `VERIFIED_CODE` | OPEN |
| REC-022 | 8 of 16 `FinanceConfiguration` fields have no reader (`taxRatePercent` never reaches an invoice) | P3 | `VERIFIED_CODE` | OPEN |
| REC-023 | `CustomFieldDefinition` and `MessageTemplate` persist through the real API and are consumed by nothing | P3 | `VERIFIED_RUNTIME` | OPEN |
| REC-024 | `ORPHANED_STATUS_CHANGE` checks for *zero* status events, so it never fires on an operator-created job that has one from intake | P2 | `VERIFIED_CODE` | OPEN |
| REC-025 | Owner reports discard the requested `branchId` in 5 methods | P2 | `VERIFIED_CODE` | OPEN |
| REC-026 | `lint-money` roots exclude `experiences/operator` and `experiences/technician`, where all the new float money lives | P2 | `VERIFIED_RUNTIME` | OPEN |
| REC-027 | Onboarding / capability-divergence / catalog-cart tests not updated when catalog provisioning was added (4 of the 6 remaining suite failures) | P3 | `VERIFIED_RUNTIME` | OPEN |
| REC-028 | `POST /platform/workshops` returns 500 in `platform.controller.integration.spec.ts:135` | P2 | `VERIFIED_RUNTIME` | OPEN |
| REC-029 | `StockService.transferStock` moves stock but writes no `InventoryTransfer` row | P3 | `VERIFIED_CODE` | OPEN |

---

## Phase 1 result

| Signal | Before | After |
|---|---|---|
| Fresh DB → migrate → seed | **FAIL** | **PASS** |
| Migration ≡ schema | **3 statements of drift** | **no difference** |
| API suites failing | **43 / 139** | **6 / 139** |
| API tests failing | **431 / 1282** | **11 / 1282** |
| Drift detectable by CI | no | yes |
