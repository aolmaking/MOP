# MOP — The Policy System

> **Document ID:** DOC-04
> **Purpose:** the policy engine, and every policy in the product with its question, options, default, mutability, real runtime consumers and blast radius.
> **Authority:** DESCRIPTIVE. `packages/shared/src/policies/registry.ts` is authoritative.
> **Scope:** the 16 shipped policies and the machinery that resolves them.
> **Last verified:** 2026-09-01 against commit `a8c8bb5`. All 16 policy records below were extracted directly from the registry source, not from a prior document.
> **Source of truth:** `packages/shared/src/policies/{types,registry,validator,relevance,graph-safety}.ts`; `apps/api/src/control/policies/`; `docs/phases/PHASE_21.md` (the design record); `docs/POLICY_DECISION_INVENTORY.md` (the ~70-decision inventory this registry implements a subset of).
> **Related:** 02 (capabilities), 07/08 (lifecycle and engine), 20 (permissions), 37 (gaps).

---

## 1. What a policy is

A policy answers **"what rule does this step run under?"** — never "does this step exist" (capability) and never "who may do it" (permission).

### The mechanical test

> **A policy may never change reachability.** If a setting could change whether a work order can reach a terminal state, it is a mis-classified capability.

`[VERIFIED]` — `graph-safety.ts` proves this for *every option of every policy that appears on a workflow edge*, across every shipped capability profile. An option that would strand a job fails CI rather than a workshop.

A policy condition on an edge may only ever **narrow the choice between routes that all still reach a terminal state**. It may never remove the last way out of a state.

### Why policies had to reach the graph at all

Before `PolicyCondition` existed, a policy could not touch the workflow graph. That meant "is customer approval required?" was answered by whichever intent a service happened to send, and the graph carried an edge literally labelled *"no approval required by policy"* that no policy controlled. A workshop that required approval on all work could be walked straight past it.

That is the class of defect this subsystem exists to close: **a setting that looks like it governs behaviour and does not.**

## 2. The policy lifecycle

```
Business question
   ↓
Options (2..n, exhaustive — a consumer switches over every key, never reads a raw string)
   ↓
Default (with a written defaultReason)
   ↓
Relevance (is this question even meaningful for this workshop's shape?)
   ↓
Configuration (asked at creation, changed under a mutability rule)
   ↓
Persistence (WorkshopPolicy — time-ranged, immutable rows)
   ↓
Resolution (PolicyResolutionService)
   ↓
Runtime consumer (a named Service.method, asserted to exist in CI)
   ↓
Behavioural effect (a different route, a refusal, a hidden price, a released car)
```

Every stage is real code. `[IMPLEMENTED]` throughout.

## 3. The five properties every policy declares

### 3.1 Mutability

| Value | Meaning |
|---|---|
| `FREELY` | No in-flight consequence, safe to change any time |
| `GOVERNED` | Runs the same draft → validate → impact-preview → apply → audit pipeline capability changes use, because the impact is the same kind of thing: *"14 jobs are in Payment Pending; turning this off releases all of them"* |
| `IMMUTABLE_AFTER_FIRST_USE` | Cannot change once real data exists under it (e.g. an invoice numbering scheme) |

Current distribution: 14 `GOVERNED`, 2 `FREELY` (`TIME_TRACKING`, `WORKING_WEEK`). No shipped policy is `IMMUTABLE_AFTER_FIRST_USE` yet.

### 3.2 Relevance

A policy declares `dependsOnCapabilities` and `dependsOnPolicies`; a plain predicate function decides whether the question is meaningful for a given draft. Deliberately a function, not a declarative expression language — the same rule against "a second, worse programming language" that governs configuration generally.

Two safety mechanisms make the relevance graph trustworthy:

1. **The graph is acyclic, proven.** `validator.ts` checks it. Four real cycles were found and fixed when the graph was first built.
2. **A predicate cannot read an undeclared dependency.** `isPolicyRelevant` builds `priorAnswers` scoped to exactly the policy's declared `dependsOnPolicies` keys, so a predicate reading a key it never declared finds it *absent* rather than silently seeing a real answer. Without this, the declared graph would be a lie and the acyclicity check would be checking the wrong thing.

