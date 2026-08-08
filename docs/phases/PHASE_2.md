# Phase 2 — Design Completeness

> **Status (2026-08-08): COMPLETE.**
>
> | Task | State |
> |---|---|
> | 2.A Gate registry | ✅ typed, ownership-derived, 47 tests |
> | 2.B Cross-system contracts | ✅ typed, closed event union, 55 tests |
> | 2.C Scenario matrix | ✅ [`docs/SCENARIOS.md`](../SCENARIOS.md) — 25 scenarios, every one with a verdict |
> | 2.D Schema changes | ✅ migration applied, purely additive (no DROP) |
>
> Verified: **272 tests** (55 shared + 159 API + 58 web), typecheck clean, both custom lint rules passing, full build green.
>
> Two items are deferred **with named phases** rather than left vague: multiple partial issues against one part request (Phase 7, where the inventory flow is built) and `TenantCapability` time-ranging (Phase 3, where its writers exist).

> **Goal:** close every design question that would otherwise force a migration or a rewrite once Phase 3 and 4 depend on it.
> **Why now:** Phase 3 stores capabilities and Phase 4 builds the lifecycle on top of them. Anything still undecided at that point gets decided by accident, in code, under time pressure.
> **Shape:** mostly design and typed contracts, plus one schema change. Almost no runtime behaviour — this phase makes later phases a translation exercise rather than a design exercise.

---

## Task 2.A — Gate registry

**The problem.** Finish-gate and delivery-gate checks are currently free strings scattered through the capability registry: `"parts.received_used_or_returned"`, `"qc.passed"`, `"approved_work_completed"`. Nothing declares what gates exist, which capability owns each, or which are core and can never be dropped. A typo is silent, and `CAPABILITY_MODEL.md` Rule 2a — *a gate dies with the capability that produces what it checks* — is enforced by a hand-maintained list rather than by the type system.

That rule already caught one real bug (Inventory and Part Returns disagreeing over a shared gate). It should not be possible to reintroduce it.

**Work:** a typed `GateKey` union and a registry declaring, per gate: its owning capability (or `null` for core, meaning never droppable) and whether it guards Finish or Delivery. Capability definitions reference `GateKey`, not `string`. The validator derives dropped gates from *gate ownership* rather than from each capability's hand-written list, and a consistency test asserts the two can never disagree.

**Done when:** a misspelled gate key is a compile error; a core gate cannot be dropped by any capability profile; and the validator's dropped-gate set is derived, not declared.

## Task 2.B — Cross-system contracts

**The problem.** `SYSTEMS.md` §3 names the contracts between the six systems — `ChargeableWorkItem`, `InvoiceCandidateCreated`, the part and decision events — in prose. Prose does not stop Finance from querying `Task`.

**Work:** those contracts as typed interfaces in `@mop/shared`, with the event-key union, so a cross-system payload is checked at compile time and the boundary rule has something concrete to point at.

**Done when:** every contract in `SYSTEMS.md` §3 exists as a type, and event keys are a closed union rather than free strings.

## Task 2.C — The scenario × capability matrix

**The problem, stated by the product owner at the start:**

> *"a customer doesn't want inspection or even to buy a part, he has his own part and only wants the service to fit it. There are very long lists of examples on each page and each situation and you need to cover them all — from day one of designing."*

That scenario appears nowhere in the canonical spec or the detailed role specs, and it is **unrepresentable**: `PartRequest.inventoryItemId` is a required FK, so a customer-supplied part has no row, no price path, and no way to be billed as labour-only.

It is also not one scenario but several, because the same story differs by capability profile — "customer approves a part" is a different flow with and without an inventory.

**Work:** `docs/SCENARIOS.md` — each entry with trigger, actors, happy path, branches, terminal states, the systems it touches, and **which capability profiles change it**. Every entry carries a schema verdict: *representable* or *needs change*.

**Done when:** no entry is left without a verdict, and every "needs change" is either applied in 2.D or scheduled with a named phase.

## Task 2.D — The schema changes 2.C demands

Applied as one migration set, so Phase 3 builds on settled ground.

Known before starting: **customer-supplied parts**. The fix is not to relax `inventoryItemId` to nullable and hope — a work-order line for a part the workshop never owned needs its own provenance, a zero cost, a labour charge, and a liability record that the customer supplied it. Warranty disputes turn on exactly that record.

**Done when:** the migration applies cleanly to the seeded database, and the scenarios it unblocks are marked representable.

---

## Exit criteria

1. Gate keys are typed; a core gate cannot be dropped; dropped gates are derived from ownership.
2. Every `SYSTEMS.md` contract exists as a type.
3. `SCENARIOS.md` covers the named families, every entry carrying a capability note and a schema verdict.
4. Schema changes applied and migrated; no scenario left blocked without a named phase.
5. Everything green: tests, typecheck, both custom lint rules, build.
