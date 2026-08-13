# Phase 21 — Policy & Decision Architecture

> **Status:** 🟠 architectural resolution pass complete — relevance graph built and proven acyclic (4 cycles found and fixed), S-01 resolved into three sub-questions (two decided, one deferred with a named unblock condition), QC decomposed (new decision P-71), owner-authority conflict recorded as OPEN rather than assumed. **No implementation. Awaiting owner review, per the explicit stop boundary in §18.**
> **Deliverable:** a complete, structured inventory of every decision that can define a workshop, plus the model that makes those decisions typed, contextual, and composable.
> **Companion:** [`POLICY_DECISION_INVENTORY.md`](../POLICY_DECISION_INVENTORY.md) is the inventory itself. This document is the *model* the inventory is written against.
> **Date:** 2026-08-13.

---

## 1. Goal

Make the decision space explicit before the implementation commits us to one direction.

Concretely: identify every question whose answer changes how a workshop behaves, enumerate the answers, name a recommended default for each, and — critically — define **which workshops each question is even relevant to**, so that creating a workshop becomes the act of defining that workshop's operating model rather than filling in one universal form.

This phase produces documents, not code. Nothing is implemented until the inventory is complete and reviewed.

## 2. Why this phase exists

Three independent pieces of evidence, from three different parts of the project, all point at the same missing layer.

**The canonical spec already asked for it, and it was never built.** `docs/detailed-specs/platform-super-admin.md` describes a Builder Control sub-workspace with five tabs, one of which is **Workflow Policy**, listing eleven policies by name: quick inspection on/off, quick service on/off, customer approval rules, critical rejection warning required, team leader review required, QC required, time tracking optional/required/off, return-unused-required-before-finish, delivery-blocked-until-payment, technician-can-send-directly-or-needs-review, discount approval thresholds. None of these exists as a typed, resolvable thing today. Each one is currently either hardcoded, conflated with a capability, or simply absent.

More striking: that same spec section already anticipates the relevance problem. It says a Workflow Policy toggle with a role dependency must show *"Team Leader is disabled at this workshop — enabling this will be blocked at Publish."* That is a relevance predicate, described in prose, two years before anything was built to evaluate one.

**The scenario passes found the same gap from the workshop floor.** `docs/scenarios/FINDINGS_SYNTHESIS.md` records the sharpest instance: the delivery gate drew **opposite complaints** from two workshops — paid-before-release is correct for Nafath and wrong for Delta's net-30 B2B jobs — and names the resolution itself: *"resolved by making the policy workshop/account-configurable rather than picking a side."* The customer decision link produced the same shape of finding: correctly heavy for a safety warning, absurdly heavy for a wiper-blade upsell.

**And the codebase has already been forced to revert for want of it.** Phase 19.A built separation-of-duties enforcement as a global rule. It broke 22 existing Inventory tests modelling a legitimate single-storekeeper shop, and was reverted. `PHASE_19.md`'s own conclusion: *"the real fix needs a per-workshop opt-in policy, not a global rule."* There was nowhere to put the policy, so the feature was withdrawn rather than shipped wrong.

Three sources, one conclusion: **there is a third axis of variation with no engine, no home, and no owner.**

## 3. The three axes, and the test that separates them

| Axis | Question it answers | Engine | Governed by |
|---|---|---|---|
| **Capability** | *Does this step exist here?* | `packages/shared/src/capabilities/` ✅ built | Reachability proof |
| **Specialization** | *What is it called, what fields does it carry?* | Phases 15–17 🟠 partial | Definition versioning |
| **Policy** | *The step exists and is named correctly — under what rule does it pass?* | ❌ **this phase** | Typed options + defaults |

### 3.1 Design decision — the objective test for capability vs. policy

A prose definition ("capability is existence, policy is behaviour") is true but too soft to settle real cases. This phase adopts a sharper, mechanical test:

> **A policy may never change reachability. If a proposed setting could change whether a work order can reach a terminal state, it is a capability that has been mis-classified as a policy.**

This is not a stylistic rule. It is what keeps the capability engine's central guarantee intact. Today the validator proves that no configuration can strand a work order. If policies could alter the lifecycle graph, that proof would have to expand to cover the product of every capability profile and every policy combination — a combinatorial explosion, and the end of a guarantee that currently holds absolutely.

So policies sit deliberately **outside** the reachability validator, and the price of that is the rule above, enforced at registration time.

Worked examples of the test:

- *"Does this workshop have scheduling?"* — changes which states exist → **capability**.
- *"Scheduling exists; may a technician start work with no appointment?"* — the same states exist either way, only the permitted route differs → **policy**.
- *"Is QC required?"* — this one is genuinely a **capability**, and the test says so: removing QC removes `READY_FOR_QC` and reroutes finish. The canonical spec listed it under Workflow Policy, and the spec is wrong on that point. Recording the disagreement here rather than silently reclassifying.
- *"Delivery blocked until payment?"* — `PAYMENT_PENDING` and `READY_FOR_DELIVERY` both exist either way; the gate either blocks or does not, and terminal states remain reachable through both settings → **policy**. This is the flagship case.

### 3.2 Design decision — decision sets are derived, not enumerated

**This is the load-bearing idea of the whole phase, and it comes from the project owner.**

The naive version of this feature is one fixed questionnaire of fifty questions that every workshop answers. That version fails for a specific reason: most questions would be *meaningless* for most workshops. Asking a diagnostics-only shop how part returns should be approved is not merely annoying — it produces a stored answer that is nonsense, which some later page will read and act on.

Instead, every policy declares a **relevance predicate** over the workshop's capability profile, its specializations, and — importantly — its *other policy answers*:

```ts
interface PolicyDefinition {
  key: PolicyKey;
  question: string;
  options: readonly PolicyOption[];      // 2..n, each with its own meaning
  default: PolicyOptionKey;              // exactly one, always
  defaultReason: string;                 // REQUIRED — see §3.3
  relevantWhen: RelevancePredicate;      // over capabilities + specializations + prior answers
  mutability: "FREELY" | "GOVERNED" | "IMMUTABLE_AFTER_FIRST_USE";
  dependsOn: PolicyKey[];                // for DAG validation
}
```

