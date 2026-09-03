# MOP — Security and Tenancy Model

> **Document ID:** DOC-33
> **Purpose:** how isolation, authentication and authorization actually hold, and where the attack surfaces are.
> **Authority:** ARCHITECTURAL.
> **Scope:** tenancy, sessions, credentials, the customer boundary, secrets.
> **Last verified:** 2026-09-01 against commit `a8c8bb5`.
> **Source of truth:** `apps/api/src/identity/`, `apps/api/src/runtime/`, [`../INFRASTRUCTURE.md`](../INFRASTRUCTURE.md), [`../DATABASE_STRATEGY.md`](../DATABASE_STRATEGY.md).
> **Related:** 20 (the resolver), 11 (the customer boundary), 22 (invariants), 23 (races).

---

## 1. The isolation claim

> **Many workshops, one codebase, zero leakage.** A user in Workshop A must not be able to see, infer or affect anything in Workshop B — not through a URL, not through a report aggregate, not through a search box, not through an error message, not through a realtime channel.

Isolation is **not a feature; it is a property that must hold across every path**, including ones added later by someone in a hurry.

### How it is enforced today

| Mechanism | Where |
|---|---|
| `tenantId` on every tenant-scoped model | Schema |
| Every query filters on the **session's** tenant | Service layer |
| **No endpoint accepts a client-supplied `tenantId`** | Controllers |
| Layer 3 of the resolver denies on tenant status | `TenantStatusLayer` |
| Cross-tenant reads exist in exactly one place | `LiveViewService` |
| Two differently-shaped seed tenants | `seed.ts` |
| Isolation tests that **actively try to cross** | Integration suite |

There is **no row-level security in the database**. Isolation is a service-layer property asserted by tests — a deliberate choice, and the one place where the *constraint over convention* preference in doc 22 is not followed. It is recorded here so the trade-off is visible rather than assumed.

### The one legitimate cross-tenant read

`GET /platform/live-view` is the only endpoint in the product that aggregates across tenants, and it is **confined to counts and event-key summaries — never payload.** A platform admin can see that Workshop B had 14 status changes in the last hour; they cannot see what any of them were.

## 2. Authentication

**Opaque httpOnly session cookies**, an access/refresh pair. Nothing is decoded or trusted client-side: `AuthStore.bootstrap()` round-trips to `GET /auth/me` because **the server is the only place a session is validated.**

`Session` rows are revocable. `SessionGuard` attaches `request.session`; `PlatformGuard` runs after it.

### Passwords

`scrypt`, with **the parameters encoded in the stored hash**: `scrypt$N$r$p$salt$hash`.

Two properties follow from that format:

- **Parameters can be raised without a migration.** A login verifies against the parameters the hash was created under, then `needsRehash()` triggers a **lazy rehash** with the current ones. Edge case E18.
- **The legacy 3-part format is still readable** (`scrypt$salt$hash`), so no account was locked out by the upgrade.

`timingSafeEqual` for comparison, and `dummyVerifyForTimingSafety` on the not-found path so a missing account and a wrong password take the same time — **user enumeration through timing is closed as well as through messages.**

### Non-enumerating flows

Password reset and invite both use a `request` → `describe` → `complete` shape that does not reveal whether an address exists. **The raw token is never returned from the public API.**

### Login refusals

| Situation | Response |
|---|---|
| Wrong credentials | Generic failure |
| `Account.status` not `ACTIVE` | Refused |
| Tenant frozen / suspended / archived | `tenant_unavailable` → `/tenant-frozen` |

`/tenant-frozen` is a deliberate dead end: no navigation, and **no freeze reason surfaced.** The reason is a commercial matter between the platform and the owner, not something a technician should read off a screen.

## 3. Authorization

Eleven layers, deny-by-default, `locked` short-circuit — doc 20.

Plus three mechanisms the resolver does not cover, each of which a reader must know about:

| Mechanism | Covers | Note |
|---|---|---|
| `PlatformGuard` | Platform sessions | Deliberately bypasses the resolver — every layer defers with no `tenantId` |
| `session.accountType` | Customer sessions | ⚠️ A documented deviation, not a design |
| Resource ownership | *This* record | `requireTechnician`, `requirePartOnMyJob`. **A permission is not a claim about a specific record** |

**Scope** (`ScopeResolverService`) narrows *what rows you see* — branch, category, `managedTechnicianIds` — never *what actions you may take*. Confusing scope with permission is how a role ends up able to act on a record it should not have seen.

## 4. The customer boundary — the highest-consequence surface

Everyone else is an employee under a contract. **The customer is an outsider with a link.**

