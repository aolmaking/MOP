# MOP — Domain Model and Entities

> **Document ID:** DOC-06
> **Purpose:** every entity in MOP — what it is, which system owns it, what must always be true of it, and who writes it.
> **Authority:** DESCRIPTIVE. `packages/database/prisma/schema.prisma` is authoritative.
> **Scope:** 76 Prisma models and 33 enums.
> **Last verified:** 2026-09-01 against commit `a8c8bb5`.
> **Source of truth:** `packages/database/prisma/schema.prisma`, [`../DATA_DICTIONARY.md`](../DATA_DICTIONARY.md), [`../DATABASE_STRATEGY.md`](../DATABASE_STRATEGY.md).
> **Related:** 07 (lifecycle), 09 (inventory), 10 (money), 22 (invariants), 26 (schema guide).

---

## 1. Ownership rule

**A system never reads or writes another system's tables directly.** Cross-system reads go through a published contract in `packages/shared/src/contracts/cross-system.ts`; cross-system changes go through a domain event.

Every entity below is listed under exactly one owning system. If you find yourself writing a table from a service in another system's folder, the design is wrong, not the rule.

| System | Owns, in one phrase |
|---|---|
| **Operations** | The job: work orders, tasks, inspections, faults, blockers, assets |
| **Inventory** | The physical part and the claim about where it is |
| **Finance Core** | What a job costs and what has been paid |
| **Billing** | The legal invoice document and its compliance state |
| **People & Performance** | Staff, teams, supervision, specialisation |
| **Governance & Control** | Tenants, plans, capabilities, policies, permissions, audit |
| **Customer** | Customer records, decisions, the sanitised timeline |

## 2. The central relationship

```
Tenant
 ├── Plan (ceilings: branches, users, warehouses, categories, modules, reports, exports)
 ├── Branch ──── BranchWarehouseAccess ──── Warehouse
 ├── Account (PLATFORM | TENANT_STAFF | CUSTOMER | SYSTEM_AUTOMATION)
 │     ├── StaffUser ── TeamMembership ── Team
 │     └── Customer
 └── Asset ── AssetOwnershipHistory
       │
       └── WorkOrder                      ← the spine
             ├── WorkOrderAssignment
             ├── Task ── Subtask · TaskAssignment · TaskBlocker
             ├── Inspection
             ├── Fault
             ├── PartRequest ── IssuedItem · PartReturnRequest
             ├── WorkOrderPartLine
             ├── CustomerDecisionRequest ── CustomerDecisionItem
             ├── Quotation ── QuotationItem
             ├── RunningInvoice ── RunningInvoiceLine
             ├── Invoice ── InvoiceLine ── Payment
             │        └── BillingDocument · CreditNote
             ├── CustomerTimelineEvent
             ├── SafeTechnicalHistory
             ├── WorkOrderNote
             └── WorkOrderDispute
```

Everything else hangs off `Tenant` directly: configuration, capabilities, policies, permissions, audit, events.

## 3. Governance & Control

