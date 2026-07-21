# Optional Refactor Plan

These are not blockers for Version 5, but they will make the product easier to scale.

## Phase 1: Domain Service Extraction

Extract backend service helpers:

- `PartLifecycleService`
- `InventoryLedgerService`
- `ReturnLifecycleService`
- `TechnicianFinishGateService`
- `CustomerSafeTimelineService`

Goal: keep controllers thin and make lifecycle transitions unit-testable.

## Phase 2: Frontend Feature API Facades

Add frontend feature services:

- `technician-api.service.ts`
- `inventory-api.service.ts`
- `customer-decisions-api.service.ts`
- `work-orders-api.service.ts`

Goal: reduce direct `ApiClient` usage inside large components and centralize loading/error/reload patterns.

## Phase 3: Shared Lifecycle Maps

Create shared status/lifecycle files:

- `part-request-lifecycle.ts`
- `task-lifecycle.ts`
- `customer-decision-lifecycle.ts`
- `stock-status.ts`

Goal: one source of truth for transition rules and role-safe labels.

## Phase 4: Common Error Contract

Add a standard API error shape:

```ts
{
  code: string;
  message: string;
  fieldErrors?: Record<string, string>;
  permission?: string;
  recoverable: boolean;
}
```

Goal: consistent frontend error UI.

## Phase 5: Scenario Fixtures

Split seed data into scenario fixture builders:

- identity fixture
- customer decision fixture
- technician work card fixture
- inventory lifecycle fixture
- multi-warehouse fixture

Goal: easier QA and repeatable automated tests.

