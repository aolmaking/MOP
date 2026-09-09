# MOP System Recovery — Report (Phases 0–6)

**Branch:** `recovery/architectural-convergence`, forked from `main` @ `663eecd`
**Commits:** `b3b9585` · `37264b7` · `32484c9` · `ee0417e` · `e3c54ab` · `73f4d9b` · `fcaa029` · `e38c34c` · `6c8fcfc` · `65b0b76` · `79d8f12` · `14ebcaa` · `dae5fe3` · `53b9bc1` · `e27bb29` · `107235f` · `ff1032c` · `26c3ce7` · `11c0f06`
**Sibling worktrees** (`E:/mop-fleet/{w-a3,w-infra,w-int}`) were not touched.

> This report covers the phases actually completed and verified. **The dual-spine
> convergence (mission Phase 3) and the phases after Reporting remain open**, and
> are listed in §7. Nothing here is described as done that was not executed and
> observed. `SYSTEM_RECOVERY_REGISTER.md` carries every finding with its evidence.

---

## 1 · Executive verdict

| | Before | After |
|---|---|---|
| Empty DB → migrate → seed | **FAIL** — `staffUser.create()` impossible | **PASS** |
| Migration history ≡ `schema.prisma` | **3 statements of drift** | **no difference** |
| API suites (serial, migration-built DB) | **43 / 139 failing** | **0 / 139 failing** |
| API tests | **431 / 1282 failing** | **0 / 1282 failing** |
| Cross-tenant attack probes | **4 of 13 leaking** (6 with a legitimate delegation) | **0 of 13 leaking** |
| `pnpm typecheck` | PASS | PASS |
| API build · web build | PASS | PASS |
| Shared package tests | 250/250 | 250/250 |
| Web tests | **90 / 382 failing** | **23 / 397 failing** (one file, REC-042) |
| Architectural linters reached by `pnpm lint` | **none** | **all eleven** |
| Architectural linters passing | 3 of 7 | **9 of 11** |
| `WorkOrder.status` written outside the lifecycle | **5 places** | **none** |
| `reservedQty` reproducible from the ledger | **no** | **yes** |
| A work order can reach `CLOSED` through the UI | **no** | **yes** |

**Workflow integrity:** restored. Every `WorkOrder.status` write goes through the
lifecycle service; the counter sale is a declared graph edge rather than an
assignment that stranded the job in a state its own graph could not leave.

**Tenant isolation:** every path proven exploitable is closed and re-verified at
runtime. The operator surface's authorization is a permission now, not a
hardcoded role list, and its per-work-order routes are branch-scoped. 72 sites
remain flagged by `lint-tenant-scope`, triaged but not individually verified.

**Database integrity:** restored, and guarded in CI.

**Inventory integrity:** a reservation is a real, replayable movement, and the
warehouse is resolved from the branch's serving relationship rather than "the
first active one". A reservation is still never consumed or released — REC-033,
which blocks completion.

**Product completeness:** eight capabilities that had been removed from the UI
are back, found by taking the failing web suite seriously instead of dismissing
it. Two of them — issuing an invoice and finishing a job — meant no work order
could reach `CLOSED` through the product at all.

**Architectural convergence:** not yet. The dual-spine problem (§7, Phase 3) is
untouched and remains the largest single risk.

---

## 2 · Every issue fixed

