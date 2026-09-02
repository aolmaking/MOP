# MOP — The Inventory System

> **Document ID:** DOC-09
> **Purpose:** how a part moves from a shelf into a car, how it comes back, and how the ledger stays honest about where it is.
> **Authority:** DESCRIPTIVE.
> **Scope:** catalogue, warehouses, stock balances, part requests, issues, returns, movements, transfers, supplier orders.
> **Last verified:** 2026-09-01 against commit `a8c8bb5`.
> **Source of truth:** `apps/api/src/systems/inventory/`, `packages/shared/src/capabilities/workflow-graphs.ts` (`PART_REQUEST_GRAPH`), `packages/database/prisma/schema.prisma`.
> **Related:** 06 (entities), 07/08 (lifecycle), 10 (the billing consequence), 13 (the Inventory Manager's workspace), 12 (the technician's half).

---

## 1. The premise

> **Stock is a claim about the physical world, and the two drift.**

The database says four brake pads are on the shelf; someone took one without recording it. Every inventory system faces this. The ones that survive make reconciliation a normal, cheap, blameless action rather than an admission of failure, and put a human at the point where the physical and digital worlds must agree.

That is why **stock only rises when the Inventory Manager accepts a return** — never when a technician declares one. A technician saying "I didn't use it" is a claim; a storekeeper putting it back on the shelf is a fact.

## 2. Capability shape

| Capability | Effect |
|---|---|
| `INVENTORY` | Without it, **the entire `PartRequest` graph is skipped** — the entity is never created. A parts wait becomes a `BlockerReason.WAITING_PART` blocker instead, and `parts.received_used_or_returned` is dropped so no job strands at a Finish Gate waiting for a lifecycle that cannot complete |
| `PART_RETURNS` | Separately removable: a workshop may issue parts but not accept them back. Correcting a mistake becomes a stock **adjustment**, not a return |
| `MULTI_WAREHOUSE` | Without it, all stock sits in one store and no transfer step is ever asked for |
| `EXTERNAL_PARTS` | Owned by **Operations**, not Inventory — a customer-supplied part never touches the workshop's stock |

## 3. The entities

| Entity | Is |
|---|---|
| `InventoryItem` | The catalogue row: `sku` (unique per tenant), `name`, `itemType`, `sellingPrice`, optional `cost`, thresholds, `compatibleCategories` |
| `Warehouse` + `BranchWarehouseAccess` | Where stock lives, and which branch may draw from it |
| `WarehouseStockBalance` | The claim, in five buckets, unique per `(item, warehouse)` |
| `PartRequest` | A technician asking for a part — the record the whole flow hangs off |
| `IssuedItem` | What actually left the shelf against a request. **Supports partial fulfilment** |
| `PartReturnRequest` | A part coming back |
| `StockMovement` | The immutable ledger |
| `WorkOrderPartLine` | The billable consequence — the bridge into Finance Core |
| `InventoryTransfer`, `SupplierOrder` | Stock between warehouses; buying what is not on the shelf |

### The three booleans that are not one boolean

`InventoryItem` carries `stockTracked`, `workOrderUsable` and `posVisible` separately, because they answer different questions: *do we count it*, *may a job consume it*, *does it appear on the counter*. Consumables that are used but not counted, and items sold over the counter but never fitted, both exist.

### `PartProvenance` — why a customer's own part is not a zero-priced item

| Value | Meaning |
|---|---|
| `INVENTORY` | Issued from the workshop's own stock. Has a `PartRequest` |
| `EXTERNAL_PURCHASE` | Bought in for this job; the workshop owns it briefly and bills it on, but it never enters stock |
| `CUSTOMER_SUPPLIED` | Supplied by the customer. Zero cost, labour billed separately, **and the workshop does not warrant the part** |

A customer who brings their own part and pays only for fitting cannot be modelled as an inventory item priced at zero. There is no stock movement, no cost to the workshop, and — decisively — **a different liability position, because warranty disputes turn on who supplied the part.**

## 4. The five stock buckets

`availableQty` · `reservedQty` · `issuedQty` · `returnPendingQty` · `damagedQty`

`returnPendingQty` exists because a returned part is in a genuinely third state: **neither sellable nor still issued**. It has left the technician and not yet been accepted onto the shelf. Without the bucket, the same physical part would have to be counted as available (wrong — nobody has checked it) or as issued (wrong — the technician does not have it).

### The never-negative invariant, enforced twice

`StockService` refuses the movement and produces a message a human can act on. A database `CHECK` constraint makes it impossible for a seed script, a data fix or a future service to write a negative quantity of a physical object.

> **Service code is a promise; a constraint is a fact.**

Added in migration `20260809203000_stock_never_negative`. One deliberate exception: `20260812170000_return_pending_may_be_negative` — the pending bucket may go negative transiently while a return is being resolved, because it is a *reconciliation* counter rather than a count of objects on a shelf.

## 5. Stock movements — the ledger

Every balance change has a movement. **A balance with no movement behind it is a defect**, and `StockService.replay(item, warehouse, bucket)` exists to prove it: replaying the movements must reproduce the balance.

