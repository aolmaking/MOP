# Required Fixes Before Version 5

## Gate Status

All P0 architecture blockers found during this gate have been fixed.

## Completed Required Fixes

1. Stock ledger auditability
   - Added `beforeQty` and `afterQty` to `StockMovement`.
   - Updated important movement writes to populate before/after quantities.

2. Granular inventory permissions
   - Request actions now validate action-specific permissions.
   - Catalog item actions now validate action-specific permissions.

3. Return lifecycle integrity
   - Return accepted to stock updates return request, issued item, part request, warehouse balance, stock movement, and audit.
   - Return accepted as damaged updates return request, issued item, part request, damaged quantity, return pending quantity, stock movement, and audit.

4. Balance-based inventory insights
   - Inventory home and reports now use warehouse stock balances for stock risk counts.

5. Shared contract visibility
   - Inventory movement DTO and UI now expose before/after movement quantities.

## Required Runtime Step Before Starting V5

Before implementing V5 features, run the dependency and build validation:

```text
pnpm install
pnpm --filter @mop/database prisma generate
pnpm -r typecheck
pnpm -r build
pnpm --filter @mop/database prisma db seed
```

If any full typecheck/build issue appears after dependency installation, fix it before starting Version 5.

## Version 5 Start Condition

Version 5 can start when:

- This architecture gate report is accepted.
- Full local typecheck/build passes after dependencies are installed.
- No new P0 appears from runtime validation.

