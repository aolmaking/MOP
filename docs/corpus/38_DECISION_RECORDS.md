# MOP — Decision Records

> **Document ID:** DOC-38
> **Purpose:** the architectural and product decisions that shaped MOP, each with its context, the options considered, what was chosen and what it costs.
> **Authority:** HISTORICAL. A decision here is not re-litigated without new information.
> **Scope:** decisions with lasting structural consequences.
> **Last verified:** 2026-09-01 against commit `a8c8bb5`.
> **Note on numbering:** no prior `D-nnn` series exists anywhere in this repository — the reasoning lived in source comments, phase documents and `REBUILD_PLAN.md`. This file establishes the series by collecting it. Where a decision was recorded elsewhere, the source is cited.
> **Related:** 01 (philosophy), 22 (invariants), 37 (deferrals).

---

## D-001 · Rebuild rather than repair v11.9
**Context.** v11.9 had a named 10-stage permission hierarchy nothing iterated, write-only configuration, a centralised audit service nothing imported, and gates hardcoded to `true`.
**Options.** Repair in place · rebuild with the same shape · rebuild with structural enforcement.
**Chosen.** Rebuild, with every load-bearing rule enforced by a lint rule, a constraint or a CI assertion rather than by convention.
**Why.** Each failure was *believable, visible and false*. Culture had already failed at each of them once.
**Consequence.** Six lint rules and four CI proof obligations. v11.9 deleted at `b0a4e68`.
**Source.** `REBUILD_PLAN.md`, `docs/archive/audits/GAP_ANALYSIS_CANONICAL_SPEC.md`.

## D-002 · Waterfall, not agile
**Context.** Foundations are inherited by every phase after them.
**Chosen.** Phases in order, with a detail document each. Re-planning at a phase boundary is expected; **silent drift is not** — a task that cannot be completed is recorded with a reason and a phase by which it must land.
**Cost.** Slower to first demo. Accepted deliberately.
**Source.** `CLAUDE.md`, `PHASE_MAP.md`.

## D-003 · Capability removal is rewiring, not hiding
**Context.** A one-bay shop and a twelve-branch dealership run the same code.
**Options.** Feature flags that hide UI · per-tenant forks · capability removal with declared replacement behaviour.
**Chosen.** The third. Every non-core capability carries a complete `RemovalPolicy`, and the guarantee — *every reachable non-terminal state still reaches a terminal state* — is **checked before a change is applied**.
**Why.** Hiding a button leaves the process broken underneath. Removing Inventory without dropping the parts gate strands every job in the workshop.
**Consequence.** `validator.spec.ts` proves it for every shipped profile in CI.

## D-004 · A gate belongs to the capability that produces what it checks
**Context.** Gates were free strings inside each removal policy.
**Chosen.** A gate registry with an owner per gate; core gates have `owner: null` and no profile may drop them.
**Why.** Two capabilities once disagreed about `parts.received_used_or_returned` — one dropped it, the other kept it — resurrecting a check nothing could satisfy and **stranding every job in the workshop.** A typo (`qc.pased`) could also silently create a gate nothing satisfies.
**Consequence.** Gate keys are a closed union; ownership is a type-level fact.

## D-005 · Policies may never change reachability
**Context.** Policies needed to reach the workflow graph, and reaching it is dangerous.
**Chosen.** A policy condition may only **narrow the choice between routes that all still reach a terminal state.** `graph-safety.ts` proves it for every option of every policy across every profile.
**Why.** It is the mechanical test that separates a policy from a mis-classified capability. Without it, one policy option could strand a job in production.
**Consequence.** Four policies appear on edges; all are proven safe in CI.

## D-006 · Finance Core and Billing are separate bounded systems
**Context.** In several markets an invoice is a compliance artefact that must be cleared by a government portal, not a formatted total.
**Options.** One finance system · two systems with a contract.
**Chosen.** Two. `BILLING` depends on `FINANCE_CORE`; `historicalRecordPolicy` is `EXTERNAL_REFERENCE_ONLY` for Billing.
**Why.** They have different lifecycles, different failure modes and different immutability rules. The split earns its keep the moment a workshop wants *External Billing Mode* — MOP keeps the money, the legal document comes from accounting software.
**Consequence.** A country-adapter seam; two capabilities; two gates. **The cost is that the seam is empty** — G-BILL-01.

