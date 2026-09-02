# MOP — Subsystem Catalog

> **Document ID:** DOC-18
> **Purpose:** every subsystem in MOP — its purpose, boundary, owned entities, services, dependencies, consumers and current state.
> **Authority:** DESCRIPTIVE.
> **Scope:** `apps/api/src/**`, `packages/shared/src/**`, `packages/database`.
> **Last verified:** 2026-09-01 against commit `a8c8bb5`. 30 controllers, 85 services, 32 modules.
> **Source of truth:** the directory tree, [`../SYSTEMS.md`](../SYSTEMS.md), [`../../CODE_MAP.md`](../../CODE_MAP.md), [`../../REORGANIZATION_REPORT.md`](../../REORGANIZATION_REPORT.md).
> **Related:** 25 (backend architecture), 29 (integration map), 19 (endpoints).

---

## 1. The layering

`apps/api/src` is laid out by **boundary**, not by file kind. The layer name says what kind of thing lives there.

```
audit/         the AuditLog WRITE boundary — top-level because the lint rule matches this literal path
runtime/       config, database, http, health, scheduler — framework plumbing, no business meaning
identity/      auth (sessions, guards) + access (the permission resolver and its layers)
control/       capabilities, policies, governance, tenant-relationships, platform — the plane that shapes tenants
systems/       operations, inventory, finance, billing, people, customer, forms — the six bounded systems
experiences/   branch-manager, technician, team-leader, owner — per-role surfaces composed over systems
insights/      analytics, analyst-reporting, owner-reports, workflow-health — read-only derived views
```

**Two directional rules, both load-bearing:**

- `experiences/` **never writes directly** — a role surface calls the owning system's service.
- `systems/` **never imports `experiences/`**.

Rule of thumb: if it is a business rule (*can this transition happen*, *what does this cost*), it belongs in `systems/` or `control/`. If it is *how role X sees or uses that rule*, it belongs in `experiences/`.

---

## 2. `audit/`

| | |
|---|---|
| **Purpose** | The one and only writer of `AuditLog` |
| **Owns** | `AuditLog` |
| **Services** | `AuditService` |
| **Boundary** | `tools/lint-audit-boundary.mjs` **fails the build** on any `AuditLog` write outside `apps/api/src/audit/**` |
| **Consumers** | Every system that changes something a person must be able to answer for |
| **State** | ✅ |

Structural, not cultural. The previous implementation had a "centralised audit service" nothing imported while ten modules hand-rolled inconsistent writers.

---

## 3. `runtime/`

| Subsystem | Owns | State |
|---|---|---|
| `config` | Environment, boot-time validation | ✅ |
| `database` | `PrismaService` — the only Prisma access point | ✅ |
| `http` | Interceptors, validation, error shaping (`PresentedError`) | ✅ |
| `health` | `GET /health` | ✅ |
| `scheduler` | `SchedulerLockService` (Postgres advisory lock), `heartbeat.job` | ✅ |

The scheduler is **a lock, not a separate worker** — a deliberate Phase-13 narrowing, recorded rather than silently dropped.

---

## 4. `identity/`

### `identity/auth`
Sessions, login, refresh, logout, invite, password reset. Guards: `SessionGuard`, `PlatformGuard`.

`PlatformGuard` **deliberately bypasses the resolver**: every resolver layer defers when there is no `tenantId`, which is always true for a platform session, and per the spec Platform Super Admin has unconditional control. The check is intentionally *are you a platform account, yes or no*.

Versioned password hashes with lazy rehash on login (E18).

### `identity/access`
The resolver: `EffectiveAccessService`, `PermissionResolverService`, `PermissionContextService` (per-request caching), `ScopeResolverService`, and **eleven layer files**, each with its own spec:

`tenant-status` · `plan-entitlement` · `module-enabled` · `feature-enabled` · `tenant-capability` · `workshop-configuration` · `platform-control` · `role-permission-template` · `delegation` · `user-override` · `staff-restriction`

Exposed as `GET /access/check`.

**Layers are pure functions over a `PermissionContext` loaded once per request** — none of them queries the database. Six of the original nine did, which meant resolving ten keys for one page cost sixty round-trips on the hottest path in the system. `resolveMany` now answers ten keys for the cost of one. Purity also makes each layer trivially testable: a snapshot in, a decision out, no Prisma stub and no async.

