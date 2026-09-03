# MOP — The Workflow Engine

> **Document ID:** DOC-08
> **Purpose:** the machinery underneath the lifecycle — how a graph, a capability profile, a set of policy answers and a set of per-record facts combine into "what may happen next".
> **Authority:** ARCHITECTURAL.
> **Scope:** `packages/shared/src/capabilities/workflow-router.ts`, `validator.ts`, `packages/shared/src/policies/graph-safety.ts`, `packages/shared/src/operations/workflow-journey.ts`, and their consumers in `apps/api/src/systems/operations/`.
> **Last verified:** 2026-09-01 against commit `a8c8bb5`.
> **Related:** 07 (the work-order graph itself), 02 (capabilities), 04 (policies), 28 (state → UI).

---

## 1. Why an engine at all

A fixed state machine with buttons hidden on top of it is not a shaped product; it is a full product with a costume. The engine exists so that **which transitions exist** is a computed property of a tenant's shape, not an if-chain in a service.

Concretely: *"technician finishes"* lands on Team Review, QC, invoicing or delivery readiness depending purely on which capabilities the workshop has and which policies it answered. Expressing that as branching code means every future feature has to re-derive it, and the branches drift. Expressing it as **data the router walks** means adding a capability later does not mean hunting through services for hardcoded transitions.

## 2. The seven concepts, kept distinct

These are used precisely; conflating any two produces a real defect.

| Concept | Is | Lives in |
|---|---|---|
| **State** | A value a record can hold | Prisma enum **and** `WorkflowGraph.states` — they match exactly |
| **Transition (edge)** | A permitted move from one state to another | `WorkflowGraph.transitions` |
| **Intent** | The action a *person* takes | `WORKFLOW_INTENTS`, 20 of them |
| **Guard** | A condition on an edge: `requires` (capability), `requiresPolicy`, `requiresFact` | On the transition |
| **Gate** | A condition on the *record* that must hold before a checkpoint | `GATE_REGISTRY`, evaluated by `GateEvaluatorService` |
| **Side effect** | What else changes when the transition lands | `OperationEventsService` fan-out |
| **History event** | The immutable record that it happened | `OperationEvent` + `AuditLog` |

The distinction that matters most in practice: **a guard decides whether an edge exists for this tenant; a gate decides whether this particular record may take an existing edge right now.** A capability removes guards' edges outright; a gate blocks a specific job and tells the person what to do about it.

## 3. The three inputs

```
effectiveGraph( graph, capabilityProfile )
                  ↓
        resolveIntent( ·, profile, currentState, intent, policyAnswers, facts )
                  ↓
              routed edge  →  gates  →  write
```

### 3.1 Capability profile — true for the whole tenant

`requires: readonly CapabilityKey[]` on a transition. Every named capability must be active (`ENABLED`, `READ_ONLY` or `LOCKED`) or the edge is not in this tenant's effective graph at all.

A whole graph may also carry `requires` — `PART_REQUEST_GRAPH` does. That graph is **skipped**, not reported unreachable: *"this never happens here"* is not the same defect as *"this happens and then gets stuck."*

### 3.2 Policy answers — also true for the whole tenant

```ts
requiresPolicy?: readonly { policyKey: string; oneOf: readonly string[] }[]
```

All conditions must hold. An edge with none is unconditional on policy, which is what every edge was before policies could reach the graph. Four policies appear on edges today: `INSPECTION_REQUIRED`, `APPROVAL_REQUIRED_SCOPE`, `TECHNICIAN_DIRECT_SEND`, `QC_MANDATORY`.

### 3.3 Facts — true for **this record only**

```ts
requiresFact?: readonly string[]
```

Unlike the first two, a fact is computed per work order and can only be evaluated once a specific record is in hand — which is exactly why the router takes it as a **third, separate input** rather than folding it into policy answers.

It exists for one case today: `QC_MANDATORY`'s `RISK_FLAGGED_ONLY`, where whether QC is required depends on *this job's own faults*. The fact is `work_order.has_critical_fault`, computed from the job's `Fault` rows on every routing call.

**A missing fact is treated as false.** Conservative in both directions: a job is never assumed risk-flagged, and never assumed exempt, on data nobody computed.

## 4. Routing

### `effectiveGraph(graph, profile)`

Filters transitions by `requires`, applies each disabled capability's `RemovalPolicy` — removing `statesToDisable`, dropping `gatesToDrop`, adding `addTransitions` — and returns the graph this tenant actually has.

### `resolveIntent(graph, profile, from, intent, policies, facts)`

Finds the live edges from `from` carrying `intent`, applies `requiresPolicy` and `requiresFact`, and returns **the first declared match**.

> **Declaration order is precedence.**

