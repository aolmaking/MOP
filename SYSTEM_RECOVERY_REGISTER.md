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
- **Verification:** `VERIFIED_RUNTIME`
- **Sites found:** `operator.service.ts` (intake → `UNDER_INSPECTION`; dispatch → `APPROVED_FOR_WORK`; counter sale created at `PAYMENT_PENDING`), `customer-portal.service.ts` (counter sale, same), `technician-work-view.service.ts` (report submission re-asserting `UNDER_INSPECTION`). `intake.service.ts` was a linter false positive — it creates at `WORK_ORDER_GRAPH.initial`, which the linter now recognises as the one sanctioned create.
- **What each one actually cost:**
  - The two operator writes were `status: "..." as any` inside `try {} catch {}` blocks commented *"non-fatal if in mock test"* — production code shaped around a unit-test mock. The dispatch write skipped the `inspection_completed` gate and the `APPROVAL_REQUIRED_SCOPE` policy, so a workshop configured to send findings to the customer before work begins had that requirement bypassed on every dispatch.
  - The technician write asserted the status the job was already in. A no-op whose only real effect was to make the CLAUDE.md grep return a hit and to suggest the technician moves the job.
  - Both counter sales assigned `PAYMENT_PENDING` directly. That state and its only exit (`SETTLE_PAYMENT`) both require `FINANCE_CORE`, so a workshop without the finance module got a sale permanently stranded in a state its own graph cannot leave — a breach of the reachability guarantee the capability engine exists to hold.
- **Fix:** every site asks for an INTENT now. Intake uses `START_INSPECTION`; dispatch uses `APPROVE` and returns `transition.to` rather than a literal, because the same intent routes to `AWAITING_CUSTOMER_APPROVAL` under `APPROVAL_REQUIRED_SCOPE`; the counter sale takes a newly declared `DRAFT → PAYMENT_PENDING` edge carrying `ISSUE_INVOICE` and requiring `FINANCE_CORE`. That intent was already in `WORKFLOW_INTENTS` and already named a progress step in `workflow-journey.ts`, but no transition had ever carried it. The technician's redundant write is gone and the response reports the status actually stored.
- **Proof:** `lint-status-writers` reports zero. The 250 shared tests — reachability validator, graph safety, workflow router — pass with the new edge. Both operator specs now assert the intent rather than the column, and `operator-surface.http.spec.ts` proves the dispatched status over real HTTP.
- **Status:** **VERIFIED**

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
| REC-012 | Operator `update-quote` / `approve-repair` return **HTTP 400** — page sends `note`/`tasks`, DTOs declare `notes` and no `tasks` | P1 | `VERIFIED_RUNTIME` | **VERIFIED** — see below |
| REC-013 | No frontend calls `POST /finance/work-orders/:id/invoice`; `READY_FOR_DELIVERY → CLOSED` is gated on `invoice.issued` | P1 | `VERIFIED_CODE` | **VERIFIED** — see below |
| REC-014 | Inspection domain `CRITICAL` collapses to Prisma `HIGH`; `has_critical_fault`, `QC_MANDATORY=RISK_FLAGGED_ONLY`, `APPROVAL_REQUIRED_SCOPE=CRITICAL_ONLY` and `critical_warning_acknowledged` all unreachable | P1 | `VERIFIED_CODE` | **VERIFIED** — see below |
| REC-015 | `OperatorService` writes `WarehouseStockBalance` directly with no `StockMovement`; no `RESERVE`/`RELEASE` movement type exists, so `replay()` cannot reproduce `reservedQty` | P1 | `VERIFIED_CODE` | **VERIFIED** — see below (and REC-033) |
| REC-016 | Duplicate fault projection — `submitInspectionReport` writes Faults twice, the second without dedupe | P2 | `VERIFIED_CODE` | **VERIFIED** — see below |
| REC-017 | Catalog provisioned regardless of the `INVENTORY` capability and of `plan.maxWarehouses` — Beta got 42 items and a warehouse on a plan allowing 0 | P2 | `VERIFIED_RUNTIME` | OPEN |
| REC-018 | Only `firstWarehouseId` is stocked — a second warehouse is created empty and its branch cannot be served | P2 | `VERIFIED_RUNTIME` | OPEN |
| REC-019 | Two sources of truth for enabled modules — `TenantConfiguration.enabledModules` vs `modulesForProfile(capabilities)`; `CapabilityChangeService.apply()` never updates the stored list | P2 | `VERIFIED_CODE` | OPEN |
| REC-020 | 71 eslint errors | P3 | `VERIFIED_RUNTIME` | OPEN |
| REC-021 | `OperatorController` gates on a hardcoded role allow-list instead of `EffectiveAccessService`; its three work-order routes never check branch scope | P1 | `VERIFIED_CODE` | **VERIFIED** — see below |
| REC-022 | 8 of 16 `FinanceConfiguration` fields have no reader (`taxRatePercent` never reaches an invoice) | P3 | `VERIFIED_CODE` | OPEN |
| REC-023 | `CustomFieldDefinition` and `MessageTemplate` persist through the real API and are consumed by nothing | P3 | `VERIFIED_RUNTIME` | OPEN |
| REC-024 | `ORPHANED_STATUS_CHANGE` checks for *zero* status events, so it never fires on an operator-created job that has one from intake | P2 | `VERIFIED_CODE` | OPEN |
| REC-025 | Owner reports discard the requested `branchId` in 5 methods | P2 | `VERIFIED_CODE` | OPEN |
| REC-026 | `lint-money` roots exclude `experiences/operator` and `experiences/technician`, where all the new float money lives | P2 | `VERIFIED_RUNTIME` | **VERIFIED** — lint-template-money |
| REC-027 | Onboarding / capability-divergence / catalog-cart tests not updated when catalog provisioning was added (4 of the 6 remaining suite failures) | P3 | `VERIFIED_RUNTIME` | OPEN |
| REC-028 | `POST /platform/workshops` returns 500 in `platform.controller.integration.spec.ts:135` | P2 | `VERIFIED_RUNTIME` | OPEN |
| REC-029 | `StockService.transferStock` moves stock but writes no `InventoryTransfer` row | P3 | `VERIFIED_CODE` | OPEN |

