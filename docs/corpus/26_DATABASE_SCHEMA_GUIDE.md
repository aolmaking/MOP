# MOP — Database Schema Guide

> **Document ID:** DOC-26
> **Purpose:** the schema's philosophy — ownership, constraints, cascades, indexes, migrations — and the rules a change to it must respect.
> **Authority:** ARCHITECTURAL.
> **Scope:** `packages/database/prisma/`.
> **Last verified:** 2026-09-01 against commit `a8c8bb5`. 77 models, 40 enums, 31 migrations.
> **Source of truth:** `schema.prisma`, [`../DATABASE_STRATEGY.md`](../DATABASE_STRATEGY.md), [`../DATA_DICTIONARY.md`](../DATA_DICTIONARY.md).
> **Related:** 06 (entity reference), 22 (invariants), 23 (concurrency).

---

## 1. Philosophy

**The schema is the last line of defence, not the first.** Service code is a promise; a constraint is a fact. Anything that would be catastrophic if a seed script, a data fix or a future service got it wrong belongs in the database, even when the service already checks it.

Four working principles:

1. **Model the business, not the screen.** `Asset`, not `Vehicle` — a generator has no plate. `ChargeableWorkItem` carries `provenance` because a customer-supplied part is not an inventory item priced at zero.
2. **Historical truth is a different question from current configuration**, and it wins for anything that already happened.
3. **Enums are behaviour, so they live beside the graph that walks them** — a state in an enum with no edge reaching it does not exist.
4. **Comments record the constraint that forced the shape**, never what the field is called. The schema is one of the best-commented files in the repository, deliberately.

## 2. Tenant ownership

Every tenant-scoped model carries `tenantId`, and every query filters on the session's tenant. There is no row-level security in the database; isolation is enforced in the service layer and asserted by tests that actively try to cross it.

`tenantId` is **nullable** in exactly two places, both correct:
- `AuditLog` — a platform action is a real audit event with no tenant of its own.
- `PositionTaxonomyEntry` — `null` is the platform default for a category, overridden per tenant.

Three unique identifiers are platform-wide: `Tenant.nameNormalized`, `Tenant.slug`, `Tenant.customerRegistrationCode`.

> **`nameNormalized` is a real shadow column**, maintained by application code on write. Postgres supports `UNIQUE (lower(name))`, but Prisma's DSL has no functional index — so a lowercase mirror is the portable way to enforce case-insensitive platform-wide uniqueness without hand-writing provider-specific SQL into the migration.

## 3. Cascade discipline

| Rule | Applies to |
|---|---|
| `Cascade` | Anything owned by a `Tenant` — deleting a tenant is a platform-level act |
| **`Restrict`** | `WorkOrder.branch`, `WorkOrder.asset`, `WorkOrder.customer`; `SpecializationEntry.definition` |
| `SetNull` | `WorkOrder.relinkedFrom` — a self-relation whose absence is meaningful |

**`Restrict` is the important one.** You cannot delete a branch out from under a job's history. Deactivation, archival and soft-delete exist instead, and `tools/lint-no-hard-delete.mjs` fails the build on a hard delete of anything with history.

## 4. Constraints that carry business meaning

| Constraint | Migration | Why in the database |
|---|---|---|
| Stock buckets never negative | `20260809203000_stock_never_negative` | A negative quantity of a physical object must be impossible, not merely refused |
| `returnPendingQty` **may** go negative | `20260812170000_return_pending_may_be_negative` | It is a reconciliation counter, not a count of objects on a shelf |
| `(inventoryItemId, warehouseId)` unique | init | One balance row per item per store |
| `(tenantId, sku)` unique | init | |
| `Payment.idempotencyKey` unique | init | **The actual duplicate-payment prevention** — a check-then-write has a window; a constraint does not |
| `InvoiceSequence` / `CreditNoteSequence` | init, `…billing_documents_and_credit_notes` | Gap-free numbering per tenant |

## 5. Money

`Decimal @db.Decimal(12, 2)` everywhere money is stored. `string` everywhere money crosses the API, enforced by `tools/lint-money.mjs`.

Twelve digits with two decimals: larger than any invoice a workshop will issue, and exact. `packages/shared/src/money/` works in integer minor units and **refuses** more than two decimal places rather than rounding quietly.

## 6. Indexes

Indexes exist to serve a question the product actually asks, and each is worth knowing:

| Model | Index | Question |
|---|---|---|
| `WorkOrder` | `(tenantId, status)` | The board |
| | `(tenantId, branchId, status)` | One branch's board |
| | `(tenantId, customerId)` | This customer's jobs |
| | `(assetId)` | This vehicle's history |
| `AuditLog` | `(tenantId, createdAt)` | What changed here recently |
| | `(targetType, targetId)` | Everything that ever happened to this record |
| `OperationEvent` | `(tenantId, eventKey)` | Event replay and analytics |
| `WorkOrderAssignment` | `(staffUserId, unassignedAt)` | *My work* — current assignments |
| `Asset` | `(tenantId, plateNumber)`, `(tenantId, serialNumber)` | Intake search across both category shapes |
| `SpecializationDefinition` | `(tenantId, category, kind)` | *This category's service cards* |

**The rule for a new index:** name the query it serves. An index with no query behind it is cost with no benefit, and one added "for safety" usually means the query was never written down.

## 7. The immutable-record family