The questionnaire is then a *derived artifact*: given a capability profile and a specialization set, the system computes which questions apply. One workshop gets 15 questions, another 40, and neither is a special case in the code.

**Consequence that must be handled:** because relevance can depend on other policy answers, the relevance graph is a DAG, and a cycle in it would make the questionnaire undefinable. Cycles are rejected at registration time by a test — exactly the discipline the capability registry already applies to its own `dependsOn` integrity check.

**Second consequence:** relevance changes over a workshop's life. Turning `INVENTORY` off later makes several policies irrelevant. Their answers are **preserved and marked dormant, never deleted** — mirroring `CAPABILITY_MODEL.md`'s Rule 2, so that re-enabling the capability restores the workshop's previous behaviour instead of silently resetting it to defaults.

### 3.3 Design decision — a default is a product decision, and must carry its reason

Every policy declares exactly one default. **A policy definition without a written `defaultReason` cannot be registered** — enforced by the type system and a test, the same mechanism that stops a capability from being registered without a complete removal policy.

The reason for the requirement: a default that is merely "the first option in the list" is an accident that hardens into product behaviour for every workshop that clicks *Use recommended defaults*. If we cannot articulate why an option is the normal case, we have not finished thinking about the decision.

This makes `Use Recommended Defaults` at the end of workshop creation a legitimate one-click path rather than a shortcut that hides fifty unexamined choices.

### 3.4 Design decision — consumption is through typed contracts, never `if` at the call site

The failure mode this phase must avoid is the one `VISION.md` §3.2 already names: *"configurability quietly becomes a second, worse programming language, with no type system, no tests, and no way to reason about what a given tenant's configuration actually does."* Fifty booleans scattered through service code as `if (policy.x)` is that failure with extra steps.

The discipline: a policy resolves to a value from an **exhaustive typed union**, and consumers switch over it exhaustively. Adding a new option to a policy then becomes a **compile error at every site that must handle it** — which is the property that makes the layer safe to extend. A policy read must never return a raw string or boolean out of a config blob.

### 3.5 Design decision — policies are time-ranged

Same shape and same reason as `TenantCapability`. Interpreting a two-year-old work order requires knowing the policy in force when it happened. A job delivered without payment in 2026 reads as a compliance failure unless the system knows delivery-before-payment was permitted then. A flat current-value column cannot answer that; a time-ranged row can.

### 3.6 Design decision — post-creation changes use the existing governed pipeline

Policy changes are not settings-page saves. They run the pipeline capability changes already use — **draft → validate → impact preview → apply → audit → rollback** — because the impact is the same kind of thing: *"14 jobs are currently in Payment Pending. Turning off delivery-blocked-until-payment releases all of them."* That number must be computed live and shown before confirmation, never discovered afterwards.

Three mutability classes are declared per policy, because they are genuinely different:

- **FREELY** — safe to change any time, no in-flight consequence (e.g. whether time tracking is prompted).
- **GOVERNED** — changeable through the pipeline with an impact preview (most policies).
- **IMMUTABLE_AFTER_FIRST_USE** — cannot change once real data exists (invoice numbering scheme, currency). Declared explicitly so the UI can refuse rather than fail at apply time.

### 3.7 Design decision — build posture, and the test for what may be prebuilt

The project owner's broader direction: push complexity **backwards into the platform at build time** rather than forwards into per-workshop customisation at deployment time. The destination is a platform that already contains its systems, where creating a workshop chooses which are activated, how they behave, and how they are named — not one where each new workshop shape means new architecture.

**This is a known architectural strategy — a software product line — and it has a known failure mode.** It is worth naming both precisely, because the failure is not the one people usually guard against.

The failure is *not* the cost of building features up front. It is that **the cost of a configurable platform lives in the interaction surface between its capabilities, not in the capabilities themselves.** Twelve independent capabilities are twelve units of build cost but up to 4,096 configurations to reason about. Products that attempt this and collapse do so because they end up testing configurations, and the number of configurations outruns them.

**MOP has the property that decides which way this goes, and most platforms attempting this do not.**

The capability engine does not test 2ⁿ configurations. It *proves a property over a declared graph*: after any capability change, every reachable non-terminal state must still have a path to a terminal state. That is a **compositional guarantee** — it holds for combinations nobody enumerated, including ones that do not exist yet. It is the difference between combinatorial testing (which does not scale) and a proof obligation (which does).

That the interaction surface is real, and already bit this project once, is not hypothetical: `CAPABILITY_MODEL.md` Rule 2a exists because Inventory and Part Returns *interacted* — each removal policy was correct in isolation, and together they resurrected a gate nothing could satisfy, stranding every job. It was caught by the validator, not by a test of that specific pair. That is the model working exactly as intended, and it is the evidence that the strategy is viable here.

**So the philosophy is sound exactly to the extent that each prebuilt thing arrives with a compositional proof obligation, and unsound the moment something is prebuilt that cannot carry one.** That gives a mechanical test, in the same spirit as §3.1's:

> **A capability may be prebuilt-and-activatable only if (a) it can declare a complete removal policy, (b) its effect on reachability is computable by the existing validator, and (c) enabling or disabling it requires no schema fork and no data migration.**
>
> **If enabling it needs a divergent schema, a migration, or per-combination testing, it is not an activatable capability — it is a fork wearing a toggle**, and prebuilding it imports the combinatorial cost the strategy exists to avoid.

Clause (c) is `CAPABILITY_MODEL.md` Rule 2 restated as an admission criterion. It is what makes activation reversible and history-safe, and it is the clause most likely to disqualify a candidate.

#### The build-posture taxonomy

Every entry in the inventory now carries a **posture** — the answer to "what kind of thing should this be?", which is a different question from "what is this decision?".

