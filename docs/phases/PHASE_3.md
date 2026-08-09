# Phase 3 — Governance Runtime

> **Goal:** make the capability engine real at runtime. Until now it is a proven pure function with no callers — it can tell you a configuration is safe, but nothing stores a workshop's capabilities or enforces them on a request.
> **Why before Phase 4:** the lifecycle reads capabilities to decide transitions. If capabilities are not resolvable at runtime first, Phase 4 hardcodes them and the engine becomes decoration.

---

## What exists, and what is missing

**Built (Phase 0.A / 2.A):** the registry, capability-annotated workflow graphs, removal policies, the reachability validator, the gate registry, seven shipped profiles. 55 tests.

**Missing:** everything that makes it apply to a real workshop.

| Gap | Consequence today |
|---|---|
| No storage | A tenant's capabilities live nowhere. `TenantConfiguration.enabledModules` is a flat `String[]` with no dependency info, no history, no removal policy |
| No resolution | Nothing turns "this tenant, right now" into a `CapabilityProfile` |
| No enforcement | `ModuleEnabledLayer` denies on a flat array. A disabled capability does not deny at the capability level |
| No history | A 2026 work order cannot be read under 2026's capabilities |
| No pipeline | A capability change cannot be validated against live data, previewed, applied atomically, or rolled back |

---

## Task 3.A — `TenantCapability`, time-ranged

One row per (tenant, capability, period): `status`, `effectiveFrom`, `effectiveTo`, `source`, `lockedByPlatform`, `configuredBy`, `reason`.

**Time-ranged, not a flat column.** A work order created in 2026 when Inventory was disabled has no part requests. Read under 2027's capabilities — Inventory now enabled — that record looks *corrupt*: missing stock movements, missing part lifecycle. Read under the capabilities in force when it happened, it reads correctly as "parts were handled externally". History must be interpreted under the rules that applied at the time, and a flat column cannot answer that.

## Task 3.B — Capability resolution and enforcement

A service that resolves a tenant's active `CapabilityProfile`, and a `TenantCapabilityLayer` inserted into the permission resolver **above** module, role and user layers — because a permission may never resurrect a disabled capability. Granting a technician `inventory.request.issue` in a workshop with no inventory must still deny.

Requires a mapping from permission key to the capability that governs it. Most of it is module-level (`INVENTORY` module → `INVENTORY` capability); a few keys are finer (`inventory.stock.return.accept` → `PART_RETURNS`).

## Task 3.C — Per-request resolver context *(Phase 1.6, pulled forward)*

Five of eight layers issue their own query per `can()` call. **Adding a capability layer makes that six.** Deferring the fix while adding to the problem is not defensible, so 1.6 lands here.

Layers stop injecting `PrismaService` and become pure functions over a snapshot loaded once per request. Layer ordering and the `locked` short-circuit are untouched — only the data source changes. The rejected shortcut remains rejected: an optional snapshot with per-layer query fallback means two code paths for one answer, and one of them stops being exercised.

## Task 3.D — The change pipeline

**Draft → Validate → Live-data preconditions → Impact preview → Apply → Audit → Rollback.**

The reachability half is built. What Phase 3 adds is everything requiring the database:

- **Live-data preconditions** — *"14 work orders are in Ready for Team Review. Disabling this will move them to Ready for QC."* A real count, live at dialog-open time, never cached from an earlier look.
- **Atomic apply** — capability rows, record migrations and audit in one transaction, or none of it.
- **Audit + rollback** — who, what, why, and the migration counts.

## Task 3.E — Super Admin capability UI

Deliberately last, and explicitly droppable from this phase. The API and its guarantees are what Phase 4 depends on; the screen is not. If Phase 3 runs long, this moves to Phase 5 and the phase is honest about it rather than reporting itself complete.

---

## Exit criteria

1. Capabilities are stored per tenant, time-ranged, with a migration applied to a populated database.
2. A tenant's profile resolves at runtime, and a disabled capability denies **above** any role or user permission — proven by a test that grants the permission and still expects denial.
3. Permission resolution issues a constant number of queries per request regardless of how many keys are checked, proven by a test that counts them.
4. A capability change validates against live data, previews real counts, applies atomically, and audits.
5. A work order is interpretable under the capabilities in force when it was created.
6. Everything green: tests, typecheck, both lint rules, build.