---

## Phase 4 — The operator surface · **COMPLETE**

These four were entangled at one boundary: adding real nested validation to the
operator DTOs forces the severity vocabulary to be settled, and settling it
exposes the second fault-writing path. They were fixed and verified together.

### REC-012 — Both operator write endpoints returned HTTP 400 · **P1**
- **Verification:** `VERIFIED_HTTP`
- **Symptom:** every *Save Quote* and every *Dispatch to Repair* in the product came back `400 property note should not exist` / `400 property tasks should not exist`. The operator surface had no working write path at all.
- **Root cause:** two field-name disagreements between the page and the DTO — the page sends `note` and `tasks: [{title, estimatedMinutes}]`, the DTO declared `notes` and `tasksToCreate?: string[]`. With the global pipe's `forbidNonWhitelisted`, an undeclared property is a rejected request, not an ignored one. `tasksToCreate` had no producer anywhere in the repository, so it was removed rather than kept alongside.
- **Why no test caught it:** every existing test of this flow calls the service directly and constructs its own object, so it never crosses the pipe. That is the exact gap Mission Section C names.
- **Also fixed here:** the quote line shapes were `@IsArray()` over an inline TypeScript type, which validates the array and nothing inside it. That is how the page's `serviceName` and the service's `s.name` could disagree in silence, giving every dispatched task the title *"Perform Vehicle Repair"* whatever the operator approved. All three line types are `@ValidateNested` classes now.
- **Proof:** `operator-dto-contract.spec.ts` (12 tests) pushes the page's real payloads through a real `ValidationPipe`; `operator-surface.http.spec.ts` sends them over real HTTP and reads the stored rows back — the note persists, the labour total is the one sent, and the created task is called *"Front brake service"*.
- **Status:** **VERIFIED**

