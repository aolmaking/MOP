# Policy & Decision Inventory

> **Phase 21 deliverable. Status: OPEN — nothing here is decided or implemented.**
> **Model:** [`phases/PHASE_21.md`](./phases/PHASE_21.md) defines the decision-record schema, the capability-vs-policy test, the relevance model, and the defaults doctrine. Read it first — this document is written against it.
> **Date:** 2026-08-13.

---

## 0. How to read this

Every entry is classified by Phase 21 §3.1's mechanical test:

> **A policy may never change reachability.** If a setting could change whether a work order can reach a terminal state, it is a **capability**, not a policy — regardless of what it looks like.

| Type | Meaning |
|---|---|
| **POLICY** | The step exists and is named correctly; this decides the rule under which it passes |
| **CAPABILITY** | Changes which states/steps exist — belongs to the capability engine and its reachability proof |
| **VOCABULARY** | Workshop-defined names/fields — belongs to the specialization engine (Phases 15–17) |
| **INVARIANT** | Looks like a decision, but has exactly one defensible answer. Recorded so nobody re-opens it by accident |
| **STRUCTURAL** | A modelling decision (does entity X exist), not a per-workshop setting |

**Mutability** is one of `FREELY` · `GOVERNED` (pipeline + impact preview) · `IMMUTABLE_AFTER_FIRST_USE`.

**Progress:** 16 of ~70 identified decisions have full 18-field treatment (§2). §3 is the complete register — every decision found, compactly, so nothing is lost while the remaining tranches are written.

---

## 1. Where these came from

| Source | Decisions found |
|---|---|
| Canonical spec's Builder Control → Workflow Policy tab | 11 (named in the spec, none built) |
| `docs/scenarios/` — 78 findings, 4 workshops | ~18 |
| `docs/scenarios2/` — 40 scenarios, 8 tenants | ~12 |
| `docs/scenarios3/` — 20 edge cases | 7 (the remaining register items) |
| Deferred items across Phases 15–20 | ~14 |
| `PROJECT_STATE.md` known issues | 4 |
| Current schema and services (implicit, undocumented rules) | ~9 |

---

## 2. Tranche 1 — full treatment

### Domain A — Approval and the customer decision

---

#### P-01 — Is delivery blocked until the invoice is paid?

**Type:** POLICY · **Mutability:** GOVERNED · **Relevant when:** `FINANCE_CORE` is active (any status incl. EXTERNAL)

**Why it exists.** The flagship case for this whole layer. `docs/scenarios/` recorded the *same gate* drawing *opposite complaints*: Nafath (A 1.3) wants paid-before-release as a hard rule; Delta (C 15.1) invoices B2B customers net-30 and is blocked by it. `FINDINGS_SYNTHESIS.md` names the resolution explicitly — make it configurable rather than picking a side. Today it is hardcoded.

| Option | What it means | What it changes |
|---|---|---|
| `ALWAYS` | No vehicle leaves unpaid | Delivery gate blocks on outstanding balance |
| **`NEVER` — Default** | Delivery never waits on payment; balance is tracked and chased separately | Gate ignores balance; outstanding becomes a receivables concern |
| `UNLESS_ACCOUNT_TERMS` | Blocked by default, waived for customers holding agreed terms | Gate consults the customer/account's terms — **requires P-42 (B2B account entity)** |
| `REQUIRES_OVERRIDE` | Blocked, but a named role may release with a reason | Gate blocks; adds an audited override action |

**Default is `NEVER`, because** blocking delivery is the more destructive failure. A workshop that wanted the block and did not get it has a receivable to chase; a workshop that did not want the block and got it cannot hand a customer their car — which is a same-day operational emergency, not an accounting inconvenience. Defaults should fail toward the recoverable side.

| | |
|---|---|
| **Services** | `FinanceService.settlement`, `GateEvaluatorService`, `WorkOrderLifecycleService` (DELIVERY checkpoint) |
| **Data** | None new for `ALWAYS`/`NEVER`. `UNLESS_ACCOUNT_TERMS` needs an account-terms model |
| **Permissions** | `REQUIRES_OVERRIDE` adds one key (`delivery.release.override`) |
| **Pages** | Delivery & Payments Status · Work Order Workspace · Customer invoice view |
| **Workflows** | The delivery gate only; no lifecycle state added or removed → passes §3.1's test |
| **Change later** | Yes, governed. Loosening releases currently-blocked jobs — impact preview must state the count. Tightening does **not** retroactively block already-delivered jobs |
| **Migration** | None |
| **Depends on** | P-42 (B2B account) for `UNLESS_ACCOUNT_TERMS` only |
| **Phases** | Phase 9 (gate), Governance Controls, Owner Pricing & Financial Configuration |