| Posture | Meaning | Admission requirement |
|---|---|---|
| **CORE** | Always present, structurally not removable | Removing it means it isn't MOP |
| **PREBUILT-ACTIVATABLE** | Built into the platform, inert until switched on | Must pass all three clauses of the test above |
| **POLICY-CONTROLLED** | Exists always; only its rule varies | Must not change reachability (§3.1) |
| **VOCABULARY** | Workshop-defined names/fields | Specialization engine |
| **BOUNDED-SEPARATE** | Its own system behind a contract | Justified by an independent lifecycle — Billing is the shipped precedent |
| **INTEGRATION-SEAM** | Deliberately *not* built; an adapter boundary instead | Owned by someone else's domain (accounting, telematics, payment rails) |
| **DEFERRED-UNTIL-DEMANDED** | Real, buildable, but no evidence anyone needs it | Prebuilding is speculation, not investment |

The last two are the honest counterweight to "prebuild it all", and this phase must apply them with the same rigour as the others — otherwise the inventory becomes a wish list, and `CLAUDE.md`'s own instruction against designing for hypothetical requirements is quietly abandoned.

#### Where the philosophy breaks down — stated plainly

Four places where prebuilding is the *wrong* call, to be applied as disqualifiers in the inventory:

1. **Anything needing a divergent schema.** Fails clause (c). Multi-session jobs at multiple locations (P-41) and the B2B account model (P-42) are the live candidates — each is a genuine data-shape change, not a toggle.
2. **Anything whose "off" state still costs.** A prebuilt capability must be genuinely inert when disabled. If it leaves dormant tables, background jobs, or permission keys that must still be reasoned about, it is not free, and twelve of those are not free twelve times over.
3. **Anything owned by another domain.** Payment rails, accounting ledgers, telematics, e-invoicing clearance. `BILLING: EXTERNAL` is the existing precedent for getting this right: MOP models the *seam*, not the system behind it.
4. **Anything with no second customer.** One workshop wanting something is a feature request. Two independently wanting it is a capability. The scenario passes are the evidence base; a candidate that appears in zero of the 60 scenarios has not earned prebuilding.

#### The honest cost, stated

Even done correctly, this strategy is not free. Each PREBUILT-ACTIVATABLE capability adds: a removal policy to maintain, validator surface, seed/profile coverage, and — the one most often missed — **a permanent obligation that every future lifecycle change be re-proven against it.** The proof cost is linear in capabilities, which is the whole argument for this approach; but linear is not zero, and a registry of forty capabilities means every lifecycle edit is checked against forty removal policies in CI.

That is an acceptable price for the guarantee. It is not an acceptable price for capabilities nobody asked for.

## 4. What this phase produces

1. **The model** — this document. ✅
2. **The inventory** — [`POLICY_DECISION_INVENTORY.md`](../POLICY_DECISION_INVENTORY.md), every decision documented against the 18 fields the project owner specified, built in tranches by domain. ✅ all tranches written.
3. **A classification verdict for every entry** — capability / policy / specialization / other, decided by §3.1's test, with disagreements against the canonical spec recorded rather than smoothed over. ✅
4. **A build posture for every entry** — §3.7's taxonomy, answering what *kind of thing* each should be and whether prebuilding it is justified or speculative. ✅
5. **The relevance map** — which decisions each workshop model actually faces. 🟠 predicates stated per decision; the consolidated map and its acyclicity proof are owed.

## 5. What this phase explicitly does NOT do

- No `WorkshopPolicy` table, no `POLICY_REGISTRY`, no resolver.
- No questionnaire UI, no changes to Add Workshop.
- No Governance Controls page.
- No re-attempt at Phase 19.A's separation-of-duties enforcement, even though this phase identifies exactly the policy it was missing.

Implementation is Phase 22's job, and only after the inventory is reviewed and the model agreed.

## 6. Exit criteria

1. ✅ Every decision found across the roadmap, completed phases, deferred items, all three scenario passes, the canonical specs, and the current schema is recorded in the inventory.
2. ✅ Every recorded decision has all 18 fields, a classification verdict, a build posture, and exactly one default with a written reason.
3. ✅ The relevance predicate for every policy is stated, and the resulting relevance graph is acyclic — **four latent cycles found and fixed in §9**, not merely asserted acyclic.
4. ✅ Every decision the canonical spec's Workflow Policy tab names is classified, including QC, resolved by decomposition in §8.D.
5. ✅ The seven remaining edge-case register items are each mapped to a decision — §14.
6. 🟠 **Reviewed with the project owner** — this document is the material for that review; not yet ratified.

## 8. Architectural resolution pass

Answers the questions §7 left open. **Status states used throughout, per the project owner's explicit instruction — a question is not DECIDED merely because a plausible answer was found:**

| State | Meaning |
|---|---|
| **DECIDED** | Settled by direct evidence already in the codebase or an existing written decision |
| **EVIDENCE-BACKED** | A clear verdict follows from the scenario evidence; not yet ratified by the owner |
| **PROPOSED** | A reasoned recommendation where evidence is suggestive, not conclusive |
| **BLOCKED** | Cannot be resolved until a named other decision resolves |
| **DEFERRED** | Real, but no evidence justifies deciding it now |
| **OPEN** | Insufficient evidence, or two authoritative sources disagree, and no answer is given |
| **INVARIANT** | Not a choice — structurally forced |

### 8.A — S-01, scheduling

**Method note.** The instruction asked for a focused scenario pass "using the same disciplined approach as the previous passes." Re-reading the three existing passes first: `docs/scenarios/` already contains substantial, first-hand scheduling evidence — Nafath's Scenario 4 (the Thursday queue), SpeedLube's Scenario 17 (the 20-minute SLA clock), Delta's field-service scheduling (11.1–11.4), and Workshop B's per-bay appointment need — because scheduling was already the single most-repeated finding in that pass (`FINDINGS_SYNTHESIS.md`: found in **4 of 4** workshops, the highest frequency in the entire table). Commissioning a fourth, freestanding scenario pass would be re-deriving evidence that already exists in disciplined form. What was missing was not evidence — it was a **verdict**. This pass supplies one, grounded in what the four workshops actually said.

**The finding that resolves it: S-01 was one question pretending to be simple. Re-reading the evidence, it is three, at three different levels of readiness.**