### REC-014 — `SeverityLevel.CRITICAL` was unreachable · **P1**
- **Verification:** `VERIFIED_RUNTIME`
- `InspectionRepository` mapped a domain `CRITICAL` finding onto Prisma `HIGH`, so nothing in the shipped inspection flow could ever store `CRITICAL`. Three mechanisms read exactly that value: the `work_order.has_critical_fault` fact that `QC_MANDATORY = RISK_FLAGGED_ONLY` routes on, `evaluateCriticalFaultProgression` behind `APPROVAL_REQUIRED_SCOPE = CRITICAL_ONLY`, and the attention queue's critical rejections. A workshop could configure risk-based QC or critical-only customer approval and the option could never fire on a single job. The operator hub then mapped `HIGH` back to "CRITICAL" for display, so the screen and the database disagreed about the same brake finding.
- **Fix:** `CRITICAL → CRITICAL`, `ATTENTION → MEDIUM`, otherwise `LOW`. The two display re-maps in `OperatorService` are gone, and the quote DTO carries the full four-value scale the database stores instead of silently rewriting `HIGH` to `MEDIUM` on the way in.
- **Two tests encoded the old lossy mapping** (`technician-inspection.integration.spec.ts`, `inspection.repository.spec.ts`, one of them with the comment *"Prisma SeverityLevel.HIGH represents CRITICAL"*). Both now assert `CRITICAL`.
- **Status:** **VERIFIED**

### REC-016 — Duplicate fault projection · **P2**
- **Verification:** `VERIFIED_CODE`
- `submitInspectionReport` wrote `Fault` rows a second time, after the aggregate had already projected them, with no dedupe and with the severity flattened.
- **Fix:** the second write runs only when the aggregate has not already projected (`SUBMITTED` / `OPERATOR_REVIEW` / `LOCKED`), skips a fault it can already find by description and code, and passes the finding's own severity through.
- **Status:** **VERIFIED**

### REC-021 — Operator authorization was a hardcoded role list with no branch scope · **P1**
- **Verification:** `VERIFIED_HTTP`
- **Two distinct defects.**
  - **Authorization.** All fourteen routes were gated by one `new Set(["OPERATOR", "BRANCH_MANAGER", "TENANT_OWNER", "TENANT_ADMIN"])`. That sits *above* the eleven-layer resolver rather than inside it: a workshop could not delegate reception work to a role the Set omits, could not revoke it from one it names, and switching the OPERATIONS module off changed nothing, because a Set in a controller cannot see a capability. It also handed `TENANT_OWNER` and `TENANT_ADMIN` write powers that `default-role-permissions.ts` withholds from them in as many words — *"actually working a Work Order is Branch Manager/Technician territory"*.
  - **Branch scope.** `overview` and `inspection-reports` filtered by the session's branch scope; the three per-work-order routes took only a tenant id. An operator at one branch could read another branch's inspection report, reprice its quote and dispatch its repair by holding an id — and the product hands work-order ids out on other pages.
- **Fix:** every route names its permission and goes through `EffectiveAccessService.can`. Two new keys were needed and neither existed: `workorders.branch.dispatch_repair` (reviewing a quote and dispatching), and `finance.counter_sale.create` — kept deliberately separate from `finance.invoice.issue`, because invoicing a repair is owner-delegated money while a counter sale is retail and manning the till is why the OPERATOR role exists. Both default to `true` for `OPERATOR` and `BRANCH_MANAGER` only. The three work-order routes now pass through `requireWorkOrderInScope`, which answers `404`, not `403` — a 403 on a foreign id confirms the id is real.
- **Migration required:** yes. `20260909120000_seed_operator_surface_permissions` backfills both keys for existing tenants, since an absent `RolePermission` row denies by default and workshops whose operators were dispatching yesterday must keep dispatching today. `ON CONFLICT DO NOTHING`, so an owner who has already decided otherwise is not overruled.
- **Frontend:** the operator page asks `/access/check` for `workorders.branch.dispatch_repair` and hides *Save Draft* and *Approve & Dispatch* when the answer is no, rather than drawing two buttons that answer 403.
- **Proof:** `operator-surface.http.spec.ts` — 9 tests over real HTTP against real Postgres, in a two-branch workshop. A north-branch operator gets `200` on their own job and `404` on a south-branch one for read, quote and dispatch alike, with the south inspection's pricing and the south job's status and task count asserted unchanged afterwards. A technician gets `403`. The owner gets `403` on dispatch and `200` on the read, which is exactly what the documented model says.
- **Status:** **VERIFIED**

