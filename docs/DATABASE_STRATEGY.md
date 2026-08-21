# Database Strategy — Measures and Precautions

> **Scope:** Postgres + Prisma. What rules the data layer must hold, why, and how each is enforced rather than merely intended.
> **Status of each item:** `DONE` = in the code today · `PARTIAL` = exists but incomplete · `TODO` = decided, not yet built.
> **Date:** 2026-08-08.

---

## 1. Tenant isolation — depth, not diligence

Isolation cannot depend on every future developer remembering to write `tenantId` in a where-clause. It has to be structural.

**Layer 1 — schema (`DONE`).** Every tenant-owned table carries `tenantId` with a real FK and `onDelete: Cascade`. Child/line tables (`InvoiceLine`, `QuotationItem`, `TeamMembership`) inherit scope from their parent, which is correct and normal — but it means **the parent lookup must always be tenant-scoped**, because the child never re-checks.

**Layer 2 — a scoped data access layer (`TODO`, Phase 0/2).** The single most valuable structural investment available. Domain services should not receive a raw `PrismaService`; they should receive a tenant-bound client where the tenant filter is applied centrally and cannot be omitted. Prisma client extensions (`$extends`) can enforce this at query level. The design goal: *writing an unscoped query on a tenant-owned model should be difficult to express, not merely discouraged.*

**Layer 3 — Postgres Row-Level Security (`TODO`, evaluate in Phase 2).** A second wall beneath the application. Set a per-transaction session variable with the tenant id and let Postgres refuse cross-tenant rows regardless of what the application asks for. This is real work and real operational complexity, so it is a deliberate decision rather than a default — but for a product whose core promise is isolation, application-layer-only enforcement is a single point of failure.

**Layer 4 — an adversarial test (`TODO`, Phase 0).** A test suite that seeds two tenants and then actively *tries* to breach: fetch B's work order by id as an A user, filter reports across tenants, resolve a decision token from the other tenant, search by another tenant's plate number, hit every list endpoint and assert zero foreign rows. Isolation must be a thing we prove on every CI run, not a thing we believe.

**Known specific risk.** Reports and platform-wide aggregates are the easiest place to leak, because they legitimately query across rows. Any aggregate that is not `GROUP BY tenantId` gets extra scrutiny.

## 2. Money

**Never a float. Never a JavaScript `number`.** Stored as `Decimal(12, 2)` (`DONE`). `12,2` allows up to 9,999,999,999.99 — comfortable for a workshop invoice in EGP or AED, and worth revisiting only if a tenant needs a currency with more minor units.

**Serialize as a string at the API boundary (`PARTIAL`).** Prisma returns a `Decimal` object; `JSON.stringify` on it produces something unhelpful, and converting to `number` silently destroys precision at scale. Today `workshops.service.ts` correctly calls `.toString()` — but ad hoc, at three call sites. This must become systematic: a single serialization rule applied at the DTO/interceptor layer, so a future endpoint cannot forget. **A money value that reaches the browser as a JS number is a bug, regardless of whether it looks right.**

**One currency per tenant (`DONE`).** `Tenant.currency` (ISO 4217). Consequence, and it is a hard rule: **money is never summed across tenants.** Platform-level revenue reporting either reports per-currency or converts explicitly with a stored rate and a stated as-of date — never by pretending the numbers are comparable.

**Rounding is a policy, declared once (`TODO`).** Half-up at two decimals, applied at line level then summed — not summed then rounded, which produces totals that don't match the visible lines. Customers *do* check the arithmetic on invoices, and a one-piastre discrepancy destroys trust disproportionately.

**Tax is configuration, not a constant (`PARTIAL`).** `FinanceConfiguration` exists. VAT rates change by jurisdiction and over time, so the rate applied to an invoice must be **snapshotted onto that invoice**, never looked up live when re-rendering an old one.

## 3. Immutability and the lock moment

The lifecycle of a price: *catalogue price* (fluid) → *quoted price* (fluid) → **approved price (frozen)** → *running invoice line* (live) → **issued invoice line (permanent)**.

Rules, all of which exist in the schema and must never be weakened:

- Catalogue price changes affect **future quotes only**. `PriceCatalogEntry` is time-ranged (`effectiveFrom`/`effectiveTo`) rather than mutated in place, which makes "what did this cost in March" answerable.
- `QuotationItem.approvedPrice` + `priceLocked` capture the customer's agreement at the moment they gave it.
- `InvoiceLine.lockedUnitPrice` / `lockedLaborPrice` are snapshots, not references. An invoice must render identically in five years even if every catalogue row has changed.
- After issue, the only correction path is `CreditNote` / `RefundRequest`. There is deliberately **no update path** for an issued invoice.

**Precaution — enforce in the database, not only in services (`TODO`).** Service-layer guards are correct today, but a future migration script, admin fix, or careless service can bypass them. A trigger that rejects `UPDATE` on `invoices` / `invoice_lines` where `locked = true` makes the rule true at the storage layer. This is the kind of thing worth the ugliness.

## 4. Concurrency — the races that will actually happen

This is a multi-user system where several people touch the same Work Order simultaneously. These are not theoretical.

| Race | Consequence | Measure |
|---|---|---|
| Two staff issue a final invoice at once | Duplicate invoice, duplicate revenue | Unique constraint on `Invoice.workOrderId` (`DONE`) + atomic conditional insert |
| The same payment recorded twice (double-click, retry, flaky network) | Customer over-credited | `Payment.idempotencyKey @unique` (`DONE`) — the client generates it, the DB is the arbiter |
| Two technicians consume the last unit of stock | Negative stock | `SELECT … FOR UPDATE` on the balance row inside the transaction (`TODO`) + `CHECK (availableQty >= 0)` (`TODO`) |
| A customer responds to a decision twice | Conflicting approval record | Atomic status claim: `UPDATE … WHERE status = 'PENDING'` and treat zero rows as "already answered" (pattern proven in v11.9, must be re-implemented) |
| Invoice number allocation under load | Duplicate or skipped numbers | `InvoiceSequence` row locked in-transaction (`DONE` as a model; locking `TODO`) |
| Two admins apply conflicting platform controls | Last-writer-wins, silently | Controls are append-only `ControlSetting` rows with `active` flags (`DONE`) — history preserved, so "who turned this off" is answerable |

**General principle:** optimistic UI is fine; optimistic *writes* are not. Anything touching money or stock uses a conditional update whose row-count is checked, and treats "0 rows affected" as a real, user-visible outcome rather than success.

**Invariants belong in the database (`TODO`).** `availableQty >= 0`, `reservedQty >= 0`, `paid <= total`, `balance = total - paid`. Service code should enforce them for good error messages; the database should enforce them so they are *true*.

## 5. History, deletion, and time

**Operational records are never hard-deleted.** A workshop's service history is the asset it is paying for.

- Ownership is time-ranged: `AssetOwnershipHistory` with `endedAt = null` meaning current (`DONE`). This is what makes "the new owner sees technical history but not the previous owner's financials" expressible rather than a filtering hack.
- Team membership is time-ranged the same way (`DONE`), so "who supervised this job in March" survives a reorganisation.
- Custom fields are **archived, never deleted** — historical values must remain readable even after a field is retired.
- Prices are time-ranged rather than overwritten.

**The consequence to accept:** this database only grows. That is the correct trade for this product, and §8 is how it stays fast anyway.

**PII deletion is a separate, explicit path (`TODO`).** "Never delete" and a customer's right to erasure will eventually collide. The answer is anonymisation, not deletion: scrub name/phone/email on the `Customer` row, keep the operational and financial records intact and linked. Designing this later is much harder than reserving the seam now.

## 6. Two different logs, deliberately not merged

`AuditLog` and `OperationEvent` look similar and are not.

- **`AuditLog`** — the accountable record. Who did what, before/after, why, risk level. Read by Owners and Super Admins, potentially in a dispute. Long retention. Writes are **lint-enforced** to the audit module only.
- **`OperationEvent`** — the engineering record. Every domain event with its payload, for replay, debugging, and rebuilding projections. High volume, shorter retention, never shown to a user.

Keeping them separate means audit stays small, legible, and legally meaningful, while the event log stays free to be verbose.

## 7. Migrations