---

#### P-02 — Which work requires customer approval before it proceeds?

**Type:** POLICY · **Mutability:** GOVERNED · **Relevant when:** always (customer approval is CORE — the *channel* is optional, the *step* is not)

**Why it exists.** `CAPABILITY_MODEL.md` Rule 3 separates the step from the channel: removing the portal moves approval to the counter, it never deletes consent. But *which* work needs consent is a separate question the product has never answered — today, effectively "whatever staff chooses to send."

| Option | What it means | What it changes |
|---|---|---|
| `ALL_WORK` | Nothing proceeds without explicit approval | Every fault needs a decision item |
| **`BEYOND_INITIAL_SCOPE` — Default** | Work agreed at intake proceeds; anything discovered later needs approval | Approval triggered by scope delta |
| `ABOVE_THRESHOLD` | Approval required over a money threshold | Needs a threshold value + currency awareness |
| `CRITICAL_ONLY` | Only safety-critical findings need approval | Approval triggered by severity |

**Default is `BEYOND_INITIAL_SCOPE`, because** it matches what a customer actually consented to. They agreed to a job, not to an open-ended bill; the thing that surprises them is work they never discussed. `ALL_WORK` makes a five-minute quick service require a round trip, and `CRITICAL_ONLY` lets an expensive non-critical upsell proceed unasked — the exact scenario D 19.1 flagged.

| | |
|---|---|
| **Services** | `TechnicianWorkService` (fault → decision), `CustomerDecisionService`, `GateEvaluatorService` |
| **Data** | `ABOVE_THRESHOLD` needs a threshold field (money, tenant currency) |
| **Permissions** | None |
| **Pages** | Approvals · Work Card · Customer Decision Page · Attention Center |
| **Workflows** | Which faults create decision items; `AWAITING_CUSTOMER_APPROVAL` still exists under every option → policy, not capability |
| **Change later** | Yes. Does not affect in-flight decisions already sent |
| **Migration** | None |
| **Depends on** | P-03 (decision weight) |
| **Phases** | Phase 11, Governance Controls, D 19.1's lighter mechanism |

---

#### P-03 — Does every approval carry the same weight?

**Type:** POLICY · **Mutability:** GOVERNED · **Relevant when:** always

**Why it exists.** Scenario D 19.1: the customer decision link is *correctly* heavy for a safety warning and *absurdly* heavy for a wiper-blade upsell. The synthesis is explicit that the fix is **a second, lighter mechanism, not changing the first** — so this is a real policy with a real structural consequence.

| Option | What it means | What it changes |
|---|---|---|
| `SINGLE_WEIGHT` | One formal mechanism for everything (today) | No change; simplest |
| **`TWO_TIER` — Default** | Formal decision for critical/high; lightweight confirm for low-value routine items | Adds a second, lighter decision path |
| `PER_ITEM_CHOICE` | Staff pick the weight per item | Adds a staff decision, and a way to get it wrong |

**Default is `TWO_TIER`, because** a single weight guarantees one of two failures: heavy enough for safety means friction on trivia, light enough for trivia means a safety rejection is not properly evidenced. Two tiers is the only option that is correct at both ends. `PER_ITEM_CHOICE` moves a safety judgement onto a busy technician.

| | |
|---|---|
| **Services** | `CustomerDecisionService`, `CustomerSafeProjectionService` |
| **Data** | A weight/tier field on `CustomerDecisionItem`; **critical rejections keep the acknowledgement gate under every option** |
| **Permissions** | None |
| **Pages** | Customer Decision Page (two renderings) · Approvals |
| **Workflows** | No lifecycle change |
| **Change later** | Yes; in-flight items keep the weight they were created with |
| **Migration** | Existing items backfill to the formal tier — never silently downgraded |
| **Depends on** | P-02 |
| **Phases** | Phase 11, Phase 16 |

---

#### P-04 — May a safety-critical rejection ever be recorded without acknowledgement?

**Type:** **INVARIANT** (recorded so it is never re-opened) · **Mutability:** n/a

**Why it exists.** The canonical spec lists Critical Warning Acknowledgement among the Features but marks it as the one thing that *cannot be disabled from any control surface*. It is already enforced server-side (`decision.service.ts`, and the test that tries to bypass it). Recording it here as an invariant rather than a policy means nobody later "adds an option" to it in the name of configurability.

**The only answer: no.** Not configurable, at any tier, in any market, for any workshop model.

| | |
|---|---|
| **Services** | `CustomerDecisionService` — already enforced |
| **Phases** | None — closed |

---

### Domain B — Money and handover

---

#### P-05 — Is partial payment accepted?