| Type | Meaning |
|---|---|
| `ISSUE` | Left the shelf for a job |
| `RETURN_PENDING` | Sent back, not yet decided. **Reversed by a `RETURN_TO_STOCK` or `DAMAGED` movement of the same quantity when the inventory manager decides — never left standing on its own** |
| `RETURN_TO_STOCK` | Accepted back. **The only movement that raises `availableQty` from a return** |
| `DAMAGED` | Came back unusable |
| `TRANSFER_IN` / `TRANSFER_OUT` | Between warehouses |
| `SUPPLIER_RECEIPT` | Arrived from a supplier |
| `ADJUSTMENT` | Reconciliation with the physical world — the blameless action §1 argues for |

`StockService.record()` accepts a caller's transaction, so a movement and the domain change that caused it commit together.

## 6. The part request lifecycle

`PART_REQUEST_GRAPH`, `requires: ["INVENTORY"]`. Terminal: `USED`, `RETURNED_TO_STOCK`, `REJECTED`, `CANCELLED`, `UNAVAILABLE`.

```
DRAFT ──► REQUESTED ──┬─► APPROVED ──► ISSUED ──┬─► RECEIVED_BY_TECHNICIAN ──► USED
   │          │       ├─► REJECTED              └─► ARRIVED ──► RECEIVED_BY_TECHNICIAN
   │          │       └─► UNAVAILABLE
   └──► CANCELLED ◄───┴─ (from DRAFT / REQUESTED / APPROVED)

RECEIVED_BY_TECHNICIAN ──► RETURN_REQUESTED ──┬─► RETURN_ACCEPTED ──► RETURNED_TO_STOCK
                                              ├─► RETURN_REJECTED ──► USED
                                              └─► RETURN_CLARIFICATION_REQUESTED ──► RETURN_REQUESTED  (loop)
```

### Two edges worth understanding

**`ISSUED → RECEIVED_BY_TECHNICIAN` — the counter hand-over.** A part issued from the branch's own store does not "arrive" anywhere; the technician is standing at the hatch. Without this edge the only route to `RECEIVED_BY_TECHNICIAN` ran through `ARRIVED`, so an in-house issue could never be received and `parts.received_used_or_returned` could never observe it. The alternative — writing an `ARRIVED` nobody witnessed — would have put a transit event in the ledger **that never happened.** `ISSUED → ARRIVED` stays, for the part that genuinely travelled.

**`RETURN_REQUESTED → RETURN_REJECTED → USED`.** A rejected *return* is not the same event as a rejected *request*: the part was already handed over, so the technician has to resolve it — typically by marking it Used after all — rather than the whole request quietly dying. Landing this on the top-level `REJECTED` terminal, as the graph did before the fix, was exactly the bug the Returns/Movements spec named *"the previous build was missing entirely"*: the state existed in the enum with nowhere to go.

**The clarification loop** is a question without a decision. It returns to `RETURN_REQUESTED` on reply, so the manager's next action — accept, reject, or ask again — is the same decision they would have made from a first-time request. It may repeat any number of times.

### ⚠️ Four enum values with no edge and no writer

`PartRequestStatus` declares **19** values; `PART_REQUEST_GRAPH` declares **15**. The four with no transition reaching them are:

`WAREHOUSE_REVIEWING` · `IN_TRANSIT` · `WAITING_TRANSFER` · `WAITING_SUPPLIER`

They are not merely unreachable — they are **read by live code**:

- `inventory-view.service.ts:72` filters open requests on `["REQUESTED", "WAREHOUSE_REVIEWING", "APPROVED", "WAITING_TRANSFER", "WAITING_SUPPLIER"]`
- `inventory-home.service.ts:98,106` counts triage cards using `WAREHOUSE_REVIEWING` and `IN_TRANSIT`
- `technician-work-view.service.ts:85–95` carries customer-facing copy for all four (*"The store is looking at it."*, *"On its way from another branch."*, *"Coming from another branch."*, *"On order from a supplier."*)

Nothing writes them. This is the same class of defect that `RETURN_REJECTED` and `RETURN_CLARIFICATION_REQUESTED` were before they were fixed — **the graph is what `canTransition()` actually checks, not the enum** — with the added wrinkle that the reading side already behaves as though they occur. Recorded as gap **G-INV-01** in doc 37 rather than resolved here, per the corpus rule on contradictions.

## 7. The operational flow

```
Technician needs a part
   → PartRequest (REQUESTED)              inventory.request.create
   → Inventory Manager triages            inventory.requests.view
       ├─ approve       inventory.request.approve          → APPROVED
       ├─ reject        inventory.request.reject           → REJECTED
       └─ unavailable   inventory.request.mark_unavailable → UNAVAILABLE  (→ supplier order)
   → issue              inventory.request.issue            → ISSUED
       └─ StockMovement ISSUE, availableQty↓ issuedQty↑
   → technician receives                                    → RECEIVED_BY_TECHNICIAN
   → part fitted                                            → USED
       └─ WorkOrderPartLine → chargeable item → running invoice
```

