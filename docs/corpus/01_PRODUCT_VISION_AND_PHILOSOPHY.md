# MOP — Product Vision and Philosophy

> **Document ID:** DOC-01
> **Purpose:** why MOP exists in the shape it does, and the principles that decide arguments about it.
> **Authority:** FOUNDATIONAL. Where a lower document conflicts with this one on *intent*, this one wins; where it conflicts on *current behaviour*, the code wins.
> **Scope:** the whole product.
> **Last verified:** 2026-09-01 against commit `a8c8bb5`.
> **Source of truth:** [`../VISION.md`](../VISION.md), [`../PRODUCT_SPEC_CANONICAL.md`](../PRODUCT_SPEC_CANONICAL.md), [`../SYSTEMS.md`](../SYSTEMS.md), [`../../CLAUDE.md`](../../CLAUDE.md).
> **Related:** 02 (capabilities), 04 (policies), 22 (invariants), 38 (decisions), 40 (agent guide).

---

## 1. What MOP is

**MOP — Maintenance Operations Platform** is a multi-tenant SaaS for running maintenance and service workshops. One codebase serves many workshops, each with its own staff, customers, branches, inventory and pricing — and, critically, **its own shape**. A one-bay quick-service shop and a twelve-branch dealership run the same code with different capabilities switched on. `[IMPLEMENTED]` — this is what `packages/shared/src/capabilities/` exists to make true, and the two seeded tenants (`Apex Motors`, `Delta Quick Service`) are deliberately different shapes so that shape-blindness in new code fails a test rather than a customer.

In one sentence:

> **A single repair is a distributed transaction across five roles, and MOP's job is to make sure it never silently lies to anyone.**

A customer brings in a vehicle. Over the next two days a receptionist, a technician, an inventory manager, a team leader and a branch manager each act on it, at different times, from different devices, each seeing a different subset of the truth. The customer watches from outside through a keyhole. At the end, money changes hands based on what everyone believes happened.

MOP is the shared ledger of what happened. If the technician's screen says *part used*, the stock ledger says *part still in the warehouse*, and the invoice says *part not billed* — MOP has failed, even though every individual page rendered without an error.

That is why the original brief insisted the system "must not be a set of disconnected pages." It is not a style preference. It is the entire engineering problem.

## 2. The problem it solves

Workshops today run on a paper notebook, a WhatsApp group, an accounting package and human memory. Each of those is individually reliable and collectively incoherent. The specific failures MOP exists to remove:

- Nobody can answer *where is my car* without walking to the bay and asking.
- A part leaves the shelf and is never billed, or is billed twice.
- A customer approves a repair verbally and no record survives the disagreement three weeks later.
- A vehicle is handed back before the balance is settled, because the person at the gate does not know there is one.
- The owner cannot tell which branch, technician or service actually makes money.
- Nobody can reconstruct who decided what, when it matters.

## 3. Who it is for

MOP is three products wearing one codebase. Each has a different customer, a different risk and a different definition of quality, and most design arguments in this project are really one of them pulling against another.

| | **Platform product** | **Workshop product** | **Trust product** |
|---|---|---|---|
| Sold to | Workshop owners | — (used by their staff) | — (used by their customers) |
| Primary user | Platform Super Admin | Technician, receptionist, storekeeper, manager, owner | The vehicle's owner |
| Job | Provisioning, control, oversight, and bluntly the ability to switch a paying customer off | Get the day's work done faster than the notebook it replaces | Tell the customer what is happening and whether it is their turn |
| Principal risk | **Blast radius** — one wrong control change hits every user in a workshop at once | **Friction** — slower than paper means it loses to paper | **Leakage and confusion** — internal costs, staff notes, another owner's history |
| Quality bar | No destructive action without knowing precisely, in advance, who it affects | The fastest path through the software is also the correct one | The customer always knows what is happening and whether they must act |

Naming which of the three a disagreement is really about usually resolves it.

## 4. Product philosophy

These are the standing commitments. Each has a countermeasure in the codebase, because a principle with no enforcement is a preference.

### 4.1 Configuration must be behavioural

A setting that stores a value nothing reads is not configuration; it is a lie with a save button. Every capability, policy and configuration value in MOP must be traceable to a runtime consumer that actually reads it.