**Type:** POLICY · **Mutability:** GOVERNED · **Relevant when:** `FINANCE_CORE` active

**Why.** Built permissively (`recordPayment` accepts any amount up to the balance) with no decision recorded. Some workshops take deposits; some require payment in full or nothing.

| Option | Means | Changes |
|---|---|---|
| **`ALLOWED` — Default** | Any amount up to the balance | Today's behaviour |
| `FULL_ONLY` | One payment settling the whole balance | `recordPayment` rejects a short amount |
| `DEPOSIT_THEN_FULL` | One deposit at intake, then the remainder | Adds a deposit concept to intake |

**Default is `ALLOWED`, because** it is what already ships, it is the least restrictive, and refusing a customer's partial payment is a behaviour a workshop must opt into rather than discover.

| | |
|---|---|
| **Services** | `FinanceService.recordPayment` · `settlement` |
| **Data** | `DEPOSIT_THEN_FULL` needs a deposit marker on `Payment` |
| **Pages** | Delivery & Payments · Customer invoice |
| **Change later** | Yes; existing partial payments stay valid under any later setting |
| **Depends on** | P-01 |
| **Phases** | Phase 8/9, Owner Pricing page |

---

#### P-06 — Who may approve a discount, and above what value?

**Type:** POLICY · **Mutability:** GOVERNED · **Relevant when:** `FINANCE_CORE` active

**Why.** Named in the canonical spec's Workflow Policy list ("discount approval thresholds"); nothing implements it. Today any actor with pricing permission can discount without limit.

| Option | Means | Changes |
|---|---|---|
| `NONE` | No discounts at all | Discount action absent |
| `ANY_STAFF_UNLIMITED` | Whoever can price can discount | Today's behaviour |
| **`THRESHOLD_THEN_APPROVAL` — Default** | Below a value/percent, discount freely; above it, needs a named approver | Adds an approval step on the discount only |
| `ALWAYS_APPROVAL` | Every discount needs a second person | Adds an approval step always |

**Default is `THRESHOLD_THEN_APPROVAL`, because** unlimited discretionary discounting is the single most common internal-fraud vector in a service business, and requiring approval for every 5% goodwill gesture makes staff work around the system — the failure `VISION.md` §2 warns about for the workshop product specifically.

| | |
|---|---|
| **Services** | `FinanceService.addLine`/discount path |
| **Data** | Threshold value + a discount-approval record |
| **Permissions** | New key (`finance.discount.approve`) |
| **Pages** | Work Order Workspace · Owner Pricing |
| **Change later** | Yes; in-flight discounts already applied are not revisited |
| **Depends on** | P-07 (separation of duties shares the approver concept) |
| **Phases** | Phase 8, Phase 19, Governance Controls |

---

### Domain C — Parts, inventory and supervision

---

#### P-07 — Must a part be approved by someone other than the person who requested it?

**Type:** POLICY · **Mutability:** GOVERNED · **Relevant when:** `INVENTORY` active **and** the workshop has >1 staff member holding inventory permissions

**Why.** **This is the policy Phase 19.A was missing.** Separation of duties was built as a global rule, broke 22 tests modelling a legitimate single-storekeeper shop, and was reverted. `PART_REQUEST.approvedById` already exists and is populated — the attribution shipped, the enforcement did not, for want of exactly this.

Its relevance predicate is also the clearest example of why relevance must be *derived*: in a one-storekeeper workshop the question is not merely defaulted, it is **meaningless**, and must not be asked.

| Option | Means | Changes |
|---|---|---|
| **`NOT_ENFORCED` — Default** | Attribution recorded, no restriction | Today's behaviour; 19.A's shipped half |
| `DIFFERENT_PERSON` | Requester may not approve their own request | `approve()` refuses self-approval |
| `DIFFERENT_PERSON_ABOVE_VALUE` | Self-approval allowed under a value threshold | As above, gated by part value |
| `ROLE_SEPARATED` | Only a named role may approve | Approval restricted by role |

**Default is `NOT_ENFORCED`, because** the smallest workshops are a large share of the customer base and physically cannot satisfy it — a one-storekeeper shop under `DIFFERENT_PERSON` cannot issue any part at all. That is the exact failure 19.A produced. Enforcement must be opted into by a workshop that has the headcount for it.

| | |
|---|---|
| **Services** | `PartRequestService.approve` |
| **Data** | `approvedById` — already exists |
| **Permissions** | `ROLE_SEPARATED` reads role, doesn't add a key |
| **Pages** | Technician Requests · Work Card |
| **Workflows** | Refuses a transition; the graph is unchanged → policy |
| **Change later** | Yes. Tightening must not invalidate historical approvals |
| **Migration** | None |
| **Depends on** | staffing (relevance), P-06 |
| **Phases** | **19.A — blocked on this today** |

