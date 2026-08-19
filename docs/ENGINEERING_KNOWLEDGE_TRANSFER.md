# MOP — Complete Engineering Knowledge Transfer

**Date produced:** 2026-08-14
**Status of repository at time of writing:** branch `main`, 5 commits ahead of `origin/main`, one untracked file (`docs/PHASE_COMPLETION_AUDIT.md`), 154 commits total. Verified counts at last full gate run (per `PROJECT_STATE.md`, cross-checked against test-file counts below): 480+ API tests, 225 web tests, 121 shared tests, typecheck clean, six custom lint rules passing, full build green.

**Purpose.** This document is a complete handoff. It was produced by directly reading the repository — schema, controllers, routes, tooling, docs — not by trusting prior documentation. Every claim is tagged with a confidence marker:

`[VERIFIED]` directly read from code/schema · `[PARTIAL]` partially implemented · `[DEMO]` exists for demonstration/seed only · `[MOCK]` static/fake · `[PLACEHOLDER]` structural stub · `[MISSING]` not implemented · `[UNKNOWN]` not confidently determinable from this pass · `[PRODUCTION-UNSAFE]` works but unsafe to ship as-is · `[PRODUCTION-READY]` sufficiently implemented and verified for its scope.

If you are an AI agent or engineer picking this up cold: read §0 (what this is), §16 (START HERE), then the section for whatever you're about to touch. Do not restart the project — see §1 and §17 for what is already solid.

---

## 0. What MOP is, in one page

MOP (Maintenance Operations Platform) is a multi-tenant SaaS for running automotive/equipment maintenance workshops. One codebase serves radically different workshop shapes — a one-bay quick-lube shop and a twelve-branch dealership run identical code with different **capabilities** switched on. The mental model, taken verbatim from `docs/VISION.md` (`[VERIFIED]` read in full by a research pass): *a single repair is a distributed transaction across five roles (branch manager, technician, inventory manager, finance, customer), and MOP's job is to make sure it never silently lies to anyone.*

Development is **waterfall, not agile**, by explicit project rule (`CLAUDE.md`): foundations are deliberately over-invested in, because every later phase inherits the shape decided early. Re-planning at a phase boundary is expected; silent drift from the plan is not.

The product is organized around **six systems on one spine**: Operations, Inventory, Finance Core, Billing/Invoicing (deliberately split from Finance — invoices become legal compliance artifacts under e-invoicing regimes like Saudi ZATCA/Egypt ETA), People & Performance, Governance & Control. A system never reads another system's tables directly — cross-system communication is через typed contracts and domain events (`packages/shared/src/contracts/`, `OperationEvent` rows).

The **capability engine** is the architectural core: Platform Super Admin shapes each workshop by disabling what it doesn't need. Removal is workflow *rewiring*, not feature hiding — the schema shape never changes (a single-branch workshop still has one hidden `Branch` row). The load-bearing guarantee, mechanically checked before any capability change is applied: **after any capability change, every reachable non-terminal workflow state must still have a path to a terminal state.** `[VERIFIED]` — implemented in `packages/shared/src/capabilities/validator.ts`, proven by dedicated BFS-reachability tests.

---

## 1. Repository structure

```
apps/
  api/            NestJS backend — auth, permissions, capabilities, operations, all business modules
  web/             Angular 22 frontend — one SPA, role-based "shells" per persona
packages/
  database/        Prisma schema (2149 lines), migrations, two seed scripts
  shared/          Types, permission manifest, capability engine (pure/DB-free), money arithmetic, contracts
tools/              doctor, pnpm shim, env loader, six custom structural lint rules
docs/               Spec, architecture docs, per-phase detail docs, three scenario-research passes, policy inventory
```

**apps/api** `[VERIFIED]` — NestJS. Entry `apps/api/src/main.ts`. ~30 feature modules under `apps/api/src/*` (see §5). Runtime: Node 24, Jest for tests (unit + `*.integration.spec.ts` against real Postgres). Depends on `@mop/shared` via its **built** `dist/` — a fresh checkout without `pnpm --filter @mop/shared run build` will fail typecheck; this bit CI once (§9).

**apps/web** `[VERIFIED]` — Angular 22, standalone components, `loadComponent` lazy routing, single `app.routes.ts` (no per-feature route splitting). Test runner is Angular's own `@angular/build:unit-test` (Vitest-backed).

**packages/database** `[VERIFIED]` — Prisma schema at `packages/database/prisma/schema.prisma`, `postgresql` datasource, generator output at `packages/database/generated/client`. Two seed scripts (`seed.ts`, `seed-demo.ts`), both idempotent, both re-implement scrypt hashing locally rather than importing from `apps/api` (deliberate — avoids a backend dependency in a package meant to be runnable standalone).

**packages/shared** `[VERIFIED]` — pure TypeScript, no NestJS/DB dependency. Houses the capability engine (registry, gates, workflow graphs, router, reachability validator — all pure functions, exhaustively unit-testable), the money module (integer minor-units arithmetic), the permission manifest (the single source of truth for every valid permission-key string), and cross-system contracts.