| Entity | Purpose | Notes and invariants |
|---|---|---|
| **`Plan`** | Commercial plan and its ceilings | `maxBranches`, `maxUsers`, `maxWarehouses`, `allowedCategories`, `allowedModules`, `allowedFeatures`, `allowedReports`, `allowedExports`, `monthlyPrice`. `[VERIFIED]` — enforced **on an ongoing basis**, not only at creation, by `PlanLimitsService` |
| **`Tenant`** | One workshop | `nameNormalized` is a real unique shadow column — Prisma's DSL has no functional index, so a lowercase mirror maintained on write is how case-insensitive platform-wide name uniqueness is enforced portably. `slug` and `customerRegistrationCode` are both unique. Currency and timezone are set at creation and never change |
| **`TenantConfiguration`** | Per-tenant config blob | ⚠️ `workflowPolicy` is an **empty, unread JSON placeholder** — named as such in Workflow Health's own output rather than faked. See doc 37 |
| **`TenantConfigurationVersion`** | Point-in-time snapshot of a tenant's whole shape | Version 1 written at creation. Rollback is `[INTENDED]` |
| **`TenantCapability`** | One capability's status for one tenant | **Time-ranged, never overwritten.** `CapabilitySource` records where the answer came from. `resolveAsOf()` reads it historically |
| **`WorkshopPolicy`** | One policy's answer for one tenant | Same discipline. `PolicySource` on every row |
| **`ControlSetting`** | Platform locks and owner delegation switches | `ControlSettingScope`. **Soft-delete only** — hard-deleting one was a real bug (H10) |
| **`RolePermission`** | Role → permission grant, per tenant | Seeded from `DEFAULT_ROLE_PERMISSIONS` at creation |
| **`UserPermissionOverride`** | Per-account grant or denial | Sits *below* capability in the resolver — it can never resurrect a disabled capability |
| **`RolePage`** | Page-level nav visibility per role | Coarser than a permission key |
| **`AuditLog`** | The change record | **Exactly one writer**, `apps/api/src/audit/audit.service.ts`, enforced by `tools/lint-audit-boundary.mjs`. `AuditActorType`, `AuditRiskLevel` |
| **`OperationEvent`** | The domain-event ledger | Written by `OperationEventsService` only. Keys are the closed union in `contracts/events.ts` |
| **`PlatformLiveViewSession`** | Cross-tenant activity summary | Counts and event kinds only — never payload |
| **`WorkflowIssueAcknowledgement`** | An operator has seen and accepted an integrity finding | Fingerprint-keyed, so the same issue does not re-nag |
| **`TenantStakeholder`**, **`TenantGroup`**, **`TenantGroupMember`** | Platform relationships between tenants (groups, franchises, shared owners) | Phase 18. 18.A/D/E shipped; 18.B/C deferred |
| **`Session`** | A live login | Revocable |

## 4. Identity and People & Performance

| Entity | Purpose | Notes and invariants |
|---|---|---|
| **`Account`** | The login | `AccountType` × `AccountStatus`. `AuthService.login` enforces status; password hashes are **versioned** with lazy rehash on login (edge case E18) |
| **`StaffUser`** | An account's identity inside a tenant | Carries `role`, branch/category scope. Active/locked mirror `Account.status`, written in the same transaction |
| **`Team`**, **`TeamMembership`** | Grouping of technicians under a leader | Membership is historical — *who supervised job #123 last year must stay answerable* |
| **`SupervisionNote`** | The team leader's internal note about a technician | **Never shown to the technician it is about** |
| **`SpecializationDefinition`** | A workshop-authored shape to fill in | `version` bumps when `fields` changes |
| **`SpecializationEntry`** | A filled-in instance | **Pins `definitionVersion`** — an old entry is never reinterpreted against a newer shape |
| **`PositionTaxonomyEntry`** | "Where on the asset" vocabulary | `tenantId: null` is the platform default for a category; a tenant row overrides it |
| **`CredentialDefinition`**, **`StaffCredential`** | Required qualifications and who holds them | |
| **`BlockerReasonDefinition`** | The workshop's blocker vocabulary, with a `BlockerBehavior` | Specialisation-shaped: "waiting for a crane" is real in field service |
| **`AnalystSavedView`** | One analyst's own saved report configuration | Never operational data. Scoped to the session's tenant **and account**, never client-supplied ownership |

## 5. Operations

### `Asset` — not `Vehicle`

The thing being worked on. `CategoryCode` decides what identifies it: `plateNumber` / `vinOrChassisNumber` for cars and motorcycles, `serialNumber` / `hourMeter` / `site` / `fleet` / `operator` for heavy equipment. A generator has no plate; naming the model `Vehicle` would have forced a lie into every heavy-equipment tenant.

### `AssetOwnershipHistory`

**One open row (`endedAt` null) is the current owner.** Closed rows are how a new owner's technical-history view excludes a previous owner's private data. This is the mechanism behind one of the product's highest-consequence privacy rules: a new owner must see the machine's technical history and **never** the previous owner's financials.

