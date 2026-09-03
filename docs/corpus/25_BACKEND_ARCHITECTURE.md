# MOP — Backend Architecture

> **Document ID:** DOC-25
> **Purpose:** how `apps/api` is layered, what each layer may and may not do, and the mechanisms that keep the layering real.
> **Authority:** ARCHITECTURAL.
> **Scope:** `apps/api/src/**`.
> **Last verified:** 2026-09-01 against commit `a8c8bb5`. NestJS; 30 controllers, 85 services, 32 modules, 104 API specs (62 of them integration).
> **Source of truth:** the directory tree, [`../../REORGANIZATION_REPORT.md`](../../REORGANIZATION_REPORT.md), [`../SYSTEMS.md`](../SYSTEMS.md).
> **Related:** 18 (subsystem catalog), 24 (frontend — same vocabulary), 22 (invariants), 29 (integration map).

---

## 1. The layering, and why it is named this way

`apps/api/src` is organised by **boundary**, not by file kind. There is no `controllers/`, `services/`, `dtos/` — those say what a file *is*, which is the least interesting thing about it. The layer name says what kind of *decision* lives there.

```
audit/         the AuditLog WRITE boundary
runtime/       config · database · health · http · scheduler
identity/      auth/ (sessions, guards)  ·  access/ (the resolver + 11 layers)
control/       capabilities · policies · governance · tenant-relationships · platform
systems/       operations · inventory · finance · billing · people · customer · forms
experiences/   branch-manager · technician · team-leader · owner
insights/      analytics · analyst-reporting · owner-reports · workflow-health
```

`audit/` stays top-level rather than living under `control/` for a concrete reason: **`tools/lint-audit-boundary.mjs` matches this literal path.** Moving it would silently weaken the rule.

## 2. The layer contract

| Layer | May | May not |
|---|---|---|
| `runtime/` | Own framework plumbing | Contain any business meaning |
| `identity/` | Decide *who* and *may they* | Know what a work order is |
| `control/` | Shape a tenant | Be written to by `systems/` |
| `systems/` | Own business rules and their tables | Import `experiences/`; touch another system's tables |
| `experiences/` | Compose `systems/` for one role | **Write directly** |
| `insights/` | Read and derive | Write operational data |
| `audit/` | Write `AuditLog` | — |

**Rule of thumb.** If it is a business rule — *can this transition happen*, *what does this cost* — it belongs in `systems/` or `control/`. If it is *how role X sees or uses that rule*, it belongs in `experiences/`.

### The two directional rules

1. **`experiences/` never writes directly.** A role surface calls the owning system's service. `BranchManagerController` sends an intent to `WorkOrderLifecycleService`; it does not write `WorkOrder.status`.
2. **`systems/` never imports `experiences/`.** A business rule that needs to know which role is asking has been designed wrongly; pass what it needs, not who is asking.

`insights/` has exactly one write — `POST /organization/workflow-health/issues/:fingerprint/acknowledge` — and it records that an operator has *seen a finding*, not a change to operational data.

## 3. Bounded systems and their contracts

Six systems on one spine. **A system never reads or writes another system's tables directly.**

- **Cross-system reads** go through a published contract in `packages/shared/src/contracts/cross-system.ts` — `ChargeableWorkItem`, `InvoiceCandidate`, `InvoiceIssued`, `InvoiceSnapshot`, `BillingValidationResult`.
- **Cross-system changes** go through a domain event from the closed 46-key union.

The worked example: Inventory does not write invoices. It produces a `ChargeableWorkItem` carrying `provenance` and `inventoryItemId`; Finance Core consumes it. That is why *"the Pricing page could write `PriceCatalogEntry` but nothing in the money path read it"* was a findable defect rather than a matter of opinion — **the reader is a named function.**

## 4. Request lifecycle

```
HTTP
 → SessionGuard                    (attaches request.session)
 → PlatformGuard                   (platform routes only)
 → ValidationPipe / DTOs
 → Controller
     ├─ this.access.can(session, "key")      or a helper
     ├─ resource-ownership check              (requireTechnician, requirePartOnMyJob)
     └─ delegate to a system service
 → Service
     ├─ resolve capabilities and policies
     ├─ open a transaction
     ├─ write + emit OperationEvent + write AuditLog
     └─ commit
 → response  (money as string; restricted fields absent)
 → error interceptor → { code, message, details? }
```

Two properties worth stating explicitly:

- **Permission checks live in the method body**, not in a decorator. `can(session, key)` takes a bare `string` because a couple of call sites build the key at runtime — which is exactly why `lint-permission-keys.mjs` exists.
- **Tenant scope comes from the session.** No endpoint accepts a client-supplied `tenantId`.

