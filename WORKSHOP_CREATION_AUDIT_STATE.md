# Workshop Creation Reality Audit — Working State

> Persistent scratchpad for the Phase 0 audit. Append-only; nothing here is a
> conclusion until it carries a verification level.
>
> Repository state at audit start: branch `main`, worktree clean, HEAD `663eecd`.
> Sibling worktrees exist at `E:/mop-fleet/{w-a3,w-infra,w-int}` on other branches
> and were **not** touched — this audit is read-only.

## Verification levels used

| Level | Meaning |
|---|---|
| `VERIFIED_RUNTIME` | Observed by executing the running system |
| `VERIFIED_CODE` | Traced through source with the exact line cited |
| `PARTIALLY_VERIFIED` | Code traced, runtime not reached |
| `UNVERIFIED` | Named but not yet traced |
| `INFERRED` | Reasoned from surrounding evidence, not directly observed |

---

## 1 · Environment facts

| Fact | Level | Evidence |
|---|---|---|
| Dev DB `mop_platform_dev` matches `schema.prisma` exactly | `VERIFIED_RUNTIME` | `prisma migrate diff --from-url <dev> --to-schema-datamodel` → "This is an empty migration." |
| Migration history does **not** match `schema.prisma` | `VERIFIED_RUNTIME` | Same command against a freshly-migrated DB emits two `ALTER TABLE … ADD COLUMN "specializations"` |
| Therefore runtime verification is possible only against the dev DB | `VERIFIED_RUNTIME` | — |

---

## 2 · Systems inspected

- Platform / onboarding controllers (`platform`, `platform/onboarding`, `platform/workshops`)
- `PlatformService.createWorkshop` + `attemptCreateWorkshop` + all seed helpers
- `CreateWorkshopDto` and nested branch/warehouse/service DTOs
- `seedStructure` (branch + warehouse + `BranchWarehouseAccess`)
- `WorkshopCatalogProvisioningService`
- `PartRequestService` (`issue`, `load`, `requireAuthorizedWarehouseForWorkOrder`)
- `InventoryViewService`, `InventoryHomeService`, `InventoryReportsService`
- `TechnicianWorkService` (`startTask`, `completeTask`, `reportBlocker`)
- `FinanceService` (`settlement`, `recordPayment`, `approveRefund`, `approveDiscount`)
- `OperatorService.approveRepair` warehouse resolution
- `PrismaService` (checked for global tenant middleware — none exists)
- `BranchWarehouseService`, `StaffService`
- Permission resolver + `TenantCapabilityLayer` + `ModuleEnabledLayer`

## 3 · Files inspected (primary)

```
apps/api/src/control/platform/platform.service.ts
apps/api/src/control/platform/create-workshop.dto.ts
apps/api/src/control/platform/platform.controller.ts
apps/api/src/control/platform/workshops/workshops.controller.ts
apps/api/src/control/platform/onboarding/onboarding.controller.ts
apps/api/src/control/platform/onboarding/onboarding.service.ts
apps/api/src/systems/inventory/part-request.service.ts
apps/api/src/systems/inventory/inventory.controller.ts
apps/api/src/systems/inventory/inventory-view.service.ts
apps/api/src/systems/finance/finance.service.ts
apps/api/src/systems/finance/finance.controller.ts
apps/api/src/systems/operations/technician-work.service.ts
apps/api/src/experiences/technician/technician.controller.ts
apps/api/src/experiences/operator/operator.service.ts
apps/api/src/systems/people/organization/branch-warehouse.service.ts
apps/api/src/runtime/database/prisma.service.ts
packages/database/prisma/schema.prisma
```

## 4 · Confirmed facts

| # | Fact | Level |
|---|---|---|
| F1 | Workshop creation is a single transaction producing 13 provisioning steps | `VERIFIED_CODE` |
| F2 | `BranchWarehouseAccess` rows ARE created at provisioning, per warehouse `branchCodes`; empty list ⇒ all branches | `VERIFIED_CODE` |
| F3 | A default `MAIN-WH` warehouse is created and granted to every branch when none is declared | `VERIFIED_CODE` |
| F4 | `PartRequestService.issue()` enforces branch↔warehouse via `BranchWarehouseAccess` | `VERIFIED_CODE` |
| F5 | …but the check is skipped entirely when the tenant has zero access rows (`totalTenantLinks > 0` guard) | `VERIFIED_CODE` |
| F6 | `OperatorService.approveRepair` resolves a warehouse by `findFirst` then falls back to *any active tenant warehouse* | `VERIFIED_CODE` |
| F7 | `PrismaService` has no `$use`/`$extends` middleware and there is no RLS — tenant isolation is per-query discipline only | `VERIFIED_CODE` |
| F8 | 241 Prisma calls across 50 models have no `tenantId` in their `where` clause | `VERIFIED_CODE` (scan) |
| F9 | `TechnicianWorkService.startTask/completeTask/reportBlocker` load a Task by bare id | `VERIFIED_CODE` |
| F10 | `FinanceService.settlement/approveRefund/approveDiscount` load by bare id | `VERIFIED_CODE` |
| F11 | `FinanceService.recordPayment` writes `Payment.tenantId` from the **caller's** session against an invoice looked up by bare id | `VERIFIED_CODE` |
| F12 | `PartRequestService.load` loads by bare id | `VERIFIED_CODE` |

## 5 · Unverified assumptions to close

- [x] Can a real workshop be created at runtime? → Experiment A
- [x] Are the cross-tenant paths above actually reachable end-to-end? → Experiment B
- [x] Do two differently-configured workshops behave differently? → Experiment C
- [x] Does branch→warehouse resolution pick the right store per branch? → Experiment D
- [x] Which Workshop Owner pages write real data? → Experiment E

## 6 · Runtime experiments performed

See `WORKSHOP_CREATION_REALITY_AUDIT.md` §10. Executed against a live API bound to
`mop_platform_dev`, driving the real HTTP surface with real platform and tenant sessions.

## 7 · Cross-system dependencies noted

- `BranchWarehouseAccess` → `PartRequestService.issue`, `InventoryViewService`, `InventoryAnalyticsService`, `OperatorService` (fallback), `BranchWarehouseService`
- `TenantCapability` → `CapabilityResolutionService` → workflow router, gate evaluator, `TenantCapabilityLayer`
- `TenantConfiguration.enabledModules` → `session.enabledModules` → `ModuleEnabledLayer` (a *separate* source of truth from the capability profile)
- `WorkshopPolicy` → `PolicyResolutionService` → router edges, gates, finance, technician
- `PriceCatalogEntry` → `FinanceService.absorbOperationalItems`
