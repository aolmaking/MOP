# V4 Inventory Manager Experience

## Locked Navigation

Inventory Manager has exactly six main pages:

1. Inventory Home
2. Technician Requests
3. Inventory POS / Catalog Control
4. Quantity Control & Stock Status
5. Returns / Movements
6. Reports & Stock Insights

Technician remains locked to three pages only:

1. Technician Home
2. My Work
3. Work Card

Inventory details added for technicians must stay inside Home, My Work, or the Work Card parts drawer.

## Technician To Inventory Lifecycle

The part lifecycle is now structured as operational events:

1. Technician requests part from Work Card POS.
2. Inventory Manager reviews request in Technician Requests.
3. Inventory Manager approves, rejects, marks unavailable, creates transfer, creates supplier order, or issues/dispatches.
4. Issue/dispatch deducts available stock, creates an issued item, creates a stock movement, and puts the technician item in transit.
5. Technician confirms Arrived from Work Card.
6. Technician marks Used or Return Unused.
7. Return Unused creates an inventory return request.
8. Inventory Manager accepts return to stock, accepts as damaged, or rejects.

Finish stays blocked if issued parts are not received, received parts are not used or returned, or a return is still pending inventory review.

## Part Request Contract

Every technician request carries the V3 freeze contract fields:

```json
{
  "request_id": "",
  "work_order_id": "",
  "task_id": "",
  "technician_id": "",
  "branch_id": "",
  "category": "",
  "asset_identifier": "",
  "item_id": "",
  "item_name": "",
  "qty": 1,
  "urgency": "normal | high | critical",
  "reason": "",
  "status": "pending_inventory_review",
  "requested_at": ""
}
```

Supported lifecycle statuses include requested, pending warehouse, approved, issued, in transit, arrived, received by technician, used, return requested, returned to stock, rejected, unavailable, waiting transfer, waiting supplier, cancelled.

## Multi-Warehouse Foundation

The schema now supports:

- Branch to warehouse access rules.
- Warehouse stock balances per item.
- Issued items linked to work order, task, technician, and warehouse.
- Return requests linked to issued items.
- Transfers and supplier orders linked to technician requests.

This supports both one branch with multiple warehouses and multiple branches sharing a warehouse.

## Reports Lite

V4 includes first-pass inventory insights:

- Usage by item.
- Consumption by category.
- Stock risk.
- Returns report.
- Technician request report.
- Movement ledger.
