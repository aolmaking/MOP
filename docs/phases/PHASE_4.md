# Phase 4 — Operations Spine

> **Status (2026-08-09):** the spine is built. 3 of 6 tasks complete; 4.D–4.F remain.
>
> | Task | State |
> |---|---|
> | 4.A Workflow router | ✅ intent-labelled edges, precedence by declaration order |
> | 4.B Gate evaluation | ✅ registry-driven, capability-filtered, no hardcoded checks |
> | 4.C Lifecycle service | ✅ the only writer of WorkOrder.status |
> | 4.D Intake | ⬜ next |
> | 4.E Tasks, inspections, faults, blockers | ⬜ |
> | 4.F Scenario walkthrough | 🟡 the three-profile lifecycle test covers the core of it |
>
> **The exit criterion already passes:** one work order runs to CLOSED under three capability profiles — full service (review → QC → invoice), quick service (straight to invoice) and external finance (straight to delivery) — through the same code, with no transition hardcoded anywhere. A grep for hardcoded work-order statuses outside the lifecycle service returns nothing.
>
> Verified: **327 tests** (81 shared + 188 API + 58 web), typecheck clean, both lint rules, full build green.

> **Goal:** the work-order lifecycle, capability-aware from its first line.
> **Why this phase carries the most risk:** every role phase after it reads and writes work-order state. If a single transition is hardcoded in a service here, the capability engine becomes decoration and the cost of undoing it multiplies with each role built on top.
> **The rule:** *no service ever assigns a work-order status directly.* Transitions come from the graph, resolved against the tenant's capabilities.

---

## Task 4.A — The workflow router

Today the capability-annotated graphs exist and the validator proves they are safe, but nothing *walks* them. The router is what turns a graph into runtime behaviour:

- `allowedTransitions(from)` — which moves are legal for this workshop right now
- `resolveIntent(from, intent)` — where does "finish" go, given these capabilities

The second is the important one. "Technician finishes" lands on Team Review, QC, invoicing, or straight to delivery readiness depending entirely on which capabilities the workshop has. Encoding that as `if (teamReview) … else if (qc) …` in a service is precisely the mistake this phase exists to avoid; encoding it as **intent-labelled edges resolved in precedence order** puts it in the graph, where the validator can already reason about it.

Lives in `@mop/shared`, pure, no database — the same property that let the reachability validator be proven in isolation.

## Task 4.B — Gate evaluation

The Finish and Delivery gates, resolved from the gate registry and filtered by capability. A gate whose owning capability is inactive is **not evaluated and not reported** — it does not exist for that workshop. Each unsatisfied gate returns the registry's `blockedMessage`, so a blocked technician is told what to do rather than what failed.

**No gate check may be a hardcoded `true`.** The previous implementation had exactly that in two of eight checks, which meant those conditions could never block anything while appearing to.

## Task 4.C — The lifecycle service

The single writer of `WorkOrder.status`. Takes an intent, asks the router, checks gates where the transition is gated, writes the new state and emits the domain event — in one transaction.

Refuses any transition the graph does not allow, with a reason. That refusal is the mechanism that makes "no hardcoded transitions" true rather than aspirational.

## Task 4.D — Intake

Customer, asset, ownership and work order created together or not at all. Ownership transfer closes the previous `AssetOwnershipHistory` row and opens a new one. Covers scenarios 1.1, 1.5, 2.1 and 2.2 of `SCENARIOS.md`.

## Task 4.E — Tasks, inspections, faults, blockers

The records a technician actually produces. Blockers route by reason; inspections carry the category-specific fields; faults carry severity.

## Task 4.F — Cross-system scenario walkthrough

The phase closes by driving `SCENARIOS.md` end to end under **at least three capability profiles** — full service, quick service (no inventory, no teams, no QC) and external finance — proving the same code produces three coherent lifecycles.

---

## Exit criteria

1. A work order runs from intake to `CLOSED` under three different capability profiles.
2. No service assigns a status directly; a test asserts every transition goes through the router.
3. An illegal transition is refused with a reason.
4. Gates are resolved from the registry and filtered by capability; none is hardcoded.
5. Every state change emits its domain event.
6. Everything green: tests, typecheck, both lint rules, build.
