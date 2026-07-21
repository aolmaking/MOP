# Pre-V6 Architecture Stabilization Sprint

This sprint must run before starting Version 6. It is not a product feature sprint and must not add random pages or redesign the UI.

Goal: stabilize V2 through V5 so the next roles can scale safely.

## P0 Before V6

1. Freeze current behavior and document V2-V5 flows.
2. Create shared lifecycle/status maps.
3. Create shared domain contracts for the current flows.
4. Add a common API error contract.
5. Extract core domain services.
6. Centralize permission/action guard rules.
7. Add scenario fixtures for regression testing.

## Required Lifecycle Maps

- `part-request-lifecycle`
- `return-lifecycle`
- `task-lifecycle`
- `customer-decision-lifecycle`
- `work-order-lifecycle`
- `stock-status`
- `delivery-readiness`
- `payment-status`

Each lifecycle must define internal statuses, allowed transitions, blocked transitions, role-safe labels, colors/icons, and safe labels for customer, technician, inventory manager, and branch manager.

## Required Domain Contracts

- Customer decision
- Technician task
- Part request
- Issued item
- Return request
- Inventory item
- Warehouse stock
- Work order
- Audit event
- API error

## Common API Error Contract

```ts
export type ApiError = {
  code: string;
  message: string;
  fieldErrors?: Record<string, string>;
  permission?: string;
  blockingStatus?: string;
  recoverable: boolean;
};
```

Core error codes:

- `AUTH_UNAUTHORIZED`
- `PERMISSION_DENIED`
- `TENANT_INACTIVE`
- `FEATURE_DISABLED`
- `CATEGORY_DISABLED`
- `WAREHOUSE_SCOPE_DENIED`
- `CUSTOMER_DECISION_PENDING`
- `PART_REQUEST_PENDING`
- `PART_NOT_AVAILABLE`
- `RETURN_PENDING_REVIEW`
- `FINISH_BLOCKED`
- `VALIDATION_ERROR`
- `RECORD_NOT_FOUND`

## Domain Services To Extract

- `PartLifecycleService`
- `InventoryLedgerService`
- `ReturnLifecycleService`
- `TechnicianFinishGateService`
- `CustomerDecisionService`
- `CustomerSafeTimelineService`
- `WarehouseResolutionService`
- `BranchWarehouseAccessService`
- `AuditEventService`
- `WorkOrderStatusService`

## Frontend Facades

After the contracts and backend services are stable, add feature API facades:

- `technician-api.service`
- `inventory-api.service`
- `customer-decisions-api.service`
- `work-orders-api.service`
- `branch-manager-api.service`
- `customer-portal-api.service`
- `auth-api.service`

## Regression Fixtures

- Identity fixture
- Customer decision fixture
- Technician work card fixture
- Inventory lifecycle fixture
- Multi-warehouse fixture
- Branch manager attention fixture
- Delivery/payment snapshot fixture

V6 cannot start if these P0 stabilization checks are not documented and passing.
