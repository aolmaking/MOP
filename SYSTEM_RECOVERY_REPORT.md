# MOP System Recovery — Report (Phases 0–2)

**Branch:** `recovery/architectural-convergence`, forked from `main` @ `663eecd`
**Commits:** `b3b9585` · `37264b7` · `32484c9` · `ee0417e`
**Sibling worktrees** (`E:/mop-fleet/{w-a3,w-infra,w-int}`) were not touched.

> This report covers the phases actually completed and verified. **Phases 3–12 of the
> mission remain open** and are listed in §7. Nothing here is described as done
> that was not executed and observed.

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
| Architectural linters reached by `pnpm lint` | **none** | **all ten** |

**Architectural convergence:** not yet. The dual-spine problem (§7, Phase 3) is untouched.
**Tenant isolation:** every path proven exploitable is closed and re-verified at runtime; 75 flagged sites remain triaged-but-unverified.
**Database integrity:** restored, and now guarded in CI.
**Workflow integrity:** unchanged — `WorkOrder.status` is still written outside the lifecycle service in five places.
**Inventory integrity:** unchanged — the reservation ledger gap (REC-015) is untouched.

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

**This recovery is not complete.** Phases 3–12 were not started. Per the mission's own
stop condition, the project must not be declared recovered while these stand:

| ID | Issue | Sev |
|---|---|---|
| REC-010 | `WorkOrder.status` written outside the lifecycle in 5 places — no graph check, no gate, no event, no audit | **P1** |
| REC-031 | 75 bare-id loads triaged as internal but **not individually verified** | **P1** |
| REC-012 | Operator `update-quote` / `approve-repair` return **HTTP 400** — page sends `note`/`tasks`, DTOs declare `notes` and no `tasks` | **P1** |
| REC-013 | No frontend calls `POST /finance/work-orders/:id/invoice`; `READY_FOR_DELIVERY → CLOSED` is gated on `invoice.issued` | **P1** |
| REC-014 | Inspection `CRITICAL` collapses to Prisma `HIGH`; three gates and two policy options unreachable | **P1** |
| REC-015 | `OperatorService` writes stock balances with no `StockMovement`; no `RESERVE`/`RELEASE` movement type exists | **P1** |
| REC-021 | `OperatorController` gates on a hardcoded role list, not `EffectiveAccessService`; no branch-scope check | **P1** |
| REC-016, 019, 022–029, 032 | Duplicate fault projection, dual module truth, dead configuration, stale detectors, report branch scope, lint-money coverage, parallel test isolation | P2–P3 |

**The dual-spine convergence (mission Phase 3) is untouched** and remains the largest
single risk: the shipped operator/technician flow still bypasses the lifecycle service,
the stock ledger, the decision model and the audit trail.

---

## 8 · Recommended order for the next session

1. **REC-012** — the operator's two write endpoints 400 in a browser. Smallest fix, largest visible unblock.
2. **REC-013** — an invoice-issuance path, so a job can reach `CLOSED`.
3. **REC-014** — one severity scale end to end.
4. **REC-010 + REC-015 + REC-021** — spine convergence: route the operator flow through the lifecycle service, `StockService` and `CustomerDecisionService`, then delete the bypass. `lint-status-writers` and `lint-tenant-scope` go green as a consequence, which is the signal that convergence actually happened.
5. **REC-031** — drive `lint-tenant-scope` to zero, annotating each justified internal load.
6. **REC-032** — a database or schema per jest worker, so `pnpm test` is trustworthy.