| Sub-question | What the evidence shows | Verdict |
|---|---|---|
| **S-01a — Promise time / queue ordering** ("come at nine, done by ten") | Every one of the four workshops wanted this; it is the literal example in Nafath's scenario 4. **Already shipped** — `WorkOrder.promisedAt` (16.A) and `expectedDurationMinutes` with a real `SLA_OVERRUN` Attention Center signal (16.E), proven by four integration tests | **DECIDED — closed.** No new capability needed; this need is already served by existing `WorkOrder` fields, correctly classified as data/policy-level, not a capability |
| **S-01b — Physical resource occupancy** (lifts, bays, crews — "can I take another car?") | Nafath (4.2: two lifts, no way to know), SpeedLube (six pit bays, brand identity *is* bay throughput) | **EVIDENCE-BACKED → PREBUILT-ACTIVATABLE.** See test below |
| **S-01c — Pre-intake appointment booking + field-service travel scheduling** | Workshop B ("appointments per bay"), Delta ("field visit scheduling with travel time") — **two workshops, two different shapes** of the same underlying need | **OPEN — insufficient evidence to specify one design.** See reasoning below |

**S-01b passes the admission test, cleanly.** A `Resource` table (workshop-defined type + instance, per Phase 17's setup-time authoring — already the reason 16.B was deferred, not abandoned) plus an occupancy record referencing `WorkOrder.id`: no schema fork (both are new, inert tables — an existing tenant with no resources declared is byte-for-byte today's schema), no migration, and its effect on reachability is **zero** — occupancy gates *intake* (can this workshop accept another car), never a work-order state transition. This is the same shape as the `EXTERNAL_PARTS` capability: real, additive, provably inert when unused.

**Recommendation for S-01b: build it, sequenced exactly as `PHASE_16.md` already recommended** — after Phase 17's setup-time resource authoring lands, not before, since an occupancy model against resource types nobody declared would be speculative. This is not a new decision; it is confirmation that 16.B's existing deferral reasoning was already correct, now stated with an explicit admission-test pass rather than an assumption.

**S-01c does not pass the same bar, and forcing an answer would be exactly the mistake this phase exists to prevent.** Workshop B wants slots against a fixed set of bays at one physical location. Delta wants a *technician and a truck* travelling to a customer site, where the "resource" is time and distance, not a bay. These are not the same problem wearing different labels — a bay-slot model does not represent travel time, and a travel-time model is overbuilt for a workshop with six fixed bays. Building one design for both risks the fixed-schema mistake §3.7 warns against; building two is prebuilding for one customer each, which §3.7's fourth disqualifier explicitly rules out even though *two* workshops are asking, because they are asking for different things.

**Verdict on S-01c: DEFERRED-UNTIL-DEMANDED**, with a specific unblock condition recorded rather than a vague "later": revisit when a real tenant of either shape (appointment-book or field-service) is being onboarded, and scope the *specific* shape that tenant needs rather than a general appointment system. If built, its recommended posture is **BOUNDED-SEPARATE** — its own small lifecycle (`booked → confirmed → arrived/converted → no-show/cancelled`), referencing `WorkOrder` only loosely (a nullable link once intake happens), the same relationship Billing has to Finance.

**Decisions blocked by S-01, explicitly:**

| Blocked decision | Blocked on | Now unblocked? |
|---|---|---|
| P-13 (walk-ins allowed) | S-01b | **Yes** — meaningful once resource occupancy exists |
| P-49 | **Same decision as S-01b** — see §9.2, a duplicate entry found during the re-audit | resolved by merging |
| P-50 (promise visible to customer) | S-01a | **Already unblocked** — S-01a is decided and shipped |
| P-51 (overbooking permitted) | S-01b | Yes, once S-01b ships |
| P-41 (multi-session jobs), P-44 (location entity) | S-01c | Still blocked — S-01c is deferred |

### 8.B — Policy scope

**The instruction was explicit that the goal is the minimum scope model the evidence justifies, not maximum flexibility. Applying that discipline changes the answer from what a first pass would produce.**

A full audit of all 70 decisions for a genuine sub-workshop scope need found exactly **one** clear case: P-01's `UNLESS_ACCOUNT_TERMS` option (Delta's net-30 B2B terms). P-42 (B2B account) exists specifically to hold that kind of term. Nothing else in the inventory demonstrated a real branch-level or work-order-level scope need on inspection — candidates that looked like they might (P-06 discount thresholds, P-39 credential enforcement) turn out to vary by *role* or by *data property*, not by scope, which is a different and already-modeled mechanism.

**Verdict: EVIDENCE-BACKED for a narrow, two-level model — workshop default with an optional account-level override — and OPEN (not decided against, just not justified yet) for anything broader.**

The recommended mechanism is not new: it is `PHASE_16.md`'s own 16.I design spike (network-scoped specialization override) applied to policy instead of specialization — the spike's own conclusion was to reuse the capability engine's override-and-lock machinery rather than invent a second one, and that reasoning transfers directly:

- **Only policies that declare `scopable: true` may carry an override** — most of the 70 do not, and gain nothing from a scope model existing.
- **Inheritance:** an account-level override, where present and not locked, wins; otherwise the workshop's own value applies; there is no third level.
- **Precedence:** platform default → workshop value → account override. A strict total order — this is what makes "conflict resolution" a non-question: nothing can tie.
- **Fallback:** workshop value, always — an account is never left with no effective policy.
- **Effective-value resolution:** one resolver function, same shape as `CapabilityResolutionService.resolveCurrent()` — read the nearest non-null value walking up the order above.
- **Audit:** an override change goes through the same governed pipeline as the base policy (§3.6) — it is not a lesser action.
- **Time-ranging:** overrides are time-ranged identically to the base policy (§3.5) — an account's terms can themselves change, and history must interpret under the terms in force then.
- **Mutability:** inherits the base policy's declared class (§3.6); an override cannot be more permissive to change than what it overrides.

**Architectural cost, stated plainly:** one new table (`PolicyOverride`: scope type, scope id, policy key, value, time range) and one additional resolver step. Modest, because it reuses two mechanisms this project already built and proved (time-ranging, override-and-lock) rather than inventing a third. **Branch-level and work-order-level scope remain explicitly OPEN** — no decision in the inventory currently demonstrates the need, and building resolution machinery for scopes nothing uses would be exactly the speculative prebuilding §3.7 warns against.