**The `relevantUnder` escape hatch.** A bare capability key means "relevant while that capability is active". The object form exists for the one case the bare reading gets wrong, and it is the flagship policy that forced it: `DELIVERY_BLOCKED_UNTIL_PAID` is relevant when `FINANCE_CORE` is *any* status other than `DISABLED` — `EXTERNAL` included. A workshop running External Finance Mode still hands cars back, and MOP still decides whether an outstanding balance holds one. Reading `EXTERNAL` as "not active" would silently stop asking that workshop a question whose answer still governs its delivery gate.

### 3.3 Enforcement — the anti-stub mechanism

Every policy declares `enforcement: { status, where, consumers[] }`.

| Status | Meaning | `consumers` |
|---|---|---|
| `ENFORCED` | Something reads this value today | **Required**, and asserted against the real source tree by `policy-consumers.spec.ts` in CI |
| `RECORDED` | The row is real, audited and time-ranged the moment it is written — but nothing reads it yet | **Empty**, which is the honest shape |

`[VERIFIED]` — **all 16 shipped policies are currently `ENFORCED` with named, existing consumers.** A policy cannot claim to be live while naming a method that does not exist, and a consumer renamed out from under it fails the build rather than quietly turning the claim into a lie.

`RECORDED` is not a lesser state to be hidden. The onboarding UI says exactly which one an answer is, because a configuration screen that implies a stored string is changing behaviour when nothing reads it is the same class of defect as a gate hardcoded to `true`.

### 3.4 Impact

What the answer touches beyond the value it stores: affected capabilities, roles, workflow states, permission keys, page ids, plus two booleans — `changesVisibility` (does it change what someone may *see*, not merely do) and `changesBilling` (does it change what is charged, when, or by whom) — and a one-line operator-facing summary.

Everything derivable is derived instead: the capabilities a policy depends on come from `dependsOnCapabilities`, and the states it can narrow come from the graph itself via `policiesAppearingOnEdges`. Only what cannot be computed is written down.

### 3.5 Build posture

`CORE` or `POLICY_CONTROLLED`. Only `PORTAL_COUNTER_APPROVAL` is `CORE` — recording a decision the customer gave verbally is a floor the product cannot lower below, only shape.

## 4. Policy taxonomy

The registry does not carry a category field; policies are grouped here by the operational domain they govern, which is how an operator finds one.

| Domain | Policies |
|---|---|
| **Workflow / routing** | `INSPECTION_REQUIRED`, `APPROVAL_REQUIRED_SCOPE`, `TECHNICIAN_DIRECT_SEND`, `QC_MANDATORY` |
| **Finance** | `DELIVERY_BLOCKED_UNTIL_PAID`, `PARTIAL_PAYMENT`, `DISCOUNT_AUTHORITY`, `UNCOVERED_COUNTRY_BILLING` |
| **Inventory** | `PARTS_SEPARATION_OF_DUTIES`, `RETURN_UNUSED_BEFORE_FINISH` |
| **Customer** | `APPROVAL_WEIGHT`, `PORTAL_COUNTER_APPROVAL`, `CUSTOMER_INVOICE_VISIBILITY` |
| **Operations / records** | `TIME_TRACKING`, `POST_CLOSE_ADDENDA`, `WORKING_WEEK` |

Four of these — `INSPECTION_REQUIRED`, `APPROVAL_REQUIRED_SCOPE`, `TECHNICIAN_DIRECT_SEND`, `QC_MANDATORY` — appear as conditions **on workflow edges**. Those are the ones `graph-safety.ts` must prove safe.

---

## 5. The policy inventory

Every field below is extracted from the registry source.

---

### P — `INSPECTION_REQUIRED`
> **May a customer decline inspection and request one named service directly?**

