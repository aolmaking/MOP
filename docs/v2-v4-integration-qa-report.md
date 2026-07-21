# V2 to V4 Integration QA Report

## Scope

This QA pass checks that the V2 Customer Decision Flow, V3 Technician Work Card, and V4 Inventory Manager lifecycle are connected as one operational cycle.

## Result

Status: Passed static integration QA with targeted fixes.

Runtime browser/API execution was not run because the workspace currently has no `node_modules` or generated Prisma client. The checks below were validated through source assertions, Prisma schema validation, route/permission validation, and UI button wiring scans.

## Fixed During QA

- Demo data now matches the integration scenario: Apex Motors, Nasr City Branch, Maadi Branch, Nasr Quick Stock, Nasr Main Warehouse, Central Warehouse, Omar Ali, Ahmed Hassan, Mona Said, Khaled, Youssef, Salma, WO-1021, Toyota Corolla ABC-123, Yamaha Motorcycle MTR-778, CAT Excavator EQ-9001.
- Branch warehouse access now supports Nasr primary, Nasr backup, Nasr/Central shared, and Maadi/Central shared.
- Inventory seed now includes Front Brake Pads, Oil Filter, Car Battery, Motorcycle Chain, and Hydraulic Hose with warehouse-level balances.
- Inventory issue flow now supports selecting a fulfillment warehouse and validates quantity from `WarehouseStockBalance`.
- Technician Work Card parts search now respects `workOrderUsable`, not POS visibility.
- Technician out-of-stock UI now shows `Out of Stock`, danger styling, pulse indicator, and `Request Anyway`.
- Customer Portal decision history now includes `Expand Decisions` with safe decision details only.
- Finish gate now returns clear blocking reasons for pending customer decision, pending part request, unresolved received part, and return pending inventory review.
- Audit action names now include `part.issued`, `part.arrived_confirmed`, `part.used`, `part.return_requested`, `part.return_accepted`, and customer decision response.
- Computer Codes UI now clearly labels `Video guide placeholder` and `Create Fault from Code`.
- Inventory Reports Lite now includes Consumption Rate and response-time placeholder.
- Access Denied labels and reasons now cover Inventory Manager routes and Technician Work Card routes.

## Static QA Coverage

Passed:

- Technician navigation: exactly Home, My Work, Work Card.
- Inventory Manager navigation: exactly six V4 inventory pages.
- Customer navigation: customer portal only.
- Unauthorized route blocking with clear reason.
- Customer decision secure link flow.
- Public decision page safe payload.
- Critical rejection acknowledgement.
- Work Card drawer action model.
- Computer Codes placeholder model.
- Quick Service guard text.
- Request/issue/in-transit/arrived/received lifecycle.
- Return unused lifecycle.
- Unavailable safe customer message.
- Multi-warehouse schema foundation.
- Work Order Usable compatibility filtering.
- Quantity status separation.
- Reports Lite sections.
- Customer safe Expand Decisions history.
- Finish gate blocking reasons.
- Audit event naming.
- Out-of-stock visual state.
- Full demo cycle data.

## Commands Run

```text
node tools\validate-structure.mjs
npx -y prisma@5.22.0 validate --schema packages\database\prisma\schema.prisma
Global web button wiring scan
Cross-version Integration QA static assertion script
TypeScript syntax/local-name check on changed files
```

## Remaining Runtime Step

After dependencies are installed, run full runtime validation:

```text
pnpm install
pnpm --filter @mop/database prisma generate
pnpm -r typecheck
pnpm -r build
pnpm --filter @mop/database prisma db seed
pnpm dev
```

Then manually execute the browser path for the full repair cycle from WO-1021.