### 8.C — Owner vs. Super Admin policy authority

**A genuine conflict exists between two authoritative sources, and per the owner's instruction it is recorded rather than silently resolved.**

The 2026-08-07 amendment's text is unambiguous for one category: *"design, page layout, role experience, **workflow policy**, and the permission matrix — previously planned as Owner self-service pages — now live here, under Super Admin Control Center."* Workflow policy is named explicitly. **DECIDED**, no conflict: every policy in this inventory that governs a workflow step's routing, approval requirement, or review requirement (P-02, P-08, P-09, P-19, P-20, P-39, the QC policy in §8.D) is Super-Admin-only, per the amendment's own words.

**The conflict is in money.** `PAGE_INVENTORY.md` independently lists a still-unbuilt Owner-facing page — **"Pricing & Financial Configuration"** — with the note *"`FinanceConfiguration` exists in the schema, unreachable."* That page's own existence in the spec implies day-to-day pricing/financial tuning was intended as Owner territory, distinct from "workflow policy." Several money decisions in this inventory sit exactly on that boundary: **P-06** (discount thresholds), **P-23** (refund approval authority), **P-27** (write-off authority), **P-28** (deposit requirement), **P-05** (partial payment).

Two readings are both defensible from the written record, and neither is asserted here as correct:

1. **Everything is Super Admin's**, per the amendment's total scope — these are still "policy," and the amendment does not carve out an exception for money specifically.
2. **Business-management money decisions are Owner's**, and the still-unbuilt Pricing & Financial Configuration page is exactly where they belong — with Super Admin retaining a *ceiling*, the same "differs from plan default" pattern the canonical spec already uses for Limits & Entitlements (a plan-level maximum the workshop tunes within, not a value Super Admin sets directly).

**Verdict: OPEN.** Recorded as a conflict, not resolved by assumption, per the owner's explicit instruction. **A recommended direction is offered, not asserted:** reading 2, because it gives the still-planned Owner page a reason to exist and matches how Limits & Entitlements already works elsewhere in the same spec — but this is a product decision about who the Owner is allowed to be trusted with, not an architectural one, and belongs to the owner's review.

### 8.D — QC classification

**Resolved by checking the actual lifecycle graph rather than arguing from the label.** `packages/shared/src/capabilities/workflow-graphs.ts` confirms QC owns real states (`READY_FOR_QC`, `QC_FAILED`) and reroutes `FINISH` — §3.1's mechanical test classifies it as a **capability**, correctly, and this is now verified against the code rather than asserted from the model alone.

But reading the same graph line closely surfaces a real, previously invisible gap: `{ from: "IN_PROGRESS", to: "READY_FOR_QC", requires: ["QC"], intent: "FINISH", ... }` has **no condition** beyond the capability being on. **Whenever `QC` is enabled, every job routes through it — there is no way today to make QC apply only to some jobs.** The canonical spec's instinct that something policy-shaped exists here was not wrong; it was pointed at a real gap the capability alone does not close.

**Verdict: DECIDED — the decomposition the instruction proposed is correct.**

```
QC (CAPABILITY)              — does the READY_FOR_QC / QC_FAILED path exist at all
  + QC required for every job (NEW POLICY — does not exist today, see below)
  + who performs QC            — a role-assignment question, not a new decision;
                                  already expressible via existing role/team machinery
  + what happens when QC fails — ALREADY ANSWERED by the graph itself:
                                  QC_FAILED → IN_PROGRESS via RESOLVE_BLOCKER (rework)
```

Only the second line is a genuine gap. **Recorded as a new inventory entry, P-71**, added to §2b's Domain C:

> **P-71 — Is QC mandatory for every job, or only above a value/risk threshold?** POLICY · GOVERNED · Posture: POLICY-CONTROLLED · Relevant when `QC` capability active. Options: `MANDATORY_ALWAYS` (today's only behaviour) · `ABOVE_VALUE_THRESHOLD` · `RISK_FLAGGED_ONLY` (ties to specialization severity). **Default `MANDATORY_ALWAYS`**, because it is the only option requiring no new data and matches every workshop that has enabled QC so far — loosening it is real future work, not an assumption to make now.

The canonical spec's placement of "QC required" under Workflow Policy was, on this evidence, **half right**: it correctly saw a policy-shaped decision, but the decision it was pointing at (P-71) had never been separated from the capability that makes it possible (QC). Recorded as a disagreement resolved by decomposition, not by one source simply winning.

### 8.E — Decision count and questionnaire scale

**Method:** walked all 70 decisions' relevance predicates against two real capability profiles — `SINGLE_BAY_QUICK_SERVICE` (the smallest shape: no inventory, no teams, no QC, single branch) and `MULTI_BRANCH_FULL_SERVICE` (everything on) — counting how many are genuinely faced as workshop-creation-time questions.

| Domain | Total | Single-bay faces | Full-service faces |
|---|---:|---:|---:|
| A — Approval & customer | 9 | 9 | 9 |
| B — Money | 9 | 9 | 9 |
| C — Parts/inventory (incl. P-71) | 11 | 1 (`P-10` only — inventory off) | 11 |
| D — People & supervision | 6 | 3 | 5 |
| E — Work-order structure | 6 | 2 | 5 |
| F — Ownership/warranty | 5 | 4 | 5 |
| G — Scheduling | 5 | 0 (not yet buildable — S-01c deferred) | 3 (once S-01b ships) |
| H — Governance/audit | 6 | ~1 | ~2 |
| I — Identity/tenancy | 5 | ~1 | ~1 |
| J — Platform/operations | 10 | ~2 | ~3 |
| **Total** | **72** | **~32** | **~53** |

**Finding, and it changes the model: roughly a third of the inventory (H, I, most of J) is not a per-workshop question at all.** They are one-time platform or product decisions (clock authority, DB failover posture, retention defaults, password hashing, audit retention) that a Super Admin sets **once for the platform**, never per workshop. Counting them inside "the workshop's questionnaire" was a real classification error in the original inventory — not a decision needing an answer, but a missing axis.

**Verdict: DECIDED — no tier system. Add a `scope: PER_WORKSHOP | PLATFORM_WIDE` field instead.** At 25–35 genuine per-workshop questions for the smallest shape and ~50 for the largest, relevance derivation alone keeps the questionnaire well within what a Super Admin can review in one sitting — introducing tiers now would be solving a scale problem that the count does not actually present. The real fix the count revealed is a missing field, not missing machinery.

## 9. The consolidated relevance graph

**Now a mandatory deliverable, per the instruction. Built from every `Depends on` edge recorded across §2b's 70 entries.**

### 9.1 — Cycles found, and why

A structural audit — not a full symbolic solve, but a directed check of every recorded edge — found **three 2-cycles**, all sharing the same root cause: a *thematic* relationship ("these two decisions are about the same subject") was recorded as a *formal* dependency ("this decision's relevance or default reads the other's value"). Per the instruction, none is ignored; each is diagnosed and redesigned.

| Cycle | As originally recorded | Diagnosis | Redesign |
|---|---|---|---|
| P-11 ↔ P-12 | Ownership timing ↔ warranty basis, each listed as depending on the other | Neither's *relevance predicate* or *default* actually reads the other's stored value — they are about the same real-world event but resolve independently | **Edge removed.** Kept as a prose cross-reference only, not a graph dependency |
| P-16 ↔ P-40 | Post-close addenda ↔ work-order linkage | P-16's `LINKED_FOLLOW_UP` *option* requires P-40 to exist as a capability precondition — a one-directional "this option is only offered if X exists" relationship, not a relevance cycle | **Made one-directional:** P-16 → P-40 only |
| P-42 ↔ P-43 | B2B account ↔ payer attribution | An account is the thing that *holds* payer terms — payer is the more primitive concept | **Made one-directional:** P-42 → P-43 (account depends on payer existing, not the reverse) |

**After the three fixes, the graph is acyclic.** This was worth doing precisely because it was not obvious in advance — two of the three cycles were between decisions that read as obviously related in prose, which is exactly the failure mode §3.2 warned the DAG requirement exists to catch.

### 9.2 — A duplicate found, not a cycle

The audit also surfaced that **P-49 ("are physical resources modelled?") and S-01b (§8.A) are the same decision recorded twice**, once under the register's Domain G during the original tranche and once implicitly through §8.A's scheduling resolution. **Resolved: P-49 is retired; S-01b is its sole authoritative entry**, cross-referenced from Domain G's register row rather than duplicated.

### 9.3 — Graph structure, by dependency type

```
CAPABILITY dependencies (a policy is irrelevant without the capability):
  INVENTORY      → P-07, P-08, P-30, P-31, P-32, P-33
  PART_RETURNS   → P-08
  TEAMS          → P-09
  TEAM_REVIEW    → P-09 (capability existing is precondition for the policy's options)
  MULTI_BRANCH   → P-36
  QC             → P-71
  FINANCE_CORE   → P-01, P-05, P-06, P-22-28
  BILLING        → P-14, P-24
  CUSTOMER_PORTAL→ P-21 (mandatory-relevant when OFF: P-18)
  S-01b (resources) → P-13, P-51 [P-49 retired, see 9.2]
  S-01c          → P-41, P-44 [DEFERRED — these stay unreachable]

SPECIALIZATION dependencies:
  warranty declared     → P-12
  credentials declared  → P-39
  blocker vocabulary    → P-45 (self-contained, no downstream)

POLICY-ANSWER dependencies (acyclic, after 9.1's fixes):
  P-02 ↔ P-03  (kept bidirectional-in-prose only; both relevant whenever
                approval exists, neither reads the other's stored value —
                re-checked and confirmed NOT a formal dependency either;
                downgraded to a documentation link, same fix as 9.1)
  P-01 → P-42 (one option only)      P-42 → P-43
  P-16 → P-40                        P-40 → P-16 (removed, see 9.1)
  P-05 → P-01                        P-11 → (none, after 9.1)
  P-06 → P-07                        P-19 → P-17
  P-09 → P-10                        P-46 → P-11
  P-47 → P-48, P-11                  P-50 → S-01a (DECIDED, always satisfied), P-51
  P-51 → S-01b                       P-53 → P-52
  P-67 → P-45                        P-70 → P-52
```

**On re-checking P-02 ↔ P-03 against the same test applied in 9.1: this was a fourth latent cycle, caught only by auditing every edge rather than stopping at three.** Same diagnosis, same fix — downgraded to a cross-reference.

### 9.4 — What the graph now answers

*"Given this workshop's capabilities, specializations, and previous policy answers, exactly which policy questions are relevant?"* — traversal is: start from the active capability set and declared specializations, include every policy whose capability/specialization edges are satisfied, then iteratively include any policy whose *option set* (not relevance) depends on another already-included policy's capability precondition. No policy's relevance reads another policy's **value** anywhere in the corrected graph — every remaining edge is a capability/specialization precondition or an option-level reference. **This is the property that makes the derived-questionnaire idea (§3.2) implementable**, and it was not true before the audit found and removed the four cyclic-looking edges.

## 10. Second-pass audit of the 70 (72, with P-71; 71, with P-49 retired)

Full re-verification against all 18 fields, for every entry, is not repeated here verbatim — it was written once, in full, in §2b's tranches, and re-reading it against this pass's own findings changed nothing in the 18-field content itself except the corrections already listed above. What the audit specifically checked and its findings:

| Check | Result |
|---|---|
| Every entry has exactly one `default` | ✅ Confirmed on re-read, all 71 remaining entries |
| Every configurable entry has a written `defaultReason` | ✅ Confirmed |
| Every entry has a classification (Capability/Policy/Vocabulary/Invariant/Structural) | ✅ Confirmed, with §8.D's P-71 addition |
| Every entry has a build posture | ✅ Confirmed, and re-tested per §11 below |
| Relevance predicates form a DAG | 🔧 **4 cycles found and fixed** — §9.1, §9.3 |
| No duplicate decisions | 🔧 **1 found and merged** — §9.2 (P-49/S-01b) |
| Anything mis-classified as POLICY that is actually an INVARIANT | Re-checked all 27 POLICY-CONTROLLED entries against "does this have a real second defensible answer, evidenced by a scenario" — none reclassified; P-25, P-29, P-38, P-04 were already correctly INVARIANT from the first pass |
| Anything mis-classified as an INVARIANT that is actually a POLICY | None found — P-56 (capability rollback), P-62 (password rehash), P-64 (offline), P-65 (clock authority) re-checked against "is there a scenario-evidenced legitimate alternative" and none has one |
| Add explicit status states per the instruction | Applied below, §12 |

## 11. Build-posture re-audit against the seven failure modes

Every PREBUILT-ACTIVATABLE and boundary-candidate entry re-tested against all seven named failure modes, not just clause (c) as originally applied.

| Failure mode | Entries it disqualifies on re-test |
|---|---|
| 1. Divergent schema | P-34 (broad form), P-41, P-58 |
| 2. Migration requirement | P-34 (broad form), P-41, P-58 |
| 3. Non-inert off state | None found on re-test — every current PREBUILT-ACTIVATABLE entry's disabled state was re-confirmed to leave zero dormant cost (no background job, no permission key that must still be reasoned about) |
| 4. Cross-domain ownership | P-14's underlying billing adapters (already correctly BOUNDED-SEPARATE/INTEGRATION-SEAM, not reclassified) |
| 5. No second customer | Confirmed for all 9 DEFERRED-UNTIL-DEMANDED entries; P-27's provenance note (created by P-01's default, not by direct scenario demand) is flagged as a *different* kind of "no evidence" — a second-order one worth tracking separately |
| 6. Uncomposable interaction effects | None found among PREBUILT-ACTIVATABLE candidates — each was checked for interaction with every capability it depends on; no case resembling `CAPABILITY_MODEL.md`'s Rule 2a (Inventory × Part Returns) surfaced |
| 7. Permissions invalid when removed | P-36 (regional manager) re-checked specifically — `branchScope` already handles this; disabling leaves no dangling permission key. Confirmed clean |

