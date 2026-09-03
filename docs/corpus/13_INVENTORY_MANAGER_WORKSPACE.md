# MOP — The Inventory Manager Workspace

> **Document ID:** DOC-13
> **Purpose:** the storekeeper's whole job — every screen, every control, and what each one changes in the ledger.
> **Authority:** DESCRIPTIVE.
> **Scope:** the six Inventory Manager pages and `InventoryController`.
> **Last verified:** 2026-09-01 against commit `a8c8bb5`; the catalog-driven
> part request (section appended at the end) verified 2026-09-03 against the
> working tree, by `apps/api/src/testing/catalog-cart.http.spec.ts` and a
> browser journey.
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


---

## Appendix A — Catalog Builder, the seventh page `[VERIFIED]`

> Added 2026-09-03. Route `/inventory/catalog-builder`
> (`apps/web/src/app/experiences/inventory/catalog-builder.*`). Proven by
> `apps/api/src/testing/catalog-cart.http.spec.ts` and a browser journey.

Catalog Control (page 2 above) answers "what is this item and what does
it cost". Catalog Builder answers the question the storekeeper actually
owns and previously could not express: **what will a technician see when
they go looking for a part?**

Three panels and a preview, on one route, because they are one decision:

1. **Categories** — create, rename, nest one level, deactivate, and hide
   from technicians. Each row carries its item count and filter count,
   because both are what a manager needs before deactivating anything.
   A banner counts parts filed under nothing at all, since those are
   invisible to a technician browsing by category.
2. **Filters** — invent a dimension ("Vehicle Type") and give it values
   (Sedan, SUV, Truck). Each value shows how many parts already carry
   it, read before hiding it.
3. **Which filters each category offers** — set as a whole set per
   category rather than one toggle at a time, because the manager is
   answering "what does someone filtering brake pads need?" once, not
   five times.
4. **What the technician will see** — the preview.

Splitting these across three routes would mean creating a filter,
navigating away, and hoping you remembered to attach it.

### A.1 The preview is not a mock-up

It calls `GET /inventory/catalog-preview`, which is
`CatalogBrowseService.browse` — the same method, with the same
arguments, that answers the technician's own page. A category left
`technicianVisible: false` vanishes from both together; a category with
no filters attached says so in the preview, in the words the manager
needs ("A technician browsing it can only search and scroll").

A preview drawn from local form state would agree with the form and
disagree with the product, which is the exact lie a preview exists to
prevent.

### A.2 Nothing here deletes

A category with parts filed under it and a filter value stamped on a
hundred of them are both referenced by records that outlive the decision
to stop using them. Deactivating removes them from the technician's
browse while leaving every existing part readable — which a delete
cannot do.

### A.3 Permissions

Every write on this page is behind `inventory.catalog.manage`, which
`INVENTORY_MANAGER` holds by default and `TECHNICIAN` does not. The
spec asserts a technician is refused the configuration endpoint, the
preview endpoint, and category creation. The technician's own catalogue
read is behind `inventory.request.create` — consuming the catalogue and
authoring it are different rights.

### A.4 What the item editor gained

Catalog Control's editor now files a part under a category (a select,
not free text) and stamps it with the filter values **that category and
its parent offer** — so a wiper blade is never offered "Engine Size".
`imageUrl` and `summary` are new: a technician recognises a part by
sight before they read its name, and `summary` is the one line under
the name on their card (distinct from `notes`, which stays the
storekeeper's own memo and is never shown).

### A.5 Ordering

Categories, filters and filter values each carry a `sortOrder` that the
technician's browse honours, and Catalog Builder sets it with up/down
controls. Alphabetical is a stranger's guess: a workshop that does
brakes all day wants Brakes first.

Each move sends the **whole sibling group**, not one row's new number —
a single number is how two rows end up sharing a position and the order
silently reverts. A list that omits a sibling, repeats one, or carries
one from another workshop is refused (`reorder_mismatch`) rather than
half-applied: it means the page is working from a stale picture, and
ordering the rest would leave the missing row wherever it was with
nothing to show anything went wrong.
