# Pre-V6 Regression Freeze Checklist

No Version 6 work should start until these flows are documented and checked against the shared lifecycles, contracts, and fixtures.

## Frozen V2-V5 Flows

### Customer Decision Flow

- Technician or Branch Manager creates a customer-safe decision request.
- The decision link is sent through the official MOP flow.
- Customer response records approved/rejected items.
- Critical rejection requires warning acknowledgement.
- Branch Manager sees pending, overdue, responded, and critical rejected decisions.
- Customer-safe timeline hides internal notes and inventory internals.

### Technician Work Card Flow

- Technician has only three pages: Home, My Work, Work Card.
- Work Card actions emit structured outputs.
- Finish gate blocks pending customer decisions, pending parts, unresolved returns, blockers, missing inspection, critical rejection, missing notes, and missing time tracking.
- Finish sends work to Team Review when enabled, otherwise QC.

### Part Request To Used Flow

- Request part starts inside task/work order context.
- Inventory Manager reviews and issues from scoped warehouse.
- Stock movement records before and after quantity.
- Technician confirms arrived.
- Technician marks used.
- Reports and Branch Manager attention center can see the operational impact.

### Return Unused Flow

- Technician can return an unused issued part.
- Inventory Manager reviews return.
- Return can be accepted to stock, accepted damaged, rejected, or clarification requested.
- Ledger and request status stay aligned.

### Out Of Stock Flow

- Technician sees out-of-stock and can request anyway.
- Inventory Manager can mark unavailable, waiting transfer, or waiting supplier.
- Branch Manager sees waiting parts impact without directly editing inventory.

### Multi-Warehouse Flow

- A branch can use primary, backup, shared, or transfer-only warehouses based on access rules.
- Inventory issue must respect warehouse scope.
- Transfer-only access cannot directly issue stock.

### Branch Manager Attention Flow

- Branch Manager has exactly six pages.
- Attention cards surface active work, waiting decisions, waiting parts, blockers, critical rejections, rework/QC failed, ready delivery, payment pending, and technician load.
- Branch Manager can follow up but cannot execute technician or inventory-manager tasks directly.

### Delivery/Payment Snapshot Flow

- V5 only shows payment and delivery readiness snapshot.
- Delivery is blocked by pending decisions, unresolved parts, open blockers, or unclear payment.
- Full finance, refunds, tax, and invoice generation remain out of V5.

## P0 Gate Status

- Shared lifecycle maps: complete.
- Domain contracts: complete.
- Common API error contract: complete.
- Domain service foundations: complete.
- Permission/action guard centralization: complete.
- Frontend feature API facades: complete for auth, technician, inventory, customer decisions, work orders, branch manager, and customer portal.
- Permission/scope detail files: complete for role-permission map, route guards, action guards, data visibility, and scope rules.
- Regression fixtures: complete.

Run `node tools/validate-pre-v6-stabilization.mjs` before starting Version 6.