Nothing here is ever mutated. See doc 21 §6 for the full list — `AuditLog`, `OperationEvent`, `StockMovement`, `Invoice`/`InvoiceLine`, `WorkOrderNote` (no update or delete path exists at all), `TenantCapability`, `WorkshopPolicy`, `PriceCatalogEntry`, `MessageTemplate`, `SpecializationEntry`, `AssetOwnershipHistory`.

Three shapes implement it, and picking the right one matters:

| Shape | Used when | Example |
|---|---|---|
| **Insert-only** | The record *is* the event | `StockMovement`, `AuditLog` |
| **Time-ranged** | An answer that changes and whose history must stay readable | `TenantCapability`, `WorkshopPolicy` |
| **Versioned + pinned** | A shape that changes while old instances must keep their meaning | `SpecializationDefinition.version` ← `SpecializationEntry.definitionVersion` |

## 8. Enums as behaviour

40 enums. The load-bearing ones — `WorkOrderStatus`, `PartRequestStatus`, `CustomerDecisionStatus` — must match their `WorkflowGraph.states` **exactly**, so a graph state can never drift from a storable status.

`WorkOrderStatus`'s 16 values were authored directly from the canonical spec's *Core Work Order Lifecycle* list. **The old schema was missing six of them** — which is precisely how a lifecycle ends up implemented as an if-chain across whichever services happened to need it.

⚠️ **Currently violated.** `PartRequestStatus` declares 19 values; `PART_REQUEST_GRAPH` declares 15. `WAREHOUSE_REVIEWING`, `IN_TRANSIT`, `WAITING_TRANSFER` and `WAITING_SUPPLIER` have no edge and no writer, yet three services read them. Gap G-INV-01.

## 9. Migrations

31 migrations, `20260807133953_init` → `20260822150000_plan_allowed_exports`.

**Migration history is immutable — never reordered, never renamed, never edited after it has run anywhere.**

```bash
corepack pnpm --filter @mop/database generate     # Prisma client
corepack pnpm --filter @mop/database validate     # schema validity
corepack pnpm db:deploy                           # apply
corepack pnpm db:test:prepare                     # ← the trap: run after every new migration
corepack pnpm db:seed                             # two differently-shaped tenants
corepack pnpm db:seed:demo                        # rich demo data on top
```

> **The trap.** Forgetting `db:test:prepare` leaves the test database missing the new table, and integration tests fail with a confusing 500 that looks like a code bug.

`packages/database/generated/` is the Prisma client. **Never hand-edited.**

## 10. Seeds

`seed.ts` creates **two deliberately different tenants**, because a single-tenant database makes isolation and shape bugs invisible:

| Tenant | Shape |
|---|---|
| **Apex Motors** (`apex-motors`) | Multi-branch full service — *Nasr City* and *Giza*, warehouses *Central Warehouse* and *Giza Store*, inventory + teams + QC |
| **Delta Quick Service** (`delta-quick`) | Single bay (*Main Bay*), no inventory, no teams, no QC |

> *"Delta is the shape that breaks naive code."* Any code assuming an inventory, a team or a second branch fails against Delta before it reaches a customer.

`seed-demo.ts` layers realistic operational data on top: jobs in every lane, parts at every stock level, blockers, decisions.

⚠️ **The seed is currently the only writer of `Task`.** `TechnicianWorkService.createTask` has no endpoint, so tasks cannot be created through the product. Demo data therefore contains something the running application cannot produce — a state of affairs to close, not to design around. Gap G-OPS-03.

## 11. Growth and pruning

Three tables grow without bound and nothing prunes them: `AuditLog`, `OperationEvent`, `StockMovement`.

For `StockMovement` that is correct — it is the ledger, and `replay()` depends on it. For the other two, **no retention or archival policy exists**, and a busy tenant will grow both indefinitely. Recorded as a gap rather than left to be discovered in production.

## 12. Changing the schema

1. Edit `schema.prisma`. **Comment the constraint that forced the shape**, not what the field is called.
2. Create a migration. Never edit one that has run.
3. `db:test:prepare`.
4. If you added an enum value, **add the graph edge that reaches it** — otherwise it does not exist (W-6).
5. If it is money, it is `Decimal(12,2)` in and `string` out.
6. If it has history, it is not hard-deleted.
7. If it is tenant-scoped, it carries `tenantId` and every query filters on it.
8. Add or update the index that serves the query you are about to write.
9. Integration-test it **against real Postgres**.

## 13. Implementation status

| Element | Status |
|---|---|
| 77 models, 40 enums, tenant-scoped throughout | ✅ |
| Restrict/cascade discipline | ✅ |
| Never-negative stock enforced in the database | ✅ |
| Payment idempotency as a unique constraint | ✅ |
| Gap-free invoice and credit-note sequences | ✅ |
| Money as `Decimal(12,2)`, string across the wire | ✅ |
| Immutable-record family, three shapes | ✅ |
| 31 immutable migrations | ✅ |
| Two differently-shaped seed tenants | ✅ |
| **Enum ↔ graph parity for `PartRequestStatus`** | ⚠️ G-INV-01 |
| **`Task` creatable through the product** | ⚠️ G-OPS-03 |
| **Retention / archival for `AuditLog` and `OperationEvent`** | 🔴 `[INTENDED]` |
| **Optimistic concurrency (`version`) on `WorkOrder`** | 🔴 `[INTENDED]` — two managers editing one job are last-write-wins |
| **Row-level security in the database** | 💤 deliberate — isolation is a service-layer property, asserted by tests |
