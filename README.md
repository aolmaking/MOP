# MOP — Maintenance Operations Platform
## Master Product & Technical Dossier

**MOP is a multi-tenant SaaS platform for running maintenance and service workshops.** One codebase serves many workshops, each with its own staff, customers, branches, warehouses, inventory and pricing — and, critically, **its own shape**: a one-bay quick-service shop and a twelve-branch dealership run the same code with different capabilities switched on, where switching one off *rewires the process* rather than hiding a button. The product exists because a single vehicle repair is a distributed transaction across five roles who act at different times from different devices, each seeing a different slice of the truth, and at the end money changes hands based on what everyone believes happened. **MOP's job is to make sure that transaction never silently lies to anyone.**

> **This document is written for technical due diligence, not for marketing.** It distinguishes throughout between what was intended, what was designed, what was built, what was connected, and what was verified. Where the repository contradicts a document, the repository wins and the contradiction is named. Where something is unfinished, unreachable, or diverged from its design, this document says so with evidence.

---

## Document control

| | |
|---|---|
| **Verified against** | commit `af363f7` on `main`, 2026-09-02 |
| **Method** | Every implementation claim below was checked against source, schema, routes, registries and tests — not against prior documentation. Nine claims inherited from existing documents were **corrected** during this pass; each correction is marked. |
| **Deeper references** | The 41-document corpus at [`docs/corpus/`](docs/corpus/00_DOCUMENTATION_INDEX.md). This dossier synthesises it; the corpus remains the specialist deep-dive. |
| **Canonical trackers** | Page status: [`docs/PAGE_INVENTORY.md`](docs/PAGE_INVENTORY.md) · Phase status: [`docs/PHASE_MAP.md`](docs/PHASE_MAP.md) · Session history: [`PROJECT_STATE.md`](PROJECT_STATE.md) · Live queue: [`docs/AUTONOMOUS_EXECUTION_STATE.md`](docs/AUTONOMOUS_EXECUTION_STATE.md) |

---

## Implementation-state legend

Used consistently throughout. **These states are never silently collapsed.**

| | State | Meaning |
|---|---|---|
| 🟣 | **INTENDED** | The product or design says this should exist. Nothing built. |
| 🔵 | **DESIGNED** | Architecture or detailed design exists; implementation may not. |
| 🟡 | **PARTIAL** | Meaningful implementation exists; important behaviour is missing. |
| 🟢 | **IMPLEMENTED** | The intended behaviour exists in code. |
| 🟦 | **INTEGRATED** | Connected into the production flow — a real user reaches it and the downstream effect lands. |
| ✅ | **VERIFIED** | Evidence demonstrates it works, named at the claim. |
| 🟠 | **DISCONNECTED** | Implementation exists; runtime callers or consumers are missing. |
| 🔴 | **NOT IMPLEMENTED** | The intended behaviour does not meaningfully exist. |
| ⚠️ | **BROKEN** | Implementation exists but fails expected behaviour. |
| ⏸ | **DEFERRED** | Intentionally postponed, with recorded reasoning. |
| ❓ | **UNKNOWN** | Evidence insufficient. |

**The distinction that matters most in this project is 🟢 IMPLEMENTED vs 🟦 INTEGRATED vs 🟠 DISCONNECTED.** MOP's documented history contains four finished, tested systems that shipped with no door — no page, no route, no way for any human to reach them. Six more exist today (§2, §31).

---

## Table of contents