### `WorkOrder` — the spine

| Field | Why it exists |
|---|---|
| `status` | `WorkOrderStatus`, 16 states. **Only `WorkOrderLifecycleService` writes it** |
| `inspectionDeclined` | Recorded as a **fact**, not inferred from the absence of an `Inspection` row — *"not inspected yet"* and *"will not be inspected"* are different states, and the Finish Gate must not block a job for a step the customer refused |
| `relinkedFromWorkOrderId` | A job re-opened against an earlier one; self-relation, `SetNull` |
| `promisedAt` | The promised time a queue orders by. A walk-in queue and an SLA clock are the same concept at different granularities — one field serves both |
| `expectedDurationMinutes` | Workshop-defined SLA in minutes. **`null` means no SLA is tracked, not "zero minutes allowed"** |
| `closedAt` | Set on close |

Cascade discipline: `tenant` cascades; `branch`, `asset` and `customer` are **`Restrict`**. You cannot delete a branch out from under a job's history.

Indexes: `(tenantId, status)`, `(tenantId, branchId, status)`, `(tenantId, customerId)`, `(assetId)` — the four questions every board, queue and history view actually asks.

### The rest of Operations

| Entity | Purpose | Notes |
|---|---|---|
| **`WorkOrderAssignment`** | Which staff are on this job, over time | `unassignedAt` null = current |
| **`Task`** | One unit of work | `actualMinutes` is the technician's **reported** figure, not derived from timestamps — a task blocked and resumed would overstate elapsed time. `serviceKey` links it to the catalogue |
| **`Subtask`**, **`TaskAssignment`** | Decomposition and per-task staffing | |
| **`TaskBlocker`** | Why work stopped | `BlockerReason`, `BlockerStatus`. `no_open_blocker` is a core Finish gate |
| **`Inspection`** | A recorded inspection | `InspectionType` (quick / full), and a `DECLINED` value added by migration |
| **`Fault`** | A finding, with `SeverityLevel` | **`CRITICAL` faults drive the `work_order.has_critical_fault` routing fact** used by `QC_MANDATORY`'s `RISK_FLAGGED_ONLY` |
| **`WorkOrderNote`** | Append-only note | **No update or delete path exists.** Governed by `POST_CLOSE_ADDENDA` |
| **`WorkOrderDispute`** | A recorded disagreement | |
| **`Attachment`** | Files against a record | |

## 6. Inventory

| Entity | Purpose | Notes and invariants |
|---|---|---|
| **`InventoryItem`** | The catalogue row | `sku` unique per tenant. `sellingPrice` always, `cost` optional and **permission-gated on read** (`inventory.cost.view`). `stockTracked`, `workOrderUsable`, `posVisible` split three different questions that a single boolean would have merged |
| **`WarehouseStockBalance`** | The claim about one item in one warehouse | Five buckets: `availableQty`, `reservedQty`, `issuedQty`, `returnPendingQty`, `damagedQty`. Unique on `(inventoryItemId, warehouseId)` |
| **`PartRequest`** | A technician asking for a part | 15 states — see doc 09. Its whole graph is skipped when `INVENTORY` is off |
| **`IssuedItem`** | What actually left the shelf against a request | Supports **partial fulfilment** (migration `20260809195647`) |
| **`PartReturnRequest`** | A part coming back | ⚠️ Was a real bug: `requestReturn` never wrote this row. Fixed |
| **`WorkOrderPartLine`** | The billable consequence of a part on a job | The bridge between Inventory and Finance Core |
| **`StockMovement`** | The immutable ledger | `StockMovementType`. Every balance change has a movement; a balance with no movement behind it is a defect |
| **`InventoryTransfer`** | Stock between warehouses | `TransferStatus` |
| **`SupplierOrder`** | Buying what is not on the shelf | `SupplierOrderStatus` |
| **`Warehouse`**, **`BranchWarehouseAccess`** | Where stock lives, and which branch may draw from it | Deactivation is `BLOCK_UNTIL_ZERO` (edge cases H6/E16/H7) |