## 5. Modules

32 Nest modules, one per bounded area. Notable shapes:

- `operations/` splits `OperationEventsModule` out from `OperationsModule`, so the event pipeline can be imported by systems that must emit without pulling in the whole operations graph.
- `people/` is three modules — `organization`, `team`, `specialization` — because they have genuinely different consumers.
- `platform/` carries `PlanLimitsModule` separately, so ceiling enforcement can be imported by `people` (staff invite, branch and warehouse creation) without `people` importing the whole platform surface.

## 6. Data access

`runtime/database/PrismaService` is the only Prisma access point. Services take it by injection; nothing constructs a client.

Transactions are `prisma.$transaction(async (tx) => …)`, and **the `tx` is threaded down** into `AuditService.record()`, `StockService.record()` and `WorkOrderLifecycleService.apply()`. A lock that does not extend to the write it authorises is not a lock — doc 23 §5.

Raw SQL appears in exactly three places, each justified in a comment: `pg_try_advisory_xact_lock` for the scheduler, and `SELECT … FOR UPDATE` in stock, blockers and team membership.

## 7. Error shape

`{ code, message, details? }`, produced by `runtime/http`.

`code` is machine-readable and stable (`transition_not_allowed`, `gate_blocked`, `idempotency_conflict`, `tenant_unavailable`, `work_order_not_found`, `forbidden`). `message` is what a person reads — which is why plan-limit refusals **name the actual limit**, and why gate refusals carry `details` listing **every** unsatisfied gate rather than making the user fix one thing at a time.

The frontend renders `PresentedError.message` through shared plumbing, so a new backend refusal usually needs **no web change at all**.

## 8. The six lint rules

Each encodes a rule that was previously broken by a well-meaning change. All six run in `corepack pnpm lint`.

| Tool | Enforces |
|---|---|
| `lint-audit-boundary.mjs` | No `AuditLog` write outside `apps/api/src/audit/**` |
| `lint-money.mjs` | Money crosses the API as a string, never a number |
| `lint-permission-keys.mjs` | Every key literal reaching the resolver is declared |
| `lint-directional-css.mjs` | No physical-direction CSS |
| `lint-touch-targets.mjs` | Minimum touch target sizes |
| `lint-no-hard-delete.mjs` | No hard delete of anything with history |

> A rule that lives only in a document will be broken by someone in a hurry. Prefer DB constraint > lint > type > test > convention.

## 9. Testing

104 API specs, **62 of them integration against real Postgres**, colocated with the code they cover — there is no separate `tests/` tree.

> **Mocks prove nothing about constraints, transactions or cascades.**

```bash
export DATABASE_URL="postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public"
corepack pnpm --filter @mop/api test
```

## 10. Two traps that cost real time

1. **After adding an export to `packages/shared`, rebuild it** — `corepack pnpm --filter @mop/shared run build` — or `apps/api` typecheck will not see it.
2. **After creating a migration, run `corepack pnpm db:test:prepare`**, or integration tests hit a test database missing the new table and fail with a confusing 500.

## 11. Adding a feature — the order that works

1. **Schema** — model + migration in `packages/database`.
2. **Shared** — types, registry entries, contracts. Rebuild `@mop/shared`.
3. **System service** — the business rule, in the owning `systems/` folder. Transaction, event, audit.
4. **Graph** — if it changes what may happen, edit `workflow-graphs.ts` and run the validators.
5. **Permission** — declare the key, add a baseline role entry, check it at the call site.
6. **Controller** — in `systems/` if it is the system's own surface, in `experiences/` if it is a role's composition.
7. **Test** — integration against real Postgres, not a mock.
8. **Frontend** — API client, then page.
9. **Verify the whole chain**, browser to database and back.

**Steps 6–9 are not optional.** This project's own record contains four finished, tested systems with no door, and six domain commands with no endpoint. `[IMPLEMENTED]` is not `[INTEGRATED]`.

## 12. Implementation status

| Element | Status |
|---|---|
| Boundary-named layering | ✅ |
| `experiences/` never writes; `systems/` never imports `experiences/` | ✅ convention + review |
| Cross-system contracts and closed event union | ✅ |
| Single Prisma access point | ✅ |
| Transaction threading into audit, stock and lifecycle | ✅ |
| Uniform error shape rendered by shared frontend plumbing | ✅ |
| Six lint rules in CI | ✅ |
| 62 real-Postgres integration specs | ✅ |
| **A lint rule for the single-status-writer invariant (W-1)** | 🔴 `[INTENDED]` — currently convention and review only, unlike the audit boundary it resembles |
| **A scan for service methods with no HTTP door** | 🔴 `[INTENDED]` — six exist today; nothing in CI notices |
