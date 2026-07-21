# Bug Risk Register

Date: 2026-07-09

| ID | Severity | Area | Risk | Status | Mitigation |
| --- | --- | --- | --- | --- | --- |
| BR-001 | Critical | Auth | Demo gateway could expose production account metadata. | Fixed | Removed endpoint, service method, frontend state, shared DTO, and account-id login fallback. |
| BR-002 | Critical | Customer data | Asset ownership transfer could accept a customer from another tenant or branch. | Fixed | Scoped source asset and new owner, added cross-branch guard, wrapped transfer in a transaction. |
| BR-003 | High | Customer decisions | Public submit path could respond to inactive decision requests. | Fixed | Added inactive status guards and transactional response claim. |
| BR-004 | High | Finance | Concurrent payments could overpay an invoice. | Fixed | Added transactional `balance >= amount` claim before payment creation. |
| BR-005 | High | Finance | Concurrent approved refunds could over-refund an invoice. | Fixed | Added transactional `paid >= amount` claim before credit note and refund status update. |
| BR-006 | High | Finance | Discount approval requests could remain permanently pending. | Fixed | Added approve/reject endpoint with guarded pending status claim. |
| BR-007 | High | Finance | Final invoice issue could race into duplicate locked invoices. | Fixed | Added running invoice `FINALIZING` claim before invoice creation. |
| BR-008 | Critical | Finance | Retried payment submission could create duplicate confirmed payments. | Fixed | Added idempotency keys, provider transaction references, database unique constraints, and replay handling. |
| BR-009 | High | Auth | Login had no persisted lockout and a measurable missing-account timing gap. | Fixed | Added failed-attempt lockout, dummy password verification, stronger new hashes, and session metadata. |
| BR-010 | Medium | Customer output | Customer-safe text depended on a narrow denylist. | Fixed | Added text normalization, length cap, ASCII allowlist, and fallback behavior. |
| BR-011 | Medium | Inventory | Stock issue race could produce incorrect availability if guards regressed. | Guarded | Current code uses conditional balance updates and the production hardening gate checks for them. |
| BR-012 | Medium | Technician | Finish gate could regress into UI-only behavior. | Guarded | Current code applies server-side finish gate and the production hardening gate checks for it. |
| BR-013 | Medium | Build environment | Angular production build depends on completing local pnpm node_modules materialization. | Open | Typecheck passes; rerun build after pnpm install finishes on the workstation. |
| BR-014 | Medium | Scale | Some dashboards still use broad reads. | Open | Move to aggregate queries and read models before high-volume tenant rollout. |
