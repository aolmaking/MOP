# Data Dictionary — Phase 0 Schema

Maps every concept in [`PRODUCT_SPEC_CANONICAL.md`](./PRODUCT_SPEC_CANONICAL.md) to its table in [`packages/database/prisma/schema.prisma`](../packages/database/prisma/schema.prisma). Purpose: future spec-vs-code audits are a lookup here, not a re-derivation from scratch.

Schema status: **draft, validated (`prisma validate` + `prisma format` pass), no migration run yet.** Awaiting review before Phase 1 begins.

## Identity & Tenancy

| Spec concept | Table(s) | Notes |
|---|---|---|
| Workshop / tenant, 7-state status | `Tenant` | `status: TenantStatus` — Active/Trial/Pending Setup/Frozen/Suspended/Read-only/Archived, matches spec exactly |
| Per-workshop currency and timezone (added 2026-08-07 — every workshop's numbers/calculations are fully independent, and the platform is meant for worldwide use, not one locale) | `Tenant.currency` (ISO 4217, fixed at creation), `Tenant.timezone` (IANA, editable later) | All amounts stored as `Decimal` with no embedded currency; the tenant's `currency` is the only source of truth for how to label/format them. All `DateTime` columns are stored UTC; `timezone` is purely a display-conversion setting |
| Plan / package, entitlements | `Plan` | New as a real structured entity — `maxBranches`/`maxUsers`/`maxWarehouses`/`allowedModules`/`allowedFeatures`/`allowedReports` are real columns the resolver reads, not a JSON blob nothing consumes (gap-analysis fix) |
| Branch | `Branch` | |
| Warehouse, branch↔warehouse linkage | `Warehouse`, `BranchWarehouseAccess` | |
| Platform Account / Tenant Staff Account / Customer Account / System Automation Identity | `Account` (`accountType` enum) + `StaffUser` / `Customer` profiles | One login credential (`Account`) per identity; `StaffUser`/`Customer` hold the tenant-scoped profile |
| Session (access + refresh) | `Session` | `refreshTokenHash` is a real column this time — old build hardcoded refresh to `""` |
| Tenant Owner / Tenant Admin / Branch Manager / Technician / Inventory Manager / Team Leader / Data Analyst | `StaffUser.role: StaffRole` | Now a real enum — old build stored role as a bare `String` |
| Team, managed technicians, membership history | `Team`, `TeamMembership` | New — didn't exist before; `endedAt: null` = active membership, preserves history per spec |
| Customer, portal status | `Customer` | |
| Role Permission Template / Permission Matrix / cell states | `RolePermission` (tenant's effective per-role grants), `UserPermissionOverride` (per-user), `RolePage` (nav) | Locked-by-Platform / Locked-by-Plan cell states are *computed* at resolve time from `ControlSetting` + `Plan`, not stored redundantly |
| Platform Super Admin Control / Freeze / Module / Feature / Role / Builder / Limits controls | `ControlSetting` (`scope: PLATFORM \| TENANT`) | One generic key/value/type row per control — resolver interprets `key`/`type` |

## Operating Categories & Assets

| Spec concept | Table(s) | Notes |
|---|---|---|
| Cars / Motorcycles / Heavy Equipment | `CategoryCode` enum | Used on `Tenant.primaryCategory`, `StaffUser.categoryScope`, `Asset.category`, `InventoryItem.compatibleCategories` |
| Asset (plate/VIN/serial/hour-meter/site/fleet/operator) | `Asset` | Category-specific identifier fields all present as nullable columns; app layer shows only the relevant ones per category |
| Ownership transfer, old-owner privacy | `AssetOwnershipHistory` | Open row (`endedAt: null`) = current owner; a new owner's "safe technical history" query joins through this, naturally excluding a previous owner's private data |

## Work Orders, Tasks, Inspections

| Spec concept | Table(s) | Notes |
|---|---|---|
| Work Order, all 16 lifecycle statuses | `WorkOrder` (`status: WorkOrderStatus`) | Authored directly from the spec's 16-value list — old build was missing 6 (Registered, Approved for Work, Waiting Customer, Blocked, Ready for Team Review, QC Failed) |
| "Recurring issue after closure → new linked Work Order, never silently reopened" | `WorkOrder.relinkedFromWorkOrderId` (self-relation) | New — no equivalent existed before |
| Task / Subtask / assignment / blocker | `Task`, `Subtask`, `TaskAssignment`, `TaskBlocker` | `TaskBlocker.reason: BlockerReason` covers all 7 spec reasons |
| Quick Inspection / Full Inspection | `Inspection` (`type: QUICK \| FULL`) | Category-specific checklist fields live in `fields: Json` (validated by app-layer schema per category, not hard-coded columns — mirrors how Forms & Fields needs to stay owner-configurable) |
| Faults / diagnostic codes / severity | `Fault` (`severity: SeverityLevel`) | |

## Inventory

| Spec concept | Table(s) | Notes |
|---|---|---|
| Inventory item / catalog | `InventoryItem` | |
| Warehouse stock balances (available/reserved/issued/received/return-pending/damaged) | `WarehouseStockBalance` | Non-negativity and `reserved ≤ available`-style invariants: enforced in service code **and** via DB `CHECK` constraints added in a follow-up hand-written migration (Prisma's schema language has no native arbitrary-`CHECK` attribute — see "Follow-up SQL" below) |
| Part request full lifecycle (19 states) incl. new "Request Clarification" | `PartRequest` (`status: PartRequestStatus`) | Added `RETURN_CLARIFICATION_REQUESTED`, which the old build's Returns/Movements page was missing |
| Issued item, arrival/receipt/use timestamps | `IssuedItem` | |
| Return request, Inventory Manager accept/reject | `PartReturnRequest` | Stock only increases when this is accepted — enforced in the Phase 6 service layer, mirroring the one thing the old build got right here |
| Stock ledger (before/after quantities) | `StockMovement` | Append-only; kept from the old build's genuinely good pattern |
| Inter-warehouse transfer | `InventoryTransfer` | |
| Supplier order | `SupplierOrder` | |

## Finance

| Spec concept | Table(s) | Notes |
|---|---|---|
| Price catalog, future-only changes | `PriceCatalogEntry` (`effectiveFrom`/`effectiveTo`) | |
| Quotation / estimate, locked approved prices | `Quotation`, `QuotationItem` (`approvedPrice`, `priceLocked`) | |
| Running invoice (live) | `RunningInvoice`, `RunningInvoiceLine` (`isFinalized`) | |
| Final invoice, immutability | `Invoice` (`locked`, `immutableVersion`), `InvoiceLine` (`lockedUnitPrice`, `lockedLaborPrice`) | Service layer refuses to mutate once `locked = true`; corrections go through `CreditNote`/`RefundRequest` only |
| Invoice numbering | `InvoiceSequence` | |
| Payment ledger, idempotency | `Payment` (`idempotencyKey @unique`, `providerTransactionId`) | |
| Discount approval thresholds | `DiscountRequest`, `FinanceConfiguration.discountApprovalThreshold` / `maxBranchDiscountPercent` | |
| Refunds / credit notes | `RefundRequest`, `CreditNote` | |
| Delivery payment gate, price visibility, who can issue/pay | `FinanceConfiguration` | `technicianPriceVisible`, `customerInvoiceVisible`, `allowUnpaidDelivery`, `allowPartialPaidDelivery` — all real columns the Phase 4/5 services must read, not hard-coded booleans like the old build's `hasPricingPermission() => true` |

## Customer-Facing

| Spec concept | Table(s) | Notes |
|---|---|---|
| Customer decision request/items, WhatsApp link, critical warning ack | `CustomerDecisionRequest` (`secureToken @unique`, `whatsappMessage`), `CustomerDecisionItem` (`warningAcknowledged`) | |
| Customer-visible activity feed | `CustomerTimelineEvent` | Populated **only** through the Customer-Safe Projection service (Phase 1) — no direct writes with raw internal text |
| Safe technical history | `SafeTechnicalHistory` | New real read path planned for Phase 9 — old build seeded this table but never queried it |

## Builder / Tenant Customization — the central architectural fix

| Spec concept | Table(s) | Notes |
|---|---|---|
| Theme, page layouts, role experience, workflow/feature policy, forms, message templates | `TenantConfiguration` (**one row per tenant**) | This is the fix for the single biggest gap-analysis finding: the old build had a Builder-editor table and a separately-read runtime table that silently diverged. Here, `EffectiveAccessResolverService` (Phase 1) and the Owner-facing Builder UI (Phase 3) read and write this *same* row — there is no second copy anywhere in the schema |
| Publish versioning, rollback, risk level | `TenantConfigurationVersion` | Snapshot-based; `riskLevel` required on every version |

## Audit & Operations

| Spec concept | Table(s) | Notes |
|---|---|---|
| Audit log (actor, actor type, tenant, target, action, before/after, reason, risk level) | `AuditLog` | `riskLevel: AuditRiskLevel` is a **required** column now, not an optional field buried in a JSON blob populated by 2 of 20+ action types like before |
| Operation events (`work_order.created`, `part.used`, etc.) | `OperationEvent` | Replay/debug log for the centralized event pipeline (Phase 1) |
| Workshop Live View sessions | `PlatformLiveViewSession` | `endedAt` is a real nullable column this time — old build's session DTO had no end-time field at all |

## Deliberately out of Prisma schema, handled in application code

- **Category-specific inspection/form fields** — live in `Inspection.fields: Json` / `TenantConfiguration.forms: Json`, validated against an app-level schema per category/tenant, so Owner-configurable custom fields (spec's Forms & Fields page) don't require a migration every time a workshop adds one.
- **Permission-key strings** (`customer_decision.send`, `inventory.stock.adjust`, etc.) — live in `RolePermission.permissionKey` / `UserPermissionOverride.permissionKey` as strings validated against a single generated permission manifest in `packages/shared` (Phase 1), not a Prisma enum — new permission keys are a shared-package change, not a migration.

## Follow-up SQL after the first migration (not expressible in `schema.prisma` directly)

Prisma's schema language has no native arbitrary `@@check(...)` attribute as of Prisma 5.x. After running the first `prisma migrate dev`, a hand-added SQL statement will be appended to that migration (standard Prisma workflow — `migrate dev --create-only`, edit the generated `.sql`, then apply) to add real database-level guarantees on top of the service-layer guards:

```sql
ALTER TABLE warehouse_stock_balances
  ADD CONSTRAINT chk_available_qty_nonneg CHECK ("availableQty" >= 0),
  ADD CONSTRAINT chk_reserved_qty_nonneg CHECK ("reservedQty" >= 0),
  ADD CONSTRAINT chk_issued_qty_nonneg CHECK ("issuedQty" >= 0),
  ADD CONSTRAINT chk_return_pending_qty_nonneg CHECK ("returnPendingQty" >= 0),
  ADD CONSTRAINT chk_damaged_qty_nonneg CHECK ("damagedQty" >= 0);

ALTER TABLE invoices
  ADD CONSTRAINT chk_invoice_balance_nonneg CHECK (balance >= 0);
```

## What's still open (expected to firm up as later phases build against this)

- Exact `Json` shape for `Inspection.fields`, `TenantConfiguration.theme/pageLayouts/roleExperience/workflowPolicy/forms/messageTemplates` — deliberately loose in the schema itself; will be defined as TypeScript types in `packages/shared` during Phase 1/3, not as Prisma models, so Owner customization doesn't require schema migrations.
- Whether `OperationEvent` needs a retention/archival policy once volume is real (deferred — not a Phase 0 blocker).
