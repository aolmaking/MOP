# MOP Architecture Risk List

## P0 Risks

None remaining after this gate.

Resolved during this gate:

- Stock movements lacked before/after quantities.
- Inventory item actions used broad edit authorization instead of granular action permissions.
- Technician request actions used broad request view authorization instead of granular action permissions.
- Damaged return did not fully update damaged quantity and issued item state.
- Accepted return could leave the linked part request as return pending, blocking Finish incorrectly.
- Inventory home/report stock risk used item-level stock instead of warehouse balance aggregation.

## P1 Risks

1. Lifecycle transition rules are not centralized.
   - Current state: transitions exist inside services.
   - Risk: future roles may introduce inconsistent transitions.
   - Recommendation: create shared lifecycle helpers for part request, task, work order, and customer decision transitions.

2. Inventory and Technician services are becoming large.
   - Current state: service methods are organized but dense.
   - Risk: Version 5 may make them hard to test and modify.
   - Recommendation: split into smaller domain services such as `PartLifecycleService`, `InventoryLedgerService`, `FinishGateService`, and `TechnicianActionService`.

3. Frontend components still call `ApiClient` directly.
   - Current state: acceptable for prototype-to-product transition.
   - Risk: repeated loading/error/refresh behavior as the app grows.
   - Recommendation: add feature API facades per feature before broadening roles.

4. Quantity invariants are enforced mainly in service code.
   - Current state: service guards reduce negative quantities.
   - Risk: future writes may bypass safeguards.
   - Recommendation: add database checks or transactional invariant helper functions.

5. Error response format is framework-default.
   - Current state: Nest exceptions return standard errors.
   - Risk: frontend may handle errors inconsistently.
   - Recommendation: add a common API error DTO and frontend error presenter.

## P2 Risks

1. Reports Lite lacks date/category filters.
2. Movement ledger is capped but not fully paginated.
3. Shared UI component library is still minimal.
4. Seed data is strong for QA but should later be split into scenario fixtures.
5. Audit event creation is repeated in services; a central audit helper would reduce duplication.
6. Permission code registry exists in seed/shared route catalog, but a generated permission manifest would be cleaner.