| Rule | Enforcement |
|---|---|
| Restricted data is **absent from the response** | Service shapes the payload; tests assert the shape |
| The public token scopes access to **one decision request** | `secureToken`, consumed on use |
| A **critical rejection** requires acknowledgement | Server-side, `[VERIFIED]` end to end |
| A **smuggled price field** is refused | `[VERIFIED]` end to end |
| A new owner sees technical history, **never the previous owner's financials** | `AssetOwnershipHistory` windows |
| Safe history labels by plate/VIN from the customer's **own** asset list | Never a raw asset id |
| Decision Analytics carries **no customer-identifying field** | Its own test |

### The unguarded routes, and why each is correct

| Route | Why no auth |
|---|---|
| `/decide/:token` | This is what a WhatsApp message points at. Requiring a login first would break the flow the feature exists for. The token is the credential |
| `/register` | The person has no account yet — that is the point |
| `/auth/*` | Obtaining a session |
| `/health` | Liveness |

## 5. Attack surfaces, and what stands in front of each

| Surface | Defence |
|---|---|
| Guessing another tenant's record id | Every query filters on the session's tenant |
| Client-supplied `tenantId` | No endpoint accepts one |
| Permission escalation via a role template | Capability sits **above** role and user override |
| Escalation via user override | Ceilings 1–7 sit above it; `locked` short-circuits |
| Delegated permission granted by a role template | Delegation layer denies until the owner's switch is on |
| Decision-token brute force | Opaque token, consumed on use, rate limiting |
| User enumeration | Non-enumerating flows **and** timing-safe verification |
| Credential stuffing | `ThrottlerGuard` globally |
| Price tampering on a decision response | Refused, `[VERIFIED]` |
| Reading cost without permission | `inventory.cost.view` shapes the response |
| Cross-tenant leak via reports | Every aggregate is tenant-filtered; Live View is counts only |
| Cross-tenant leak via error messages | Uniform `{ code, message }` shape |
| Session fixation | Opaque server-side sessions, revocable |
| Stale password hashing | Versioned parameters + lazy rehash |

## 6. Secrets and runtime

**Boot-time config validation** — the process refuses to start with a missing or malformed variable rather than failing on the first request that needs it.

`.env.example` and `.env.test` are templates; a real `.env` is never committed. `DATABASE_URL` is the only external dependency in the running system, which is itself a security property: every integration added is a new credential to hold and a new trust boundary to defend.

`ThrottlerGuard` is registered globally via `APP_GUARD`.

## 7. What is not built

Stated plainly, because a security document that implies more than exists is worse than none.

| Missing | Consequence |
|---|---|
| **`CUSTOMER` sessions inside the resolver** | Portal authorization is `accountType` checks in controllers. It holds today because the portal services shape their own responses — **by care, not by mechanism.** G-SEC-02 |
| **Row-level security** | Isolation is service-layer only |
| **Audit retention / archival** | `AuditLog` and `OperationEvent` grow without bound |
| **MFA** | Not implemented |
| **Session device / IP binding** | Not implemented |
| **Field-level encryption at rest** | Not implemented; database-level encryption is a deployment concern |
| **A security-event log** | Login attempts and revocations are not separately recorded — `AuditLog` is business change, not security telemetry |
| **Penetration test** | Never run |
| **Realtime channel isolation** | Not yet a risk — polling reuses the same guarded endpoints. **It becomes one the day push lands** |

## 8. Implementation status

| Element | Status |
|---|---|
| Tenant-scoped schema and queries | ✅ `[VERIFIED]` |
| No client-supplied tenant id | ✅ |
| Isolation tests that actively try to cross | ✅ |
| Two differently-shaped seed tenants | ✅ |
| Live View limited to counts and event kinds | ✅ |
| Opaque httpOnly sessions, revocable, server-validated | ✅ |
| scrypt with encoded parameters, lazy rehash, timing-safe | ✅ `[VERIFIED]` |
| Non-enumerating reset and invite; raw token never returned | ✅ `[VERIFIED]` |
| Frozen-tenant dead end with no reason surfaced | ✅ |
| Eleven-layer resolver, deny-by-default | ✅ `[VERIFIED]` |
| Resource-ownership checks distinct from permissions | ✅ |
| Customer boundary rules, each test-asserted | ✅ `[VERIFIED]` |
| Global rate limiting | ✅ |
| Boot-time config validation | ✅ |
| **Customer authorization in the resolver** | 🔴 G-SEC-02 |
| **Retention policy** | 🔴 |
| **MFA, device binding, security-event log, pen test** | 🔴 |