---

## Phase 5 — Inventory accounting on the operator path · **PARTIAL**

### REC-015 — Reserved stock had no ledger behind it · **P1**
- **Verification:** `VERIFIED_RUNTIME`
- **Symptom:** `OperatorService.approveRepair` moved `WarehouseStockBalance` by hand — `availableQty: { decrement }`, `reservedQty: { increment }` — inside a `catch {}` commented "non-fatal". `StockService`'s own header forbids that in as many words: *"nothing else in the codebase is permitted to update WarehouseStockBalance… A service that adjusts a balance directly is the inventory equivalent of writing `WorkOrder.status` by hand."*
- **What it cost, beyond the rule:**
  - No `StockMovement` row, so `reservedQty` was the one bucket in inventory that `replay()` could not reproduce — it returned 0 forever, whatever the stored balance said. The PHASE_7 standard the design is judged by (*every number traceable to the movements that produced it*) was false for exactly this number, and the existing "THE RULE" test could not have caught it, because it only asked about `availableQty` and `damagedQty`.
  - Neither the read that decided there was enough stock nor the write took a lock, so two operators approving the same part at the same instant both reserved the last unit.
  - A reservation that would overdraw the shelf was applied regardless; nothing refused a negative result.
  - The shortfall branch wrote `availableQty: 0` outright instead of decrementing by what it reserved, silently erasing any receipt that landed between the read and the write.
- **Fix:** two new movement types, `RESERVE` and `RELEASE_RESERVATION` (migration `20260909130000`). `EFFECTS` gained an `alsoMoves` half so a two-sided movement is declared as data rather than special-cased inside `record`, which keeps the invariant tests iterating every type; `replay()` counts a movement towards either of its buckets. The operator now calls `StockService.record`, which re-reads under `FOR UPDATE` and refuses rather than clamping.
- **Also fixed here — the banned default-warehouse hardcode.** Warehouse resolution fell back to *"the first active warehouse in the tenant"* when the branch had no serving relationship. In the multi-branch chain that fallback exists for, it reserved North's brake pads against a repair booked in the South: the shelf the technician walks to still had the part, and a shelf a hundred miles away was short one. It resolves through `BranchWarehouseAccess` now and refuses with `branch_has_no_serving_warehouse` rather than guessing — a catalogued part with nowhere to draw it from is a configuration answer the workshop owes.
- **Proof:** `stock.integration.spec.ts` gained 7 tests against real Postgres — the two buckets move together and conserve total units, the movement carries its `WorkOrder` reference, over-reserving and over-releasing are both refused with the balance unchanged, THE RULE now holds for `reservedQty`, and two simultaneous reservations of the last unit produce exactly one winner.
- **Status:** **VERIFIED** for the reservation itself. The reservation's *end* is REC-033 below.

### REC-033 — A reservation is never consumed or released · **P1 · NEW**
- **Verification:** `VERIFIED_CODE`
- Nothing anywhere records `RELEASE_RESERVATION`, and nothing converts reserved stock into issued stock. A grep for `reservedQty` outside `StockService` finds only readers — two report surfaces and the operator's own pre-flight check.
- So when an operator approves a repair for a part that is in stock, the units leave the sellable shelf permanently. No `PartRequest` is created for the in-stock branch, so the technician's issue path never runs against them; they are not issued, not returned, and not released if the job is cancelled. A workshop's sellable count therefore bleeds down over time while the parts are still physically on the shelf, and `availableQty + reservedQty` is the only number that stays honest.
- This predates the fix above and is unchanged by it — REC-015 made the movement auditable, which is what makes this visible at all. It is *not* fixed, and it is not a linter's problem.
- **Why it is not fixed here:** the consumption point belongs to the part-request spine, and that spine is the dual-truth problem in REC-019 / Phase 3. Adding a third path from the operator's side before the spine converges would make the convergence harder, not easier. Recorded rather than half-built.
- **Status:** `OPEN` — **blocks completion.** Phase 3 must land first.