- **Forward-only.** No down-migrations in production; a mistake is fixed by a new migration.
- **Expand → migrate → contract** for anything breaking. Add the new nullable column, backfill, switch reads, then drop the old — never in one step, so a deploy can be rolled back without data loss.
- **Every migration is run against a seeded, realistic database before merge**, not just an empty one. Empty databases accept migrations that destroy real data.
- **Destructive operations require an explicit, reviewed decision.** A generated migration that silently drops a column is the single most dangerous artifact in this repo.
- CI already applies migrations to a real Postgres on every run (`DONE`) — that is the safety net that makes the rest workable.

## 8. Growth, indexes, and the tables that will hurt

Unbounded growth: `audit_logs`, `operation_events`, `stock_movements`, `customer_timeline_events`, `sessions`.

- **Sessions** need a scheduled cleanup of expired/revoked rows — the natural first real job for the scheduler (currently a heartbeat only).
- **Operation events** need a retention window and archival; they are debug data, not history.
- **Audit / stock movements / timeline** are permanent and should be **partitioned by time** before they become large, not after.

**Indexes exist (`DONE`)** on the obvious access paths (`tenantId + status`, `tenantId + plateNumber`, `workOrderId`, …). The discipline going forward: every new query pattern arrives with its index, and `EXPLAIN` is run on anything that will be called on a dashboard.

**The honest workaround to retire.** `WorkshopsService.list()` cannot sort/filter by computed aggregates (health, last activity, branch count) in SQL, so it takes a bounded 500-tenant candidate set and finishes in memory. The code says so plainly. It is correct up to 500 tenants and wrong at 5,000. The real fix is a **denormalised summary table refreshed by a background job** — scheduled as Phase 10 work, and it must not be forgotten just because the current behaviour looks fine in a demo.

## 9. Query amplification in the permission resolver

> **RESOLVED, per `docs/PHASE_MAP.md` and `PROJECT_STATE.md` §5.** This section originally described a `TODO` from before Phase 3 shipped. The resolver is now **10 layers**, not eight (platform → plan → tenant status → capability → module → feature → workshop config → delegation → role template → user override), and per-request context caching landed in Phase 3: permission resolution is constant-cost regardless of how many keys are checked in one request (20 keys costs the same ~6 queries as 1). The problem description below is kept as the historical record of what the fix addressed — do not read it as a current gap.

**The concrete problem, as originally measured (now fixed):** of the (then-eight) permission layers, five each issued their own Prisma query — `PlatformControlLayer`, `PlanEntitlementLayer`, `RolePermissionTemplateLayer`, `UserOverrideLayer`, `WorkshopConfigurationLayer`. There was no caching anywhere in the resolver.

So a single `can()` call cost up to five round-trips, and a page checking ten permissions cost fifty. This was fine at the scale of the time and was fixed before it stopped being fine — it sits on the hottest path in the entire system.

**The fix that shipped (originally written here as a `TODO`, before Phase 3), which was applied without weakening the model:**

1. **Per-request resolver context.** Load the tenant's control settings, plan, role permission template, user overrides, and configuration **once per request**, then resolve every permission key against that in-memory snapshot. Layer ordering and the `locked` short-circuit are untouched — only the data source changes.
2. **Batch the page-load case.** A page needing many keys asks once and receives a map, rather than issuing N sequential resolutions.
3. **Short-TTL cache for slow-moving data**, with one hard rule: **anything that revokes access bypasses the cache.** A tenant freeze or a permission removal must take effect immediately. Stale *denial* is acceptable; stale *permission* is a breach.

The order matters: correctness is already right, and optimising it must not become an opportunity to quietly simplify the layer model.

## 10. Testing the data layer

- **Integration tests run against real Postgres** (`DONE` — CI provisions it; the pattern already exists in the auth/access/operations specs). Mocked databases prove nothing about constraints, transactions, or cascades.
- **Invariant tests (`TODO`):** attempt to drive stock negative, double-issue an invoice, mutate a locked invoice, respond to a decision twice — and assert the *database* refuses, not just the service.
- **Isolation tests (`TODO`):** §1 Layer 4.
- **Migration tests (`TODO`):** apply the full migration chain to a seeded database and assert no data loss.

The seed must produce **at least two tenants with different configurations**, because a single-tenant seed makes isolation bugs invisible and makes configurability untested by construction.

---

**Related:** [`VISION.md`](./VISION.md) · [`INFRASTRUCTURE.md`](./INFRASTRUCTURE.md) · [`DATA_DICTIONARY.md`](./DATA_DICTIONARY.md)