## D-007 · Money is `Decimal` in the database and `string` across the API
**Options.** Float · integer minor units on the wire · `Decimal` on the wire · string.
**Chosen.** String. Internally integer minor units.
**Why.** A JS number cannot hold `0.1 + 0.2`; a `Decimal` would drag Prisma's runtime into the browser. **A string is the only representation that is exact, portable and serialisable.**
**Consequence.** `tools/lint-money.mjs` fails the build. More than two decimal places is **refused, not rounded** — *round it deliberately before it gets here.*

## D-008 · `WorkOrderLifecycleService` is the only writer of `WorkOrder.status`
**Context.** v11.9's lifecycle was spread across whichever services needed it. **Six of sixteen statuses had no code path that set them**, and one was set by a free-text label while the real enum stayed behind.
**Chosen.** Every other service sends an **intent**; the lifecycle service consults the capability-aware graph.
**Why.** *"Technician finishes"* lands on review, QC, invoicing or delivery depending on the workshop's shape. The branching belongs in the graph, not in an if-chain.
**Cost.** ⚠️ Enforced by convention and review, **not by a lint rule** — unlike the audit boundary it resembles. G-DEBT-03.

## D-009 · One audit writer, lint-enforced
**Context.** v11.9 had a centralised audit service nothing imported and ten hand-rolled writers.
**Chosen.** `AuditService` alone, with `tools/lint-audit-boundary.mjs` failing the build on any `AuditLog` write outside `apps/api/src/audit/**`.
**Why.** *Which fields did we capture* must never depend on which module wrote the row.
**Consequence.** `audit/` stays top-level because **the lint rule matches this literal path.**

## D-010 · A closed union of domain events, not free strings
**Chosen.** 45 keys in `contracts/events.ts`, grouped by emitting system.
**Why.** A typo should become a compile error, and *which events exist* should have one answer instead of being discovered by grepping for emit calls — which is how v11.9 ended up with modules that quietly bypassed the pipeline.
**⚠️ Not currently realised.** `EmitOperationEventInput.eventKey` is typed `string`, and `OperationEventKey` is imported only by its own spec — so the union is **decorative on the emit path**, which is the exact failure class D-001 exists to prevent. 45 declared, 27 emitted, **only 9 in both**: Finance and Inventory each grew an undeclared vocabulary. The decision stands; the enforcement does not, and converging the two schemes is now a data migration because emitted keys are stored on historical rows. Gaps G-EVT-01/02.

## D-011 · Historical records are interpreted against the configuration in force at the time
**Chosen.** `TenantCapability` and `WorkshopPolicy` are time-ranged; `PriceCatalogEntry` is effective-dated; `MessageTemplate` is immutable per version; `SpecializationEntry` pins its definition version.
**Why.** **An old invoice must never silently reprice**, and a card filled last year must keep meaning what it meant.
**Consequence.** `resolveAsOf()`; the dossier drawer renders the shape in force when the job opened.

## D-012 · An absent capability key means `ENABLED`
**Chosen.** A profile records **deviations** from the full product.
**Why.** The inverse is the dangerous reading: it silently strips every capability from a tenant whose provisioning half-finished. A freshly-provisioned workshop with no rows is a complete workshop.
**Consequence.** One function, `isCapabilityActive()` — three places were deriving it independently, and a service that gets it backwards tells a real workshop it has no inventory.

## D-013 · Capability sits above role and user override in the resolver
**Chosen.** Ceilings 1–7, then narrowing, then role template, then user override.
**Why.** **A permission must never resurrect a function the workshop does not perform.** Granting `inventory.request.issue` in a workshop with no inventory still denies. Without this ordering the capability model is decoration.

## D-014 · Permission layers are pure over a per-request context
**Context.** Six of nine layers queried the database themselves; resolving ten keys for one page cost sixty round-trips on the hottest path.
**Chosen.** Load one `PermissionContext` per request; layers are pure functions over it; `resolveMany` answers many keys at the cost of one.
**Also.** Purity makes each layer trivially testable — a snapshot in, a decision out.