| | |
|---|---|
| Options | `CUSTOMER_MAY_DECLINE` (Customer may decline) · `ALWAYS_INSPECT` (Every job is inspected) |
| Default | `CUSTOMER_MAY_DECLINE` |
| Mutability | `GOVERNED` · Posture `POLICY_CONTROLLED` |
| Depends on | — |
| Enforcement | **ENFORCED.** `WORK_ORDER_GRAPH` narrows `REGISTERED → AWAITING_CUSTOMER_APPROVAL` to `CUSTOMER_MAY_DECLINE`; under `ALWAYS_INSPECT` that edge is dark and every job must pass `START_INSPECTION → UNDER_INSPECTION` first |
| Consumers | `WORK_ORDER_GRAPH (REGISTERED → AWAITING_CUSTOMER_APPROVAL)`, `WorkOrderLifecycleService.routingContext` |
| States touched | `REGISTERED`, `UNDER_INSPECTION`, `AWAITING_CUSTOMER_APPROVAL` |
| Roles | Technician, Branch Manager |
| Permissions | `customer.intake.create`, `inspection.quick.create`, `inspection.full.create` |
| Pages | `technician.work-card`, `branch_manager.work-orders-board` |
| Effect | Whether a customer who names one service can skip the inspection step entirely |
| Safety | `graph-safety.spec.ts` proves both options reach a terminal under every shipped profile. `START_INSPECTION` is unconditional, so no option can strand `REGISTERED` |

---

### P — `APPROVAL_REQUIRED_SCOPE`
> **Which work needs the customer's approval before it proceeds?**

| | |
|---|---|
| Options | `ALL_WORK` · `BEYOND_INITIAL_SCOPE` (anything beyond what was agreed at intake) · `CRITICAL_ONLY` (safety-critical findings only) |
| Default | `BEYOND_INITIAL_SCOPE` |
| Mutability | `GOVERNED` |
| Enforcement | **ENFORCED.** The graph narrows `UNDER_INSPECTION → APPROVED_FOR_WORK` to `BEYOND_INITIAL_SCOPE` and `CRITICAL_ONLY`; under `ALL_WORK` that edge is dark and every inspection routes through customer approval |
| Consumers | `WORK_ORDER_GRAPH (UNDER_INSPECTION → APPROVED_FOR_WORK)`, `WorkOrderLifecycleService.routingContext` |
| States touched | `UNDER_INSPECTION`, `AWAITING_CUSTOMER_APPROVAL`, `APPROVED_FOR_WORK` |
| Changes billing | **yes** |
| Pages | `technician.work-card`, `branch_manager.approvals-customer-decisions`, `customer.decision` |
| ⚠️ **Named gap** | The **scope-delta comparison itself is not built.** `TechnicianWorkService` still lets staff choose which items are decision-worthy rather than deriving that from what the customer actually agreed to at intake. The routing is real; the derivation of "beyond initial scope" is not. Tracked in doc 37 |

This is the edge whose label previously claimed a policy controlled it while nothing did.

---

### P — `TECHNICIAN_DIRECT_SEND`
> **May a technician send finished work onward directly, or must it pass review?**

| | |
|---|---|
| Options | `DIRECT` · `REVIEW_REQUIRED` |
| Default | `DIRECT` |
| Mutability | `GOVERNED` |
| Depends on | `TEAM_REVIEW` |
| Enforcement | **ENFORCED.** The graph narrows `IN_PROGRESS → READY_FOR_TEAM_REVIEW` to `REVIEW_REQUIRED`; under `DIRECT` that edge is dark and `FINISH` must reach a terminal without stopping at review |
| Consumers | `WORK_ORDER_GRAPH (IN_PROGRESS → READY_FOR_TEAM_REVIEW)`, `WorkOrderLifecycleService.routingContext` |
| States touched | `IN_PROGRESS`, `READY_FOR_TEAM_REVIEW`, `READY_FOR_QC`, `PAYMENT_PENDING` |
| Pages | `technician.work-card`, `team_leader.home`, `team_leader.vehicles-work-orders-view` |

**This policy fixed a real contradiction.** Finish edges are ordered review → QC → invoicing and the router takes the first live match, so with `TEAM_REVIEW` on, review was *unconditionally forced* and there was no way to express this policy's own declared default of `DIRECT`. The capability meant "review is compulsory" when the policy said it should mean "review is available."

Owning the condition on the review edge rather than the two below it also keeps the invariant *policies on edges declare their capability* satisfied: the policy depends on `TEAM_REVIEW` and so does the edge, so an answer cannot outlive the capability that gives it meaning.