**The never-negative invariant is enforced twice, deliberately.** `StockService` refuses the movement and produces a message a human can act on; a database `CHECK` constraint makes it impossible for a seed script, a data fix, or a future service to write a negative quantity of a physical object.

> *Service code is a promise; a constraint is a fact.*

## 7. Finance Core

| Entity | Purpose | Notes and invariants |
|---|---|---|
| **`FinanceConfiguration`** | The workshop's money settings | Read by `gate-evaluator.service.ts` and `decision.service.ts`. Carries `allowUnpaidDelivery`, `customerInvoiceVisible`, `compliantBlocked` — each written from a **policy answer**, not left on a column default |
| **`PriceCatalogEntry`** | A named service and its price | **Effective-dated.** A price edit closes the old row and opens a new one; it never rewrites what an issued invoice already printed |
| **`Quotation`**, **`QuotationItem`** | A priced proposal | `QuotationStatus` |
| **`RunningInvoice`**, **`RunningInvoiceLine`** | The live total while the job is open | `RunningInvoiceLine.source` records where a line came from |
| **`Invoice`**, **`InvoiceLine`** | The issued document's financial content | `InvoiceStatus`. **Immutable once issued** |
| **`InvoiceSequence`** | Gap-free numbering per tenant | |
| **`Payment`** | Money received | `PaymentMethod`, `PaymentStatus`. **Idempotency-keyed** |
| **`DiscountRequest`** | A discount above the workshop's threshold | `DiscountRequestStatus`. Must be `APPROVED` **for this exact work order and amount** before an invoice carrying it may issue |
| **`RefundRequest`** | Money going back | `RefundRequestStatus`, `RefundReasonCategory` |
| **`CreditNote`**, **`CreditNoteSequence`** | The only honest way to change an issued invoice | |

## 8. Billing

| Entity | Purpose | Notes |
|---|---|---|
| **`BillingDocument`** | The legal artefact and its compliance state | `BillingDocumentStatus`, `ClearanceStatus`. In several markets an invoice is not legally valid until cleared by a government portal, which is why this is a separate bounded system from Finance Core |

`historicalRecordPolicy` for the `BILLING` capability is `EXTERNAL_REFERENCE_ONLY`: an issued legal invoice can never be rewritten or removed, only referenced.

## 9. Customer

| Entity | Purpose | Notes and invariants |
|---|---|---|
| **`Customer`** | The person or company | Linked to an `Account` when they have portal access; `CustomerPortalStatus` tracks `NOT_INVITED` / `INVITED` / … |
| **`CustomerDecisionRequest`** | A question put to the customer | 7 states. `secureToken` powers the public `/decide/:token` path with no login |
| **`CustomerDecisionItem`** | One line the customer answers | `CustomerDecisionItemDecision`. `SeverityLevel` drives the acknowledgement gate under `APPROVAL_WEIGHT` |
| **`CustomerTimelineEvent`** | The customer's own view of progress | A **translation**, not a filter — see doc 11 |
| **`SafeTechnicalHistory`** | What a future owner may see | Scoped by `AssetOwnershipHistory` so a previous owner's private data is excluded |
| **`MessageTemplate`** | The 8 customer-facing message bodies | Immutable per-version rows, mirroring `WorkshopPolicy`'s discipline. ⚠️ **No message-sending code exists anywhere in the product** — this is the complete source of truth ready for that code, deliberately not a second hardcoded copy |

## 10. Forms

| Entity | Purpose | Notes |
|---|---|---|
| **`CustomFieldDefinition`** | A workshop-added field on one of the 9 forms | Category/role scope, customer-visible / reportable / required flags. `validateValues()` is the reusable validation link. 🟡 **No consuming UI captures values yet** — the authoring half is complete, the recording half is not |

## 11. Enums worth knowing by heart