## D-015 · `PlatformGuard` deliberately bypasses the resolver
**Chosen.** *Are you a platform account, yes or no.*
**Why.** Every resolver layer defers when there is no `tenantId`, which is always true for a platform session, and per the spec Super Admin has unconditional control.
**Cost.** The five `platform.*` permission keys are declared and checked by nothing — a granularity the product implies and does not have.

## D-016 · The customer's view is a translation, not a filter
**Chosen.** *"Inventory Manager created a supplier order for unavailable brake pads"* becomes *"We are waiting for a required part."*
**Why.** **This is a security boundary, not a presentation concern.** If it is in the payload and hidden by CSS, it has already leaked.
**Consequence.** Customer-safe wording lives on the capability's removal policy, so it survives capability changes rather than living in a component.

## D-017 · The approval step is core; the portal is a channel
**Chosen.** `customer_decisions_resolved` and `critical_warning_acknowledged` are **core gates with no owner**. Removing `CUSTOMER_PORTAL` adds counter-approval edges.
**Why.** A workshop with no portal still needs the customer's answer. Without the replacement edges every decision would strand at `PENDING` and no work could ever be approved.
**Consequence.** `PORTAL_COUNTER_APPROVAL` is the only `CORE`-posture policy, and **attribution to staff holds unconditionally under all three options.**

## D-018 · Stock rises only when a human accepts a return
**Why.** Stock is a claim about the physical world and the two drift. Systems that survive put a human where the two must agree. A technician saying *"I didn't use it"* is a claim; a storekeeper putting it back on the shelf is a fact.
**Consequence.** The `returnPendingQty` bucket exists because a returned part is genuinely neither sellable nor still issued.

## D-019 · Never-negative stock is enforced twice
**Chosen.** A service refusal **and** a database `CHECK` constraint.
**Why.** *Service code is a promise; a constraint is a fact.* The constraint stops a seed script, a data fix or a future service from writing a negative quantity of a physical object.

## D-020 · Payment idempotency is a unique constraint, not a check-then-write
**Chosen.** `Payment.idempotencyKey` unique; a replayed key with **different content** returns `409 idempotency_conflict`.
**Why.** A lookup has a window and a constraint does not. Silently succeeding on a changed replay would produce two truths under one identity.

## D-021 · A caller's transaction is passed into the lifecycle
**Context.** Edge case H1 — a blocker reported while another was being resolved.
**Chosen.** `apply()` accepts `options.tx`.
**Why.** **A lock that does not extend to the write it authorises is not a lock.** The decision and the write must be one transaction.

## D-022 · Polling, not push
**Chosen.** A 20-second poll on the journey strip and Live View. **Never optimistic** — the strip is redrawn only from a server response.
**Why.** No WS/SSE infrastructure exists; introducing one would be a new runtime dependency, a new failure mode and a new thing to operate, for a screen whose truth changes on a human timescale. One cadence, so there is one answer to *how live is live*.
**Consequence.** `journey-poller.ts` is the single place that changes if push arrives.

## D-023 · The scheduler is a lock, not a worker process
**Context.** `@Cron` fires in every replica.
**Chosen.** `pg_try_advisory_xact_lock` — transaction-scoped (a crashed replica cannot hold it forever), non-blocking (`_try_`), returning `null` rather than rejecting, keyed by `hashtext(jobName)`.
**Why.** Phase 13's need was single-flight, not throughput. A separate worker remains available and unbuilt.

## D-024 · One shell per role
**Why.** The technician's requirement — bottom nav, three pages, gloved hand — and the storekeeper's — rail, long desk sessions — are opposites. A single shell branching on role serves neither and grows a branch per future role.
**Consequence.** A concept used by two roles lives in `domain/`, with one implementation and one presentation per role.

## D-025 · Absent, not disabled; absent, not empty
**Chosen.** A control the user may never reach is not rendered greyed out; a section with nothing meaningful does not render as a blank shell.
**Why.** A greyed control invites a support ticket; an absent one does not exist. **Empty is a valid and desirable state** — an empty Attention Center is a good day.