**Honest limitation, recorded not faked:** optional review — a technician choosing to send *one particular* job for review under `DIRECT` — would need its own intent, which the graph does not have. Under `DIRECT`, finished work goes onward.

---

### P — `QC_MANDATORY`
> **Is QC required for every finished job, or only for one flagged safety-critical?**

| | |
|---|---|
| Options | `MANDATORY_ALWAYS` · `RISK_FLAGGED_ONLY` |
| Default | `MANDATORY_ALWAYS` |
| Mutability | `GOVERNED` |
| Depends on | `QC` |
| Enforcement | **ENFORCED.** The graph narrows *both* routes into `READY_FOR_QC` (from `IN_PROGRESS` and from `READY_FOR_TEAM_REVIEW`) to `RISK_FLAGGED_ONLY` **plus the fact** `work_order.has_critical_fault` |
| Consumers | both `WORK_ORDER_GRAPH` QC edges, `WorkOrderLifecycleService.routingContext` |
| States touched | `READY_FOR_QC`, `QC_FAILED`, `PAYMENT_PENDING`, `READY_FOR_DELIVERY` |

**The product's only per-work-order fact condition.** `requiresFact` differs from `requires` and `requiresPolicy`, which are true or false for the whole tenant: a fact is computed per work order from *this job's own* `Fault` rows on every routing call. A missing fact is treated as false — conservatively, a job is never assumed risk-flagged, nor assumed exempt, on data nobody computed.

The default is `MANDATORY_ALWAYS` because exempting most jobs by default would be the capability quietly doing less than turning it on promised.

---

### P — `DELIVERY_BLOCKED_UNTIL_PAID`
> **Is delivery blocked until the invoice is paid?**

| | |
|---|---|
| Options | `ALWAYS` (no vehicle leaves unpaid) · `NEVER` (chase the balance separately) · `REQUIRES_OVERRIDE` (blocked, releasable with a written reason) |
| Default | `NEVER` |
| Mutability | `GOVERNED` |
| Depends on | `FINANCE_CORE` under `ENABLED`, `READ_ONLY`, `LOCKED`, **and `EXTERNAL`** — the `relevantUnder` case described in §3.2 |
| Enforcement | **ENFORCED.** `GateEvaluatorService`'s `payment.settled_or_policy_allows` check, via `FinanceConfiguration.allowUnpaidDelivery` |
| Consumers | `GateEvaluatorService.check`, `PlatformService.writeFinanceConfiguration` |
| States touched | `READY_FOR_DELIVERY`, `PAYMENT_PENDING` |
| Permission | `workorders.branch.release_delivery` |
| Changes billing | **yes** |
| ⚠️ **Named gap** | `REQUIRES_OVERRIDE` **blocks like `ALWAYS` today.** The audited release action is Governance Controls' work and is not built. The option is honest about being incomplete rather than silently behaving as `NEVER` |

---

### P — `PARTIAL_PAYMENT`
> **May a customer pay part of the balance?**

| | |
|---|---|
| Options | `ALLOWED` · `FULL_ONLY` |
| Default | `ALLOWED` |
| Depends on | `FINANCE_CORE` |
| Enforcement | **ENFORCED.** `FinanceService.recordPayment` refuses a short amount under `FULL_ONLY` |
| States touched | `PAYMENT_PENDING` · Permission `finance.payment.record` · Page `branch_manager.delivery-payments-status` |
| Changes billing | **yes** |

---

### P — `DISCOUNT_AUTHORITY`
> **Who may approve a discount, and above what value?**

| | |
|---|---|
| Options | `NONE` · `ANY_STAFF_UNLIMITED` · `THRESHOLD_THEN_APPROVAL` · `ALWAYS_APPROVAL` |
| Default | `THRESHOLD_THEN_APPROVAL` |
| Depends on | `FINANCE_CORE` |
| Enforcement | **ENFORCED.** `FinanceService.enforceDiscountAuthority` runs on **every** `issueInvoice` call. `NONE` refuses any discount outright; `ANY_STAFF_UNLIMITED` is unrestricted; `THRESHOLD_THEN_APPROVAL` and `ALWAYS_APPROVAL` both require a matching **APPROVED `DiscountRequest` for this exact work order and amount** before the invoice can issue |
| Consumers | `enforceDiscountAuthority`, `requestDiscount`, `approveDiscount`, `rejectDiscount` |
| Permissions | `finance.running_invoice.add_line`, `finance.discount.request`, `finance.discount.decide` |
| Changes billing | **yes** |