| ID | System | Sev | Root cause | Fix | Verification |
|---|---|---|---|---|---|
| REC-001 | Database | P1 | `6d92a8b` added two schema columns with no migration; `20260904190000` added an index without dropping the one it replaced. Invisible locally because `migrate dev`/`db push` apply the *schema*, not the history | New migration `20260909000000_reconcile_specializations_and_stale_index` | `VERIFIED_RUNTIME` — empty DB → migrate → `migrate diff` reports no difference → seed completes → 43→6 failing suites immediately |
| REC-002 | Tooling | P1 | Nothing compared migrations against the schema | `tools/lint-migration-drift.mjs` — replays every migration into a throwaway shadow DB and diffs | `VERIFIED_RUNTIME` — reproduced the exact 3-statement drift before, reports OK after |
| REC-003 | Tooling | P2 | eslint ran first in `pnpm lint`; its 71 errors meant the seven architectural linters were never reached | Split `lint:architecture`, which now runs **before** eslint | `VERIFIED_RUNTIME` |
| REC-004 | Operations | P1 | CLAUDE.md's "only one writer of `WorkOrder.status`" had no enforcement | `tools/lint-status-writers.mjs` — inspects the `data:` payload, never the `where:`, so reading by status stays legal | `VERIFIED_RUNTIME` — finds exactly the 5 real violations |
| REC-005 | Security | P0 | No enforcement of tenant scoping anywhere | `tools/lint-tenant-scope.mjs` — derives tenant-owned models from `schema.prisma`, bans bare-id loads | `VERIFIED_RUNTIME` — 84 → 75 |
| **REC-011** | **Security** | **P0** | Controllers resolve `session.tenantId`, then hand services a bare id; tenantId used for capability/policy lookups, never row ownership. No `$use`, no `$extends`, no RLS | Scoped at the **load**: `requireTask`, `requireOwnedInvoice`, `requireOwnedWorkOrder`, `PartRequestService.load(id, tenantId)`, refund/discount decisions | `VERIFIED_RUNTIME` — **13/13 probes blocked** |
| **REC-030** | **Security** | **P0** | `workCard`'s OR degraded to `{ tenantId }` when `branchScope` was empty (the default), matching every job in the workshop; the auto-assign below then claimed whatever was opened. `activeJob` fell through to `work[0]` | Card = assigned to me, or assigned to nobody. `activeJob` returns null when nothing is in hand | `VERIFIED_RUNTIME` — two pre-existing tests that asserted this now pass |
| REC-017/018 | Control | P2 | Catalog and default warehouse provisioned unconditionally | Both now follow the declared capability profile and `plan.maxWarehouses` | `VERIFIED_RUNTIME` — see §5 |
| REC-027 | Tests | P3 | Three suites asserted facts about an empty fixture that stopped being true when catalog provisioning was added | Search asserts discrimination, not an empty shop; two teardowns extended to what creation now writes | `VERIFIED_RUNTIME` |
| REC-028 | Platform | P2 | `POST /platform/workshops` 500 in its own integration spec | Resolved by REC-017 + teardown fix | `VERIFIED_RUNTIME` |
| REC-032 | Tests | P2 | 139 suites share one Postgres database; workers see each other's tenants | One fixture now picks an `ACTIVE` tenant. **General case still open** | `VERIFIED_RUNTIME` |
| **REC-010** | **Operations** | **P1** | Five `WorkOrder.status` writes outside the lifecycle, two of them `as any` inside `catch {}` blocks commented "non-fatal if in mock test". The counter sale assigned `PAYMENT_PENDING`, whose only exit also requires FINANCE_CORE — a shop without finance got a sale stranded in a state its graph cannot leave | Every site asks for an INTENT. Counter sale is a declared `DRAFT → PAYMENT_PENDING` edge carrying `ISSUE_INVOICE` | `VERIFIED_RUNTIME` — `lint-status-writers` reports zero; 250 shared tests pass with the new edge |
| **REC-012** | **Operator** | **P1** | The page sends `note` and `tasks`; the DTOs declared `notes` and `tasksToCreate`. With `forbidNonWhitelisted` that is a rejected request — **every Save Quote and Dispatch returned 400** | DTO names corrected; all three line types are `@ValidateNested` classes rather than `@IsArray()` over an inline type | `VERIFIED_HTTP` — the page's real payloads through the real pipe, and over HTTP against real Postgres |
| **REC-014** | **Operations** | **P1** | `InspectionRepository` mapped domain CRITICAL onto Prisma HIGH, so `SeverityLevel.CRITICAL` was unreachable — and `has_critical_fault`, `APPROVAL_REQUIRED_SCOPE=CRITICAL_ONLY` and the attention queue all read exactly that value | One scale end to end; two tests that encoded the lossy mapping corrected | `VERIFIED_RUNTIME` |
| **REC-015** | **Inventory** | **P1** | `OperatorService` moved `WarehouseStockBalance` by hand with no movement row, no lock and no refusal — `reservedQty` was the one bucket `replay()` could not reproduce. Warehouse fell back to "the first active one", reserving North's stock against a South repair | `RESERVE`/`RELEASE_RESERVATION` movement types with a declared two-sided effect; `BranchWarehouseAccess` resolves the shelf and refuses rather than guessing | `VERIFIED_RUNTIME` — 7 new tests: buckets conserve, over-reserve refused, THE RULE holds for `reservedQty`, one winner in a race |
| **REC-021** | **Security** | **P1** | All fourteen operator routes gated by a hardcoded `Set` of role names — above the resolver, invisible to capabilities, and granting owners writes the defaults withhold. The three per-work-order routes had no branch scope | Every route names its permission through `EffectiveAccessService`; two new keys; the work-order routes answer 404 outside scope | `VERIFIED_HTTP` — 9 tests, two-branch workshop, victim's data asserted unchanged after each refusal |
| **REC-013 / 034–041** | **Product** | **P1** | Eight capabilities removed from the UI by redesigns; each left its method on the component with no caller. **No work order could reach `CLOSED` through the product**, no job with a part request could be delivered, and `TIME_TRACKING: REQUIRED` disabled Done permanently | Invoice issuance, finish + conditions, time entry, blockers, the parts loop, fault logging, past recommendations, the declined-inspection note — all restored; job actions now come from `journey().actions` | `VERIFIED_CODE` + the web suite: **90 → 23 failures** |
| **REC-040** | **Money** | **P1** | The till read three fields the server never sends, so every tile showed a fabricated 45 and every added line charged a fabricated 50. Fifteen hardcoded `# MOP System Recovery — Report (Phases 0–6)

**Branch:** `recovery/architectural-convergence`, forked from `main` @ `663eecd`
**Commits:** `b3b9585` · `37264b7` · `32484c9` · `ee0417e` · `e3c54ab` · `73f4d9b` · `fcaa029` · `e38c34c` · `6c8fcfc` · `65b0b76` · `79d8f12` · `14ebcaa` · `dae5fe3` · `53b9bc1` · `e27bb29` · `107235f` · `ff1032c` · `26c3ce7` · `11c0f06`
**Sibling worktrees** (`E:/mop-fleet/{w-a3,w-infra,w-int}`) were not touched.

> This report covers the phases actually completed and verified. **The dual-spine
> convergence (mission Phase 3) and the phases after Reporting remain open**, and
> are listed in §7. Nothing here is described as done that was not executed and
> observed. `SYSTEM_RECOVERY_REGISTER.md` carries every finding with its evidence.

---

## 1 · Executive verdict

| | Before | After |
|---|---|---|
| Empty DB → migrate → seed | **FAIL** — `staffUser.create()` impossible | **PASS** |
| Migration history ≡ `schema.prisma` | **3 statements of drift** | **no difference** |
| API suites (serial, migration-built DB) | **43 / 139 failing** | **0 / 139 failing** |
| API tests | **431 / 1282 failing** | **0 / 1282 failing** |
| Cross-tenant attack probes | **4 of 13 leaking** (6 with a legitimate delegation) | **0 of 13 leaking** |
| `pnpm typecheck` | PASS | PASS |
| API build · web build | PASS | PASS |
| Shared package tests | 250/250 | 250/250 |
| Web tests | **90 / 382 failing** | **23 / 397 failing** (one file, REC-042) |
| Architectural linters reached by `pnpm lint` | **none** | **all eleven** |
| Architectural linters passing | 3 of 7 | **9 of 11** |
| `WorkOrder.status` written outside the lifecycle | **5 places** | **none** |
| `reservedQty` reproducible from the ledger | **no** | **yes** |
| A work order can reach `CLOSED` through the UI | **no** | **yes** |

**Workflow integrity:** restored. Every `WorkOrder.status` write goes through the
lifecycle service; the counter sale is a declared graph edge rather than an
assignment that stranded the job in a state its own graph could not leave.

**Tenant isolation:** every path proven exploitable is closed and re-verified at
runtime. The operator surface's authorization is a permission now, not a
hardcoded role list, and its per-work-order routes are branch-scoped. 72 sites
remain flagged by `lint-tenant-scope`, triaged but not individually verified.

**Database integrity:** restored, and guarded in CI.

**Inventory integrity:** a reservation is a real, replayable movement, and the
warehouse is resolved from the branch's serving relationship rather than "the
first active one". A reservation is still never consumed or released — REC-033,
which blocks completion.

**Product completeness:** eight capabilities that had been removed from the UI
are back, found by taking the failing web suite seriously instead of dismissing
it. Two of them — issuing an invoice and finishing a job — meant no work order
could reach `CLOSED` through the product at all.

**Architectural convergence:** not yet. The dual-spine problem (§7, Phase 3) is
untouched and remains the largest single risk.

---

## 2 · Every issue fixed

| ID | System | Sev | Root cause | Fix | Verification |
|---|---|---|---|---|---|
| REC-001 | Database | P1 | `6d92a8b` added two schema columns with no migration; `20260904190000` added an index without dropping the one it replaced. Invisible locally because `migrate dev`/`db push` apply the *schema*, not the history | New migration `20260909000000_reconcile_specializations_and_stale_index` | `VERIFIED_RUNTIME` — empty DB → migrate → `migrate diff` reports no difference → seed completes → 43→6 failing suites immediately |
| REC-002 | Tooling | P1 | Nothing compared migrations against the schema | `tools/lint-migration-drift.mjs` — replays every migration into a throwaway shadow DB and diffs | `VERIFIED_RUNTIME` — reproduced the exact 3-statement drift before, reports OK after |
| REC-003 | Tooling | P2 | eslint ran first in `pnpm lint`; its 71 errors meant the seven architectural linters were never reached | Split `lint:architecture`, which now runs **before** eslint | `VERIFIED_RUNTIME` |
| REC-004 | Operations | P1 | CLAUDE.md's "only one writer of `WorkOrder.status`" had no enforcement | `tools/lint-status-writers.mjs` — inspects the `data:` payload, never the `where:`, so reading by status stays legal | `VERIFIED_RUNTIME` — finds exactly the 5 real violations |
| REC-005 | Security | P0 | No enforcement of tenant scoping anywhere | `tools/lint-tenant-scope.mjs` — derives tenant-owned models from `schema.prisma`, bans bare-id loads | `VERIFIED_RUNTIME` — 84 → 75 |
| **REC-011** | **Security** | **P0** | Controllers resolve `session.tenantId`, then hand services a bare id; tenantId used for capability/policy lookups, never row ownership. No `$use`, no `$extends`, no RLS | Scoped at the **load**: `requireTask`, `requireOwnedInvoice`, `requireOwnedWorkOrder`, `PartRequestService.load(id, tenantId)`, refund/discount decisions | `VERIFIED_RUNTIME` — **13/13 probes blocked** |
| **REC-030** | **Security** | **P0** | `workCard`'s OR degraded to `{ tenantId }` when `branchScope` was empty (the default), matching every job in the workshop; the auto-assign below then claimed whatever was opened. `activeJob` fell through to `work[0]` | Card = assigned to me, or assigned to nobody. `activeJob` returns null when nothing is in hand | `VERIFIED_RUNTIME` — two pre-existing tests that asserted this now pass |
| REC-017/018 | Control | P2 | Catalog and default warehouse provisioned unconditionally | Both now follow the declared capability profile and `plan.maxWarehouses` | `VERIFIED_RUNTIME` — see §5 |
| REC-027 | Tests | P3 | Three suites asserted facts about an empty fixture that stopped being true when catalog provisioning was added | Search asserts discrimination, not an empty shop; two teardowns extended to what creation now writes | `VERIFIED_RUNTIME` |
| REC-028 | Platform | P2 | `POST /platform/workshops` 500 in its own integration spec | Resolved by REC-017 + teardown fix | `VERIFIED_RUNTIME` |
 signs. Float arithmetic inside interpolations | Typed against the real contract; `Tenant.currency` on the branding payload; `ui/money.ts`; `tools/lint-template-money.mjs` | `VERIFIED_CODE` — linter green, web build clean |

---

## 3 · Systems fully verified

| System | Level | Runtime scenario |
|---|---|---|
| Migration → schema equivalence | `VERIFIED_RUNTIME` | Empty database, `migrate deploy`, `migrate diff` → no difference |
| Seed on a migration-built database | `VERIFIED_RUNTIME` | Two tenants + platform admin created from scratch |
| Technician task lifecycle isolation | `VERIFIED_RUNTIME` | Cross-tenant start / complete / blocker → **404** |
| Finance isolation | `VERIFIED_RUNTIME` | Cross-tenant settlement read, payment, job total, invoice issue → **404** |
| Inventory isolation | `VERIFIED_RUNTIME` | Cross-tenant approve / issue → **404**; victim's stock unchanged |
| Workshop creation vs capability | `VERIFIED_RUNTIME` | Inventory-off workshop: 0 warehouses, 0 items, no CATALOG step |
| Workshop creation vs plan ceiling | `VERIFIED_RUNTIME` | `maxWarehouses: 0` plan no longer provisioned a warehouse |
| Branch ↔ warehouse authorisation | `VERIFIED_RUNTIME` | Correct store allowed, wrong store refused, both directions |

---

## 4 · Cross-tenant probe results

Same 13-probe suite, same fixtures, before and after. Alpha's staff attacking Beta's resources.

| Probe | Before | After |
|---|---|---|
| B1 technician starts a foreign task | **201 — task moved to IN_PROGRESS** | **404** |
| B2 technician completes a foreign task | **201 — task moved to DONE** | **404** |
| B3 technician blocks a foreign task | **201 — TaskBlocker written** | **404** |
| B4 read a foreign invoice settlement | 403¹ → **200 once delegated** | **404** |
| B5 pay a foreign invoice | 403¹ → **201, balance 1000→750, Payment filed under the payer** | **404** |
| B6 approve a foreign part request | 403² → **201 against an inventory-enabled victim** | **404** |
| B7 issue stock from a foreign warehouse | 403² → **201, victim's stock 18→17** | **404** |
| B8–B9 foreign work order reads | 404 | 404 |
| B10 foreign job total | **200** | **404** |
| B11–B13 operator / history / stock lists | blocked | blocked |
| **Total leaking** | **4 directly, 6 including delegation** | **0** |

¹ blocked only by a default-false permission the product documents delegating — I granted it legitimately and the leak opened.
² blocked only because that victim had `INVENTORY` disabled — against an inventory-enabled victim the attack succeeded completely.

---

## 5 · Workshop creation proof

Executed against the fixed build on a live API.

```
STOCKED    plan="Full Service"  maxWarehouses=5
  steps:       … STRUCTURE, CATALOG, SPECIALIZATION, SERVICES, VERSION, AUDIT
  STRUCTURE:   1 branch(es), 1 store(s), 1 branch-to-store grant(s).
  provisioned: branches=1 warehouses=1 items=93 balances=93
  within plan ceiling: YES