> Note for readers of [`../VISION.md`](../VISION.md) §4: its statement that *"five of the eight layers issue their own database query"* described the state at the time it was written. That has since been fixed; the current code is the authority.

---

## 5. `control/`

| Subsystem | Owns | Key services | State |
|---|---|---|---|
| `capabilities` | `TenantCapability` | `CapabilityResolutionService` (incl. `resolveAsOf`), `CapabilityChangeService` | ✅ |
| `policies` | `WorkshopPolicy` | `PolicyResolutionService` | ✅ |
| `governance` | `ControlSetting` locks, tenant lifecycle, staff restriction, disputes | `RolePermissionLockService`, `TenantLifecycleService`, `StaffRestrictionService`, `WorkOrderDisputeService` | 🟡 — the last two have no production caller |
| `platform` | `Tenant`, `Plan`, onboarding, workshops, live view, platform reports | `PlatformService`, `WorkshopsService`, `OnboardingService`, `LiveViewService`, `PlatformReportsService`, `PlanLimitsService` | ✅ |
| `tenant-relationships` | `TenantStakeholder`, `TenantGroup` | `TenantStakeholderService`, `TenantGroupService` | 🟡 — modelled and tested, **no production caller** |

`control/` is the plane that shapes tenants. Nothing in `systems/` may write here.

---

## 6. `systems/` — the six bounded systems

### `operations`
| | |
|---|---|
| **Owns** | `WorkOrder`, `Task`, `Subtask`, `Inspection`, `Fault`, `TaskBlocker`, `Asset`, `WorkOrderNote`, `WorkOrderAssignment` |
| **Key services** | `WorkOrderLifecycleService` *(the only status writer)*, `GateEvaluatorService`, `WorkflowJourneyService`, `WorkOrderDossierService`, `IntakeService`, `TechnicianWorkService`, `ChargeableItemsService`, `OperationEventsService`, `vehicle-history/` |
| **Depends on** | `control/capabilities`, `control/policies`, `audit` |
| **Consumers** | Every `experiences/` module, `insights/` |
| **State** | ✅ engine — ⚠️ `createTask` and `resolveBlocker` have no endpoint |

### `inventory`
| | |
|---|---|
| **Owns** | `InventoryItem`, `WarehouseStockBalance`, `PartRequest`, `IssuedItem`, `PartReturnRequest`, `StockMovement`, `Warehouse`, `InventoryTransfer`, `SupplierOrder` |
| **Key services** | `CatalogService`, `StockService`, `WarehouseService`, `PartRequestService`, `InventoryReportsService`, `InventoryHomeService`, `InventoryViewService` |
| **State** | ✅ — ⚠️ four `PartRequestService` methods have no endpoint; transfers and supplier orders have no surface |

### `finance`
| | |
|---|---|
| **Owns** | `PriceCatalogEntry`, `RunningInvoice`, `Invoice`, `Payment`, `DiscountRequest`, `RefundRequest`, `CreditNote`, `FinanceConfiguration`, `Quotation` |
| **Key services** | `FinanceService`, `FinanceConfigurationService`, `PriceCatalogService` |
| **Consumes** | `ChargeableWorkItem` from Operations — never Operations' tables |
| **State** | ✅ |

### `billing`
| | |
|---|---|
| **Owns** | `BillingDocument` |
| **Key services** | `BillingService`, `GenericBillingAdapter` |
| **Depends on** | `finance` |
| **State** | 🟠 engine complete; **no country adapter exists** |

### `people`
`organization/` (staff, branches, warehouses), `team/`, `specialization/`.
**State** ✅ for organization and team; 🟡 for specialization — definitions, entries, credentials and taxonomy are modelled and tested, with no consuming page.

### `customer`
| | |
|---|---|
| **Owns** | `Customer`, `CustomerDecisionRequest`, `CustomerDecisionItem`, `CustomerTimelineEvent`, `SafeTechnicalHistory`, `MessageTemplate` |
| **Key services** | `CustomerPortalService`, `DecisionService`, `RegisterService`, `MessageTemplateService` |
| **State** | ✅ portal and decisions — 🔴 **no message sending exists anywhere** |