Note the enforcement point: at **invoice issuance**, against a request tied to that work order *and amount*. A discount cannot be approved generically and then applied to a larger figure.

---

### P — `UNCOVERED_COUNTRY_BILLING`
> **What happens when this country has no billing adapter yet?**

| | |
|---|---|
| Options | `WARN_ONLY` (flag it, allow issuance) · `BLOCK` (refuse issuance) · `BLOCK_WITH_OVERRIDE` (refuse, platform may grant an exception) |
| Default | `WARN_ONLY` — the right default while the adapter-covered-country list is still empty |
| Depends on | `BILLING` |
| Enforcement | **ENFORCED.** `FinanceService.issueInvoice` resolves this **before opening its transaction** and hands it to `BillingService.issueDocument`, which computes `compliantBlocked` on every call. `BLOCK` and `BLOCK_WITH_OVERRIDE` both refuse **inside the same transaction the invoice is created in**, so the whole invoice rolls back, not just the billing document |
| Permission | `finance.invoice.issue` · Page `owner.pricing-financial-configuration` |
| Changes billing | **yes** |
| ⚠️ **Named gap** | The audited exception `BLOCK_WITH_OVERRIDE` names is Governance Controls' work and is not built — the same honest gap `DELIVERY_BLOCKED_UNTIL_PAID`'s `REQUIRES_OVERRIDE` carries |

This is the policy that makes the country-adapter seam a live compliance control rather than future infrastructure. See doc 10 §Billing.

---

### P — `PARTS_SEPARATION_OF_DUTIES`
> **Must a part request be approved by someone other than the person who raised it?**

| | |
|---|---|
| Options | `NOT_ENFORCED` · `DIFFERENT_PERSON` · `ROLE_SEPARATED` (only an inventory manager may approve) |
| Default | `NOT_ENFORCED` |
| Depends on | `INVENTORY` |
| Enforcement | **ENFORCED.** `PartRequestService.approve` refuses self-approval or a non-manager approver |
| Permission | `inventory.request.approve` · Pages `inventory_manager.technician-requests`, `technician.work-card` |

---

### P — `RETURN_UNUSED_BEFORE_FINISH`
> **Must every issued part be accounted for before a job can be finished?**

| | |
|---|---|
| Options | `REQUIRED` · `WARN_ONLY` (warn, do not block) · `NOT_REQUIRED` (no check at all) |
| Default | `REQUIRED` |
| Depends on | `INVENTORY` |
| Enforcement | **ENFORCED.** `GateEvaluatorService.suppressedByPolicy` drops or downgrades `parts.received_used_or_returned` to advisory |
| States touched | `IN_PROGRESS` · Pages `technician.work-card`, `inventory_manager.returns-movements` |

A clean example of a policy modulating a **gate** rather than an **edge**: the transition is unchanged, the condition on it softens.

---

### P — `APPROVAL_WEIGHT`
> **Does every customer decision carry the same weight?**

| | |
|---|---|
| Options | `SINGLE_WEIGHT` (one formal mechanism for everything) · `TWO_TIER` (formal for critical, lightweight for routine) |
| Default | `TWO_TIER` |
| Enforcement | **ENFORCED.** `CustomerDecisionService.applyAnswers` resolves this before the acknowledgement gate. `TWO_TIER` requires the formal acknowledgement — the same modal every `CRITICAL` rejection already showed — for `HIGH` and `CRITICAL` only; `LOW` and `MEDIUM` record with a single choice, no modal. `SINGLE_WEIGHT` requires it for every item regardless of importance |
| Floor | **`CRITICAL` requires acknowledgement under both options.** That is the floor this policy cannot lower |
| Pages | `customer.decision`, `branch_manager.approvals-customer-decisions` |
| 💤 **Dropped option, recorded not faked** | `PER_ITEM_CHOICE` (staff picking weight per item) was dropped rather than stubbed: it needs a real per-item tier chosen when the item is raised, and the backend flow for a technician to raise and send a decision item does not exist yet. There is nothing for a per-item choice to attach to |