---

#### P-08 — Must unused parts be returned before a job can finish?

**Type:** POLICY · **Mutability:** GOVERNED · **Relevant when:** `INVENTORY` active **and** `PART_RETURNS` active

**Why.** In the spec's Workflow Policy list. Today the gate `parts.received_used_or_returned` is unconditional whenever Inventory is on — which is right for a stockroom-disciplined shop and wrong for one that reconciles weekly.

| Option | Means | Changes |
|---|---|---|
| **`REQUIRED` — Default** | Every issued part must be marked used or returned before finish | Today's gate |
| `WARN_ONLY` | Finish allowed, flagged for reconciliation | Gate becomes advisory |
| `NOT_REQUIRED` | No check | Gate dropped |

**Default is `REQUIRED`, because** it is the point where the physical and digital worlds are forced to agree — `VISION.md` §4.3's whole argument about stock drift. Relaxing it is a deliberate trade of accuracy for speed.

| | |
|---|---|
| **Services** | `GateEvaluatorService` |
| **Data** | None |
| **Pages** | Work Card finish checklist · Returns/Movements |
| **Workflows** | **Careful:** dropping a gate must not make a state unreachable-*from*. Terminal reachability is preserved under all three (loosening only) → policy, but must be asserted by test |
| **Change later** | Yes; loosening releases jobs currently blocked — impact preview must count them |
| **Depends on** | `PART_RETURNS` capability |
| **Phases** | Phase 7, Governance Controls |

---

#### P-09 — May a technician send work onward directly, or does it need review?

**Type:** POLICY · **Mutability:** GOVERNED · **Relevant when:** `TEAMS` active (otherwise there is no reviewer) — **note the interaction with the `TEAM_REVIEW` capability**

**Why.** In the spec's Workflow Policy list. The subtlety: `TEAM_REVIEW` as a *capability* decides whether a review state exists at all. Given that it exists, *whether every job must pass through it* is a policy.

| Option | Means | Changes |
|---|---|---|
| **`DIRECT` — Default** | Technician finishes; review is available but not compulsory | Review is a route, not a wall |
| `REVIEW_REQUIRED` | Every job passes review | Finish always routes to review |
| `REVIEW_ABOVE_VALUE` | Review only for high-value/high-risk jobs | Conditional routing |
| `REVIEW_FOR_JUNIOR` | Review based on the technician's credential level | Needs credential data (Phase 15) |

**Default is `DIRECT`, because** compulsory review on every job is a throughput cost most workshops do not want, and `TEAM_REVIEW` being *enabled* already signals the workshop wants review available — not that it wants it mandatory.

⚠️ **Reachability caution.** `REVIEW_REQUIRED` routes *through* an extra state rather than removing one, so terminal states stay reachable. But this is the closest call in tranche 1, and its test must be written before implementation.

| | |
|---|---|
| **Services** | `WorkflowRouter`, `WorkOrderLifecycleService` |
| **Data** | `REVIEW_FOR_JUNIOR` needs `StaffCredential` (Phase 15, exists) |
| **Pages** | Work Card · Team Leader Home |
| **Change later** | Yes; in-flight jobs keep their current route |
| **Depends on** | `TEAM_REVIEW` capability, P-10 |
| **Phases** | Phase 6, Phase 10 |

---

#### P-10 — Is time tracking off, optional, or required?

**Type:** POLICY · **Mutability:** FREELY · **Relevant when:** always

**Why.** In the spec's Workflow Policy list. `TechnicianShift` exists; nothing decides whether a technician *must* use it.

| Option | Means | Changes |
|---|---|---|
| `OFF` | No time capture | Controls absent |
| **`OPTIONAL` — Default** | Available, never blocking | Today's behaviour |
| `REQUIRED` | Cannot finish a task without recorded time | Adds a finish check |

**Default is `OPTIONAL`, because** required time tracking with gloved hands on a tablet is exactly the friction that loses to a paper notebook (`VISION.md` §2), and off entirely removes the data People & Performance depends on.

| | |
|---|---|
| **Services** | `TechnicianWorkService`, shift service |
| **Pages** | Work Card · Technician Performance Reports |
| **Change later** | Freely — no in-flight consequence |
| **Phases** | Phase 6, Phase 10 |

---

### Domain D — Ownership, warranty and aftercare

---

#### P-11 — When a vehicle changes owner, when does ownership actually transfer?