`[IMPLEMENTED]` — the policy registry carries an `enforcement` field on every policy, either `ENFORCED` with a list of the exact `Service.method` consumers that read it, or `RECORDED` with an honest statement of what has to exist before anything can. `policy-consumers.spec.ts` asserts those consumer names against the real source tree in CI, so a policy cannot claim to be live while naming a method that does not exist. All 16 shipped policies are currently `ENFORCED` with real named consumers.

The failure this guards against is documented: in v11.9 the Owner published Builder changes successfully while the runtime read a *different* table, written once at provisioning and never again.

### 4.2 Removal is rewiring, not hiding

Disabling a capability must reroute the process, not conceal a button. The formal guarantee:

> After any capability change, every reachable non-terminal state must still have a path to a terminal state.

`[VERIFIED]` — checked before a change is applied, by `packages/shared/src/capabilities/validator.ts`; every shipped profile is validated in CI by `validator.spec.ts`.

Removing Team Review must reroute the finish transition. Removing Inventory must drop the *parts used or returned* gate, or every job in that workshop strands forever at a Finish Gate waiting for a part lifecycle that can no longer complete.

### 4.3 Policies are executable business decisions

A policy answers "what rule does this step run under", never "does this step exist". The mechanical test that separates the two: **a policy may never change reachability.** If a setting could change whether a work order can reach a terminal state, it is a mis-classified capability. `[IMPLEMENTED]` — enforced by `packages/shared/src/policies/graph-safety.ts`, which proves it for every option of every policy that appears on a workflow edge.

### 4.4 Truth propagates from one write path

One physical event produces one domain event, which produces many consistent projections. When a technician marks a part used, that single act must change the task, the work order lifecycle, the stock ledger, the warehouse balance, the running invoice, the customer's sanitised timeline, the team leader's view, the branch attention centre, the reports and the audit trail — consistently, from one write path, not "eventually, if someone refreshes."

`[IMPLEMENTED]` — `OperationEventsService` is that path, with a closed union of 46 event keys in `packages/shared/src/contracts/events.ts` so that "which events exist" has one answer instead of being discovered by grepping for emit calls.

### 4.5 Asymmetric visibility is a security boundary, not a presentation concern

"Inventory Manager created a supplier order for unavailable brake pads" is, to the customer, "We are waiting for a required part." Not a shortened version — a *different statement*, produced deliberately by a translation layer.

**Restricted data must be absent from the response, never hidden client-side.** Anyone can open developer tools. `[VERIFIED]` — the Team Leader and Data Analyst response shapes carry no price, cost or payment field anywhere, each asserted by its own test; Customer Decision Analytics carries no customer-identifying field, likewise asserted.

### 4.6 Money must be correct, and correctness has a moment

A quoted price is fluid. An approved price is frozen. A running invoice is live. An issued invoice is permanent, and after that the only honest way to change anything is a credit note.

**Money is `Decimal` in the database and `string` across the API.** A money value reaching the browser as a JavaScript number is a bug even when it looks right. `[VERIFIED]` — enforced by `tools/lint-money.mjs`; the build fails.

Current catalogue values and historical transaction snapshots are different things: an old invoice must never silently reprice. `[IMPLEMENTED]` — `PriceCatalogEntry` is effective-dated; a price edit closes the old row and opens a new one rather than rewriting what an issued invoice already printed.

### 4.7 Stock is a claim about the physical world

The database says four brake pads are on the shelf; someone took one without recording it. Every inventory system faces this drift. The ones that survive make reconciliation a normal, cheap, blameless action rather than an admission of failure — and put a human at the point where the physical and digital worlds must agree. That is why stock only increases when the Inventory Manager **accepts** a return, never when a technician declares one.

### 4.8 Tenant isolation is structural, not remembered

A user in Workshop A must not see, infer or affect anything in Workshop B — not through a URL, not through a report aggregate, not through a search box, not through an error message, not through a realtime channel. Isolation is a property that must hold across every path, including ones added later by someone in a hurry, so it has to be enforced structurally. See `33_SECURITY_AND_TENANCY_MODEL.md`.

### 4.9 No silent stubs