| Enum | Values |
|---|---|
| `WorkOrderStatus` (16) | `DRAFT` `REGISTERED` `UNDER_INSPECTION` `AWAITING_CUSTOMER_APPROVAL` `APPROVED_FOR_WORK` `IN_PROGRESS` `WAITING_PARTS` `WAITING_CUSTOMER` `BLOCKED` `READY_FOR_TEAM_REVIEW` `READY_FOR_QC` `QC_FAILED` `READY_FOR_DELIVERY` `PAYMENT_PENDING` `CLOSED` `CANCELLED` |
| `PartRequestStatus` (15) | `DRAFT` `REQUESTED` `APPROVED` `ISSUED` `ARRIVED` `RECEIVED_BY_TECHNICIAN` `USED` `RETURN_REQUESTED` `RETURN_ACCEPTED` `RETURNED_TO_STOCK` `RETURN_REJECTED` `RETURN_CLARIFICATION_REQUESTED` `REJECTED` `UNAVAILABLE` `CANCELLED` |
| `CustomerDecisionStatus` (7) | `PENDING` `SENT` `VIEWED` `PARTIALLY_RESPONDED` `RESOLVED` `EXPIRED` `CANCELLED` |
| `CategoryCode` | `CARS` `MOTORCYCLES` `HEAVY_EQUIPMENT` |
| `StaffRole` | 7 — see doc 05 |
| `AccountType` | `PLATFORM` `TENANT_STAFF` `CUSTOMER` `SYSTEM_AUTOMATION` |
| `TenantStatus` | `ACTIVE` `TRIAL` `PENDING_SETUP` `FROZEN` `SUSPENDED` `READ_ONLY` `ARCHIVED` |
| `SeverityLevel` | drives the critical-fault routing fact and the acknowledgement gate |
| `PartProvenance` | `INVENTORY` · external / customer-supplied variants |
| `AuditRiskLevel` | `LOW` … — every audit row carries one |

`WorkOrderStatus`'s 16 states were authored directly from the canonical spec's *Core Work Order Lifecycle* list. **The old schema was missing six of them** — which is precisely how a lifecycle ends up implemented as an if-chain.

## 12. Cross-cutting entity rules

1. **`tenantId` on everything.** Every tenant-scoped model carries it, and every query filters on it.
2. **Historical records are never mutated.** `TenantCapability`, `WorkshopPolicy`, `PriceCatalogEntry`, `MessageTemplate`, `SpecializationDefinition` versions, `WorkOrderNote`, `StockMovement`, `Invoice`, `AuditLog`, `OperationEvent` — closed and superseded, never rewritten.
3. **No hard delete of anything with history.** Enforced by `tools/lint-no-hard-delete.mjs`. Deactivation, archival and soft-delete exist instead.
4. **Money is `Decimal(12,2)` in the database and `string` across the API.** Enforced by `tools/lint-money.mjs`.
5. **A graph state must match a storable enum value.** Workflow graph states match the Prisma enums exactly, so a graph state can never drift from a persistable status.
6. **A state in the enum with no edge reaching it is a bug, not a placeholder.** `RETURN_REJECTED` and `RETURN_CLARIFICATION_REQUESTED` were exactly that, and were fixed — *the graph is what `canTransition()` actually checks, not the enum.*

## 13. Known model-level gaps

| Gap | Detail |
|---|---|
| `TenantConfiguration.workflowPolicy` | ⚠️ Empty, unread JSON placeholder. Workflow Health reports the one check that would need it as **not computable**, rather than faking a result |
| `WorkOrderPartLine.cost` may be absent | Reports return `profit: null` rather than a wrong number when a part line never recorded a cost |
| No stable `serviceId` on invoice lines | `topServicesByRevenue` is explicitly grouped by invoice-line **text**, and says so |
| No real state-entry timestamp | SLA over-run uses `updatedAt` as an honest proxy for "since work started", named as such |
| No realtime transport | No model, and no mechanism. Doc 37 |
