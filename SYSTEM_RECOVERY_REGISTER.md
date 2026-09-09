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

## Phase 2 — Security & tenant isolation · **COMPLETE for every proven path**

### REC-011 — Tenant-owned rows reachable by bare id · **P0**
- **Verification:** `VERIFIED_RUNTIME` (attacks executed against a live API, before and after)
- **Symptom, proven at runtime with real sessions:**
  - Alpha's technician started, completed and blocked **Beta's** task (`201` each; `ASSIGNED → IN_PROGRESS → DONE`).
  - Alpha's branch manager read **Beta's** invoice and recorded ₤250 against it — Beta's balance `1000 → 750`, `Payment.tenantId` = **Alpha**.
  - Alpha's inventory manager approved **Gamma's** part request and issued stock — Gamma's stock `18 → 17`, `StockMovement.tenantId` = Gamma, `actorId` = Alpha.
  - Alpha's branch manager read **Beta's** job total (`200`).
- **Root cause:** No global tenant enforcement (`PrismaService` is a bare `PrismaClient`; no `$use`, no `$extends`, no RLS). Controllers resolve `session.tenantId` and hand services a bare id; the tenantId is used for capability and policy lookups but not for row ownership.
- **Fix strategy:** scope at the **load**, not the caller, so a future route cannot skip it — `requireTask`, `requireOwnedInvoice`, `requireOwnedWorkOrder`, `PartRequestService.load(id, tenantId)`. `NotFoundException` throughout, never `Forbidden`: a 403 on a foreign id confirms the id is real.
- **Files:** `technician-work.service.ts`, `finance.service.ts`, `part-request.service.ts`, `technician.controller.ts`, `inventory.controller.ts`, `finance.controller.ts`
- **Runtime test:** the same 13-probe suite that found the leaks — **13/13 blocked, 0 leaks** (was 4 leaking, plus 2 more that opened once a legitimately-delegable permission was granted).
- **Status:** **VERIFIED** for all proven paths. **75 sites remain flagged** by `lint-tenant-scope`; every one inspected so far is an internal helper called after an ownership check in the same method, but they are **not individually verified** — tracked as REC-031.

### REC-030 — Two isolation guarantees the suite already asserted had regressed · **P0**
- **Verification:** `VERIFIED_RUNTIME`
- `TechnicianWorkViewService.workCard` — the third arm of its `OR` degraded to `{ tenantId }` when a technician had no branch scope (the default), matching every job in the workshop and making the two assignment arms decide nothing. The auto-assign immediately below then **claimed** whatever was opened, so reading a colleague's job silently made it yours.
- `activeJob` fell through to `work[0]`, so a technician holding nothing still got a car on the "on now" page.
- Both were asserted by existing tests that were failing; both now pass.
- **Status:** **VERIFIED**

### REC-017 / REC-018 / WORKSHOP-GAP-006 — creation ignored capability and plan ceiling · **P2**
- **Verification:** `VERIFIED_RUNTIME`
- A workshop created with `INVENTORY: DISABLED` was provisioned a warehouse and 42 catalogue items it can never reach; a plan capped at `maxWarehouses: 0` was put over its ceiling at creation, after which `PlanLimitsService` correctly refused to let the owner add anything.
- **Fix:** structure and catalogue now follow the declared capability profile and the plan's ceiling; `seedStructure` reports what it actually wrote rather than `warehouses.length || 1`.
- Closed the `workshop-capability-divergence` and `onboarding` suite failures, which already asserted the correct behaviour.
- **Status:** **VERIFIED**

### REC-010 — `WorkOrder.status` written outside the lifecycle service · **P1**
- **Verification:** `VERIFIED_CODE`
- **Sites:** `operator.service.ts:432, 981` (update), `operator.service.ts:560` + `customer-portal.service.ts:325` (create at `PAYMENT_PENDING`), `technician-work-view.service.ts:1269` (update). `intake.service.ts:102` is legitimate — it creates at `WORK_ORDER_GRAPH.initial` — and needs an exemption comment rather than a change.
- **Consequence:** no graph check, no gate, no `OperationEvent`, no audit row; cycle-time analytics and the `ORPHANED_STATUS_CHANGE` detector both go blind.
- **Status:** `OPEN` — this is Phase 3 (spine convergence), not a scoping fix.

### REC-031 — 75 remaining bare-id loads, triaged but not individually verified · **P1**
- **Verification:** `PARTIALLY_VERIFIED`
- Every one sampled is an internal helper operating on a row its own method already loaded under a tenant filter (e.g. `refundRequest.update` immediately after `findFirst({ id, tenantId })`). That is safe, but "sampled" is not "verified".
- **Next step:** annotate each with `tenant-scope-ok:` and its reason, or scope it — until the linter reports zero, this is an open surface.
- **Status:** `OPEN`

### REC-032 — The integration suite is not safe to run in parallel · **P2**
- **Verification:** `VERIFIED_RUNTIME`
- 139 suites share one Postgres database. Under jest's default workers, suites see each other's tenants: `parts-loop`'s "never in another workshop's queue" test picked an arbitrary other tenant that a sibling worker had left non-`ACTIVE`, and failed at login with `tenant_unavailable` — nothing to do with isolation.
- Serial: **139/139 suites, 1282/1282 tests.** Parallel before the fix: 138/139.
- **Fix so far:** that one fixture now picks an `ACTIVE` tenant. The general problem — one database, many workers — remains.
- **Status:** `OPEN` (general case)

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