This is not incidental. A workshop with team review, QC and finance has three live `FINISH` edges out of `IN_PROGRESS` simultaneously. The graph lists them review → QC → invoicing and the router takes the first live one. Reordering those three lines in `workflow-graphs.ts` changes product behaviour, which is why the ordering carries a comment saying so.

Returns a discriminated result: `{ ok: true, transition }` or `{ ok: false, failure }` with a message a person can act on.

### Companion functions

| Function | Used for |
|---|---|
| `allowedTransitions(graph, profile, from)` | Everything possible from a state |
| `canTransition(graph, profile, from, to, …)` | A direct check — **this, not the enum, is what "can this happen" means** |
| `gatesFor(transition)` | The checklist for an edge |
| `isTerminal(graph, state)` | Reused by, e.g., branch deactivation, which blocks while non-terminal work orders exist — rather than keeping a second hardcoded status list |

The last row is worth noting as a pattern: **derive from the graph rather than re-listing states.** A hand-kept "these statuses count as open" list is a second source of truth that goes stale the moment a state is added.

## 5. Validation — the proof obligation

Capability shaping is a correctness problem wearing a configuration costume. Three validators discharge it, all in CI.

### 5.1 `validateCapabilityProfile` — reachability

For every graph and every entity:

> **Every reachable non-terminal state must still have a path to a terminal state.**

Runs **before** a change is applied, so a configuration that could strand a work order is rejected rather than discovered in production. Codes: `MISSING_DEPENDENCY`, `CONFLICT`, `CORE_CAPABILITY_DISABLED`, `STRANDED_STATE`, `DISABLED_STATE_REACHABLE`, `UNKNOWN_STATE_REFERENCE`, `TERMINAL_UNREACHABLE`, `GATE_NOT_OWNED`.

Output includes per-entity reachability (`reachable` / `stranded`), plus orphaned roles, dropped gates and kept gates — everything an operator needs to act on, not just a boolean.

`[VERIFIED]` — every shipped profile is validated by `validator.spec.ts`, so a change to the lifecycle graph can never silently strand one of the standard shapes.

### 5.2 `validatePolicyGraphSafety` — policies may not change reachability

For **every option of every policy that appears on an edge**, across every profile: the graph must still reach a terminal state. A policy option that would strand a job fails the build rather than a workshop.

`policiesAppearingOnEdges()` and `factsAppearingOnEdges()` derive what to check from the graph itself rather than a maintained list.

### 5.3 `policiesOnEdgesDeclareTheirCapability`

A policy condition on an edge must depend on the same capability the edge requires — otherwise an answer could outlive the capability that gives it meaning. This is why `TECHNICIAN_DIRECT_SEND`'s condition sits on the `TEAM_REVIEW`-requiring edge rather than on the two edges below it.

### 5.4 The relevance graph

Separately, `policies/validator.ts` proves the **relevance** graph acyclic. Four real cycles were found and fixed when it was first built. And `isPolicyRelevant` scopes `priorAnswers` to a policy's *declared* `dependsOnPolicies`, so a predicate reading an undeclared key finds it absent — without that, the declared graph would be a lie and the acyclicity proof would be checking the wrong thing.

## 6. Execution — the runtime path

`WorkOrderLifecycleService.apply()`:

```
load work order (id, tenantId, status)
   ↓
routingContext(tenantId, workOrderId)  →  { profile, policies, facts }
   ↓
resolveIntent(...)                     →  409 transition_not_allowed on failure
   ↓
gates.evaluate(...) if the edge carries gates
   ├─ same capability profile → a check whose owning capability is gone is never asked
   └─ blocked → 409 gate_blocked with EVERY unsatisfied gate, not just the first
   ↓
one transaction:
   write status  ·  emit work_order.status_changed  ·  audit
```

**The `tx` parameter.** A caller that already holds a row lock — `TechnicianWorkService`'s blocker methods — passes its own transaction so the status write folds into it. Without that, the decision (*"nothing else is blocking this anymore"*) and the write that acts on it are two transactions, and a second caller's decision can land in the gap. That was edge case H1, a real race.

## 7. Side effects: `OperationEventsService`

One physical event produces one domain event, which produces many consistent projections.

`OPERATION_EVENT_KEYS` declares **45 keys** grouped by emitting system, so "which events exist" has one written answer instead of being discovered by grepping for emit calls — which is how the previous implementation ended up with modules that quietly bypassed the pipeline altogether.

⚠️ **The union is not enforced on the emit path.** `EmitOperationEventInput.eventKey` is typed `string`, not `OperationEventKey`, and the union type is imported only by its own spec. A typo is therefore **not** a compile error. Against the source: **45 declared, 27 emitted, only 9 in both** — Finance emits nine undeclared `finance.*` keys and Inventory eight undeclared `part_request.*` keys. Gaps G-EVT-01/02.