A gate returning hardcoded `true` is a defect, not a placeholder. It is believable, visible and false — the worst combination. The previous implementation had two, and they could never block while appearing to. `[IMPLEMENTED]` — this is why `PolicyEnforcement.status` distinguishes `ENFORCED` from `RECORDED` in the type system rather than in a comment, and why the onboarding UI says which one an answer is.

### 4.10 Report honestly

If tests fail, say so with the output. If a step was skipped, say that. The single most damaging thing in the previous implementation was code that claimed to work.

## 5. Design principles

| Principle | In practice |
|---|---|
| **Domain behaviour over UI decoration** | A button that does not reach a domain command is not a feature |
| **Explicit state transitions** | `WorkOrderLifecycleService` is the only writer of `WorkOrder.status`. A grep for a hardcoded status write must return nothing |
| **Real records over fabricated state** | A metric with no lineage is not reported. Feature Adoption Analytics reports Custom Fields and Message Templates as *not trackable yet* rather than inventing a count |
| **Traceability** | Every important business result traces to the records that produced it |
| **Deterministic workflows** | Where several intent edges are live at once, declaration order is precedence — data, not an if-chain |
| **Auditability** | `AuditLog` has exactly one writer, enforced by a lint rule that fails the build |
| **Idempotency** | A double-pressed button must not take money twice |
| **A list looks the same at 1 row and 100,000** | Scale shows up in pagination, never in layout |
| **Arabic and RTL from the first component** | No physical-direction CSS anywhere; enforced by `tools/lint-directional-css.mjs` |
| **Next-action primacy** | Every role's landing page answers "what needs me?" with no click, filter, or memory of where they were |

## 6. Non-goals

Naming these prevents scope drift disguised as helpfulness.

| Not a goal | Why |
|---|---|
| A general-purpose ERP or accounting package | MOP is the operational spine. Billing deliberately splits into its own bounded system precisely so a workshop can keep its accounting elsewhere |
| A configuration language | Configuration selects among behaviours the code already knows how to do; it never describes new behaviour. The trap v11.9 fell into was configurability quietly becoming a second, worse programming language with no type system and no tests |
| Self-service tenant configuration by the Owner | Per the 2026-08-07 amendment, workshop shape is controlled by Platform Super Admin per workshop. The Owner configures within the shape, not the shape itself |
| A marketplace, a booking site, or a parts e-commerce front | Out of scope entirely |
| Per-tenant code forks or per-tenant deployments | One codebase, many shapes. A fork is a failure of the capability model |
| Feature flags as a product mechanism | Capability, policy and permission are the three legitimate axes. A fourth ad-hoc one is drift |

## 7. The six hard problems

Named in advance because they are where disproportionate care goes.

1. **The permission resolver sits on every path.** Eleven layers, evaluated for every action, every role, every tenant. A wrong `allow` is a breach; a wrong `deny` is an outage; and it runs constantly. Correct and fast fight each other. **Both are now held:** the resolver is a real ordered array that is actually iterated, deny-by-default, with a `locked` short-circuit — *and* every layer is a pure function over a `PermissionContext` loaded once per request, so a page asking ten permissions costs the same queries as asking for one. (`VISION.md` §4 describes the earlier state, where six of nine layers queried the database themselves; that is fixed.)
2. **Money has a moment where it must become immutable, and not one moment earlier.** Too loose and prices are retroactively altered under a customer who already agreed; too tight and normal daily corrections become impossible and staff work around the system.
3. **Stock drifts from the physical world.** See §4.7.
4. **The customer boundary is the highest-consequence surface.** Everyone else is an employee under a contract. The customer is an outsider with a link. Public decision links, portal accounts, and ownership transfers where a new owner must see technical history but never the previous owner's financials — each is a place where a mistake is a real-world privacy incident.
5. **Real-time is promised, and what exists is polling.** The brief is explicit that progress updates in real time on technician, team-leader and customer pages. What ships is a deliberate **20-second poll** on the journey strip and on Live View — one refresh cadence, chosen because a workshop job changes hands in minutes, not milliseconds. There is **no WebSocket or SSE infrastructure**, and introducing one would be a new runtime dependency, a new failure mode and a new thing to operate. `[IMPLEMENTED]` as polling, `[INTENDED]` as push. When push arrives, `journey-poller.ts` is the one place that changes. Push also interacts with isolation: a realtime channel is one more thing that can leak across tenants.
6. **Scale is multi-dimensional.** More tenants, more branches, more warehouses, more categories, more roles, more features toggled. A design that assumes one branch, or that a page can load "all" of anything, breaks silently as a workshop grows.