**Type:** POLICY · **Mutability:** GOVERNED · **Relevant when:** always
*(The project owner's own worked example.)*

**Why.** Intake transfers immediately on confirmation. Edge case E19 showed this leaves a valid decision link answerable by a *former* owner — now flagged in the audit trail rather than blocked, which was a deliberately minimal fix pending this decision.

| Option | Means | Changes |
|---|---|---|
| **`IMMEDIATE` — Default** | Transfer commits at confirmation | Today's behaviour |
| `TRANSITION_PERIOD` | Previous owner retains defined rights for a window | Ownership becomes time-ranged *for authorisation*, not just history |
| `REVIEW_REQUIRED` | Transfer enters an approval workflow | New pending-transfer state |

**Default is `IMMEDIATE`, because** the alternative asks staff to reason about a window during a 30-second counter interaction, and `AssetOwnershipHistory` already preserves the record for history either way. But **the two implied rules must be written down**, since they are currently asserted nowhere: *technical history follows the vehicle; financial history stays with the payer.*

⚠️ `REVIEW_REQUIRED` introduces a lifecycle with terminal states → would need reachability treatment, i.e. it is **arguably a capability**. Flagged for the review.

| | |
|---|---|
| **Services** | `IntakeService.transferOwnership`, `CustomerPortalService`, `CustomerDecisionService` |
| **Data** | `AssetOwnershipHistory` exists; `TRANSITION_PERIOD` makes it authorisation-load-bearing |
| **Permissions** | Under `TRANSITION_PERIOD`, "may this customer see this asset" stops being a column read |
| **Pages** | Customer Intake · My Assets · Safe Technical History |
| **Change later** | Yes; in-flight transfers complete under the rule they started under |
| **Depends on** | P-12 (warranty basis) |
| **Phases** | Phase 11, Phase 16.D |

---

#### P-12 — Does a warranty follow the vehicle or the customer — and how is its end date computed?

**Type:** POLICY (basis) + **INVARIANT** (arithmetic) · **Mutability:** IMMUTABLE_AFTER_FIRST_USE · **Relevant when:** the workshop declares a warranty specialization (Phase 15)

**Why.** Edge case **E11** asks what happens when a warranty period lands on 29 February. But E11 is the *smaller* half: nobody has decided whether a warranty survives a sale at all.

| Option | Means | Changes |
|---|---|---|
| **`FOLLOWS_VEHICLE` — Default** | Warranty attaches to the asset and survives sale | Claim checked against asset |
| `FOLLOWS_CUSTOMER` | Warranty is personal; a sale ends it | Claim checked against the paying customer |
| `FOLLOWS_VEHICLE_UNLESS_SOLD` | Survives, but not a change of owner | Both checks |

**Default is `FOLLOWS_VEHICLE`, because** the work was done to the vehicle, and the common customer expectation on a serviced part is that the repair is warranted — not the person.

**Arithmetic is an invariant, not an option:** add calendar months, and where the target date does not exist, use the **last day of the target month** (31 Jan + 1 month = 28/29 Feb). Applied uniformly, documented once, never per-workshop — a workshop-configurable date arithmetic would be absurd.

| | |
|---|---|
| **Services** | Warranty check (unbuilt), `IntakeService` |
| **Data** | Warranty period on the service/specialization definition |
| **Pages** | Work Card · Customer history · Intake |
| **Change later** | **No** — existing warranties were sold under a rule; changing it retroactively alters an obligation to a customer |
| **Depends on** | P-11 |
| **Phases** | Phase 15 (E11 blocks the warranty field shipping) |

---

### Domain E — Scheduling

---

#### P-13 — May work start without an appointment?

**Type:** POLICY · **Mutability:** GOVERNED · **Relevant when:** a `SCHEDULING` capability exists **and** is active
*(This policy is unreachable until the capability question — §3 register S-01 — is settled.)*

**Why.** Phase 21 §3.1's worked example of the capability/policy split. *"Does this workshop have scheduling?"* is a capability. *"Given scheduling, may a walk-in be served?"* is a policy — and every scenario workshop had walk-ins.

| Option | Means | Changes |
|---|---|---|
| **`WALK_IN_ALLOWED` — Default** | Appointments organise the day; walk-ins are served | Both intake routes live |
| `APPOINTMENT_REQUIRED` | No appointment, no job | Intake requires a slot |
| `WALK_IN_QUEUED` | Walk-ins accepted into a separate queue | Adds a queue concept |

**Default is `WALK_IN_ALLOWED`, because** every one of the four scenario workshops took walk-ins, and a system that refuses them would be abandoned on day one.

| | |
|---|---|
| **Services** | `IntakeService`, scheduling service (unbuilt) |
| **Data** | Depends entirely on S-01 |
| **Pages** | Customer Intake · Branch Manager board |
| **Depends on** | **S-01 (does scheduling exist at all)** |
| **Phases** | 16.B/16.C — the largest open item in the roadmap |

---

### Domain F — Compliance and locale

---

#### P-14 — What happens when a tenant's country has no billing adapter?

**Type:** POLICY · **Mutability:** GOVERNED · **Relevant when:** `BILLING` is `ENABLED` (not EXTERNAL) **and** the tenant's country has no adapter

**Why.** `compliantBlocked` is computed and stored today but is **visibility-only** — a tenant in an uncovered country can still issue invoices the state does not recognise. `ADAPTER_COVERED_COUNTRIES` is currently empty, so this is every tenant.

| Option | Means | Changes |
|---|---|---|
| **`WARN_ONLY` — Default** | Flag it, allow issuance | Today's behaviour |
| `BLOCK` | Refuse issuance until an adapter exists | Hard stop on trading |
| `BLOCK_WITH_OVERRIDE` | Refuse, but the platform can grant an exception | Adds an audited override |

**Default is `WARN_ONLY`, because** `BLOCK` shipped without warning would end a paying tenant's ability to trade — the largest blast radius available in the product, against `VISION.md` §2's bar for the platform product. `BLOCK_WITH_OVERRIDE` is the right *destination*; `WARN_ONLY` is the right default until adapters exist.

| | |
|---|---|
| **Services** | `BillingService.issueDocument`, `FinanceService.issueInvoice` |
| **Data** | `compliantBlocked` — already exists |
| **Pages** | Workshops list drawer · Governance Controls |
| **Change later** | Yes, and this is the intended path as ZATCA/ETA land |
| **Depends on** | country adapter availability |
| **Phases** | Phase 9, Phase 14 (legal half), Phase 20.D |

---

#### P-15 — Which days are the working week?

**Type:** POLICY · **Mutability:** FREELY · **Relevant when:** always

**Why.** Phase 20.D, found by the Saudi tenant scenario: MOP assumes a Mon–Fri working week in SLA and ageing arithmetic. Saudi Arabia's weekend is Friday–Saturday. Every "waiting 24h" calculation in the Attention Center is silently wrong for such a tenant.

| Option | Means | Changes |
|---|---|---|
| **`FROM_COUNTRY` — Default** | Derived from the tenant's country | Needs a country→week table |
| `EXPLICIT_DAYS` | Workshop names its own working days | Per-tenant day set |
| `SEVEN_DAY` | No weekend concept | Ageing is pure elapsed time |

**Default is `FROM_COUNTRY`, because** it is right without being asked in the overwhelming majority of cases, and country is already collected at creation.

| | |
|---|---|
| **Services** | `attention-ranking`, SLA/overrun (16.E), any ageing calculation |
| **Data** | Working-week field on tenant config |
| **Pages** | Attention Center · all reports with ageing |
| **Change later** | Freely, though historical ageing figures shift |
| **Phases** | Phase 20.D, Phase 16.E |

---

#### P-16 — May anything be added to a work order after it closes?

**Type:** POLICY · **Mutability:** GOVERNED · **Relevant when:** always

**Why.** Scenario C 13.1 (append-only addenda), deferred as 16.G. Today a closed work order is closed; a customer phoning two days later with a related complaint has nowhere to land.

| Option | Means | Changes |
|---|---|---|
| `NOTHING` | Closed is closed | Today's behaviour |
| **`APPEND_ONLY_NOTES` — Default** | Notes/attachments may be appended; nothing existing changes | Adds an addendum record |
| `REOPEN_ALLOWED` | A closed job can return to an active state | ⚠️ **reverses a terminal transition** |
| `LINKED_FOLLOW_UP` | A new linked work order is created instead | Needs WO-to-WO linkage (P-40) |

**Default is `APPEND_ONLY_NOTES`, because** it preserves the immutability that money and audit depend on while giving the real-world event somewhere to go.

⚠️ **`REOPEN_ALLOWED` fails §3.1's test** — it makes a terminal state non-terminal, which changes reachability. It is therefore a **capability**, not a policy option, and is recorded here only to be reclassified. Good early evidence that the test does real work.

| | |
|---|---|
| **Services** | `WorkOrderLifecycleService`, `AuditService` |
| **Data** | Addendum record; `Attachment` already exists (16.H) |
| **Pages** | Work Order Workspace · Customer history |
| **Depends on** | P-40 (WO linkage) for `LINKED_FOLLOW_UP` |
| **Phases** | 16.C, 16.G |

---

## 3. The complete register

Everything identified. Tranche 1 entries above are marked ✅; the rest carry a *proposed* type and default to be confirmed when written up in full.

### Approval & customer (A)

| # | Decision | Type | Proposed default | Relevant when |
|---|---|---|---|---|
| P-01 ✅ | Delivery blocked until paid | POLICY | `NEVER` | Finance active |
| P-02 ✅ | What requires approval | POLICY | `BEYOND_INITIAL_SCOPE` | always |
| P-03 ✅ | Approval weight tiers | POLICY | `TWO_TIER` | always |
| P-04 ✅ | Critical acknowledgement waivable | INVARIANT | never | always |
| P-17 | Decision link expiry period | POLICY | 7 days | Portal active |
| P-18 | May staff record a verbal approval on the customer's behalf | POLICY | allowed, attributed | always |
| P-19 | What happens to work when the customer never answers | POLICY | escalate, never auto-approve | always |
| P-20 | May a customer change an answer before work starts | POLICY | no | always |
| P-21 | Customer self-registration open or code-only | POLICY | code-only | Portal active |

### Money & handover (B)

| # | Decision | Type | Proposed default | Relevant when |
|---|---|---|---|---|
| P-05 ✅ | Partial payment | POLICY | `ALLOWED` | Finance active |
| P-06 ✅ | Discount approval threshold | POLICY | `THRESHOLD_THEN_APPROVAL` | Finance active |
| P-22 | Tax inclusive or exclusive pricing | POLICY | country-derived | Finance active |
| P-23 | Refund approval authority | POLICY | owner-only | Refunds active |
| P-24 | Invoice numbering scheme | POLICY | per-tenant sequential | **IMMUTABLE after first invoice** |
| P-25 | Currency changeable after creation | INVARIANT | no | always |
| P-26 | Price shown to customer before approval | POLICY | shown | Portal active |
| P-27 | Who may write off a bad debt | POLICY | owner-only | Finance active |
| P-28 | Deposit required at intake | POLICY | not required | Finance active |

### Parts & inventory (C)

| # | Decision | Type | Proposed default | Relevant when |
|---|---|---|---|---|
| P-07 ✅ | Separation of duties on parts | POLICY | `NOT_ENFORCED` | Inventory + >1 storekeeper |
| P-08 ✅ | Return-unused before finish | POLICY | `REQUIRED` | Inventory + Returns |
| P-09 ✅ | Technician direct-send vs review | POLICY | `DIRECT` | Teams active |
| P-10 ✅ | Time tracking | POLICY | `OPTIONAL` | always |
| P-29 | Negative stock ever permitted | INVARIANT | no | Inventory |
| P-30 | Customer-supplied parts accepted | POLICY | accepted, liability recorded | always |
| P-31 | Direct-purchase parts bypassing warehouse (A 2.1) | POLICY | allowed | Inventory |
| P-32 | Warehouse deactivation with nonzero stock (**H7**) | POLICY | block until zeroed | Inventory |
| P-33 | Stock-take frequency / reconciliation cadence | POLICY | none enforced | Inventory |

### People, roles & supervision (D)

| # | Decision | Type | Proposed default | Relevant when |
|---|---|---|---|---|
| P-34 | One person holding several roles (A 1.1) | POLICY | allowed | always |
| P-35 | Workshop-defined role names | VOCABULARY | platform roles | always |
| P-36 | Regional-manager tier (17.E / D 20.1) | CAPABILITY | off | Multi-branch |
| P-37 | Staff exit reason & rehire eligibility | POLICY | recorded, not enforced | always |
| P-38 | Supervision notes visible to subject | INVARIANT | never | Teams |
| P-39 | Credential expiry blocks assignment | POLICY | warn only | Credentials declared |

### Work-order structure (E)

| # | Decision | Type | Proposed default | Relevant when |
|---|---|---|---|---|
| P-16 ✅ | Post-close addenda | POLICY | `APPEND_ONLY_NOTES` | always |
| P-40 | WO-to-WO linkage: comeback / follow-up / parent-child | STRUCTURAL | build it | always |
| P-41 | Multi-session / multi-day jobs (C 11.1) | STRUCTURAL | defer | Field service |
| P-42 | B2B `Account` distinct from `Customer` (B 10.1) | STRUCTURAL | build it | B2B present |
| P-43 | Payer as first-class attribute (16.D) | STRUCTURAL | build it | Warranty/insurer/fleet |
| P-44 | Location/site entity (C 12.1) | STRUCTURAL | defer | Field service |
| P-45 | Workshop-defined blocker reasons | VOCABULARY | platform enum | always |

### Ownership, warranty, history (F)

| # | Decision | Type | Proposed default | Relevant when |
|---|---|---|---|---|
| P-11 ✅ | Ownership transfer timing | POLICY | `IMMEDIATE` | always |
| P-12 ✅ | Warranty basis + leap year (**E11**) | POLICY + INVARIANT | `FOLLOWS_VEHICLE` | Warranty declared |
| P-46 | New owner sees prior technical history | POLICY | yes, technical only | always |
| P-47 | Customer data deletion on request | POLICY | anonymise, retain financial | always |
| P-48 | Retention period before archive purge (**E17**) | POLICY | country-derived | always |

### Scheduling (G)

| # | Decision | Type | Proposed default | Relevant when |
|---|---|---|---|---|
| **S-01** | **Does MOP have scheduling at all?** | **CAPABILITY** | **undecided — needs its own pass** | — |
| P-13 ✅ | Walk-ins without appointment | POLICY | `WALK_IN_ALLOWED` | S-01 = yes |
| P-49 | Resources (bays/lifts/crews) modelled | CAPABILITY | off | S-01 = yes |
| P-50 | Promise time customer-visible | POLICY | visible | 16.A shipped |
| P-51 | Overbooking permitted | POLICY | allowed | S-01 = yes |

### Governance & audit (H)

| # | Decision | Type | Proposed default | Relevant when |
|---|---|---|---|---|
| P-52 | Point-in-time reporting snapshots (19.G) | STRUCTURAL | snapshots at period close | always |
| P-53 | Historical permission reconstruction (19.E) | STRUCTURAL | defer, keep events sufficient | always |
| P-54 | Support impersonation (19.F) | CAPABILITY | off, needs threat model | always |
| P-55 | Audit retention period | POLICY | indefinite | always |
| P-56 | Capability rollback vs in-flight transition (**E13**) | INVARIANT | in-flight wins, rollback queues | always |
| P-57 | Who may see cost vs price | POLICY | cost hidden by default | Inventory |

### Identity & tenancy (I)

| # | Decision | Type | Proposed default | Relevant when |
|---|---|---|---|---|
| P-58 | Staff member across multiple tenants (18.B) | STRUCTURAL | **hold** — 18.A covers observed cases | always |
| P-59 | Customer identity across tenants | STRUCTURAL | per-tenant | always |
| P-60 | Tenant merge/split (18.F) | STRUCTURAL | decided: no first-class support | always |
| P-61 | Shared-device identity (20.F) | POLICY | per-person login | Shop-floor devices |
| P-62 | Password hash versioning (**E18**) | INVARIANT | lazy rehash on login | always |

### Platform & operations (J)

| # | Decision | Type | Proposed default | Relevant when |
|---|---|---|---|---|
| P-15 ✅ | Working week | POLICY | `FROM_COUNTRY` | always |
| P-14 ✅ | Compliant-blocked enforcement | POLICY | `WARN_ONLY` | Billing enabled |
| P-63 | Realtime transport, or drop the promise | STRUCTURAL | SSE | always |
| P-64 | Offline clients (20.E) | INVARIANT | decided: no | always |
| P-65 | Clock authority across replicas (**E12**) | INVARIANT | DB clock is authoritative | always |
| P-66 | DB failover posture + runbook (**E20**) | STRUCTURAL | documented runbook | always |
| P-67 | Custom fields queryable/reportable | STRUCTURAL | store now, promote per-field | Specializations declared |
| P-68 | Data import path (D 16.1) | CAPABILITY | build in 17.D | always |
| P-69 | Bulk correction tool (D 16.2) | CAPABILITY | defer | always |
| P-70 | `statusChangedAt` column vs `updatedAt` proxy | STRUCTURAL | add the column | always |

---

## 4. Coverage of the seven remaining edge cases

| Edge case | Now tracked as | Verdict |
|---|---|---|
| **E11** leap-year warranty | P-12 | Policy (basis) + invariant (arithmetic) |
| **E12** clock skew | P-65 | Invariant — DB clock authoritative |
| **E13** capability rollback race | P-56 | Invariant — needs the design spike Phase 3 already owes |
| **E17** dormant-tenant migrations | P-48 | Policy — retention period |
| **E18** password rehash | P-62 | Invariant |
| **E20** DB failover | P-66 | Structural — runbook, not a feature |
| **H7** warehouse deactivation | P-32 | Policy |

All seven are now inside the inventory. None was a leftover bug.

---

## 5. What is still owed in this phase

1. **Tranches 2–5** — full 18-field treatment for P-17 through P-70 (54 remaining).
2. **The relevance graph** — every predicate written and proven acyclic.
3. **S-01 (scheduling)** — needs its own scenario pass before it can be answered; it is the only entry whose *type* is undecided, and it gates five others.
4. **Resolution of the four open questions** in `PHASE_21.md` §7 — in particular whether QC is a capability (this document's test says yes; the canonical spec says policy).
5. **Owner review**, before any implementation phase opens.
