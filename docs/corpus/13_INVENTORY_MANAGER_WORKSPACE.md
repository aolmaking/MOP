# MOP — The Inventory Manager Workspace

> **Document ID:** DOC-13
> **Purpose:** the storekeeper's whole job — every screen, every control, and what each one changes in the ledger.
> **Authority:** DESCRIPTIVE.
> **Scope:** the six Inventory Manager pages and `InventoryController`.
> **Last verified:** 2026-09-01 against commit `a8c8bb5`.
> **Source of truth:** `apps/api/src/systems/inventory/`, `apps/web/src/app/experiences/inventory/`, `docs/detailed-specs/inventory-manager.md`, `docs/phases/PHASE_7.md`.
> **Related:** 09 (the system beneath this workspace), 12 (the technician's half), 05 (permissions).

---

## 1. Who this person is

The storekeeper sits at a desk and works long sessions. That is the opposite requirement to the technician's, which is why the two have **separate shells** rather than one shell branching on role: this role gets a **rail**, like the platform and branch sides.

Their job is to be the human at the point where the physical and digital worlds must agree. Everything below follows from that.

## 2. The six pages

| Page | Route | Answers |
|---|---|---|
| **Inventory Home** | `/inventory/home` | What needs me this morning? |
| **Technician Requests** | `/inventory/requests` | Who is waiting for a part? |
| **POS / Catalog Control** | `/inventory/catalog` | What do we sell, and at what price? |
| **Quantity Control & Stock Status** | `/inventory/stock` | What is on the shelf? |
| **Returns / Movements** | `/inventory/returns` | What is coming back, and what has moved? |
| **Reports & Stock Insights** | `/inventory/reports` | What is about to run out? |

All six `✅` in `PAGE_INVENTORY.md`.

## 3. Inventory Home — the storekeeper's Attention Center

The role's landing page, and deliberately a triage screen rather than a dashboard. **Seven cards**, each with a per-warehouse breakdown, each a link into the queue that resolves it.

The design rule it follows is the same as every other role's landing page: *answer "what needs me?" with no click, no filter and no memory of where they were.*

## 4. Technician Requests — the queue

| Control | Endpoint | Effect |
|---|---|---|
| **Approve** | `POST /inventory/requests/:id/approve` | `REQUESTED → APPROVED`. Refused under `PARTS_SEPARATION_OF_DUTIES` if the approver raised it (`DIFFERENT_PERSON`) or is not a manager (`ROLE_SEPARATED`) |
| **Reject** | `POST /inventory/requests/:id/reject` | `→ REJECTED` (terminal) |
| **Unavailable** | `POST /inventory/requests/:id/unavailable` | `→ UNAVAILABLE` (terminal). The honest answer when the shelf is empty — routes toward a supplier order |
| **Issue** | `POST /inventory/requests/:id/issue` | `APPROVED → ISSUED`, writes a `StockMovement` of type `ISSUE`, `availableQty ↓` `issuedQty ↑`. **Supports partial fulfilment** via `IssuedItem` |

Permissions: `inventory.requests.view`, `inventory.request.{approve,reject,mark_unavailable,issue}`.

## 5. Catalog Control

Paginated list plus a side-panel editor. `GET/POST /inventory/catalog`, `POST /inventory/catalog/:id`, permission `inventory.catalog.manage`.

Two deliberate absences:

- **Cost is absent unless `inventory.cost.view`.** Written as an explicit `false` in the baseline permission map, not merely omitted: *managing the catalogue does not imply seeing margin.* The column does not render until an owner grants it.
- **Quantity is not settable here.** Stock is changed by a movement, never by editing a catalogue row — otherwise the ledger and the balance would have two authors.

The three item booleans — `stockTracked`, `workOrderUsable`, `posVisible` — are separate because they answer different questions: *do we count it*, *may a job consume it*, *does it appear on the counter*.

## 6. Quantity Control & Stock Status

`GET /inventory/stock`, `GET /inventory/items/:id`. Shows the five buckets per item per warehouse: `availableQty` · `reservedQty` · `issuedQty` · `returnPendingQty` · `damagedQty`.

Warehouse lifecycle lives here too:

| Control | Endpoint | Rule |
|---|---|---|
| Deactivate | `POST /inventory/warehouses/:id/deactivate` | **`BLOCK_UNTIL_ZERO`** — a warehouse holding stock cannot be deactivated. Audited (`warehouse.deactivated`) |
| Reactivate | `POST /inventory/warehouses/:id/reactivate` | Audited (`warehouse.reactivated`) |

Edge cases H6/E16/H7 — the naive version silently orphaned stock.

## 7. Returns / Movements

Two facets on one page: a **decision queue** and a **tenant-wide filterable ledger**.

| Control | Endpoint | Effect |
|---|---|---|
| **Accept** | `POST /inventory/returns/:id/accept` | `RETURN_REQUESTED → RETURN_ACCEPTED → RETURNED_TO_STOCK`. Writes `RETURN_TO_STOCK` (or `DAMAGED`), `returnPendingQty ↓` `availableQty ↑`. **This is the only action in the product that raises available stock from a return** |
| **Reject** | `POST /inventory/returns/:id/reject` | `→ RETURN_REJECTED`, from which the technician resolves it — typically by marking it Used after all. **Not** the top-level `REJECTED` terminal: the part was already handed over, so the request cannot quietly die |
| **Clarify** | `POST /inventory/returns/:id/clarify` | `→ RETURN_CLARIFICATION_REQUESTED`. A question without a decision; the reply returns to `RETURN_REQUESTED` so the next action is the same decision as a first-time request. The loop may repeat any number of times |

Ledger: `GET /inventory/movements`, permission `inventory.movements.view`.

**Two real backend bugs were found and fixed while this page was built**, both of the same class: `RETURN_REJECTED` and `RETURN_CLARIFICATION_REQUESTED` existed in the enum with **no workflow-graph edge reaching them**, and `PartReturnRequest` was **never written** by `requestReturn`. Building the page is what made them visible — which is the argument for vertical slices in one sentence.

## 8. Reports & Stock Insights

`GET /inventory/reports`, permission `reports.inventory.view`.

Stock risk is **velocity-based, per warehouse** — not a static threshold comparison. An item with a threshold of 10 and no movement in a year is not at risk; one with a threshold of 4 consumed daily is.

`InventoryReportsService` is reused verbatim by the Owner's Reports & Analytics and by Data Analyst Inventory Analytics rather than reimplemented three times. **Inventory value is gated on `inventory.cost.view` in all three.**

For a single-warehouse tenant the comparison section is **absent, not empty** — the standing rule that a section with nothing meaningful to compare should not render as a blank shell.

## 9. ⚠️ The queue that cannot fill

The accept / reject / clarify queue is complete, tested and integrated. **The technician-side action that feeds it is not reachable.**

`PartRequestService.requestReturn` has no HTTP endpoint. Neither does `respondToClarification` — so even a return created some other way could be asked about and never answered. `markArrived` and `resolveRejectedReturn` are in the same position.

Net effect in the running product: the Returns queue can only ever be populated by the demo seed. See doc 37, gaps G-INV-02..05.

## 10. Policies in force

| Policy | Where the storekeeper feels it |
|---|---|
| `PARTS_SEPARATION_OF_DUTIES` | Approve refuses self-approval or a non-manager approver |
| `RETURN_UNUSED_BEFORE_FINISH` | Whether an unaccounted part blocks the technician's Finish or is only flagged for this queue to reconcile |

## 11. Implementation status

| Element | Status |
|---|---|
| Six pages, own rail shell | ✅ `[INTEGRATED]` |
| Home triage: 7 cards, per-warehouse breakdown | ✅ `[INTEGRATED]` |
| Request approve / reject / unavailable / issue, partial fulfilment | ✅ `[VERIFIED]` |
| Catalogue CRUD, cost permission-gated, quantity deliberately not settable | ✅ `[INTEGRATED]` |
| Five-bucket stock view, never-negative in service **and** constraint | ✅ `[VERIFIED]` |
| Warehouse deactivate/reactivate, `BLOCK_UNTIL_ZERO`, audited | ✅ `[VERIFIED]` |
| Returns queue incl. the clarify↔reply loop | ✅ `[INTEGRATED]` |
| Tenant-wide filterable movement ledger | ✅ `[INTEGRATED]` |
| Velocity-based stock risk, reused by three surfaces | ✅ `[INTEGRATED]` |
| **Return requests arriving from technicians** | ⚠️ blocked — no technician endpoint |
| **Stock adjustment as a first-class action** | 🟡 — `inventory.stock.adjust` and the `ADJUSTMENT` movement type exist; reconciliation is not yet its own page, which doc 09 §1 argues it must eventually be |
| **Inventory transfers between warehouses** | 🟡 — model, `TransferStatus` and `inventory.transfer.create` exist; no graph states, no endpoint, no page |
| **Supplier orders** | 🟡 — model, `SupplierOrderStatus` and `inventory.supplier_order.create` exist; no endpoint completes the loop back to `SUPPLIER_RECEIPT` |
| `WAREHOUSE_REVIEWING` / `IN_TRANSIT` / `WAITING_TRANSFER` / `WAITING_SUPPLIER` | ⚠️ read by Home and the requests view, written by nothing — gap G-INV-01 |