**tools/** `[VERIFIED]` — six dependency-free Node scripts enforcing structural invariants at build/CI time (not just convention): audit-write boundary, directional-CSS/RTL, touch-target floor, money-arithmetic safety, permission-key existence, no-hard-delete on governance tables. Full descriptions in §10.

**docs/** `[VERIFIED]` — large and load-bearing; this is a project that documents architectural decisions *before* writing code, per its own waterfall rule. Index at `docs/README.md`. See §14 for the full map.

---

## 2. Runtime & deployment architecture (current state)

`[VERIFIED for local dev]` `[UNKNOWN/MISSING for production]`

- **Local dev topology**: `docker compose up -d` runs a single Postgres 16 container (`docker-compose.yml`: user `mop_dev`, db `mop_platform_dev`, port 5432, healthcheck). `corepack pnpm dev` runs API (port 4000, pinned via `tools/with-port.mjs`) and web (port 4200, Angular dev server proxying `/api` to 4000) in parallel.
- **No production deployment infrastructure exists in this repository.** No Dockerfile for `apps/api` or `apps/web` was found by the research passes, no Kubernetes/Terraform/IaC, no CI deploy stage (`.github/workflows/ci.yml` ends at `pnpm build`, `[VERIFIED]`), no cloud provider config. **`[MISSING]`** — this is the single largest gap between "current state" and "real production SaaS" named in this document, and is elaborated in §12 and §13.
- **CI**: GitHub Actions, single job, `ubuntu-latest`, real Postgres 16 service container, pipeline order: checkout → pnpm/node setup → `pnpm install --frozen-lockfile` → `pnpm db:generate` → `pnpm build:shared` → `pnpm db:deploy` (real migrations against the CI Postgres) → `pnpm lint` (all six custom rules + eslint) → `pnpm typecheck` → `pnpm test` (Jest shared+api, Vitest web) → `pnpm build`. `[VERIFIED, PRODUCTION-READY for its scope]` — but its scope is "does the code build and pass tests," not "can this be deployed."
- **Environment configuration**: validated at API boot time (`apps/api/src/config/environment.ts`) — crashes with exit code 78 on misconfiguration rather than degrading silently. Required: `DATABASE_URL` (must match `postgres(ql)://`), `NODE_ENV`, `CORS_ORIGIN` (in production must be `https://`, must not be `*`), throttle limits. `.env.example` documents only the local Postgres URL. **No production `.env` template, no secrets-manager integration exists.** `[MISSING]`

---

## 3. Database architecture — deep audit

Source: `packages/database/prisma/schema.prisma`, 2149 lines, read in full. This is the most mature and best-documented part of the codebase — nearly every non-obvious modeling decision carries an in-schema comment explaining *why*, which is unusual and valuable; preserve this discipline in any future schema work.

### 3.1 Enum inventory (exact, verified)

The two headline enums cited in `CLAUDE.md` are confirmed exact:

- **`WorkOrderStatus`** — 16 values `[VERIFIED]`: `DRAFT, REGISTERED, UNDER_INSPECTION, AWAITING_CUSTOMER_APPROVAL, APPROVED_FOR_WORK, IN_PROGRESS, WAITING_PARTS, WAITING_CUSTOMER, BLOCKED, READY_FOR_TEAM_REVIEW, READY_FOR_QC, QC_FAILED, READY_FOR_DELIVERY, PAYMENT_PENDING, CLOSED, CANCELLED`. Schema comment: "authored directly from docs/PRODUCT_SPEC_CANONICAL.md's 'CORE WORK ORDER LIFECYCLE' list. The old schema was missing 6 of these."
- **`PartRequestStatus`** — 19 values `[VERIFIED]`: `DRAFT, REQUESTED, WAREHOUSE_REVIEWING, APPROVED, ISSUED, IN_TRANSIT, ARRIVED, RECEIVED_BY_TECHNICIAN, USED, REJECTED, UNAVAILABLE, WAITING_TRANSFER, WAITING_SUPPLIER, RETURN_REQUESTED, RETURN_ACCEPTED, RETURNED_TO_STOCK, RETURN_REJECTED, RETURN_CLARIFICATION_REQUESTED, CANCELLED`.

Roughly 35 further enums cover account/tenant status, staff roles, task/blocker states, inventory movement types, invoice/payment states, capability/policy states, etc. Full list is in the research transcript; the ones with direct product-behavior consequences:

- **`TenantStatus`**: `ACTIVE, TRIAL, PENDING_SETUP, FROZEN, SUSPENDED, READ_ONLY, ARCHIVED` — enforced by `TenantStatusLayer` in the permission resolver (§6.3).
- **`TenantCapabilityStatus`**: `ENABLED, DISABLED, READ_ONLY, EXTERNAL, LOCKED` — `EXTERNAL` is load-bearing: "a workshop that issues legal invoices from separate accounting software is EXTERNAL for billing, not DISABLED — the business function still happens, MOP just does not perform it" (schema comment, quoted verbatim).
- **`StaffRestrictionStatus`**: `NONE, RESTRICTED_PENDING_INVESTIGATION` — Phase 19.D, a "third state between active and platform-wide freeze... a single account under investigation, curtailed pending resolution, not a declaration of guilt" (schema comment).
- **`PartProvenance`**: `INVENTORY, EXTERNAL_PURCHASE, CUSTOMER_SUPPLIED` — exists because "a customer who brings their own part and pays only for fitting cannot be modelled as an inventory item priced at zero... a different liability position, because warranty disputes turn on who supplied the part" (schema comment).

### 3.2 Model inventory and key relationships

~85 models. No generic `Role`/`Permission` entity — `StaffRole` is a fixed 7-value enum (`TENANT_OWNER, TENANT_ADMIN, BRANCH_MANAGER, TECHNICIAN, INVENTORY_MANAGER, TEAM_LEADER, DATA_ANALYST`), and "permissions" are string keys attached per `(tenant, role)` via `RolePermission` or per-user via `UserPermissionOverride` — not normalized join tables.

Key entity relationships, as actually declared (not as commonly assumed):

- **Tenant** is the isolation root. Nearly every model FKs to it, `onDelete: Cascade` — **except** finance-critical tables (`Invoice`, `Payment`), which use `onDelete: Restrict` on the tenant FK specifically so a cascading tenant delete cannot silently destroy financial history.
- **Customer ↔ Asset is NOT a direct FK.** Ownership is mediated by `AssetOwnershipHistory` (time-ranged via `endedAt`; null = current owner). `Asset.currentOwnerCustomerId` is a bare string with **no FK relation** — it must never be trusted directly; current ownership must be derived from the open `AssetOwnershipHistory` row. This exists specifically so a new owner's history view excludes the previous owner's private service records.
- **There is no `JobCard` model.** The job-card-equivalent structure is `Task` + `Subtask` + `TaskAssignment` + `TaskBlocker`, all hanging off `WorkOrder.workOrderId` (Cascade).
- **WorkOrder → Invoice** is 1:1 (`Invoice.workOrderId @unique`, Restrict). Also 1:1 to `Quotation` and `RunningInvoice`.
- **`WorkOrderPartLine` is billing-facing; `PartRequest` is inventory-facing** — deliberately split, because a customer-supplied part has a `WorkOrderPartLine` (for billing) but no `PartRequest`, no `IssuedItem`, no `StockMovement`, and no cost.
- **`IssuedItem.partRequestId` is deliberately NOT unique.** One request can be fulfilled by many issue events over time ("3 requested, 2 issued, 1 issued tomorrow"). Fulfilment is always derived via `SUM(quantity)`, never cached in a column — schema comment: "a cached total is a second source of truth, and the two will eventually disagree."
- **`Invoice` is immutable once issued** — `InvoiceLine.lockedUnitPrice`/`lockedLaborPrice` are snapshots taken at issue time, independent of any later change to `PriceCatalogEntry`.
- **`BillingDocument` is distinct from `Invoice`** — Finance owns the settlement record (Invoice); Billing gets its own row, lifecycle, and an immutable rendered snapshot (`snapshot Json`) captured once and never re-read from Invoice later. This is the seam Egypt ETA / Saudi ZATCA adapters plug into.

### 3.3 Tenant isolation as declared in the schema — and a real leak-risk pattern

`[VERIFIED]` Most models carry a direct `tenantId` FK to `Tenant`. A second group carries `tenantId` but is scoped only *indirectly* through a parent FK (e.g. `Task.tenantId` sits alongside `Task.workOrderId`, redundantly, rather than deriving tenant scope purely through the join).

**This redundancy is a genuine architectural risk worth flagging explicitly** (this is a finding from this research pass, not a restated project claim): because so many child tables carry their own `tenantId` scalar *in addition to* a parent FK, nothing in the schema — no composite FK, no DB check constraint — prevents `Task.tenantId` from disagreeing with `Task.workOrder.tenantId`. The invariant "child.tenantId == parent.tenantId" is enforced entirely by application-layer discipline, not the database. A future write path that sets `tenantId` from session context without also validating it against the parent record's actual tenant is a silent cross-tenant data-integrity bug waiting to happen. **`[PRODUCTION-UNSAFE]` until this is either enforced by a service-layer assertion helper used everywhere, or accepted as a documented, tested invariant with regression coverage.** No such centralized assertion helper or dedicated cross-tenant-consistency test was found in this pass — mark this **`[UNKNOWN — investigation required]`** whether one exists elsewhere in service code not covered by the audit.

A second observation: essentially every "who did this" field across the entire schema (`requestedById`, `approvedById`, `issuedById`, `actorId`, etc.) is a **bare string with no declared Prisma relation** to `StaffUser`/`Account`. This is systemic and deliberate (avoids FK churn), but means referential integrity for actor attribution is not DB-enforced anywhere — a typo'd or stale actor ID would silently persist.

### 3.4 Soft-delete, audit, and non-destructive patterns

No boolean `isDeleted` flag pattern exists anywhere. Instead, four different non-destructive patterns are used depending on the model, all verified in the schema:

1. **Time-ranged "open row" pattern**: `AssetOwnershipHistory`, `TeamMembership`, `TenantCapability`, `WorkshopPolicy` — `endedAt`/`effectiveTo` null means "current." The "exactly one open row per key" invariant is enforced at the **service layer**, not the DB, because "Prisma cannot express a filtered index" (schema's own comment) — this is a genuine gap: nothing stops a service-layer bug from creating two simultaneously-open rows. `[PRODUCTION-UNSAFE]` without either a partial unique index added via raw SQL migration, or dedicated regression tests proving the invariant holds under concurrency (the edge-case register — §8 below — treats several similar concurrency gaps as fixed; this specific one was not confirmed fixed in this pass).
2. **Append-only ledgers**: `StockMovement`, `AuditLog`, `OperationEvent`, `WorkOrderDispute`, `MessageTemplate` (new version row per edit) — never mutated.
3. **Archive flag, not delete**: `CustomFieldDefinition.isArchived`.
4. **`isActive` toggle**: `Branch`, `Warehouse`, `Team`, `StaffUser`, `SpecializationDefinition`, etc.

`AuditLog` is the single sanctioned audit-write target, and this is enforced **structurally**, not just by convention — `tools/lint-audit-boundary.mjs` fails the build if any file outside `apps/api/src/audit/**` calls a write method on `.auditLog`. `riskLevel` is a required field with no default, specifically because the previous implementation only populated it "ad hoc, inside a JSON blob, for 2 of many audited action types" (schema comment).

### 3.5 Tables named in `PROJECT_STATE.md` — existence verified

All seven exist: `InvoiceSequence`, `ControlSetting`, `RefundRequest`, `CreditNote`, `TenantStakeholder`, `TenantGroup`, `WorkOrderDispute`. Two are flagged as not fully wired:
- **`CreditNote`** `[PARTIAL]` — schema comment states "Phase 8 created this table and never wrote it; Phase 9 wires it to the refund approval flow." Whether Phase 9's wiring has actually landed needs verification against current `finance.service.ts` (the API-audit pass confirmed `POST finance/invoices/:id/refunds`/`approve`/`reject` endpoints exist and are wired — treat `CreditNote` as **`[VERIFIED, wired]`** based on that, superseding the schema comment's own staleness).
- **`BlockerReasonDefinition`** `[PLACEHOLDER]` — schema-only; `TaskBlocker` still uses the fixed `BlockerReason` enum, not this table, "until a later pass retrofits it" (named explicitly in-schema, not silently deferred).

---

## 4. Business invariants — verified enforcement

This section states each invariant, its enforcement layer, and its actual current status, per the mandatory format.

| Invariant | Enforcement layer | Status |
|---|---|---|
| A tenant must never access another tenant's data | Service-layer `tenantId` filtering on every query + permission resolver | `[PARTIAL/PRODUCTION-UNSAFE]` — see §3.3; no DB-level composite-FK or check-constraint backstop exists for the redundant-tenantId pattern |
| Stock cannot become negative | `StockService` + DB CHECK constraint (migration `20260809203000_stock_never_negative`) | `[VERIFIED, PRODUCTION-READY]` — enforced at both layers, proven by a concurrent-issue integration test (edge case H6/E16, closed) |
| A part consumed by a work order affects inventory | `PartRequest` → `IssuedItem` → `StockMovement`, all in one transaction per `StockService.record()` | `[VERIFIED]` |
| WorkOrder.status only changes through one path | `WorkOrderLifecycleService.apply()` — confirmed via grep to be the only production code path calling `workOrder.update`/`updateMany` on status; every other match was test-fixture code | `[VERIFIED, PRODUCTION-READY]` |
| A completed/closed work order cannot silently reopen or accept stale consent | `CustomerDecisionService.respond()` checks terminal status (H4, closed); `WorkOrderDispute` is non-destructive/append-only for factual challenges | `[VERIFIED]` |
| Invoice is immutable once issued | `InvoiceLine.lockedUnitPrice/lockedLaborPrice` snapshots; `Invoice.locked` flag | `[VERIFIED]` |
| Payments are idempotent | `Payment.idempotencyKey` globally unique, check-then-insert race fixed (H5, closed, proven by concurrency test) | `[VERIFIED, PRODUCTION-READY]` |
| Invoice numbering has no race | `InvoiceSequence`/`CreditNoteSequence` atomic upsert (`INSERT...ON CONFLICT`), replacing an earlier `count()+1` race (H3, closed, proven by a 10-way concurrent test) | `[VERIFIED, PRODUCTION-READY]` |
| A branch manager cannot approve their own refund request | `finance.refund.request` vs `finance.refund.decide` are two separate permission keys | `[PARTIAL/PRODUCTION-UNSAFE]` — PROJECT_STATE.md's own words: "by default" separation only, not structurally enforced; Phase 19.A's stronger enforcement attempt was **reverted** after it broke 22 legitimate tests for single-storekeeper shops — no per-workshop policy exists yet to resolve this, it is an explicitly open architectural gap (`docs/ARCHITECTURE_DECISION_INVENTORY.md`) |
| Reachability: every non-terminal state has a path to a terminal state after any capability change | `validateCapabilityProfile()` in `packages/shared/src/capabilities/validator.ts`, BFS both directions, called before every `apply()` | `[VERIFIED, PRODUCTION-READY]` — the project's own proof showcase, dozens of dedicated tests |
| Money is never a float, no precision loss | `packages/shared/src/money` (integer minor units) + `tools/lint-money.mjs` build-time enforcement | `[VERIFIED, PRODUCTION-READY]` |
| A stakeholder never accumulates role-like broad permissions by convention drift | `TenantStakeholder.permissions` is an explicit narrow string list, structurally separate from `StaffRole` | `[VERIFIED]` |
| A governance record (`ControlSetting`) is never hard-deleted | `tools/lint-no-hard-delete.mjs`, build-breaking, written *before* any code wrote to the table (preventive) | `[VERIFIED, PRODUCTION-READY]` |

---

## 5. API architecture — 27 controllers, ~110 endpoints

`[VERIFIED]` — full inventory produced by direct controller reads. Every route is prefixed `/api/v1`.

### 5.1 Module map (apps/api/src/*)

Feature modules with controllers: `access`, `auth`, `analytics`, `branch-manager`, `customer` (public register/decision + authenticated `customer-portal`), `finance`, `finance-configuration`, `forms`, `governance` (role-permission-lock, tenant-lifecycle), `health`, `inventory`, `messages`, `organization`, `owner` (audit, owner-home), `platform` (workshops, capabilities, reports), `reporting`, `reports`, `team-leader`, `team` (team-setup, reused by both Owner and Branch Manager), `technician`, `workflow-health`.

Support/service-only modules (no controller): `operations` (the workflow engine's DB-facing half — `WorkOrderLifecycleService`, `GateEvaluatorService`, `IntakeService`, `OperationEventsService`, `CustomerSafeProjectionService`), `capabilities` (resolution + governed change pipeline), `billing`, `policies`, `specialization`, `tenant-relationships`, `vehicle-history`, `audit`, `scheduler`, `database`, `config`, `common`.

### 5.2 Endpoint inventory (grouped by module — condensed; full detail in the research transcript this document was built from)

- **auth**: `POST login|refresh|logout`, `GET me`, `POST invite/describe|accept`.
- **access**: `GET check?key=` — self-permission-check.
- **branch-manager**: `GET attention`, `GET/POST intake*`, `GET work-orders[/:id]`, `GET approvals`, `POST approvals/:requestId/record`, `GET delivery`.
- **technician**: `GET active|my-work`, `GET work-orders/:id[/vehicle-history]`, `POST tasks/:id/start|complete|blocker`, `POST work-orders/:id/faults`, `GET work-orders/:id/finish-check`.
- **inventory**: 20 routes — home, catalog CRUD, reports, requests + approve/reject/unavailable/issue, movements, returns + accept/reject/clarify, warehouse deactivate/reactivate.
- **finance**: work-order total/lines/invoice, invoice get, payments (idempotency-key required), refunds request/approve/reject.
- **finance-configuration**: config get/update, price catalog get/set.
- **team-setup**: teams CRUD, leader assignment, member move — gated by `team_setup.branch.manage` and owner-delegation.
- **team-leader**: home, technicians[/:id], supervision notes, work-orders[/:id/vehicle-history], reports — all scoped by `session.managedTechnicianIds`.
- **organization** (Owner): staff CRUD + scope/active/locked patches, infrastructure (branches/warehouses), teams.
- **owner**: audit (own-tenant only), home dashboard.
- **reports** (Owner, 5-tab): overview, operations, financial, inventory, customers.
- **forms**, **messages**, **workflow-health**: Owner's Builder-adjacent config surfaces.
- **platform**: plans, availability checks, `POST workshops` (create).
- **platform/workshops**: list, details, freeze-impact-preview, freeze, reactivate.
- **platform/workshops/capabilities**: get, preview, apply.
- **platform/reports**: overview list, per-workshop usage.
- **governance**: role-permission-lock CRUD (platform-only), tenant archive/reactivate.
- **analytics** (Data Analyst): home, operations, people, inventory, decisions, feature-adoption — all read-only.
- **customer-portal** (authenticated): home, assets, current-service, invoices, safe-history.
- **public/decisions**: `GET/:token`, `POST /:token/respond` — token-authenticated, no session.
- **public/register**: workshop-code lookup + customer self-registration.
- **health**: unauthenticated DB + scheduler heartbeat.

### 5.3 The permission-resolver pipeline — 11 layers, verified precisely

`[VERIFIED]` Location: `apps/api/src/access/permission-resolver.service.ts`. **The array is 11 layers, not the "10" stated in some prior project notes** — confirmed by reading the literal array at lines 66–78:

1. `PlatformControlLayer` — platform-set locks/ceiling by role
2. `PlanEntitlementLayer` — subscription plan's allowed modules
3. `TenantStatusLayer` — `ACTIVE/FROZEN/SUSPENDED/READ_ONLY/ARCHIVED`; `.view`-suffixed keys still pass under read-only statuses
4. `StaffRestrictionLayer` — Phase 19 addition (file comment self-labels "Layer 3.5"); blocks all non-`.view` permissions when `staffRestrictionStatus === RESTRICTED_PENDING_INVESTIGATION`
5. `TenantCapabilityLayer` — workshop's business-function profile; `DISABLED`/`EXTERNAL` both lock-deny
6. `ModuleEnabledLayer` — `TenantConfiguration.enabledModules`
7. `FeatureEnabledLayer` — sparse feature-gated permission list
8. `WorkshopConfigurationLayer` — published Role Experience config; narrows only
9. `DelegationLayer` — owner-delegated permissions (e.g. team management); narrows only
10. `RolePermissionTemplateLayer` — tenant's `RolePermission` rows; never locks
11. `UserOverrideLayer` — most specific, per-user; locks whenever a row exists

Each layer returns `null` (defer) or `{allowed, locked, reason}`. The loop overwrites the running decision on every non-null result and **stops immediately once `locked === true`**. If every layer defers, the hardcoded `DEFAULT_DECISION` (deny) stands. This is deny-by-default with capability sitting *above* role, exactly as `CLAUDE.md`'s load-bearing rule requires. `[VERIFIED, PRODUCTION-READY]` — note several individual layer files' own doc-comments cite stale layer numbers (self-describing as "Layer 4" in two different files); **the array order in `permission-resolver.service.ts` is the sole authority** — do not trust in-file comments for ordering.

**Performance**: `PermissionContextService.load()` wraps its 5-query context load (`ControlSetting`, `Tenant.plan`, capabilities, `RolePermission`, `UserPermissionOverride`, `TenantConfiguration`) in a single `$transaction` at `RepeatableRead` isolation (Phase 20.B, confirmed at lines 76-79), specifically to prevent an internally-inconsistent snapshot if a capability/plan change commits mid-read. All 11 layers then run synchronously over that one snapshot — resolving N permission keys costs one transaction, not N. `[VERIFIED, PRODUCTION-READY]`

`PlatformGuard` deliberately **bypasses this entire chain** for platform-account sessions (its own comment is stale, claiming "8-layer resolver").

### 5.4 Capability engine — implementation map

`[VERIFIED, PRODUCTION-READY]`. Pure logic lives in `packages/shared/src/capabilities/`:
- `registry.ts` — `CAPABILITY_REGISTRY`, 12 capabilities (MULTI_BRANCH, MULTI_WAREHOUSE, INVENTORY, PART_RETURNS, EXTERNAL_PARTS, TEAMS, TEAM_REVIEW, QC, CUSTOMER_PORTAL, FINANCE_CORE, BILLING, QUICK_INSPECTION), each with dependencies/conflicts/removal policy.
- `gates.ts` — `GATE_REGISTRY`, each gate owned by exactly one capability (or `null` = core, never droppable) — this ownership map is what stops "two capabilities disagreeing about a shared gate," the exact bug class named in `CLAUDE.md`.
- `workflow-graphs.ts` — `WORK_ORDER_GRAPH`, `PART_REQUEST_GRAPH`, `CUSTOMER_DECISION_GRAPH`.
- `workflow-router.ts` — `effectiveGraph()` filters edges by active capability profile and splices in each disabled capability's replacement transitions; `resolveIntent()` — declaration order is precedence.
- `validator.ts` — `validateCapabilityProfile()`: static integrity check, then BFS reachability both directions per graph.

API-side glue: `capability-resolution.service.ts` (DB rows → `CapabilityProfile`) and `capability-change.service.ts` (governed preview/apply — re-validates from scratch on apply, wraps the `TenantCapability` row transition + `AuditService.record()` write at `riskLevel: HIGH` in one transaction). Exposed via `platform/workshops/:id/capabilities/{preview,apply}`.

### 5.5 Known hardcoded logic — verified, with context

`gate-evaluator.service.ts` lines 146–152: **`review.team_review_passed` and `qc.passed` both unconditionally return `true`.** This is confirmed still present. The justification (in-code comment): reaching a post-review state is itself the evidence review passed, because the router will only allow that transition after review already happened. **This is a defensible-but-still-hardcoded exception, explicitly flagged as such by the project's own standards** (`CLAUDE.md`: "a gate returning hardcoded true is a defect... the previous implementation had two, and they could never block while appearing to" — these are different two, in different code, reasoned rather than accidental, but worth re-verifying once Team Leader/QC produce independently queryable records, per `PROJECT_STATE.md`'s own §7.2). Every other gate (10 of 12) performs a real Prisma query.

### 5.6 Authentication — not JWT

`[VERIFIED]` Opaque, DB-backed, cookie-based sessions. `token.util.ts` issues `sessionId.secret`; only `sha256(secret)` is persisted, compared via `timingSafeEqual`. Two httpOnly cookies: `mop_access` (path `/`) and `mop_refresh` (path scoped narrowly to `/api/v1/auth/refresh`). `secure` flag tied to `NODE_ENV === production`. `SessionGuard` re-resolves a fresh `SessionContext` from the database on **every request** — never trusts client-decoded claims — which is precisely what lets a mid-session tenant freeze or staff restriction take effect immediately rather than only at next login. Password hashing is scrypt (N=131072, ~128MB/attempt), versioned storage format, lazy rehash on login, `dummyVerifyForTimingSafety()` so "account not found" and "wrong password" are indistinguishable by timing.

### 5.7 Security middleware — verified

Helmet (defaults, no custom CSP found — `[UNKNOWN — investigation required]` whether a CSP is needed before production), body limits explicitly reduced to 256kb (comment notes inspection photos will need a separate larger per-route limit — `[MISSING]`, no such route exists yet), CORS from validated env, `@nestjs/throttler` global (300 req/60s default) plus a stricter auth-specific throttle (10 req/60s) on login/refresh/invite/public-customer routes, a request-id middleware, global `ApiExceptionFilter` + strict `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`), and a global `MoneySerializationInterceptor` forcing all money values to leave the API as strings.

**`[MISSING]` No structured logging.** Grep across `apps/api` for `pino`/`winston`/`nestjs-pino` returned zero matches. Only Nest's built-in console `Logger` is used. This is explicitly named as outstanding in `PROJECT_STATE.md` §7.5 and confirmed still true by this pass — the correlation/request-id the eventual structured logger needs is already emitted, so wiring a transport is the remaining work.

---

## 6. Frontend architecture — routes, pages, components

`[VERIFIED]` Single routing file `apps/web/src/app/app.routes.ts` (349 lines), all `loadComponent` lazy-loaded, no per-feature route splitting. One router-level guard, `authGuard`, applied per-shell (not per-child-route) — it re-resolves the session from the server on every guarded navigation rather than trusting a cached flag. **There is no permission/capability guard at the router level** — every page enforces its own `forbidden`/`403` state client-side after the API denies it. This is a deliberate pattern (matches `CLAUDE.md`'s "restricted data is absent from the response, never hidden client-side" rule) but means route-level access is advisory, not authoritative — authority always lives server-side, which is correct, but it also means there is no single place to audit "what can this role reach" from the frontend alone.

### 6.1 Routes by persona (counts as routed, verified against `app.routes.ts`)

| Persona | Shell | Routed pages |
|---|---|---|
| Platform Super Admin | `/platform` | Workshops list, Add Workshop, Capabilities editor, Reports (+ per-workshop usage drill-in) — **4 pages**. `Governance Controls` and `Workshop Live View` nav links exist in the shell HTML but have **no matching route** — confirmed dead, fall through to `**` → `/` |
| Owner | `/owner` | Home, Audit, Organization, Teams (reuses `TeamSetupPage`), Messages, Forms, Pricing, Reports, Workflow Health — **8 paths / 7 unique components** |
| Branch Manager | `/branch` | Attention Center, Intake, Approvals, Delivery (+ Take Payment), Team Setup, Work Orders board + Workspace — **7/7, complete** |
| Team Leader | `/team-leader` | Home, Technicians, Work Orders, Reports — **4/4** |
| Technician | `/tech` | Now, My Work, Work Card — **3/3** |
| Inventory Manager | `/inventory` | Home, Catalog, Reports, Requests, Stock, Item detail, Returns — **7/7** |
| Data Analyst | `/analyst` | Home, Operations, People, Inventory, Decisions, Feature Adoption — **6/7** (Saved Views/Exports missing — no export mechanism exists anywhere in the codebase) |
| Customer Portal | `/customer` + public | Portal Home, My Assets, Current Service, Invoice Status, Safe History (authenticated) + `/decide/:token` (public, unauthenticated) — **6/6** |

### 6.2 Notable page-level implementation patterns (verified by reading source)

- **Work Orders Board is explicitly not a kanban.** No drag-to-move exists; the code comment states the reasoning directly: "a card the manager could drag would be a card that refuses to move," since every transition is capability/gate-gated server-side. Cards navigate to a workspace detail view instead.
- **Attention Center** is server-ranked, not client-recomputed — a single `GET attention` call returns pre-scored items; the client never re-sorts. `act(item)` is a documented, deliberate no-op pending real action wiring.
- **Customer Decision Page** is the only fully public, unauthenticated page besides login/register. A critical-severity rejection is intercepted into a client-side confirmation modal, explicitly documented as "a courtesy, not the gate" — the server re-validates independently regardless of what the client shows.
- **State machines are explicit and consistent per page**: most pages implement `loading | ready | empty | forbidden | error`, several add domain-specific states (`no-results` distinct from `empty`, `not-delegated` for Team Setup's 403, `not-found` for the token-scoped decision page which deliberately has no `forbidden` state since it isn't session-scoped).

### 6.3 Component system and design tokens

`apps/web/src/app/shared/` — flat, one folder per component (`ButtonDirective` on a real `<button>`, not a wrapper; `StatusPill` taking a plain `tone` input rather than a status enum, leaving status→tone mapping as each page's own decision; `Identifier` component isolating plate/VIN numbers from surrounding bidi text). Design tokens live in one global `apps/web/src/styles.css`: `--bg: #0d0c0c`, `--brand: #d41717`/`--brand-deep: #8e1010`, `--danger: #ff4b3e`, `--white`, IBM Plex Sans Variable + IBM Plex Mono self-hosted, type/spacing/radius scales. This implements the documented 60-30-10 black/red/white identity from `docs/DESIGN_LANGUAGE.md` — **do not replace this with a generic dashboard template**; it is deliberate and justified per-token in that doc.

### 6.4 RTL / i18n — direction infrastructure exists, translation does not

`[PARTIAL]` `LocaleService` centrally sets `lang`/`dir` on `<html>`, backed by an `RTL_LOCALES` set (currently just `ar`), persisted to `localStorage`. `tools/lint-directional-css.mjs` is a build-breaking check for physical CSS properties (`margin-left`, `text-align: left`, etc.) across all of `apps/web/src`, with a documented `allow-physical` escape-hatch comment. **`[MISSING]`**: no message-translation layer exists yet — every UI string is still hardcoded English. This is named as owed to Phase 14 (`🟠 partial` in `PROJECT_STATE.md`) and confirmed still true.

---

## 7. Role/Permission model

7 `StaffRole` values + `PLATFORM`/`CUSTOMER`/`SYSTEM_AUTOMATION` account types. No normalized `Permission` entity — permission keys are strings validated against `packages/shared/src/permissions/permission-manifest.ts`, and `tools/lint-permission-keys.mjs` fails the build if any `.can()`/`.require()` call site in `apps/api/src` uses a string not declared in that manifest (catches typos TypeScript's structural typing can't, since the call sites intentionally accept a bare string for flexibility).

A full ROLE × PAGE × ACTION matrix was not fully reconstructed line-by-line in this pass — the permission keys observed per-endpoint in §5.2 are the ground truth (e.g. `workorders.branch.view`, `finance.refund.request` vs `finance.refund.decide`, `inventory.cost.view` as a separate gate from `inventory.catalog.manage`, `team_setup.branch.manage`). **`[UNKNOWN — investigation required]` for a complete enumerated matrix** — building one exhaustively would require reading `permission-manifest.ts` in full alongside every controller's guard decorators; recommended as a discrete follow-up task (see §15 task list) rather than guessed here.

**`TenantStakeholder`** (Phase 18.A) is a structurally separate, narrower access model from `StaffRole` — explicit design choice: "a stakeholder that needs more than a handful of narrow view permissions is a sign they should be a real StaffUser with a real role, not a sign this list should grow to look like one" (schema comment).

---

## 8. Multi-tenancy and security audit summary

### 8.1 Multi-tenancy

- **Tenant is the isolation root**, verified consistently in the schema (§3.3). Two deliberately-differently-shaped tenants exist in the base seed (Apex Motors: multi-branch/full-feature; Delta Quick: single-bay/no-inventory/no-teams) specifically so isolation and capability-shaping bugs are visible, not hidden by a single-tenant dev database. `[VERIFIED, good practice — preserve this]`
- **Real, named risk**: the redundant-`tenantId` pattern described in §3.3 has no DB-level backstop. `[PRODUCTION-UNSAFE]` — recommend either a service-layer assertion utility applied at every write, or a migration adding a composite-FK/check-constraint pattern where Postgres allows it (Prisma itself cannot express this).
- **Background jobs / scheduler tenant context**: `SchedulerLockService` uses a Postgres advisory lock to prevent double-firing across replicas (Phase 13, `[VERIFIED, PRODUCTION-READY for its narrow scope]`) but there is currently no real recurring job in the system to test tenant-context propagation against — `[UNKNOWN]` how a future scheduled job would correctly scope itself per tenant; no pattern for this exists yet to audit.
- **Platform/admin bypass**: `PlatformGuard` bypasses the entire 11-layer permission resolver for platform-account sessions. This is intentional (platform admins operate above tenant scope by design) but is a single, powerful bypass point — worth a dedicated security review pass focused specifically on every platform-only controller (`platform/*`, `governance/*`) to confirm none of them accept a client-supplied `tenantId` without independently re-validating it server-side. `[UNKNOWN — investigation required, high priority]`

### 8.2 Security findings (from this pass, not exhaustive — see §15 for a dedicated `/security-review` recommendation)

| Area | Finding | Severity | Status |
|---|---|---|---|
| Password hashing | scrypt N=131072, versioned, timing-safe, lazy rehash | — | `[VERIFIED, PRODUCTION-READY]` |
| Sessions | Opaque DB-backed tokens, re-resolved every request, httpOnly/sameSite=lax cookies, refresh cookie path-scoped | — | `[VERIFIED, PRODUCTION-READY]` |
| CORS | Boot-time validation forbids `*` or non-https origin in production | — | `[VERIFIED, PRODUCTION-READY]` |
| Rate limiting | Global + stricter auth-specific tier | — | `[VERIFIED, PRODUCTION-READY]` |
| Structured logging / observability | Absent entirely | Medium-High for production ops | `[MISSING]` |
| CSP / Helmet config | Defaults only, no explicit CSP | Unknown | `[UNKNOWN — investigation required]` |
| File upload limits | 256kb global body limit, no per-route override for inspection photos (feature not built) | N/A yet | `[MISSING feature, not yet a live risk]` |
| Audit boundary | Structurally enforced by lint, not just convention | — | `[VERIFIED, PRODUCTION-READY]` |
| Separation of duties (refund approve/reject) | Two permission keys only, not structurally enforced; Phase 19.A's stronger attempt reverted | Medium | `[PRODUCTION-UNSAFE, open architectural question]` |
| Tenant redundant-tenantId consistency | No DB backstop | Medium-High | `[PRODUCTION-UNSAFE]`, see §3.3/§8.1 |
| Secrets management | `.env` only, gitignored; no vault/secrets-manager integration | High for production | `[MISSING]` |

---

## 9. Testing architecture

`[VERIFIED]` apps/api: 86 spec files (56 `*.integration.spec.ts` against real Postgres, 30 unit). apps/web: 45 spec files (Vitest via Angular's builder). packages/shared: 9 spec files (includes the capability reachability validator's dedicated test suite). packages/database: **0 test files** — seed scripts are unverified by any automated test. `[MISSING]`

Integration tests genuinely hit real Postgres — confirmed via direct `PrismaClient` instantiation against `DATABASE_URL` in spec files, and CI spins up a real Postgres 16 service container with real migrations before running tests. This satisfies the project's own stated rule ("mocks prove nothing about constraints, transactions or cascades").

Well-covered by evidence: auth (throttle, invite, lazy-rehash all have dedicated integration specs), the capability reachability engine, and every concurrency-sensitive money/inventory path named in the edge-case register (each has a dedicated concurrency-firing integration test proving the fix). Under-tested: `packages/database` seed scripts (zero coverage), Data Analyst exports (feature doesn't exist), realtime (feature doesn't exist — see §11).

---

## 10. Tooling — the six structural lint rules

`[VERIFIED]` All are dependency-free Node scripts run as part of `pnpm lint`, CI-gating (not editor-only):

1. **`lint-audit-boundary.mjs`** — fails on any `.auditLog.*` write call outside `apps/api/src/audit/**`.
2. **`lint-directional-css.mjs`** — fails on physical CSS direction properties anywhere under `apps/web/src`; `allow-physical` comment escape hatch.
3. **`lint-touch-targets.mjs`** — scoped to the technician shell/pages only; fails if an interactive element lacks `min-block-size: var(--tap)`.
4. **`lint-money.mjs`** — scoped to finance/inventory/branch-manager/shared-money code; flags `Number()`/raw arithmetic on money-named identifiers; escape hatch via `money-lint-ok:` comment with reason.
5. **`lint-permission-keys.mjs`** — fails if any `.can()`/`.require()` call site string isn't in the permission manifest.
6. **`lint-no-hard-delete.mjs`** — fails on `.controlSetting.delete()`/`.deleteMany()` anywhere outside tests.

Plus `doctor.mjs` (environment diagnostic — Node version, workspace symlinks, Prisma client freshness, `.env` encoding, git ownership, live Postgres port probe) and the `pnpm.mjs`/`with-env.mjs`/`with-port.mjs` shims documented in `CLAUDE.md`'s toolchain table.

---

## 11. Feature status: what's real, what's a gap

### 11.1 Explicitly out of scope / not yet built (verified absent, not guessed)

- **Realtime** `[MISSING]` — `VISION.md` states this as an architectural gap explicitly, not an oversight: no websocket/SSE/push mechanism exists anywhere in the codebase. `docs/phases/PHASE_21.md` decomposed this into a CORE isolation half and a BOUNDED-SEPARATE delivery half — **still unplaced in any phase number.** Any future work here needs a phase assigned first, per the project's own waterfall rule.
- **Billing country adapters** (Egypt ETA, Saudi ZATCA) `[MISSING, explicitly out of scope for the phase that built the seam]` — `GenericBillingAdapter` is the only implementation; `FinanceConfiguration.compliantBlocked` flags tenants in unsupported countries as visibility-only (does not hard-block issuance — "MOP is not the tenant's lawyer," per schema comment).
- **Exports / Saved Views** (Data Analyst) `[MISSING]` — no export mechanism (CSV/PDF/etc.) exists anywhere in the codebase.
- **Translation layer** `[MISSING]` — direction (RTL) infrastructure exists; actual string translation does not.
- **Password reset flow** `[MISSING]` — blocked on unbuilt email/SMS infrastructure per `PAGE_INVENTORY.md`.
- **Technician-facing part-request UI** `[MISSING]` — `PartRequestService` exists and is fully callable, but nothing in `apps/technician/` or the Work Card page wires a "request a part" or "return a part" action, despite the Work Card being one of the shipped Phase 6 pages. This is a real, previously-undiscovered gap named in `PROJECT_STATE.md` §7.7, confirmed still open.
- **Governance Controls, Workshop Live View** (Platform Super Admin) `[MISSING]` — dead nav links, confirmed by direct route-vs-shell-HTML comparison. Deliberately gated behind Phase 21 (policy layer) so the page doesn't hardcode answers to still-open questions.
- **Merge/split of tenants** `[MISSING, design decision made not to build]` — Phase 18.F recorded no first-class support as the explicit decision.

### 11.2 Documentation drift found during this audit (a genuine, previously unflagged discrepancy)

**`docs/PAGE_INVENTORY.md`** states 46 of 53 pages built. **`docs/PHASE_MAP.md`**'s own progress table instead states 34 of 53. Recounting `PAGE_INVENTORY.md`'s own per-role rows gives 48 marked ✅/🟡 — meaning even that document's internal total doesn't cleanly reconcile with its own breakdown. **`[UNKNOWN — investigation required, low effort, do this first]`**: this needs a fresh, mechanical recount against the routes verified in §6.1 of this document (which is itself a ground-truth count derived directly from `app.routes.ts`, not from either doc's prose) before either number is trusted again. Recommend making `PAGE_INVENTORY.md`'s count auto-derivable from `app.routes.ts` in a future pass rather than hand-maintained, to prevent this recurring.

---

## 12. Production readiness matrix

| Subsystem | Current state | Production risk | Blocker? |
|---|---|---|---|
| Capability engine | `[PRODUCTION-READY]` | Low | No |
| Permission resolver | `[PRODUCTION-READY]` | Low | No |
| WorkOrder lifecycle | `[PRODUCTION-READY]` | Low | No |
| Money arithmetic | `[PRODUCTION-READY]` | Low | No |
| Stock/inventory core | `[PRODUCTION-READY]` | Low | No |
| Auth/session | `[PRODUCTION-READY]` | Low | No |
| Tenant isolation (redundant tenantId) | `[PRODUCTION-UNSAFE]` | Medium-High | **Yes — should be closed before scale** |
| Separation of duties (finance approvals) | `[PRODUCTION-UNSAFE]` | Medium | Recommend closing before handling real money at scale |
| Structured logging/observability | `[MISSING]` | High for ops | **Yes for production** |
| Deployment infrastructure (Dockerfiles, IaC, CI deploy stage) | `[MISSING]` | Critical | **Yes — nothing to deploy today** |
| Secrets management | `[MISSING]` | High | **Yes** |
| Backup/disaster recovery | `[MISSING — no design exists]` | Critical | **Yes** |
| Realtime | `[MISSING]` | Low (product gap, not safety) | No, but named unplaced |
| Translation/i18n strings | `[PARTIAL]` | Low unless targeting Arabic-market launch | Depends on launch market |
| Billing country adapters | `[MISSING, scoped out deliberately]` | High if selling into Egypt/Saudi before built | Market-dependent |
| Test coverage of seed scripts | `[MISSING]` | Low | No |

---

## 13. What production requires that does not exist today

This is the honest gap between current state and "real production SaaS deployed to real infrastructure," stated plainly per the task's instruction not to paper over uncertainty with generic SaaS boilerplate:

1. **No deployment target exists.** No Dockerfiles for either app, no IaC, no chosen cloud provider, no CI deploy stage. The technical criteria for choosing one: needs to run a long-lived NestJS process (not pure serverless, given DB-backed sessions and in-process scheduler locks), a managed Postgres with point-in-time recovery, and static/edge hosting for the Angular build. This decision has not been made in the repository and should be made deliberately, not defaulted.
2. **No backup/DR design exists.** No documented RPO/RTO, no backup schedule, no restore-test process. This must be designed before real workshop data exists — losing a workshop's work-order/inventory/financial history would be catastrophic and irreversible.
3. **No structured logging/observability.** Operators would have no way to know the API is degraded, the DB is slow, or a tenant is failing, beyond manually reading console output.
4. **No secrets management.** `.env` files are fine for local dev; production needs a real secrets store.
5. **No production security review has been performed.** §8.2's table is a byproduct of an architecture audit, not a dedicated security pass — recommend running `/security-review` (available as a skill in this environment) as a discrete next step before any production exposure.

---

## 14. Documentation map (what exists, verified against the actual `docs/` tree)

- `docs/README.md` — reading-order index.
- `docs/VISION.md`, `docs/SYSTEMS.md`, `docs/CAPABILITY_MODEL.md` — the three foundational architecture docs; all read in full for this audit.
- `docs/PHASE_MAP.md` — the 21-phase roadmap (see caveat in §11.2 about its progress-table accuracy).
- `docs/PAGE_INVENTORY.md` — the 53-page tracker, declared source of truth for "what's built" (see same caveat).
- `docs/detailed-specs/*.md` — one file per role, field-level page specs; all marked COMPLETE except `tenant-owner.md` (IN PROGRESS).
- `docs/phases/PHASE_1.md`–`PHASE_21.md` — one detail doc per phase.
- `docs/scenarios/`, `docs/scenarios2/`, `docs/scenarios3/` — three research passes (workshop-floor persona scenarios; platform-console/tenant-lifecycle scenarios; non-persona hard/extreme edge cases), each synthesized into new phases or an edge-case register.
- `docs/scenarios3/EDGE_CASE_REGISTER.md` — 20 hardening findings, 17 closed, 3 open (E11 leap-year warranty policy, E13 capability-rollback design spike, and one more per the register's own current count — re-read this file directly before starting hardening work, it is the ground truth).
- `docs/POLICY_DECISION_INVENTORY.md`, `docs/ARCHITECTURE_DECISION_INVENTORY.md`, `docs/phases/PHASE_21.md` — the policy-layer design work; **explicitly documents-only, no code, awaiting owner review** as of the last session. Do not start Governance Controls or any policy-registry code until this review happens and a decision is recorded.
- `docs/GAP_ANALYSIS_CANONICAL_SPEC.md` — historical; describes the pre-rebuild v11.9 codebase (deleted). Read as "why the rebuild happened," never as current-state truth.
- `docs/DESIGN_LANGUAGE.md`, `docs/UX_PRINCIPLES.md` — visual/interaction rationale; treat as binding constraints, not suggestions.
- `docs/PRODUCT_SPEC_CANONICAL.md` — the original pasted product-owner spec; **noted by the research pass as truncated mid-sentence** around Acceptance-Test step 18 — worth restoring the full original if it exists elsewhere, since downstream docs cite it as ground truth.

---

## 15. Assumption register, unknowns, and recommended next investigations

| # | Item | Why unknown | Recommended action |
|---|---|---|---|
| 1 | `PAGE_INVENTORY.md` vs `PHASE_MAP.md` page-count discrepancy (46 vs 34 of 53) | Two docs disagree, and the source-of-truth doc doesn't reconcile with its own breakdown | Recount mechanically against `app.routes.ts` (§6.1 of this doc is a start); fix both docs |
| 2 | Whether a service-layer helper enforces `child.tenantId == parent.tenantId` anywhere | Not found in the modules read, but not every service file was read | Grep all service files for tenantId-setting code; if absent, add a shared assertion helper and a regression test |
| 3 | Full ROLE × PAGE × ACTION permission matrix | Would require reading `permission-manifest.ts` in full plus every controller's guards, not done exhaustively in this pass | Dedicated follow-up task, output as a generated table (ideally derived from the manifest programmatically, not hand-maintained) |
| 4 | Whether platform-only controllers ever trust a client-supplied `tenantId` without re-validation | High-value, not yet checked line-by-line | Run `/security-review` scoped to `apps/api/src/platform/**` and `apps/api/src/governance/**` |
| 5 | Whether a CSP is configured beyond Helmet defaults | Not found, not deeply investigated | Decide before any production exposure |
| 6 | Whether `TenantCapability`/`WorkshopPolicy`'s "exactly one open row" invariant has DB-level or test-level protection against a service-layer race creating two open rows | Schema comment admits it's service-layer-only; not independently verified as tested here | Write a targeted concurrency regression test if one doesn't already exist |
| 7 | Owner vs. Super Admin authority over money/pricing policy | `docs/phases/PHASE_21.md` records this as **explicitly OPEN**, not resolved | Do not build Owner "Pricing & Financial Configuration" page until this is decided by the project owner |

---

## 16. START HERE — for the next engineer or AI agent

**1. First command.** Run `corepack pnpm run doctor` — catches the machine-specific quirks (`pnpm` not on PATH, symlink corruption, stale Prisma client, `.env` encoding) before anything else wastes your time. Then `docker compose up -d && corepack pnpm db:deploy && corepack pnpm db:seed && corepack pnpm db:seed:demo && corepack pnpm dev`. Log in at `http://localhost:4200/branch/attention` with `manager@apex-motors.local` / `ChangeMe-Manager-123`.

**2. First files to read, in order:** this document, then `CLAUDE.md` (rules that must not be broken), then `PROJECT_STATE.md` (session-to-session continuity log — it is kept current and is more granular than this document for "what happened last"), then whichever phase doc in `docs/phases/` covers the area you're about to touch.

**3. First subsystem to understand deeply before changing anything:** the permission resolver (§5.3) and the capability engine (§5.4). Almost every feature touches one or both, and their invariants (deny-by-default, capability-above-role, the reachability proof) are the ones `CLAUDE.md` calls load-bearing.

**4. First task to implement, in priority order, with reasoning:**
   - **Reconcile the page-count discrepancy (§11.2, §15 item 1).** Cheap, unblocks trusting either tracking doc again, and this document already did most of the legwork.
   - **Close the redundant-`tenantId` consistency gap (§3.3, §15 item 2).** This is the highest-severity finding in this document that isn't already tracked anywhere else in the project's own docs — it was found fresh in this audit.
   - **Wire the technician-facing part-request UI (§11.1).** Named as a real, undiscovered gap in `PROJECT_STATE.md` itself; small, well-scoped, and closes a page that's shipped everywhere except the one action a real technician needs.
   - After that: pick up whichever of the four legitimate open tracks `PROJECT_STATE.md` §4 names (page-gap closure, Phase 15/18 continuation, edge-case register items, or awaiting the owner's Phase 21 review) based on what's actually being asked for that session — this document does not override that prioritization, it supplements it with fresh cross-repository evidence.

**5. What must be verified before calling anything done:** full gate — `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test && corepack pnpm build` — all green, per this project's own stated verification bar. For anything touching money, inventory, or the permission resolver, also write or extend a concurrency-specific integration test, matching the pattern the edge-case register already established.

**6. What NOT to touch without a written design note first:** the capability engine's reachability proof, the permission-resolver layer order, `WorkOrderLifecycleService`'s sole-writer status, the money module's integer-minor-units convention, and anything under `docs/phases/PHASE_21.md`'s scope (Governance Controls, a `WorkshopPolicy` registry/resolver) — that track has an explicit stop boundary awaiting owner review.

**7. What's already solid — do not rebuild:** the capability engine, the permission resolver, `WorkOrderLifecycleService`, the money module, the stock/inventory concurrency fixes, the six custom lint rules, the visual design system, and the documentation discipline itself (the in-schema "why" comments, the phase-doc-before-code rule) are all genuinely good engineering and should be extended, not replaced.

---

*This document was produced by directly reading `packages/database/prisma/schema.prisma` in full, `apps/web/src/app/app.routes.ts` in full, all 27 API controllers, all six `tools/*.mjs` lint scripts, `docker-compose.yml`, `.github/workflows/ci.yml`, both seed scripts, and the core architecture docs (`VISION.md`, `SYSTEMS.md`, `CAPABILITY_MODEL.md`, `PHASE_MAP.md`, `PAGE_INVENTORY.md`, `EDGE_CASE_REGISTER.md`, `POLICY_DECISION_INVENTORY.md`, `ARCHITECTURE_DECISION_INVENTORY.md`, `PHASE_21.md`) — not reconstructed from memory or prior summaries alone.*