```ts
DomainEventEnvelope {
  key, tenantId, emittedBy, actorId, actorType, occurredAt, requestId?, payload
}
```

⚠️ The declared `DomainEventEnvelope` (with `emittedBy` and `requestId`) is **never referenced in production code**; the real input type has neither field and `OperationEvent` has neither column. Correlating every projection from one press, out of stored data, is therefore not currently possible. Gap G-EVT-03.

`emittedBy` is one of the six owning systems, so an event emitted by the wrong system is visible rather than plausible.

## 8. The journey projection

`workflowJourney()` in `packages/shared/src/operations/workflow-journey.ts` turns a work order's state plus the tenant's effective graph into a **stage strip** — the same visual read by three roles, implemented once in `apps/web/src/app/domain/journey/`.

Stage states: `DONE` · `CURRENT` · `WAITING` · `BLOCKED` · `AHEAD`.

Because it is derived from the *effective* graph, a workshop with no QC never shows a QC stage — the strip is not a fixed picture with steps greyed out. That distinction is the same one §1 makes about the whole engine.

## 9. Related derived reads

| Utility | Derives |
|---|---|
| `work-order-lanes.ts` | The board's lanes, from the effective graph |
| `attention-ranking.ts` | What needs a manager first — reads `WORKING_WEEK` through `workingHoursBetween` |
| `blocker-routing.ts` | Where a blocker goes |
| `lifecycle-duration.util.ts` | Per-status duration reconstructed from `work_order.status_changed` history, **not from a snapshot** |
| `detectStatusLoops` | Rework detection — a status re-entered after already being left |

`lifecycle-duration.util.ts` is reused by Owner Reports, Workflow Health and Data Analyst Operations rather than reimplemented three times — one of the clearer wins from the events ledger being real.

## 10. Extending the engine

Adding a state, edge, intent, gate or policy condition, in order:

1. **State** → add to the Prisma enum **and** `WorkflowGraph.states`, plus a migration. They must match exactly.
2. **Edge** → add to `transitions`. Mind declaration order if it shares an intent with an existing edge from the same state.
3. **Guard** → `requires` for a capability; `requiresPolicy` for a policy (and make the policy depend on the same capability the edge requires); `requiresFact` for a per-record condition, and compute the fact in `routingContext`.
4. **Gate** → add to `GATE_KEYS` and `GATE_DEFINITIONS` with an owner, a `blockedMessage` and a `satisfiedMessage`. If a capability produces the thing it checks, that capability owns it and must list it in `affectedGates`.
5. **Run the validators.** They are the point.

**What you must not do:**

- Write `WorkOrder.status` anywhere but `WorkOrderLifecycleService`.
- Add a state to the enum without an edge reaching it. `RETURN_REJECTED` and `RETURN_CLARIFICATION_REQUESTED` were exactly that — declared, unreachable, and therefore non-existent as far as `canTransition()` was concerned.
- Hand-maintain a list of "open" statuses. Derive from `isTerminal`.
- Read a policy answer in a controller, a DTO or a browser component. Policies are resolved by the API; the UI reflects the result.

## 11. Implementation status

| Element | Status |
|---|---|
| `effectiveGraph` / `resolveIntent` / `canTransition` / `allowedTransitions` | ✅ `[VERIFIED]` — `workflow-router.spec.ts` |
| Capability guards | ✅ `[VERIFIED]` |
| Policy guards on edges | ✅ `[VERIFIED]` |
| Per-record fact guards | ✅ `[IMPLEMENTED]` — one fact in use |
| Reachability validator | ✅ `[VERIFIED]` — all shipped profiles |
| Policy graph-safety validator | ✅ `[VERIFIED]` — `graph-safety.spec.ts` |
| Relevance-graph acyclicity | ✅ `[VERIFIED]` |
| Gate evaluation, capability-aware, full checklist | ✅ `[INTEGRATED]` |
| Closed event union + envelope | ✅ `[IMPLEMENTED]` |
| Journey projection shared by 3 roles | ✅ `[INTEGRATED]` |
| Caller-supplied transaction (H1) | ✅ `[IMPLEMENTED]` |
| Per-state entry timestamps | 🔴 `[INTENDED]` — durations are reconstructed from event history; SLA uses `updatedAt` as a named proxy |
| Capability rollback vs. in-flight transition (E13) | 🔴 `[INTENDED]` — design spike owed |
| Workflow graph editable per tenant beyond capability/policy | 🚫 **Deliberately not a goal.** Configuration selects among behaviours the code knows; it never describes new ones |
