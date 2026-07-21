# MOP Architecture Gate Audit Report

## Gate Decision

Architecture Gate Result: PASS WITH FIXES

Version 5 can start after the runtime dependency step is completed and the full build/typecheck is run locally. No P0 architecture blockers remain in source after this gate.

## Scope

This audit covers V1 to V4:

- V1 identity, session, routing, role pages, and permissions.
- V2 customer decision flow and customer-safe history.
- V3 technician simple execution mode and Work Card.
- V4 inventory manager, part lifecycle, warehouse balances, returns, and reports lite.

## Architecture Summary

The project is now organized as a production-oriented monorepo:

- `apps/web`: Angular frontend with feature-based pages.
- `apps/api`: NestJS API with controllers, guards, access service, and feature services.
- `packages/database`: Prisma schema and seed data.
- `packages/shared`: contracts, route catalog, role page defaults, and shared DTOs.
- `docs`: version specs, integration QA, and architecture gate reports.

The main flow is explainable:

Frontend route/component -> API client -> controller guard -> service/domain logic -> Prisma data model -> DTO response -> UI state refresh.

## What Was Fixed During The Gate

- Added stock movement `beforeQty` and `afterQty` fields to support auditable stock ledgers.
- Populated before/after quantities for issue, opening balance, stock adjustment, return to stock, damaged return, direct used, arrival confirmation, issued used, and return requested movements.
- Changed inventory item action authorization from broad edit-only checks to granular service checks:
  - update -> `inventory.item.edit`
  - archive -> `inventory.item.archive`
  - toggle POS -> `inventory.item.set_pos_visible`
  - toggle Work Order -> `inventory.item.set_work_order_usable`
  - stock adjust -> `inventory.stock.adjust`
- Added granular technician request action checks:
  - approve -> `inventory.request.approve`
  - issue -> `inventory.request.issue`
  - reject/unavailable -> `inventory.request.reject`
  - transfer -> `inventory.transfer.create`
  - supplier -> `inventory.supplier_order.create`
- Fixed damaged return integrity: damaged returns now update issued item status, warehouse damaged quantity, return pending quantity, stock movement, and audit event.
- Fixed accepted return integrity: accepted returns now update the linked part request, so the technician Finish Gate no longer remains blocked after inventory accepts the return.
- Changed inventory home/report stock risk calculations to use `warehouseStockBalance` aggregation instead of stale item-level stock only.
- Exposed stock movement before/after quantities in shared contracts and Inventory Movement Ledger UI.

## Section Results

### 1. High-Level Architecture

Status: PASS

Frontend, backend, database, auth, role routing, permissions, feature modules, shared contracts, seed data, audit logs, and timeline events are separated clearly enough for Version 5.

### 2. Frontend Structure

Status: PASS WITH P1 FOLLOW-UP

Feature pages are grouped by feature. Routes are centrally guarded. Technician remains exactly three pages. Inventory Manager remains six pages. Customer portal is separated from internal staff pages.

P1 follow-up: introduce feature-level frontend API facade services to reduce direct `ApiClient` calls inside components as the app grows.

### 3. Backend / Service Logic

Status: PASS WITH FIXES

Business actions are implemented in API services, not just UI state. Important state changes write database rows and audit/ledger records.

Fixed in this gate: granular action permission checks and stock movement before/after quantities.

### 4. Auth & Authorization

Status: PASS

Session context includes account type, tenant, staff/customer identity, role, branch scope, warehouse scope, category scope, permissions, navigation, and workspace. Route guards and controller guards exist. Record-level access helpers exist for work orders, customers, inventory, and decisions.

### 5. Database / Data Model

Status: PASS WITH P1 FOLLOW-UP

Core entities exist for tenants, accounts, staff users, customers, branches, warehouses, branch warehouse access, assets, ownership history, work orders, tasks, customer decisions, inventory items, warehouse balances, part requests, issued items, returns, transfers, supplier orders, stock movements, audit logs, and timeline events.

Fixed in this gate: stock movements now support before/after quantities.

P1 follow-up: add stronger database-level constraints for non-negative quantities and threshold ordering.

### 6. Frontend / Backend Contracts

Status: PASS

Shared DTOs exist for customer decisions, technician work cards, inventory requests, stock status, returns, movements, and reports lite. The critical technician-to-inventory contract is structured.

### 7. Status Lifecycles

Status: PASS WITH P1 FOLLOW-UP

Statuses are enum-backed on the backend and simplified through DTO mappings for each role.

P1 follow-up: create a shared lifecycle map file for allowed transitions and role-safe labels.

### 8. Cross-Version Integration

Status: PASS

The V2 customer decision flow, V3 technician Work Card, and V4 inventory lifecycle are connected. Integration QA was completed in `docs/v2-v4-integration-qa-report.md`.

### 9. Requirements Traceability

Status: PASS

Traceability exists across frontend components, service actions, data models, and permissions for V1 to V4 core requirements.

### 10. Scalability & Maintainability

Status: PASS WITH P1/P2 FOLLOW-UP

The current structure can support Version 5. The largest maintainability risk is service growth in Technician and Inventory modules. This is manageable for now but should be split as role flows expand.

### 11. Data Safety / Privacy

Status: PASS

Customer work order access is scoped to own customer records and customer-visible summaries. Customer decision public DTO does not expose internal inventory, supplier, cost, or notes. Inventory Manager sees operational inventory data, not customer private financial data.

### 12. Performance / Practicality

Status: PASS WITH P2 FOLLOW-UP

Indexes exist for key inventory/warehouse/request paths. Movement lists are limited. Future pagination/date filters should be added when data volume grows.

### 13. Testability

Status: PASS WITH P1 FOLLOW-UP

Core actions are testable through services. However, some domain logic should be extracted into dedicated helpers for isolated unit testing.

## Validation Run

Passed:

```text
node tools\validate-structure.mjs
npx -y prisma@5.22.0 validate --schema packages\database\prisma\schema.prisma
Global web button wiring scan
TypeScript syntax/local-name check on changed files
```

Not run:

```text
pnpm -r typecheck
pnpm -r build
```

Reason: `node_modules` and generated Prisma client are not present in the workspace.