STOCKFREE  plan="Quick Service"  maxWarehouses=0   (INVENTORY disabled)
  steps:       … STRUCTURE, SPECIALIZATION, SERVICES, VERSION, AUDIT   ← no CATALOG
  STRUCTURE:   1 branch(es), 0 store(s), 0 branch-to-store grant(s).
  provisioned: branches=1 warehouses=0 items=0 balances=0
  within plan ceiling: YES
```

**One deliberate behaviour change.** A workshop with `INVENTORY` on that declares no
store is now **refused** — `"Parts and stock is on, but no store is configured. A part
has to come out of somewhere."` That rule already existed in `validateDraft` and is what
the onboarding wizard previews; the unconditional default store had been silently
satisfying it. Creation and its own validator now agree.

---

## 6 · Test results

All commands run against a test database **rebuilt from migrations alone**.

```
pnpm typecheck                          PASS  (0 errors)
pnpm --filter @mop/api run build        PASS
pnpm --filter @mop/web run build        PASS
pnpm --filter @mop/shared run test      250/250 tests, 13/13 suites

npx jest --runInBand   (apps/api)       139/139 suites, 1282/1282 tests
npx jest               (apps/api)       138/139 suites — see below
```

**Serial is green; parallel is not, and that is a test-infrastructure defect, not a
product one.** A *different* suite fails on each parallel run (`parts-loop` once,
`history.http` the next) because 139 suites share one Postgres database and workers see
each other's tenants. Both suites pass in isolation and serially. Recommended fix:
a schema per `JEST_WORKER_ID`. Tracked as REC-032.