### `forms`
`CustomFieldDefinition`, `CustomFieldsService`, `form-registry.ts`. 🟡 authoring complete, no value capture.

---

## 7. `experiences/`

| Module | Composes | State |
|---|---|---|
| `branch-manager` | Attention queue, intake, board, approvals, delivery, work-order board | ✅ 7/7 pages |
| `technician` | Work view, work card, parts | ✅ 3/3 pages |
| `team-leader` | Home, technicians, work orders, reports | ✅ 4/4 pages |
| `owner` | Home, audit | ✅ |

Owner's other pages are composed over `systems/` and `insights/` controllers directly (`/organization/*`, `/audit`).

---

## 8. `insights/`

| Module | Provides | State |
|---|---|---|
| `analytics` | The 7 Data Analyst surfaces, saved views, CSV export | ✅ |
| `analyst-reporting` | The legacy `reports.company.view` surface, now scope-applying | ✅ |
| `owner-reports` | Overview / operations / financial / inventory / customers | 🟡 |
| `workflow-health` | Integrity checks, bottlenecks, SLA buckets, rework loops | ✅ (5 of 6 checks; the 6th declared not computable) |

**Read-only by construction.** The one write in this layer is `POST /organization/workflow-health/issues/:fingerprint/acknowledge`, which records that an operator has seen a finding — not a change to operational data.

Shared utilities that prevent duplicate implementations: `lifecycle-duration.util.ts`, `date-range.util.ts`, `detectStatusLoops`, `csv.util.ts`.

---

## 9. `packages/shared`

The domain layer both sides of the wire import. **Nothing here imports Prisma or Nest** — deliberately, so the validators can be proven correct in isolation.

| Folder | Contains |
|---|---|
| `capabilities/` | Types, registry, gates, workflow graphs, router, validator, profiles, permission↔capability map |
| `policies/` | Types, registry, validator, relevance, graph-safety |
| `permissions/` | Manifest, default role permissions, delegated permissions |
| `operations/` | Journey, lanes, attention ranking, blocker routing, categories |
| `onboarding/` | Stages, draft, validator, progress, presentation, responsibility, specialisation packs |
| `contracts/` | Cross-system contracts, the closed event union |
| `money/` | String-in/string-out arithmetic in minor units |
| `session/` | `SessionContext` |
| `pages/` | `ROLE_PAGES` |
| `platform/` | Countries, workshop options |
| `errors/` | Shared error shapes |

> **Trap:** after adding an export here, rebuild it — `corepack pnpm --filter @mop/shared run build` — or `apps/api` typecheck will not see it.

---

## 10. `packages/database` and `tools/`

`packages/database`: `prisma/` (schema, 31 migrations, `seed.ts`, `seed-demo.ts`) and `generated/` (never hand-edited). Migration history is immutable — never reordered or renamed.

> **Trap:** after creating a migration, run `corepack pnpm db:test:prepare`, or integration tests hit a test database missing the new table and fail with a confusing 500.

`tools/`: `doctor.mjs`, the pnpm shim, env loaders, and six lint scripts — `lint-audit-boundary`, `lint-directional-css`, `lint-money`, `lint-permission-keys`, `lint-touch-targets`, `lint-no-hard-delete`. Each encodes a rule that was previously broken by a well-meaning change.

---

## 11. Subsystems with no surface

Listed together because they are the same failure mode at different depths, and each is an entry in doc 37.

| Subsystem | What exists | What is missing |
|---|---|---|
| `control/tenant-relationships` | Models, services, tests | Any controller or page |
| `control/governance` — staff restriction | `StaffRestrictionService.restrict/lift`, audit actions | Any controller or page |
| `control/governance` — work-order disputes | `WorkOrderDisputeService.raise`, `WorkOrderDispute` | Any controller or page |
| `systems/people/specialization` | Definitions, entries, credentials, taxonomy, tests | Any page that fills one in |
| `systems/forms` | Authoring, validation | Any page that captures values |
| `systems/inventory` — transfers, supplier orders | Models, enums, permissions | Graph states, endpoints, pages |
| `systems/customer` — messaging | 8 templates, versioning, preview, publish | Any transport at all |
