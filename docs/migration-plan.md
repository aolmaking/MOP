# V3 to V4 Migration Plan

## Current State

V3 is a static SPA with local JavaScript data and simulated guards. V4 creates
the production shape: Angular frontend, NestJS API, Prisma database, and
backend-owned session/access decisions.

## Migration Order

1. Identity Gateway
   - Move account listing, login, session context, and route navigation to API.
   - Remove all local role switching from the frontend.

2. Users & Access
   - Store staff users, role pages, role permissions, and scopes in PostgreSQL.
   - Add create/update/suspend flows through API commands.

3. Customers & Asset Ownership
   - Persist customers, assets, ownership history, portal status, and safe
     technical history.
   - Enforce customer record-level ownership in backend queries.

4. Work Orders & Tasks
   - Move work order state machine and task/subtask execution to backend.
   - Add task assignment guards for technicians and team leaders.

5. Inventory & Parts POS
   - Move item catalog, warehouse stock, part requests, and stock ledger to DB.
   - Keep the technician POS task-scoped; lifecycle state carries issued/used.

6. Billing & Delivery Lock
   - Persist invoices, invoice lines, payments, locked final invoices, refunds,
     and delivery gate state.

7. Reports & Analytics
   - Build read models and report snapshots from operational tables.
   - Add export jobs for large tenants.

8. Production Hardening
   - Replace demo login with password/OTP/SSO.
   - Add background workers, rate limiting, structured logs, backups, and
     tenant-aware observability.