And the return path:

```
Technician sends a part back                → RETURN_REQUESTED
   └─ StockMovement RETURN_PENDING, issuedQty↓ returnPendingQty↑
Inventory Manager decides:
   ├─ accept   inventory.stock.return.accept  → RETURN_ACCEPTED → RETURNED_TO_STOCK
   │     └─ StockMovement RETURN_TO_STOCK (or DAMAGED), returnPendingQty↓ availableQty↑
   ├─ reject   inventory.stock.return.reject  → RETURN_REJECTED → USED
   └─ clarify  inventory.stock.return.clarify → RETURN_CLARIFICATION_REQUESTED → RETURN_REQUESTED
```

## 8. Policies in force

| Policy | Effect |
|---|---|
| `PARTS_SEPARATION_OF_DUTIES` | `PartRequestService.approve` refuses self-approval (`DIFFERENT_PERSON`) or a non-manager approver (`ROLE_SEPARATED`) |
| `RETURN_UNUSED_BEFORE_FINISH` | `GateEvaluatorService.suppressedByPolicy` drops or downgrades `parts.received_used_or_returned` to advisory |

## 9. Gates this system owns

| Gate | Owner | Meaning |
|---|---|---|
| `parts.received_used_or_returned` | `INVENTORY` | A received part is neither marked used nor returned |
| `parts.no_pending_return` | `PART_RETURNS` | A return is still waiting for the inventory manager to accept it |
| `parts.external_resolved` | `EXTERNAL_PARTS` (Operations) | A customer-supplied or externally-sourced part is still unresolved |

Both inventory gates **die with their capability** — the mechanism that exists because Inventory and Part Returns once disagreed about the first one and stranded every job in the workshop.

## 10. Warehouse deactivation

`BLOCK_UNTIL_ZERO`: a warehouse holding stock cannot be deactivated. `POST /inventory/warehouses/:id/deactivate` and `…/reactivate` are real, audited endpoints (`warehouse.deactivated`, `warehouse.reactivated`). Edge cases H6/E16/H7 — the naive version silently orphaned stock.

## 11. Reads and reports

`InventoryReportsService` computes **velocity-based** stock risk per warehouse — not a static low-stock threshold comparison, because an item with a threshold of 10 and no movement in a year is not at risk, and one with a threshold of 4 consumed daily is.

It is reused verbatim by the Owner's Reports & Analytics and by Data Analyst Inventory Analytics rather than reimplemented. **Inventory value is gated on `inventory.cost.view`** in all three surfaces, the same as the Inventory Manager's own catalogue.

Branch scope resolves to warehouse scope through `BranchWarehouseAccess`, so an analyst filtering by branch gets the stores that branch may actually draw from.

## 12. Cross-system contract

Inventory does not write invoices. It produces a `ChargeableWorkItem` (`packages/shared/src/contracts/cross-system.ts`) with `provenance` and `inventoryItemId`, and Finance Core consumes it. Events crossing the boundary: `part.requested`, `part.issued`, `part.arrived_confirmed`, `part.used`, `part.unavailable`, `part.return_requested`, `part.return_accepted`, `part.return_rejected`, `stock.movement_recorded`.

## 13. Implementation status

| Element | Status |
|---|---|
| Catalogue CRUD, cost gated on permission | ✅ `[INTEGRATED]` — `/inventory/catalog` |
| Five-bucket balances with never-negative enforced in service **and** constraint | ✅ `[VERIFIED]` |
| Immutable movement ledger + `replay()` | ✅ `[VERIFIED]` |
| Part request lifecycle incl. partial fulfilment | ✅ `[VERIFIED]` |
| Return accept / reject / clarify with the clarify↔reply loop | ✅ `[INTEGRATED]` — `/inventory/returns` |
| Warehouse deactivation `BLOCK_UNTIL_ZERO` | ✅ `[VERIFIED]` |
| Velocity-based stock risk, per warehouse, reused by 3 surfaces | ✅ `[INTEGRATED]` |
| Inventory Home triage (7 cards, per-warehouse breakdown) | ✅ `[INTEGRATED]` |
| Separation-of-duties and return-gate policies | ✅ `[VERIFIED]` |
| ⚠️ `WAREHOUSE_REVIEWING` / `IN_TRANSIT` / `WAITING_TRANSFER` / `WAITING_SUPPLIER` | **Read by three services, written by nothing, unreachable in the graph.** Gap G-INV-01 |
| `InventoryTransfer` end-to-end (request → in transit → received) | 🟡 — model and status enum exist; the graph has no transfer states, so the multi-warehouse transfer journey is not reachable as a lifecycle |
| `SupplierOrder` end-to-end | 🟡 — model, permission (`inventory.supplier_order.create`) and status enum exist; no dedicated page completes the loop back to `SUPPLIER_RECEIPT` |
| Stock adjustment UI | 🟡 — `inventory.stock.adjust` and the `ADJUSTMENT` movement type exist; reconciliation is not yet a first-class page, which §1 argues it must eventually be |