---

### P — `PORTAL_COUNTER_APPROVAL`
> **May staff record a customer decision the customer gave verbally, rather than through the portal?**

| | |
|---|---|
| Options | `ALLOWED_ATTRIBUTED` · `ALLOWED_WITH_EVIDENCE` · `PORTAL_ONLY` |
| Default | `ALLOWED_ATTRIBUTED` |
| **Posture** | **`CORE`** — the only one |
| Enforcement | **ENFORCED.** `CustomerDecisionService.recordOnBehalf` reads the resolved value on every call: `PORTAL_ONLY` refuses outright, `ALLOWED_WITH_EVIDENCE` requires a non-empty `evidenceReference` before the answer applies, and **attribution to staff — never the customer — holds unconditionally under all three** |
| States touched | `AWAITING_CUSTOMER_APPROVAL`, `WAITING_CUSTOMER` · Permission `customer_decision.record_on_behalf` |

The unconditional attribution rule is what makes counter approval safe: the record always says a member of staff entered it, so a dispute three weeks later can distinguish "the customer clicked approve" from "someone said the customer agreed on the phone."

This policy is the counterpart to `CUSTOMER_PORTAL`'s removal policy (doc 02): **the step is core, the channel is optional.**

---

### P — `CUSTOMER_INVOICE_VISIBILITY`
> **Are prices shown to the customer before they approve a repair?**

| | |
|---|---|
| Options | `SHOWN` · `HIDDEN` |
| Default | `SHOWN` |
| Depends on | `FINANCE_CORE` |
| **Changes visibility** | **yes** — the only policy that does |
| Enforcement | **ENFORCED.** `CustomerDecisionService.pricingVisible` reads `FinanceConfiguration.customerInvoiceVisible` on every decision-request read; `PlatformService.writeFinanceConfiguration` sets that column from this policy's answer **at creation**, instead of leaving it on the Prisma column default for every tenant |
| Permission | `customer.invoice.view_own` · Pages `customer.decision`, `branch_manager.approvals-customer-decisions` |

Because this changes visibility, it is subject to §4.5 of doc 01: **`HIDDEN` must mean absent from the response**, not styled away.

---

### P — `TIME_TRACKING`
> **Is time tracking off, optional, or required?**

| | |
|---|---|
| Options | `OFF` · `OPTIONAL` · `REQUIRED` |
| Default | `OPTIONAL` |
| Mutability | **`FREELY`** |
| Enforcement | **ENFORCED.** `TechnicianWorkService.completeTask` reads this on every call: `REQUIRED` refuses completion without a `minutesSpent` value; `OFF` **discards one even if the caller sent it**, so the column never holds a stray value from before the policy changed; `OPTIONAL` stores whatever was given |
| Pages | `technician.work-card`, `team_leader.technician-performance-reports` |

**Design note worth preserving:** `Task.actualMinutes` is the technician's own reported figure, **not derived from start/complete timestamps** — a task blocked and resumed later would make elapsed wall-clock time overstate time actually worked.

---

### P — `POST_CLOSE_ADDENDA`
> **May anything be added to a work order after it closes?**

| | |
|---|---|
| Options | `NOTHING` (closed is closed) · `APPEND_ONLY_NOTES` |
| Default | `APPEND_ONLY_NOTES` |
| Enforcement | **ENFORCED.** `WorkOrderDossierService.addNote` refuses once the work order is `CLOSED` and the policy reads `NOTHING`. A job still open needs no check — adding a note before close was never in question |
| States touched | `CLOSED` · Permission `notes.create` · Page `branch_manager.work-order-workspace` |

`WorkOrderNote` is **append-only**: no update or delete path exists, matching every other historical record in this schema.

---

### P — `WORKING_WEEK`
> **Which days are this workshop's working week?**