**No new disqualifications.** The original four-entry failure list (§12 below) stands, with one entry's severity reduced (P-34, see next section).

## 12. Re-audit of the four architectural boundary candidates

| Candidate | Original verdict | Re-audit finding | Final verdict |
|---|---|---|---|
| **Multiple roles per staff member (P-34)** | Fails clause (c) — `StaffUser.role` is a single enum | **Redesign found that passes.** `PRIMARY_PLUS_SECONDARY` (already listed as an option in P-34) can be built as an **additive join table** (`StaffUserAdditionalRole`), leaving `StaffUser.role` as the untouched primary/home role. An existing tenant with no additional roles granted is byte-for-byte today's schema — no fork, no migration. The permission resolver unions primary + additional-role permissions, a bounded, computable change to one resolver layer | **Narrow form (`PRIMARY_PLUS_SECONDARY`) reclassified: PREBUILT-ACTIVATABLE.** Broad form (`role` becoming a true set) still fails and is not recommended |
| **Multi-session/multi-location jobs (P-41)** | Fails clause (c) | Re-checked for a narrow form the same way as P-34. None found: every session-aware field (time tracking, gates, invoicing) is currently singular on `WorkOrder` by construction, and there is no additive way to make a job "sometimes span sessions" without every consumer of those fields learning to ask "which session" | **Confirmed boundary.** Real architectural lock-in, not a missing capability. `PHASE_16.md`'s own recommendation (use P-40 linked jobs as an approximation) stands |
| **Staff belonging to multiple tenants (P-58)** | Fails clause (c) | Re-checked for a narrow form. `TenantStakeholder` (18.A, already shipped) *is* that narrow form — external, view-only, independent of `StaffRole`. It already exists and already avoids touching the resolver's single-tenant assumption | **Confirmed boundary for the broad form (`MULTI_TENANT_MEMBERSHIP`)**; the narrow form is not a redesign to consider, it is **already shipped** as 18.A and requires no further action |
| **B2B accounts (P-42)** | Narrow form admissible, broad form fails | Re-confirmed on this pass; no new information | **Unchanged.** Narrow nullable-parent form: PREBUILT-ACTIVATABLE. Required/broad form: boundary |

**Net effect of the re-audit: one candidate (P-34) moves from "boundary" to "activatable, in its narrower form," found only by asking the redesign question explicitly rather than stopping at the first failing form.**

## 13. Newly discovered gaps — reconciled

### A. Portal removal / counter-approval path (P-18)

**Classification: not a missing capability, not a missing policy, not an incorrect architectural promise. It is a missing implementation of an already-correct decision.** `CAPABILITY_MODEL.md` Rule 3 makes the right promise; P-18 (§2b, tranche 2) already models the right answer (`ALLOWED_ATTRIBUTED`, staff record it, actor is the recording staff member, never the customer). What is missing is code — a service method and an endpoint — not a design decision. **Not implemented in this phase, per the phase's own scope**, but flagged as a live, real product gap (a workshop with the portal disabled today cannot record an approval at all) worth prioritizing early in whatever phase opens next, since it is one of the few items in this entire pass that needs no further design.

### B. Delivery-before-payment / write-off (P-27)

**Classification: a genuine missing decision, correctly identified during tranche 2 and already in the inventory as P-27.** Its provenance is worth recording precisely because it demonstrates why default-reasoning (§3.3) matters: P-01's recommended default (never block delivery on payment) is the *right* default and it *creates* a real operational need — a receivable that will, eventually, be uncollectable — that nothing in the product currently serves. P-27 stays **DEFERRED-UNTIL-DEMANDED** (§11, failure mode 5) but is now explicitly tagged as **second-order** — created by another decision's default rather than by direct scenario evidence — which is a distinction worth preserving for whoever revisits it.

### C. Realtime (P-63)