## D-026 · Colour is rationed, and never the only signal
**Why.** *If everything is coloured, nothing is.* And roughly 1 in 12 men has a colour-vision deficiency — **in a workshop that is most of the staff**, so every status carries text or shape as well as colour.
**Consequence, accepted.** MOP looks plainer than a marketing site.

## D-027 · Radius is 2/3/4px, derived from the object
**Why.** **A job card is a rectangle.** The previous 4/6/10px range is the default of nearly every generated interface and a named tell of one; at 6–10px a dense row of cards reads as a set of buttons.

## D-028 · Arabic and RTL from the first component
**Chosen.** Logical CSS properties only, lint-enforced, plus `dir` handling and bidi isolation from Phase 1.
**Why.** *Cheap now, expensive later.* Retrofitting direction after five roles are built is the expensive version.
**Cost.** The mechanism shipped; **the translation pass never did** — G-I18N-01.

## D-029 · An `ENFORCED` policy must name consumers that exist
**Chosen.** `PolicyEnforcement` distinguishes `ENFORCED` (with a consumer list asserted against the source tree in CI) from `RECORDED` (empty, and the UI says so).
**Why.** A configuration screen implying a stored string changes behaviour when nothing reads it is the same class of defect as a gate hardcoded to `true`.
**Consequence.** `RECORDED` is not a lesser state to hide — the row is real, audited and time-ranged the moment it is written.

## D-030 · The seed creates two differently-shaped tenants
**Why.** A single-tenant database makes isolation and shape bugs invisible. *Delta is the shape that breaks naive code* — any code assuming an inventory, a team or a second branch fails against it before reaching a customer.

## D-031 · Workshop creation is a nine-stage journey, not a form
**Why.** Creating a workshop is the act of defining its operating model. A single form could express none of the capability, policy, responsibility or structure decisions that actually shape one.
**Consequence.** One transaction; the browser previews with **the same `validateDraft` the server refuses with**.

## D-032 · The responsibility stage exists because a capability can be orphaned
**Context.** Enabling `INVENTORY` gives a workshop part requests gated behind permissions only `INVENTORY_MANAGER` holds. A shop with no storekeeper gets a capability **nobody in the building can operate.**
**Chosen.** Ask at creation; the answer writes real `RolePermission` rows.
**Guard rails.** It never invents a permission or a role — every key transferred is one the dedicated role already holds, moved to a role the map already treats as senior.

## D-033 · Plan ceilings are enforced on an ongoing basis
**Context.** `maxBranches` / `maxUsers` / `maxWarehouses` were checked once, at creation, and never again.
**Chosen.** `PlanLimitsService` asserts capacity as the **first** check in all three creation paths, throwing a 403 that names the actual limit.
**Related decision.** Per-workshop overrides are **not built**: a plan swap already expresses *this workshop has a different limit*, end to end. A `ControlSetting` override waits for a real *"same plan, one exception"* need.

## D-034 · Say what the workshop does, never what the software has
**Chosen.** *"Parts are requested, issued and tracked against stock"*, never *"Inventory module"*.
**Mechanism.** Capability copy is an exhaustive `Record<CapabilityKey, …>`, so a capability added without copy **fails the build** rather than rendering as a raw key — and the copy dies with the capability.

## D-035 · Record the anomaly rather than refusing, when refusing destroys information
**Context.** Edge case E19 — a customer decision landing against stale ownership.
**Chosen.** Flag it in the audit trail rather than block it.
**Why.** Refusing would strand a real customer answer. The general rule: **when refusing would destroy real information, record the anomaly instead.**

---

## Writing a decision record

1. **Context** — what forced a choice.
2. **Options** — including the one that looks obvious.
3. **Chosen**, and **why**, in terms of the failure it prevents.
4. **Consequence**, including what it costs.
5. **Add it here in the same commit** as the change it explains.
6. **A decision is not re-litigated without new information** — but new information is a legitimate reason to supersede one, and a superseded decision stays, marked.
