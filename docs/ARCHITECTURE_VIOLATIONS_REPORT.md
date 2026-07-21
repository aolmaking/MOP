# Architecture Violations Report

Date: 2026-07-09

## Result

Status: PASS WITH MINOR FOLLOW-UP

The critical architecture violations found during the production audit were corrected or converted into executable gates.

## Corrected Violations

1. Demo account gateway exposed account inventory through an auth endpoint.
   - Resolution: endpoint, service method, frontend state, API client method, and shared DTO were removed.
   - Gate: `tools/validate-auth-foundation.mjs` and `tools/validate-production-hardening.mjs`.

2. Asset transfer accepted unscoped owner IDs.
   - Resolution: source asset is scoped by tenant and branch, new owner is resolved through `customerWhere(session)`, cross-branch transfer requires elevated scope, and the update is transactional.
   - Gate: `tools/validate-production-hardening.mjs`.

3. Customer decision submit path did not match the public read-path lifecycle rules.
   - Resolution: submit now rejects draft and cancelled links, only accepts sent or viewed links, and claims the response with a guarded transactional update.
   - Gate: `tools/validate-production-hardening.mjs`.

4. Finance workflows had non-atomic payment, refund, discount, and final invoice edges.
   - Resolution: payments and refunds use conditional transactional updates, payment idempotency is stored and guarded, discount approval has an explicit endpoint, and final invoice issue claims the running invoice before creating a locked invoice.
   - Gate: `tools/validate-production-hardening.mjs`.

5. Authentication had missing lockout and timing-equivalent failure behavior.
   - Resolution: failed login attempts and lock windows are persisted, missing or inactive account paths perform dummy password verification, new hashes use `scrypt2`, and sessions capture user-agent/IP metadata.
   - Gate: `tools/validate-production-hardening.mjs`.

6. Customer-safe projection depended on naming and a narrow denylist only.
   - Resolution: safe text now applies normalization, length limits, ASCII allowlist, and sensitive-term fallback.
   - Gate: `tools/validate-production-hardening.mjs`.

## Accepted Minor Deviations

- Dashboard calculations still use broad reads in some paths. This is acceptable for the current release candidate but should become aggregate-driven before large tenant scale.
- The frontend still uses bearer token storage in browser storage. Server-side logout, session revocation, login lockout, and session metadata exist, but a future cookie-based session migration would reduce XSS blast radius.

## Architecture Gate Verdict

The architecture is no longer blocked by the audited P0 findings. Remaining items are P1 hardening and scale work, not release-blocking structural failures.
