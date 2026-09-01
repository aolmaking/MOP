# 05 — Policy Engine Audit

Two different things are called "the policy engine" in this repo. This report separates them, because the docs frequently don't.

- **Layer A — the P-01…P-84 decision inventory** (`docs/POLICY_DECISION_INVENTORY.md`, `docs/phases/PHASE_21.md`): ~72 architectural decisions with defaults and build-posture verdicts. **Documents only. Nothing implements the 18-field schema, governed change pipeline, or per-decision mutability machinery.**
- **Layer B — the runtime policy registry** (`packages/shared/src/policies/*` + `apps/api/src/control/policies/*`): **16 registered `WorkshopPolicy` entries**, all ENFORCED with named consumers. This is real code with real consumers. This report audits Layer B.

## 1. Registry-wide facts (verified)

- Storage: `WorkshopPolicy` deviation rows (defaults omitted); resolved per-request by `PolicyResolutionService.resolveValue/resolveCurrent` (absent row ⇒ registry default).
- Mutability metadata: all GOVERNED except TIME_TRACKING & WORKING_WEEK (FREELY). **No IMMUTABLE_AFTER_FIRST_USE implemented; no enforcement of any mutability class exists because there is no post-creation setter at all** (§4).
- Combination safety: no pairwise option validation; instead `graph-safety.ts` exhaustively walks profile × option-combinations × fact-powerset proving reachability for every combination, plus `validatePolicyRegistry()` (structural integrity + RELEVANCE_CYCLE DFS). `dependsOnPolicies: []` for all 16 ⇒ cycle detection exercised only by test doubles.
- Anti-rot CI: `dead-consumers.spec.ts` fails the build if a declared consumer disappears; `validator.spec.ts` pins the ENFORCED set to exactly these 16 keys.
- Irrelevant-policy exclusion: yes — relevance predicates derive from capability profile (`relevantUnder`); e.g. INVENTORY-off workshops are never asked P-07/P-08; FINANCE-off never asked P-05; EXTERNAL billing still asks P-01 (object-form dependency).

## 2. Policy-by-policy ground truth

