# Version 2 — Customer Communication & Decision Flow

## Product Decision

V2 is not a generic customer portal expansion. It implements one focused flow:

```text
WhatsApp gets customer attention.
MOP captures the official structured decision.
Decision history becomes documented technical context.
```

The system must not parse WhatsApp replies automatically. WhatsApp messages
only contain a secure link to a MOP decision page.

## Implemented Foundation

- Technician or Branch Manager creates a Customer Decision Request.
- Each decision item has a customer-facing title, explanation, importance,
  estimated price, and optional critical warning.
- Critical items require warning text before the request can be created.
- The API generates a secure decision token, public decision link, and WhatsApp
  message preview.
- Staff can send the request, which marks the Work Order as waiting for a
  customer decision.
- The customer opens `/decision/:token` without seeing admin navigation.
- The customer approves or rejects every item individually.
- Critical rejection requires warning acknowledgement.
- The response is timestamped, audited, linked to Work Order, Asset, Customer,
  and customer-visible timeline history.
- Staff queue shows pending/responded/critical decision state.

## Not In V2

- No automatic WhatsApp reply parsing.
- No NLP.
- No full payment engine.
- No full customer dashboard expansion.
- No inventory/supplier/internal cost exposure to customers.
- No old owner personal or financial data in customer-facing views.

## Core Files

- `packages/database/prisma/schema.prisma`
- `apps/api/src/modules/customer-decisions`
- `apps/web/src/app/features/customer-decisions`
- `apps/web/src/app/features/customer-decision-public`
- `packages/shared/src/contracts.ts`
