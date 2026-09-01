# 11 — Security / Tenant Isolation / Authorization

Separates **weaknesses** from ordinary incompleteness. Nothing fixed.

## 1. Authentication — solid baseline with two real weaknesses

**Strengths (verified):** scrypt N=131072 versioned hashes + lazy rehash on login (`password.util.ts`); opaque bearer-in-cookie tokens stored only as sha256, `timingSafeEqual` comparisons; every request re-resolves session from DB (revocation/expiry live; DB-clock authoritative P-65); timing-equalized failed login; per-account lockout 5/15min + global throttler with auth-specific limits (429 proven over HTTP); invite tokens one-time sha256 14d; password reset non-enumerating w/ token consumption; cookies httpOnly+sameSite=lax, refresh cookie path-scoped to `/api/v1/auth/refresh`; production CORS https-only enforced at boot (exit 78 otherwise).

**Weaknesses:**
1. **Access-token server-side TTL gap:** the 20-minute access TTL is browser-cookie-only; `findSessionRow` checks no access-secret expiry — a stolen `mop_access` value works until rotation/revocation/14-day absolute expiry. (`auth.service.ts:185–208`)
2. **Refresh rotation slides expiry indefinitely** — no absolute lifetime cap, no reuse detection (replay simply fails post-rotation).
3. Lockout writes use `Date.now()` while reads use DB clock (inconsistency, minor).
4. Tokens in URLs: invite link returned in creation response; decision links carry credential in path (mitigated: throttled, single-request scope, POST describe keeps it out of history).
5. No CSRF tokens (acceptable given lax+JSON, stated for completeness).

## 2. Authorization

11-layer deny-by-default resolver, locked short-circuit above roles/overrides — behaviorally tested including evaluation-order pins. Permission keys lint-pinned to a closed manifest (80 keys). Manual in-body checks are consistent (~28 sites) but depend on developer discipline; no decorator safety net.

## 3. Findings that cross authorization lines

1. **Team-Leader review bypass path:** `POST /branch-manager/work-orders/:id/advance` skips `workorders.branch.view`, deriving permission purely from job state; TEAM_LEADER defaults include `workorders.review.decide`; Team Leaders' branchScope is typically empty = tenant-wide ⇒ any TL can pass/fail review on **any tenant job**. (`branch-manager.controller.ts:367–400`, `default-role-permissions.ts:156`) — *authorization weakness*, not mere incompleteness.
2. `POST /organization/messages/preview` runs **no permission check** while siblings check `organization.messages.manage` (low stakes, sample data).
3. Technician startTask guarded by read-ish key vs completeTask's dedicated write key (asymmetric).
4. Empty-scope-means-everything convention is one bug away from over-exposure everywhere scoping exists; the unused `filterBy()` embodies the safer semantics.

## 4. Tenant isolation & branch scope

Manual `where:{tenantId}` across ~74 files; IDs always session-sourced (route-param tenantId only under PlatformGuard); cross-tenant reads confined to platform surfaces (live-view counts/events, platform reports); customer sessions scope by customerId in WHERE. **No defense-in-depth** (no Prisma middleware/RLS), and ~15 child tables carry FK-less `tenantId`. Mid-session freeze revokes all sessions and TenantStatusLayer downgrades to `.view`-only; archive/reactivate do **not** revoke sessions (relies on layer) — asymmetry worth noting.

## 5. Data-leakage posture (privacy by response shape)

Verified repeatedly: cost absent without `inventory.cost.view` (dossier, inventory analytics, exports); people analytics carries no currency; decisions analytics selects carry zero customer identifiers (comment matches select; test-enforced); customer portal never sees cost/margin/staff-identity/internal notes; safe-history scoped to ownership periods; supervision notes invisible to subjects (P-38 invariant honored structurally). Restricted data is *absent*, not hidden — matching the repo rule.

## 6. Customer privacy

Registration code-gated (no floating accounts); decision tokens single-purpose 404-uniform (no enumeration); E19 stale-ownership answers flagged HIGH for human review rather than blocked. GDPR deletion/anonymisation (P-47): designed, not built.

## Severity summary

| # | Finding | Class |
|---|---|---|
| S1 | Access-secret TTL unenforced server-side | Security weakness |
| S2 | Refresh slides forever, no reuse detection | Security weakness |
| S3 | TL advance cross-scope review authority | Authorization weakness |
| S4 | messages/preview unguarded | Minor |
| S5 | No middleware/RLS depth; FK-less tenantId columns | Hardening debt |
| S6 | Password reset has no delivery channel | Incompleteness |
| S7 | Archive doesn't revoke sessions | Design inconsistency |
