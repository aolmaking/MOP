# Phase 21 — Policy & Decision Architecture

> **Status:** 🟠 in progress — model defined, inventory in tranches. **No implementation.**
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

## 4. What this phase produces

1. **The model** — this document. ✅
2. **The inventory** — [`POLICY_DECISION_INVENTORY.md`](../POLICY_DECISION_INVENTORY.md), every decision documented against the 18 fields the project owner specified, built in tranches by domain. 🟠 tranche 1 complete, register complete.
3. **A classification verdict for every entry** — capability / policy / specialization / other, decided by §3.1's test, with disagreements against the canonical spec recorded rather than smoothed over.
4. **The relevance map** — which decisions each workshop model actually faces.

## 5. What this phase explicitly does NOT do

- No `WorkshopPolicy` table, no `POLICY_REGISTRY`, no resolver.
- No questionnaire UI, no changes to Add Workshop.
- No Governance Controls page.
- No re-attempt at Phase 19.A's separation-of-duties enforcement, even though this phase identifies exactly the policy it was missing.

Implementation is Phase 22's job, and only after the inventory is reviewed and the model agreed.

## 6. Exit criteria

1. Every decision found across the roadmap, completed phases, deferred items, all three scenario passes, the canonical specs, and the current schema is recorded in the inventory — nothing left only in someone's head.
2. Every recorded decision has all 18 fields, a classification verdict, and exactly one default with a written reason.
3. The relevance predicate for every policy is stated, and the resulting relevance graph is acyclic.
4. Every decision the canonical spec's Workflow Policy tab names is classified, including the ones where we disagree with the spec.
5. The seven remaining edge-case register items (H7, E11, E12, E13, E17, E18, E20) are each mapped to a decision in the inventory or explicitly ruled out as not-a-decision.
6. Reviewed with the project owner before any implementation phase opens.

## 7. Open questions for the review

Carried into the discussion rather than pre-answered:

- **Is QC a capability or a policy?** §3.1's test says capability; the canonical spec lists it under Workflow Policy. One of them is wrong and it matters, because the answer determines whether it is inside or outside the reachability proof.
- **Should any policy be settable by the Owner rather than Super Admin?** The 2026-08-07 amendment moved configuration to Super Admin wholesale. Some policies (discount thresholds) look like ordinary business management rather than platform control.
- **Do policies need branch-level or account-level scope?** Delta's net-30 case is arguably per-*customer*, not per-workshop — which would make it a policy with a scope axis, materially more complex than a tenant-level value. Phase 16.I's spike reached a similar conclusion for specialization scope and recommended reusing capability override machinery.
- **How many decisions is too many?** If the inventory reaches 80, the derived-questionnaire idea is doing real work. If it reaches 300, the model needs a tier concept before implementation.
