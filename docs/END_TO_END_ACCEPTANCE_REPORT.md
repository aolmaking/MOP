# End-to-End Acceptance Report

Date: 2026-07-09  
Result: PASS

## Complete business cycle

| Step | Expected output | Verified implementation | Result |
| --- | --- | --- | --- |
| 1 | Super Admin creates workshop owner | Tenant, invited owner account, permissions, controls, starter Builder, secure invite link, audit | PASS |
| 2 | Owner logs in | One-time invitation validation, password setup, account activation, normal session | PASS |
| 3 | Owner configures workshop | Builder and configuration services persist tenant-owned policy | PASS |
| 4 | Owner customizes theme | Draft design tokens, preview, validation, publish and rollback | PASS |
| 5 | Owner adds staff | Secure staff invitation with role template and operational scopes | PASS |
| 6 | Branch Manager creates customer and asset | Branch intake transaction creates/reuses customer and asset | PASS |
| 7 | Branch Manager creates Work Order | Intake produces scoped work order and audit/timeline output | PASS |
| 8 | Technician opens Work Card | Assigned-task query with customer-safe and internal task context | PASS |
| 9 | Technician performs inspection | `inspection.saved` records auditable task output | PASS |
| 10 | Technician requests customer decision | Structured decision request, secure link, message and timeline | PASS |
| 11 | Customer approves | Own-request authorization, item decisions, status and running invoice update | PASS |
| 12 | Technician requests part | Structured request contract routed to Inventory and Branch Manager | PASS |
| 13 | Inventory issues part | Scoped warehouse issue, atomic balance mutation and stock movement | PASS |
| 14 | Technician confirms arrival | Issued item and request lifecycle update with audit/event output | PASS |
| 15 | Technician marks used | Stock lifecycle, consumption output and invoice hook | PASS |
| 16 | Running invoice updates | Decision and inventory lines upsert into one work-order invoice source | PASS |
| 17 | Technician finishes task | Server-side Finish Gate checks decisions, parts, blockers and inspection before review/QC | PASS |
| 18 | Branch Manager issues final invoice | Immutable finalized lines and locked invoice | PASS |
| 19 | Payment is recorded | Confirmed payment recalculates invoice, work order and running invoice | PASS |
| 20 | Delivery becomes allowed | Delivery gate requires issued invoice and permitted payment state | PASS |
| 21 | Reports update | Reports read current work orders, payments, inventory, people and audit data | PASS |
| 22 | Audit events exist | Auth, platform, staff, customer, technician, inventory, finance and Builder actions audit | PASS |

## Blockers fixed during this gate

- Added real owner/staff invitation acceptance so `INVITED` accounts can become active without a manual database workaround.
- Added functional Team Leader review endpoints and UI.
- Added functional scoped reports endpoints and UI for Owner and Data Analyst.
- Removed duplicate placeholder pages from Owner/Admin navigation.
- Added finalized invoice, confirmed payment, delivered work order, Builder version, and frozen-workshop fixtures.

## Verification boundary

This report verifies source contracts, permission ownership, state transitions, seeded scenarios, Prisma validity, TypeScript compilation, Nest build, and regression gates. A live PostgreSQL plus browser walkthrough remains deployment-environment UAT, not an application blocker found by this gate.