---

## Phase 6 — The journey's back half, and the surfaces that lost it · **MOSTLY COMPLETE**

This phase started as "fix the 90 failing web tests" and turned into the most
productive audit of the session. A suite that red is a suite nobody reads, and
what it had been reporting — for weeks — was that **eight capabilities had been
removed from the product**. Every one had the same shape: a UI redesign dropped
the markup, the method stayed on the component with no caller, nothing failed to
compile, nothing failed to run, and the tests that said so were dismissed as
stale.

### REC-013 — Nothing in the product could issue an invoice · **P1**
- **Verification:** `VERIFIED_CODE` (web) — the API path is already covered by `walkthrough.http.spec.ts`
- `POST /finance/work-orders/:id/invoice` existed, was permission-gated, and was proven by the HTTP walkthrough. No page called it. A job finished, landed in `PAYMENT_PENDING`, and stopped: Take Payment needs an invoice id that did not exist, and `DELIVER` is gated on `invoice.issued`. **No work order could reach `CLOSED` through the product.**
- The delivery board was already saying so, in words deliberately kept apart from "has not been settled" because they are two different jobs for two different people. It named the problem and offered nothing to do about it.
- **Fix:** an *Issue invoice* action on exactly the rows where that is what holds the car, gated on `finance.invoice.issue`. Pressing it reloads the board rather than patching the row, because issuing changes which gate blocks, what the reason says, and whether Take Payment appears — all three are the server's answers.
- **Status:** **VERIFIED**

### REC-034 — The technician could not finish a job · **P1 · NEW**
- **Verification:** `VERIFIED_CODE`
- `c.finish` — available, passed, and the gate conditions in the gate registry's own words — was rendered nowhere, and `finish()` had no caller. A job stayed in `IN_PROGRESS` indefinitely. The server does not offer `FINISH` as a journey action to this audience *by design*, which is exactly why the card has to own the control.
- Together with REC-013 the whole back half of the journey was unreachable through the UI: nobody could finish, and nobody could invoice. The API walkthrough passes the whole way through, which is precisely why neither was noticed.
- **Status:** **VERIFIED** — restored, conditions shown before the press.

### REC-035 — `TIME_TRACKING: REQUIRED` bricked task completion · **P1 · NEW**
- **Verification:** `VERIFIED_CODE`
- `canComplete` refuses a task with no minutes under that policy. The field that supplies them was dropped and the rule was not, so **Done was permanently disabled**: a workshop that switched on a feature the product sells could not complete a single task.
- A configuration option that bricks the page it configures — the "configuration island" failure in its purest form.
- **Status:** **VERIFIED**

### REC-036 — The technician could not report a blocker · **P1 · NEW**
- **Verification:** `VERIFIED_CODE`
- "Something's wrong" and its reason list were gone. `blocker.report` is a permission the product grants, and the `no_open_blocker` delivery gate exists to read what it produces — with no way to report one, that gate could never hold anything back.
- **Status:** **VERIFIED** — reasons as taps, not a text box: a technician with one free hand will not type, and the reason enum is what routes it to the right person.

### REC-037 — The whole part-request loop had no surface · **P1 · NEW**
- **Verification:** `VERIFIED_CODE`
- `PartList` was imported by the work card and rendered nowhere, leaving `receivePart`, `usePart`, `returnPart` and `answerClarification` orphaned. A technician could not see the parts they had asked for, mark one received or used, send one back, or answer the store's question.
- Three delivery gates — `parts.received_used_or_returned`, `parts.no_pending_return`, `parts.external_resolved` — are satisfied *only* by those four acts. **A job with any part request on it could never be delivered.**
- **Status:** **VERIFIED**

### REC-038 — Past recommendations and their evidence went dark · **P2 · NEW**
- **Verification:** `VERIFIED_CODE`
- `docs/HISTORY_MODULE.md` names the recommendation outcome model as the reason the technician's history panel exists, and the contract agrees: *"Agreed and not delivered. The reason this surface exists."* The server kept sending every recommendation, its outcome, its linked work and its dated evidence to a panel that rendered none of it.
- The Attention strip survived and says *what* was not done. What went missing is the part that says why anyone should believe it — a technician about to tell a customer "you were told about this last time" needs to be able to show that they were.
- **Status:** **VERIFIED** — markup and styles restored from the commit that wrote them.