## 8. What "done" means

The acceptance flow in the canonical spec — Super Admin creates workshop → … → customer sees final invoice → reports update → audit exists — is necessary but **not sufficient**. A demo can pass it.

Done means all of:

1. The full flow works end to end on real, non-stub code.
2. It works **a second time, on a second tenant, with different configuration** — different policies, different capabilities, different permissions — without code changes.
3. Neither tenant can see or affect the other, verified by a test that actively tries.
4. Every step is visible from the right roles and invisible from the wrong ones, verified **at the API response level**, not the UI.
5. Every scenario in [`../SCENARIOS.md`](../SCENARIOS.md) — including the awkward ones: customer refuses inspection, brings their own part, rejects a critical repair and drives away — has a defined path and a defined terminal state.
6. Freezing a tenant mid-flow blocks everyone immediately and loses no data.
7. The audit trail is sufficient to reconstruct what happened and who decided it.

## 9. Decision philosophy

**Waterfall, not agile.** The structure laid down early is inherited by every phase after it, so foundations are deliberately over-invested in. Work follows [`../PHASE_MAP.md`](../PHASE_MAP.md) in order.

Re-planning at a phase boundary is expected and healthy. **Silently drifting from the plan is not** — a task that cannot be completed is recorded in the phase document with the reason and the phase by which it must land.

Four standing rules about how decisions get made:

- **A discovery pass earns a phase, not a patch.** A structural gap — missing vocabulary, missing platform-relationship model, missing resilience story — gets its own phase with its own exit criteria, not scattered tickets absorbed into whatever phase is active.
- **A hardening pass earns a register entry, not a phase.** A race condition or an unverified claim attaches to the phase that already owns the affected system.
- **Cheap now, expensive later** decisions are called out deliberately so they are decided rather than defaulted. RTL, customer-supplied parts, realtime transport and worker separation each cost days today and months after later phases build on top.
- **Every visual value is justified.** Colour, shadow, radius, motion — if it cannot be justified from [`../DESIGN_LANGUAGE.md`](../DESIGN_LANGUAGE.md), it is decoration.

## 10. Failure modes actively guarded against

Each is a real, documented failure of v11.9, and each has a structural countermeasure — because a cultural one does not survive a hurried afternoon.

| Failure mode | What it looked like | Countermeasure |
|---|---|---|
| **Decorative abstraction** | A named 10-stage permission hierarchy that nothing iterated, while a different ad-hoc resolver did the real work | The resolver is a literal array that *is* iterated; tests assert layer ordering and short-circuit behaviour |
| **Write-only configuration** | Owner published Builder changes successfully; the runtime read a different table, written once at provisioning | One configuration row, one reader, one writer. A config change must be provable by a behavioural test, not a success toast |
| **Dead centralised service** | A "centralised audit service" nothing imported, while ten modules hand-rolled inconsistent audit writers | `tools/lint-audit-boundary.mjs` fails the build on any `AuditLog` write outside `apps/api/src/audit/**` |
| **Silent stubs** | Gates hardcoded to `true` that could never block while appearing to | `PolicyEnforcement` distinguishes ENFORCED from RECORDED in the type system; CI asserts every named consumer exists |
| **Island subsystems** | Each passing its own tests while the edges between them were broken | Integration tests run against real Postgres; golden journeys cross every boundary |
| **Implemented but unreachable** | Four finished, tested systems with no page, no route, no door | `PAGE_INVENTORY.md` measures against what the spec requires, never against what was built |
| **Configuration islands** | A setting whose change produces no downstream behavioural difference | Every policy names its runtime consumers, asserted in CI |
| **Metrics without lineage** | A KPI nobody can trace to the records that produced it | A number with no lineage is reported as not derivable, never fabricated |
