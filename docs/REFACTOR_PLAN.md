# Refactor Plan

Date: 2026-07-09

## P0 - Completed In This Pass

- Remove demo login gateway from production auth.
- Enforce tenant and branch scope on asset ownership transfer.
- Enforce decision request lifecycle on public customer submit.
- Add guarded transactional claims for payment, refund, discount approval, and final invoice issue.
- Add payment idempotency keys and provider transaction references with database unique constraints.
- Add authentication lockout, timing hardening, stronger new password hashes, and session metadata capture.
- Add production hardening validation and link it to release candidate validation.
- Enforce English-only project files through an executable gate.

## P1 - Next Stabilization Pass

1. Finance read-model refactor
   - Replace dashboard-wide invoice reads with aggregates.
   - Add pagination to invoice, payment, refund, and credit note lists.
   - Add finance integration tests against PostgreSQL for payment/refund concurrency.

2. Session storage hardening
   - Migrate bearer token persistence from browser local storage to secure HTTP-only cookies.
   - Add CSRF protection for cookie-backed session mode.
   - Keep server-side logout and revocation as the source of truth.

3. Customer-safe output model
   - Replace free text customer-safe event messages with template IDs and approved variables.
   - Keep current sanitizer as a fallback defense.

4. Report scalability
   - Introduce materialized report snapshots per tenant, branch, role, and time bucket.
   - Move heavy report joins out of request-time controller paths.

## P2 - Product Maturity

- Add mutation contract tests for every cross-role event.
- Add snapshot tests for role-based page visibility after configuration changes.
- Add performance budgets for owner configuration pages and reports.
- Add operational runbooks for release gates, seed data, and database migrations.
