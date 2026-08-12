# Phase 11 — Customer Portal

> **Goal:** the authenticated Customer Portal's read surfaces, on top of the public decision link that Phase 4/6 already shipped.
> **Companions:** `packages/shared/src/permissions/permission-manifest.ts` (`CUSTOMER_PORTAL` module keys, already declared), `apps/api/src/customer/decision.service.ts` (the existing public decision flow).

---

## 1. What already existed before this phase

The public decision link (`GET/POST /public/decisions/:token`) and its service (`CustomerDecisionService`) were built in an earlier phase and cover two of `PHASE_MAP.md`'s seven named surfaces already: **the decision page** and **public decision links**. This phase does not touch that code beyond reading it as the reference for "what a customer-safe response shape looks like" — token-scoped, no session, restricted fields absent rather than hidden.

## 2. What this phase ships

`CustomerPortalController`/`CustomerPortalService` (`apps/api/src/customer/customer-portal.*`) — the remaining five surfaces, all **authenticated** (unlike the decision link):

- **Portal Home** — asset count, current-service count, pending decisions, open invoice balance (via `@mop/shared`'s `sum()`, never a raw JS-number reduction), recent activity from `CustomerTimelineEvent`.
- **My Assets** — every asset with an open `AssetOwnershipHistory` row (`endedAt: null`) for this customer.
- **Current Service** — every work order belonging to this customer whose status is not a terminal one (`CLOSED`/`CANCELLED`).
- **Invoice Status** — every invoice on this customer's work orders; `total`/`paid`/`balance` are strings, matching the platform-wide money rule.
- **Safe Technical History** — `SafeTechnicalHistory` filtered by `ownerCustomerId`, not by asset alone. This is the one property proven by an integration test: a customer who bought a used vehicle must never see the previous owner's entries, because the model is scoped per ownership period from the start (built, per its own schema comment, "with a real read path from day one this time").

## 3. A permission-engine gap found while building this

`RolePermissionTemplateLayer`, and in fact every layer in `PermissionResolverService`, evaluates against `session.staffUserId`. A customer session never has one (`AuthService.resolveContextForAccount`'s `CUSTOMER` branch sets `staffUserId` to `undefined`), so every layer would defer and the resolver's deny-by-default would silently reject **every** `customer.*` permission key — despite those keys already existing in the manifest since an earlier phase. The effective-permission engine was built for tenant staff and was never exercised against a real customer session before now.

Rather than bend the ten-layer staff-oriented resolver to also understand customer sessions — a change with a much larger blast radius than this phase's actual scope — `CustomerPortalController` checks the two facts that actually govern portal access directly: `session.accountType === "CUSTOMER"` (with `session.customerId` present) and `session.enabledModules.includes("CUSTOMER_PORTAL")`. This mirrors the existing `CustomerDecisionController`, which already routes around the staff permission system for the same underlying reason — a customer identity was never in scope of what that engine resolves.

**Owed, named rather than fixed here:** either extend `PermissionResolverService`'s layers to have a real opinion about `CUSTOMER` sessions, or formally document that customer-portal authorization is and will remain a parallel, simpler check outside that engine. Left open for whichever future phase next touches the permission engine's shape.

## 4. Exit criteria

1. All five authenticated portal surfaces return real data, scoped to `session.customerId`, never a route parameter.
2. Safe Technical History proven, by test, to hide a previous owner's entries from the current owner.
3. Invoice figures are strings end-to-end, using `@mop/shared/money`'s `sum()` rather than a JS-number accumulation.
4. The permission-engine gap in section 3 is written down, not silently patched over with a narrower fix that would look like a real solution.

**Not in scope:** the four Customer Portal web pages (deferred alongside the rest of this arc's web work, same reasoning as Phase 10's API-first pass); a `CUSTOMER`-aware rework of the permission resolver.