| | |
|---|---|
| Options | `FROM_COUNTRY` · `SEVEN_DAY` (no weekend — ageing is pure elapsed time) |
| Default | `FROM_COUNTRY` |
| Mutability | **`FREELY`** |
| Enforcement | **ENFORCED.** `AttentionQueueService.weekendDaysFor` resolves it once per `build()` call (`FROM_COUNTRY` reads the tenant's own country via `packages/shared/src/platform/countries.ts`'s `WEEKEND_DAYS`) and threads it into **every** attention-ranking and SLA-overrun calculation via `workingHoursBetween` |
| Consumers | `weekendDaysFor`, `slaOverruns`, `workingHoursBetween`, `rankAttentionItem` |
| Roles | Branch Manager, Team Leader, Data Analyst · Pages `branch_manager.home`, `owner.reports-analytics` |

It replaced raw elapsed-wall-clock arithmetic everywhere. A job left on Thursday evening at a Friday–Saturday-weekend workshop no longer ages over a weekend it was never worked. This is a good example of a *small* policy with a wide blast radius — it silently changes every "waiting two days" figure in the product.

---

## 6. Persistence and resolution

### `WorkshopPolicy`

Time-ranged, immutable rows — the same discipline as `TenantCapability`, `MessageTemplate` and `PriceCatalogEntry`. Changing an answer **closes** the current row and opens a new one; it never rewrites history. `PolicySource` records whether an answer came from the platform default, workshop creation, or a later governed change. A `policy.changed` and a `policy.expired` audit entry both exist.

### `PolicyResolutionService`

`apps/api/src/control/policies/policy-resolution.service.ts` resolves a tenant's effective answer for a key at a moment in time. Consumers call it; nothing reads the table directly.

### Where an answer is used

Two shapes only:

1. **On a graph edge** (`requiresPolicy`) — four policies. Subject to `graph-safety.ts`.
2. **Inside a named service method** — the other twelve. Subject to `policy-consumers.spec.ts`.

There is no third shape, deliberately. A policy read from a controller, a DTO or a component would be a policy decision duplicated in the browser, which contradicts *the UI reflects policies resolved by the API and never duplicates them locally*.

## 7. What is a policy, and what is not

| Candidate | Verdict |
|---|---|
| "Block delivery until paid" | **Policy** — the delivery edge exists either way |
| "This workshop has no inventory" | **Capability** — it changes reachability |
| "Only the owner may approve discounts" | **Permission**, shaped by the `DISCOUNT_AUTHORITY` policy |
| "Invoice number format" | **Policy**, and would be `IMMUTABLE_AFTER_FIRST_USE`. Not yet in the registry |
| "Default VAT rate" | **Configuration** (`FinanceConfiguration`), not a policy — it has no option set |
| "Attention-queue sort order" | Neither. Derived from data, not chosen |

## 8. Implementation status

| Element | Status |
|---|---|
| Policy model: options, defaults, mutability, relevance, impact, enforcement | ✅ `[VERIFIED]` |
| 16 policies, all `ENFORCED` with named existing consumers | ✅ `[VERIFIED]` — `policy-consumers.spec.ts` |
| Reachability safety across all options × all profiles | ✅ `[VERIFIED]` — `graph-safety.spec.ts` |
| Relevance graph proven acyclic | ✅ `[VERIFIED]` — 4 cycles found and fixed |
| `WorkshopPolicy` time-ranged persistence + audit | ✅ `[INTEGRATED]` |
| Answers chosen at creation (stage 5) | ✅ `[INTEGRATED]` |
| **Governed post-creation policy change pipeline (draft→preview→apply for policies)** | 🟡 — the capability pipeline exists; policy changes reuse `GOVERNED` semantics but have no dedicated Owner-facing editing surface. See doc 37 |
| `REQUIRES_OVERRIDE` / `BLOCK_WITH_OVERRIDE` audited release actions | 🔴 `[INTENDED]` — Governance Controls' work |
| Scope-delta derivation for `APPROVAL_REQUIRED_SCOPE` | 🔴 `[INTENDED]` |
| The remaining ~54 decisions in `POLICY_DECISION_INVENTORY.md` | 🔴 `[DESIGNED]` — documented with a verdict each, deliberately unimplemented (Phase 21 was an architectural resolution pass, no implementation by design) |