| # | Key | Default | Consumer (file:symbol) | Classification |
|---|---|---|---|---|
| P-01 | DELIVERY_BLOCKED_UNTIL_PAID | NEVER | materialized to `FinanceConfiguration.allowUnpaidDelivery` (`platform.service.ts:752`) → `gate-evaluator.service.ts:222–224` | **Real runtime** |
| P-02 | APPROVAL_REQUIRED_SCOPE | BEYOND_INITIAL_SCOPE | narrows edge UNDER_INSPECTION→APPROVED_FOR_WORK (`workflow-graphs.ts:66`); journey hides stage (`workflow-journey.service.ts:168`) | Real runtime |
| P-03 | APPROVAL_WEIGHT | TWO_TIER | `decision.service.ts:486,693` — drives `requiresAcknowledgement` per item; server re-checks on submit | Real runtime |
| P-05 | PARTIAL_PAYMENT | ALLOWED | materialized `allowPartialPaidDelivery`; refused pre-settlement check `finance.service.ts` (`partial_payment_refused`) | Real runtime |
| P-06 | DISCOUNT_AUTHORITY | THRESHOLD_THEN_APPROVAL | `finance.service.ts:746,838 enforceDiscountAuthority()` w/ matching-amount DiscountRequest | Real runtime |
| P-07 | PARTS_SEPARATION_OF_DUTIES | NOT_ENFORCED | `part-request.service.ts:131 approve()` — DIFFERENT_PERSON refuses self-approval; ROLE_SEPARATED checks role | Real runtime (opt-in) |
| P-08 | RETURN_UNUSED_BEFORE_FINISH | REQUIRED | `gate-evaluator.service.ts:86 suppressedByPolicy()` downgrades parts gate | Real runtime |
| P-09 | TECHNICIAN_DIRECT_SEND | DIRECT | edge condition `workflow-graphs.ts:116` (REVIEW_REQUIRED routes finish through team review). **No service-level consumer found in API** — effect lives entirely in graph narrowing | Real runtime (edge-level); flagged: declared consumers should be double-checked against `dead-consumers.spec.ts` scope |
| P-10 | TIME_TRACKING | OPTIONAL | `technician-work.service.ts:192` discards minutesSpent when OFF; view service mirrors | Real runtime |
| P-14 | UNCOVERED_COUNTRY_BILLING | WARN_ONLY | `finance.service.ts:289` resolves pre-tx → `billing.service.issueDocument` BLOCK/BLOCK_WITH_OVERRIDE refuse in-transaction | Real runtime |
| P-15 | WORKING_WEEK | FROM_COUNTRY | `attention-queue.service.ts:248 weekendDaysFor/slaOverruns` + shared `workingHoursBetween` | Real runtime |
| P-16 | POST_CLOSE_ADDENDA | APPEND_ONLY_NOTES | `work-order-dossier.service.ts:126 addNote` seals CLOSED WOs (`closed_work_order_sealed`) | Real runtime |
| P-18 | PORTAL_COUNTER_APPROVAL | ALLOWED_ATTRIBUTED | `decision.service.ts:406 recordOnBehalf` — PORTAL_ONLY refuses; WITH_EVIDENCE requires reference | Real runtime |
| P-71 | QC_MANDATORY | MANDATORY_ALWAYS | splits finish edges via facts `work_order.has_critical_fault` (`work-order-lifecycle.service.ts:192–200 resolveCurrent`; graphs :124–168) | Real runtime |
| — | INSPECTION_REQUIRED | CUSTOMER_MAY_DECLINE | edge REGISTERED→AWAITING_CUSTOMER_APPROVAL condition (graphs:50) | Real runtime *but see §3* |
| P-26 | CUSTOMER_INVOICE_VISIBILITY | SHOWN | materialized `customerInvoiceVisible` → `decision.service.ts:685–688 pricingVisible` | Real runtime |

Count enforced by actual runtime consumers: **16 of 16 have live read paths** (one purely as an edge condition). The doc claim "all 16 ENFORCED" holds against source.

## 3. The catch: policies that govern edges whose intents nobody can fire

P-02, INSPECTION_REQUIRED, P-71 and P-09 narrow/rewire edges out of REGISTERED→…→IN_PROGRESS and across review/QC. Because no production endpoint applies `START_INSPECTION / REQUEST_APPROVAL / APPROVE / START_WORK` (Report 01), **choosing non-default options here currently changes behavior only for seed-fabricated jobs or direct-service tests.** The engine is real; its subject matter is unreachable in live usage.

## 4. Post-creation change, history, staleness

- `PolicyResolutionService.set()` exists (close+open rows, reason ≥10 chars, audited `policy.changed`) — **zero production callers; no controller mounts it.** Policies cannot be changed after creation except by editing DB rows.
- `resolveValueAsOf()` (historical answers) has zero production callers — historical behavior is preserved implicitly by time-ranged rows but nothing reads it.
- Stale-answer hygiene is genuinely handled where it matters: lifecycle routing filters stored answers through `relevantPolicyAnswers(profile, stored)` so disabled-capability answers can't resurrect removed edges.
- Changing a policy mid-flight would not strand states (graph-safety proves every combination safe), but since no setter exists, the operational risk today is *misconfiguration permanence*, not drift.

## 5. Verdict table

16/16 **real runtime behavior** · 0 recorded-only · 0 UI-only · 0 dead consumers. Two systemic caveats: (a) four edge-policies act on unreachable-in-production intents; (b) governance story (mutability classes, setter endpoints, history reads) unimplemented despite registry metadata implying it.

Maturity: registry Operational · resolution Operational · combination validation Operational (graph-level) · change management Missing.
