# Test Plan And Results

Date: 2026-07-10

## Commands Run

| Check | Result | Notes |
| --- | --- | --- |
| API typecheck | PASS | `tsc -p apps/api/tsconfig.json --noEmit` through local TypeScript CLI. |
| Web typecheck | PASS | `tsc -p apps/web/tsconfig.app.json --noEmit` through local TypeScript CLI. |
| API build-equivalent compile | PASS | `tsc -p apps/api/tsconfig.json` completed successfully. |
| Angular compiler template check | PASS | Angular compiler checked application templates through local compiler CLI. |
| English-only gate | PASS | No Arabic Unicode found in first-party project paths or files. |
| Auth foundation gate | PASS | 83 checks passed. |
| Production hardening gate | PASS | Includes auth lockout, payment idempotency, tenant isolation, customer decision, inventory, and finance checks. |
| Release candidate gate | PASS | 124 checks passed, including role-based demo logins and old credential exclusion. |
| Route catalog coverage audit | PASS | 59/59 route catalog page IDs have Angular routes. |
| Frontend API coverage audit | PASS | 121/121 frontend API calls matched backend controller routes. |
| Web production build | ENVIRONMENT BLOCKED | Angular CLI build could not complete because local pnpm node_modules materialization is incomplete. Heavy reinstall was stopped under the current time/network constraint. |

## High-Risk Scenarios Covered By Code And Gates

- Production login does not expose or use demo account gateway data.
- Asset transfer cannot cross tenant boundaries through unvalidated owner IDs.
- Branch-scoped staff cannot transfer out-of-scope assets.
- Customer decision links cannot be submitted when draft, cancelled, expired, already responded, or concurrently claimed.
- Payments cannot be recorded if invoice balance is lower than the payment amount at update time.
- Retried payments with the same idempotency key do not create a second payment or mutate invoice totals twice.
- Refunds cannot be approved if invoice paid amount is lower than the refund amount at update time.
- Discount requests have an explicit approval and rejection path.
- Final invoice issue claims the running invoice before creating a locked invoice.
- Login attempts are locked after repeated failures, and missing-account failures perform dummy password verification.
- Technician finish gate remains server-side, not UI-only.
- Inventory issue and direct usage paths remain guarded by stock balance conditional updates.

## Remaining Test Work

- Add database-backed integration tests for payment/refund race conditions.
- Add e2e tests for the customer decision link lifecycle.
- Add e2e tests for asset ownership transfer with branch-scoped and elevated users.
- Rerun Angular production build after pnpm install completes on the workstation.