### REC-039 — The card offered moves the server never authorized · **P1 · NEW**
- **Verification:** `VERIFIED_CODE`
- `primaryJobAction` computed the technician's move from the work order's status alone. That asks neither question that decides whether a move is real: does this workshop's graph allow it from here, and does this technician hold the permission. So the card could offer a button the controller then refused, and offer nothing when the server had a move to give.
- `runJourneyAction` then `return`ed silently for any key it did not recognise — a button the server offered that did nothing at all, which is the prohibition on ignoring an error in its quietest form.
- The inspection stage offered no status move of any kind, so a job arriving `REGISTERED` went through checkpoints, findings and a submitted report **still sitting in `REGISTERED`** — and the operator's review queue only looks at `UNDER_INSPECTION`, so that report reached nobody.
- **Fix:** both stages render `journey().actions`; an unhandled key says so on the page.
- **Status:** **VERIFIED**

### REC-040 — Fabricated prices on the operator's till · **P1 · NEW**
- **Verification:** `VERIFIED_CODE`
- The till read `item.price`, `item.unitPrice` and `item.retailPrice` — three fields the server has never sent. The call was typed `Observable<any>`, so nothing objected and every read fell through to its literal: each catalogue tile advertised a fabricated **45**, and adding that part to a customer's quote charged them a fabricated **50**. Two different invented numbers for the same part on the same screen, neither ever entered by anyone in the workshop. The SKU fell through to a timestamp, so the line could not be traced to a shelf either.
- Typing the call also exposed `item.nameEn` and `item.partNumber`, two more fields nobody sends.
- **Also:** fifteen places wrote `${{ price }}` — a literal dollar sign — so an Egyptian workshop quoted its own customers in dollars on the quote builder, the counter and the technician's tablet. And `unitPrice * quantity` inside interpolations: float arithmetic on money in the one place `lint-money` cannot read.
- **Fix:** the till reads the same `PartCard` contract the technician's parts page reads; `Tenant.currency` reaches the client on the branding payload; `ui/money.ts` formats against it; `lineTotal` moved into the components. `tools/lint-template-money.mjs` guards all three shapes and is wired into `lint:architecture`.
- **Status:** **VERIFIED**

### REC-041 — The technician's queue invented a car · **P2 · NEW**
- **Verification:** `VERIFIED_CODE`
- `item.vehicleModel || 'Toyota Corolla 2021'` — a car with no model on file was described to the technician as a Corolla, on the screen they use to confirm they are working on the right vehicle.
- **Status:** **VERIFIED** — shown only when the server sent one.

### REC-042 — `tech-work-card.spec.ts` still describes the replaced inspection panel · **P3 · NEW**
- **Verification:** `VERIFIED_RUNTIME`
- 23 of the original 90 web failures remain, all in this one file, all on the `.mission` "Mission 1 / Active Inspection Workspace" panel that the studio-checkpoints redesign replaced wholesale. Unlike the eight above, **no capability was lost here** — findings, severity and submission all exist in the new inspection stage under a different structure.
- **Next step:** rewrite those 23 against the current stage, preserving the guarantees they encode: complaint shown when present and absent when blank; no completion controls before an inspection starts; no log-finding controls once it is `COMPLETED` or `DECLINED`; findings and their decision statuses stay visible after completion; the awaiting-customer and authorization-required contexts; and blockers not hidden merely because the inspection finished.
- **Status:** `OPEN`

**Web suite: 90 failing / 382 → 23 failing / 397.** API suite unchanged at **141/141 suites, 1310/1310 tests**.

---

## Phase 1 result

| Signal | Before | After |
|---|---|---|
| Fresh DB → migrate → seed | **FAIL** | **PASS** |
| Migration ≡ schema | **3 statements of drift** | **no difference** |
| API suites failing | **43 / 139** | **6 / 139** |
| API tests failing | **431 / 1282** | **11 / 1282** |
| Drift detectable by CI | no | yes |