**Is it still a live product promise?** Yes — the original brief states it explicitly and nothing has withdrawn it. **What capability does it represent, and what scope?** Two separable things, not one, found by applying the same decomposition discipline as §8.D's QC finding: (1) a **transport** — how updates reach a client — and (2) a **channel-isolation guarantee** — that a realtime channel cannot leak across tenants, which `VISION.md` §3.1 already treats as structural, not a feature.

**Posture verdict:**
- The **channel-isolation requirement** is **CORE** — it must hold correctly the moment any realtime transport exists, regardless of which workshops are actively using it, the same way tenant isolation itself is core rather than a per-tenant setting.
- The **notification/realtime delivery system** is **BOUNDED-SEPARATE** — its own lifecycle, its own failure modes (a dropped connection is not a data-integrity problem the way a failed transaction is), referenced by other systems rather than embedded in them. The same relationship Billing has to Finance.

**Roadmap reconciliation:** confirmed — P-63 appears in **zero** phases in `PHASE_MAP.md`. This is recorded as a finding, not corrected by assigning it a phase number here; assigning phases is this document's job to surface, not to decide unilaterally. Left **OPEN** for the owner to place, with the recommendation (§14) that it become an explicit part of whatever is scoped next.

## 14. Final architectural rollup, with explicit status

| Posture | Count (of 72, incl. P-71, excl. retired P-49) | Representative entries |
|---|---:|---|
| **CORE** | 13 (+2: P-18's promise, P-46/47 privacy boundary, P-63's isolation half) | P-04, P-25, P-29, P-38, P-46, P-47, P-18, P-63 (isolation) |
| **PREBUILT-ACTIVATABLE** | 15 (+3: S-01b, P-34 narrow form, P-63's transport half) | P-40, P-43, P-68, S-01b, P-34 (narrow) |
| **POLICY-CONTROLLED** | 28 (+1: P-71) | P-01, P-02, P-08, P-09, P-71 |
| **VOCABULARY** | 3 | P-35, P-45, specialization fields |
| **BOUNDED-SEPARATE** | 3 (+1: realtime) | Billing (shipped precedent), S-01c (if built), P-63 (delivery half) |
| **INTEGRATION-SEAM** | 2 | Country billing adapters |
| **DEFERRED-UNTIL-DEMANDED** | 9 (P-27 now tagged second-order) | P-27, P-33, P-44, P-69 |
| **OUT-OF-PLATFORM / RESOLVED** | 2 | P-60 (18.F), P-64 (20.E) |
| **ARCHITECTURAL BOUNDARY (fails admission, confirmed)** | 3 (down from 4) | P-41, P-58 (broad), P-42 (broad) |

### Edge-case register — final mapping, all seven

| Edge case | Decision | Status |
|---|---|---|
| E11 (leap-year warranty) | P-12 | EVIDENCE-BACKED (basis) + INVARIANT (arithmetic) |
| E12 (clock skew) | P-65 | INVARIANT — DB clock authoritative |
| E13 (capability rollback race) | P-56 | PROPOSED — in-flight transition wins; needs the design spike Phase 3 already owes |
| E17 (dormant-tenant migrations) | P-48 | EVIDENCE-BACKED |
| E18 (password rehash) | P-62 | INVARIANT — small, ready to implement once agreed |
| E20 (DB failover) | P-66 | PROPOSED — runbook, not a feature |
| H7 (warehouse deactivation) | P-32 | EVIDENCE-BACKED |

## 15. What remains genuinely OPEN

Stated plainly, not buried in the prose above:

1. **8.C — Owner vs. Super Admin authority over money policies.** A real conflict between two authoritative sources. A direction is recommended, not decided.
2. **8.A / S-01c — pre-intake appointment booking and field-service travel scheduling.** Deferred with a specific unblock condition, not answered.
3. **8.B — anything beyond workshop-default + account-override scope** (branch-level, work-order-level). Not decided against; simply not yet justified.
4. **§13.C — which phase realtime belongs to.** A gap is confirmed; a home is not assigned here.

## 16. Original §7 questions — resolution pointer

All four are answered, at the status shown, by §8–§15 above; kept here only as a pointer from the original framing to where each landed, since §7 is what the owner's follow-up instruction was responding to.

| Original §7 question | Resolved at | Status |
|---|---|---|
| Is QC a capability or a policy? | §8.D | **DECIDED** — both, decomposed; new P-71 added |
| Should any policy be Owner-settable? | §8.C | **OPEN** — genuine conflict recorded, direction recommended |
| Do policies need branch/account scope? | §8.B | **EVIDENCE-BACKED** for workshop+account; **OPEN** beyond that |
| How many decisions is too many? | §8.E | **DECIDED** — no tier system; a missing `scope` field found instead |

## 17. Recommendation for Phase 22 — not a start, a proposal for the review

Per the stop boundary (§18): this is a **recommendation to bring to the review**, not an opened phase. Phase 22 is not started by writing this section.

Based on everything above, if and when the owner opens implementation:

1. **Sequence:** `WorkshopPolicy` + `POLICY_REGISTRY` (§3, §D-01) first, since it is the dependency every money/approval/parts policy in §2b sits on. P-18 (portal counter-approval) is the one item ready to build immediately alongside it — it needs no further design, only code, per §13.A.
2. **Do not build the scope-override mechanism (§8.B) in the first slice.** Only P-01 and P-42 currently need it; ship workshop-level policy first, add `PolicyOverride` when a second scopable policy actually appears, not preemptively.
3. **Do not attempt Phase 19.A's separation-of-duties enforcement yet**, even though P-07 is now fully specified — implementing one policy in isolation before the registry exists would recreate exactly the hardcoding problem this phase was opened to stop.
4. **S-01b (resource occupancy) waits on Phase 17's setup-time authoring**, unchanged from `PHASE_16.md`'s own sequencing — this phase confirmed that ordering was already correct rather than changing it.
5. **Money policy authority (§8.C) should be the first thing the owner rules on**, before Governance Controls' layout is drawn, since it decides whether that page has one audience or two.

## 18. Stop boundary

This phase does not open Phase 22, does not build Governance Controls, does not implement a policy engine, questionnaire UI, or any production code. Per the owner's explicit instruction, work stops here for review.
