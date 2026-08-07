# Inventory Manager — Detailed Page Specifications

> Status: **COMPLETE.** Derived fresh from `docs/PRODUCT_SPEC_CANONICAL.md`, cross-checked against the Phase 0 schema.
>
> **Multi-warehouse is the default assumption, not an edge case.** `StaffUser.warehouseScope` is an array; every page below operates across however many warehouses this Inventory Manager is scoped to, from exactly one (a small workshop's only stockroom) to many (a large workshop's branch-specific warehouses plus a central one). A warehouse switcher/filter appears wherever it's needed and is simply omitted when scope is exactly one — same discipline as the Branch Manager's branch switcher. Every quantity shown anywhere in this role is **per-warehouse** unless explicitly labeled "across all your warehouses" — a global-looking total that's secretly one warehouse's number is exactly the kind of ambiguity this spec is written to prevent.

---

## PAGE: Inventory Home

### Purpose
Daily operational triage, same spirit as Branch Manager's Attention Center.

### Access
Permission: `inventory.home.view`. Default landing page for this role.

### Cards
- **Pending Technician Requests** — count across all scoped warehouses, tappable into Technician Requests pre-filtered to Pending.
- **Items to Dispatch** — approved requests not yet issued.
- **Waiting Technician Arrival Confirmation** — issued/in-transit items where the requesting technician hasn't yet confirmed receipt.
- **Return Requests** — open `PartReturnRequest` rows awaiting a decision.
- **Low Stock / Critical Stock / Out of Stock** — three separate counts (not one combined "low stock" bucket), each reflecting `WarehouseStockBalance.availableQty` against that item's `lowStockThreshold`/`criticalStockThreshold`, computed **per warehouse** then summed for the card (an item low in Warehouse A and healthy in Warehouse B counts once, correctly attributed, not double-counted or averaged away).
- **Fast Moving Items** — top items by `StockMovement` volume this period, across scoped warehouses.

Each card, when there's more than one warehouse in scope, shows a small per-warehouse breakdown on hover/expand rather than only a blended total — an Inventory Manager covering 3 warehouses needs to know *which* warehouse has the critical-stock item, not just that one exists somewhere in their scope.

---

## PAGE: Technician Requests

### Purpose
The inbound queue — every part request from every technician whose request touches a warehouse this Inventory Manager covers.

### Access
Permission: `inventory.requests.view`; each action below has its own permission.

### Request card
Request ID, Work Order, task, technician, asset, category, branch, item, quantity, urgency, reason, **availability** (computed live per warehouse in scope — "3 available in Main Warehouse, 0 in Branch B Warehouse"), status, requested time.

### Actions
| Action | Permission | Effect |
|---|---|---|
| Approve | `inventory.request.approve` | `WAREHOUSE_REVIEWING → APPROVED`, does not move stock yet |
| Issue | `inventory.request.issue` | Atomic: decrements `availableQty`, increments `issuedQty` on the chosen warehouse's balance, creates `IssuedItem`, writes a `StockMovement` row with before/after quantities, sets status to `ISSUED` |
| Reject | `inventory.request.reject` | Requires a reason; notifies the requesting technician with that reason |
| Check other warehouse | *(view-only, no separate permission)* | Shows live availability across every warehouse in this Inventory Manager's scope for this item — not just the one the request was originally aimed at — so a request that can't be filled locally can be redirected without the technician having to re-request |
| Transfer | `inventory.transfer.create` | Creates an `InventoryTransfer` between two warehouses in scope; the request stays `WAITING_TRANSFER` until the transfer is `RECEIVED` at the destination, at which point it can then be issued normally |
| Supplier order | `inventory.supplier_order.create` | Creates a `SupplierOrder`; request moves to `WAITING_SUPPLIER` |
| Mark unavailable | `inventory.request.mark_unavailable` | Requires a reason; distinct from Reject — Unavailable means "we don't have it and aren't getting it right now," Reject means "this request itself shouldn't be filled" (wrong item, duplicate, etc.) — the two exist separately because they mean different things to the technician reading the status |

---

## PAGE: Inventory POS / Catalog Control

### Purpose
Catalog management — item master data. Explicitly not a customer-facing or cashier POS, despite the name inherited from the canonical spec (kept for continuity with how the product itself refers to it internally).

### Access
Permission: `inventory.catalog.manage`.

