# Regression Checklist

Date: 2026-07-09

## Authentication

- [x] No `/auth/gateway-accounts` endpoint exists.
- [x] Login requires identifier and password.
- [x] Login records failed attempts and lockout state.
- [x] Missing-account login performs dummy password verification.
- [x] New password hashes use the stronger `scrypt2` format.
- [x] Sessions capture user-agent and IP metadata.
- [x] Account-id login fallback is removed.
- [x] Frontend identity gateway does not list seeded accounts.
- [x] Logout calls the backend revocation endpoint.

## Customer Data Isolation

- [x] Asset transfer source asset is tenant scoped.
- [x] Asset transfer source asset is branch scoped for non-elevated users.
- [x] New asset owner must be in the caller customer scope.
- [x] Cross-branch transfer requires elevated scope.
- [x] Transfer history and audit are written inside the same transaction.

## Customer Decisions

- [x] Public read rejects draft and cancelled decision links.
- [x] Public submit rejects draft and cancelled decision links.
- [x] Public submit only accepts sent or viewed requests.
- [x] Public submit claims the response transactionally.
- [x] Critical warning acknowledgement remains enforced.

## Technician And Inventory

- [x] Technician finish gate is server-side.
- [x] Pending parts block finish.
- [x] Pending customer decisions block finish.
- [x] Open blockers block finish.
- [x] Required inspection blocks finish until done.
- [x] Inventory issue uses conditional stock balance update.
- [x] Direct technician used-part flow updates stock balance and inventory item stock.

## Finance

- [x] Payment recording checks invoice balance inside the transaction.
- [x] Payment recording supports idempotency keys and provider transaction IDs.
- [x] Payment idempotency has database unique constraints.
- [x] Refund approval checks paid amount inside the transaction.
- [x] Approved refund synchronizes invoice, work order, and running invoice totals.
- [x] Discount approval and rejection endpoint exists.
- [x] Final invoice issue claims running invoice before locked invoice creation.
- [x] Finance mutations emit operation events.

## Release Gates

- [x] English-only validator passes.
- [x] Auth foundation validator passes.
- [x] Production hardening validator passes.
- [x] Release candidate validator passes.
- [x] API typecheck passes.
- [x] Web typecheck passes.
- [x] API build passes.
- [ ] Web build rerun after local pnpm node_modules materialization completes.