**Architectural gates:**

| Gate | Status |
|---|---|
| `lint-migration-drift` | **PASS** |
| `lint-audit-boundary` | PASS |
| `lint-permission-keys` | PASS |
| `lint-no-hard-delete` | PASS |
| `lint-status-writers` | **FAIL — 5 violations** (REC-010, Phase 3) |
| `lint-tenant-scope` | **FAIL — 75 sites** (REC-031) |
| `lint-money`, `lint-directional-css`, `lint-touch-targets`, `lint-dead-links` | FAIL — pre-existing, untouched |
| eslint | FAIL — 72 errors, pre-existing |

The two new gates fail **by design**: they are the instruments that measure the
remaining work, and they now run on every `pnpm lint`.

---

## 7 · What remains open

**This recovery is not complete.** Per the mission's own stop condition, the
project must not be declared recovered while these stand.

| ID | Issue | Sev |
|---|---|---|
| REC-033 | **A stock reservation is never consumed or released.** Reserved units leave the sellable shelf permanently — no code path anywhere writes `RELEASE_RESERVATION` or turns reserved stock into issued stock. A workshop's sellable count bleeds down while the parts are still on the shelf | **P1** |
| REC-019 | **The dual-spine problem.** Two sources of truth for enabled modules — `TenantConfiguration.enabledModules` vs `modulesForProfile(capabilities)` — and `CapabilityChangeService.apply()` never updates the stored list | **P1** |
| REC-031 | 72 bare-id loads triaged as internal but **not individually verified** | **P1** |
| REC-020 | 71 eslint errors | P3 |
| REC-042 | 23 web tests describe the inspection panel that was replaced. No capability lost; the rewrite is scoped in the register | P3 |
| REC-022–029, 032 | Dead configuration, stale detectors, report branch scope, transfer rows, parallel test isolation | P2–P3 |

**The dual-spine convergence (mission Phase 3) is untouched** and remains the
largest single risk.

### Two things worth carrying forward

**The red suite was a report, not noise.** 90 failing web tests had been read as
stale for weeks. Taking them literally found eight capabilities that had been
deleted from the product — including the two that meant no job could be closed.
Every one had the same signature: *a method on a component with no caller.* That
grep is worth running deliberately, not just when a test complains.

**A passing API suite proved nothing about the product.** `walkthrough.http.spec.ts`
drives the whole journey to `CLOSED` and passes, while no page in the web app
could issue an invoice or finish a job. Service-level and even HTTP-level tests
cannot see a button that is not there.

---

## 8 · Recommended order for the next session

1. **REC-033** — give a reservation an end. This needs the part-request spine
   settled first, which makes it the natural way into Phase 3.
2. **REC-019** — one source of truth for enabled modules.
3. **REC-031** — drive `lint-tenant-scope` to zero, annotating each justified
   internal load.
4. **REC-042** — rewrite the inspection-panel tests against the stage that
   exists; the guarantees to preserve are enumerated in the register.
5. **REC-032** — a schema per jest worker, so `pnpm test` is trustworthy in
   parallel.