**Level 1 — Executive**
[01. Executive Snapshot](#01-executive-snapshot) · [MOP in One Page](#mop-in-one-page) · [02. Executive Implementation Reality](#02-executive-implementation-reality)

**Level 2 — Product & architecture**
[03. Product Thesis & Philosophy](#03-product-thesis--project-philosophy) · [04. The MOP Mental Model](#04-the-mop-mental-model) · [05. Business & Operational Model](#05-business--operational-model) · [06. Golden Journeys](#06-golden-journeys)

**Level 3 — Configuration & roles**
[07. Capability Model](#07-capability-model) · [08. Policy Model](#08-policy-model) · [09. Specialisation Model](#09-specialisation-model) · [10. Role & Responsibility Model](#10-role--responsibility-model)

**Level 4 — Surfaces & subsystems**
[11. Page Catalog & Page Reality](#11-page-catalog--page-reality) · [12. Feature Catalog & Feature Reality](#12-feature-catalog--feature-reality) · [13. Subsystem Catalog](#13-subsystem-catalog)

**Level 5 — Engineering**
[14. Backend Architecture](#14-backend-architecture) · [15. Frontend Architecture](#15-frontend-architecture) · [16. Domain Model](#16-domain-model) · [17. Workflow Engine](#17-work-order--workflow-engine) · [18. Inventory](#18-inventory-architecture--reality) · [19. Finance & Billing](#19-finance--billing-architecture--reality) · [20. Customer Experience](#20-customer-experience--reality) · [21. Security & Tenancy](#21-security-tenancy--authorization) · [22. Invariants](#22-data-integrity--critical-invariants) · [23. Concurrency](#23-concurrency-transactions--idempotency) · [24. Database](#24-database-architecture) · [25. API Model](#25-api--domain-command-model) · [26. Audit](#26-audit--traceability-model) · [27. Testing](#27-testing--verification-model) · [28. Design & UX](#28-design--ux-philosophy) · [29. Decisions](#29-architectural-decisions)

**Level 6 — Reality, gaps, assessment**
[30. Implementation Reality Register](#30-implementation-reality-register) · [31. Gap Register](#31-gap-register) · [32. What Was Built Well](#32-what-was-built-well) · [33. What Is Still Missing](#33-what-is-still-missing) · [34. What Is Hard & Risky](#34-what-is-hard--what-is-risky) · [35. Extensibility](#35-extensibility--future-evolution) · [36. Current Priorities](#36-current-priorities) · [37. Final Assessment](#37-final-system-assessment) · [38. Appendices](#38-technical-appendices)

---

# 01. Executive Snapshot

## What MOP is

A **platform product** (sold to workshop owners; its user is a Platform Super Admin who provisions, shapes, controls and can switch off a paying customer), a **workshop product** (used all day by technicians, receptionists, storekeepers and managers), and a **trust product** (used by the vehicle's owner, who did not choose MOP and does not care about it) — three products wearing one codebase, with three different risk profiles that pull against each other.

| | Platform product | Workshop product | Trust product |
|---|---|---|---|
| **User** | Platform Super Admin | 7 staff roles | The customer |
| **Risk** | Blast radius — one control change hits every user in a workshop | Friction — slower than paper means it loses to paper | Leakage — internal costs, staff notes, another owner's history |
| **Quality bar** | No destructive action without knowing precisely who it affects, in advance | The fastest path through the software is also the correct one | The customer always knows what is happening and whether it is their turn |

## Target business and users

Independent and multi-branch maintenance workshops serving **cars, motorcycles, or heavy equipment** — the three operating categories are first-class in the schema, which is why the central entity is `Asset`, not `Vehicle` (a generator has no plate; it has a serial number and an hour meter).

Seven tenant-staff roles: Owner, Admin, Branch Manager, Technician, Inventory Manager, Team Leader, Data Analyst. Plus Platform Super Admin (cross-tenant) and the Customer (an outsider with a link).

## The core problem

Workshops run on a paper notebook, a WhatsApp group, an accounting package and human memory. Each is individually reliable and collectively incoherent:

- Nobody can answer *where is my car* without walking to the bay.
- A part leaves the shelf and is never billed, or is billed twice.
- A customer approves a repair verbally and no record survives the disagreement three weeks later.
- A vehicle is handed back before the balance is settled, because the person at the gate does not know there is one.
- Nobody can reconstruct who decided what, when it matters.

## The product proposition, in one sentence

> **A single repair is a distributed transaction across five roles, and MOP is the shared ledger that keeps them honest — while adapting its own shape to each workshop without forking the code.**

## The five architectural ideas

| Idea | What it means | Realised? |
|---|---|---|
| **Capability shaping** | Removing a capability rewires the workflow; a formal reachability proof runs *before* any change is applied | ✅ Verified in CI for every shipped profile |
| **Policy as executable decision** | 16 policies, each with named runtime consumers asserted against the source tree in CI. A policy may never change reachability — proven | ✅ Verified |
| **Six bounded systems on one spine** | A system never reads or writes another's tables; reads via contract, changes via event | 🟡 Contracts real; the event layer has diverged (§26) |
| **Truth propagation from one write path** | One physical event → one domain event → many consistent projections | 🟡 Real for Operations; Finance and Inventory diverged, and some flows emit nothing |
| **Asymmetric visibility as a security boundary** | Restricted data is *absent from the response*, never hidden client-side | ✅ Verified by response-shape tests |

## Current implementation maturity

| Dimension | Reality |
|---|---|
| **Scale of build** | 77 Prisma models · 31 migrations · 30 controllers · 170 routes · 85 services · 32 modules · 53 spec'd pages across 9 role surfaces |
| **Test volume** | 871 API · 243 shared · 272 web tests. **62 of 104 API spec files are real-Postgres integration tests** |
| **CI** | Every push and PR: real Postgres service, 6 custom lint rules, typecheck, full test suite, full build |
| **Pages** | 47 ✅ complete · 6 🟡 partial · **0 unbuilt**, of 53 specified |
| **Configuration engine** | 12 capabilities, all with complete removal policies; 16 policies, all `ENFORCED` with CI-asserted consumers |
| **Authorization** | 11-layer resolver, deny-by-default, pure layers over a per-request context; 80 permission keys |
| **Golden journeys** | 6 passing · 2 partial · **2 blocked** |
| **Browser / end-to-end tests** | **None.** No Playwright, no Cypress, no "Honesty Harness" — those do not exist in this repository |

## Executive status table

| Area | Intended | Actual implementation | Verification | Remaining gap | Significance |
|---|---|---|---|---|---|
| **Capability engine** | Remove a capability, rewire the workflow, never strand a job | 🟦 12 capabilities with full removal policies; validator refuses unsafe profiles pre-apply; historical resolution via `resolveAsOf` | ✅ `validator.spec.ts` over every shipped profile | Builder Control's broader scope (theme, layouts, rollback) unbuilt | **The product's core differentiator, and it is real** |
| **Policy engine** | Configuration that provably changes behaviour | 🟦 16 policies, all `ENFORCED`, consumers asserted against the source tree | ✅ `policy-consumers.spec.ts`, `graph-safety.spec.ts` | No Owner-facing post-creation editor; 3 options are honest partials | **Strong. Directly answers "is this config real?"** |
| **Workflow engine** | One writer, capability- and policy-aware routing | 🟦 16 states, 20 intents, 12 gates; `WorkOrderLifecycleService` is the only status writer | ✅ router + reachability + graph-safety suites | Per-state entry timestamps; E13 rollback race | **Strong** |
| **Work order lifecycle** | Intake → … → Closed, end to end | 🟡 Every state reachable **except** the exit from `BLOCKED`; `Task` cannot be created through the product | ✅ integration; ❌ no browser test | 2 missing endpoints | **A blocked job is trapped. Launch blocker.** |
| **Inventory** | Full request → issue → use → return loop with an honest ledger | 🟡 Manager side complete and verified; **technician side of returns has no endpoints**; 4 statuses read but never written | ✅ real-Postgres suites incl. concurrency | 4 endpoints; transfers; supplier orders; adjustment page | **Half a loop. High business impact.** |
| **Finance Core** | Correct money, immutable at the right moment | 🟦 Effective-dated pricing, running invoice, gap-free numbering, unique-constraint payment idempotency, discounts, refunds, credit notes | ✅ real-HTTP integration incl. idempotency conflict | "Who Can Handle Money"; named rounding rule | **Strong** |
| **Billing** | Legal invoice per country | 🟠 Engine, seam and compliance blocking complete; **zero country adapters** | ✅ engine tested | ZATCA / ETA adapters | **Every real country is compliance-blocked. Trading blocker.** |
| **Authorization** | 11 layers, deny by default, capability above role | 🟦 Real ordered array, iterated, `locked` short-circuits, pure layers | ✅ per-layer specs | Customer sessions bypass the resolver; 10 orphaned keys | **Strong, with one documented hole** |
| **Customer surface** | Portal + public token link, strict privacy | 🟦 6 pages, token path, server-side critical acknowledgement, absent-not-hidden | ✅ walked end to end against a running stack | Full lifecycle strip; payment; authorization in the resolver | **Strong** |
| **Messaging** | Notify the customer | 🟠 8 templates, versioned, publish-gated — **no transport of any kind** | ✅ template tests | Any channel | **A complete authoring half with no sending half** |
| **Forms / custom fields** | Workshop-extensible records | 🟠 Authoring + validation real and tested; **nothing captures a value** | ✅ validation tests | One recording page closes it | **Same shape as messaging** |
| **Reporting / analytics** | Every number traceable | 🟦 Owner reports (5 tabs), 7 analyst pages, workflow health, real CSV export | ✅ real-HTTP export test + manual run | Date-range UI; per-role visibility; 5 platform sections | **Strong, honest about nulls** |
| **Audit** | Reconstruct who decided what | 🟦 Single lint-enforced writer, ~30 actions, filterable page with diffs | ✅ read live as a seeded owner | Rollback; retention; **`requestId` correlation designed but never implemented** | **Accountability solid; correlation weaker than designed** |
| **Domain events** | Closed union, one fan-out point | ⚠️ 45 declared, 27 emitted, **only 9 in both**; two parallel vocabularies | ❌ not enforced anywhere | Type the emit path; converge (a data migration) | **The truth-propagation claim is partly unbacked** |
| **i18n / RTL** | Arabic-first | 🟡 Logical-CSS mechanism lint-enforced from Phase 1 | ✅ lint | **The translation pass was never done** | Blocks the primary market |
| **Realtime** | Live progress | 🟢 Deliberate 20-second poll, never optimistic | — | Push (WS/SSE) | ⏸ A recorded decision, not an omission |

## What is genuinely strong

1. **The capability engine is real and proven**, not a feature-flag system with a nicer name. The reachability guarantee is checked before a change is applied, and CI proves it for every shipped profile.
2. **Configuration is provably behavioural.** Every `ENFORCED` policy names the `Service.method` that reads it, and CI asserts those methods exist. This directly answers the question that kills most configurable products.
3. **Money handling is disciplined end to end** — string across the wire (lint-enforced), effective-dated catalogue, immutable issued invoices, gap-free numbering under concurrency, and payment idempotency by unique constraint rather than check-then-write.
4. **Inventory correctness is enforced twice** — service refusal *and* a database `CHECK` — with an immutable movement ledger carrying `beforeQty`/`afterQty` written under a real `FOR UPDATE` lock.
5. **Structural enforcement over convention.** Six lint rules and four CI proof obligations encode rules that a previous implementation broke culturally.
6. **The documentation is unusually honest** — `profit: null` rather than a guess, "not computable" rather than a faked integrity check, "not trackable yet" rather than an invented adoption count.

## What is genuinely incomplete

1. **Six domain commands are implemented, tested, and unreachable over HTTP.** Two of them trap real work: a blocked job cannot be finished, and tasks cannot be created outside the demo seed.
2. **No country billing adapter exists**, so no tenant can legally invoice in a regulated market.
3. **The domain-event layer has silently forked** into two vocabularies, and several built flows emit nothing at all.
4. **No end-to-end browser test exists**, which is precisely the gap through which every "implemented but unreachable" defect has arrived.
5. **Messaging and form-value capture are authoring halves with no consuming halves.**
6. **The Arabic translation pass was never done.**

## Biggest risks

| Risk | Why it matters |
|---|---|
| **Reachability is untested by CI** | Every mechanism protects correctness *within* a layer; nothing checks that a layer is reachable from a browser. All six door-less commands, and the four unreachable statuses, are invisible to the entire test suite. |
| **Compliance blocking is total in regulated markets** | `compliantBlocked` is honest and surfaced — and the honest answer is currently "no". |
| **Event-layer divergence undermines the central claim** | "Five systems agree about one physical event" is the product thesis. It holds for Operations; Finance and Inventory emit an undeclared vocabulary, and `StockService.record()` emits nothing. |
| **`BLOCKED` traps jobs** | `no_open_blocker` is a core Finish gate and no control clears a blocker. |
| **Single-status-writer rule is convention-only** | The most load-bearing rule in the product is the only major one with no lint rule behind it. |

## Current readiness position

**Not production-ready, and not far from a credible internal pilot.** The engine layers — capability, policy, workflow, authorization, money, stock — are built to a standard well above the surface layers that expose them. The dominant failure mode is not "the logic is wrong"; it is "the logic has no door". That is unusually cheap to fix and unusually easy to miss, and it is what the priority list in §36 leads with.

---

# MOP in One Page

```mermaid
flowchart TB
    subgraph PLATFORM["PLATFORM PLANE — Super Admin"]
        PLAN["Plan<br/>ceilings + entitlements"] --> CAP["Capabilities ×12<br/>which steps EXIST"]
        CAP --> SPEC["Specialisation<br/>what KIND of work"]
        SPEC --> POL["Policies ×16<br/>the RULE each step runs under"]
        POL --> RESP["Responsibility<br/>WHO covers the work"]
        RESP --> STRUCT["Structure<br/>branches + stores"]
    end

    subgraph RUNTIME["TENANT RUNTIME"]
        PERM["11-layer permission resolver<br/>deny-by-default"]
        GRAPH["Capability-aware workflow graph<br/>16 states · 20 intents · 12 gates"]
        SPINE["WORK ORDER — the spine"]
    end

    subgraph SYSTEMS["SIX BOUNDED SYSTEMS"]
        OPS["Operations"]
        INV["Inventory"]
        FIN["Finance Core"]
        BIL["Billing"]
        PEO["People &amp; Performance"]
        GOV["Governance &amp; Control"]
    end

    subgraph SURFACES["NINE ROLE SURFACES"]
        S1["Super Admin ×6"]
        S2["Owner ×8"]
        S3["Branch Manager ×7"]
        S4["Technician ×3"]
        S5["Inventory Manager ×6"]
        S6["Team Leader ×4"]
        S7["Data Analyst ×7"]
        S8["Customer ×6"]
        S9["Shared public ×6"]
    end

    STRUCT --> PERM
    STRUCT --> GRAPH
    PERM --> SPINE
    GRAPH --> SPINE
    SPINE --> SYSTEMS
    SYSTEMS --> LEDGER["AuditLog + OperationEvent<br/>one write path"]
    SYSTEMS --> SURFACES
    LEDGER --> INSIGHTS["Insights — read-only<br/>reports · analytics · workflow health"]
```

**Read it as a cascade.** A plan bounds a workshop. Capabilities decide which steps exist at all. Specialisation decides what kind of record the work produces. Policies decide the rule each surviving step runs under. Responsibility decides who is permitted to operate what was switched on. Structure gives it branches and stores. Only then do permissions, pages and the workflow graph acquire their tenant-specific shape.

**Each arrow is a real dependency, not a sequence.** Policies are only *asked* when their capabilities are active. Responsibility questions are only raised for capabilities that are on. Pages only appear for roles whose permissions survived every ceiling above them.

**And it is also the failure chain.** A break high up is invisible until it surfaces low down: enabling `INVENTORY` in a workshop with no storekeeper produced part requests that **no account on earth was permitted to approve** — a capability turned on, a permission nobody held, and a job that stuck. That specific hole is why the Responsibility stage exists.

---

# 02. Executive Implementation Reality

*What exists today, by area. Not a status report — an implementation reality map.*

## Product

**Built.** Nine role surfaces spanning 53 specified pages, of which 47 are complete and 6 are partial with a named missing piece each. Seven shipped capability profiles from *Multi-branch full service* to *Diagnostics only* to *Money handled outside MOP*. Seven specialisation packs. Nine extensible forms. Eight message templates. Two deliberately different seed tenants so shape-blind code fails before it reaches a customer.

**Substance.** High. This is not a demo: the Owner's Reports subsystem reconstructs per-status durations from event history rather than reading a snapshot column; the Attention Center ranks rather than lists, and its ageing is working-week aware because a policy says so.

**Integration.** Uneven. Every page is reachable; not every *action* behind a page is.

**Highest-risk gap.** 🟠 The technician's returns actions, blocker resolution and task creation have no endpoints — so three of the product's most ordinary daily operations cannot be performed.

## Architecture

**Built.** Six bounded systems on one spine, with `apps/api/src` organised by **boundary rather than file kind** — `audit/ · runtime/ · identity/ · control/ · systems/ · experiences/ · insights/` — and the frontend using the identical vocabulary so one word means one thing on both sides of the wire.

**Substance.** High, and enforced: `experiences/` never writes directly, `systems/` never imports `experiences/`, and `audit/` stays top-level *because the lint rule matches that literal path*.

**Integration.** Cross-system reads go through five published contracts in `packages/shared`. Cross-system changes go through domain events — and that is where the architecture's weakest link is.

**Highest-risk gap.** ⚠️ The event layer. 45 keys declared, 27 emitted, only 9 in both.

## Backend

**Built.** NestJS. 30 controllers, 170 routes, 85 services, 32 modules. Guards: `SessionGuard`, `PlatformGuard`. Global `ThrottlerGuard`. Boot-time config validation — the process refuses to start on a malformed variable rather than failing on the first request that needs it. Uniform `{ code, message, details? }` errors rendered by shared frontend plumbing, which is why plan-limit refusals needed **no web change at all**.

**Substance.** High. Transactions are threaded into audit, stock and lifecycle writes; raw SQL appears in exactly three places, each justified in a comment.

**Highest-risk gap.** 🟠 Six service methods with no controller route.

## Frontend

**Built.** Angular, standalone components, signals, every route a lazy chunk. Eleven shells — one per role plus public and a fallback. A shared `domain/` layer holding the three concepts more than one role needs: the journey strip, the dossier drawer, the decisions UI.

**Substance.** Solid and disciplined. `AuthStore` never decodes anything client-side; every method round-trips to the server. The journey poller is **never optimistic** — the strip is redrawn only from a server response.

**Highest-risk gap.** 🔴 No translated strings, despite an RTL mechanism that has been lint-enforced since Phase 1.

## Database

**Built.** PostgreSQL 16 + Prisma. 77 models, 40 enums, 31 immutable migrations. Tenant-scoped throughout. Business-meaning constraints in the database, not only in services: stock buckets cannot go negative, `Payment.idempotencyKey` is unique, invoice and credit-note sequences are gap-free per tenant under a raw-SQL `ON CONFLICT DO UPDATE`.

**Substance.** High, and unusually well commented — the schema records *the constraint that forced the shape*, not what the field is called.

**Highest-risk gaps.** 🟠 Eight models with no production access. ⚠️ Four `PartRequestStatus` values read by three services and written by nothing. 🔴 No retention policy for `AuditLog` or `OperationEvent`.

## Workflow

**Built.** Three graphs (work order, part request, customer decision). 16 work-order states matching the Prisma enum exactly. 20 intents. Guards on three axes — capability (tenant-wide), policy (tenant-wide), and **fact (per work order)**. Gates at two checkpoints, dropped automatically when their owning capability goes.

**Substance.** The strongest single piece of engineering in the repository.

**Highest-risk gap.** ⚠️ `BLOCKED` has no exit control, and `no_open_blocker` is a core Finish gate.

## Inventory

**Built.** Five-bucket balances; an immutable `StockMovement` ledger with `beforeQty`/`afterQty` captured under `SELECT … FOR UPDATE`; partial fulfilment; velocity-based stock risk reused by three surfaces; `BLOCK_UNTIL_ZERO` warehouse deactivation.

**Integration.** The Inventory Manager's six pages are complete. **The technician's half of the return loop is not routed at all.**

**Highest-risk gap.** 🟠 The returns queue can only be populated by the demo seed.

## Finance

**Built.** Effective-dated `PriceCatalogEntry`; `ChargeableWorkItem` contract carrying provenance and a **frozen** approved price; running invoice; issuance in one transaction with compliance refusal *inside* it; payment idempotency; discount authority enforced at issuance against a request tied to that work order **and amount**; refunds → credit notes.

**Highest-risk gap.** 🔴 No country adapter. `WARN_ONLY` is the honest default precisely because the covered-country list is empty.

## Customer

**Built.** Six portal pages plus the public `/decide/:token` path that needs no login — because that is what a WhatsApp message points at, and requiring a login first would break the feature's reason for existing.

**Verified end to end against a running stack:** token read with no auth, unacknowledged safety rejection refused, smuggled price field refused, then answered — and the job left the manager's Approvals queue.

**Highest-risk gap.** 🟠 The 11-layer resolver has no opinion about a `CUSTOMER` session; authorization is `accountType` checks in controllers. It holds today **by care, not by mechanism**.

## Authorization

**Built.** Eleven layers, iterated in a literal ordered array, deny-by-default, `locked` short-circuit, **pure functions over a context loaded once per request** — so ten permission checks cost what one costs. 80 keys, lint-checked.

**Highest-risk gap.** 🟠 20 of 80 keys have no production consumer; 10 of those by design, 10 genuinely orphaned.

## Configuration

**Built.** The five-axis model — capability, policy, specialisation, custom field, configuration value — with a mechanical test separating the first two. A nine-stage creation journey writing the entire workshop shape **in one transaction**, where the browser previews with the *same validator the server refuses with*.

**Highest-risk gap.** 🔴 No Owner-facing post-creation policy editor; `TenantConfiguration.workflowPolicy` is an empty, unread placeholder.

## Testing

**Built.** 871 + 243 + 272 tests; 62 real-Postgres integration specs; four CI proof obligations; six lint rules; tests that assert **absences** in response shapes.

**Highest-risk gap.** 🔴 **Zero browser or end-to-end tests.** There is no "Honesty Harness" in this repository. Nothing in CI checks that a page calls the endpoint it should, or that an endpoint exists for a command.

## Infrastructure

**Built.** GitHub Actions on every push and PR, with a real Postgres service; `docker compose` for local Postgres; `tools/doctor.mjs` covering every environment failure mode encountered so far.

**Highest-risk gap.** 🔴 One external dependency today (Postgres) — a security property, but also the reason billing, messaging and payment integrations remain entirely unbuilt.

---

# 03. Product Thesis & Project Philosophy

Each philosophy below is stated as **what it means → why it exists → how it appears in the system → whether it is realised in code**. These are MOP-specific commitments with enforcement mechanisms, not generic software values.

## 3.1 Configuration must be behavioural

**Means.** A setting that stores a value nothing reads is not configuration; it is a lie with a save button.

**Why.** In v11.9 the Owner published Builder changes successfully while the runtime read a *different* table, written once at provisioning and never again. The UI reported success; nothing changed.

**How it appears.** Every policy carries `enforcement: { status, where, consumers[] }`. `ENFORCED` requires a list of real `Service.method` names; `RECORDED` requires an empty list and an honest statement of what must exist first.

**Realised?** ✅ **Yes, and mechanically.** `policy-consumers.spec.ts` asserts every named consumer exists in the source tree, so a rename breaks the build rather than quietly turning the claim into a lie. All 16 shipped policies are `ENFORCED` with existing consumers.

## 3.2 Removal is rewiring, not hiding

**Means.** Disabling a capability must reroute the process, not conceal a button.

**Why.** Removing Inventory while leaving the *parts used or returned* Finish gate in place strands **every job** in that workshop, forever, waiting on a lifecycle that can no longer complete.

**How it appears.** Every non-core capability carries a complete `RemovalPolicy` — behaviour, states to disable, replacement transitions, gates to drop and keep, what happens to existing records, what happens to orphaned roles, and the replacement customer-facing wording.

**Realised?** ✅ **Yes.** `validateCapabilityProfile` proves *every reachable non-terminal state still reaches a terminal state* before a change is applied, and `validator.spec.ts` proves it for all seven shipped profiles in CI.

## 3.3 A policy may never change reachability

**Means.** The mechanical test separating a policy from a mis-classified capability.

**Why.** Before policies could reach the graph, "is customer approval required?" was answered by whichever intent a service happened to send — and the graph carried an edge literally labelled *"no approval required by policy"* that **no policy controlled**.

**How it appears.** `requiresPolicy` conditions on four edges; `validatePolicyGraphSafety` checks every option of every edge-bearing policy across every profile.

**Realised?** ✅ **Yes.** An option that would strand a job fails CI rather than a workshop.

## 3.4 Truth propagates from one write path

**Means.** One physical event produces one domain event, which produces many consistent projections — not "eventually, if someone refreshes".

**Why.** When a technician marks a part used, that single act must change the task, the lifecycle, the stock ledger, the warehouse balance, the running invoice, the customer's sanitised timeline, the team leader's view, the branch attention centre, reports and audit.

**How it appears.** `OperationEventsService` is the single fan-out point, writing an `OperationEvent`, delegating to `AuditService`, and producing a `CustomerTimelineEvent` through a safe projection — all inside the caller's transaction.

**Realised?** 🟡 **Partly, and this is the most significant philosophical gap in the product.** The single fan-out point is real. But the vocabulary that was supposed to keep it honest has forked: 45 keys declared, 27 emitted, **only 9 in both**. Finance emits nine undeclared `finance.*` keys, Inventory eight undeclared `part_request.*` keys. Worse, `StockService.record()` — the single most important write in the inventory system — writes the movement and the balance and **emits nothing at all**. See §26 and gaps G-EVT-01/02/03.

## 3.5 Asymmetric visibility is a security boundary

**Means.** *"Inventory Manager created a supplier order for unavailable brake pads"* becomes, for the customer, *"We are waiting for a required part."* Not a shortened version — **a different statement**.

**Why.** If it is in the payload and hidden by CSS, it has already leaked. Anyone can open developer tools.

**How it appears.** `CustomerSafeProjectionService` produces the customer's sentence from a canned per-event map, with a **blocklist** (`supplier`, `stock quantity`, `internal note`, `technician performance`, `margin`, `cost price`, `platform control`) applied to any caller-supplied text as defence in depth. Customer-safe wording for capability removal lives on the capability's `RemovalPolicy`, so it survives configuration changes rather than living in a component.

**Realised?** ✅ **Yes**, and asserted by tests that check for the *absence* of fields in response shapes — Team Leader and Data Analyst People Analytics carry no money field anywhere; Decision Analytics carries no customer-identifying field.

⚠️ **With one recorded defect, fixed honestly:** because the emitted keys diverged from the declared ones (§3.4), every canned customer message written against the declared keys was **unreachable** and customers saw the generic fallback. The applied fix maps *both* vocabularies, with the reasoning written into the code: renaming what the services emit is a **data migration**, because the emitted key is stored on every historical `OperationEvent` and `AuditLog` row and read back by reports and workflow health.

## 3.6 Money has a moment where it must become immutable — and not one moment earlier

**Means.** A quoted price is fluid; an approved price is frozen; a running invoice is live; an issued invoice is permanent, and after that the only honest change is a credit note.

**Why.** Too loose and prices are retroactively altered under a customer who already agreed. Too tight and normal daily corrections become impossible and staff work around the system.

**How it appears.** `PriceCatalogEntry` is effective-dated — an edit **closes the old row and opens a new one**. `ChargeableWorkItem` carries a **frozen** `approvedUnitPrice`. Money is `Decimal(12,2)` in the database and a **string** across the API, with integer minor units internally and a hard refusal of more than two decimal places: *round it deliberately before it gets here*.

**Realised?** ✅ **Yes**, and `tools/lint-money.mjs` fails the build on a JS number crossing the API.

**Gap.** 🔴 Halfway-point rounding has **no single named rule** (E15). It was verified correct once on inspection; *specified* and *correct today* are different things.

## 3.7 Stock is a claim about the physical world, and the two drift

**Means.** The database says four brake pads are on the shelf; someone took one without recording it.

**Why.** Every inventory system faces this. The ones that survive make reconciliation a normal, cheap, **blameless** action and put a human at the point where the two worlds must agree.

**How it appears.** Stock rises from a return **only when the Inventory Manager accepts it** — a technician saying *"I didn't use it"* is a claim; a storekeeper putting it back on the shelf is a fact. The `returnPendingQty` bucket exists because a returned part is genuinely neither sellable nor still issued.

**Realised?** 🟡 The discipline is real and enforced. But the **reconciliation action the philosophy argues for is not a first-class page** — `inventory.stock.adjust` and the `ADJUSTMENT` movement type exist with no surface. And the technician cannot initiate a return at all.

## 3.8 Tenant isolation is structural, not remembered

**Means.** A user in Workshop A must not see, infer or affect anything in Workshop B — not via URL, aggregate, search box, error message or realtime channel.

**How it appears.** `tenantId` on every tenant-scoped model; every query filtered on the *session's* tenant; **no endpoint accepts a client-supplied `tenantId`**; the only cross-tenant read in the product exposes **counts and event kinds, never payload**.

**Realised?** ✅ **Yes at the service layer**, asserted by tests that actively try to cross.

⚠️ **Trade-off recorded:** there is **no row-level security in the database**. Isolation is a service-layer property. This is the one place the project's own *constraint over convention* preference is not followed.

## 3.9 Auditability: one writer, structurally enforced

**Means.** Every consequential change is answerable.

**Why.** v11.9 had a "centralised audit service" nothing imported, while ten modules hand-rolled inconsistent writers.

**How it appears.** `AuditService` is the only writer; `tools/lint-audit-boundary.mjs` **fails the build** on any `AuditLog` write elsewhere. One shape, so *"which fields did we capture"* never depends on which module wrote the row. `actorName` is denormalised so a row stays readable after the account is gone.

**Realised?** ✅ **Yes.**

**Gap.** 🔴 The designed `DomainEventEnvelope` — carrying `emittedBy` and `requestId` — is **never referenced in production code**, and neither field exists on the persisted row. Correlating every projection produced by one press, from stored data, is **not currently possible** (G-EVT-03).

## 3.10 No silent stubs

**Means.** A gate returning hardcoded `true` is a defect, not a placeholder — *believable, visible and false* is the worst combination.

**Realised?** ✅ **Yes**, and it shows in the product's willingness to say no: `profit: null` where a cost was never recorded; *top services* explicitly grouped by invoice-line **text** because no stable `serviceId` exists; one Workflow Health check declared **not computable**; Feature Adoption reporting custom fields as **not trackable yet**; `PER_ITEM_CHOICE` on `APPROVAL_WEIGHT` **dropped rather than faked** because nothing exists for a per-item tier to attach to.

## 3.11 Configuration must never become a second programming language

**Means.** Configuration **selects among behaviours the code already knows how to do**; it never describes new behaviour.

**Why.** This is the trap v11.9 fell into — configurability quietly becoming a second, worse language with no type system, no tests and no way to reason about what a tenant's configuration actually does.

**How it appears.** Exactly five axes (capability, policy, specialisation, custom field, configuration value), with a mechanical test for the first two. Relevance predicates are **plain functions**, deliberately, not a declarative expression language — the same rule applied to itself.

**Realised?** ✅ **Yes.** No sixth axis exists.

## 3.12 Waterfall, and drift is the sin — not re-planning

**Means.** Structure laid down early is inherited by every phase after it, so foundations are deliberately over-invested in.

**How it appears.** Phases in order with a detail document each. **Re-planning at a phase boundary is expected and healthy; silently drifting is not** — a task that cannot be completed is recorded with a reason and the phase by which it must land.

**Realised?** ✅ Visibly. Phase 10's own document records, rather than smooths over, that the Owner's Money page and staff exit-reason work were named in the phase and did not land.

## 3.13 Anti-patterns deliberately avoided

| Anti-pattern | v11.9 instance | Countermeasure | Holds? |
|---|---|---|---|
| **Decorative abstraction** | A named 10-stage permission hierarchy nothing iterated | The resolver is a literal array that *is* iterated; tests assert ordering and short-circuit | ✅ for permissions — ⚠️ **recurred** in the event union, which is declared and unenforced |
| **Write-only configuration** | Builder wrote one table, runtime read another | One config row, one reader, one writer; policies name consumers | ✅ |
| **Dead centralised service** | An audit service nothing imported | Lint rule fails the build | ✅ |
| **Silent stubs** | Two gates hardcoded to `true` | `ENFORCED` vs `RECORDED` in the type system | ✅ |
| **Island subsystems** | Each passing its own tests while the edges broke | Real-Postgres integration tests; golden journeys | 🟡 no browser layer |
| **Implemented but unreachable** | Four finished systems with no door | `PAGE_INVENTORY.md` measures against the spec, not against what was built | 🟠 **still occurring** — six commands today |
| **Metrics without lineage** | KPIs nobody could trace | Honest nulls and "not computable" | ✅ |

**The pattern worth noting:** two of these have recurred. Both recurrences share a cause — they are *reachability* failures, and every mechanism the project built protects correctness **within** a layer rather than connection **between** layers.

## 3.14 Principles that should survive a future rewrite

1. Capability removal is rewiring, and the reachability proof runs before apply.
2. A policy may never change reachability.
3. One writer per consequential fact — status, audit, stock.
4. Money is a string across the wire; the immutability moment is explicit.
5. Restricted data is absent, not hidden.
6. Current configuration and historical record are different questions, and the record wins for anything that already happened.
7. Prefer a database constraint to a lock, a lock to a check-then-write, and a lint rule to a convention.
8. Say what the workshop *does*, never what the software *has*.
9. Report honestly: a number without lineage is not reported, and a claim of completion names its proof.

---

# 04. The MOP Mental Model

## 4.1 The concept map

```mermaid
flowchart TB
    PLAN["Plan — ceilings, entitlements"] --> TEN["Tenant / Workshop"]
    TEN --> BR["Branch"]
    TEN --> WH["Warehouse"]
    BR -.->|BranchWarehouseAccess| WH
    TEN --> ACC["Account — PLATFORM, TENANT_STAFF, CUSTOMER, SYSTEM"]
    ACC --> STAFF["StaffUser — 7 roles"]
    ACC --> CUST["Customer"]
    STAFF --> TEAM["Team + TeamMembership"]
    TEN --> ASSET["Asset — car, motorcycle, heavy equipment"]
    ASSET --> OWNH["AssetOwnershipHistory — one open row is the current owner"]
    CUST --> ASSET

    ASSET --> WO["WORK ORDER — 16 states"]
    CUST --> WO
    BR --> WO

    WO --> TASK["Task"]
    WO --> INSP["Inspection"]
    WO --> FAULT["Fault — CRITICAL drives QC routing"]
    TASK --> BLOCK["TaskBlocker"]
    WO --> PR["PartRequest — 15 graph states"]
    PR --> ISS["IssuedItem"]
    PR --> RET["PartReturnRequest"]
    PR --> MOVE["StockMovement — beforeQty / afterQty"]
    MOVE --> BAL["WarehouseStockBalance — 5 buckets"]
    WO --> WPL["WorkOrderPartLine"]
    WO --> CDR["CustomerDecisionRequest — 7 states"]
    CDR --> CDI["CustomerDecisionItem"]
    WPL --> RUN["RunningInvoice"]
    WO --> RUN
    RUN --> INV["Invoice — immutable once issued"]
    INV --> PAY["Payment — idempotency key"]
    INV --> BD["BillingDocument — clearance status"]
    INV --> CN["CreditNote"]
    WO --> TL["CustomerTimelineEvent"]
    WO --> SAFE["SafeTechnicalHistory"]
```

## 4.2 The concepts, defined precisely

**Tenant / Workshop.** The same thing — *tenant* in the schema, *workshop* in product language. Carries currency and timezone that **can never change**, because every price and timestamp is recorded against them.

**Plan.** Commercial ceilings and entitlements: `maxBranches`, `maxUsers`, `maxWarehouses`, plus allowed categories, modules, features, reports and exports. Enforced **on an ongoing basis**, not only at creation.

**Account vs StaffUser vs Customer.** An `Account` is the login; a `StaffUser` or `Customer` is what that login *is* inside a tenant. `AccountStatus` and `TenantStatus` are two independent gates on the same sign-in.

**Role.** One of seven `StaffRole` values. A job title, not an authority — authority is the *result* of eleven resolver layers.

**Responsibility.** Which role **covers** the work a capability creates in *this* workshop. Asked at creation; the answer writes real permission rows.

**Capability.** Whether a step exists at all. The only axis that may change reachability. **An absent key means ENABLED** — a profile records deviations from the full product, because reading absent as *disabled* would silently strip every capability from a tenant whose provisioning half-finished.

**Policy.** The rule an existing step runs under. May never change reachability.

**Specialisation.** What kind of work, and what shape of record it produces. A brake measurement and an oil change are not the same shape, and a workshop forced to squeeze one into the other stops recording it.

**Branch / Warehouse.** Where work is taken in; where stock lives. `BranchWarehouseAccess` says which branch may draw from which store.

**Asset — not Vehicle.** `CategoryCode` decides what identifies it: plate and VIN for cars and motorcycles; serial number, hour meter, site, fleet and operator for heavy equipment.

**Work Order.** The spine. 16 states. Only `WorkOrderLifecycleService` writes its status. Carries `inspectionDeclined` as a **fact** — *"not inspected yet"* and *"will not be inspected"* are different states, and the Finish Gate must not block a job for a step the customer refused.

**Task.** One unit of work. `actualMinutes` is the technician's **reported** figure, never derived from timestamps, because a task blocked and resumed would make wall-clock time overstate work done.

**Part Request.** 15 graph states. Its whole graph is *skipped* without `INVENTORY` — "this never happens here" is a different fact from "this happens and then gets stuck".

**Customer Decision.** A question put to the customer. 7 states. `secureToken` powers a public path with no login. **The step is core; the portal is only a channel.**

**Stock Movement.** The immutable ledger, carrying `beforeQty` and `afterQty` read under a row lock. A balance with no movement behind it is a defect, and `replay()` exists to prove it.

**Invoice.** Immutable once issued; only a credit note follows. Numbered gap-free per tenant.

**Audit vs Operation Event.** Two ledgers, two jobs: *who decided this and what did it look like before* versus *what happened and what else must change*.

## 4.3 How the concepts interact — the three orthogonal questions

Every runtime decision in MOP resolves three independent questions, and conflating any two is the most common design error in this codebase:

```mermaid
flowchart LR
    Q1["Does this step exist here? — CAPABILITY — changes reachability"] --> Q2["What rule does it run under? — POLICY — never changes reachability"]
    Q2 --> Q3["May this person do it? — PERMISSION — 11 layers, deny-by-default"]
    Q3 --> Q4["May they do it to THIS record? — OWNERSHIP + SCOPE — checked separately"]
```

The fourth question is the one most often forgotten: **a permission is not a claim about a specific record.** `requireTechnician` also asserts the job is *this* technician's; scope narrows what rows you see, never what actions you may take.

## 4.4 The single most important ordering

**Capability sits above role and user override in the resolver.**

Granting `inventory.request.issue` in a workshop with no inventory **still denies**. Without this ordering, the entire capability model becomes decoration — a hidden button that a permission grant can un-hide.

---

# 05. Business & Operational Model

## 5.1 A day in a workshop, through MOP

| Moment | Who | What they do | Data created | Decision | State change | Business effect |
|---|---|---|---|---|---|---|
| 08:10 | Branch Manager | Books a car in | `WorkOrder`, `Asset` (if new), `Customer` (if new) | Which branch; does the customer decline inspection? | `DRAFT → REGISTERED` | The job exists and is visible to everyone who needs it |
| 08:40 | Technician | Inspects, records findings | `Inspection`, `Fault` (with severity) | What is wrong; how serious | `REGISTERED → UNDER_INSPECTION` | A `CRITICAL` fault now drives QC routing for this job only |
| 09:15 | Technician | Raises a decision for the customer | `CustomerDecisionRequest` + items, `secureToken` | Which findings need the customer's answer | `→ AWAITING_CUSTOMER_APPROVAL` | Work is paused; the customer's queue is the bottleneck, visibly |
| 09:50 | **Customer** | Opens a link, approves two of three items | `CustomerDecisionItem.decision` | Approve / reject, with acknowledgement if critical | `→ APPROVED_FOR_WORK` | Scope is now agreed **and provable** |
| 10:00 | Technician | Starts work | `Task` state | — | `→ IN_PROGRESS` | The bay is committed |
| 10:30 | Technician | Needs a part | `PartRequest` | Which item, quantity | `→ WAITING_PARTS` | The storekeeper's queue gains an item |
| 10:35 | Inventory Manager | Approves and issues | `IssuedItem`, `StockMovement ISSUE` | Is there stock; is self-approval allowed | — | `availableQty ↓`, `issuedQty ↑`, ledger row with `beforeQty`/`afterQty` |
| 10:40 | Technician | Receives, fits, marks used | `WorkOrderPartLine` | — | `→ IN_PROGRESS` | The running invoice gains a line; the customer timeline gains a safe sentence |
| 14:00 | Technician | Presses Finish | Gate evaluation | — | Routed by capability + policy + fact | Review, QC, invoicing or delivery — **the graph decides, not the technician** |
| 14:20 | Branch Manager | Passes QC | — | Pass or fail | `→ PAYMENT_PENDING` | Money becomes the last obstacle |
| 14:30 | Branch Manager | Issues the invoice, takes payment | `Invoice`, `InvoiceLine`, `BillingDocument`, `Payment` | Discount authority; partial payment allowed? | `→ READY_FOR_DELIVERY` | Totals frozen; numbering gap-free |
| 15:00 | Branch Manager | Releases the vehicle | — | Delivery Gate | `→ CLOSED` | The car leaves only if the gate allows it |

## 5.2 The five decision points that define the product

1. **Does this job need an inspection?** — `INSPECTION_REQUIRED`. A customer who names one service may skip it, unless the workshop says otherwise.
2. **Does this finding need the customer's approval?** — `APPROVAL_REQUIRED_SCOPE`. All work, only beyond what was agreed, or only safety-critical.
3. **May this person release the part?** — `PARTS_SEPARATION_OF_DUTIES`.
4. **Where does finished work go?** — `TECHNICIAN_DIRECT_SEND` × `QC_MANDATORY` × the job's own critical-fault fact.
5. **May the car leave with a balance?** — `DELIVERY_BLOCKED_UNTIL_PAID`.

Each of the five is a stored answer with a named runtime consumer. **That is what makes MOP a configurable product rather than a configurable-looking one.**

## 5.3 Operational scenarios the product must handle

| Scenario | Handled how | Status |
|---|---|---|
| Customer declines inspection and names one service | `inspectionDeclined` stored as a fact so the Finish Gate never demands a step the customer refused | 🟦 |
| Customer rejects everything | `AWAITING_CUSTOMER_APPROVAL → CANCELLED` | 🟦 |
| **Customer rejects a safety-critical repair and drives away** | Acknowledgement enforced **server-side**; `critical_warning_acknowledged` is a core gate; the job can then close with the acknowledgement on record | ✅ walked end to end |
| Customer brings their own part | `PartProvenance.CUSTOMER_SUPPLIED` — zero cost, labour billed separately, **workshop does not warrant the part**; `parts.external_resolved` gate | 🟡 no first-class intake control |
| Part is unavailable | `→ UNAVAILABLE`, routes toward a supplier order | 🟡 supplier-order loop unbuilt |
| Technician finds a second problem mid-job | `ASK_CUSTOMER → WAITING_CUSTOMER` | 🟦 |
| **Work is blocked** | `REPORT_BLOCKER → BLOCKED` | ⚠️ **no exit control exists** |
| Job cancelled mid-work | `IN_PROGRESS → CANCELLED` | 🟦 |
| Customer pays half now, half later | `PARTIAL_PAYMENT = ALLOWED`; idempotency-keyed payments | ✅ |
| Workshop is frozen mid-flow | Every staff login returns `tenant_unavailable`; **no data lost**; resumes exactly where it stopped | 🟦 |
| Vehicle changes owner | `AssetOwnershipHistory` closes the previous window; new owner sees technical history, **never the previous owner's financials** | 🟡 no page performs a transfer |

## 5.4 What differs between two real workshops

Two tenants exist in the seed, deliberately shaped differently so shape-blind code fails before a customer sees it:

| | **Apex Motors** | **Delta Quick Service** |
|---|---|---|
| Shape | Multi-branch full service | Single bay |
| Branches | Nasr City, Giza | Main Bay |
| Warehouses | Central Warehouse, Giza Store | none |
| Capabilities | Everything on | No inventory, no teams, no QC |
| A part is | Requested, approved, issued from stock, and accounted for at the Finish Gate | Bought for the job; a parts wait is a **blocker**, not a `WAITING_PARTS` state |
| Finishing | Routes through review → QC → invoicing | Routes straight to invoicing |
| Team Leader pages | 4 | **absent, not disabled** |

> *"Delta is the shape that breaks naive code."* — the seed's own comment.

---

# 06. Golden Journeys

Each journey is split into **intended → actual → built → missing → gaps → verification**, as required for trustworthy assessment. A journey is **BLOCKED** when a step has no reachable control, even if every service behind it is implemented and tested.

**Summary: 6 passing · 2 partial · 2 blocked.**

## GJ-1 · The full repair — intake to closed · 🟡 PARTIAL

```mermaid
sequenceDiagram
    participant BM as Branch Manager
    participant T as Technician
    participant C as Customer
    participant IM as Inventory Mgr
    participant TL as Team Leader
    BM->>+T: book in (DRAFT→REGISTERED)
    T->>T: inspect, record faults (→UNDER_INSPECTION)
    T->>C: raise decision (→AWAITING_CUSTOMER_APPROVAL)
    C-->>T: approve (→APPROVED_FOR_WORK)
    T->>T: start work (→IN_PROGRESS)
    T->>IM: request part (→WAITING_PARTS)
    IM-->>T: approve + issue (StockMovement ISSUE)
    T->>T: receive, mark used (→IN_PROGRESS)
    T->>TL: finish (routed by capability+policy+fact)
    TL-->>BM: review / QC passed (→PAYMENT_PENDING)
    BM->>C: issue invoice, take payment (→READY_FOR_DELIVERY)
    BM-->>C: release vehicle (→CLOSED)
```

**Intended.** A single job passes through nine hands and five systems, and every system agrees about it at every step.

**Actual.** Every state transition above is reachable and works — **except that `Task` rows cannot be created through the product.** `TechnicianWorkService.createTask` is the only writer of `Task` anywhere in the codebase and no controller routes to it, so the journey depends on seeded tasks.

**Built components.** Intake · lifecycle · inspection · faults · decisions (both paths) · part request/approve/issue/receive/use · gate evaluation · review/QC advance · invoice issuance · payment · delivery gate · audit · customer timeline.

**Missing components.** A task-creation endpoint and its control.

**Gaps.** G-OPS-03.

**Verification.** Integration tests across every segment against real Postgres; the decision segment walked end to end against a running stack. ❌ No browser test covers the whole chain.

## GJ-2 · The part return loop · ⚠️ BLOCKED

**Intended.** A technician sends an unused part back; the storekeeper accepts, rejects, or asks a question; stock rises **only** on acceptance.

**Actual.** The storekeeper's half is complete, integrated and tested — queue, accept, reject, clarify, the clarify↔reply loop, the reversing movement. **The technician's half has no endpoints at all.**

| Command | State |
|---|---|
| `PartRequestService.requestReturn` | 🟠 implemented, tested, **no endpoint** |
| `respondToClarification` | 🟠 same |
| `markArrived` | 🟠 same |
| `resolveRejectedReturn` | 🟠 same |

**Consequence.** The Returns queue can only ever be populated by the demo seed.

**Gaps.** G-INV-02 … G-INV-05.

## GJ-3 · Customer approval, portal and counter · ✅ PASSING

**Intended.** Two paths to one outcome — a token link for a customer with a message, a counter path for a workshop with no portal.

**Actual.** Both work. With `CUSTOMER_PORTAL` disabled, the removal policy's replacement edges (`PENDING → RESOLVED` "recorded at counter by staff", `PENDING → EXPIRED`) keep the step alive — without them, every decision would strand at `PENDING` and **no work could ever be approved**.

**Verification (recorded, against a running stack).** Read with no auth → an unacknowledged safety rejection **refused** → a smuggled price field **refused** → then answered → and the job left the manager's Approvals queue.

**Notable invariant.** Counter approval is **attributed to staff, never the customer**, unconditionally under all three `PORTAL_COUNTER_APPROVAL` options — which is what lets a dispute distinguish *"the customer clicked approve"* from *"someone said the customer agreed on the phone."*

## GJ-4 · Partial payment · ✅ PASSING

**Actual.** `FULL_ONLY` refuses a short amount. `outstanding = total − Σ completed payments`. Replaying an idempotency key returns the original result; replaying it **with a different amount returns `409 idempotency_conflict`** rather than silently succeeding. The Delivery Gate holds the vehicle while a balance remains and `DELIVERY_BLOCKED_UNTIL_PAID = ALWAYS`.

**Verification.** `finance.integration.spec.ts` against real Postgres, including the concurrent-insert race.

## GJ-5 · External and customer-supplied parts · 🟡 PARTIAL

**Actual.** `PartProvenance` and the `parts.external_resolved` gate are real; with `EXTERNAL_PARTS` off the gate is **dropped** rather than left unsatisfiable. **Missing:** a first-class intake control for a customer-supplied part on any page.

## GJ-6 · Workshop creation to first job · ✅ PASSING

**Actual.** Nine stages → one transaction writing `Tenant`, capabilities, policies, finance configuration, branches, warehouses, access grants, price catalogue, specialisation definitions, permission baseline plus responsibility transfers, the owner account and invite, and a version-1 snapshot.

**Key properties.**
- The browser previews with **the same `validateDraft` the server refuses with**.
- The owner can actually sign in — ✅ walked; *this closed a four-phase hole where owners created by Add Workshop got a 401 forever.*
- Plan ceilings refuse the branch, warehouse or seat beyond the limit and **name the actual limit** — ✅ integration-verified, including that deactivation frees the seat.
- Responsibility answers produce real `RolePermission` rows, so **no capability is switched on that nobody can operate**.

## GJ-7 · Capability change on a live tenant · ✅ PASSING

**Actual.** Preview → apply → audit. The validator **refuses** a profile that would strand a job. The preview states real impact (*"14 jobs are in Payment Pending; turning this off releases all of them"*). Gates owned by the removed capability are dropped; core gates kept. In-flight records follow the declared `existingRecordsPolicy`. A work order opened before the change is still interpreted against **the profile in force when it opened** (`resolveAsOf`).

## GJ-8 · Blocked job recovery · ⚠️ BLOCKED

**Intended.** A technician reports a blocker; someone clears it; work resumes.

**Actual.** `REPORT_BLOCKER → BLOCKED` works. **Nothing clears it.**

- `TechnicianWorkService.resolveBlocker` is implemented and tested — including the H1 concurrency fix — with **no controller route**.
- `workorders.branch.manage_blockers` is held by Branch Manager and **checked by nothing**.
- `no_open_blocker` is a **core Finish gate**, so the job cannot be finished.
- The only remaining exit is `BLOCKED → CANCELLED`, which is not what a blocker means.

**This is the most consequential blocked journey in the product: a reachable state that traps a real job.** Gap G-OPS-01.

## GJ-9 · Frozen tenant mid-flow · ✅ PASSING

Freeze shows an impact preview first; every staff login returns `tenant_unavailable` → `/tenant-frozen`, a deliberate dead end with **no freeze reason surfaced** (that is a commercial matter between platform and owner, not something a technician should read); **no data is lost**; reactivation resumes every job exactly where it stopped; both actions audited.

## GJ-10 · Analyst export · ✅ PASSING

The export re-runs **the same `build()` call the page renders** — not a second query that could drift — and streams real CSV. Gated twice: `analytics.export`, then the category against `Plan.allowedExports`. Every export writes a `LOW`-risk `analytics.export.generated` audit row.

**Verification.** Real-HTTP integration test (success + audit row, plan-category-denied, plan-empty, unauthenticated), a unit test for the serialiser, **and a recorded manual run** against the dev database as the seeded analyst pulling all five categories.

**Stated limitation.** No analytical page has a date-range filter yet, so an export reflects the server's default range — and the page says so.

## Journey summary

| Journey | Status | Blocker |
|---|---|---|
| GJ-1 Full repair | 🟡 | Task creation has no endpoint |
| GJ-2 Part return loop | ⚠️ | Four technician-side commands have no endpoint |
| GJ-3 Customer approval | ✅ | — |
| GJ-4 Partial payment | ✅ | — |
| GJ-5 External parts | 🟡 | No first-class intake control |
| GJ-6 Creation to first job | ✅ | — |
| GJ-7 Capability change | ✅ | — |
| GJ-8 Blocked job recovery | ⚠️ | **Blocker resolution has no endpoint** |
| GJ-9 Frozen tenant | ✅ | — |
| GJ-10 Analyst export | ✅ | — |

**Both blocked journeys and one partial close with the same class of work: give an existing, tested domain command an HTTP endpoint and a control.** That is the cheapest high-value work available in the product, and it is invisible to every test currently in CI.

---

# 07. Capability Model

**Deep reference:** [`docs/corpus/02_PRODUCT_SCOPE_AND_CAPABILITIES.md`](docs/corpus/02_PRODUCT_SCOPE_AND_CAPABILITIES.md) · **Source of truth:** `packages/shared/src/capabilities/registry.ts`

## 7.1 What makes this different from feature flags

A feature flag hides a button. A capability **declares what the business process becomes without it** — and that declaration is machine-checked.

```
capability  = "this workshop's business model includes an inventory"
permission  = "this user may issue a part from the inventory"
policy      = "when a part is issued, must a second person approve it?"
```

Five statuses, not a boolean: `ENABLED` · `DISABLED` · `READ_ONLY` · `EXTERNAL` · `LOCKED`.

**`EXTERNAL` is the one that earns the model its keep.** A workshop issuing legal invoices from separate accounting software is `EXTERNAL` for `BILLING`, not `DISABLED` — MOP must still record the reference and may still gate delivery on it.

**An absent key means `ENABLED`.** A profile records deviations. Reading absent as *disabled* would silently strip every capability from a tenant whose provisioning half-finished — which is why `isCapabilityActive()` is one function rather than three independent derivations.

## 7.2 The twelve capabilities

All twelve are 🟦 **INTEGRATED** with complete removal policies and ✅ **VERIFIED** against every shipped profile in CI.

| Capability | Owning system | Depends on | Gates owned | States disabled | Without it, the workshop… | Runtime consumers beyond the graph |
|---|---|---|---|---|---|---|
| `MULTI_BRANCH` | Operations | — | — | — | has one location; branch comparison sections are **absent, not empty** | onboarding, structure stage |
| `MULTI_WAREHOUSE` | Inventory | `INVENTORY` | — | — | keeps all stock in one store; no transfer step is ever asked for | onboarding, progress |
| `INVENTORY` | Inventory | — | `parts.received_used_or_returned` | `WAITING_PARTS` | buys parts for the job; a parts wait becomes a **blocker** | 15 sites incl. analytics, export, resolver layer |
| `PART_RETURNS` | Inventory | `INVENTORY` | `parts.no_pending_return` | `RETURN_REQUESTED`, `RETURN_ACCEPTED`, `RETURNED_TO_STOCK` | consumes issued parts; a mistake is a stock **adjustment** | resolver layer |
| `EXTERNAL_PARTS` | **Operations** | — | `parts.external_resolved` | — | assumes every part came from the workshop | graph + gate only |
| `TEAMS` | People | — | — | — | has technicians reporting to the branch manager directly | onboarding, responsibility |
| `TEAM_REVIEW` | People | `TEAMS` | `review.team_review_passed` | `READY_FOR_TEAM_REVIEW` | sends finished work straight onward | graph + gate only |
| `QC` | Operations | — | `qc.passed` | `READY_FOR_QC`, `QC_FAILED` | moves finished work straight on | journey service |
| `CUSTOMER_PORTAL` | Operations | — | **none, deliberately** | `SENT`, `VIEWED`, `PARTIALLY_RESPONDED` | records the customer's answer **at the counter**, same audit weight | portal controller |
| `FINANCE_CORE` | Finance | — | `payment.settled_or_policy_allows` | `PAYMENT_PENDING` | runs **External Finance Mode** — money entirely outside MOP | finance service, onboarding |
| `BILLING` | Billing | `FINANCE_CORE` | `invoice.issued` | — | runs **External Billing Mode** — MOP keeps the money, the document comes from accounting software | billing service |
| `QUICK_INSPECTION` | Operations | — | — | — | uses the full inspection form every time | forms registry |

## 7.3 ⚠️ Capabilities whose behaviour is graph-only

**A required honesty check: do not call configuration "behavioural" unless code proves the behaviour.**

`TEAM_REVIEW` and `EXTERNAL_PARTS` have **no runtime consumer outside the registries, graph and gate registry.** That is **not a defect** — for these two, the graph *is* the behaviour: `requires: ["TEAM_REVIEW"]` on four edges, and `parts.external_resolved` in the gate registry, are exactly how removal takes effect.

The distinction that matters: a capability with neither a graph edge nor a gate nor a service consumer *would* be decorative. **None is.** Every one of the twelve produces at least one of: a guarded edge, an owned gate, a disabled state, or a named service consumer.

## 7.4 The removal policy — why "off" is never enough

Every non-core capability declares:

| Field | Answers |
|---|---|
| `behavior` | `REROUTE` · `DROP_STEP` · `EXTERNALIZE` · `READ_ONLY` · `BLOCK_NEW_ENTRIES` |
| `statesToDisable` | Which states become unenterable |
| `addTransitions` | Replacement edges keeping the graph connected |
| `gatesToDrop` / `gatesToKeep` | Which checks die, which survive |
| `existingRecordsPolicy` | `PRESERVE_READ_ONLY` · `MIGRATE_TO_TERMINAL` · `REQUIRE_MANUAL_RESOLUTION` |
| `orphanedRolePolicy` | `HIDE_ROLE` · `READ_ONLY_ROLE` · `REQUIRE_REASSIGNMENT` |
| `customerSafeMessage` | Replacement customer-facing wording |

**Three worked examples that show the model doing real work:**

**`INVENTORY` — the case that proves it.** Dropping `parts.received_used_or_returned` is not a convenience; leaving it strands *every* job. No replacement edge is needed because a parts wait becomes `BlockerReason.WAITING_PART` and `IN_PROGRESS ↔ BLOCKED` already exists unguarded. The customer hears: *"We are waiting for a required part. The branch will update you when it arrives."*

**`CUSTOMER_PORTAL` — the step is core, the channel is optional.** Removal adds `PENDING → RESOLVED` ("approval recorded at counter by staff") and `PENDING → EXPIRED`. Without them every decision request strands at `PENDING` and **no work could ever be approved**. Correspondingly, `customer_decisions_resolved` and `critical_warning_acknowledged` are **core gates with no owner**.

**`FINANCE_CORE` — `EXTERNALIZE`.** `PAYMENT_PENDING` becomes unenterable, and two replacement edges route finish and review-passed straight to `READY_FOR_DELIVERY`, because delivery must stay reachable.

## 7.5 Gate ownership — the bug that created the rule

**A gate belongs to the capability that produces the thing it checks, and dies with it.**

This is not tidiness. Before gates had owners they were free strings inside each removal policy, which made two things possible: a typo (`qc.pased`) silently creating a gate nothing satisfies, and two capabilities disagreeing about a shared gate. **The second already happened** — with Inventory and Part Returns both removed, one dropped `parts.received_used_or_returned` and the other kept it, resurrecting a check nothing could satisfy and **stranding every job in the workshop.**

| Checkpoint | Gate | Owner |
|---|---|---|
| **Finish** | `inspection_completed` | core |
| | `approved_work_completed` | core |
| | `customer_decisions_resolved` | core |
| | `critical_warning_acknowledged` | core |
| | `no_open_blocker` | core |
| | `parts.received_used_or_returned` | `INVENTORY` |
| | `parts.no_pending_return` | `PART_RETURNS` |
| | `parts.external_resolved` | `EXTERNAL_PARTS` |
| | `review.team_review_passed` | `TEAM_REVIEW` |
| | `qc.passed` | `QC` |
| **Delivery** | `invoice.issued` | `BILLING` |
| | `payment.settled_or_policy_allows` | `FINANCE_CORE` |

Every gate carries **both** a `blockedMessage` and a `satisfiedMessage`, because a checklist shows passed rows next to failed ones — added after a technician read *"Complete the inspection before finishing."* directly above *"parts received used or returned"*, half the list in English and half in database.

## 7.6 The change pipeline

```
draft → validate (reachability — REFUSES, not warns) → live-data preconditions
      → impact preview → apply (one transaction) → audit → rollback available
```

`GET /platform/workshops/:id/capabilities` · `POST …/preview` · `POST …/apply`

Validation codes: `MISSING_DEPENDENCY` · `CONFLICT` · `CORE_CAPABILITY_DISABLED` · `STRANDED_STATE` · `DISABLED_STATE_REACHABLE` · `UNKNOWN_STATE_REFERENCE` · `TERMINAL_UNREACHABLE` · `GATE_NOT_OWNED`.

## 7.7 Historical interpretation

`TenantCapability` rows are **time-ranged, never overwritten**. `CapabilityResolutionService.resolveAsOf()` interprets a work order against the profile in force **when it opened** — consumed by `WorkOrderDossierService`, so the dossier drawer shows the workshop shape that applied at the time. ✅ Verified.

## 7.8 Capability implementation status

| Element | State |
|---|---|
| Model, five statuses, `isCapabilityActive` | ✅ |
| 12 definitions with complete removal policies | ✅ |
| Gate registry with ownership + both message forms | ✅ |
| Reachability validator, all shipped profiles | ✅ |
| Change pipeline draft→preview→apply→audit | 🟦 |
| Historical resolution | 🟦 ✅ |
| Capability set at creation | 🟦 |
| **Builder Control's broader scope** (theme, layouts, role experience, workflow policy, permission matrix, version rollback) | 🔴 |

---

# 08. Policy Model

**Deep reference:** [`docs/corpus/04_POLICY_SYSTEM.md`](docs/corpus/04_POLICY_SYSTEM.md) · **Source:** `packages/shared/src/policies/registry.ts`

## 8.1 The mechanical test

> **A policy may never change reachability.** If a setting could change whether a work order reaches a terminal state, it is a mis-classified capability.

✅ Proven by `graph-safety.ts` for *every option of every policy that appears on an edge*, across every shipped profile.

## 8.2 The anti-stub mechanism

Every policy declares `enforcement: { status, where, consumers[] }`.

- `ENFORCED` — **requires** a list of real `Service.method` consumers, asserted against the source tree by `policy-consumers.spec.ts` in CI.
- `RECORDED` — the row is real, audited and time-ranged the moment it is written, but nothing reads it yet. `consumers` is empty, and **the onboarding UI says so**.

**All 16 shipped policies are `ENFORCED` with named, existing consumers.** ✅ There are currently **no** documentation-only or unwired policies.

## 8.3 The complete policy inventory

| Policy | Question | Options (default **bold**) | Mutability | Depends on | Real runtime consumer | State |
|---|---|---|---|---|---|---|
| `INSPECTION_REQUIRED` | May a customer decline inspection? | **`CUSTOMER_MAY_DECLINE`** · `ALWAYS_INSPECT` | GOVERNED | — | `WORK_ORDER_GRAPH` edge + `routingContext` | ✅ |
| `APPROVAL_REQUIRED_SCOPE` | Which work needs approval? | `ALL_WORK` · **`BEYOND_INITIAL_SCOPE`** · `CRITICAL_ONLY` | GOVERNED | — | graph edge + `routingContext` | 🟡 see below |
| `TECHNICIAN_DIRECT_SEND` | May a technician send work onward directly? | **`DIRECT`** · `REVIEW_REQUIRED` | GOVERNED | `TEAM_REVIEW` | graph edge + `routingContext` | ✅ |
| `QC_MANDATORY` | QC for every job, or only risk-flagged? | **`MANDATORY_ALWAYS`** · `RISK_FLAGGED_ONLY` | GOVERNED | `QC` | two graph edges + the per-job fact | ✅ |
| `DELIVERY_BLOCKED_UNTIL_PAID` | Does an unpaid balance hold the car? | `ALWAYS` · **`NEVER`** · `REQUIRES_OVERRIDE` | GOVERNED | `FINANCE_CORE` **incl. EXTERNAL** | `GateEvaluatorService.check` | 🟡 see below |
| `PARTIAL_PAYMENT` | May a customer pay part? | **`ALLOWED`** · `FULL_ONLY` | GOVERNED | `FINANCE_CORE` | `FinanceService.recordPayment` | ✅ |
| `DISCOUNT_AUTHORITY` | Who may approve a discount? | `NONE` · `ANY_STAFF_UNLIMITED` · **`THRESHOLD_THEN_APPROVAL`** · `ALWAYS_APPROVAL` | GOVERNED | `FINANCE_CORE` | `enforceDiscountAuthority` + 3 more | ✅ |
| `UNCOVERED_COUNTRY_BILLING` | No adapter for this country? | **`WARN_ONLY`** · `BLOCK` · `BLOCK_WITH_OVERRIDE` | GOVERNED | `BILLING` | `BillingService.issueDocument`, `issueInvoice` | 🟡 see below |
| `PARTS_SEPARATION_OF_DUTIES` | May the requester approve? | **`NOT_ENFORCED`** · `DIFFERENT_PERSON` · `ROLE_SEPARATED` | GOVERNED | `INVENTORY` | `PartRequestService.approve` | ✅ |
| `RETURN_UNUSED_BEFORE_FINISH` | Must every issued part be accounted for? | **`REQUIRED`** · `WARN_ONLY` · `NOT_REQUIRED` | GOVERNED | `INVENTORY` | `GateEvaluatorService.suppressedByPolicy` | ✅ |
| `APPROVAL_WEIGHT` | Does every decision carry the same weight? | `SINGLE_WEIGHT` · **`TWO_TIER`** | GOVERNED | — | `CustomerDecisionService.applyAnswers` | ✅ |
| `PORTAL_COUNTER_APPROVAL` | May staff record a verbal answer? | **`ALLOWED_ATTRIBUTED`** · `ALLOWED_WITH_EVIDENCE` · `PORTAL_ONLY` | GOVERNED · **CORE posture** | — | `CustomerDecisionService.recordOnBehalf` | ✅ |
| `CUSTOMER_INVOICE_VISIBILITY` | Are prices shown before approval? | **`SHOWN`** · `HIDDEN` | GOVERNED | `FINANCE_CORE` | `pricingVisible`, `writeFinanceConfiguration` | ✅ |
| `TIME_TRACKING` | Off, optional or required? | `OFF` · **`OPTIONAL`** · `REQUIRED` | **FREELY** | — | `TechnicianWorkService.completeTask` | ✅ |
| `POST_CLOSE_ADDENDA` | May anything be added after close? | `NOTHING` · **`APPEND_ONLY_NOTES`** | GOVERNED | — | `WorkOrderDossierService.addNote` | ✅ |
| `WORKING_WEEK` | Which days are the working week? | **`FROM_COUNTRY`** · `SEVEN_DAY` | **FREELY** | — | `weekendDaysFor`, `slaOverruns`, `workingHoursBetween`, `rankAttentionItem` | ✅ |

## 8.4 The three honest partials

These are **not** hidden gaps — the option exists, behaves conservatively, and the shortfall is written into the registry:

| Policy | The partial |
|---|---|
| `DELIVERY_BLOCKED_UNTIL_PAID` | `REQUIRES_OVERRIDE` **blocks like `ALWAYS` today.** The audited release action is Governance Controls' work and is unbuilt. It fails safe rather than silently behaving as `NEVER`. |
| `UNCOVERED_COUNTRY_BILLING` | `BLOCK_WITH_OVERRIDE` refuses; the platform exception is unbuilt. |
| `APPROVAL_REQUIRED_SCOPE` | Routing is real, but **the scope-delta comparison is not built** — staff still choose which items are decision-worthy rather than deriving it from what the customer agreed at intake. |

## 8.5 Policies that touch the graph — and the contradiction one of them fixed

Four policies appear on edges. `TECHNICIAN_DIRECT_SEND` is worth understanding because it repaired a real logical contradiction:

> Finish edges are ordered review → QC → invoicing and the router takes the first live match. So with `TEAM_REVIEW` on, review was **unconditionally forced**, and there was no way to express this policy's own declared default of `DIRECT`. **The capability meant "review is compulsory" when the policy said it should mean "review is available."**

Placing the condition on the `TEAM_REVIEW`-requiring edge (rather than the two below it) also satisfies the invariant *policies on edges declare their capability* — so an answer cannot outlive the capability that gives it meaning.

## 8.6 The per-record fact — the product's only one

`QC_MANDATORY = RISK_FLAGGED_ONLY` needs `work_order.has_critical_fault`, computed from **this job's own `Fault` rows** on every routing call. Unlike capability and policy guards, which are true or false for the whole tenant, a fact can only be evaluated with a specific record in hand — which is why the router takes it as a **third, separate input**.

**A missing fact is treated as false** — conservative in both directions: a job is never assumed risk-flagged, and never assumed exempt, on data nobody computed.

## 8.7 Relevance, and why it is trustworthy

Policies declare `dependsOnCapabilities` and `dependsOnPolicies`; a plain predicate decides whether the question is meaningful. Two safeguards:

1. **The relevance graph is proven acyclic.** Four real cycles were found and fixed when it was first built.
2. **A predicate cannot read an undeclared dependency.** `isPolicyRelevant` scopes `priorAnswers` to exactly the declared keys, so a predicate reading an undeclared key finds it *absent*. Without this the declared graph would be a lie and the acyclicity proof would be checking the wrong thing.

**The `relevantUnder` escape hatch** exists for one case: `DELIVERY_BLOCKED_UNTIL_PAID` is relevant when `FINANCE_CORE` is *any* status but `DISABLED` — **`EXTERNAL` included**, because a workshop running External Finance Mode still hands cars back and MOP still decides whether a balance holds one.

## 8.8 What is deliberately **not** a policy

| Candidate | Verdict |
|---|---|
| "This workshop has no inventory" | **Capability** — changes reachability |
| "Only the owner may approve discounts" | **Permission**, shaped by `DISCOUNT_AUTHORITY` |
| "Default VAT rate" | **Configuration value** — no option set, no behavioural branch |
| "Attention-queue sort order" | Neither — derived from data |
| Invoice number format | Would be a policy, and `IMMUTABLE_AFTER_FIRST_USE`. Not yet in the registry |

## 8.9 Policy implementation status

| Element | State |
|---|---|
| Model: options, defaults, mutability, relevance, impact, enforcement | ✅ |
| 16 policies, all `ENFORCED` with existing consumers | ✅ |
| Reachability safety across all options × profiles | ✅ |
| Relevance graph acyclic | ✅ |
| Time-ranged persistence + `policy.changed` / `policy.expired` audit | 🟦 |
| Answers chosen at creation | 🟦 |
| **Owner-facing post-creation policy editor** | 🔴 |
| **Override actions** (`REQUIRES_OVERRIDE`, `BLOCK_WITH_OVERRIDE`) | 🔴 |
| **Scope-delta derivation** | 🔴 |
| The remaining ~54 decisions in `POLICY_DECISION_INVENTORY.md` | 🔵 documented with a verdict each; **no implementation, by design** |

---

# 09. Specialisation Model

**Deep reference:** [`docs/corpus/03_SPECIALIZATIONS_AND_WORKSHOP_PROFILES.md`](docs/corpus/03_SPECIALIZATIONS_AND_WORKSHOP_PROFILES.md)

## 9.1 Purpose, and its honest limit

A specialisation is **vocabulary and record shape**, not behaviour. A brake measurement and an oil change are not the same shape of record; a workshop forced to squeeze one into the other stops recording it.

> ⚠️ **Required honesty statement.** Specialisation today is **metadata plus validation, not functional differentiation.** Definitions are real, versioned and validated; packs create real rows at creation. **No page fills one in.** Do not describe MOP as delivering specialisation-driven runtime behaviour — it delivers specialisation-driven *record structure* with no consuming surface.

## 9.2 The primitive

`SpecializationDefinition` — a workshop-authored *shape to fill in*: a named set of typed fields (`TEXT` · `DECIMAL` · `ENUM` · `BOOLEAN`), stored as `Json` because a field list is authored and read as one unit. `kind` is `SERVICE_CARD` or `MEASUREMENT_FORM`, which changes nothing about storage — it exists only so a page can ask for one separately from the other.

**The invariant that makes old records honest:** `version` bumps when `fields` changes, and `SpecializationEntry` **pins** `definitionVersion`. An entry is never silently reinterpreted against a newer shape.

## 9.3 The seven packs

Offered only for the workshop's `CategoryCode`, so an irrelevant pack is never shown.

| Pack | Categories | What it is |
|---|---|---|
| `QUICK_SERVICE` | Cars, Motorcycles | Oil, filters, fluids |
| `BRAKES_AND_SUSPENSION` | Cars, Motorcycles | Measured wear per wheel — the readings that decide replace-or-pass |
| `DIAGNOSTICS` | all three | Codes and readings **are** the deliverable |
| `ELECTRICAL` | all three | Charging, starting, parasitic draw |
| `FIELD_SERVICE` | Heavy equipment | On-site work; pressures and hours are the record |
| `TYRES_AND_WHEELS` | all three | Tread and pressure per wheel, comparable over time |
| `BODY_AND_PAINT` | Cars, Motorcycles | Panel, colour code, coats — what a comeback is judged against |

Worked example — `BRAKES_AND_SUSPENSION` ships a per-wheel pad form (`pad_fl`, `pad_fr`, `pad_rl`, `pad_rr` in mm, plus a `disc_min_spec` boolean), which is exactly the *same reading, four positions* case `PositionTaxonomyEntry` exists for.

## 9.4 Relationship to the other axes

| | Decides | Can change reachability | Consuming surface today |
|---|---|---|---|
| Capability | Whether a step exists | **Yes** | Many |
| Policy | The rule a step runs under | Never | 16 named consumers |
| **Specialisation** | **What shape of record the work produces** | **No** | 🟠 **none** |
| Custom field | Extra data on a fixed form | No | 🟠 **none** |

## 9.5 Supporting primitives

| Entity | State |
|---|---|
| `PositionTaxonomyEntry` — "where on the asset"; `tenantId: null` is the platform default per category, tenant rows override | 🟢 model, 🟠 no consumer |
| `CredentialDefinition` / `StaffCredential` — required qualifications and who holds them | 🟢 model, 🟠 no surface |
| `BlockerReasonDefinition` — the workshop's own blocker vocabulary | 🟢 model, 🟠 no production access at all |

## 9.6 The seven shipped capability profiles

A profile is a **starting point**, not a type — nothing at runtime asks "which profile is this tenant". Capabilities not listed are `ENABLED`.

| Profile | Deviations |
|---|---|
| `MULTI_BRANCH_FULL_SERVICE` | none — everything on |
| `SINGLE_BAY_QUICK_SERVICE` | no multi-branch/warehouse, no inventory, no returns, no teams, no review, no QC; `EXTERNAL_PARTS` explicitly on |
| `DIAGNOSTICS_ONLY` | as above **plus** `EXTERNAL_PARTS` off — sells the answer, not the repair |
| `HEAVY_EQUIPMENT_FIELD_SERVICE` | no multi-branch, no review, **no portal** |
| `MOTORCYCLE_WORKSHOP` | no multi-warehouse, no teams, no review, no QC |
| `EXTERNAL_BILLING` | `BILLING: EXTERNAL` |
| `EXTERNAL_FINANCE` | `FINANCE_CORE: EXTERNAL`, `BILLING: EXTERNAL` |

✅ Every profile is validated in CI, so a lifecycle-graph change can never silently strand one of the standard shapes.

## 9.7 Remaining work

| Item | State |
|---|---|
| Definitions, versioning, pinned entries, validation | ✅ |
| Packs creating real definitions at creation | 🟦 |
| **A technician-side page that fills a card in** | 🔴 — the single missing piece; closes both this and Forms |
| `reviseFields`, `fillEntry`, `entriesFor` | 🟠 implemented and tested, **no production caller** |
| Phase 17.B–E, wizard UI beyond 17.A | 🔴 |

---

# 10. Role & Responsibility Model

**Deep reference:** [`docs/corpus/05_RESPONSIBILITY_AND_ROLE_MODEL.md`](docs/corpus/05_RESPONSIBILITY_AND_ROLE_MODEL.md)

## 10.1 The five words, disambiguated

| Word | Question | Decided by | Stored as |
|---|---|---|---|
| **Capability** | Does this kind of work exist here? | Super Admin | `TenantCapability` |
| **Policy** | What rule does it run under? | Super Admin at creation | `WorkshopPolicy` |
| **Role** | What job does this person hold? | The workshop, when inviting | `StaffUser.role` |
| **Permission** | May this account perform this action? | 11 resolver layers | `RolePermission`, `UserPermissionOverride` |
| **Responsibility** | Which role **covers** the work a capability creates *here*? | Super Admin, creation stage 6 | Real `RolePermission` rows |

## 10.2 The seven staff roles

| Role | Pages | Money authority | Workflow authority | Data visibility | Notable denials |
|---|---|---|---|---|---|
| **TENANT_OWNER** | 8 | **Full** — configure, issue, take payment, decide refunds and discounts | **Read-only** on operations | Company-wide | Cannot book in, reassign, or record a decision |
| **TENANT_ADMIN** | 8 (mirrors Owner) | **None writing** — view invoices only | Read-only | Company-wide | ❓ The specs do not distinguish Admin from Owner; page set mirrors Owner *honestly rather than guessing* |
| **BRANCH_MANAGER** | 7 | May **request** refunds and discounts | Intake, blockers, delivery release, review **and** QC | Own branch | `finance.invoice.issue`, `payment.record`, `refund.decide`, `discount.decide` all explicit **`false`** |
| **TECHNICIAN** | 3 | **None** | Inspect, fault, blocker, part request, finish | Own assignments only | `finance.running_invoice.add_line` and `discount.request` explicit **`false`** — delegated deliberately |
| **INVENTORY_MANAGER** | 6 | **None** | Approve/reject/issue parts, accept returns | Stock and requests | `inventory.cost.view` explicit **`false`** — *managing the catalogue does not imply seeing margin* |
| **TEAM_LEADER** | 4 | **None — asserted by test** | Review decisions | `managedTechnicianIds` only | Rework and QC are a **link, never an action** |
| **DATA_ANALYST** | 7 | **None — asserted by test** | None (read-only) | Company-wide, money-free | No customer-identifying field in decision analytics |

**Explicit `false` entries are documentation, not redundancy.** Omitting the key would already deny it; writing `false` records that the denial is *deliberate*, with a comment naming the spec section that requires it.

## 10.3 The two roles that are not `StaffRole`

**Platform Super Admin** — an `AccountType: PLATFORM` account behind `PlatformGuard`, which **deliberately bypasses the resolver** because every layer defers with no `tenantId` and, per spec, Super Admin has unconditional control. Quality bar: *no destructive action without knowing precisely who it affects, in advance.*

**The Customer** — an `AccountType: CUSTOMER` account, plus the token path needing no account at all. 🟠 The resolver has no real opinion about a customer session; access is checked on `session.accountType`.

## 10.4 Responsibility — the hole that had no name

Turning on `INVENTORY` gives a workshop part requests gated behind `inventory.*` permissions that, in the platform baseline, **only `INVENTORY_MANAGER` holds**. `TENANT_OWNER` holds none of them.

So a one-bay workshop that enabled Inventory and never hired a storekeeper got a capability **nobody in the building could operate**: the technician raises a part request and there is no account on earth permitted to approve it. **Nothing in the product refused that configuration, because nothing in the product asked the question.**

Creation stage 6 asks it. Two guard rails:

1. **It never invents a permission or a role.** Every key transferred is one the dedicated role already holds, moved to a role the same map already treats as senior.
2. **One question stands regardless of its capability** — Branch Manager work is not multi-branch work; it is what running the one branch every tenant has means.

## 10.5 Delegation — the owner's own switch

Most permissions answer *may this role do X*. A delegated permission answers something **first**: *has the owner chosen to let anyone but themselves do X at all?*

| Permission | Switch | Denied reason |
|---|---|---|
| `team_setup.branch.manage` | `team_setup.delegate` | *Team management has not been delegated by the workshop owner* |

**All delegation switches are off by default**, and a delegated key is denied **whatever the role template or user override says**. That is why Branch Manager carries the key as `true` and still cannot manage teams — and why the rail entry is **absent, not locked**: a greyed control invites a support ticket; an absent one does not exist.

## 10.6 Who does what — the responsibility map

Roles in brackets are the fallback when the dedicated role does not exist.

| Event | Actor |
|---|---|
| Book the vehicle in | Branch Manager |
| Inspect, record findings | Technician |
| Raise a decision | Technician |
| Answer the decision | Customer — or Branch Manager on their behalf, attributed to staff |
| Request a part | Technician |
| Approve / issue / refuse a part | Inventory Manager *(Owner, via responsibility transfer)* |
| **Accept a returned part** | Inventory Manager — **only they can raise stock** |
| Report a blocker | Technician |
| **Clear a blocker** | Branch Manager — ⚠️ **no control exists** |
| Review finished work | Team Leader *(Branch Manager)* |
| Pass or fail QC | Branch Manager |
| Approve a discount above threshold | Owner *(Branch Manager may request)* |
| Issue the invoice / take payment | Owner *(delegable)* |
| Release the vehicle | Branch Manager, subject to the Delivery Gate |
| Change the workshop's shape | **Platform Super Admin only** |

## 10.7 Role implementation status

| Element | State |
|---|---|
| 7 roles with page sets and baseline permissions | ✅ |
| Delegation registry + layer | 🟦 (one switch) |
| Responsibility questions at creation | 🟦 |
| Staff invite / scope / activate / lock in one transaction | 🟦 |
| Plan seat ceilings enforced on an ongoing basis | ✅ |
| `TENANT_ADMIN` distinguished from Owner | ❓ mirrors Owner — the specs do not distinguish them |
| Customer sessions in the resolver | 🟠 |
| Exit reason / rehire eligibility | 🔴 named in Phase 10, pushed to Phase 19 |
| "Who Can Handle Money" per-role money delegation | 🔴 blocked on the platform-lock mechanism |

---

# 11. Page Catalog & Page Reality

**Canonical status tracker:** [`docs/PAGE_INVENTORY.md`](docs/PAGE_INVENTORY.md) — this section extends it with page ids, dependencies and the *supposed-to-contain vs actually-contains* split. **Deep reference:** [`docs/corpus/15_PAGE_CATALOG.md`](docs/corpus/15_PAGE_CATALOG.md), [`docs/corpus/16_PAGE_FEATURE_MATRIX.md`](docs/corpus/16_PAGE_FEATURE_MATRIX.md).

**Totals: 47 ✅ · 6 🟡 · 0 unbuilt, of 53 specified.** The spec count is regenerable: `grep -c "^## PAGE:" docs/detailed-specs/*.md`.

## 11.1 Platform Super Admin — 6 pages (4 ✅, 2 🟡)

| Page | Route | Supposed to contain | Actually contains | State |
|---|---|---|---|---|
| **Workshop Creation** | `/platform/workshops/new` | A journey that defines a workshop's operating model | All nine stages; one-transaction creation writing capabilities, policies, finance config, structure, prices, specialisations, permissions, owner + invite, v1 snapshot. Browser previews with the **same validator** the server refuses with | ✅ |
| **Workshops** | `/platform/workshops` | List, detail, lifecycle control | Server-side paging/sort/filter, details drawer, freeze/reactivate **with impact preview**, compliance badge from `compliantBlocked` | ✅ |
| **Control Center — Governance** | `/platform/control-center` | Per-role permission locks, tenant lifecycle | Set/remove locks (**both audited, both requiring a written reason**), lock history, archive/reactivate | ✅ |
| **Builder Control** | `/platform/workshops/:id/capabilities` | Theme, page layouts, role experience, workflow policy, permission matrix, config version rollback | **Capability shaping only** — read profile, preview impact, apply. No page named "Builder Control" exists as such | 🟡 |
| **Platform Reports** | `/platform/reports`, `/reports/:id` | Six sections across two levels | Level 1 aggregate + per-workshop cards; Level 2 **Usage Overview only**. Feature Usage, Builder Adoption, Operational Activity, Commercial Snapshot, Health & Risk are **named as owed, not shipped as empty tabs** | 🟡 |
| **Workshop Live View** | `/platform/live-view` | Cross-tenant activity | Auto-refreshing, real endpoint, **counts and event kinds only — never payload** | ✅ |

> **Historical correction worth keeping:** two of this project's own archived audits claimed Governance Controls and Live View were unbuilt. A direct code read found both real and working. **Treat any status claim in `docs/archive/` as stale until checked against code.**

## 11.2 Branch Manager — 7 pages (7 ✅)

| Page | Route | Actually contains | Dependencies |
|---|---|---|---|
| Attention Center | `/branch/attention` | Ranked queue (not a list) + watch-list counts derived from the same items, so the two cannot disagree | `WORKING_WEEK` |
| Customer Intake | `/branch/intake` | Search, branch picker, book in | `MULTI_BRANCH`, `INSPECTION_REQUIRED` |
| Work Orders board | `/branch/work-orders` | Lanes derived from the **effective** graph | `QC_MANDATORY`, `TECHNICIAN_DIRECT_SEND` |
| Work Order Workspace | `/branch/work-orders/:id` | Detail, journey strip, dossier drawer (**historical capability shape**), append-only notes | `POST_CLOSE_ADDENDA` |
| Approvals & Decisions | `/branch/approvals` | Queue, detail, record-on-behalf | `PORTAL_COUNTER_APPROVAL`, `APPROVAL_WEIGHT`, `CUSTOMER_INVOICE_VISIBILITY` |
| Delivery & Payments | `/branch/delivery` | Ready queue, Delivery Gate, release | `DELIVERY_BLOCKED_UNTIL_PAID` |
| Team Setup | `/branch/team` | Create team, assign leader, move technician | `TEAMS` + **delegation** — rail entry **absent, not locked** |

⚠️ **Two controls the role is permitted to perform and cannot:** technician reassignment (`workorders.branch.reassign_technician`) and blocker clearing (`workorders.branch.manage_blockers`). Both permissions exist; **neither has an endpoint.**

## 11.3 Technician — 3 pages (3 ✅)

| Page | Route | Actually contains |
|---|---|---|
| Now | `/tech` | The current job — *what am I doing right now* |
| My Work | `/tech/work` | Everything assigned |
| Work Card | `/tech/card/:id` | Journey strip, vehicle history, task start/complete (+minutes under `TIME_TRACKING`), inspection, fault, decision raise, blocker report, parts catalogue, request/receive/use, **finish checklist preview**, finish |

⚠️ **Missing controls behind this page:** create task · resolve blocker · request return · reply to clarification · mark arrived · resolve rejected return · fill a specialisation card · capture a custom field.

## 11.4 Inventory Manager — 6 pages (6 ✅)

| Page | Route | Actually contains |
|---|---|---|
| Inventory Home | `/inventory/home` | Seven triage cards, per-warehouse breakdown, each a link into the queue that resolves it |
| Technician Requests | `/inventory/requests` | Approve · reject · unavailable · issue (partial fulfilment supported) |
| POS / Catalog Control | `/inventory/catalog` | Paginated list + side-panel editor. **Cost absent unless `inventory.cost.view`; quantity deliberately not settable here** |
| Quantity Control & Stock | `/inventory/stock` | Five-bucket balances; warehouse deactivate/reactivate (`BLOCK_UNTIL_ZERO`) |
| Returns / Movements | `/inventory/returns` | Accept · reject · clarify with the clarify↔reply loop, plus a tenant-wide filterable ledger |
| Reports & Stock Insights | `/inventory/reports` | **Velocity-based** risk per warehouse; comparison section **absent, not empty** for single-warehouse scope |

⚠️ **The Returns queue can only be filled by the demo seed** — the technician-side actions have no endpoints.

> Building the Returns page is what surfaced **two real backend bugs**: `RETURN_REJECTED` and `RETURN_CLARIFICATION_REQUESTED` existed in the enum with no graph edge reaching them, and `PartReturnRequest` was never written by `requestReturn`. That is the argument for vertical slices in one sentence.

## 11.5 Tenant Owner — 8 pages (4 ✅, 4 🟡)

| Page | State | What is real | The named missing piece |
|---|---|---|---|
| Owner Home | ✅ | Six cards, all links | — |
| Organization & Access | ✅ | Staff invite/scope/activate/lock **writing `Account.status` and the `StaffUser` mirror in one transaction**; branches (deactivation blocked while non-terminal work orders exist, **derived from `WORK_ORDER_GRAPH.terminal`**); warehouses + access matrix; Teams reusing Branch Manager's component verbatim via a token override | — |
| Messages & Templates | ✅ | All 8 templates, immutable per version, variable toolbar, live preview, Publish blocked naming the exact missing variable | *(no sending code exists product-wide — a system gap, not a page gap)* |
| Workflow Health | ✅ | 5 of 6 integrity checks, each a real query; bottlenecks, SLA buckets, rework loops | The 6th is **declared not computable**, not faked |
| Forms & Fields | 🟡 | Full authoring contract + `validateValues()` proven against the spec's own worked example | **No consuming UI captures any form's values** |
| Pricing & Financial Config | 🟡 | Service catalogue (effective-dated), tax, discounts, payment methods, invoice settings, delivery gate | **"Who Can Handle Money"** — needs the platform-lock mechanism |
| Reports & Analytics | 🟡 | 5 tabs, one date-range contract, real historical calculation, honest nulls | Per-role report visibility; Service/Staff as separate tabs |
| Audit & Change History | 🟡 | Filterable, inline diffs, tenant isolation asserted in the query | **Rollback**; workshop-timezone timestamps |

## 11.6 Team Leader — 4 pages (4 ✅)

Home (5 triage cards) · Technicians View (roster + drawer with the supervision note **never shown to its subject**) · Vehicles/Work Orders (**no price, cost or payment field anywhere — asserted by test**) · Performance Reports (managed scope only).

⚠️ `team.issue.flag_to_branch_manager` has no endpoint.

## 11.7 Data Analyst — 7 pages (7 ✅)

Home (**composes** the other five services' headline numbers rather than recomputing, so a tile cannot drift from its page) · Operations · People (**no money field — asserted by test**) · Inventory (reuses `InventoryReportsService`; value gated on `inventory.cost.view`) · Decisions (**no customer-identifying field — asserted by test**) · Feature Adoption (**reports custom fields and templates as "not trackable yet"**) · Saved Views / Exports.

🔴 No analytical page has a date-range filter, so exports reflect the server default range.

## 11.8 Customer Portal — 6 pages (6 ✅)

Portal Home (pending decisions lead when nonzero) · My Assets (**card grid, not a table** — most customers own one asset) · Current Service (🟡 **one plain-language phrase per job** where the spec asks for a full lifecycle strip; the API exposes status only, so the phrase is honest rather than a client-side fabrication) · Decision Page (`/decide/:token`, **public**) · Invoice & Payment Status (**server strings, no client arithmetic**) · Safe Technical History (labelled by plate/VIN from the customer's own asset list, **never a raw asset id**).

## 11.9 Shared system pages — 6 (6 ✅)

Login · Register · Invite Accept · Access Denied · Tenant Frozen (**deliberate dead end, no nav, no freeze reason surfaced**) · Password Reset.

## 11.10 Planned pages — not in the 53

Listed so nobody "discovers" them as missing.

| Page | For | Blocked by |
|---|---|---|
| Builder Control — Theme & Layout | Super Admin | Builder Control scope |
| Builder Control — Permission Matrix | Super Admin | **The platform-lock mechanism** |
| Builder Control — Config Version Rollback | Super Admin | Snapshots exist; nothing reads them |
| Platform Reports — 5 remaining sections | Super Admin | — |
| Owner — Who Can Handle Money | Owner | **The platform-lock mechanism** |
| **Inspection / specialisation recording** | Technician | The consuming half of Forms *and* Specialisation |
| Stock Reconciliation | Inventory Manager | Permission + movement type already exist |
| Warehouse Transfers | Inventory Manager | Model + enum + permission exist; no graph states |

**Three pages wait on one mechanism** — the platform lock. That is the highest-leverage unbuilt piece of infrastructure in the product.

## 11.11 Cross-cutting page rules

1. **Six states per surface** — loading, empty, error, restricted, partial, full. **Empty is valid and desirable**: an Attention Center with nothing in it is a good day.
2. **Absent, not empty** — a section with nothing meaningful does not render as a blank shell.
3. **Absent, not locked** — a control the user may never reach is not greyed out.
4. **Never leak by hiding** — restricted data is missing from the response.
5. **Scale shows in pagination, never layout.**
6. **No physical-direction CSS** — lint-enforced.
7. **One shell per role**, not one shell branching on role.
8. **A concept used by two roles lives in `domain/`** — one implementation, one presentation per role.

---

# 12. Feature Catalog & Feature Reality

**Deep reference:** [`docs/corpus/17_FEATURE_CATALOG.md`](docs/corpus/17_FEATURE_CATALOG.md)

Every feature is traced: **intent → capability → policy → permission → page → API → service → persistence → workflow → audit → test → status.**

## 12.1 Counts

| | Features |
|---|---|
| 🟦 Integrated and tested | 62 |
| 🟡 Partial | 9 |
| 🟠 **Implemented but not reachable** | **7** |
| 🔴 Planned | 27 |
| ⏸ / 🧪 | 3 |

## 12.2 The seven disconnected features — the priority set

| Feature | What exists | What is missing | Consequence |
|---|---|---|---|
| **Blocker resolution** | `resolveBlocker`, tested incl. the H1 race | endpoint + control | **A blocked job cannot be finished** |
| **Task creation** | `createTask` — the only writer of `Task` | endpoint + control | **Tasks exist only in the demo seed** |
| **Part return request** | `requestReturn` | endpoint + control | The Returns queue cannot be filled |
| **Clarification reply** | `respondToClarification` | endpoint + control | The loop has an ask and no reply |
| **Mark arrived** | `markArrived` | endpoint + control | A travelled part cannot be confirmed |
| **Resolve rejected return** | `resolveRejectedReturn` | endpoint + control | A rejected return cannot be closed out |
| **Technician reassignment** | permission only | everything | Orphaned permission |

## 12.3 Features by system — condensed reality

### Governance & Control
🟦 Workshop creation · capability shaping · freeze/archive · permission locks · plan ceilings · live view.
🟡 Tenant relationships — models, services and tests exist; **`grant`, `revoke`, `listFor`, `addMember`, `summary` have no production caller.**
🔴 Builder Control's broader scope.

### Identity & Access
🟦 Login/sessions (scrypt with **parameters encoded in the hash**, lazy rehash, timing-safe not-found path) · invite · non-enumerating password reset · self-registration · 11-layer resolver · delegation.

### Operations
🟦 Intake · board · workspace · dossier · journey strip · lifecycle · Finish Gate · Delivery Gate · inspection · fault · blocker report · task start/complete + time tracking · notes · attention ranking · vehicle history.
🟠 Blocker resolution · task creation · reassignment.
🟡 Asset ownership transfer — model and privacy rule real, no page performs one.

### Inventory
🟦 Catalogue · five buckets · movement ledger + `replay()` · request lifecycle · partial issue · receive/use · manager-side returns · warehouse deactivation · velocity risk.
🟠 Four technician-side commands.
⚠️ Four statuses read but never written.
🔴 Transfers · supplier orders · reconciliation page.

### Finance & Billing
🟦 Effective-dated pricing · chargeable items · running invoice · issuance · payment idempotency · discounts · refunds · credit notes · compliance blocking · compliance surfaced on the platform list.
🔴 **Country adapters** · Who Can Handle Money · customer-initiated payment · named rounding rule.
🧪 `getClearanceStatus`, `generateDebitNote` — seam methods, no production caller.

### People & Performance
🟦 Staff lifecycle · structure · teams · supervision notes · managed-scope reports.
🟠 Specialisation entry-filling · credentials · position taxonomy — all modelled and tested, no surface.
🔴 Exit reason / rehire eligibility.

### Customer
🟦 Six pages · token path · server-side critical acknowledgement · counter approval · policy-governed price visibility · sanitised timeline · safe history · 8 templates.
🔴 **Message sending, any channel** · full lifecycle strip · portal payment.
🟢 Journey freshness via a deliberate 20-second poll, **never optimistic**.

### Insights
🟦 Owner reports · 7 analyst pages · saved views · real CSV export · workflow health.
🔴 Date-range UI · per-role visibility · 5 platform report sections.

### Audit
🟦 Single lint-enforced writer · ~30 actions · filterable page with diffs · export auditing.
⚠️ Event vocabulary divergence · 🔴 `requestId` correlation · 🔴 rollback · 🔴 retention.

### Runtime
🟦 Boot-time config validation · rate limiting · money lint · per-request permission caching · scheduler advisory lock · health.
🟡 i18n/RTL mechanism without translated strings.
🔴 Push transport. ⏸ Separate worker process — deliberately deferred.

---

# 13. Subsystem Catalog

**Deep reference:** [`docs/corpus/18_SUBSYSTEM_CATALOG.md`](docs/corpus/18_SUBSYSTEM_CATALOG.md)

Consistent template: **purpose · owns · key services · dependencies · invariants · state · missing.**

## 13.1 The layering, and why it is named this way

`apps/api/src` is organised by **boundary, not file kind**. There is no `controllers/`, `services/`, `dtos/` — those say what a file *is*, the least interesting thing about it.

```
audit/         the AuditLog WRITE boundary
runtime/       config · database · health · http · scheduler
identity/      auth/ (sessions, guards) · access/ (resolver + 11 layers)
control/       capabilities · policies · governance · tenant-relationships · platform
systems/       operations · inventory · finance · billing · people · customer · forms
experiences/   branch-manager · technician · team-leader · owner
insights/      analytics · analyst-reporting · owner-reports · workflow-health
```

`audit/` stays top-level **because `tools/lint-audit-boundary.mjs` matches that literal path.** Moving it silently weakens the rule.

**Two directional rules:** `experiences/` never writes directly; `systems/` never imports `experiences/`.

## 13.2 Subsystem dependency graph

```mermaid
flowchart TB
    subgraph L1["experiences/ — composes downward, nothing depends on it"]
        EBM["branch-manager"]
        ETE["technician"]
        ETL["team-leader"]
        EOW["owner"]
    end
    subgraph L2["systems/ — the six bounded systems"]
        OPS["operations — the spine"]
        INV["inventory"]
        FIN["finance"]
        BIL["billing"]
        PEO["people"]
        CUS["customer"]
        FRM["forms"]
    end
    subgraph L3["control/ — the plane that shapes tenants"]
        CAP["capabilities"]
        POL["policies"]
        GOV["governance"]
        PLAT["platform"]
        REL["tenant-relationships — NO SURFACE"]
    end
    subgraph L4["identity/ + runtime/ + audit/"]
        ACC["identity/access — 11 layers"]
        AUTH["identity/auth"]
        DB["runtime/database"]
        AUD["audit — single writer, lint-enforced"]
    end
    INS["insights/ — read-only"]

    L1 --> OPS
    L1 --> INV
    L1 --> FIN
    L1 --> PEO
    OPS --> CAP
    OPS --> POL
    OPS --> AUD
    INV --> OPS
    FIN --> OPS
    BIL --> FIN
    CUS --> OPS
    FRM --> OPS
    PEO --> PLAT
    L2 --> DB
    L1 --> ACC
    ACC --> CAP
    ACC --> POL
    ACC --> GOV
    AUTH --> DB
    INS --> AUD
    INS --> L2
```

**Forbidden edges, enforced or reviewed:** `systems/` → `experiences/` · `experiences/` → any table · any service → `AuditLog` (**lint**) · any service → `WorkOrder.status` (convention) · `insights/` → operational writes · one system → another system's tables.

## 13.3 Subsystem reality table

| Subsystem | Owns | Key services | State | Missing |
|---|---|---|---|---|
| **audit/** | `AuditLog` | `AuditService` | ✅ | Retention |
| **runtime/config** | Env, boot validation | — | ✅ | — |
| **runtime/database** | `PrismaService` — the only Prisma access point | — | ✅ | — |
| **runtime/http** | Interceptors, `PresentedError` | — | ✅ | — |
| **runtime/scheduler** | Advisory lock, heartbeat | `SchedulerLockService` | ✅ | ⏸ separate worker |
| **identity/auth** | Sessions, tokens, guards | `AuthService`, `SessionGuard`, `PlatformGuard` | ✅ | MFA |
| **identity/access** | The resolver | `EffectiveAccessService`, `PermissionContextService`, 11 layer files | ✅ | Customer sessions |
| **control/capabilities** | `TenantCapability` | `CapabilityResolutionService` (incl. `resolveAsOf`), `CapabilityChangeService` | ✅ | — |
| **control/policies** | `WorkshopPolicy` | `PolicyResolutionService` | ✅ | Owner editor |
| **control/governance** | Locks, tenant lifecycle, restrictions, disputes | 4 services | 🟡 | `StaffRestrictionService` and `WorkOrderDisputeService` have **no surface** |
| **control/platform** | `Tenant`, `Plan`, onboarding, workshops, live view, reports, limits | 6 services | ✅ | Builder Control |
| **control/tenant-relationships** | Stakeholders, groups | 2 services | 🟠 | **No controller, no page** |
| **systems/operations** | Work orders, tasks, inspections, faults, blockers, assets, notes | `WorkOrderLifecycleService`, `GateEvaluatorService`, `WorkflowJourneyService`, `WorkOrderDossierService`, `IntakeService`, `TechnicianWorkService`, `ChargeableItemsService`, `OperationEventsService` | 🟡 | `createTask`, `resolveBlocker` doors |
| **systems/inventory** | Catalogue, balances, requests, movements, returns, warehouses | `CatalogService`, `StockService`, `WarehouseService`, `PartRequestService`, `InventoryReportsService` | 🟡 | 4 doors; transfers; supplier orders |
| **systems/finance** | Pricing, running invoice, invoices, payments, discounts, refunds | `FinanceService`, `FinanceConfigurationService`, `PriceCatalogService` | ✅ | Money-authority page |
| **systems/billing** | `BillingDocument` | `BillingService`, `GenericBillingAdapter` | 🟠 | **No country adapter** |
| **systems/people** | Staff, structure, teams, specialisation | `organization/`, `team/`, `specialization/` | 🟡 | Specialisation consumers |
| **systems/customer** | Customers, decisions, timeline, safe history, templates | `CustomerPortalService`, `DecisionService`, `RegisterService`, `MessageTemplateService`, `CustomerSafeProjectionService` | 🟡 | **No message transport** |
| **systems/forms** | `CustomFieldDefinition` | `CustomFieldsService`, `form-registry` | 🟠 | **No value capture** |
| **experiences/** | Per-role composition | 4 modules | ✅ | — |
| **insights/** | Reports, analytics, workflow health | 4 modules | 🟡 | Date-range UI, platform sections |

## 13.4 `packages/shared` — the third boundary

The domain layer both sides import. **Nothing here imports Prisma or Nest**, deliberately, so the validators can be proven correct in isolation.

`capabilities/` (types, registry, gates, graphs, router, validator, profiles) · `policies/` (types, registry, validator, relevance, graph-safety) · `permissions/` (manifest, defaults, delegated) · `operations/` (journey, lanes, attention ranking, blocker routing) · `onboarding/` (stages, draft, validator, progress, presentation, responsibility, packs) · `contracts/` (cross-system, events) · `money/` · `session/` · `pages/` · `platform/` · `errors/`.

**Two mechanisms keep it honest:** exhaustive `Record` types (a capability without copy **fails the build**) and CI assertions against the source tree (`policy-consumers.spec.ts`, `lint-permission-keys.mjs`).

> **Trap:** after adding an export here, rebuild — or `apps/api` typecheck will not see it.

## 13.5 Subsystems with no surface

The same failure mode at different depths. Each is a gap entry.

| Subsystem | Exists | Missing |
|---|---|---|
| `control/tenant-relationships` | Models, services, tests | Any controller or page |
| Staff restriction | Service + audit actions — **and it is a resolver ceiling** | Any surface |
| Work-order disputes | Model + `raise()` | Any surface |
| Specialisation entries | Definitions, versions, validation | Any page that fills one in |
| Forms | Authoring + validation | Any page that captures values |
| Inventory transfers / supplier orders | Models, enums, permissions | Graph states, endpoints, pages |
| Messaging | 8 templates, versioning, preview, publish | **Any transport at all** |

---

# 14. Backend Architecture

**Deep reference:** [`docs/corpus/25_BACKEND_ARCHITECTURE.md`](docs/corpus/25_BACKEND_ARCHITECTURE.md) · **Layout rationale:** [`REORGANIZATION_REPORT.md`](REORGANIZATION_REPORT.md)

## 14.1 What was actually built

NestJS on Node 24. **30 controllers · 170 routes · 85 services · 32 modules.** Base path `/api/v1`.

```mermaid
flowchart TB
    HTTP["HTTP request"] --> SG["SessionGuard — attaches request.session"]
    SG --> PG["PlatformGuard — platform routes only"]
    PG --> VP["ValidationPipe + DTOs"]
    VP --> CTRL["Controller"]
    CTRL --> PERM["access.can(session, key)"]
    CTRL --> OWN["resource-ownership check"]
    OWN --> SVC["System service"]
    SVC --> RES["resolve capabilities + policies"]
    RES --> TX["prisma.$transaction"]
    TX --> W1["write"]
    TX --> W2["OperationEventsService.emit"]
    TX --> W3["AuditService.record"]
    TX --> RESP["response — money as string, restricted fields absent"]
    RESP --> EI["error interceptor — code, message, details"]
```

## 14.2 The layer contract

| Layer | May | May not |
|---|---|---|
| `runtime/` | Own framework plumbing | Contain business meaning |
| `identity/` | Decide *who* and *may they* | Know what a work order is |
| `control/` | Shape a tenant | Be written to by `systems/` |
| `systems/` | Own business rules and their tables | Import `experiences/`; touch another system's tables |
| `experiences/` | Compose `systems/` for one role | **Write directly** |
| `insights/` | Read and derive | Write operational data |
| `audit/` | Write `AuditLog` | — |

**Rule of thumb.** Business rule (*can this transition happen*, *what does this cost*) → `systems/` or `control/`. *How role X sees that rule* → `experiences/`.

`insights/` has exactly one write — acknowledging a workflow-health finding — which records *that an operator has seen something*, not a change to operational data.

## 14.3 Authorization flow, concretely

Permission checks live **in the method body**, not in a decorator, because `can(session, key)` takes a bare `string` — a couple of call sites build the key at runtime. That is precisely why `tools/lint-permission-keys.mjs` exists: TypeScript alone cannot catch `"finance.invoice.isue"`.

Three per-controller idioms, all real:
- `this.access.can(session, "key")` — the common form.
- `requireTechnician(session, "key")` — permission **plus** ownership (*is this job mine*).
- `require(session)` in `TeamSetupController` — one delegation-gated key for every route, returning **the delegation layer's own reason** so a refused manager reads *why*.

## 14.4 Transactions and the `tx` thread

`prisma.$transaction(async (tx) => …)`, and **the `tx` is threaded down** into `AuditService.record()`, `StockService.record()` and `WorkOrderLifecycleService.apply()`.

> **A lock that does not extend to the write it authorises is not a lock.**

That is not abstract: edge case H1 was a real race where `resolveBlocker`'s decision (*nothing else is blocking this*) and its status write were two transactions, and a concurrent `reportBlocker` landed in the gap.

Raw SQL appears in exactly **three** places, each justified in a comment: `pg_try_advisory_xact_lock` for the scheduler; `SELECT … FOR UPDATE` in stock, blockers and team membership; and the gap-free sequence upserts.

## 14.5 Error shape

`{ code, message, details? }`. `code` is machine-readable and stable (`transition_not_allowed`, `gate_blocked`, `idempotency_conflict`, `tenant_unavailable`, `insufficient_stock`, `forbidden`). `message` is what a person reads.

Two consequences worth noting:
- Plan-limit refusals **name the actual limit**, and needed **no web change at all** because the frontend already renders `PresentedError.message` through shared plumbing.
- A gate refusal carries `details` listing **every** unsatisfied gate — making a user fix one thing at a time and press again is the slowest possible path.

## 14.6 The six lint rules

Each encodes a rule previously broken by a well-meaning change. All run in `corepack pnpm lint`, in CI.

| Tool | Enforces |
|---|---|
| `lint-audit-boundary.mjs` | No `AuditLog` write outside `apps/api/src/audit/**` |
| `lint-money.mjs` | Money crosses the API as a string |
| `lint-permission-keys.mjs` | Every key literal reaching the resolver is declared |
| `lint-directional-css.mjs` | No physical-direction CSS |
| `lint-touch-targets.mjs` | Minimum touch targets |
| `lint-no-hard-delete.mjs` | No hard delete of anything with history |

⚠️ **The most load-bearing rule in the product — one writer for `WorkOrder.status` — is the only major one with no lint rule behind it.** It is convention plus review (G-DEBT-03).

## 14.7 Backend gaps

| Gap | Detail |
|---|---|
| 🟠 Six service methods with no controller route | §12.2 |
| 🔴 No CI scan for door-less commands | Would have caught all six in one run |
| 🔴 No lint rule for the single-status-writer invariant | Unlike the audit boundary it resembles |
| 🟠 Two `control/` subsystems with no controller | Tenant relationships; staff restriction and disputes |

---

# 15. Frontend Architecture

**Deep reference:** [`docs/corpus/24_FRONTEND_ARCHITECTURE.md`](docs/corpus/24_FRONTEND_ARCHITECTURE.md)

## 15.1 What was actually built

Angular, standalone components, signals. **Every route is `loadComponent`**, so each page is its own lazy chunk. 55 web spec files, colocated.

```
runtime/       http/ (error interceptor), i18n/ (locale service)
identity/      auth.store, auth.guard, landing, access.api
ui/            button · charts · dismiss-on-escape · error-banner · form-field · identifier · status-pill · toast
domain/        journey/ · dossier/ · decisions/     ← cross-role business concepts
experiences/   analyst · branch-manager · customer · finance · home · inventory ·
               owner · platform · public · team-leader · technician
```

**The vocabulary is deliberately identical to `apps/api/src`'s**, so one word means one thing on both sides of the wire.

## 15.2 The frontend, drawn

```mermaid
flowchart TB
    subgraph SHELLS["11 role shells — one per role, not one branching on role"]
        PL["platform — rail"]
        BR["branch — rail"]
        OW["owner — rail"]
        IN["inventory — rail"]
        AN["analyst — rail"]
        TL["team-leader"]
        TE["tech — bottom nav, gloved hand"]
        CU["customer — bottom nav"]
        PU["public — no shell"]
        HO["home — fallback frame"]
    end
    subgraph DOM["domain/ — cross-role business concepts"]
        JOU["journey/ — workflow strip + 20s poller, never optimistic"]
        DOS["dossier/ — historical capability shape"]
        DEC["decisions/ — shared by token page and portal"]
    end
    subgraph UI["ui/ — no domain knowledge"]
        BTN["button · form-field · status-pill · identifier · error-banner · toast · charts · dismiss-on-escape"]
    end
    subgraph RT["runtime/"]
        HTTP["http/ — error interceptor renders PresentedError"]
        I18N["i18n/ — locale + dir"]
    end
    ID["identity/ — AuthStore (server-validated) · authGuard · landing · access.api"]

    SHELLS --> DOM
    SHELLS --> UI
    SHELLS --> ID
    DOM --> UI
    DOM --> RT
    ID --> RT
    UI --> RT
```

**Direction is one-way and enforced by review:** `runtime/` and `ui/` import nothing above them; `domain/` imports those two; `experiences/` imports downward and **never sideways**.

## 15.3 Dependency direction

```
runtime/ and ui/   import nothing above them
domain/            imports runtime/ and ui/
experiences/       imports downward, never sideways
```

**`experiences/` never imports another `experiences/` folder.** One documented exception proves the rule: the Owner's Teams tab loads Branch Manager's `TeamSetupPage` **verbatim**, pointed at a different base path through a `TEAM_API_BASE_PATH` injection-token override — same server service, same component, **no second implementation**.

## 15.4 Routing decisions with reasons

- **`/branch` is declared before the `''` fallback.** `''` matches as a prefix, so leaving `/branch` last would make every `/branch/*` URL depend on Angular backtracking out of the fallback shell.
- **`withComponentInputBinding()` is on**, so a page needing an id declares `id` rather than unwrapping an observable from `ActivatedRoute`.
- **One shell per role, not one shell branching on role** — the technician's requirement (bottom nav, three pages, gloved hand) and the storekeeper's (rail, long desk sessions) are opposites.
- **Public routes sit outside every shell** — the person arriving has no account, no session, or is not staff at all.

## 15.5 Identity on the client

`AuthStore` is the single source of truth for *who is signed in*, and **never decodes or trusts anything client-side**: every method round-trips to the server, which is the only place a session is validated (an opaque httpOnly cookie). `bootstrap()` calls `GET /auth/me` and is safe to call once per guarded navigation.

`access.api.ts` calls `GET /access/check`. It **shapes the interface and enforces nothing** — a control the user may never reach is absent rather than disabled, restricted data is absent from the response rather than hidden, and **the server checks again every time**.

## 15.6 State

Signals, not a store library. Three levels: session (`AuthStore`, root-provided), page (component signals from that page's API client), and shared domain (`JourneyFeed`).

**There is no global application store, deliberately.** Most MOP pages are a read of one server projection plus a few actions that re-read it; a global store would add a second copy of server truth and a synchronisation problem to go with it.

## 15.7 `domain/` — the three cross-role concepts

**`journey/`** — the workflow strip, read by three roles. Stages `DONE · CURRENT · WAITING · BLOCKED · AHEAD`, computed server-side **from the effective graph**, so a workshop with no QC never shows a QC stage. It is not a fixed picture with steps greyed out.

`journey-poller.ts` holds the product's realtime decision in one place:
- **Polling, deliberately.** No WS/SSE infrastructure exists; introducing one would be a new runtime dependency, a new failure mode and a new thing to operate — for a screen whose truth changes on a human timescale. **If push ever arrives, this is the one file that changes.**
- **20 seconds**, matching Live View, so there is one answer to *how live is live*.
- **Never optimistic.** The strip is redrawn only from a server response — advancing it locally would let the one component three roles trust show a state the server never agreed to.

**`dossier/`** — renders the workshop shape **in force when the job opened**.
**`decisions/`** — shared by the public token page and the authenticated portal page.

## 15.8 Frontend gaps

| Gap | Detail |
|---|---|
| 🔴 **Translated strings** | The RTL mechanism is lint-enforced since Phase 1; the translation pass was never done |
| 🔴 Push realtime | Polling is the decision, not the omission |
| 🔴 Date-range filter controls | Which is why exports use the server default range |
| 🟠 `experiences/platform/add-workshop/` | **Orphaned** — routes use `onboarding/` instead |

---

# 16. Domain Model

**Deep reference:** [`docs/corpus/06_DOMAIN_MODEL_AND_ENTITIES.md`](docs/corpus/06_DOMAIN_MODEL_AND_ENTITIES.md) · **Source:** `packages/database/prisma/schema.prisma` — **77 models, 40 enums.**

## 16.1 Ownership

Every entity belongs to exactly one system. **A system never reads or writes another system's tables.** If you find yourself writing a table from a service in another system's folder, the design is wrong, not the rule.

## 16.2 The central entities

### `WorkOrder` — the spine

| Field | Why it exists |
|---|---|
| `status` | 16 states. **Only `WorkOrderLifecycleService` writes it** |
| `inspectionDeclined` | Recorded as a **fact**, not inferred from a missing `Inspection` — *"not inspected yet"* and *"will not be inspected"* are different states, and the Finish Gate must not block a job for a step the customer refused |
| `relinkedFromWorkOrderId` | A job re-opened against an earlier one; self-relation, `SetNull` |
| `promisedAt` | The promised time a queue orders by — a walk-in queue and an SLA clock are the same concept at different granularities |
| `expectedDurationMinutes` | Workshop-defined SLA. **`null` means no SLA is tracked, not "zero minutes allowed"** |

**Cascade discipline:** `tenant` cascades; `branch`, `asset`, `customer` are **`Restrict`** — you cannot delete a branch out from under a job's history.
**Indexes:** `(tenantId,status)`, `(tenantId,branchId,status)`, `(tenantId,customerId)`, `(assetId)` — the four questions every board, queue and history view actually asks.

### `Asset` — not `Vehicle`

`CategoryCode` decides what identifies it. A generator has no plate; naming the model `Vehicle` would have forced a lie into every heavy-equipment tenant. `AssetOwnershipHistory` keeps **one open row = current owner**; closed rows are how a new owner's technical-history view excludes a previous owner's private data.

### `StockMovement` — the ledger

`type · quantity · beforeQty · afterQty · referenceType · referenceId · actorId`. `beforeQty`/`afterQty` are captured from the **row-locked** read, which is what makes `replay()` a real proof rather than an approximation.

### `Payment` — idempotency as a constraint

`idempotencyKey` is **unique**. Not a check-then-write — a lookup has a window; a constraint does not.

### `CustomFieldDefinition`

`fieldKey` is **deterministic** (`slugifyFieldKey("Battery Voltage") → "battery_voltage"`), so two workshops adding the same field produce comparable data. **Empty scope means "all"**, matching the capability model's *absent means enabled*. **Archived, never deleted** — past records that captured a value keep showing it, tagged *(archived field)*, and restoring returns it **at the same `order`**.

## 16.3 The three immutability shapes

| Shape | Used when | Examples |
|---|---|---|
| **Insert-only** | The record *is* the event | `StockMovement`, `AuditLog`, `OperationEvent`, `WorkOrderNote` |
| **Time-ranged** | An answer that changes, whose history must stay readable | `TenantCapability`, `WorkshopPolicy`, `PriceCatalogEntry`, `AssetOwnershipHistory` |
| **Versioned + pinned** | A shape that changes while old instances keep their meaning | `SpecializationDefinition.version` ← `SpecializationEntry.definitionVersion`; `MessageTemplate` |

## 16.4 Key enums

| Enum | Values |
|---|---|
| `WorkOrderStatus` (16) | `DRAFT` `REGISTERED` `UNDER_INSPECTION` `AWAITING_CUSTOMER_APPROVAL` `APPROVED_FOR_WORK` `IN_PROGRESS` `WAITING_PARTS` `WAITING_CUSTOMER` `BLOCKED` `READY_FOR_TEAM_REVIEW` `READY_FOR_QC` `QC_FAILED` `READY_FOR_DELIVERY` `PAYMENT_PENDING` `CLOSED` `CANCELLED` |
| `PartRequestStatus` (**19**) | 15 in the graph + ⚠️ `WAREHOUSE_REVIEWING` `IN_TRANSIT` `WAITING_TRANSFER` `WAITING_SUPPLIER` |
| `PartProvenance` | `INVENTORY` · `EXTERNAL_PURCHASE` · `CUSTOMER_SUPPLIED` |
| `StockMovementType` | `ISSUE` `RETURN_TO_STOCK` `DAMAGED` `TRANSFER_IN` `TRANSFER_OUT` `SUPPLIER_RECEIPT` `ADJUSTMENT` `RETURN_PENDING` |
| `TenantStatus` | `ACTIVE` `TRIAL` `PENDING_SETUP` `FROZEN` `SUSPENDED` `READ_ONLY` `ARCHIVED` |

> `WorkOrderStatus`'s 16 values were authored directly from the canonical spec's lifecycle list. **The old schema was missing six of them** — which is precisely how a lifecycle ends up implemented as an if-chain across whichever services happened to need it.

## 16.5 Domain gaps

| Gap | Detail |
|---|---|
| ⚠️ 4 `PartRequestStatus` values | No graph edge, no writer, **read by three services** |
| 🟠 8 models with no production access | `Subtask`, `Attachment`, `BlockerReasonDefinition`, `InventoryTransfer`, `SupplierOrder`, `Quotation`, `QuotationItem`, `PlatformLiveViewSession` |
| ⚠️ `TenantConfiguration.workflowPolicy` | Empty, unread JSON placeholder — blocks one integrity check, which is **declared not computable** |
| 🔴 No stable `serviceId` on invoice lines | *Top services* grouped by line **text**, and says so |
| 🔴 No per-state entry timestamps | SLA over-run uses `updatedAt` as a **named** proxy |
| 🔴 No optimistic concurrency on `WorkOrder` | Two managers editing one job are last-write-wins |

*(`InvoiceSequence` and `CreditNoteSequence` are **not** orphaned — they are accessed through raw SQL, which is what makes numbering gap-free under concurrency.)*

---

# 17. Work Order / Workflow Engine

**The deepest subsystem in the product.** Deep references: [`docs/corpus/07_WORK_ORDER_LIFECYCLE.md`](docs/corpus/07_WORK_ORDER_LIFECYCLE.md), [`docs/corpus/08_WORKFLOW_ENGINE.md`](docs/corpus/08_WORKFLOW_ENGINE.md).

## 17.1 The rule that governs everything

> **`WorkOrderLifecycleService` is the only thing in MOP that changes a work order's status.**

Every other service asks for an **intent** — *finish*, *approve*, *deliver* — and the lifecycle service decides where that lands by consulting the capability-aware graph. No service anywhere contains `status: "READY_FOR_QC"`, so a workshop without QC cannot end up there by accident, and adding a capability later does not mean hunting through services for hardcoded transitions.

**Why it is load-bearing.** v11.9's lifecycle was spread across whichever services happened to need it, and it drifted: **six of sixteen statuses had no code path that set them at all**, and one was set by a free-text label while the real enum stayed behind.

## 17.2 The seven concepts, kept distinct

| Concept | Is | Lives in |
|---|---|---|
| **State** | A value a record can hold | Prisma enum **and** `WorkflowGraph.states` — they match exactly |
| **Transition (edge)** | A permitted move | `WorkflowGraph.transitions` |
| **Intent** | The action a *person* takes | `WORKFLOW_INTENTS`, 20 |
| **Guard** | A condition on an *edge*: `requires` · `requiresPolicy` · `requiresFact` | On the transition |
| **Gate** | A condition on the *record* before a checkpoint | `GATE_REGISTRY`, evaluated by `GateEvaluatorService` |
| **Side effect** | What else changes | `OperationEventsService` fan-out |
| **History event** | The immutable record it happened | `OperationEvent` + `AuditLog` |

**The distinction that matters most:** *a guard decides whether an edge exists for this tenant; a gate decides whether this particular record may take an existing edge right now.*

## 17.3 The lifecycle graph

```mermaid
stateDiagram-v2
    [*] --> DRAFT
    DRAFT --> REGISTERED: REGISTER
    REGISTERED --> UNDER_INSPECTION: START_INSPECTION
    REGISTERED --> AWAITING_CUSTOMER_APPROVAL: REQUEST_APPROVAL<br/>policy CUSTOMER_MAY_DECLINE
    UNDER_INSPECTION --> AWAITING_CUSTOMER_APPROVAL: REQUEST_APPROVAL
    UNDER_INSPECTION --> APPROVED_FOR_WORK: APPROVE<br/>policy BEYOND_SCOPE or CRITICAL_ONLY
    AWAITING_CUSTOMER_APPROVAL --> APPROVED_FOR_WORK: APPROVE
    APPROVED_FOR_WORK --> IN_PROGRESS: START_WORK
    IN_PROGRESS --> WAITING_PARTS: REQUEST_PART<br/>requires INVENTORY
    WAITING_PARTS --> IN_PROGRESS: PART_RECEIVED
    IN_PROGRESS --> WAITING_CUSTOMER: ASK_CUSTOMER
    WAITING_CUSTOMER --> IN_PROGRESS: CUSTOMER_RESPONDED
    IN_PROGRESS --> BLOCKED: REPORT_BLOCKER
    BLOCKED --> IN_PROGRESS: RESOLVE_BLOCKER<br/>NO ENDPOINT
    IN_PROGRESS --> READY_FOR_TEAM_REVIEW: FINISH 1st<br/>TEAM_REVIEW + REVIEW_REQUIRED
    IN_PROGRESS --> READY_FOR_QC: FINISH 2nd<br/>QC + QC_MANDATORY
    IN_PROGRESS --> PAYMENT_PENDING: FINISH 3rd<br/>FINANCE_CORE
    READY_FOR_TEAM_REVIEW --> READY_FOR_QC: REVIEW_PASSED
    READY_FOR_TEAM_REVIEW --> PAYMENT_PENDING: REVIEW_PASSED
    READY_FOR_TEAM_REVIEW --> IN_PROGRESS: REVIEW_REJECTED
    READY_FOR_QC --> QC_FAILED: QC_FAILED
    QC_FAILED --> IN_PROGRESS: RESOLVE_BLOCKER
    READY_FOR_QC --> PAYMENT_PENDING: QC_PASSED
    READY_FOR_QC --> READY_FOR_DELIVERY: QC_PASSED no finance
    PAYMENT_PENDING --> READY_FOR_DELIVERY: SETTLE_PAYMENT
    READY_FOR_DELIVERY --> CLOSED: DELIVER<br/>Delivery Gate
    CLOSED --> [*]
    CANCELLED --> [*]
```

*Cancel edges from `DRAFT`, `REGISTERED`, `UNDER_INSPECTION`, `AWAITING_CUSTOMER_APPROVAL`, `APPROVED_FOR_WORK`, `IN_PROGRESS`, `WAITING_PARTS`, `WAITING_CUSTOMER`, `BLOCKED` and `READY_FOR_DELIVERY` are omitted from the diagram for legibility.* **They are load-bearing, not defensive** — they are what makes every non-terminal state reach a terminal one even before capability-specific routes are considered.

## 17.4 The three guard axes

| Axis | Scope | Field | Used by |
|---|---|---|---|
| **Capability** | Whole tenant | `requires` | 14 edges |
| **Policy** | Whole tenant | `requiresPolicy` | 4 edges |
| **Fact** | **This record only** | `requiresFact` | 2 edges |

A whole graph may also carry `requires` — `PART_REQUEST_GRAPH` does. That graph is **skipped**, not reported unreachable: *"this never happens here"* is not the same defect as *"this happens and then gets stuck."*

**A missing fact is treated as false** — conservative in both directions.

## 17.5 Declaration order is precedence

A workshop with review, QC and finance has **three live `FINISH` edges out of `IN_PROGRESS` simultaneously.** The graph lists them review → QC → invoicing, and `resolveIntent` takes **the first declared live match**.

> **Reordering those three lines in `workflow-graphs.ts` changes product behaviour**, which is why the ordering carries a comment saying so.

Expressing that as branching code would mean every future feature re-derives it and the branches drift. Expressing it as **data the router walks** means adding a capability later does not mean hunting through services.

## 17.6 Transition-by-transition reality

| From → To | Intent | Trigger / caller | Preconditions | Side effects | Status |
|---|---|---|---|---|---|
| `DRAFT → REGISTERED` | `REGISTER` | `POST /branch-manager/intake` | `customer.intake.create` | `WorkOrder`, audit `work_order.created` | 🟦 |
| `REGISTERED → UNDER_INSPECTION` | `START_INSPECTION` | `POST /technician/…/inspection` | `inspection.*.create` | `Inspection`, event | 🟦 |
| `REGISTERED → AWAITING_CUSTOMER_APPROVAL` | `REQUEST_APPROVAL` | intake, declining path | policy `CUSTOMER_MAY_DECLINE` | `inspectionDeclined = true` | 🟦 |
| `UNDER_INSPECTION → AWAITING_CUSTOMER_APPROVAL` | `REQUEST_APPROVAL` | `POST /technician/…/decisions` | `customer_decision.create` + `.send` | `CustomerDecisionRequest` + items + token | 🟦 |
| `UNDER_INSPECTION → APPROVED_FOR_WORK` | `APPROVE` | routing | policy ∈ {`BEYOND_INITIAL_SCOPE`,`CRITICAL_ONLY`} | — | 🟡 scope-delta not derived |
| `AWAITING_CUSTOMER_APPROVAL → APPROVED_FOR_WORK` | `APPROVE` | `POST /public/decisions/:token/respond` **or** `…/approvals/:id/record` | critical acknowledgement | decision resolved, timeline | ✅ |
| `APPROVED_FOR_WORK → IN_PROGRESS` | `START_WORK` | `POST /technician/tasks/:id/start` | — | task state | 🟦 |
| `IN_PROGRESS → WAITING_PARTS` | `REQUEST_PART` | `POST /technician/…/parts` | `INVENTORY`, `inventory.request.create` | `PartRequest`, event | 🟦 |
| `WAITING_PARTS → IN_PROGRESS` | `PART_RECEIVED` | `POST /technician/parts/:id/receive` | ownership | request state | 🟦 |
| `IN_PROGRESS → BLOCKED` | `REPORT_BLOCKER` | `POST /technician/tasks/:id/blocker` | `blocker.report` | `TaskBlocker`, event | 🟦 |
| **`BLOCKED → IN_PROGRESS`** | `RESOLVE_BLOCKER` | ⚠️ **none** | — | — | 🟠 **`resolveBlocker` exists, tested, no route** |
| `IN_PROGRESS → READY_FOR_TEAM_REVIEW` | `FINISH` (1st) | `POST /technician/…/finish` | `TEAM_REVIEW` + `REVIEW_REQUIRED` + **8 gates** | event | 🟦 |
| `IN_PROGRESS → READY_FOR_QC` | `FINISH` (2nd) | same | `QC` + `QC_MANDATORY` (+ fact if risk-flagged) + 8 gates | event | 🟦 |
| `IN_PROGRESS → PAYMENT_PENDING` | `FINISH` (3rd) | same | `FINANCE_CORE` + 8 gates | event | 🟦 |
| `READY_FOR_TEAM_REVIEW → …` | `REVIEW_PASSED` / `REVIEW_REJECTED` | `POST /branch-manager/…/advance` | `workorders.review.decide` | event | 🟦 |
| `READY_FOR_QC → …` | `QC_PASSED` / `QC_FAILED` | same endpoint, stage chosen from status | `workorders.qc.decide` | event | 🟦 |
| `PAYMENT_PENDING → READY_FOR_DELIVERY` | `SETTLE_PAYMENT` | `POST /finance/invoices/:id/payments` | `PARTIAL_PAYMENT` | `Payment`, running balance | 🟦 |
| `READY_FOR_DELIVERY → CLOSED` | `DELIVER` | `POST /branch-manager/…/deliver` | `workorders.branch.release_delivery` + **Delivery Gate** | `closedAt`, safe history | 🟦 |

**`workorders.review.decide` and `workorders.qc.decide` are deliberately separate keys** — team review is a supervisor reading a technician's work; QC is the workshop's last look before a customer sees it. A shop running both must be able to give them to different people.

## 17.7 How a transition executes

`apply(workOrderId, intent, actor, { reason?, tx? })`:

1. Load the work order (`id`, `tenantId`, `status`).
2. `routingContext(tenantId, workOrderId)` → `{ profile, policies, facts }`.
3. `resolveIntent(...)` → not allowed → `409 transition_not_allowed`.
4. **Evaluate gates against the same capability profile**, so a check whose owning capability is gone is never even asked. Blocked → `409 gate_blocked` carrying **every** unsatisfied gate.
5. One transaction: write status · emit `work_order.status_changed` · audit. A caller holding a row lock passes its own `tx`.

Two read-only companions build the UI rather than guessing it: `availableIntents()` and `previewGates()` — the latter powering the technician's finish checklist **before** anything is pressed.

## 17.8 The proof obligations

| Suite | Proves | Fails when |
|---|---|---|
| `validator.spec.ts` | Every shipped profile leaves every non-terminal state able to reach a terminal one | A graph change would strand a job in a standard shape |
| `graph-safety.spec.ts` | No policy option changes reachability, across every option × profile | A policy is really a mis-classified capability |
| `policiesOnEdgesDeclareTheirCapability` | A policy on an edge depends on the same capability the edge requires | An answer could outlive the capability that gives it meaning |
| Relevance validator | The relevance graph is acyclic | — (4 real cycles found and fixed when built) |

## 17.9 Unreachable states, dead edges, missing callers

**Required honesty audit.**

### Intended flow vs. actual flow — the `BLOCKED` state

```mermaid
flowchart LR
    subgraph INTENDED["INTENDED"]
        I1["IN_PROGRESS"] -->|REPORT_BLOCKER| I2["BLOCKED"]
        I2 -->|RESOLVE_BLOCKER<br/>branch manager clears it| I1
        I1 -->|FINISH — no_open_blocker passes| I3["review / QC / invoicing"]
    end
    subgraph ACTUAL["ACTUAL TODAY"]
        A1["IN_PROGRESS"] -->|REPORT_BLOCKER<br/>POST /technician/tasks/:id/blocker| A2["BLOCKED"]
        A2 -.->|RESOLVE_BLOCKER<br/>NO ENDPOINT — resolveBlocker unrouted| A1
        A2 -->|the only real exit| A4["CANCELLED"]
        A1 -.->|FINISH refused<br/>no_open_blocker is a CORE gate| A3["review / QC / invoicing"]
    end
```

Dotted edges exist in the graph and in tested service code, and **cannot be reached by any user**. The service that clears a blocker is implemented, covered by the H1 concurrency test, and has no controller route; the permission that authorises it is held by Branch Manager and checked by nothing.

| Finding | Detail |
|---|---|
| ⚠️ **`BLOCKED` has no user-facing exit** | The only non-terminal state in the product with no reachable route out except `CANCELLED`. `no_open_blocker` is a core Finish gate |
| ⚠️ **4 `PartRequestStatus` values unreachable** | `WAREHOUSE_REVIEWING`, `IN_TRANSIT`, `WAITING_TRANSFER`, `WAITING_SUPPLIER` — no edge, no writer, **read by `inventory-view`, `inventory-home`, and `technician-work-view` which carries customer copy for all four** |
| ⚠️ **`Task` has no creation route** | The only writer is `createTask`, which nothing calls |
| 🟠 4 part-request commands unreachable | §12.2 |
| ✅ **Previously fixed, worth recording** | `RETURN_REJECTED` and `RETURN_CLARIFICATION_REQUESTED` were in the enum with no edge reaching them; `PartReturnRequest` was never written by `requestReturn`. Both found while building the Returns page |
| 🔴 No optional per-job review under `DIRECT` | Would need its own intent; **recorded rather than faked** |
| 🔴 E13 | Capability rollback racing an in-flight transition — design spike owed |

> **The rule this section enforces:** *a state in the enum with no edge reaching it does not exist* — the graph is what `canTransition()` checks, not the enum.

## 17.10 Side effects and the journey projection

`OperationEventsService` is the single fan-out point: `OperationEvent` row → `AuditService` → `CustomerTimelineEvent` via `CustomerSafeProjectionService` — all inside the caller's transaction, so a state change and its side effects can never diverge.

`workflowJourney()` turns state + effective graph into the stage strip read by three roles. Derived from the **effective** graph, so a workshop with no QC never shows a QC stage.

Derived reads that depend on the ledger being real: `lifecycle-duration.util.ts` (per-status duration **reconstructed from history**, not a snapshot), `detectStatusLoops` (rework), `attention-ranking` (working-week aware), `work-order-lanes`.

---

# 18. Inventory Architecture & Reality

**Deep reference:** [`docs/corpus/09_INVENTORY_SYSTEM.md`](docs/corpus/09_INVENTORY_SYSTEM.md)

## 18.1 The premise

> **Stock is a claim about the physical world, and the two drift.**

Systems that survive make reconciliation normal, cheap and **blameless**, and put a human where the two worlds must agree. That is why **stock rises only when the Inventory Manager accepts a return** — a technician saying *"I didn't use it"* is a claim; a storekeeper putting it back on the shelf is a fact.

## 18.2 The full loop

```mermaid
flowchart LR
    T1["Technician needs a part"] --> PR["PartRequest REQUESTED"]
    PR --> IM{"Inventory Manager"}
    IM -->|approve| AP["APPROVED"]
    IM -->|reject| RJ["REJECTED"]
    IM -->|unavailable| UN["UNAVAILABLE"]
    AP -->|issue| IS["ISSUED + StockMovement ISSUE"]
    IS --> RCV["RECEIVED_BY_TECHNICIAN"]
    IS -.->|travelled| ARR["ARRIVED — no endpoint"]
    ARR -.-> RCV
    RCV -->|fit| USED["USED → WorkOrderPartLine → running invoice"]
    RCV -.->|return — NO ENDPOINT| RR["RETURN_REQUESTED + RETURN_PENDING movement"]
    RR --> D{"Manager decides"}
    D -->|accept| RA["RETURN_ACCEPTED → RETURNED_TO_STOCK + RETURN_TO_STOCK movement"]
    D -->|reject| RREJ["RETURN_REJECTED"]
    D -->|clarify| RC["RETURN_CLARIFICATION_REQUESTED"]
    RC -.->|reply — NO ENDPOINT| RR
    RREJ -.->|resolve — NO ENDPOINT| USED
```

Dotted edges are **implemented, tested and unreachable**.

## 18.3 The five buckets

`availableQty` · `reservedQty` · `issuedQty` · `returnPendingQty` · `damagedQty`

`returnPendingQty` exists because a returned part is genuinely in a **third state — neither sellable nor still issued.** Without it the same physical part would have to be counted as available (wrong — nobody has checked it) or issued (wrong — the technician does not have it).

## 18.4 How `StockService.record()` actually works

This is the most safety-critical write in the system, and worth reading in full:

1. **Refuse non-integer and zero quantities** — *a movement of zero changes nothing*.
2. **Refuse a negative quantity** unless the type is `ADJUSTMENT` (it *is* a correction) or `RETURN_PENDING` (the one bucket meant to be opened then reversed — a negative there means *this pending return has now been resolved*, not a mistake being corrected).
3. **Upsert the balance row** — safe without a lock, because two concurrent inserts of the same zero balance converge.
4. **`SELECT … FOR UPDATE`** on that row. *A plain `findUnique` — which is what this used to be — takes no lock under READ COMMITTED, so two concurrent movements could both read the same "before" value and both succeed: **the last unit of a part requested by two technicians at the same instant would be issued to both.*** Edge case H6/E16.
5. **Compute `after`; refuse rather than clamp if negative.** *Clamping would make the number look plausible while silently disagreeing with the room, which is the single failure this whole system is built to avoid.*
6. **Update the bucket, then write the `StockMovement`** with `beforeQty`, `afterQty`, reference and actor.
7. **Join the caller's transaction** when one is passed, so issuing a part and moving its stock cannot half-happen.

**Never-negative is enforced twice**, deliberately: a service refusal that produces a message a human can act on, **and** a database `CHECK` that makes it impossible for a seed script, a data fix or a future service to write a negative quantity of a physical object. *Service code is a promise; a constraint is a fact.*

## 18.5 Two edges worth understanding

**`ISSUED → RECEIVED_BY_TECHNICIAN` — the counter hand-over.** A part issued from the branch's own store does not "arrive" anywhere; the technician is at the hatch. Without this edge the only route ran through `ARRIVED`, so an in-house issue could never be received and `parts.received_used_or_returned` could never observe it. The alternative — writing an `ARRIVED` nobody witnessed — would have put **a transit event in the ledger that never happened.**

**`RETURN_REQUESTED → RETURN_REJECTED → USED`.** A rejected *return* is not a rejected *request*: the part was already handed over, so the technician must resolve it rather than the request quietly dying. Landing this on the top-level `REJECTED` terminal, as the graph did before the fix, was the exact bug the spec named *"the previous build was missing entirely"*.

## 18.6 Inventory reality summary

### What was designed
A full request → approve → issue → receive → use → return loop, with an immutable ledger, multi-warehouse stock, transfers, supplier orders, and velocity-based risk.

### What was built
🟦 Catalogue · five buckets · movement ledger with `beforeQty`/`afterQty` · request approve/reject/unavailable/issue with partial fulfilment · receive · use · manager-side accept/reject/clarify with the clarify↔reply loop · warehouse deactivation `BLOCK_UNTIL_ZERO` · velocity risk reused by three surfaces · six Inventory Manager pages.

### What was connected
Everything on the manager's side. **Nothing on the technician's return side.**

### What was verified
✅ Real-Postgres suites: `part-request.integration.spec.ts`, `inventory-walkthrough.integration.spec.ts`, stock concurrency (two technicians, one unit), warehouse deactivation, separation of duties, `replay()` reproducing balances.

### What is still missing
🟠 `requestReturn` · `respondToClarification` · `markArrived` · `resolveRejectedReturn` doors · 🔴 transfers · 🔴 supplier orders · 🔴 a stock-reconciliation page.

### What is still broken
⚠️ Four statuses read by three services and written by nothing. ⚠️ `StockService.record()` **emits no domain event**, so nothing downstream can subscribe to a stock movement.

---

# 19. Finance & Billing Architecture & Reality

**Deep reference:** [`docs/corpus/10_FINANCE_AND_BILLING_SYSTEM.md`](docs/corpus/10_FINANCE_AND_BILLING_SYSTEM.md)

## 19.1 The money representation rule

> **`Decimal(12,2)` in the database, `string` across the API.** ✅ lint-enforced.

Not a number — a JS number cannot hold `0.1 + 0.2`. Not a `Decimal` — that would drag Prisma's runtime into the browser. **A string is the only representation that is exact, portable and serialisable.**

Internally, integer **minor units**. `toMinor()` refuses rather than rounds: *"1.005" is not a price; somebody computed it and lost a fraction on the way, and accepting it would bury that.*

## 19.2 The immutability moments

| Stage | Mutability | Entity |
|---|---|---|
| Catalogue price | Fluid — but **effective-dated** | `PriceCatalogEntry` |
| Approved price | **Frozen at approval** | `ChargeableWorkItem.approvedUnitPrice` |
| Running invoice | Live while open | `RunningInvoice` |
| Issued invoice | **Permanent** | `Invoice`, `BillingDocument` |
| After issuance | Only a credit note | `CreditNote` |

**A price edit closes the old `PriceCatalogEntry` row and opens a new one.** It never rewrites what an issued invoice already printed — which is what makes *an old invoice must not silently reprice* structurally true rather than a convention.

## 19.3 The money flow

```mermaid
flowchart LR
    CAT["PriceCatalogEntry — effective-dated"] --> CI["ChargeableWorkItem — provenance + FROZEN approved price"]
    TASK["Task / Service"] --> CI
    PART["WorkOrderPartLine"] --> CI
    CI --> RUN["RunningInvoice + lines"]
    RUN --> ISS{"issueInvoice — ONE transaction"}
    ISS --> DISC["enforceDiscountAuthority — APPROVED request for THIS work order AND amount"]
    ISS --> SEQ["InvoiceSequence — gap-free, raw SQL upsert"]
    ISS --> INV["Invoice + InvoiceLine — immutable"]
    ISS --> BILL["BillingService.issueDocument — may REFUSE"]
    BILL -->|BLOCK| RB["whole invoice rolls back"]
    INV --> PAY["Payment — unique idempotencyKey"]
    PAY --> BAL["outstanding = total − paid"]
    BAL --> GATE["Delivery Gate"]
    INV --> CN["CreditNote — the only honest change"]
```

## 19.4 Invoice issuance — the transaction that matters

```
resolve UNCOVERED_COUNTRY_BILLING     ← outside, before opening
enforceDiscountAuthority              ← outside, before opening
BEGIN
  freeze running lines → invoice lines
  allocate the number from invoice_sequences   (ON CONFLICT DO UPDATE)
  create Invoice
  BillingService.issueDocument(...)   ← MAY THROW
  emit finance.invoice_issued
  audit finance.invoice.issued
COMMIT
```

**The compliance refusal happens inside the transaction**, so under `BLOCK` the *entire invoice rolls back* — not just the billing document. An invoice existing without a legally valid document is precisely the inconsistency the Finance/Billing split exists to prevent.

Policies are resolved **before** the transaction opens, deliberately: a policy read is a query, and holding a transaction open across avoidable work widens every window in it.

## 19.5 Payment idempotency

1. Look up by key → found and matching → return the original.
2. Not found → insert in a transaction.
3. Concurrent insert wins → **the unique constraint fires** → re-read by key → return that.
4. Same key, **different amount or method** → `409 idempotency_conflict`.

Step 4 matters as much as step 3: replaying a key with different content is a **client bug, not a retry**, and letting it succeed would produce two different truths under one identity.

## 19.6 Money invariants

```
invoice.total       = Σ lineTotal (+ tax − discount)
amountPaid          = Σ completed payments
outstanding         = total − amountPaid
0 ≤ amountPaid ≤ total                        (unless a credit note applies)
an issued Invoice is never mutated             — only a CreditNote follows
a discounted invoice has an APPROVED DiscountRequest for that work order AND amount
InvoiceSequence and CreditNoteSequence are gap-free per tenant
every money value crossing the API is a two-decimal string
```

⚠️ **Halfway rounding has no single named rule** (E15). Verified correct once on inspection; *specified* and *correct today* are different things.

## 19.7 Why Billing is a separate bounded system

In several markets **an invoice is not a formatted total; it is a compliance artefact** that must be cleared by a government portal before it is legally valid. Egypt's ETA and Saudi Arabia's ZATCA are the two named for the first adapter pass.

| | Finance Core | Billing |
|---|---|---|
| Owns | Prices, totals, payments, balances, discounts, refunds | The legal document and its clearance state |
| Gate | `payment.settled_or_policy_allows` | `invoice.issued` |
| Historical policy | `PRESERVE_READ_ONLY` | **`EXTERNAL_REFERENCE_ONLY`** |
| Externalised | *External Finance Mode* | *External Billing Mode* |

## 19.8 🔴 The compliance gap, stated plainly

**`GenericBillingAdapter` is the only adapter that exists. No country-specific legal invoicing adapter has been built.**

Every real country is therefore compliance-blocked until one ships, and `UNCOVERED_COUNTRY_BILLING`'s default of `WARN_ONLY` is the correct default **precisely because the covered-country list is empty**.

The product is honest about it: `FinanceConfiguration.compliantBlocked` is real, computed on every issuance, and surfaced as a **Compliance badge on the platform workshops list** with an itemised warning in the drawer.

Two adapter methods — `getClearanceStatus()` and `generateDebitNote()` — have **no production caller**. They are the seam waiting for its first real adapter, not dead code, but they are unexercised outside tests.

## 19.9 Finance reality summary

| | |
|---|---|
| **Implemented** | Effective-dated catalogue · chargeable items with provenance and frozen prices · running invoice · issuance · numbering · payment idempotency · discount authority · refunds · credit notes · finance configuration from policy answers |
| **Integrated** | All of the above reachable through Branch Manager delivery/payment and Owner pricing pages |
| **Verified** | `finance.integration.spec.ts` (real Postgres, incl. the idempotency race), discount enforcement at issuance, compliance rollback |
| **Still missing** | 🔴 Country adapters · Who Can Handle Money · customer-initiated payment · named rounding rule · stable `serviceId` |
| **Risky** | The compliance seam is the only thing between the product and a legal problem in a regulated market, and it is empty |

---

# 20. Customer Experience & Reality

**Deep reference:** [`docs/corpus/11_CUSTOMER_EXPERIENCE.md`](docs/corpus/11_CUSTOMER_EXPERIENCE.md)

## 20.1 Who this person is

**The only actor in MOP who is not an employee.** Everyone else is subject to a contract, a policy and a manager. The customer is an outsider with a link — which makes this the **highest-consequence surface in the product**: a mistake here is a real-world privacy incident, not a bug report.

## 20.2 The privacy boundary — intended vs actual

| Rule | Intended | Actual | Gap |
|---|---|---|---|
| Restricted data absent, not hidden | Always | ✅ Response shapes asserted by test | — |
| Customer view is a **translation**, not a filter | *"Supplier order for unavailable brake pads"* → *"We are waiting for a required part"* | ✅ `CustomerSafeProjectionService` with canned per-event text **plus a blocklist** on any supplied text | ⚠️ Canned messages were **unreachable** until both event vocabularies were mapped |
| Never another customer's data | Always | ✅ tenant + customer scoped | — |
| **New owner sees technical history, never the previous owner's financials** | Always | 🟡 `AssetOwnershipHistory` windows it | No page performs a transfer |
| Critical rejection needs acknowledgement | Server-side | ✅ walked end to end | — |
| Price shown only under policy | `CUSTOMER_INVOICE_VISIBILITY` | ✅ absent when `HIDDEN` | — |

**The blocklist**, as defence in depth beyond *"only call this with safe text"*: `supplier` · `stock quantity` · `internal note` · `technician score/performance/rating` · `margin` · `cost price` · `platform control`. Any supplied text matching one falls back to the canned message.

## 20.3 The two ways in

| Path | Auth | Why both exist |
|---|---|---|
| `/decide/:token` | **None** — `secureToken` scopes it to one request | This is what a WhatsApp message points at. **Requiring a login first would break the flow the whole feature exists for** |
| `/customer/**` | A `CUSTOMER` account behind `authGuard` | The other end of the same feature, for a customer who no longer has the message |

## 20.4 The decision lifecycle, and the rule it encodes

Seven states. **Every edge except `PENDING → CANCELLED` requires `CUSTOMER_PORTAL`.**

Removing the portal disables `SENT`, `VIEWED`, `PARTIALLY_RESPONDED` and adds two replacement edges. Without them, **every decision request would strand at `PENDING` and no work could ever be approved** in a workshop without a portal.

> **The step is core; the channel is optional.** That is why `customer_decisions_resolved` and `critical_warning_acknowledged` are **core gates with no owner**.

## 20.5 The critical-rejection path

The awkward scenario the product must not fumble — *the customer rejects a safety-critical repair and drives away*:

1. The item is `CRITICAL`; the customer rejects it.
2. Formal acknowledgement is required **server-side**, under **both** `APPROVAL_WEIGHT` options — the floor the policy cannot lower.
3. `critical_warning_acknowledged`, a core Finish gate, cannot pass until it exists.
4. The job then finishes and the vehicle is delivered, **with the acknowledgement on record**.

**MOP does not prevent the customer making that choice. It prevents the workshop from ever being unable to prove the choice was made.** ✅ Verified end to end.

## 20.6 The permission-model deviation, recorded

🟠 **The eleven-layer resolver has no real opinion about a `CUSTOMER` session.** Every layer defers when there is no tenant-staff role. Portal access is checked directly on `session.accountType` / `enabledModules`, mirroring the public decision controller's own reasoning.

Consequence: five `customer.*` permission keys are **declared, seeded, and checked by nothing.**

This is documented rather than smoothed over because **a reader who assumes the resolver covers customers will design the next customer feature wrongly.** Gap G-SEC-02.

## 20.7 Customer reality summary

| Element | State |
|---|---|
| 6 pages, real API, real routes | 🟦 |
| Public token path, token consumed on use | ✅ |
| Server-side critical acknowledgement | ✅ |
| Smuggled-price refusal | ✅ |
| Counter approval, **attributed to staff unconditionally** | ✅ |
| Self-registration by slug/code, frozen tenants excluded, no auto-login | 🟦 |
| Ownership-scoped safe history | 🟦 |
| Money as server strings, no client arithmetic | 🟦 |
| Journey freshness — 20s poll, never optimistic | 🟢 |
| Full lifecycle strip on Current Service | 🔴 API exposes status only |
| **Message delivery, any channel** | 🔴 |
| Customer-initiated payment | 🔴 |
| Customer sessions in the resolver | 🟠 |

---

# 21. Security, Tenancy & Authorization

**Deep reference:** [`docs/corpus/33_SECURITY_AND_TENANCY_MODEL.md`](docs/corpus/33_SECURITY_AND_TENANCY_MODEL.md), [`docs/corpus/20_PERMISSION_AND_AUTHORIZATION_MODEL.md`](docs/corpus/20_PERMISSION_AND_AUTHORIZATION_MODEL.md)

## 21.1 The authorization chain, as actually implemented

```mermaid
flowchart TB
    REQ["Request + opaque httpOnly session cookie"] --> SG["SessionGuard"]
    SG --> PLAT{"Platform session?"}
    PLAT -->|yes| PGUARD["PlatformGuard — accountType === PLATFORM<br/>DELIBERATELY bypasses the resolver"]
    PLAT -->|no| CUSTQ{"Customer session?"}
    CUSTQ -->|yes| ACCT["accountType + enabledModules check<br/>DOCUMENTED DEVIATION"]
    CUSTQ -->|no| CTX["PermissionContextService.load — ONE snapshot per request"]
    CTX --> L["11 pure layers, iterated in order"]
    L --> OWN["Resource-ownership check in the controller"]
    OWN --> SCOPE["ScopeResolverService — which ROWS, not which ACTIONS"]
```

## 21.2 The eleven layers

Running decision starts at **deny**. Each layer returns `null` (defer) or a real result. **Iteration stops the moment a layer returns `locked: true`.** If every layer defers, deny stands.

| # | Layer | Kind |
|---|---|---|
| 1 | `PlatformControlLayer` | ceiling |
| 2 | `PlanEntitlementLayer` | ceiling |
| 3 | `TenantStatusLayer` | ceiling |
| 4 | `StaffRestrictionLayer` | ceiling — *scoped to one account rather than the tenant* |
| 5 | **`TenantCapabilityLayer`** | ceiling |
| 6 | `ModuleEnabledLayer` | ceiling |
| 7 | `FeatureEnabledLayer` | ceiling |
| 8 | `WorkshopConfigurationLayer` | narrows only |
| 9 | `DelegationLayer` | narrows only |
| 10 | `RolePermissionTemplateLayer` | tenant default |
| 11 | `UserOverrideLayer` | most specific |

**Three orderings carry real weight:**
- **Capability above role and user (5 before 10 and 11)** — a permission must never resurrect a function the workshop does not perform.
- **Delegation above the role template (9 before 10)** — a template that offers team management must not hand it over *on the owner's behalf*.
- **Staff restriction beside tenant status (4)** — investigating one person must never require freezing the whole tenant.

**Layers are pure functions over a per-request context.** Six of the original nine queried the database themselves — resolving ten keys for one page cost sixty round-trips on the hottest path. `resolveMany` now answers ten for the cost of one.

## 21.3 Authentication specifics

**Sessions.** Opaque httpOnly access/refresh cookie pair, server-validated, revocable. Nothing is decoded client-side.

**Passwords.** `scrypt` with **the parameters encoded in the stored hash** (`scrypt$N$r$p$salt$hash`), which means parameters can be raised **without a migration**: verification uses the parameters the hash was created under, then `needsRehash()` triggers a lazy rehash. The legacy 3-part format is still readable, so no account was locked out by the upgrade. `timingSafeEqual`, plus `dummyVerifyForTimingSafety` on the not-found path — **enumeration is closed by timing as well as by wording.**

**Login refusals.** Wrong credentials → generic. Non-`ACTIVE` account → refused. Frozen/suspended/archived tenant → `tenant_unavailable` → `/tenant-frozen`, a deliberate dead end with **no freeze reason surfaced**.

## 21.4 Tenant isolation

| Mechanism | Where |
|---|---|
| `tenantId` on every tenant-scoped model | Schema |
| Every query filters on the **session's** tenant | Service layer |
| **No endpoint accepts a client-supplied `tenantId`** | Controllers |
| Tenant-status ceiling | Resolver layer 3 |
| Cross-tenant reads exist in exactly one place | `LiveViewService` — **counts and event kinds only** |
| Two differently-shaped seed tenants | `seed.ts` |
| Isolation tests that **actively try to cross** | Integration suite |

⚠️ **No row-level security in the database.** Isolation is a service-layer property asserted by tests — the one place the project's own *constraint over convention* preference is not followed.

## 21.5 Attack surfaces and defences

| Surface | Defence |
|---|---|
| Guessing another tenant's record id | Every query filters on the session's tenant |
| Client-supplied `tenantId` | No endpoint accepts one |
| Escalation via role template or user override | Capability sits above both; `locked` short-circuits |
| Delegated permission granted by a template | Delegation layer denies until the owner's switch is on |
| Decision-token brute force | Opaque token, consumed on use, rate limiting |
| User enumeration | Non-enumerating flows **and** timing-safe verification |
| Credential stuffing | Global `ThrottlerGuard` |
| Price tampering on a decision response | Refused — ✅ verified |
| Reading cost without permission | `inventory.cost.view` shapes the response |
| Cross-tenant leak via reports | Every aggregate tenant-filtered; Live View counts only |
| Cross-tenant leak via error messages | Uniform `{ code, message }` shape |
| Stale password hashing | Versioned parameters + lazy rehash |

## 21.6 Security gaps

| Missing | Consequence |
|---|---|
| 🟠 Customer sessions in the resolver | Portal authorization holds **by care, not by mechanism** |
| 🔴 Row-level security | Isolation is service-layer only |
| 🔴 Audit retention | `AuditLog` and `OperationEvent` grow without bound |
| 🔴 MFA · device/IP binding · security-event log | Not implemented |
| 🔴 Penetration test | Never run |
| 🔴 Realtime channel isolation | Not a risk today — polling reuses guarded endpoints. **It becomes one the day push lands** |

---

# 22. Data Integrity & Critical Invariants

**The "do not break" matrix.** Deep reference: [`docs/corpus/22_DATA_INTEGRITY_AND_INVARIANTS.md`](docs/corpus/22_DATA_INTEGRITY_AND_INVARIANTS.md)

**Enforcement legend:** `DB` database constraint · `LINT` build fails · `TYPE` compile error · `TEST` asserted · `SVC` service refuses · `CONV` convention only.

> A rule marked **CONV** is the fragile kind. It is listed so it can be strengthened, not so it can be trusted.

| Area | Invariant | Why | Enforcement | Verification | Current gap |
|---|---|---|---|---|---|
| **Tenancy** | Every tenant-scoped row carries `tenantId` | Isolation | DB | schema | — |
| | Every query filters on the session's tenant | Isolation | SVC + TEST | integration | No RLS backstop |
| | No endpoint accepts a client-supplied `tenantId` | Isolation | SVC + TEST | integration | — |
| | Live View exposes counts and event kinds only | Isolation | SVC | code read | — |
| **Money** | `Decimal(12,2)` in DB | Exactness | DB | schema | — |
| | **String across the API** | A JS number cannot hold 0.1+0.2 | **LINT** | build | — |
| | >2 decimal places refused, not rounded | Buried precision loss | SVC | `money.spec.ts` | — |
| | `total = Σ lines (+tax −discount)` | Correctness | SVC + TEST | integration | — |
| | `0 ≤ paid ≤ total` | Correctness | SVC | integration | — |
| | Issued invoice never mutated | Legal | SVC + CONV | — | No DB trigger |
| | Sequences gap-free per tenant | Legal | DB + SVC | integration | — |
| | Discount requires an APPROVED request for **that work order and amount** | Fraud | SVC + TEST | integration | — |
| | Price edit closes and opens rows | An old invoice must not reprice | SVC | integration | — |
| | **Halfway rounding rule** | Consistency | ⚠️ **CONV** | inspected once | **Not specified** (E15) |
| **Inventory** | No bucket may go negative | Physical reality | **DB CHECK + SVC** | integration | — |
| | Every balance change has a movement | Auditability | SVC + TEST | `replay()` | — |
| | Stock rises from a return **only** on manager acceptance | Physical reality | SVC | integration | — |
| | `RETURN_PENDING` always reversed | Never a standing fact | SVC | integration | — |
| | Warehouse with stock cannot be deactivated | Orphaned stock | SVC + TEST | integration | — |
| | Cost absent without `inventory.cost.view` | Commercial | SVC + TEST | response shape | — |
| **Workflow** | **Only `WorkOrderLifecycleService` writes status** | The capability engine is otherwise decoration | ⚠️ **CONV + TEST** | review | **No lint rule** (G-DEBT-03) |
| | Every reachable non-terminal state reaches a terminal one | No stranded jobs | **TEST** | all profiles | — |
| | A policy may never change reachability | Mis-classification | **TEST** | all options × profiles | — |
| | Graph states match the Prisma enum | Storability | CONV + TEST | — | — |
| | **A state with no edge does not exist** | Reachability | CONV | — | ⚠️ **violated** — 4 statuses |
| | Declaration order is precedence | Determinism | CONV | comment | — |
| | A gate dies with its capability | Two capabilities once stranded every job | TYPE + TEST | — | — |
| | Core gates never dropped | Product floor | TEST | — | — |
| | Gate refusal returns **every** unsatisfied gate | Usability | SVC + TEST | — | — |
| **Capability** | **Absent key means ENABLED** | Half-finished provisioning | SVC | one function | — |
| | Every non-core capability has a removal policy | No "merely off" | TYPE | — | — |
| | Capability above role and user override | A permission cannot resurrect it | TEST | layer specs | — |
| | Time-ranged, never overwritten | History | SVC | `resolveAsOf` | — |
| **Policy** | An `ENFORCED` policy names existing consumers | Anti-stub | **TEST** | `policy-consumers.spec.ts` | — |
| | Relevance graph acyclic | Soundness | TEST | validator | — |
| | A predicate cannot read an undeclared dependency | The graph would be a lie | SVC | scoped answers | — |
| **Permissions** | Deny by default | Safety | SVC + TEST | — | — |
| | `locked` short-circuits | Ceilings are real | TEST | — | — |
| | Layers pure over a per-request context | Correct **and** fast | TYPE + TEST | — | — |
| | Every literal reaching the resolver is declared | Typos | **LINT** | build | Does not flag *unused* keys |
| | A permission is not a claim about a record | Ownership | CONV + TEST | — | — |
| | **Restricted data absent, never hidden** | Anyone can open devtools | CONV + TEST | response shapes | — |
| **Audit** | **No `AuditLog` write outside `audit/`** | One shape | **LINT** | build | — |
| | Audit rows insert-only | Immutability | CONV | — | No DB trigger |
| | `actorName` denormalised | Readable after the account is gone | SVC | — | — |
| | Event keys come from the closed union | Typos | ⚠️ **intended TYPE** | — | **Not enforced** (G-EVT-01) |
| **Records** | No hard delete of anything with history | Reconstruction | **LINT** | build | — |
| | `WorkOrderNote` append-only | Integrity | SVC + schema | — | — |
| | `ControlSetting` soft-deleted | H10 was a real bug | SVC | — | — |
| | Branch/asset/customer are `Restrict` on a work order | History | DB | schema | — |
| | `SpecializationEntry` pins its version | Meaning | SVC | integration | — |
| **Concurrency** | Payment idempotency is a **unique constraint** | Duplicate payment | DB | integration | — |
| | Replay with different content → 409 | Client bug, not a retry | SVC + TEST | integration | — |
| | A caller's lock extends to the write | H1 was a real race | SVC + TEST | integration | — |
| | Invoice + billing document are one transaction | Legal consistency | SVC + TEST | integration | — |
| | Workshop creation is one transaction | All or nothing | SVC | integration | — |
| **Presentation** | No physical-direction CSS | Arabic is primary | **LINT** | build | — |
| | Touch targets meet the minimum | Gloved hands | **LINT** | build | — |
| | A list looks the same at 1 and 100,000 rows | Scale | CONV | — | No load test |
| | Absent, not empty / absent, not locked | Clarity | CONV | — | — |
| **Testing** | Integration runs against **real Postgres** | Mocks prove nothing about constraints | CONV | 62 specs | — |
| | A restriction is asserted at the API response level | Hiding is not hiding | CONV + TEST | — | — |

## 22.1 Currently violated

| Rule | Violation |
|---|---|
| **A state with no edge does not exist** | 4 `PartRequestStatus` values, **read by three services** |
| **Event keys come from the closed union** | Not type-enforced; 18 undeclared keys emitted |
| **Halfway rounding** | No named rule |
| **Single status writer** | Convention and review only — the most load-bearing rule with the weakest enforcement |

---

# 23. Concurrency, Transactions & Idempotency

**Deep reference:** [`docs/corpus/23_CONCURRENCY_IDEMPOTENCY_AND_TRANSACTIONS.md`](docs/corpus/23_CONCURRENCY_IDEMPOTENCY_AND_TRANSACTIONS.md)

## 23.1 The four mechanisms, and the preference order

> **Constraint > lock > check-then-write.** A constraint is a fact; a lock is a discipline; a check-then-write is a hope with a window in it.

| Mechanism | Used for | Where |
|---|---|---|
| Row lock (`SELECT … FOR UPDATE`) | Serialising writers on one record | Stock, blockers, team membership |
| Transaction-scoped advisory lock | Single-flight across replicas | Scheduler |
| Unique constraint | Idempotency, duplicates | Payments, sequences, `sku`, tenant identifiers |
| Caller-supplied transaction | Keeping a decision and its write inseparable | Lifecycle, audit, stock |

## 23.2 Case by case

| Problem | Mechanism | Why it exists | Boundary | Failure behaviour | Tests | Residual risk |
|---|---|---|---|---|---|---|
| **Duplicate payment** | `Payment.idempotencyKey` unique | A lookup has a window | One transaction | Constraint fires → re-read → return original; different content → `409` | ✅ integration | — |
| **Two technicians, last unit** | `FOR UPDATE` on the balance row + DB `CHECK` | A plain `findUnique` takes no lock under READ COMMITTED — **both would be issued the same unit** | Caller's transaction | `insufficient_stock`, naming the numbers | ✅ integration (H6/E16) | — |
| **Blocker reported while another resolved** | Same `FOR UPDATE` on the work-order row **plus `tx` threaded into `apply()`** | Otherwise the decision and the write are two transactions and a second caller lands in the gap | One transaction | Serialised | ✅ integration (H1) | — |
| **Double-clicked team move** | `FOR UPDATE` on `staff_users` | H8 | One transaction | Serialised | ✅ | — |
| **Compliance refusal mid-issuance** | Refusal **inside** the invoice transaction | An invoice without a valid document is the inconsistency the split prevents | One transaction | **Whole invoice rolls back** | ✅ | — |
| **Scheduler double-fire across replicas** | `pg_try_advisory_xact_lock(hashtext(jobKey))` | `@Cron` fires in every process | Transaction-scoped | Loser returns `null` — **losing is the expected case, not a failure** | ✅ | — |
| **Warehouse deactivation with stock** | `BLOCK_UNTIL_ZERO` | Orphaned stock | Service | Refused | ✅ (H6/E16, H7) | — |
| **Stale-ownership decision** | **Flagged in the audit trail rather than blocked** | Refusing would strand a real customer answer | — | Recorded anomaly | ✅ (E19) | — |

**The advisory lock's four chosen properties:** transaction-scoped (a crashed replica cannot hold it forever) · `_try_` not `_lock` (non-blocking) · returns `null` not a rejection (losing is normal) · `hashtext(jobKey)` (a job name reads as a name, not a magic integer somebody keeps unique by hand).

## 23.3 Retry safety

| Operation | Safe to retry? | Why |
|---|---|---|
| Record payment | **Yes** | Idempotency key |
| Lifecycle transitions | **Yes, harmlessly** | A second attempt from the new state is refused with `transition_not_allowed` |
| Part issue | **No** | No idempotency key — a retry could issue twice |
| Capability apply | **No** | Not keyed |
| CSV export | Yes | Read-only (each writes an audit row) |

## 23.4 Open concurrency risks

| Risk | Detail |
|---|---|
| 🔴 **E13** | Capability rollback racing an in-flight lifecycle transition — **the one open race**; design spike owed |
| 🔴 No idempotency key on non-payment mutations | Part issue, capability apply, staff invite |
| 🔴 No optimistic concurrency on `WorkOrder` | Two managers editing one job are last-write-wins; no `version` column |
| 🔴 No global request-level idempotency | An `Idempotency-Key` header convention would generalise the pattern |
| 🔴 Advisory lock is scheduler-only | Long-running per-tenant operations are not single-flighted |

---

# 24. Database Architecture

**Deep reference:** [`docs/corpus/26_DATABASE_SCHEMA_GUIDE.md`](docs/corpus/26_DATABASE_SCHEMA_GUIDE.md) · PostgreSQL 16 + Prisma · **77 models · 40 enums · 31 migrations**

## 24.1 Philosophy

**The schema is the last line of defence, not the first.** Anything catastrophic if a seed script, a data fix or a future service got it wrong belongs in the database — *even when the service already checks it*.

Four working principles: model the business not the screen (`Asset`, not `Vehicle`) · historical truth is a different question from current configuration · enums are behaviour, so they live beside the graph that walks them · **comments record the constraint that forced the shape**, not what the field is called.

## 24.2 Table groups

| Group | Models |
|---|---|
| **Platform / governance** | `Plan`, `Tenant`, `TenantConfiguration`, `TenantConfigurationVersion`, `TenantCapability`, `WorkshopPolicy`, `ControlSetting`, `RolePermission`, `UserPermissionOverride`, `RolePage`, `TenantStakeholder`, `TenantGroup(Member)`, `PlatformLiveViewSession` |
| **Identity / people** | `Account`, `Session`, `StaffUser`, `Team`, `TeamMembership`, `SupervisionNote`, `AnalystSavedView` |
| **Specialisation** | `SpecializationDefinition`, `SpecializationEntry`, `PositionTaxonomyEntry`, `CredentialDefinition`, `StaffCredential`, `BlockerReasonDefinition` |
| **Structure** | `Branch`, `Warehouse`, `BranchWarehouseAccess` |
| **Operations** | `Asset`, `AssetOwnershipHistory`, `WorkOrder`, `WorkOrderAssignment`, `Task`, `Subtask`, `TaskAssignment`, `TaskBlocker`, `Inspection`, `Fault`, `WorkOrderNote`, `WorkOrderDispute`, `Attachment` |
| **Inventory** | `InventoryItem`, `WarehouseStockBalance`, `PartRequest`, `IssuedItem`, `PartReturnRequest`, `WorkOrderPartLine`, `StockMovement`, `InventoryTransfer`, `SupplierOrder` |
| **Finance** | `FinanceConfiguration`, `PriceCatalogEntry`, `Quotation(Item)`, `RunningInvoice(Line)`, `Invoice(Line)`, `InvoiceSequence`, `Payment`, `DiscountRequest`, `RefundRequest`, `CreditNote(Sequence)` |
| **Billing** | `BillingDocument` |
| **Customer** | `Customer`, `CustomerDecisionRequest`, `CustomerDecisionItem`, `CustomerTimelineEvent`, `SafeTechnicalHistory`, `MessageTemplate` |
| **Forms** | `CustomFieldDefinition` |
| **Ledgers** | `AuditLog`, `OperationEvent`, `WorkflowIssueAcknowledgement` |

## 24.3 Constraints that carry business meaning

| Constraint | Migration | Why in the database |
|---|---|---|
| Stock buckets never negative | `…_stock_never_negative` | A negative quantity of a physical object must be **impossible**, not merely refused |
| `returnPendingQty` **may** be negative | `…_return_pending_may_be_negative` | It is a reconciliation counter, not a count of objects |
| `(inventoryItemId, warehouseId)` unique | init | One balance row per item per store |
| `(tenantId, sku)` unique | init | |
| `Payment.idempotencyKey` unique | init | **The actual duplicate-payment prevention** |
| `InvoiceSequence` / `CreditNoteSequence` | init, billing | Gap-free numbering per tenant, via raw-SQL `ON CONFLICT DO UPDATE` |
| `Tenant.nameNormalized` unique | init | Prisma's DSL has no functional index, so a **real lowercase shadow column** maintained on write is the portable way to enforce case-insensitive platform-wide uniqueness |

## 24.4 Cascade discipline

| Rule | Applies to |
|---|---|
| `Cascade` | Anything owned by a `Tenant` |
| **`Restrict`** | `WorkOrder.branch/asset/customer`; `SpecializationEntry.definition` |
| `SetNull` | `WorkOrder.relinkedFrom` |

**`Restrict` is the important one** — you cannot delete a branch out from under a job's history. Deactivation, archival and soft-delete exist instead, and `lint-no-hard-delete.mjs` fails the build on a hard delete of anything with history.

## 24.5 Indexes — each serves a named query

| Model | Index | Question it answers |
|---|---|---|
| `WorkOrder` | `(tenantId,status)` · `(tenantId,branchId,status)` · `(tenantId,customerId)` · `(assetId)` | The board · one branch's board · this customer's jobs · this vehicle's history |
| `AuditLog` | `(tenantId,createdAt)` · `(targetType,targetId)` | What changed recently · everything that happened to this record |
| `OperationEvent` | `(tenantId,eventKey)` | Replay and analytics |
| `WorkOrderAssignment` | `(staffUserId,unassignedAt)` | *My work* |
| `Asset` | `(tenantId,plateNumber)` · `(tenantId,serialNumber)` | Intake search across both category shapes |

**The rule for a new index: name the query it serves.** An index added "for safety" usually means the query was never written down.

## 24.6 Migrations and seeds

31 migrations, `20260807133953_init` → `20260822150000_plan_allowed_exports`. **Immutable — never reordered, renamed, or edited after running anywhere.**

```bash
corepack pnpm db:deploy        # apply
corepack pnpm db:test:prepare  # ← the trap: run after EVERY new migration
corepack pnpm db:seed          # two differently-shaped tenants
corepack pnpm db:seed:demo     # rich operational data on top
```

⚠️ **The seed is currently the only writer of `Task`** — demo data therefore contains something the running application cannot produce.

## 24.7 Risky schema areas

| Area | Risk |
|---|---|
| ⚠️ `PartRequestStatus` | 19 values, 15 in the graph; 4 read but never written |
| 🟠 8 models with no production access | Schema makes a claim the product does not keep |
| ⚠️ `TenantConfiguration.workflowPolicy` | Empty, unread JSON |
| 🔴 `AuditLog` / `OperationEvent` unbounded growth | No retention policy |
| 🔴 No `version` column on `WorkOrder` | Last-write-wins |
| 🔴 No RLS | Isolation is service-layer only |
| 🟡 `Json` columns (`fields`, `options`, `payload`, `before`/`after`) | Deliberate — authored and read as a unit — but unqueryable field-by-field |

---

# 25. API & Domain Command Model

**Deep reference:** [`docs/corpus/19_API_AND_DOMAIN_COMMAND_CATALOG.md`](docs/corpus/19_API_AND_DOMAIN_COMMAND_CATALOG.md) · **30 controllers · 170 routes** · base `/api/v1`

## 25.1 Conventions

Almost every controller is `@UseGuards(SessionGuard)`; platform controllers add `PlatformGuard`. **Four are deliberately unguarded**: `auth`, `public/decisions`, `public/register`, `health`.

Permission checks live in the method body. Money in and out is a **string**. Errors are `{ code, message, details? }`. **Tenant scope comes from the session** — no endpoint accepts a client-supplied `tenantId`.

## 25.2 The command surface, by system

| System | Routes | Notable commands |
|---|---|---|
| **Auth** (unguarded) | 9 | login · refresh · logout · me · invite describe/accept · password-reset request/describe/complete |
| **Public customer** (unguarded) | 4 | `GET/POST /public/decisions/:token` · register workshop/create |
| **Platform** | 24 | create workshop · onboarding blueprint/validate · workshops list/details/**freeze-impact-preview**/freeze/reactivate · capabilities current/preview/apply · role-locks set/remove/history · archive/reactivate · reports · **live-view** |
| **Branch Manager** | 16 | attention · intake search/branches/create · board · detail/journey/dossier/notes · approvals list/detail/**record** · delivery · deliver · **advance** |
| **Technician** | 17 | active · my-work · work card · journey · vehicle history · **finish-check** · task start/complete/blocker · inspection · faults · decisions · parts catalog/request/receive/used · finish |
| **Inventory** | 20 | home · catalog list/get/create/update · reports · requests · stock · item · approve/reject/unavailable/issue · movements · returns accept/reject/clarify · warehouse deactivate/reactivate |
| **Finance** | 15 | job total · add line · **issue invoice** · settlement · **record payment** · refund request/approve/reject · discount request/approve/reject · finance configuration get/update · catalog list/set |
| **Organization** | 18 | staff list/invite/scope/active/locked · infrastructure · branches · warehouses · links · teams (Owner + Branch paths) |
| **Customer portal** | 8 | home · assets · current-service · invoices · decisions · respond · service journey · safe-history |
| **Team Leader** | 7 | home · technicians · detail · notes · work orders · vehicle history · reports |
| **Insights** | 20 | owner reports ×5 · workflow health issues/acknowledge/bottlenecks · analytics ×6 · **export** · saved views ×5 · legacy company report |
| **Other** | 3 | `/access/check` · `/audit` · `/health` |

## 25.3 Endpoints with notable semantics

| Endpoint | Why it is notable |
|---|---|
| `POST /platform/workshops` | Writes an entire workshop shape in **one transaction** |
| `POST /platform/onboarding/validate` | **The same validator the browser previews with** |
| `GET /platform/workshops/:id/freeze-impact-preview` | *Who this will affect, before it happens* |
| `POST …/capabilities/apply` | Runs the reachability proof; **refuses** rather than warns |
| `POST …/role-locks` | **Reason required**, audited |
| `GET /platform/live-view` | The only cross-tenant read; **counts and event kinds only** |
| `GET /technician/…/finish-check` | The gate checklist **before** anything is pressed |
| `POST /branch-manager/…/advance` | Stage chosen from the job's own status; two separate permission keys |
| `POST /finance/invoices/:id/payments` | Idempotency-keyed; `409` on a changed replay |
| `POST /finance/work-orders/:id/invoice` | Compliance refusal **inside** the transaction |
| `GET /analytics/export/:category` | Re-runs **the same `build()` the page renders**; double-gated; audited |
| `POST /public/decisions/:token/respond` | No auth by design; refuses unacknowledged critical rejection and smuggled prices |

## 25.4 🟠 Domain commands with **no endpoint**

**The single most actionable table in this document.**

| Command | System | Consequence |
|---|---|---|
| `TechnicianWorkService.createTask` | Operations | **The only writer of `Task`.** Tasks exist only in the demo seed |
| `TechnicianWorkService.resolveBlocker` | Operations | **A blocked job can never be finished** |
| `PartRequestService.requestReturn` | Inventory | The whole return branch is unreachable from the technician |
| `PartRequestService.respondToClarification` | Inventory | The clarify loop has an ask and no reply |
| `PartRequestService.markArrived` | Inventory | A travelled part cannot be confirmed |
| `PartRequestService.resolveRejectedReturn` | Inventory | A rejected return cannot be closed out |
| `StaffRestrictionService.restrict` / `lift` | Governance | A **resolver ceiling** with no surface |
| `WorkOrderDisputeService.raise` | Governance | Modelled, no surface |
| `TenantStakeholderService.*`, `TenantGroupService.*` | Control | Phase 18.B/C deferred |
| `SpecializationService.fillEntry` / `entriesFor` / `reviseFields` | People | No page fills a card in |
| `CredentialService.*`, `PositionTaxonomyService.forCategory` | People | No surface |
| `MessageTemplateService.currentBody` | Customer | No sending code to read it |
| `PlanLimitsService.effectiveLimits` | Control | A natural next surface for a limits page |
| `GenericBillingAdapter.getClearanceStatus` / `generateDebitNote` | Billing | The seam awaiting a real adapter |

## 25.5 Permission keys with no consuming endpoint

**20 of 80.** Three causes; only the third is a defect.

| Cause | Keys |
|---|---|
| **By design — `PlatformGuard` covers them** | `platform.workshop.create/view`, `platform.control_center.access`, `platform.live_view.access`, `platform.reports.view` |
| **Documented deviation — customer sessions** | `customer.portal.view`, `customer.asset.view_own`, `customer.service.view_own`, `customer.invoice.view_own`, `customer.history.view_safe` |
| 🟠 **Genuinely orphaned** | `workorders.branch.reassign_technician` · `workorders.branch.manage_blockers` · `team.issue.flag_to_branch_manager` · `inventory.transfer.create` · `inventory.supplier_order.create` · `decisions.branch.view` · `inspection.codes.view` |
| 🟠 Test-only references | `finance.invoice.view` · `inventory.stock.view` · `inventory.stock.adjust` |

`lint-permission-keys.mjs` **deliberately does not flag a declared-but-unchecked key** — a key ahead of its page is normal. That correct decision is what leaves genuinely orphaned keys invisible.

---

# 26. Audit & Traceability Model

**Deep reference:** [`docs/corpus/21_AUDIT_AND_TRACEABILITY_MODEL.md`](docs/corpus/21_AUDIT_AND_TRACEABILITY_MODEL.md)

## 26.1 Two ledgers, two jobs

| | `AuditLog` | `OperationEvent` |
|---|---|---|
| Answers | *Who decided this, and what did it look like before?* | *What happened, and what else must change?* |
| Written by | `AuditService` **only** | `OperationEventsService` **only** |
| Enforced by | **LINT — the build fails** | ⚠️ A declared list, **not enforced** |
| Read by | The Owner's Audit page | Reports, workflow health, customer timeline, analytics, live view |

They are deliberately separate: merging them would mean every propagation event carried an accountability shape it does not have, and every accountability record implied a fan-out it does not cause.

## 26.2 What is traceable today

| Question | Answerable? | How |
|---|---|---|
| Who changed this record, and what did it look like before? | ✅ | `AuditLog` `(targetType,targetId)` index, with `before`/`after` diffs |
| What has happened in this tenant recently? | ✅ | `(tenantId,createdAt)` index |
| How long did this job spend in each status? | ✅ | **Reconstructed** from `work_order.status_changed` history |
| Did this job bounce back for rework? | ✅ | `detectStatusLoops` |
| Is there a status change with no event behind it? | ✅ | A Workflow Health integrity check — **the ledger auditing itself** |
| Does this balance match its movements? | ✅ | `StockService.replay()` |
| What shape was the workshop when this job opened? | ✅ | `resolveAsOf()` |
| **Which projections did one press produce?** | ❌ | **`requestId` is never persisted** (G-EVT-03) |
| What did a stock movement cause downstream? | ❌ | `StockService.record()` **emits no event** |

## 26.3 ⚠️ The three event-layer findings

**This is the weakest area in an otherwise strong architecture, and the exact reconciliation matters.**

### G-EVT-01 — two parallel vocabularies

| | Count | Detail |
|---|---|---|
| Declared **and** emitted | **9** | `work_order.created` · `work_order.status_changed` · `inspection.saved` · `fault.created` · `blocker.reported` · `blocker.resolved` · `task.completed` · `customer_decision.requested` · `customer_decision.responded` |
| **Emitted but never declared** | **18** | All of Finance — `finance.{line_added,invoice_issued,payment_recorded,discount_requested,discount_approved,discount_rejected,refund_requested,refund_approved,refund_rejected}` — all of Inventory — `part_request.{created,issued,used,returned,return_requested,return_rejected,return_clarification_requested,return_clarified}` — plus `task.started` |
| Declared but never emitted | **36** | Including every `part.*`, `payment.recorded`, `invoice.issued`, `stock.movement_recorded` |

**Root cause.** `EmitOperationEventInput.eventKey` is typed `string`, not `OperationEventKey`, and `OperationEventKey` is imported **only by its own spec**.

**This already caused a real customer-facing defect, and the code records it.** Every canned customer message written against the declared keys was **unreachable**; customers saw the generic fallback. The applied fix maps *both* vocabularies, with the reasoning written down: renaming what the services emit is a **data migration**, because the emitted key is stored on every historical row and read back by reports and workflow health.

### G-EVT-02 — flows that emit nothing

`StockService.record()` writes the movement and the balance and **emits no event**. Likewise `chargeable_item.*`, `running_balance.updated`, `invoice_candidate.created`, `workshop.frozen`/`.reactivated`, `permission.changed`, `platform_control.changed`, `customer_decision.sent`/`.expired`, `task.finish_attempted`/`.finish_blocked`/`.sent_to_review`, `technician.assigned`.

**Accountability survives** — each still writes its `AuditLog` row. **Propagation does not.**

### G-EVT-03 — the designed envelope is not the persisted one

`DomainEventEnvelope` declares `emittedBy` and `requestId`. It is **never referenced in production code**; `EmitOperationEventInput` has neither field and `OperationEvent` has neither column. A `requestId` *is* generated per request in `main.ts` and attached to the request object — but never threaded into the write.

## 26.4 Audit actions recorded (~30)

Platform · governance (locks, restrictions) · capability/policy (`capability.changed`, `policy.changed`, **`policy.expired`** — *closing a time-ranged row is itself an audited event*) · people · structure · operations · customer · finance · configuration · insights (`analytics.export.generated`).

## 26.5 Audit gaps

🔴 Rollback · 🔴 workshop-timezone timestamps · 🔴 retention/archival · ⚠️ the three event findings above · 🟠 `staff.restricted` audit actions wired to a service with no endpoint.

---

# 27. Testing & Verification Model

**Deep reference:** [`docs/corpus/34_TESTING_AND_VERIFICATION_STRATEGY.md`](docs/corpus/34_TESTING_AND_VERIFICATION_STRATEGY.md)

> **A test does not prove a feature works. It proves the specific thing it asserts.** The value of this section is the "does not prove" column.

## 27.1 The layers

| Layer | Count | Proves | Does **not** prove |
|---|---|---|---|
| Type checking | — | Shapes agree; exhaustive records complete | That any of it is reachable |
| **Lint (6 rules)** | 6 | Audit boundary · money · permission keys · directional CSS · touch targets · no hard delete | Anything about behaviour |
| Shared unit | 243 | Pure domain logic — router, validators, graph safety, money, ranking | That any service calls it |
| API unit | ~42 files | One service against stubs | That the database accepts it |
| **API integration** | **62 files** | Real Postgres: constraints, transactions, cascades, races, isolation | That any page reaches it |
| Web unit | 272 | Components render and react | That the API returns that shape |
| Manual verification | recorded | The whole chain, browser to database | That it stays true tomorrow |
| **Browser / E2E** | **0** | — | — |

**Nothing in this table proves a vertical slice on its own.**

## 27.2 ❌ There is no Honesty Harness

**Stated plainly because it has been referred to as if it exists: there is no "Honesty Harness" in this repository, and no browser or end-to-end test infrastructure of any kind.** No Playwright, no Cypress, no Selenium. `grep` across the repo returns only the word *honesty* in prose comments.

**This is the single most consequential testing gap**, because it is exactly the layer that would have caught every "implemented but unreachable" defect in this document.

## 27.3 The four proof obligations

Not "coverage" — these are the mechanism by which an architectural guarantee is true at all.

| Suite | Proves | Fails when |
|---|---|---|
| `validator.spec.ts` | Every shipped profile leaves every non-terminal state reaching a terminal one | A graph change would strand a job |
| `graph-safety.spec.ts` | No policy option changes reachability | A policy is a mis-classified capability |
| `policy-consumers.spec.ts` | Every `ENFORCED` policy's named consumers exist in the source tree | A policy claims to be live while naming a method that does not exist |
| `lint-permission-keys.mjs` | Every key literal reaching the resolver is declared | A typo creates a permission nothing grants |

## 27.4 Tests that assert an absence

A distinctive and load-bearing category:

- Team Leader responses contain **no price, cost or payment field**.
- Data Analyst People Analytics contains **no money field**.
- Customer Decision Analytics contains **no identifying field**.
- The delivery/payment funnel contains **no currency amount**.
- A manager without `audit.own_tenant.view` gets 403.
- A cross-tenant read returns nothing.

> **A privacy rule asserted at the UI level is not asserted.**

## 27.5 What "verified" is allowed to mean

`[VERIFIED]` **names its proof**: a named test, a recorded manual run, or a CI mechanism. **Not acceptable:** "the tests pass", "the page loads", "the service exists".

**Recorded end-to-end walks:**

| Journey | Result |
|---|---|
| Invite Accept | A workshop owner got a 401; after redeeming, signs in as `TENANT_OWNER`; token consumed |
| Public decision | Read with no auth · unacknowledged safety rejection **refused** · smuggled price field **refused** · answered · job left the Approvals queue |
| Owner audit | 8 real rows including that session's own capability changes; every filter working; a manager without the permission refused with 403 |
| Analyst export | All 5 categories over real HTTP; real CSV bytes; real audit rows; 403 without the permission |
| Plan limits | Both seeded tenants checked directly against Postgres to confirm neither sits at its ceiling |

## 27.6 CI

Every push and PR: real Postgres 16 service · install · Prisma generate · **build shared first** (so a failure reports as *shared did not build* rather than a wall of *Cannot find module*) · migrate · **lint (6 rules)** · typecheck · **test** · build.

## 27.7 Testing gaps

| Gap | Consequence |
|---|---|
| 🔴 **No browser/E2E tests** | Nothing catches "the page does not call the endpoint it should" |
| 🔴 **No scan for door-less commands** | Six exist; nothing in CI notices |
| 🔴 No performance/load testing | Scale claims are design claims |
| 🔴 No contract tests between web clients and API DTOs | Caught by types only where the type is shared |
| 🔴 No mutation testing | Assertion strength unmeasured |
| 🔴 `[INTEGRATED]` has no mechanism | Asserted by review |

---

# 28. Design & UX Philosophy

**Deep reference:** [`docs/corpus/27_DESIGN_SYSTEM_AND_UX_PHILOSOPHY.md`](docs/corpus/27_DESIGN_SYSTEM_AND_UX_PHILOSOPHY.md), [`docs/DESIGN_LANGUAGE.md`](docs/DESIGN_LANGUAGE.md)

> **Every visual value is justified. If a decision cannot be traced to a reason, it is decoration.**

## 28.1 The decisions that matter to the product

**60/30/10 — black ground, red structure, white emphasis.** `#0d0c0c` ground (**warm**, carrying a trace of red, so black and red read as one system), `#8e1010` deep and `#d41717` mark for structure, `#ffffff` reserved for what must be read first. Body copy is `#f2eeec`, deliberately not pure — **pure white on pure black haloes for astigmatic readers, roughly a third of adults.**

**The most important rule in an attention-driven interface:**

> **If everything is coloured, nothing is.**

Most work orders are fine, so most cards are **neutral**. Red means safety, money at risk, or a customer harmed by delay — *never* "important". Amber means waiting on a person. **If a screen ends up mostly red, the fault is the screen's, not the workshop's.**

**Colour is never the only signal.** Roughly 1 in 12 men has a colour-vision deficiency — **in a workshop that is most of the staff.** Every status carries text or shape as well; the pill has a label, never a bare dot. Deliberately accepted consequence: **MOP looks plainer than a marketing site.**

**Shadow means "floats above the page", nothing else.** In a dark interface a drop shadow is nearly invisible, so elevation is surface lightness. Cards get a border, not a shadow — shadows on static cards make a dense operational screen look bubbly and cost real paint performance on long lists.

**Radius is 2/3/4px**, because **a job card is a rectangle**. The previous 4/6/10px range is the default of nearly every generated interface and *a named tell of one*.

**The design metaphor is a job card in the rack** — which is why the board has lanes, a card is a bordered rectangle, status is a label, and the journey strip reads left-to-right as a sequence rather than a progress bar.

## 28.2 The UX principles that shape architecture

- **Next-action primacy.** Every role's landing page answers *what needs me?* with no click, filter or memory of position.
- **Six states per surface**, and **empty is valid and desirable**.
- **Absent, not empty** · **absent, not locked** — a greyed control invites a support ticket; an absent one does not exist.
- **Never leak by hiding** — a security rule with a UI consequence, not a UI rule.
- **Scale shows in pagination, never layout.**
- **One concept, one presentation** — the journey strip has one implementation read by three roles.
- **Say what the workshop does, never what the software has** — enforced structurally: capability copy is an exhaustive `Record`, so a capability added without copy **fails the build**.

## 28.3 Design gaps

🔴 Translated strings · 🔴 per-workshop theming (part of Builder Control) · 🟡 a motion spec thinner than colour and radius.

---

# 29. Architectural Decisions

**Deep reference:** [`docs/corpus/38_DECISION_RECORDS.md`](docs/corpus/38_DECISION_RECORDS.md) — 35 decisions with full context. The load-bearing ones:

| # | Decision | Context / problem | Alternatives | Reason | Current implementation | Current consequence |
|---|---|---|---|---|---|---|
| D-001 | **Rebuild rather than repair v11.9** | Decorative abstractions, write-only config, dead audit service, stubs hardcoded `true` | Repair in place; rebuild same shape | Each failure was *believable, visible and false*; culture had already failed at each once | 6 lint rules + 4 CI proof obligations | ✅ Most failure classes closed — **two recurred** |
| D-003 | **Capability removal is rewiring** | One codebase, many shapes | Feature flags; per-tenant forks | Hiding a button leaves the process broken underneath | Complete removal policies + pre-apply proof | ✅ The product's core differentiator |
| D-004 | **A gate dies with its capability** | Gates were free strings | Keep free strings | Two capabilities disagreeing **stranded every job in a workshop** | Gate registry with ownership | ✅ |
| D-005 | **Policies may never change reachability** | Policies needed to reach the graph | Let them; validate later | The mechanical test separating policy from capability | `graph-safety.ts` | ✅ |
| D-006 | **Finance Core ≠ Billing** | An invoice is a compliance artefact in several markets | One finance system | Different lifecycles, failure modes, immutability rules | Two capabilities, two gates, an adapter seam | 🟠 **The seam is empty** |
| D-007 | **Money is string across the API** | Float · minor units · Decimal · string | | A JS number cannot hold 0.1+0.2; Decimal drags Prisma into the browser | Lint-enforced | ✅ |
| D-008 | **One status writer** | v11.9: six of sixteen statuses had no code path | Let services write status | The branching belongs in the graph | `WorkOrderLifecycleService` | ⚠️ **Convention only — no lint rule** |
| D-009 | **One audit writer, lint-enforced** | A centralised service nothing imported | Convention | Culture already failed once | `lint-audit-boundary.mjs` | ✅ |
| D-010 | **A closed union of domain events** | Modules bypassing the pipeline | Free strings | A typo should be a compile error | 45 keys declared | ⚠️ **Not realised** — `eventKey: string`; two vocabularies; converging is now a data migration |
| D-011 | **Historical records read against the config in force then** | Old invoices repricing | Read current config | An old invoice must never silently reprice | Time-ranged rows + `resolveAsOf` | ✅ |
| D-012 | **Absent capability key means ENABLED** | Half-finished provisioning | Absent means disabled | The inverse silently strips every capability | One function | ✅ |
| D-013 | **Capability above role and user override** | | Role first | A permission must never resurrect a removed function | Layer 5 before 10/11 | ✅ |
| D-014 | **Pure layers over a per-request context** | Ten keys cost sixty round-trips | Cache per key | Correct *and* fast | `resolveMany` | ✅ |
| D-015 | **`PlatformGuard` bypasses the resolver** | Every layer defers with no `tenantId` | Model platform in the resolver | Super Admin has unconditional control by spec | A yes/no check | ✅ — cost: 5 decorative keys |
| D-016 | **The customer's view is a translation** | | Filter fields | It is a security boundary, not presentation | `CustomerSafeProjectionService` + blocklist | ✅ |
| D-017 | **The approval step is core; the portal is a channel** | | Make approval portal-only | Otherwise every decision strands at `PENDING` | Replacement edges + core gates | ✅ |
| D-018 | **Stock rises only on manager acceptance** | Stock drifts from reality | Trust the technician | Put a human where the two worlds must agree | `returnPendingQty` bucket | 🟡 **The technician cannot initiate a return** |
| D-019 | **Never-negative enforced twice** | | Service check only | *Service code is a promise; a constraint is a fact* | `CHECK` + refusal | ✅ |
| D-020 | **Payment idempotency by unique constraint** | | Check-then-write | A lookup has a window | Unique key + `409` on changed replay | ✅ |
| D-021 | **A caller's transaction threads into the lifecycle** | H1 race | Separate transactions | A lock that does not extend to its write is not a lock | `options.tx` | ✅ |
| D-022 | **Polling, not push** | Realtime is promised | WS/SSE | A new dependency and failure mode for human-timescale truth | 20s, never optimistic | ⏸ One file changes if push arrives |
| D-023 | **Scheduler is a lock, not a worker** | `@Cron` fires per replica | A worker process | The need was single-flight, not throughput | `pg_try_advisory_xact_lock` | ⏸ |
| D-024 | **One shell per role** | | One shell branching on role | Gloved hand and desk rail are opposite requirements | 11 shells | ✅ |
| D-025 | **Absent, not disabled** | | Grey it out | A greyed control invites a support ticket | Delegation-gated rail entries | ✅ |
| D-029 | **An `ENFORCED` policy names existing consumers** | Config that changes nothing | Trust the author | Same defect class as a stub | CI assertion | ✅ |
| D-030 | **Two differently-shaped seed tenants** | | One tenant | A single-tenant DB makes isolation bugs invisible | Apex + Delta | ✅ |
| D-031 | **Creation is a nine-stage journey, not a form** | | One form | A form expresses none of the shaping decisions | One transaction, shared validator | ✅ |
| D-032 | **The responsibility stage** | A capability nobody could operate | Let the owner discover it | The product never asked the question | Real permission rows at creation | ✅ |
| D-033 | **Plan ceilings enforced continuously** | Checked once, at creation | Keep it at creation | A ceiling checked once is not a ceiling | `PlanLimitsService` first in three paths | ✅ |
| D-035 | **Record the anomaly rather than refuse** | E19 stale-ownership decision | Refuse | Refusing would strand a real customer answer | Flagged in the audit trail | ✅ |

---

# 30. Implementation Reality Register

**The central table of this document.** No overall "completion percentage" — percentages hide exactly the distinction that matters here.

Columns: **I**ntended · **D**esigned · **Im**plemented · **In**tegrated · **V**erified.

## 30.1 Governance & Control

| Feature | I | D | Im | In | V | Current behaviour | Missing behaviour | Main gap | Evidence | Priority |
|---|:-:|:-:|:-:|:-:|:-:|---|---|---|---|:-:|
| Workshop creation, 9 stages | ✅ | ✅ | ✅ | ✅ | ✅ | Writes the whole shape in one transaction; shared validator | — | — | `onboarding/`, `PlatformService`, integration | — |
| Capability shaping | ✅ | ✅ | ✅ | ✅ | ✅ | Preview → apply → audit; refuses unsafe profiles | — | — | `validator.spec.ts` | — |
| Tenant freeze / archive | ✅ | ✅ | ✅ | ✅ | ✅ | Impact preview; audited | — | — | governance controllers | — |
| Role permission locks | ✅ | ✅ | ✅ | ✅ | ✅ | Set/remove with a written reason; history | — | — | `role-permission-lock.*` | — |
| Plan ceilings | ✅ | ✅ | ✅ | ✅ | ✅ | Asserted **first** in 3 creation paths; names the limit | Per-tenant override | ⏸ open design question | `plan-limits.service.integration.spec.ts` | — |
| Live View | ✅ | ✅ | ✅ | ✅ | — | Counts + event kinds only | — | — | `live-view.service.ts` | — |
| Tenant relationships | ✅ | ✅ | ✅ | ❌ | ✅ | Models + services + tests | **Any surface** | G-CTRL-01 | no controller | P3 |
| Staff restriction | ✅ | ✅ | ✅ | ❌ | ✅ | A **resolver ceiling** with `restrict`/`lift` | Any surface | G-CTRL-01 | no controller | P3 |
| Work-order disputes | ✅ | ✅ | ✅ | ❌ | ✅ | `raise()` + model | Any surface | G-CTRL-01 | no controller | P4 |
| Builder Control (broad) | ✅ | 🔵 | ❌ | ❌ | ❌ | Capability shaping only | Theme, layouts, role experience, workflow policy, permission matrix, rollback | G-PLAT-01 | — | P3 |

## 30.2 Identity & Access

| Feature | I | D | Im | In | V | Current behaviour | Main gap | Priority |
|---|:-:|:-:|:-:|:-:|:-:|---|---|:-:|
| Login, sessions, refresh | ✅ | ✅ | ✅ | ✅ | ✅ | Opaque httpOnly, revocable, server-validated | — | — |
| Password hashing | ✅ | ✅ | ✅ | ✅ | ✅ | scrypt with encoded params, lazy rehash, timing-safe | — | — |
| Invite / set password | ✅ | ✅ | ✅ | ✅ | ✅ | Token consumed; **closed a four-phase hole** | — | — |
| Password reset | ✅ | ✅ | ✅ | ✅ | ✅ | Non-enumerating; raw token never returned | Delivery channel | P3 |
| Self-registration | ✅ | ✅ | ✅ | ✅ | ✅ | Slug/code, frozen excluded, no auto-login | — | — |
| 11-layer resolver | ✅ | ✅ | ✅ | ✅ | ✅ | Iterated, deny-by-default, pure layers | Customer sessions | P2 |
| Delegation | ✅ | ✅ | ✅ | ✅ | ✅ | One switch; denies whatever the template says | More switches as needed | — |
| Customer authorization | ✅ | 🔵 | 🟡 | 🟡 | — | `accountType` checks in controllers | **G-SEC-02** | P2 |

## 30.3 Operations

| Feature | I | D | Im | In | V | Current behaviour | Missing | Gap | Priority |
|---|:-:|:-:|:-:|:-:|:-:|---|---|---|:-:|
| Lifecycle engine | ✅ | ✅ | ✅ | ✅ | ✅ | Single writer, capability+policy+fact routing | — | — | — |
| Finish / Delivery gates | ✅ | ✅ | ✅ | ✅ | ✅ | Capability-aware, full checklist | — | — | — |
| Intake | ✅ | ✅ | ✅ | ✅ | ✅ | Search, branch, book in | — | — | — |
| Board + workspace + dossier | ✅ | ✅ | ✅ | ✅ | ✅ | Graph-derived lanes; historical capability shape | — | — | — |
| Journey strip | ✅ | ✅ | ✅ | ✅ | ✅ | 3 roles, one implementation, 20s poll | Push | ⏸ | — |
| Inspection / fault | ✅ | ✅ | ✅ | ✅ | ✅ | Quick/full/declined; severity drives QC | Specialisation capture | G-FORM-01 | P2 |
| Blocker **report** | ✅ | ✅ | ✅ | ✅ | ✅ | Works | — | — | — |
| **Blocker resolve** | ✅ | ✅ | ✅ | ❌ | ✅ | Service exists, tested incl. H1 | **Endpoint + control** | **G-OPS-01** | **P1** |
| **Task creation** | ✅ | ✅ | ✅ | ❌ | ✅ | Only writer of `Task` | **Endpoint + control** | **G-OPS-03** | **P1** |
| Task start/complete + time | ✅ | ✅ | ✅ | ✅ | ✅ | All 3 `TIME_TRACKING` options | — | — | — |
| **Reassign technician** | ✅ | 🔵 | ❌ | ❌ | ❌ | Permission only | Everything | G-OPS-02 | P2 |
| Notes | ✅ | ✅ | ✅ | ✅ | ✅ | Append-only, policy-governed | — | — | — |
| Attention ranking | ✅ | ✅ | ✅ | ✅ | ✅ | Working-week aware | — | — | — |
| Asset ownership transfer | ✅ | ✅ | 🟡 | ❌ | — | Model + privacy rule | A page | G-OPS-04 | P3 |

## 30.4 Inventory

| Feature | I | D | Im | In | V | Current behaviour | Missing | Gap | Priority |
|---|:-:|:-:|:-:|:-:|:-:|---|---|---|:-:|
| Catalogue | ✅ | ✅ | ✅ | ✅ | ✅ | CRUD; cost permission-gated | — | — | — |
| Five-bucket balances | ✅ | ✅ | ✅ | ✅ | ✅ | Never-negative twice over | — | — | — |
| Movement ledger | ✅ | ✅ | ✅ | ✅ | ✅ | `beforeQty`/`afterQty` under `FOR UPDATE`; `replay()` | **Emits no event** | G-EVT-02 | P2 |
| Request → approve/reject/unavailable | ✅ | ✅ | ✅ | ✅ | ✅ | Separation of duties enforced | — | — | — |
| Issue (partial supported) | ✅ | ✅ | ✅ | ✅ | ✅ | Movement + balance in one transaction | — | — | — |
| Receive / use | ✅ | ✅ | ✅ | ✅ | ✅ | Counter hand-over edge included | — | — | — |
| **Return request** | ✅ | ✅ | ✅ | ❌ | ✅ | Service exists | **Endpoint + control** | **G-INV-02** | **P1** |
| Return accept/reject/clarify | ✅ | ✅ | ✅ | ✅ | ✅ | Full manager queue | Requests to act on | — | — |
| **Clarification reply** | ✅ | ✅ | ✅ | ❌ | ✅ | Service exists | **Endpoint** | **G-INV-03** | **P1** |
| **Mark arrived** | ✅ | ✅ | ✅ | ❌ | ✅ | Service exists | **Endpoint** | G-INV-04 | P1 |
| **Resolve rejected return** | ✅ | ✅ | ✅ | ❌ | ✅ | Service exists | **Endpoint** | G-INV-05 | P1 |
| Warehouse deactivation | ✅ | ✅ | ✅ | ✅ | ✅ | `BLOCK_UNTIL_ZERO`, audited | — | — | — |
| Velocity stock risk | ✅ | ✅ | ✅ | ✅ | ✅ | Reused by 3 surfaces | — | — | — |
| **4 unreachable statuses** | — | — | ⚠️ | ⚠️ | ❌ | **Read by 3 services, written by nothing** | Edges + writers, or removal | **G-INV-01** | **P1** |
| Transfers | ✅ | 🔵 | 🟡 | ❌ | ❌ | Model + enum + permission | Graph, endpoint, page | G-INV-06 | P3 |
| Supplier orders | ✅ | 🔵 | 🟡 | ❌ | ❌ | Model + enum + permission | Endpoint, page | G-INV-07 | P3 |
| Stock reconciliation page | ✅ | 🔵 | 🟡 | ❌ | ❌ | Permission + movement type | A page | G-INV-08 | P2 |

## 30.5 Finance & Billing

| Feature | I | D | Im | In | V | Current behaviour | Missing | Gap | Priority |
|---|:-:|:-:|:-:|:-:|:-:|---|---|---|:-:|
| Effective-dated pricing | ✅ | ✅ | ✅ | ✅ | ✅ | Edit closes and opens rows | — | — | — |
| Chargeable items | ✅ | ✅ | ✅ | ✅ | ✅ | Provenance + frozen approved price | Emits no event | G-EVT-02 | P2 |
| Running invoice | ✅ | ✅ | ✅ | ✅ | ✅ | Line sources recorded | — | — | — |
| Invoice issuance | ✅ | ✅ | ✅ | ✅ | ✅ | One transaction; gap-free; compliance refusal inside | — | — | — |
| Payment idempotency | ✅ | ✅ | ✅ | ✅ | ✅ | Unique constraint; `409` on changed replay | — | — | — |
| Discount authority | ✅ | ✅ | ✅ | ✅ | ✅ | Enforced at issuance for that WO **and amount** | — | — | — |
| Refunds → credit notes | ✅ | ✅ | ✅ | ✅ | ✅ | Gap-free numbering | — | — | — |
| Delivery gate | ✅ | ✅ | ✅ | ✅ | ✅ | Reads `allowUnpaidDelivery` | Audited override | G-POL-03 | P3 |
| **Country billing adapter** | ✅ | ✅ | ❌ | ❌ | ❌ | `GenericBillingAdapter` only | **ZATCA / ETA** | **G-BILL-01** | **P1** |
| Compliance blocking + badge | ✅ | ✅ | ✅ | ✅ | ✅ | Computed every issuance; surfaced | — | — | — |
| Who Can Handle Money | ✅ | 🔵 | ❌ | ❌ | ❌ | — | Platform-lock mechanism | G-OWN-01 | P2 |
| Named rounding rule | ✅ | ❌ | ❌ | — | ❌ | Verified once on inspection | A written rule | G-DEBT-06 | P3 |

## 30.6 Customer, People, Forms, Messaging

| Feature | I | D | Im | In | V | Current behaviour | Missing | Gap | Priority |
|---|:-:|:-:|:-:|:-:|:-:|---|---|---|:-:|
| 6 portal pages | ✅ | ✅ | ✅ | ✅ | ✅ | All real | Lifecycle strip, payment | G-CUST-01/02 | P3 |
| Public token decision | ✅ | ✅ | ✅ | ✅ | ✅ | No auth; token consumed | — | — | — |
| Critical acknowledgement | ✅ | ✅ | ✅ | ✅ | ✅ | Server-side, both policy options | — | — | — |
| Counter approval | ✅ | ✅ | ✅ | ✅ | ✅ | Always attributed to staff | — | — | — |
| Safe projection + blocklist | ✅ | ✅ | ✅ | ✅ | — | Canned text + defence in depth | — | ⚠️ was unreachable until both vocabularies mapped | — |
| **Message templates** | ✅ | ✅ | ✅ | 🟡 | ✅ | 8 versioned, publish-gated | **Any transport** | **G-MSG-01** | P2 |
| Staff lifecycle | ✅ | ✅ | ✅ | ✅ | ✅ | One transaction, mirrored status | Exit reason | G-PEOPLE-01 | P3 |
| Teams | ✅ | ✅ | ✅ | ✅ | ✅ | One component, two paths | — | — | — |
| Supervision notes | ✅ | ✅ | ✅ | ✅ | ✅ | Never shown to their subject | — | — | — |
| Specialisation definitions | ✅ | ✅ | ✅ | 🟡 | ✅ | Versioned, pinned, validated; packs at creation | **A page that fills one in** | G-FORM-01 | P2 |
| Credentials / taxonomy | ✅ | ✅ | ✅ | ❌ | ✅ | Models + services | Any surface | G-CTRL-01 | P4 |
| Custom fields | ✅ | ✅ | ✅ | 🟡 | ✅ | Authoring + `validateValues()` | **Value capture** | G-FORM-01 | P2 |

## 30.7 Insights, Audit, Runtime

| Feature | I | D | Im | In | V | Current behaviour | Missing | Gap | Priority |
|---|:-:|:-:|:-:|:-:|:-:|---|---|---|:-:|
| Owner reports ×5 | ✅ | ✅ | ✅ | ✅ | ✅ | Reconstructed durations; honest nulls | Per-role visibility | G-OWN-02 | P3 |
| Analyst ×7 | ✅ | ✅ | ✅ | ✅ | ✅ | Privacy shapes test-asserted | Date-range UI | G-INS-01 | P2 |
| CSV export | ✅ | ✅ | ✅ | ✅ | ✅ | Same `build()`; double-gated; audited | — | — | — |
| Workflow health | ✅ | ✅ | ✅ | ✅ | ✅ | 5 of 6 checks; bottlenecks; SLA buckets | 6th **not computable** | G-INS-02 | P3 |
| Platform reports | ✅ | ✅ | 🟡 | 🟡 | — | L1 + Usage Overview | 5 sections | G-PLAT-02 | P3 |
| Audit writer + page | ✅ | ✅ | ✅ | ✅ | ✅ | Lint-enforced; diffs; filters | Rollback, timezone, retention | G-OWN-03/04, G-DEBT-04 | P3 |
| **Event vocabulary** | ✅ | ✅ | ⚠️ | ⚠️ | ❌ | 45 declared, 27 emitted, **9 in both** | Type enforcement + convergence | **G-EVT-01** | **P1** |
| **Events from built flows** | ✅ | ✅ | 🟡 | 🟡 | ❌ | Stock, chargeable items, freeze emit nothing | Emission at existing write sites | **G-EVT-02** | P2 |
| **`requestId` correlation** | ✅ | ✅ | ❌ | ❌ | ❌ | Designed, never implemented | Column + thread-through | G-EVT-03 | P2 |
| i18n mechanism | ✅ | ✅ | ✅ | ✅ | ✅ | Logical CSS lint-enforced | **Translated strings** | G-I18N-01 | P2 |
| Scheduler lock | ✅ | ✅ | ✅ | ✅ | ✅ | Advisory, transaction-scoped | Worker process | ⏸ | — |
| **Browser / E2E tests** | ✅ | ❌ | ❌ | ❌ | ❌ | **None** | Everything | **G-DEBT-01** | **P1** |
| **Door-less command scan** | — | ❌ | ❌ | ❌ | ❌ | **None** | A CI check | **G-DEBT-02** | **P1** |

---

# 31. Gap Register

**Deep reference:** [`docs/corpus/37_KNOWN_GAPS_AND_TECHNICAL_DEBT.md`](docs/corpus/37_KNOWN_GAPS_AND_TECHNICAL_DEBT.md) — full entries with root cause and resolution.

**Severity:** **S1** blocks real work or trading · **S2** a finished system is unreachable, or a product claim is untrue · **S3** a named spec piece missing · **S4** debt with no user-visible effect.

## 31.1 Launch blockers (S1)

| ID | Area | Problem | Expected | Actual | Impact | Root cause | Dependency | Resolution | Verification required |
|---|---|---|---|---|---|---|---|---|---|
| **G-BILL-01** | Billing | No country adapter | A legally valid, cleared invoice | `GenericBillingAdapter` only | **No tenant can legally invoice in a regulated market** | Phase 9 built engine + seam, no adapter | Country tax authority specs | One adapter behind the existing interface | Integration test against the portal sandbox |
| **G-OPS-01** | Operations | `BLOCKED` has no exit | Clear a blocker, resume work | Only exit is `CANCELLED`; `no_open_blocker` is a core Finish gate | **A real job is trapped** | `resolveBlocker` implemented, tested, **never routed** | None | One endpoint + one control | Browser walk of GJ-8 |

## 31.2 Finished systems with no door (S2)

| ID | Problem | Impact | Resolution |
|---|---|---|---|
| **G-OPS-03** | `createTask` is the only writer of `Task`, unrouted | **Tasks exist only in the demo seed**; everything downstream operates on rows the product cannot produce | Decide the creator (intake, approval, or technician) and route it |
| **G-INV-02** | `requestReturn` unrouted | The Returns queue can only be seed-filled | Endpoint + Work Card control |
| **G-INV-03** | `respondToClarification` unrouted | The clarify loop has an ask and no reply | Endpoint + control |
| **G-INV-04** | `markArrived` unrouted | A travelled part cannot be confirmed | Endpoint |
| **G-INV-05** | `resolveRejectedReturn` unrouted | A rejected return cannot be closed out | Endpoint |
| **G-INV-01** | 4 `PartRequestStatus` values read by 3 services, written by nothing | The technician view carries copy for states that cannot occur | Add the edges and flows, **or** remove the statuses and the dead reads. **Do not leave them half-alive** |
| **G-EVT-01** | 45 declared / 27 emitted / 9 in both; two vocabularies | The truth-propagation claim is partly unbacked; **already broke customer messaging once** | Type `eventKey`; add the 18 emitted keys; converge separately as a migration |
| **G-EVT-02** | `StockService.record()` and others emit nothing | Nothing downstream can subscribe to a stock movement | Emit at existing write sites, in the existing transaction |
| **G-CTRL-01** | Tenant relationships, staff restriction, disputes, specialisation entries, credentials, taxonomy — modelled, tested, **no surface** | Six subsystems that cannot be used | Build the surface, or remove |
| **G-MSG-01** | 8 templates, no transport | Nothing reaches a customer | Adapter behind a stable interface (shape specified in doc 30 of the corpus) |
| **G-FORM-01** | Nothing captures a custom-field or specialisation value | Two authoring halves with no consuming half | **One technician recording page closes both** |
| **G-SEC-02** | Customer sessions bypass the resolver | Portal authorization holds by care, not mechanism | Extend the resolver |
| **G-PERM-01** | 7 orphaned permission keys + 3 test-only | Permissions implying capability that does not exist | Route them or remove them |
| **G-MODEL-01** | 8 Prisma models with no production access | The schema claims what the product does not keep | Build the surface or drop in a migration |

## 31.3 Named product gaps (S3)

| ID | Gap |
|---|---|
| G-PLAT-01 | Builder Control's broader scope |
| G-PLAT-02 | Platform Reports' 5 remaining sections — **named as owed, not shipped as empty tabs** |
| G-OWN-01 | *Who Can Handle Money* — blocked on the platform-lock mechanism |
| G-OWN-02 | Per-role report visibility — **same blocker** |
| G-OWN-03 | Audit rollback — snapshots exist, nothing reads them |
| G-OWN-04 | Workshop-timezone timestamps |
| G-CUST-01 | Current Service full lifecycle strip |
| G-CUST-02 | Customer-initiated payment |
| G-INS-01 | Date-range filter UI |
| G-INS-02 | 6th integrity check — **declared not computable**, blocked on `workflowPolicy` |
| G-I18N-01 | **The translation pass** |
| G-INV-06/07/08 | Transfers · supplier orders · reconciliation page |
| G-OPS-02/04 | Reassignment · ownership transfer |
| G-FIN-01 | Stable `serviceId` on invoice lines |
| G-PEOPLE-01 | Exit reason / rehire eligibility |
| G-POL-01/02/03 | Owner policy editor · scope-delta derivation · override actions |
| G-EVT-03 | `requestId` / `emittedBy` on stored events |

## 31.4 Architecture, infrastructure, test and documentation debt (S4)

| ID | Debt |
|---|---|
| **G-DEBT-01** | **No end-to-end browser tests** — the gap through which every S2 above arrived |
| **G-DEBT-02** | **No CI scan for door-less commands** — would have caught all six in one run |
| G-DEBT-03 | No lint rule for the single-status-writer invariant |
| G-DEBT-04 | No retention for `AuditLog` / `OperationEvent` |
| G-DEBT-05 | **E13** — capability rollback vs. an in-flight transition; the one open race |
| G-DEBT-06 | E15 — halfway rounding unspecified |
| G-DEBT-07 | No optimistic concurrency on `WorkOrder` |
| G-DEBT-08 | Idempotency keys only on payments |
| G-DEBT-09 | `experiences/platform/add-workshop/` orphaned |
| G-DEBT-10 | `TenantConfiguration.workflowPolicy` empty and unread |
| G-DEBT-11 | `TENANT_ADMIN` page set mirrors Owner — **recorded honestly rather than guessed** |
| G-DEBT-12/13/14 | No contract tests · no load testing · no pen test, MFA, device binding or security-event log |
| G-DEBT-15 | Motion spec thinner than colour and radius |

## 31.5 ⏸ Intentional deferrals — **not debt**

| Decision | Reasoning |
|---|---|
| **Polling, not push** | No WS/SSE dependency for human-timescale truth; one file changes if push arrives |
| **Advisory lock, not a worker** | Phase 13 narrowed deliberately and recorded it |
| **`PlatformGuard` outside the resolver** | Every layer defers with no `tenantId` |
| **No row-level security** | Isolation is a service-layer property asserted by tests |
| **Per-workshop ceiling overrides** | A plan swap already expresses it end to end |
| **`PER_ITEM_CHOICE` on `APPROVAL_WEIGHT`** | **Dropped rather than faked** — nothing exists for a per-item tier to attach to |
| **Optional per-job review under `DIRECT`** | Would need its own intent; recorded rather than faked |
| **Service/Staff as separate report tabs** | A second axis was not justified by data depth |
| **The remaining ~54 policy decisions** | Phase 21 was an architectural resolution pass — a verdict each, **no implementation by design** |
| **Offline mode for technicians** | Offline means write-conflict resolution on *gated transitions*, which is a distributed-transaction problem, not a caching problem — *and doing it badly produces exactly the silent lie this project exists to prevent* |

---

# 32. What Was Built Well

Evidence-backed only.

## 32.1 The capability engine

**What.** Twelve capabilities, each with a complete removal policy declaring what the business process *becomes* without it — replacement edges, gates dropped and kept, what happens to in-flight records and orphaned roles, and the replacement customer wording. A reachability validator runs **before** a change is applied.

**Why it is strong.** Most configurable products hide UI and hope. This one **proves** that no configuration can strand a record, for every shipped shape, in CI. The proof obligation is the design, not a test added afterwards.

**Technical significance.** Turns a class of production incident — *a job that can never be finished* — into a build failure.

**Business significance.** It is what allows one codebase to serve a one-bay shop and a twelve-branch dealership without forking, which is the company's entire operating leverage.

**Evidence.** `registry.ts` (12 complete policies) · `validator.spec.ts` (all 7 profiles) · `gates.ts` (ownership) · `resolveAsOf` (historical interpretation).

**Limitations.** The broader Builder Control scope is unbuilt, and E13 (rollback vs. an in-flight transition) is an open race.

## 32.2 Provably behavioural configuration

**What.** Every `ENFORCED` policy names the `Service.method` that reads it; CI asserts those methods exist.

**Why it is strong.** It answers the question that kills most configurable products — *does this setting actually do anything?* — mechanically rather than by assertion. And `RECORDED` exists as a first-class honest state rather than a hidden one.

**Evidence.** All 16 policies `ENFORCED` with real consumers · `policy-consumers.spec.ts` · `graph-safety.spec.ts` proving no option changes reachability.

**Limitations.** Three options are honest partials; there is no Owner-facing editor.

## 32.3 Money discipline

**What.** `Decimal` in, string out (lint-enforced), integer minor units internally, refusal rather than rounding on excess precision, effective-dated catalogue, frozen approved prices, immutable issued invoices, gap-free numbering under concurrency, payment idempotency by **unique constraint** with a real `409` on a changed replay.

**Why it is strong.** Each piece closes a specific, well-known way money systems go wrong, and the immutability *moments* are explicitly modelled rather than implicit.

**Evidence.** `money.ts` + spec · `lint-money.mjs` · `finance.integration.spec.ts` · raw-SQL sequence upserts.

**Limitations.** No named rounding rule; no stable `serviceId`.

## 32.4 Inventory correctness

**What.** Five buckets · never-negative in **service and database** · an immutable ledger with `beforeQty`/`afterQty` captured under `SELECT … FOR UPDATE` · `replay()` proving balances · `BLOCK_UNTIL_ZERO`.

**Why it is strong.** The `FOR UPDATE` fix is the difference between *the last unit issued to two technicians* and correct behaviour, and it was found by treating a comment's claim as unverified. **Refusing rather than clamping** is the philosophy showing up as code.

**Evidence.** `stock.service.ts` · migrations `stock_never_negative`, `return_pending_may_be_negative` · concurrency integration tests.

**Limitations.** The technician's half of the loop has no doors, and `record()` emits no event.

## 32.5 The authorization model

**What.** Eleven layers in a literal iterated array, deny-by-default, `locked` short-circuit, **capability above role and user override**, delegation above the template, **pure layers over one per-request snapshot**.

**Why it is strong.** It is the direct, structural answer to v11.9's decorative hierarchy — and it is both correct *and* fast, which usually costs one for the other.

**Evidence.** `permission-resolver.service.ts` with the ordering rationale in comments · per-layer specs · `resolveMany`.

**Limitations.** Customers are outside it; 10 keys are orphaned.

## 32.6 Structural enforcement over convention

**What.** Six lint rules and four CI proof obligations encoding rules a previous implementation broke culturally.

**Why it is strong.** *A rule that lives only in a document will be broken by someone in a hurry.* The preference order — **DB constraint > lint > type > test > convention** — is applied consistently and stated openly where it is *not* achieved.

**Limitation, stated by the project itself.** The single-status-writer rule is convention-only.

## 32.7 Institutional honesty

**What.** `profit: null` rather than a guess · *top services* grouped by line text with the reason stated · one integrity check **declared not computable** · adoption metrics reported as *not trackable yet* · a dropped policy option recorded rather than faked · `PAGE_INVENTORY.md` measuring against the spec rather than against what was built · phase documents recording what did **not** land.

**Why it matters commercially.** It is what makes the rest of this document verifiable. A team that writes down *"two of our own audits were wrong about this"* is a team whose green checkmarks can be believed.

---

# 33. What Is Still Missing

Ordered by actionability.

## 33.1 Six endpoints — the cheapest high-value work in the product

| Missing | Why it matters | Where | What exists around it | What would complete it | What depends on it |
|---|---|---|---|---|---|
| **Blocker resolution route** | A blocked job cannot be finished — `no_open_blocker` is a core gate | `TechnicianController` or `BranchManagerController` | `resolveBlocker` implemented and tested incl. H1; `manage_blockers` permission | One endpoint + one control | **GJ-8**; the `BLOCKED` state's only meaningful exit |
| **Task creation route** | Tasks exist only in the demo seed | `TechnicianController` or intake | `createTask` — the only writer of `Task` | One endpoint + a decision about who creates a task | **GJ-1**; time tracking; `approved_work_completed`; throughput analytics |
| **Return request route** | The Returns queue can only be seed-filled | `TechnicianController` | Full manager-side queue, tested | Endpoint + Work Card control | **GJ-2**; `parts.no_pending_return` |
| **Clarification reply route** | The loop has an ask and no reply | `TechnicianController` | `respondToClarification` | Endpoint + control | GJ-2 |
| **Mark arrived route** | A travelled part cannot be confirmed | `TechnicianController` | `markArrived` | Endpoint | Transfers, supplier orders |
| **Resolve rejected return route** | A rejected return cannot be closed | `TechnicianController` | `resolveRejectedReturn` | Endpoint | GJ-2 |

## 33.2 One country billing adapter

**Why it matters.** Without it, **no tenant can legally invoice in a regulated market.** This is the only gap that blocks *trading*, not just *working*.

**What exists around it.** The bounded-system split, `GenericBillingAdapter` behind a stable interface, `compliantBlocked` computed on every issuance and surfaced on the platform list, and `UNCOVERED_COUNTRY_BILLING` with three honest options.

**What would complete it.** One adapter (ZATCA or ETA) implementing the existing interface, plus clearance-status handling — `getClearanceStatus()` already exists as a seam method with no caller.

## 33.3 One technician recording page

**Closes two gaps at once.** Custom-field value capture (G-FORM-01) and specialisation entry-filling. Both authoring halves are complete, validated and tested; **neither has a consuming half.**

**What depends on it.** Feature Adoption Analytics can stop reporting *not trackable yet*; Forms & Fields moves from 🟡 to ✅; specialisation becomes functional differentiation rather than metadata.

## 33.4 The platform-lock mechanism

**Three pages wait on this one piece:** *Who Can Handle Money*, per-role report visibility, and Builder Control's permission matrix. It is the highest-leverage unbuilt *infrastructure* in the product.

## 33.5 Event-layer repair

**Sequence matters here**, because part of it is a data migration:
1. Type `eventKey` as `OperationEventKey`.
2. Add the 18 emitted keys to the union so the type compiles against reality.
3. Emit from the built-but-silent flows, starting with `StockService.record()`.
4. Add `requestId` to `OperationEvent` and `AuditLog` and thread it from the request context.
5. **Separately, and last:** decide whether to converge the two naming schemes — a migration, because emitted keys are stored on historical rows and read back by reports.

## 33.6 A message transport

Templates, versioning, preview and publish-gating are complete. The required shape is specified: event subscription (not a call inside a service) · consent check · adapter behind a stable interface · **render at send time, pinning the version used** · delivery state · idempotency · audit · tenant isolation · customer-safe vocabulary only · quiet hours governed by `WORKING_WEEK`.

## 33.7 The translation pass

The RTL mechanism has been lint-enforced since Phase 1 and the strings are not translated. **Arabic is a primary market.**

## 33.8 Two CI mechanisms

**A door-less-command scan** would have caught all six missing endpoints in one run. **End-to-end browser tests** would catch the *next* six.

---

# 34. What Is Hard & What Is Risky

## 34.1 Technically difficult areas

| Area | Why it is hard |
|---|---|
| **The capability engine** | It is a **proof obligation wearing a configuration costume**. No reachable configuration may strand a work order, orphan a user with no pages, or leave a gate that can never clear — and it had to be built into the lifecycle from its first line, because retrofitting it after five roles depend on hardcoded transitions is the expensive version |
| **The permission resolver** | Sits on **every path**. A wrong `allow` is a breach; a wrong `deny` is an outage; and it runs constantly. Correct and fast fight each other — both are currently held, which took a redesign from per-layer queries to pure functions over one snapshot |
| **Money immutability moments** | Too loose and prices are retroactively altered under a customer who already agreed; too tight and daily corrections become impossible and staff work around the system |
| **Stock vs. the physical world** | Not a modelling problem but a *social* one: the system must make reconciliation blameless, or people stop recording |
| **The customer boundary** | Everyone else is an employee under a contract. The customer is an outsider with a link. A mistake is a privacy incident, not a bug report |
| **Multi-dimensional scale** | Not just more rows — more tenants, branches, warehouses, categories, roles, and features toggled on and off. A design that assumes one branch, or that a page can load "all" of anything, breaks silently as a workshop grows |

## 34.2 Architecturally sensitive — change with care

| Area | Why | If you change it |
|---|---|---|
| **`workflow-graphs.ts` edge order** | **Declaration order is precedence** for edges sharing an intent | Reordering three lines changes where *Finish* lands for every tenant with review + QC + finance |
| **`WorkOrderLifecycleService`** | The only status writer, and the rule is **convention-only** | A second writer makes the capability engine decoration, and nothing will fail |
| **Gate ownership** | A gate dies with its capability | Getting this wrong once **stranded every job in a workshop** |
| **`isCapabilityActive()`** | Absent means ENABLED | Inverting it silently strips every capability from a half-provisioned tenant |
| **Resolver layer order** | Capability above role; delegation above template | Moving capability below role lets a permission resurrect a removed function |
| **`StockService.record()`** | The `FOR UPDATE` is what makes the "locked for the duration" comment true | Removing it re-opens *the last unit issued to two technicians* |
| **Emitted event keys** | Stored on **every historical row** and read back by reports and workflow health | Renaming one is a **data migration**, not a rename |
| **`PriceCatalogEntry` effective dating** | The mechanism preventing old invoices repricing | An in-place edit rewrites history that a customer already agreed to |

## 34.3 Business-critical

Money (§19), the Delivery Gate (a car leaving unpaid is a real loss), the customer boundary (§20), compliance (§19.8), and tenant isolation (§21.4).

## 34.4 Concurrency- and money-sensitive

Payment recording · invoice issuance · stock issue · blocker resolve/report · team membership · the scheduler. Each has a named mechanism in §23; **E13 is the one open race.**

## 34.5 Areas that are easy to extend

| Area | Why |
|---|---|
| **Adding a policy** | Registry entry + a named consumer; CI proves both |
| **Adding a page to an existing role** | Route, lazy component, API client beside it — the shell already exists |
| **Adding a report** | Shared date-range contract and duration utilities already exist |
| **Adding an audit action** | One writer, one shape |
| **Adding a capability** | Registry + removal policy + copy; exhaustive `Record` and the validator catch omissions |
| **Adding a country adapter** | The seam and the compliance policy already exist |
| **Adding a message template** | Closed union + exhaustive default map |

## 34.6 Areas dangerous to modify

| Area | Danger |
|---|---|
| **The lifecycle graph** | Precedence, reachability and gate sets all interact |
| **Removal policies** | Listing a state to disable without removing every transition *into* it is the classic smart-delete bug |
| **The resolver ordering** | Every reordering is a security change |
| **Emitted event keys** | A data migration |
| **The money path** | Immutability moments are the whole design |
| **`Task` creation** | Currently seed-only — adding a route must not break the demo data everything else is tested against |
| **Anything in `packages/shared`** | Imported by both apps; **rebuild it or `apps/api` typecheck will not see the change** |

---

# 35. Extensibility & Future Evolution

## 35.1 Current extension points — designed for it, working today

| Extension | Mechanism | Cost |
|---|---|---|
| A new **capability** | Registry entry + removal policy + copy; validator proves safety | Low |
| A new **policy** | Registry entry + a named consumer; CI asserts it | Low |
| A new **permission** | Manifest + role default + a check site | Low |
| A new **page** | Route + lazy component + API client | Low |
| A new **specialisation pack** | `specialization-packs.ts` | Low |
| A new **message template** | Closed union + default body | Low |
| A new **branch / warehouse** | Runtime, plan-bounded | None |
| A new **capability profile** | `profiles.ts`; validated in CI automatically | Low |
| A new **country adapter** | The seam exists | Medium — external spec |
| A new **audit action** | One writer | Low |
| A new **report tab** | Shared date-range + duration utilities | Low |

## 35.2 Future extension areas — the shape is known, the work is not done

| Area | What is ready | What is needed |
|---|---|---|
| **Messaging channels** | Templates, versioning, publish gating | An adapter interface + delivery state + consent (shape specified) |
| **Country compliance** | Seam, policy, `compliantBlocked`, clearance status enum | Real adapters |
| **Specialisation-driven UI** | Definitions, versions, validation, packs | A recording surface |
| **Custom-field capture** | Authoring, scope, flags, validation | A consuming page |
| **Reporting depth** | One date-range contract, honest nulls | Date-range UI, per-role visibility, platform sections |
| **Workflow health** | 5 of 6 checks | `workflowPolicy` made real |
| **Tenant relationships** | Models + services + tests | A controller and a page |
| **Per-workshop limits** | Plan swap already works | Only if a real *"same plan, one exception"* need appears |

## 35.3 Areas that may require architectural change

| Change | Why it is architectural |
|---|---|
| **Push realtime** | A new runtime dependency, a new failure mode, and **a new thing that can leak across tenants**. `journey-poller.ts` is the single seam, but channel isolation is new security surface |
| **Offline technician mode** | Offline means write-conflict resolution on **gated transitions** — a distributed-transaction problem, not a caching problem. ⏸ Deliberately deferred with that reasoning recorded |
| **Converging the two event vocabularies** | A data migration over historical rows read by reports and workflow health |
| **Row-level security** | Would move isolation from service layer to database — a large, valuable change touching every query |
| **Optimistic concurrency on work orders** | A `version` column plus conflict handling on every mutating path |
| **A separate worker process** | Currently a lock; a worker means deployment topology, queueing and back-pressure |
| **Audit retention** | Partitioning or archival across two ledgers that reports read historically |
| **Workflow graphs editable per tenant beyond capability and policy** | 🚫 **Deliberately not a goal.** Configuration selects among behaviours the code knows; it never describes new ones |

---

# 36. Current Priorities

Derived from repository reality, not from a roadmap. **Ordered by value per unit of effort.**

## P1.1 — Route the six door-less commands

| | |
|---|---|
| **Problem** | Six implemented, tested domain commands have no HTTP endpoint |
| **Why it matters** | Two trap real work (**a blocked job cannot be finished**; tasks cannot be created), four break the returns loop. Blocks GJ-2 and GJ-8, degrades GJ-1 |
| **What exists** | All six services, with tests — including the H1 concurrency fix on `resolveBlocker` |
| **What is missing** | Six endpoints and their controls; a decision about who creates a task |
| **Dependencies** | None |
| **Expected effect** | 2 blocked journeys → passing · 1 partial → complete · 4 orphaned permissions retired · the returns loop becomes usable |
| **Verification** | Browser walk of GJ-2 and GJ-8, plus integration tests through the new routes |

## P1.2 — Add a CI scan for door-less commands

| | |
|---|---|
| **Problem** | Nothing in CI notices that a service method has no route |
| **Why it matters** | This is the class through which **every** S2 gap in this document arrived, twice — four systems previously, six commands now |
| **What exists** | The scan pattern is already proven ad hoc; the six results are in §25.4 |
| **Expected effect** | The class stops accumulating |
| **Verification** | The check fails on a deliberately unrouted method |

## P1.3 — Resolve the four unreachable part-request statuses

| | |
|---|---|
| **Problem** | 4 statuses read by 3 services, written by nothing; the technician view has customer copy for states that cannot occur |
| **Why it matters** | Same class as a bug already fixed once. **Do not leave them half-alive** |
| **Decision required** | Add the edges and the flows (transfers, supplier orders) **or** remove the statuses and the dead reads |
| **Verification** | Enum ↔ graph parity assertion in CI |

## P1.4 — One country billing adapter

| | |
|---|---|
| **Problem** | No tenant can legally invoice in a regulated market |
| **Why it matters** | The only *trading* blocker |
| **What exists** | Seam, policy, `compliantBlocked`, clearance status, `getClearanceStatus()` awaiting a caller |
| **Dependencies** | External: tax-authority specification and sandbox access |
| **Verification** | Integration test against the portal sandbox; a tenant in that country stops being `compliantBlocked` |

## P2.1 — Type the event path, then emit from silent flows

| | |
|---|---|
| **Problem** | 45 declared / 27 emitted / 9 in both; `StockService.record()` emits nothing |
| **Why it matters** | The truth-propagation claim is the product thesis; it is currently partly unbacked, and the divergence **already broke customer messaging once** |
| **Sequence** | Type `eventKey` → add the 18 emitted keys → emit from silent flows → add `requestId` → **only then** consider converging the schemes (a migration) |
| **Verification** | A CI assertion that every emitted literal is a declared key |

## P2.2 — The platform-lock mechanism

Unblocks *Who Can Handle Money*, per-role report visibility, and Builder Control's permission matrix — **three pages waiting on one piece.**

## P2.3 — One technician recording page

Closes custom-field capture **and** specialisation entry-filling. Feature Adoption can stop saying *not trackable yet*.

## P2.4 — Customer sessions in the permission resolver

Moves portal authorization from *by care* to *by mechanism*, and retires five decorative permission keys.

## P2.5 — End-to-end browser tests

Start with the two blocked journeys and GJ-1. Nothing else in CI proves a page calls the endpoint it should.

## P3 and beyond

Message transport · translation pass · date-range filter UI · audit rollback and retention · transfers and supplier orders · stock reconciliation page · E13 spike · a lint rule for the single-status-writer invariant.

---

# 37. Final System Assessment

## What is MOP today?

**A well-engineered configuration and workflow engine with a nearly complete set of role surfaces on top of it, and a systematic weakness in the seam between them.**

The engine layers — capability, policy, workflow, authorization, money, stock — are built to a standard that would pass scrutiny at most companies: proof obligations in CI, constraints in the database, lint rules that fail the build, and an unusual institutional willingness to write down what is *not* true. The surface layers are extensive: 53 pages across 9 role surfaces, none of them unbuilt.

**The gap is not between design and implementation. It is between implementation and reachability.**

## What is genuinely strong?

1. **The capability engine** — a formal reachability guarantee, checked before apply, proven in CI for every shipped shape. This is a real technical differentiator, not a marketing claim.
2. **Provably behavioural configuration** — every enforced policy names the code that reads it, and CI asserts it exists.
3. **Money and stock correctness** — immutability moments modelled explicitly; never-negative enforced in service *and* database; idempotency by constraint; a ledger that can be replayed to prove a balance.
4. **The authorization model** — eleven layers, correct *and* fast, with the one ordering that makes the capability model non-decorative.
5. **Structural enforcement** — six lint rules and four proof obligations, with an explicit preference order and honest labelling of where only convention holds.
6. **Institutional honesty** — the trait that makes everything above checkable.

## What has genuinely been built?

77 models · 31 migrations · 170 routes · 85 services · 53 pages · 12 capabilities · 16 enforced policies · 80 permission keys · 1,386 tests of which 62 spec files run against real Postgres · a CI pipeline that runs all of it on every push.

**Six of ten golden journeys pass end to end.**

## What remains structurally incomplete?

1. **Reachability is unverified by anything.** Six commands have no door; four enum values are read and never written; nothing in CI would notice either.
2. **The event layer has forked** into two vocabularies, with several built flows emitting nothing — leaving the product's central claim about truth propagation partly unbacked.
3. **The compliance seam is empty**, so the product cannot legally trade in a regulated market.
4. **Two authoring halves have no consuming halves** — messaging and forms/specialisation.
5. **The customer authorization path bypasses the resolver.**
6. **The Arabic translation pass was never done**, despite the mechanism being in place from Phase 1.

## What would a CTO worry about?

- **"Your tests are excellent and would not have caught any of your worst bugs."** Every mechanism protects correctness *within* a layer; nothing checks reachability *between* layers. That is not a coverage problem, it is a missing test *layer*.
- **"You cannot invoice anyone legally."** Correct today, honestly surfaced, and entirely dependent on external specs.
- **"Your central architectural claim is partly unbacked."** *Five systems agree about one physical event* holds for Operations. Finance and Inventory emit an undeclared vocabulary; stock movements emit nothing.
- **"Your most important rule has your weakest enforcement."** One writer for `WorkOrder.status` — convention and review, in a codebase that lint-enforces six lesser rules.
- **"Two of your worst failure classes have already recurred."** Decorative abstraction (the event union) and implemented-but-unreachable (six commands). The countermeasures worked where they were applied; they were not applied to reachability.
- **"You have no load testing and no penetration test."** Scale and security claims are design claims.

## What would a CTO be impressed by?

- **A reachability proof running before a configuration change is applied.** Most teams ship feature flags and discover the stranded-record class in production.
- **CI asserting that every enforced policy names a method that exists.** A direct, mechanical answer to *does this configuration do anything?*
- **A `FOR UPDATE` added because a comment's claim was treated as unverified** — and the bug it exposed (the last unit issued to two technicians) documented alongside the fix.
- **Refusing to clamp a negative stock quantity**, with the reasoning written into the code: *clamping would make the number look plausible while silently disagreeing with the room*.
- **`profit: null`, "not computable", "not trackable yet".** Three places where the product declines to fabricate.
- **A repository that documents its own audits being wrong**, and a page inventory that measures against the specification rather than against what was built.

## What would need to happen before serious production confidence?

| # | Requirement | Why |
|---|---|---|
| 1 | **Route the six door-less commands** | Two golden journeys are blocked; a blocked job is trapped |
| 2 | **A CI reachability check** | Otherwise this class returns |
| 3 | **End-to-end browser tests for the golden journeys** | The missing test layer |
| 4 | **One country billing adapter** | Legal trading |
| 5 | **Type the event path and emit from silent flows** | Make the central claim true |
| 6 | **Resolve the four unreachable statuses** | Enum ↔ graph parity |
| 7 | **Customer authorization inside the resolver** | Move from *by care* to *by mechanism* |
| 8 | **Load testing at realistic multi-tenant sizes** | Scale claims are currently design claims |
| 9 | **A penetration test** | Never run |
| 10 | **Audit retention** | Two ledgers grow without bound |

**Honest summary.** This is a codebase whose *hard* parts are done well and whose *connective* parts are unevenly finished. The remaining work is unusually well understood, unusually cheap for its impact, and — with the exception of the billing adapter — has no external dependencies. The largest risk is not any single gap; it is that **the test suite cannot see the class of gap the project keeps producing.**

---

# 38. Technical Appendices

## A. Getting started

```bash
corepack enable && CI=true corepack pnpm install
docker compose up -d
corepack pnpm db:generate && corepack pnpm db:migrate && corepack pnpm db:seed
corepack pnpm run doctor && corepack pnpm test
```

`doctor` checks every environment failure mode encountered so far and tells you how to fix each one.

### Commands

```bash
corepack pnpm run doctor       # environment health — run first when anything is odd
corepack pnpm typecheck        # shared + api
corepack pnpm lint             # all 6 custom rules + eslint
corepack pnpm test             # shared + api + web
corepack pnpm build
corepack pnpm dev              # api + web in parallel
```

Integration tests need `DATABASE_URL` pointed at the **test** database:

```bash
export DATABASE_URL="postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public"
```

### Environment traps that cost real time

| Trap | Reality |
|---|---|
| `pnpm` | **Not on PATH.** Use `corepack pnpm`. In Bash, add Node first: `export PATH="/c/Program Files/nodejs:$PATH"` |
| `pnpm install` | Must be `CI=true corepack pnpm install` — otherwise it hits an interactive prompt, **no-ops, and still exits 0** |
| `pnpm doctor` | A pnpm **built-in** that shadows the project script. Use `corepack pnpm run doctor` |
| Git | Needs `git -c safe.directory=<repo path>` — the folder is owned by a different Windows account |
| After a `packages/shared` export | **Rebuild it** or `apps/api` typecheck will not see it |
| After a migration | **`corepack pnpm db:test:prepare`** or integration tests fail with a confusing 500 |

## B. Repository layout

```
apps/
  api/           NestJS — organised by BOUNDARY, not file kind:
                   audit/ · runtime/ · identity/ · control/ · systems/ · experiences/ · insights/
  web/           Angular — the same vocabulary on the frontend:
                   runtime/ · identity/ · ui/ · domain/ · experiences/
packages/
  shared/        Types, permission manifest, capability engine + validators, contracts, money
  database/      Prisma schema, 31 migrations, seed + demo seed
tools/           doctor, pnpm shim, env loaders, 6 lint scripts
docs/            Specification, charters, phase plan, and the 41-document corpus/
```

**"I need to change X, where do I go?"** → [`CODE_MAP.md`](CODE_MAP.md). **Why the layout looks like this** → [`REORGANIZATION_REPORT.md`](REORGANIZATION_REPORT.md).

## C. Subsystem index

| Subsystem | Path | Doc |
|---|---|---|
| Audit boundary | `apps/api/src/audit` | §26 · corpus 21 |
| Runtime | `apps/api/src/runtime` | §14 |
| Identity / auth | `apps/api/src/identity/auth` | §21 |
| Identity / access | `apps/api/src/identity/access` | §21 · corpus 20 |
| Capabilities | `apps/api/src/control/capabilities` | §7 · corpus 02 |
| Policies | `apps/api/src/control/policies` | §8 · corpus 04 |
| Governance | `apps/api/src/control/governance` | §13 |
| Platform | `apps/api/src/control/platform` | §11.1 |
| Tenant relationships | `apps/api/src/control/tenant-relationships` | §13.4 |
| Operations | `apps/api/src/systems/operations` | §17 · corpus 07/08 |
| Inventory | `apps/api/src/systems/inventory` | §18 · corpus 09 |
| Finance | `apps/api/src/systems/finance` | §19 · corpus 10 |
| Billing | `apps/api/src/systems/billing` | §19.7 |
| People | `apps/api/src/systems/people` | §10 · corpus 05 |
| Customer | `apps/api/src/systems/customer` | §20 · corpus 11 |
| Forms | `apps/api/src/systems/forms` | corpus 32 |
| Experiences | `apps/api/src/experiences` | §11 |
| Insights | `apps/api/src/insights` | corpus 31 |

## D. Page index

| Role | Count | Route prefix | Complete |
|---|:-:|---|---|
| Platform Super Admin | 6 | `/platform` | 4 ✅ · 2 🟡 |
| Branch Manager | 7 | `/branch` | 7 ✅ |
| Technician | 3 | `/tech` | 3 ✅ |
| Inventory Manager | 6 | `/inventory` | 6 ✅ |
| Tenant Owner | 8 | `/owner` | 4 ✅ · 4 🟡 |
| Team Leader | 4 | `/team-leader` | 4 ✅ |
| Data Analyst | 7 | `/analyst` | 7 ✅ |
| Customer | 6 | `/customer`, `/decide/:token` | 6 ✅ |
| Shared public | 6 | — | 6 ✅ |
| **Total** | **53** | | **47 ✅ · 6 🟡 · 0 unbuilt** |

## E. Capability index

`MULTI_BRANCH` · `MULTI_WAREHOUSE` · `INVENTORY` · `PART_RETURNS` · `EXTERNAL_PARTS` · `TEAMS` · `TEAM_REVIEW` · `QC` · `CUSTOMER_PORTAL` · `FINANCE_CORE` · `BILLING` · `QUICK_INSPECTION` — all 12 with complete removal policies, validated in CI. §7.2.

## F. Policy index

`INSPECTION_REQUIRED` · `APPROVAL_REQUIRED_SCOPE` · `TECHNICIAN_DIRECT_SEND` · `QC_MANDATORY` · `DELIVERY_BLOCKED_UNTIL_PAID` · `PARTIAL_PAYMENT` · `DISCOUNT_AUTHORITY` · `UNCOVERED_COUNTRY_BILLING` · `PARTS_SEPARATION_OF_DUTIES` · `RETURN_UNUSED_BEFORE_FINISH` · `APPROVAL_WEIGHT` · `PORTAL_COUNTER_APPROVAL` · `CUSTOMER_INVOICE_VISIBILITY` · `TIME_TRACKING` · `POST_CLOSE_ADDENDA` · `WORKING_WEEK` — all 16 `ENFORCED`. §8.3.

## G. Role index

`TENANT_OWNER` · `TENANT_ADMIN` · `BRANCH_MANAGER` · `TECHNICIAN` · `INVENTORY_MANAGER` · `TEAM_LEADER` · `DATA_ANALYST`, plus Platform Super Admin and Customer. §10.2.

## H. Workflow transition matrix

16 states · 20 intents · 12 gates · 3 graphs. Full matrix in §17.6; graphs in `packages/shared/src/capabilities/workflow-graphs.ts`.

| Graph | States | Terminal | Guarded by |
|---|:-:|---|---|
| `WORK_ORDER_GRAPH` | 16 | `CLOSED`, `CANCELLED` | 6 capabilities, 4 policies, 1 fact |
| `PART_REQUEST_GRAPH` | 15 (enum has 19) | `USED`, `RETURNED_TO_STOCK`, `REJECTED`, `CANCELLED`, `UNAVAILABLE` | `INVENTORY` (whole graph), `PART_RETURNS` |
| `CUSTOMER_DECISION_GRAPH` | 7 | `RESOLVED`, `EXPIRED`, `CANCELLED` | `CUSTOMER_PORTAL` (all but one edge) |

## I. API map

170 routes across 30 controllers. Full catalogue in §25 and [`docs/corpus/19_API_AND_DOMAIN_COMMAND_CATALOG.md`](docs/corpus/19_API_AND_DOMAIN_COMMAND_CATALOG.md).

| Prefix | Routes | Guard |
|---|:-:|---|
| `/auth` | 9 | none |
| `/public/*` | 4 | none |
| `/health` | 1 | none |
| `/access` | 1 | Session |
| `/platform/*` | 24 | Session + Platform |
| `/branch-manager` | 16 | Session |
| `/technician` | 17 | Session |
| `/inventory` | 20 | Session |
| `/finance` | 11 | Session |
| `/organization/*` | 25 | Session |
| `/customer-portal` | 8 | Session |
| `/team-leader` | 7 | Session |
| `/analytics` | 12 | Session |
| `/owner`, `/audit`, `/reporting` | 3 | Session |

## J. Test map

| Suite | Command | Count |
|---|---|---|
| Shared | `corepack pnpm --filter @mop/shared test` | 243 |
| API | `corepack pnpm --filter @mop/api test` | 871 (104 spec files, **62 integration**) |
| Web | `corepack pnpm --filter @mop/web test -- --watch=false --isolate=false` | 272 |
| Lint | `corepack pnpm lint` | 6 custom rules |
| **Browser / E2E** | — | **0** |

**The four proof obligations:** `validator.spec.ts` · `graph-safety.spec.ts` · `policy-consumers.spec.ts` · `lint-permission-keys.mjs`. §27.3.

## K. Gap index

**S1:** G-BILL-01 · G-OPS-01
**S2:** G-OPS-03 · G-INV-01…05 · G-EVT-01/02 · G-CTRL-01 · G-MSG-01 · G-FORM-01 · G-SEC-02 · G-PERM-01 · G-MODEL-01 · G-OPS-02
**S3:** G-PLAT-01/02 · G-OWN-01…04 · G-CUST-01/02 · G-INS-01/02 · G-I18N-01 · G-INV-06/07/08 · G-OPS-04 · G-FIN-01 · G-PEOPLE-01 · G-POL-01/02/03 · G-EVT-03
**S4:** G-DEBT-01…15

Full entries: [`docs/corpus/37_KNOWN_GAPS_AND_TECHNICAL_DEBT.md`](docs/corpus/37_KNOWN_GAPS_AND_TECHNICAL_DEBT.md).

## L. Decision index

D-001 … D-035. Load-bearing ones in §29; full records in [`docs/corpus/38_DECISION_RECORDS.md`](docs/corpus/38_DECISION_RECORDS.md).

## M. Glossary — the terms that carry precise meaning

| Term | Means |
|---|---|
| **Capability** | Whether a step exists at all. The only axis that may change reachability |
| **Policy** | The rule an existing step runs under. May never change reachability |
| **Specialisation** | What kind of work, and what shape of record |
| **Responsibility** | Which role *covers* the work a capability creates, in this workshop |
| **Intent** | The action a person takes, as opposed to the states it connects |
| **Guard** | A condition on an *edge* — capability, policy, or per-record fact |
| **Gate** | A condition on the *record* before a checkpoint |
| **Fact** | A per-work-order condition. A missing fact is false |
| **Effective graph** | The transitions a specific tenant actually has |
| **Stranded state** | A state reachable with no route out — what the validator refuses |
| **Core gate** | `owner: null`; no profile may drop it |
| **Provenance** | Where a part came from: inventory, external purchase, customer-supplied |
| **Effective-dated** | An edit closes the old row and opens a new one |
| **Compliant-blocked** | A tenant in a country with no billing adapter |
| **Impact preview** | What a destructive action will affect, shown before it happens |
| **Delegation** | The owner's switch: *has anyone but me been allowed to do this at all?* |
| **Absent, not hidden** | Restricted data is missing from the response |
| **Absent, not locked** | An unreachable control is not rendered greyed out |
| **No door** | Implemented, tested, and unreachable because no endpoint or control leads to it |
| **Honest partial** | An option that behaves conservatively and says so |
| **Not computable** | A metric whose inputs do not exist, reported as such rather than faked |

Full glossary: [`docs/corpus/39_GLOSSARY.md`](docs/corpus/39_GLOSSARY.md).

## N. Documentation cross-reference

```
README.md  (this file — the executive and technical entry point)
   ↓
docs/corpus/00_DOCUMENTATION_INDEX.md   (41 documents, every claim stage-labelled)
   ↓
docs/corpus/NN_*.md                     (specialist deep dives)
   ↓
docs/*.md                               (VISION · SYSTEMS · CAPABILITY_MODEL · PHASE_MAP ·
                                         PRODUCT_SPEC_CANONICAL · SCENARIOS · DESIGN_LANGUAGE ·
                                         UX_PRINCIPLES · DATABASE_STRATEGY · INFRASTRUCTURE ·
                                         PAGE_INVENTORY · POLICY_DECISION_INVENTORY · detailed-specs/)
   ↓
source code + tests
```

| Need | Go to |
|---|---|
| Where the project is right now | [`PROJECT_STATE.md`](PROJECT_STATE.md) · [`docs/AUTONOMOUS_EXECUTION_STATE.md`](docs/AUTONOMOUS_EXECUTION_STATE.md) |
| Per-page build status | [`docs/PAGE_INVENTORY.md`](docs/PAGE_INVENTORY.md) — **canonical** |
| Phase status | [`docs/PHASE_MAP.md`](docs/PHASE_MAP.md) — **canonical** |
| "Where do I change X?" | [`CODE_MAP.md`](CODE_MAP.md) |
| Rules you will be held to | [`docs/corpus/40_AGENT_ENGINEERING_GUIDE.md`](docs/corpus/40_AGENT_ENGINEERING_GUIDE.md) |
| Setup and troubleshooting | [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) |
| Commit conventions | [`CONTRIBUTING.md`](CONTRIBUTING.md) |

⚠️ **`docs/archive/` is historical only.** Two of its audits were found to be confidently wrong about built pages. **Treat any status claim there as stale until checked against code.**

## O. Tech stack

TypeScript · NestJS · Angular (standalone + signals) · PostgreSQL 16 · Prisma · pnpm 9.15 workspaces · Jest · Vitest · GitHub Actions · Node 24.

## P. Corrections made during this pass

Nine claims inherited from existing documentation were checked against the repository and **corrected**. Recorded here so a reader can calibrate how much of this document is re-derived rather than copied.

| Claim as previously written | Repository evidence | Resolution |
|---|---|---|
| *"Five of the eight resolver layers issue their own database query"* (`VISION.md` §4) | Layers are pure functions over a per-request context | **Fixed since VISION.md was written.** Corrected; the performance concern is closed |
| *"No realtime mechanism at all — no polling"* | `journey-poller.ts`, 20s, and Live View | Corrected: polling is a **deliberate decision**, push is what is absent |
| *"A closed union of 46 keys; a typo is a compile error"* | 45 keys; `eventKey: string`; 18 undeclared keys emitted | Corrected → **G-EVT-01** |
| *"`requestId` correlates an event with the request"* | `DomainEventEnvelope` unused; no column exists | Corrected → **G-EVT-03** |
| *"44 of 53 pages complete, 3 unbuilt"* (previous README) | 47 complete, 6 partial, 0 unbuilt | Corrected against `PAGE_INVENTORY.md` |
| *"Most of the API is tested only at the service layer"* (previous README) | 62 of 104 API spec files are real-Postgres integration | Corrected |
| Existence of an *"Honesty Harness"* | No such thing in the repository | Corrected: **it does not exist** |
| `PartRequestStatus` treated as fully reachable | 19 enum values, 15 in the graph | Corrected → **G-INV-01** |
| Prisma models assumed all in use | 8 with no production access | Corrected → **G-MODEL-01** |

---

## Licence

Proprietary. All rights reserved.

---

> **How to use this document.** Stop at §01 for an executive view. Stop at §02 for the implementation reality map. Read §03–§13 for the product and its configuration model. Read §14–§29 for the engineering. Read §30–§37 for reality, gaps and assessment. Every section states what was intended, what was built, what is connected, what is verified, and what is missing — and where those differ, it says so.