### Fields (per item, create/edit form)
Item name, SKU (unique per tenant), item type, category, subcategory, compatible operating categories (multi-select — a part usable on both Cars and Motorcycles is entered once, not duplicated), **per-warehouse** quantity is *not* set here (that's Quantity Control, since stock is a balance, not a catalog attribute), low/critical stock thresholds (these ARE catalog-level, applied uniformly to whichever warehouse balance is being evaluated — a workshop wanting different thresholds per warehouse for the same item is a possible future refinement, out of scope for this version), selling price (in the tenant's own currency), work-order-usable toggle, POS-visible toggle, stock-tracked toggle (an item can exist in the catalog purely for reference/pricing without formal quantity tracking — useful for a small workshop that doesn't want full inventory discipline on every consumable), image placeholder, barcode/QR, cost (shown only if this Inventory Manager's role has cost-visibility permission — same "hidden unless explicitly granted" discipline as Technician's price gate, applied here to the *inventory* side), supplier, notes.

### Table view
Server-side paginated (same discipline as every other list page in this spec set), filterable by category/subcategory/compatible-category/active-inactive/stock-tracked.

---

## PAGE: Quantity Control & Stock Status

### Purpose
The real-time balance view — what's actually on hand, per item, per warehouse.

### Access
Permission: `inventory.stock.view`.

### Layout
Table: item, SKU, category, then **one column group per warehouse in scope** (Available / Reserved / Issued / Received-by-technician / Used / Return-pending / Damaged), plus a computed status per warehouse (Healthy / Low / Critical / Out of Stock, from the catalog thresholds). For an Inventory Manager scoped to one warehouse, this collapses to a single column group — same table component, no separate "single warehouse" layout to maintain.

A **"Total across your warehouses"** row/column is available as an explicit opt-in view (not the default), clearly labeled as a sum across locations — so it's never confused with a single warehouse's real, physically-countable number.

### Statuses
Healthy / Low / Critical / Out of Stock, computed the same way the Home page's cards compute them, same thresholds, same source — one status-computation function used everywhere it's displayed, not reimplemented per page.

---

## PAGE: Returns / Movements

### Purpose
The stock ledger (append-only, every change with before/after quantities) and the return-request decision queue.

### Access
Permission: `inventory.movements.view` for the ledger; `inventory.stock.return.*` for the return actions.

### Movements ledger
Table: timestamp, item, warehouse, type (Issue / Return to Stock / Damaged / Transfer In / Transfer Out / Supplier Receipt / Adjustment), quantity, before qty, after qty, actor, reference (links back to the originating Work Order/request/transfer). Filterable by warehouse, item, type, date range; server-side paginated — a busy multi-warehouse workshop can generate a lot of ledger rows, and this table is built assuming that from the start.

### Return requests queue
Every open `PartReturnRequest`: item, quantity, requesting technician, Work Order, reason, requested time.

**Actions:**
- **Accept Return to Stock** — the *only* code path in the entire product that increments `availableQty` from a technician-initiated return (see `docs/DATA_DICTIONARY.md`'s note on this — it's a deliberately singular, auditable choke point). Atomic: decrements `returnPendingQty`, increments `availableQty`, writes a `StockMovement` (`RETURN_TO_STOCK`), sets the `PartRequest` to `RETURNED_TO_STOCK`.
- **Accept as Damaged** — decrements `returnPendingQty`, increments `damagedQty` (never `availableQty` — a damaged return is explicitly not sellable/usable stock), writes a `StockMovement` (`DAMAGED`).
- **Reject Return** — the technician's return is refused (e.g. the part shows signs of use); returns the part to `RETURN_REJECTED`, which the technician sees and must resolve (typically by marking it Used after all, if that's what actually happened) — the item does not silently vanish from tracking.
- **Request Clarification** — the action the previous build was missing entirely. Sends a question back to the requesting technician (free text, e.g. "Is this the correct part number? The SKU doesn't match what was issued.") without accepting or rejecting yet; sets `PartRequestStatus.RETURN_CLARIFICATION_REQUESTED`, which the Technician's Parts Panel renders with the question inline and a direct reply path — this loop can repeat (clarification → technician response → accept/reject/another clarification) rather than forcing a premature accept-or-reject decision on incomplete information.

---

## PAGE: Reports & Stock Insights

### Purpose
Inventory Manager's own reporting — warehouse-scoped, distinct from both Owner's company-wide Reports & Analytics and Platform Reports.

### Access
Permission: `reports.inventory.view`.

### Reports
Usage by item, consumption rate (trend over time), stock risk (items trending toward Low/Critical based on recent consumption velocity, not just current balance — a forward-looking signal, not a snapshot), returns report (volume, accept-vs-damaged-vs-reject rate), technician request report (which technicians request most, average fulfillment time), category usage, branch/warehouse usage comparison (only meaningful, and only shown with its full comparative layout, when this Inventory Manager is scoped to more than one warehouse — a single-warehouse scope shows that one warehouse's numbers without a comparison chart that would only ever have one bar).

Every report here respects the same per-warehouse discipline as the rest of this role — nothing on this page ever silently blends warehouses into one number without the same explicit "Total across your warehouses" opt-in labeling used on Quantity Control & Stock Status.
