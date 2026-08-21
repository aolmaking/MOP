# Policy & Decision Inventory

> **Phase 21 deliverable. Status: architectural resolution pass complete — see `phases/PHASE_21.md` §8–§17. Nothing here is implemented; several entries now carry a DECIDED/EVIDENCE-BACKED status rather than being uniformly OPEN, per that pass. §6 of this document records the status of every entry explicitly.**
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
| `docs/archive/discovery/scenarios/` — 78 findings, 4 workshops | ~18 |
| `docs/archive/discovery/scenarios2/` — 40 scenarios, 8 tenants | ~12 |
| `docs/archive/discovery/scenarios3/` — 20 edge cases | 7 (the remaining register items) |
| Deferred items across Phases 15–20 | ~14 |
| `PROJECT_STATE.md` known issues | 4 |
| Current schema and services (implicit, undocumented rules) | ~9 |

---

## 2. Tranche 1 — full treatment

### Domain A — Approval and the customer decision

---

#### P-01 — Is delivery blocked until the invoice is paid?

**Type:** POLICY · **Mutability:** GOVERNED · **Relevant when:** `FINANCE_CORE` is active (any status incl. EXTERNAL)

**Why it exists.** The flagship case for this whole layer. `docs/archive/discovery/scenarios/` recorded the *same gate* drawing *opposite complaints*: Nafath (A 1.3) wants paid-before-release as a hard rule; Delta (C 15.1) invoices B2B customers net-30 and is blocked by it. `FINDINGS_SYNTHESIS.md` names the resolution explicitly — make it configurable rather than picking a side. Today it is hardcoded.

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
| **Depends on** | *(related to P-02, not formally dependent — see `PHASE_21.md` §9.1, a cross-reference only; neither's relevance or default reads the other's value)* |
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
| **Depends on** | *(related to P-12, not formally dependent — see `PHASE_21.md` §9.1; same real-world event, resolved independently)* |
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
| **Depends on** | none formally (see P-11's note — cross-referenced, not dependent) |
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
| **Depends on** | P-40 must exist as a capability for the `LINKED_FOLLOW_UP` *option* to be offered — a one-directional precondition, not a relevance cycle (`PHASE_21.md` §9.1) |
| **Phases** | 16.C, 16.G |

---

## 2b. Tranches 2–5 — the remaining 54

Written in the compressed form: every one of the 18 fields is present, at lower word count than tranche 1. **Posture** is `PHASE_21.md` §3.7's build-posture verdict — what *kind of thing* this should be, and whether prebuilding it is justified or speculative.

### Domain A (cont.) — Approval & the customer

---

#### P-17 — How long does a decision link stay open?
**POLICY** · GOVERNED · **Posture: POLICY-CONTROLLED** · Relevant: always (link exists even without the portal — staff-recorded)
*Why:* `expiresAt` is nullable and nothing sets it. A link that never expires is a standing authorisation to approve work, indefinitely.

| Option | Means | Changes |
|---|---|---|
| `NEVER` | Open until answered | Today's behaviour |
| **`FIXED_DAYS` (7) — Default** | Lapses after a set window | Expiry computed at send |
| `UNTIL_JOB_CLOSES` | Tied to the work order | Expiry derived from lifecycle |

*Default `FIXED_DAYS`(7) because* an unanswered decision is an operational stall that needs escalating, not a link that quietly waits forever; 7 days covers a customer on holiday without leaving consent open for a year.
*Touches:* `CustomerDecisionService` · expiry field exists · no perms · Decision Page + Approvals · no lifecycle change.
*Later:* freely; in-flight links keep their issued expiry. *Depends:* P-19. *Phases:* 11.

---

#### P-18 — May staff record an approval the customer gave verbally?
**POLICY** · GOVERNED · **Posture: CORE** (the *step* is core per `CAPABILITY_MODEL.md` Rule 3; only its channel varies)
*Relevant:* always — and **mandatory** when `CUSTOMER_PORTAL` is disabled, or the workshop cannot function.
*Why:* Rule 3 says removing the portal moves approval to the counter, it never deletes consent. Nothing implements the counter path.

| Option | Means | Changes |
|---|---|---|
| **`ALLOWED_ATTRIBUTED` — Default** | Staff record it; the recording staff member is the actor, not the customer | Adds a staff-recorded decision path |
| `ALLOWED_WITH_EVIDENCE` | Requires an attachment/reference | As above + evidence requirement |
| `PORTAL_ONLY` | Only the customer may answer | Portal becomes load-bearing |

*Default `ALLOWED_ATTRIBUTED` because* most approvals in a real workshop happen on a phone call, and forcing them through a portal is the friction that loses to WhatsApp. Attribution is non-negotiable: the record must never claim the customer clicked when a receptionist typed.
*Touches:* `CustomerDecisionService` · actor fields exist · new perm (`customer_decision.record_on_behalf`) · Approvals · no lifecycle change.
*Later:* governed. *Depends:* P-02, P-03. *Phases:* 5, 11 — **this is a real gap today**.

---

#### P-19 — What happens when the customer never answers?
**POLICY** · GOVERNED · **Posture: POLICY-CONTROLLED** · Relevant: always
*Why:* Today a job waits in `AWAITING_CUSTOMER_APPROVAL` forever; only the Attention Center's ageing surfaces it, and nothing acts.

| Option | Means | Changes |
|---|---|---|
| **`ESCALATE_ONLY` — Default** | Ages up the attention queue; a human chases | Ranking only |
| `AUTO_DECLINE_AFTER` | Unanswered ⇒ declined | Automatic decision write |
| `AUTO_APPROVE_AFTER` | Unanswered ⇒ approved | ⚠️ fabricates consent |
| `CANCEL_JOB_AFTER` | Job cancelled | Terminal transition |

*Default `ESCALATE_ONLY` because* silence is not consent and it is not refusal either — inferring either one puts a fabricated customer decision into a legal record. **`AUTO_APPROVE_AFTER` should arguably not be offered at all**; it is listed to be argued about, and it is the single most dangerous option in this inventory.
*Touches:* `AttentionQueueService` · no data · no perms · Attention Center + Approvals · `CANCEL_JOB_AFTER` writes a terminal transition (still reachable → policy, narrowly).
*Later:* governed. *Depends:* P-17. *Phases:* 5, 11, 13 (needs a scheduled job).

---

#### P-20 — May a customer change an answer before work starts?
**POLICY** · GOVERNED · **Posture: POLICY-CONTROLLED** · Relevant: always
*Why:* Today `already_answered` is absolute. A customer who approves then calls back in five minutes has no path.

| Option | Means | Changes |
|---|---|---|
| **`NO_STAFF_MEDIATED` — Default** | Customer cannot self-revise; staff can void and re-ask | Adds a staff void action |
| `YES_UNTIL_WORK_STARTS` | Self-service revision while the task is unstarted | Item becomes mutable pre-start |
| `NO` | Immutable, full stop | Today's behaviour |

*Default `NO_STAFF_MEDIATED` because* the real-world event is common and the immutability of the *record* matters more than the immutability of the *answer* — voiding and re-asking preserves both, where self-service revision quietly rewrites what was agreed.
*Touches:* `CustomerDecisionService` · void record · new perm · Approvals + Decision Page · no lifecycle change.
*Later:* governed. *Depends:* P-02. *Phases:* 11.

---

#### P-21 — Can customers self-register, or only by code?
**POLICY** · GOVERNED · **Posture: POLICY-CONTROLLED** · Relevant: `CUSTOMER_PORTAL` active
*Why:* `Tenant.customerRegistrationCode` exists for this and the Register page is unbuilt (`PAGE_INVENTORY.md`, Shared 2/6).

| Option | Means | Changes |
|---|---|---|
| **`CODE_ONLY` — Default** | Needs the workshop's code | Registration validates the code |
| `OPEN` | Anyone may register against the tenant | Public signup surface |
| `INVITE_ONLY` | Staff create the account | No self-registration |

*Default `CODE_ONLY` because* the schema already assumes it, and an open endpoint on a multi-tenant product is an enumeration surface — a stranger should not be able to discover which workshops exist by probing.
*Touches:* auth/registration · code field exists · no perms · Register page (unbuilt) · none.
*Later:* freely. *Depends:* none. *Phases:* Shared pages.

---

### Domain B (cont.) — Money

---

#### P-22 — Is pricing tax-inclusive or tax-exclusive?
**POLICY** · **IMMUTABLE_AFTER_FIRST_USE** · **Posture: POLICY-CONTROLLED** · Relevant: `FINANCE_CORE` active
*Why:* `money.ts` fixed the discount/tax *order*; nobody decided whether a catalogue price already contains tax. Egypt and Saudi differ from most European practice, and getting it wrong misstates every price.

| Option | Means | Changes |
|---|---|---|
| **`FROM_COUNTRY` — Default** | Derived from the tenant's country | Country→convention table |
| `INCLUSIVE` | Catalogue prices contain tax | Tax back-computed |
| `EXCLUSIVE` | Tax added at invoice | Tax forward-computed |

*Default `FROM_COUNTRY` because* it is right without being asked in nearly all cases, and country is already collected at creation.
*Touches:* `money.ts` + `FinanceService` · convention field · no perms · every price surface · none.
*Later:* **no** — changing it reinterprets every stored price. *Depends:* P-25. *Phases:* 8, 9, 14, 20.D.

---

#### P-23 — Who may approve a refund?
**POLICY** · GOVERNED · **Posture: POLICY-CONTROLLED** · Relevant: refunds active (`FINANCE_CORE` + not EXTERNAL)
*Why:* Phase 9 shipped `finance.refund.request`/`decide` as two keys specifically so the separation-of-duties gap would be *visible* until a policy could enforce it. This is that policy.

| Option | Means | Changes |
|---|---|---|
| **`OWNER_ONLY` — Default** | Only the owner decides | Decide key restricted to owner |
| `ANY_WITH_PERMISSION` | Whoever holds the key | Today's behaviour |
| `ABOVE_THRESHOLD_OWNER` | Small refunds delegated | Threshold check |
| `DIFFERENT_FROM_REQUESTER` | Anyone but the requester | Self-approval refused |

*Default `OWNER_ONLY` because* a refund is money leaving the business with no goods returning — the highest-trust routine action in the product, and the one an internal-fraud scenario reaches for first.
*Touches:* `FinanceService.approveRefund` · `RefundRequest` exists · uses existing keys · Owner Money page (unbuilt) · none.
*Later:* governed. *Depends:* P-06, P-07. *Phases:* 9, 19.

---

#### P-24 — What is the invoice numbering scheme?
**POLICY** · **IMMUTABLE_AFTER_FIRST_USE** · **Posture: POLICY-CONTROLLED** · Relevant: `BILLING` not EXTERNAL
*Why:* `InvoiceSequence` gives per-tenant sequential numbering (fixed under H3). Some jurisdictions require per-branch series or a year prefix; a country adapter may mandate a format outright.

| Option | Means | Changes |
|---|---|---|
| **`TENANT_SEQUENTIAL` — Default** | One unbroken series per tenant | Today's behaviour |
| `BRANCH_SEQUENTIAL` | A series per branch | Sequence key gains branch |
| `YEAR_PREFIXED` | Resets annually with a year prefix | Sequence key gains year |
| `ADAPTER_DEFINED` | The country adapter decides | Format delegated |

*Default `TENANT_SEQUENTIAL` because* it is the simplest scheme that satisfies "no gaps, no duplicates" — the property tax authorities actually check — and it is already built and proven under concurrency.
*Touches:* `FinanceService.nextInvoiceNumber` · `invoice_sequences` key shape · no perms · invoices · none.
*Later:* **no** — a changed scheme breaks the unbroken-series property auditors rely on. *Depends:* P-14. *Phases:* 9, 14.

---

#### P-25 — Can a workshop's currency change after creation?
**INVARIANT** (answer: no) · **Posture: CORE**
*Why:* Recorded so it is never re-opened. The spec already says currency is fixed at creation; the reason is that changing it after real invoices exist is a data-migration problem wearing a form field — every stored `Decimal` would need reinterpreting against a rate at a date, and historical invoices are immutable by design.
*The only answer:* no. A workshop that must change currency is a new tenant with migrated data, handled the same way as 18.F's merge/split decision.
*Phases:* closed.

---

#### P-26 — Are prices shown to the customer before approval?
**POLICY** · GOVERNED · **Posture: POLICY-CONTROLLED** · Relevant: always
*Why:* `FinanceConfiguration.customerInvoiceVisible` exists and `decision.service.ts` already honours it (`price: null`, not zero). The decision was made in code; it was never written down or surfaced.

| Option | Means | Changes |
|---|---|---|
| **`SHOWN` — Default** | Item prices visible on the decision | Today's default |
| `HIDDEN` | Items without numbers | Already supported |
| `TOTAL_ONLY` | One figure, no breakdown | New projection |

*Default `SHOWN` because* asking someone to approve work without telling them the price is not informed consent, which is the entire purpose of the decision step.
*Touches:* `CustomerDecisionService` + safe projection · field exists · no perms · Decision Page + portal invoices · none.
*Later:* freely. *Depends:* P-02. *Phases:* 11.

---

#### P-27 — Who may write off an uncollectable balance?
**POLICY** · GOVERNED · **Posture: DEFERRED-UNTIL-DEMANDED** · Relevant: `FINANCE_CORE` active
*Why:* No write-off path exists anywhere. Under P-01's `NEVER` default, receivables accumulate — and eventually one is uncollectable, with nothing in the product to record it.
| Option | Means |
|---|---|
| **`OWNER_ONLY` — Default** | Owner writes off with a reason |
| `NOT_SUPPORTED` | No mechanism; handled outside |
| `ABOVE_THRESHOLD_OWNER` | Delegated below a limit |

*Default `OWNER_ONLY` because* it mirrors P-23's reasoning — money forgiven is money lost, and it needs one accountable name.
**Posture note:** deferred, not prebuilt — it appeared in zero of the 60 scenarios (§3.7 disqualifier 4). It is listed because P-01's default *creates* the need, which is the kind of second-order consequence this inventory exists to surface.
*Touches:* `FinanceService` · a write-off record · new perm · Owner Money · none. *Later:* n/a. *Phases:* 8/10.

---

#### P-28 — Is a deposit required before work begins?
**POLICY** · GOVERNED · **Posture: POLICY-CONTROLLED** · Relevant: `FINANCE_CORE` active
*Why:* Phase 8 named deposits; nothing implements one. Common for expensive parts ordered specially.
| Option | Means |
|---|---|
| **`NOT_REQUIRED` — Default** | No deposit concept |
| `REQUIRED_ABOVE_VALUE` | Deposit over a threshold |
| `REQUIRED_ALWAYS` | Always |
| `REQUIRED_FOR_SPECIAL_ORDER` | Only when a part is specially ordered |

*Default `NOT_REQUIRED` because* it is today's behaviour and a deposit gate blocks work starting — the same "fail toward recoverable" logic as P-01.
*Touches:* `FinanceService` + intake · deposit marker on `Payment` · no perms · Intake + Workspace · adds a pre-work check (no state added → policy).
*Later:* governed. *Depends:* P-05. *Phases:* 8.

---

### Domain C (cont.) — Parts & inventory

---

#### P-29 — May stock ever go negative?
**INVARIANT** (answer: no) · **Posture: CORE**
*Why:* Enforced in service code *and* as a database constraint, and re-proven under concurrency by the H6/E16 fix (`SELECT … FOR UPDATE`). Recorded so no future "allow oversell" request reopens it: a negative balance makes the ledger unreplayable, and `VISION.md` §4.3's whole argument is that stock is a claim about the physical world that must stay checkable.
*The only answer:* no. A workshop needing to issue what it does not have wants P-31 (direct purchase), not negative stock.
*Phases:* closed.

---

#### P-30 — Are customer-supplied parts accepted?
**POLICY** · GOVERNED · **Posture: PREBUILT-ACTIVATABLE** · Relevant: always
*Why:* Named in `VISION.md` §7 as a *"cheap now, expensive later"* decision — and still undecided. It carries a liability question no other part does: the workshop fits something it did not source and cannot warrant.

| Option | Means | Changes |
|---|---|---|
| **`ACCEPTED_LIABILITY_RECORDED` — Default** | Accepted; warranty exclusion recorded on the item | Part with no stock movement + a liability flag |
| `REFUSED` | Workshop-supplied only | Intake refuses |
| `ACCEPTED_NO_TRACKING` | Fitted, unrecorded | Invisible to warranty |

*Default `ACCEPTED_LIABILITY_RECORDED` because* refusing is commercially unrealistic in most markets and `ACCEPTED_NO_TRACKING` is how a workshop ends up warranting a part it never sold.
**Posture note:** passes all three prebuild clauses — no schema fork (a part row with no stock movement is already expressible), removal policy declarable, reachability unaffected.
*Touches:* `PartRequestService` + finance lines · liability flag · no perms · Work Card + Intake · no lifecycle change.
*Later:* governed. *Depends:* P-12 (warranty). *Phases:* 7, 15.

---

#### P-31 — May a part be bought directly for a job, bypassing the warehouse?
**POLICY** · GOVERNED · **Posture: PREBUILT-ACTIVATABLE** · Relevant: `INVENTORY` active
*Why:* Scenario A 2.1. The `EXTERNAL_PARTS` capability exists in the registry, but the *rule* — when direct purchase is allowed vs. forced through stock — does not.
| Option | Means |
|---|---|
| **`ALLOWED` — Default** | Buy and fit, priced, no stock movement |
| `ONLY_IF_OUT_OF_STOCK` | Stock first, direct as fallback |
| `NEVER` | Everything through the warehouse |

*Default `ALLOWED` because* the alternative forces a fiction — receiving a part into stock and immediately issuing it — which pollutes the ledger the inventory system exists to keep honest.
*Touches:* `PartRequestService` · uses `EXTERNAL_PARTS` · no perms · Work Card + Requests · none.
*Later:* governed. *Depends:* `EXTERNAL_PARTS`. *Phases:* 7.

---

#### P-32 — What happens when a warehouse with stock is deactivated? *(**H7**)*
**POLICY** · GOVERNED · **Posture: POLICY-CONTROLLED** · Relevant: `INVENTORY` active
*Why:* Edge case H7 — no described path exists. Today deactivation would strand the balances.
| Option | Means |
|---|---|
| **`BLOCK_UNTIL_ZERO` — Default** | Refuse while stock remains |
| `TRANSFER_THEN_DEACTIVATE` | Guided move to another warehouse |
| `WRITE_OFF_REMAINDER` | Zero it with a recorded write-off |
| `DEACTIVATE_FROZEN` | Read-only, balances preserved |

*Default `BLOCK_UNTIL_ZERO` because* it is the only option that cannot silently lose a claim about physical goods; the others are all legitimate but must be chosen deliberately.
*Touches:* warehouse admin (unbuilt) · none · no perms · Stock page · none.
*Later:* governed. *Depends:* P-29. *Phases:* 7 — **closes H7**.

---

#### P-33 — Is periodic stock reconciliation enforced?
**POLICY** · FREELY · **Posture: DEFERRED-UNTIL-DEMANDED** · Relevant: `INVENTORY` active
*Why:* `VISION.md` §4.3 argues reconciliation must be *"normal, cheap, blameless."* Nothing schedules or prompts it.
| Option | Means |
|---|---|
| **`NONE` — Default** | Ad hoc |
| `PROMPTED_PERIODIC` | Reminder on a cadence |
| `REQUIRED_PERIODIC` | Blocks issuing when overdue |

*Default `NONE` because* enforcement without a stock-take UI would block a workshop from issuing parts with no way to unblock itself.
**Posture note:** deferred — the enforcement policy is meaningless until a stock-take flow exists.
*Touches:* n/a yet · none · none · Stock · none. *Depends:* stock-take feature. *Phases:* 7 (future).

---

#### P-71 — Is QC mandatory for every job, or only above a value/risk threshold? *(found during `PHASE_21.md` §8.D's resolution pass)*
**POLICY** · GOVERNED · **Posture: POLICY-CONTROLLED** · Relevant when `QC` capability active
*Why:* §3.1's mechanical test confirms QC itself is correctly a **capability** — it owns real states (`READY_FOR_QC`, `QC_FAILED`) in `workflow-graphs.ts` and reroutes `FINISH`. But the same graph line (`{ from: "IN_PROGRESS", to: "READY_FOR_QC", requires: ["QC"], intent: "FINISH", ... }`) has no condition beyond the capability being on — **whenever QC is enabled, every job routes through it.** The canonical spec's placement of "QC required" under Workflow Policy was pointing at a real gap; it had just never been separated from the capability that makes it possible.

| Option | Means | Changes |
|---|---|---|
| **`MANDATORY_ALWAYS` — Default** | Every finished job passes QC | Today's only behaviour |
| `ABOVE_VALUE_THRESHOLD` | QC only above a job value | Needs a threshold value |
| `RISK_FLAGGED_ONLY` | QC only for jobs flagged risky | Ties to specialization severity |

*Default `MANDATORY_ALWAYS` because* it requires no new data and matches every workshop that has enabled QC so far; loosening it is real future work, not an assumption to make now.
*Touches:* `WorkflowRouter`, `GateEvaluatorService` · threshold field for one option · no perms · Work Card, Team Leader Home · **no lifecycle change — the QC states already exist; this only decides who enters them**.
*Later:* governed. *Depends:* `QC` capability. *Phases:* 3, Governance Controls — **completes the QC resolution**.

---

### Domain D (cont.) — People, roles & supervision

---

#### P-34 — May one person hold several roles?
**POLICY** · GOVERNED · **Posture: CORE** · Relevant: always — **decisive for single-operator workshops**
*Why:* Scenario A 1.1. `StaffUser.role` is a **single enum**, so today the answer is structurally "no" — and a one-person workshop is owner, technician, and storekeeper simultaneously. This is a live gap, not a preference.

| Option | Means | Changes |
|---|---|---|
| **`MULTIPLE_ROLES` — Default** | A person holds a set of roles; permissions union | `role` becomes a set — **schema change** |
| `SINGLE_ROLE` | One role each | Today's shape |
| `PRIMARY_PLUS_SECONDARY` | One primary, additional grants | Middle path, less disruptive |

*Default `MULTIPLE_ROLES` because* the smallest workshops are a large share of the market and the alternative asks a sole operator to log out and back in as themselves.
⚠️ **Posture caution:** this is the one entry in Domain D that **fails prebuild clause (c)** — `MULTIPLE_ROLES` is a real schema change to `StaffUser`, not a toggle. It cannot be a per-workshop activation; it must be decided once for the platform. `PRIMARY_PLUS_SECONDARY` may be a cheaper route to the same outcome and deserves examination first.
*Touches:* `PermissionResolver` (role-template layer), `ScopeResolver` · **`StaffUser.role`** · role→permission mapping · Team Setup + Org & Access · none.
*Later:* migration required either way. *Depends:* P-07 (separation of duties is meaningless if one person is everyone). *Phases:* 5, 10, 17.

---

#### P-35 — May a workshop rename roles?
**VOCABULARY** · GOVERNED · **Posture: VOCABULARY** · Relevant: always
*Why:* The canonical spec's Builder Control → Role Experience already allows a role *label* override ("Technician" → "Mechanic"), explicitly cosmetic. Recorded to keep it cosmetic.
| Option | Means |
|---|---|
| **`LABEL_OVERRIDE_ONLY` — Default** | Display name only; keys and routes unchanged |
| `NONE` | Platform names |
| `WORKSHOP_DEFINED_ROLES` | Genuinely new roles |

*Default `LABEL_OVERRIDE_ONLY` because* it gives the entire benefit at near-zero risk. `WORKSHOP_DEFINED_ROLES` would make the permission matrix, capability `owns.roles`, and every role-scoped query tenant-variable — the "configuration becomes a second programming language" trap `VISION.md` §3.2 names.
*Touches:* presentation only · label field · none · every role-labelled surface · none.
*Later:* freely. *Phases:* 17, Builder Control.

---

#### P-36 — Is there a management tier between branch manager and owner?
**CAPABILITY** · GOVERNED · **Posture: PREBUILT-ACTIVATABLE** · Relevant: `MULTI_BRANCH` active **and** branch count > ~3
*Why:* Scenario D 20.1 and Phase 17.E. A 6-branch chain's owner has no one between themselves and six branch managers.
| Option | Means |
|---|---|
| **`OFF` — Default** | Owner supervises branches directly |
| `REGIONAL_MANAGER` | A role scoped to a branch subset |

*Default `OFF` because* it is meaningless below ~3 branches and most tenants are below it.
**Posture note:** passes all three clauses — `branchScope` is already an array on `StaffUser`, so a branch-subset role needs **no schema change**. A clean prebuilt-activatable candidate.
*Touches:* `ScopeResolver`, role templates · none (uses `branchScope`) · new role in the matrix · Team Setup, Owner Home, reports · none.
*Later:* safely activatable. *Depends:* `MULTI_BRANCH`, P-34. *Phases:* 17.E.

---

#### P-37 — Is an exit reason recorded when staff leave, and does it affect rehire?
**POLICY** · FREELY · **Posture: POLICY-CONTROLLED** · Relevant: always
*Why:* Named in Phase 10, re-planned out, pushed to 19. Today `isActive: false` erases *why*.
| Option | Means |
|---|---|
| **`RECORDED_NOT_ENFORCED` — Default** | Reason + rehire flag stored, advisory |
| `NONE` | Deactivate only |
| `ENFORCED` | Blocks re-adding the person |

*Default `RECORDED_NOT_ENFORCED` because* the fact is worth keeping and hard-blocking rehire on a stored flag is a serious call to automate — a person may be re-hired legitimately after a dispute is resolved.
*Touches:* staff admin · exit fields on `StaffUser` · no perms · Org & Access (unbuilt) · none.
*Later:* freely. *Depends:* P-58. *Phases:* 10, 19.

---

#### P-38 — Can a supervision note ever be seen by its subject?
**INVARIANT** (answer: no) · **Posture: CORE**
*Why:* `SupervisionNote`'s schema comment already calls it *"the one place in the product where a note is deliberately hidden from the person it's about,"* enforced by **absence from the technician API shape entirely**, never client-side hiding. Recorded so nobody later adds a "transparency" option that turns a candid supervision record into a performance-review document nobody will write honestly.
*The only answer:* no.
*Phases:* closed.

---

#### P-39 — Does an expired credential block assignment?
**POLICY** · GOVERNED · **Posture: POLICY-CONTROLLED** · Relevant: workshop declares credentials (Phase 15 — schema shipped)
*Why:* Phase 15 proved credentials end-to-end. Nothing reads them at assignment time. For gas, welding, or high-voltage EV work this is a safety and insurance matter.
| Option | Means |
|---|---|
| **`WARN` — Default** | Assignment allowed, flagged |
| `IGNORE` | Not checked |
| `BLOCK` | Refuses assignment |
| `BLOCK_FOR_FLAGGED_ONLY` | Blocks only for credentials marked safety-critical |

*Default `WARN` because* blocking on stale credential *data* (rather than a genuinely expired credential) would strand real work on an admin oversight — but `BLOCK_FOR_FLAGGED_ONLY` is the right destination once workshops mark which credentials are safety-critical.
*Touches:* assignment path · `StaffCredential` exists · no perms · Work Card + Team Setup · none.
*Later:* governed. *Depends:* P-45 (credential vocabulary). *Phases:* 15, 16.

---

### Domain E (cont.) — Work-order structure

---

#### P-40 — Can work orders be linked to each other?
**STRUCTURAL** · n/a · **Posture: PREBUILT-ACTIVATABLE** · Relevant: always
*Why:* Three separate scenarios (B 8.2, C 13.4, C 11.4) — comeback/rework, follow-up, parent-child. Without it, a comeback is an unrelated new job and rework is invisible to quality reporting.
| Option | Means |
|---|---|
| `NONE` | Unrelated jobs |
| **`TYPED_LINKS` — Default** | A typed relation: `COMEBACK_OF`, `FOLLOW_UP_TO`, `CHILD_OF` |
| `FREE_LINKS` | Untyped association |
| `PARENT_CHILD_ONLY` | Hierarchy only |

*Default `TYPED_LINKS` because* the *type* is the whole value — "comeback" is what makes rework measurable, and an untyped link cannot answer the question quality reporting exists to ask.
**Posture note:** passes all three clauses — a nullable self-relation adds no fork and no migration; inert when unused. One of the strongest prebuild candidates in the inventory.
*Touches:* `WorkOrderLifecycleService`, reporting · self-relation on `WorkOrder` · no perms · Workspace, board, Team Leader reports · no lifecycle change.
*Later:* safely. *Depends:* none formally (P-16's `LINKED_FOLLOW_UP` option references this capability's existence, not the reverse — `PHASE_21.md` §9.1; related to P-12 in subject only). *Phases:* 16.C.

---

#### P-41 — Can one job span multiple sessions at multiple locations?
**STRUCTURAL** · n/a · **Posture: DEFERRED-UNTIL-DEMANDED** ⚠️ *(fails prebuild clause (c))* · Relevant: field-service workshops
*Why:* Scenario C 11.1. A heavy-equipment repair happens over three visits to a quarry.
| Option | Means |
|---|---|
| **`SINGLE_SESSION` — Default** | One job, one continuous engagement |
| `MULTI_SESSION` | Sessions as first-class children |
| `LINKED_JOBS` | Approximate via P-40 |

*Default `SINGLE_SESSION` because* it is today's model, and `LINKED_JOBS` covers a meaningful share of the need at a fraction of the cost.
⚠️ **Posture: fails clause (c).** `MULTI_SESSION` changes the shape of `WorkOrder` — time tracking, gates, and invoicing all become per-session. That is a schema fork, not a toggle, and prebuilding it would import exactly the combinatorial cost §3.7 warns about. **Recommend `LINKED_JOBS` via P-40 first**, and revisit only with a real field-service customer.
*Touches:* lifecycle, finance, gates · substantial · none · most operational pages · significant. *Depends:* P-40, P-44. *Phases:* 16 (deferred).

---

#### P-42 — Is a B2B account a distinct entity from a customer?
**STRUCTURAL** · n/a · **Posture: PREBUILT-ACTIVATABLE** (narrow form only) · Relevant: fleet/insurer/dealer work present
*Why:* Scenario B 10.1, and **P-01's `UNLESS_ACCOUNT_TERMS` option depends on it**. Today a fleet of 40 vans is 40 customers with no shared account, terms, or contact.
| Option | Means |
|---|---|
| **`ACCOUNT_ENTITY` — Default** | An `Account` owning many customers/assets, holding terms |
| `NONE` | Customers only |
| `CUSTOMER_FLAG` | A flag on `Customer` |

*Default `ACCOUNT_ENTITY` because* `CUSTOMER_FLAG` cannot express the thing that matters — one payer, many vehicles, one set of terms — and that is precisely what Delta's net-30 case needs.
**Posture note:** activatable **only if** introduced as a nullable optional parent. A new table plus a nullable FK is inert when unused and needs no migration. If it instead becomes *required*, it fails clause (c). **The narrow form is admissible; the broad form is not.**
*Touches:* finance, portal, intake · new table + nullable FK · account-scoped visibility · Intake, Approvals, invoices · none.
*Later:* safely, in the narrow form. *Depends:* P-43 (an account is the thing that holds payer terms — payer is the more primitive concept; made one-directional per `PHASE_21.md` §9.1, was previously recorded as mutual with P-43). *Phases:* 16.D.

---

#### P-43 — Is the payer a first-class attribute, separate from the customer?
**STRUCTURAL** · n/a · **Posture: PREBUILT-ACTIVATABLE** · Relevant: warranty / insurance / fleet / rework present
*Why:* Scenarios B 7.1 and C 15.1, deferred as 16.D. Warranty work, insurer-paid work, and internal rework all have a payer who is not the customer. Today the invoice implies they are the same.
| Option | Means |
|---|---|
| **`PAYER_ON_WORK_ORDER` — Default** | A payer reference, defaulting to the customer | 
| `IMPLICIT` | Customer always pays |
| `PER_LINE_PAYER` | Split billing per line |

*Default `PAYER_ON_WORK_ORDER` because* it captures the real cases at one nullable field, where `PER_LINE_PAYER` (a split insurance claim) is materially more complex and appeared in no scenario.
**Posture note:** passes all clauses — nullable reference defaulting to existing behaviour.
*Touches:* `FinanceService`, invoicing, reports · nullable payer on `WorkOrder` · payer-scoped visibility · Workspace, invoices, Money · none.
*Later:* safely. *Depends:* none (P-42 depends on this, not the reverse — `PHASE_21.md` §9.1). *Phases:* 16.D.

---

#### P-44 — Is a location/site a first-class entity?
**STRUCTURAL** · n/a · **Posture: DEFERRED-UNTIL-DEMANDED** · Relevant: field-service workshops
*Why:* Scenario C 12.1, deferred as 16.F — a site with persistent facts (access hours, gate code, travel time) that outlive any one job.
| Option | Means |
|---|---|
| **`ADDRESS_FIELD` — Default** | Free-text on the job |
| `SITE_ENTITY` | Reusable site with persistent facts |

*Default `ADDRESS_FIELD` because* only one of four scenario workshops needed persistence.
**Posture:** deferred — one customer is a feature request (§3.7 disqualifier 4). Revisit with a second.
*Touches:* intake, scheduling · new table · none · Intake, Work Card · none. *Depends:* P-41, S-01. *Phases:* 16.F.

---

#### P-45 — Are blocker reasons workshop-defined?
**VOCABULARY** · GOVERNED · **Posture: VOCABULARY** · Relevant: always
*Why:* Phase 15 settled the schema and stopped — `TaskBlocker.reason` still reads the fixed enum, because retrofitting touches a live tested path. Scenario A 3.2 wanted workshop-defined reasons; the routing table (`routeForBlocker`) maps reason → audience, so a custom reason must also declare who it notifies.
| Option | Means |
|---|---|
| **`PLATFORM_PLUS_CUSTOM` — Default** | Platform reasons plus workshop additions, each declaring its audience |
| `PLATFORM_ONLY` | Today |
| `FULLY_CUSTOM` | Workshop replaces the set |

*Default `PLATFORM_PLUS_CUSTOM` because* the platform reasons carry tested routing behaviour; `FULLY_CUSTOM` would let a workshop delete `SAFETY_ISSUE`, which escalates urgently by design.
*Touches:* `TechnicianWorkService`, `routeForBlocker` · `SpecializationDefinition` (exists) · no perms · Work Card, Attention Center · none.
*Later:* governed; historical blockers keep their recorded reason. *Depends:* none. *Phases:* 15 — **completes Phase 15's fifth primitive**.

---

### Domain F (cont.) — Ownership, warranty & history

---

#### P-46 — Does a new owner see the vehicle's prior technical history?
**POLICY** · GOVERNED · **Posture: CORE** · Relevant: always
*Why:* `VISION.md` §4.4 names this as one of the highest-consequence surfaces: *"a new owner must see technical history but never the previous owner's financials."* The rule is stated in vision and implemented nowhere as an explicit decision.
| Option | Means |
|---|---|
| **`TECHNICAL_ONLY` — Default** | Work done and parts fitted; never prices, payers or previous-owner identity |
| `NONE` | History resets at sale |
| `FULL` | Everything | 

*Default `TECHNICAL_ONLY` because* the new owner has a genuine safety interest in what was done to the vehicle and no interest whatsoever in what the previous owner paid. `FULL` is a privacy incident by construction.
*Touches:* `CustomerPortalService`, `CustomerSafeProjectionService` · `AssetOwnershipHistory` exists · **response-shape rule: financials must be absent, not hidden** · Safe Technical History · none.
*Later:* governed — but loosening is a privacy decision, not a preference. *Depends:* P-11. *Phases:* 11.

---

#### P-47 — What happens when a customer asks to be deleted?
**POLICY** · GOVERNED · **Posture: CORE** · Relevant: always
*Why:* No mechanism exists. GDPR-style erasure conflicts directly with immutable financial records and the audit trail — and both obligations are real.
| Option | Means |
|---|---|
| **`ANONYMISE_RETAIN_FINANCIAL` — Default** | Identity scrubbed; invoices, payments and audit rows retained with an anonymised reference |
| `HARD_DELETE` | Everything removed |
| `NOT_SUPPORTED` | No path |

*Default `ANONYMISE_RETAIN_FINANCIAL` because* it is the only option satisfying both duties — `HARD_DELETE` would break invoice immutability and orphan audit rows, and `NOT_SUPPORTED` is not lawful in several target markets.
*Touches:* customer admin, portal, audit · anonymisation, not deletion · new perm · Org & Access · none.
*Later:* governed. *Depends:* P-48, P-11. *Phases:* 18.D, 20.D.

---

#### P-48 — How long is data retained before an archived tenant is purged? *(**E17**)*
**POLICY** · GOVERNED · **Posture: POLICY-CONTROLLED** · Relevant: always
*Why:* Phase 18.D shipped the archive lifecycle with two clocks deliberately never conflated. E17 asks what happens when a schema migration meets a dormant tenant's data.
| Option | Means |
|---|---|
| **`FROM_COUNTRY` — Default** | Statutory retention derived from country (commonly 5–10 years for financial records) |
| `INDEFINITE` | Never purged |
| `FIXED_YEARS` | One platform-wide period |

*Default `FROM_COUNTRY` because* retention is a legal question with different answers per market, and a single global period is wrong nearly everywhere.
**E17's own answer, separately:** migrations must run against archived tenants like any other — an archived tenant that misses a migration becomes unrestorable, which defeats archiving. Recorded here as the reconciliation policy E17 asks for.
*Touches:* `TenantLifecycleService` · retention field · no perms · Workshops drawer, Governance Controls · none.
*Later:* governed. *Depends:* P-47. *Phases:* 18.D — **closes E17**.

---

### Domain G (cont.) — Scheduling

---

#### S-01 — Does MOP have scheduling at all? *(RESOLVED into three sub-questions — see `PHASE_21.md` §8.A)*
**Superseded.** The original framing treated this as one capability with one answer. `PHASE_21.md` §8.A's resolution pass found it was three questions at three different levels of readiness, resolved by re-reading the existing scenario evidence (Nafath 4.1/4.2, SpeedLube 17, Delta 11.1–11.4, Workshop B) rather than commissioning a new pass:

| Sub-question | Verdict | Status |
|---|---|---|
| **S-01a** — promise time / queue ordering | Already shipped (`WorkOrder.promisedAt`, 16.A/16.E) | **DECIDED — closed** |
| **S-01b** — physical resource occupancy (bays/lifts/crews) | Passes the prebuild admission test cleanly; **this is P-49's decision — see below, retired as a duplicate and merged here** | **EVIDENCE-BACKED → PREBUILT-ACTIVATABLE**, sequenced after Phase 17's resource authoring |
| **S-01c** — pre-intake appointment booking + field-service travel scheduling | Two workshops, two incompatible shapes of need; no single design justified by the evidence | **DEFERRED-UNTIL-DEMANDED**, unblock condition: a real tenant of either shape being onboarded |

*Touches, S-01b:* scheduling, intake · new `Resource` + occupancy table · no perms · Branch board · occupancy gates intake, never a work-order transition — zero reachability effect.
*Depends:* Phase 17's setup-time resource authoring (unchanged from `PHASE_16.md`'s own 16.B deferral). *Blocks:* P-13, P-50 (already unblocked — S-01a decided), P-51. *Phases:* 16.B.

---

#### P-49 — *(RETIRED — duplicate of S-01b above, per `PHASE_21.md` §9.2)*
Found during the second-pass audit to be the same decision as S-01b, recorded twice under two IDs. No separate entry; all detail lives at S-01 above.

---

#### P-50 — Is the promised time visible to the customer?
**POLICY** · FREELY · **Posture: POLICY-CONTROLLED** · Relevant: 16.A shipped, so always
*Why:* 16.A stores a promised time; nothing decides whether the customer sees it. Showing it creates an expectation the workshop is then measured against.
| Option | Means |
|---|---|
| **`VISIBLE` — Default** | Shown in the portal |
| `HIDDEN` | Internal only |
| `VISIBLE_AS_RANGE` | Shown as a window |

*Default `VISIBLE` because* `VISION.md` §2's trust product exists so the customer knows *what is happening and whether it is their turn* — and "when will it be ready" is the question they actually have.
*Touches:* `CustomerPortalService` · field exists · no perms · Current Service · none.
*Later:* freely. *Depends:* S-01, P-51. *Phases:* 11, 16.A.

---

#### P-51 — May the workshop accept more work than its capacity?
**POLICY** · GOVERNED · **Posture: POLICY-CONTROLLED** · Relevant: S-01 = `QUEUE_AND_CAPACITY` or `FULL_SCHEDULING`
*Why:* Every real workshop overbooks somewhat; a system that refuses is abandoned.
| Option | Means |
|---|---|
| **`ALLOWED_WARNED` — Default** | Accepted, capacity overrun flagged |
| `BLOCKED` | Refuses beyond capacity |
| `ALLOWED_SILENT` | No signal |

*Default `ALLOWED_WARNED` because* blocking intake is commercially unacceptable and silence wastes the capacity model.
*Touches:* intake, attention ranking · none beyond S-01 · no perms · Intake, board · none.
*Depends:* **S-01**, P-50. *Phases:* 16.B.

---

### Domain H (cont.) — Governance & audit

---

#### P-52 — Are point-in-time report snapshots taken? *(19.G)*
**STRUCTURAL** · n/a · **Posture: PREBUILT-ACTIVATABLE** · Relevant: always
*Why:* Phase 12 shipped live-only reporting as a named limitation. A dispute six months later cannot be answered with a report that recomputes from today's data.
| Option | Means |
|---|---|
| `LIVE_ONLY` | Today |
| **`PERIOD_CLOSE_SNAPSHOTS` — Default** | Immutable snapshot at period boundaries |
| `FULL_TEMPORAL` | Any historical moment reconstructable |

*Default `PERIOD_CLOSE_SNAPSHOTS` because* it answers the questions that are actually asked (month-end, dispute-date) at bounded cost, where `FULL_TEMPORAL` is Phase 19's self-declared hardest item.
**Important:** verify first that `OperationEvent` + time-ranged `TenantCapability` are *already* sufficient to reconstruct. If they are, `FULL_TEMPORAL` stays available for free and this decision loses its urgency.
*Touches:* reporting · snapshot store · no perms · all report pages · none.
*Later:* safely — snapshots only accrete. *Depends:* P-53. *Phases:* 12, 19.G.

---

#### P-53 — Can historical permission state be reconstructed? *(19.E)*
**STRUCTURAL** · n/a · **Posture: DEFERRED-UNTIL-DEMANDED** · Relevant: always
*Why:* Phase 19 named this its hardest item. *"Was this person allowed to do this, at the moment they did it?"* — a fraud investigation's central question.
| Option | Means |
|---|---|
| **`AUDIT_TRAIL_ONLY` — Default** | The audit row records what happened; permission state is not reconstructed |
| `SNAPSHOT_ON_CHANGE` | Every permission change snapshotted |
| `FULL_RECONSTRUCTION` | Derived from the change log |

*Default `AUDIT_TRAIL_ONLY` because* it is today's state and the audit row already records actor, action and reason. `SNAPSHOT_ON_CHANGE` is the cheap upgrade path if this becomes real.
**Posture:** deferred — genuinely expensive, and one fraud scenario is not two customers.
*Touches:* permission resolver, audit · snapshot store · reads everything · Audit page · none. *Depends:* P-52. *Phases:* 19.E.

---

#### P-54 — May platform support impersonate a tenant user? *(19.F)*
**CAPABILITY** · GOVERNED · **Posture: PREBUILT-ACTIVATABLE — but gated on a threat model** · Relevant: always
*Why:* Phase 19.F, deferred pending its own written threat-model review. Workshop Live View (unbuilt) is the read-only cousin and is deliberately *"structurally incapable of firing a mutation."*
| Option | Means |
|---|---|
| **`READ_ONLY_LIVE_VIEW` — Default** | Look, never act — the spec's own design |
| `NONE` | No visibility |
| `FULL_IMPERSONATION` | Act as the user |
| `IMPERSONATION_WITH_CONSENT` | Requires tenant approval, time-boxed |

*Default `READ_ONLY_LIVE_VIEW` because* it solves the actual support problem ("what does their technician see?") without ever creating an audit row that says a tenant user did something they did not do. `FULL_IMPERSONATION` corrupts the audit trail's core promise.
*Touches:* auth, session, audit · session-type flag · a distinct session type, not a permission · Live View · none.
*Later:* governed. *Depends:* P-53. *Phases:* 19.F, Live View page.

---

#### P-55 — How long are audit records retained?
**POLICY** · GOVERNED · **Posture: POLICY-CONTROLLED** · Relevant: always
*Why:* Nothing purges `AuditLog`. At scale it becomes the largest table; legally it is often the one that must be kept longest.
| Option | Means |
|---|---|
| **`INDEFINITE` — Default** | Never purged |
| `FROM_COUNTRY` | Statutory period |
| `TIERED` | Recent hot, older cold storage |

*Default `INDEFINITE` because* the audit trail's value is precisely that it is complete, and `TIERED` is a performance answer to a question nobody has asked yet at MOP's current scale.
*Touches:* audit · partitioning eventually · no perms · Audit page · none.
*Later:* governed. *Depends:* P-48. *Phases:* 14, 20.

---

#### P-56 — What wins when a capability rollback races an in-flight transition? *(**E13**)*
**INVARIANT** (proposed) · **Posture: CORE** · Relevant: always
*Why:* Edge case E13, flagged as needing a design spike. A capability change applying while a work order is mid-transition could route a job through a graph that no longer exists.
*Proposed answer:* **the in-flight transition wins; the capability change waits.** A transition already validated against a profile completes under that profile; the change applies after. The alternative — the change winning — means a work order can be re-routed by a graph it was never validated against, which is exactly the stranding the reachability proof exists to prevent.
*Implementation note (not implementation):* this is the same shape as H1's fix — the decision and the write must share a transaction, and the capability apply must take the same lock.
*Touches:* `CapabilityChangeService`, `WorkOrderLifecycleService` · none · none · Capability UI impact preview · **the reachability guarantee itself**.
*Depends:* none. *Phases:* 3 — **closes E13's spike**.

---

#### P-57 — Who may see cost as opposed to price?
**POLICY** · GOVERNED · **Posture: POLICY-CONTROLLED** · Relevant: `INVENTORY` active
*Why:* Already partly decided in code: `inventory.cost.view` exists and defaults false (Catalog Control). Recorded to make the rule explicit rather than an artefact of one page's construction.
| Option | Means |
|---|---|
| **`PERMISSION_GATED_DEFAULT_OFF` — Default** | Cost absent from responses without the key |
| `ROLE_BASED` | Fixed by role |
| `OPEN` | Anyone with catalogue access |

*Default `PERMISSION_GATED_DEFAULT_OFF` because* margin is the most commercially sensitive number in the product, and `VISION.md`'s rule is that restricted data must be **absent from the response**, never hidden client-side.
*Touches:* inventory + finance responses · none · `inventory.cost.view` exists · Catalog, Stock, reports · none.
*Later:* governed. *Depends:* none. *Phases:* 7.

---

### Domain I (cont.) — Identity & tenancy

---

#### P-58 — Can a staff member belong to more than one tenant? *(18.B)*
**STRUCTURAL** · n/a · **Posture: DEFERRED-UNTIL-DEMANDED** ⚠️ *(fails clause (c))* · Relevant: always
*Why:* Scenario set 2's dominant finding — `StaffUser.tenantId` is a permanent 1:1 fact, and real businesses second staff, share owners, and are acquired. 18.A shipped `TenantStakeholder` as the narrow answer.
| Option | Means |
|---|---|
| **`SINGLE_TENANT_PLUS_STAKEHOLDER` — Default** | One home tenant; narrow external grants via 18.A |
| `MULTI_TENANT_MEMBERSHIP` | Account↔tenant many-to-many, time-bounded |
| `IDENTITY_SPLIT` | Full identity/organisation separation |

*Default `SINGLE_TENANT_PLUS_STAKEHOLDER` because* it covers every observed case without touching the single most load-bearing code path in the product.
⚠️ **Posture: fails clause (c) decisively.** Every one of the 11 permission layers assumes one tenant per session; changing that is a migration of every staff account plus a rewrite of the resolver's entry point. **Not activatable — a platform-level decision made once, or not at all.**
**Consequence for Phase 10:** `PHASE_MAP.md` already warns that 18.A/18.B should land before People/Performance tenure work. Under this default, **Phase 10 must not build tenure tracking that assumes permanence** without recording the assumption.
*Touches:* `PermissionContextService`, `SessionGuard`, every scoped query · `StaffUser.tenantId` · the whole resolver · everything · none. *Depends:* P-59. *Phases:* 18.B, 10, 17.E.

---

#### P-59 — Does a customer have one identity across workshops?
**STRUCTURAL** · n/a · **Posture: INTEGRATION-SEAM / DEFERRED** · Relevant: always
*Why:* Today a customer at two MOP workshops is two unrelated records. A shared identity would let one login see both — attractive, and a serious cross-tenant leakage surface against `VISION.md` §3.1.
| Option | Means |
|---|---|
| **`PER_TENANT` — Default** | Separate identities |
| `SHARED_IDENTITY` | One account, many workshop relationships |
| `LINKED_OPT_IN` | Customer explicitly links their accounts |

*Default `PER_TENANT` because* isolation is the property `VISION.md` calls structural rather than a feature, and a shared customer identity is the single most direct route to violating it.
*Touches:* auth, portal · account model · cross-tenant reads · portal, Register · none. *Depends:* P-58. *Phases:* 11, 18.

---

#### P-60 — Are tenant merge and split first-class operations? *(18.F)*
**STRUCTURAL** · **RESOLVED** — recorded, not re-opened · **Posture: OUT-OF-PLATFORM**
*Why:* 18.F's deliverable was a written decision and it was made: **no first-class merge/split.** Rewriting `AuditLog.tenantId` on historical rows would conflict with the audit-boundary discipline `tools/lint-audit-boundary.mjs` exists to enforce. A documented export/reimport-and-archive procedure instead.
*Recorded here* so the inventory is complete and so nobody re-opens it without reading 18.F's reasoning. *Phases:* 18.F — closed.

---

#### P-61 — Is a shop-floor device one person's, or shared?
**POLICY** · GOVERNED · **Posture: POLICY-CONTROLLED** · Relevant: always *(20.F)*
*Why:* Phase 20.F. A tablet bolted to a wall and used by six technicians makes "who did this" unanswerable — and every audit row depends on that answer.
| Option | Means |
|---|---|
| **`PER_PERSON_LOGIN` — Default** | Each person authenticates |
| `SHARED_WITH_PIN` | Shared session; a PIN attributes each action |
| `SHARED_UNATTRIBUTED` | Device-level identity |

*Default `PER_PERSON_LOGIN` because* attribution is the foundation the audit trail rests on. `SHARED_UNATTRIBUTED` should probably not be offered — it makes every audit row a lie by omission. `SHARED_WITH_PIN` is the honest compromise for a real wall-mounted tablet.
*Touches:* auth, session · session/device model · attribution everywhere · Technician pages · none.
*Later:* governed. *Depends:* none. *Phases:* 20.F.

---

#### P-62 — Are password hashes versioned and lazily rehashed? *(**E18**)*
**INVARIANT** (answer: yes) · **Posture: CORE**
*Why:* Edge case E18. `hashPassword` uses scrypt with fixed parameters; there is no version marker and no upgrade path, so raising cost parameters later would leave every existing hash on the old strength forever.
*The only answer:* **version the hash and rehash on successful login.** There is no defensible alternative — "never change parameters" is not a security posture, and forcing a global password reset punishes users for our omission.
*Touches:* `password.util.ts`, login · version column on `Account` · none · none · none.
*Phases:* 1 — **closes E18** (small, well-scoped, genuinely ready to implement).

---

### Domain J (cont.) — Platform & operations

---

#### P-63 — Realtime: build it, or withdraw the promise?
**STRUCTURAL** · n/a · **Posture: PREBUILT-ACTIVATABLE (transport) / CORE (isolation model)** · Relevant: always
*Why:* The original brief promises progress that *"updates in real time on the technician, team leader and customer pages."* `VISION.md` §4.5: no realtime mechanism exists in the codebase at all. Still true.
| Option | Means |
|---|---|
| `POLLING` | Clients poll; simplest, worst under 20.F's bandwidth concerns |
| **`SSE` — Default** | Server-sent events; one-way, which is all this needs |
| `WEBSOCKET` | Bidirectional; connection-state infrastructure MOP lacks |
| `WITHDRAW` | State plainly that MOP is not realtime |

*Default `SSE` because* every promised use is **one-way server→client**, which is exactly SSE's shape, and it avoids the connection-state management WebSockets impose.
⚠️ **The transport is reversible; the isolation model is not.** A realtime channel is one more path that can leak across tenants (`VISION.md` §3.1), and channel authorisation must be designed once, correctly, whichever transport is chosen.
*Touches:* new transport, `OperationEventsService` fan-out · none · **channel authorisation** · Technician Now, Team Leader Home, portal, Live View · none.
*Later:* transport yes; isolation model no. *Depends:* P-64. *Phases:* unassigned — **not currently in any phase, which is itself the finding**.

---

#### P-64 — Are offline-capable clients supported? *(20.E)*
**INVARIANT** · **RESOLVED** — recorded, not re-opened · **Posture: OUT-OF-PLATFORM**
*Why:* Phase 20.E's deliverable was a written decision and it was made: **no.** Connectivity is a stated requirement. Scenario set 2's finding is why — every guarantee this project is proudest of (sole-writer lifecycle, gate-checked transitions, money idempotency, the reachability proof) was proven against actions arriving in order against current state. Offline queueing does not extend those guarantees; it requires **re-proving all of them** against out-of-order, stale-state replay.
*Recorded so the cost of reversing it is visible:* reversing this decision invalidates every concurrency proof in the codebase, including the nine edge-case fixes made this session. *Phases:* 20.E — closed.

---

#### P-65 — Which clock is authoritative? *(**E12**)*
**INVARIANT** (proposed) · **Posture: CORE** · Relevant: always
*Why:* Edge case E12. API replicas can disagree by seconds; token expiry, session windows, lockout timers and SLA arithmetic all read `Date.now()` on whichever replica served the request.
*Proposed answer:* **the database clock is authoritative for anything security- or SLA-relevant.** Postgres is the single serialization point every replica already shares; replica wall-clock is acceptable only for display.
*Consequence:* expiry comparisons move into SQL or read `NOW()`, rather than comparing an application `Date` against a stored timestamp.
*Touches:* auth/session/token utils, SLA math · none · token validity · none visible · none.
*Depends:* none. *Phases:* 13, 20 — **closes E12**.

---

#### P-66 — What is the database failover posture? *(**E20**)*
**STRUCTURAL** · n/a · **Posture: OUT-OF-PLATFORM (ops), CORE (client behaviour)** · Relevant: always
*Why:* Edge case E20. A failover mid-`$transaction` has three possible outcomes and nothing documents which one MOP experiences, or what a technician's screen should show.
| Option | Means |
|---|---|
| **`DOCUMENTED_RUNBOOK_PLUS_RETRY` — Default** | Rehearsed runbook + explicit client retry semantics + a UI that never claims false success |
| `IMPLICIT` | Today — undocumented |
| `FULL_HA` | Multi-region automatic failover |

*Default `DOCUMENTED_RUNBOOK_PLUS_RETRY` because* the dangerous case is not downtime, it is a UI reporting *"job saved"* for a transaction that rolled back — which is `VISION.md` §6's "fake completion" failure mode arriving via infrastructure rather than code.
*Touches:* connection config, error handling · none · none · error states everywhere · none.
*Depends:* none. *Phases:* 20 — **closes E20**.

---

#### P-67 — Are workshop-defined fields queryable and reportable?
**STRUCTURAL** · n/a · **Posture: PREBUILT-ACTIVATABLE (storage) / DEFERRED (query layer)** · Relevant: specializations declared
*Why:* The decision that most constrains the unbuilt reporting engine. A workshop defines "hydraulic pressure at test"; can the owner then filter or report on it? Data Analyst is **0 of 7 pages**, so the window to decide cheaply is open — and closes the moment the first analytics page is built.
| Option | Means |
|---|---|
| `DISPLAY_ONLY` | Stored, never queried |
| `TYPED_COLUMNS` | Promoted to real columns |
| `JSONB_INDEXED` | Indexed JSON + a query DSL |
| **`DISPLAY_NOW_PROMOTABLE` — Default** | Stored now; per-field promotion to indexed/queryable on demand |

*Default `DISPLAY_NOW_PROMOTABLE` because* it defers the expensive part without foreclosing it — **but only if the promotion path is designed now**, which is the actual deliverable of this decision.
*Touches:* reporting engine, specialization storage · indexing strategy · field-level visibility · all 7 Data Analyst pages, Owner Reports · none.
*Later:* per-field promotion is safe; retrofitting the query layer after reports exist is not. *Depends:* P-45. *Phases:* 12, 15, Data Analyst.

---

#### P-68 — Is there a data import path?
**CAPABILITY** · GOVERNED · **Posture: PREBUILT-ACTIVATABLE** · Relevant: always
*Why:* Scenario D 16.1 — **no import path exists for any entity, ever.** Every workshop onboarding is manual retyping, and Phase 20.C's 50-branch migration weekend is impossible without it.
| Option | Means |
|---|---|
| `NONE` | Today |
| **`CSV_PER_ENTITY_VALIDATED` — Default** | Validated CSV import per entity, dry-run first, all-or-nothing per batch |
| `FULL_MIGRATION_TOOLKIT` | Mapping UI, transforms, rollback |

*Default `CSV_PER_ENTITY_VALIDATED` because* it unblocks real onboarding at bounded cost, and the dry-run requirement is non-negotiable — an import that half-succeeds against a live tenant is the "silent partial creation" failure `VISION.md` §6 lists.
*Touches:* every entity service · none new · new perms (import per entity) · a new admin surface · none.
*Later:* safely. *Depends:* P-69. *Phases:* 17.D, 20.C.

---

#### P-69 — Is there a bulk correction tool?
**CAPABILITY** · GOVERNED · **Posture: DEFERRED-UNTIL-DEMANDED** · Relevant: always
*Why:* Scenario D 16.2. A bad import or a systematic data-entry error currently has no remedy but row-by-row editing.
| Option | Means |
|---|---|
| **`NONE` — Default** | Row-by-row |
| `SCOPED_BULK_EDIT` | Bulk edit with preview + audit + undo |

*Default `NONE` because* a bulk-edit tool is a bulk-damage tool, and it should not exist before P-68 (which creates the mess it would clean up) and before audit/undo semantics are settled.
*Touches:* many · none · powerful new perms · admin surface · none. *Depends:* **P-68**. *Phases:* 17.D.

---

#### P-70 — Is there a dedicated `statusChangedAt`, or does `updatedAt` proxy for it?
**STRUCTURAL** · n/a · **Posture: CORE** · Relevant: always
*Why:* `PROJECT_STATE.md` known issue #3: `byStatus` uses `updatedAt` as a proxy for "entered this state" — honest but imprecise, and any edit to an unrelated field silently resets the clock. Every ageing figure in the Attention Center inherits the imprecision.
| Option | Means |
|---|---|
| `UPDATED_AT_PROXY` | Today |
| **`DEDICATED_COLUMN` — Default** | `statusChangedAt`, written only by the lifecycle service |
| `DERIVE_FROM_EVENTS` | Compute from `OperationEvent` |

*Default `DEDICATED_COLUMN` because* it is exact, cheap, and has an obvious single writer — `WorkOrderLifecycleService` is already the sole status writer, so there is exactly one place to set it. `DERIVE_FROM_EVENTS` is correct but pays a query cost on every attention-queue build.
*Touches:* `WorkOrderLifecycleService`, attention ranking, reports · one column + backfill · none · Attention Center, board, all ageing · none.
*Later:* backfill from `OperationEvent` where available. *Depends:* P-52. *Phases:* 4, 5, 12 — small and ready.

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
| P-71 ✅ | QC mandatory for every job? *(found in `PHASE_21.md` §8.D)* | POLICY | `MANDATORY_ALWAYS` | `QC` active |

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

| # | Decision | Type | Status | Relevant when |
|---|---|---|---|---|
| **S-01a** | Promise time / queue ordering | POLICY | **DECIDED — shipped** (16.A/16.E) | always |
| **S-01b** | Resource occupancy (bays/lifts/crews) — *absorbs retired P-49* | CAPABILITY | **EVIDENCE-BACKED**, sequenced after Phase 17 | always, once built |
| **S-01c** | Pre-intake appointments + field-service travel scheduling | STRUCTURAL | **DEFERRED-UNTIL-DEMANDED** | field-service / appointment-heavy |
| P-13 ✅ | Walk-ins without appointment | POLICY | `WALK_IN_ALLOWED` — BLOCKED on S-01b | S-01b built |
| ~~P-49~~ | *(retired — duplicate of S-01b)* | — | — | — |
| P-50 | Promise time customer-visible | POLICY | `VISIBLE` — **unblocked**, S-01a decided | always |
| P-51 | Overbooking permitted | POLICY | `ALLOWED_WARNED` — BLOCKED on S-01b | S-01b built |

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

## 5. Build posture rollup — does the "prebuilt configurable platform" philosophy hold?

The direction under test: push complexity backwards into the platform at build time, so that creating a workshop is configuration and activation rather than new architecture. `PHASE_21.md` §3.7 states the test that decides admission. **Updated after the §8–§12 resolution pass** — P-71 added, P-49 retired into S-01b, P-34's narrow form reclassified, and the boundary-candidate re-audit re-confirming three (not four) genuine boundaries.

| Posture | Count (of 72, incl. P-71; excl. retired P-49) | What it means for the philosophy |
|---|---:|---|
| **CORE** | 13 | Always present, plus P-18's promise and P-63's isolation half, surfaced by the resolution pass |
| **POLICY-CONTROLLED** | 28 | ✅ **The philosophy's strongest ground.** +1 for P-71 |
| **PREBUILT-ACTIVATABLE** | 15 | ✅ +3: S-01b (resource occupancy), P-34's narrow `PRIMARY_PLUS_SECONDARY` form, P-63's transport half |
| **VOCABULARY** | 3 | Specialization engine, already the right home |
| **BOUNDED-SEPARATE** | 3 | Billing (shipped precedent), S-01c if ever built, realtime delivery |
| **INTEGRATION-SEAM** | 2 | Country billing adapters |
| **DEFERRED-UNTIL-DEMANDED** | 9 | ⚠️ Real, but no second customer. P-27 now explicitly tagged **second-order** — created by P-01's default, not direct evidence |
| **OUT-OF-PLATFORM / RESOLVED** | 2 | P-60 (18.F), P-64 (20.E) — decided, not reopened |
| **ARCHITECTURAL BOUNDARY (confirmed, fails admission)** | 3 | **Down from 4** — P-34's broad form was the one moved; P-41, P-58 (broad), P-42 (broad) remain, each re-audited and re-confirmed, not merely re-asserted |

### The verdict, honestly

**The philosophy holds for roughly 60% of the inventory and fails for a specific, identifiable minority — and the minority is where the danger is.** (Revised up from the first pass's 56% after P-34's narrow form was found to pass on re-audit — see `PHASE_21.md` §12.)

**Where it holds strongly.** Every POLICY-CONTROLLED and PREBUILT-ACTIVATABLE entry shares one property: *the platform's data shape does not change when the setting changes* — `CAPABILITY_MODEL.md` Rule 2, restated as an admission test. P-40, P-43, P-36, and now S-01b and P-34's narrow form are model citizens: nullable fields or additive tables, inert when unused, provable when active.

**Where it fails, confirmed on re-audit, not merely re-asserted (3 entries — see `PHASE_21.md` §12 for the redesign attempt on each):**

| # | Why it fails | Redesign attempted? | Consequence |
|---|---|---|---|
| **P-41** multi-session jobs | `WorkOrder` shape changes; gates/time/invoicing become per-session | Yes — no narrow form found | Use P-40 linked jobs first |
| **P-58** staff across tenants *(broad form)* | Every one of 11 permission layers assumes one tenant per session | Yes — 18.A's `TenantStakeholder` **is** the narrow form, already shipped | Platform-level decision for the broad form; narrow form already exists |
| **P-42** B2B account *(broad form)* | Required parent = migration | Yes, from the first pass — narrow nullable form already admitted | Admit the narrow form only |

**P-34 moved off this list** on re-audit: `PRIMARY_PLUS_SECONDARY`, built as an additive join table rather than changing `StaffUser.role` itself, passes clause (c) cleanly. Found only by asking the redesign question explicitly rather than stopping at the first failing form — see `PHASE_21.md` §12 for the full reasoning.

**The pattern the exercise produced, confirmed on re-audit:** **a capability is prebuildable exactly when its "off" state is the current schema — and, per P-34, sometimes a form exists that satisfies this even when the obvious form doesn't.** Always worth asking the redesign question before confirming a boundary.

### The one number that decides whether this scales

Every PREBUILT-ACTIVATABLE capability adds a permanent, recurring cost: **every future lifecycle change must be re-proven against its removal policy in CI.** Linear in capability count, which is the whole argument for this approach over forking — but linear is not free.

Today the registry holds **12 capabilities**. This inventory adds **7** genuine activatable candidates (6 from the first pass + S-01b). At ~19, every lifecycle edit is validated against 19 removal policies — comfortable, and the validator already does exactly this in CI. At 40 it is still tractable. **At 100 it is not**, and the model would need a tier or namespace concept before getting there.

**So the philosophy is sound, bounded, and already partly implemented — provided admission stays disciplined,** now re-tested against all seven named failure modes (`PHASE_21.md` §11), not merely the original three-clause test.

---

## 6. Status ledger — every entry, explicit state

Per the instruction that nothing is DECIDED merely because a plausible answer was found. Full 18-field detail is in §2b; this is the state, in one place, for every entry.

| State | Count | Entries |
|---|---:|---|
| **DECIDED** | ~18 | S-01a, P-25, P-29, P-38, P-04, P-60, P-64, P-56, P-62, P-65, P-71's classification, QC's decomposition, the tier-vs-relevance verdict (§8.E), and others confirmed against direct code/spec evidence |
| **EVIDENCE-BACKED** | ~40 | The majority of POLICY-CONTROLLED and PREBUILT-ACTIVATABLE entries — defaults and postures follow from scenario evidence, not yet ratified by the owner |
| **PROPOSED** | ~8 | P-56, P-66 and others where evidence is suggestive but the design spike/runbook itself isn't written |
| **DEFERRED** | 9 | §5's DEFERRED-UNTIL-DEMANDED list |
| **BLOCKED** | 4 | P-13, P-51 (on S-01b); P-41, P-44 (on S-01c) |
| **OPEN** | 4 | §8.C (owner/SA money authority), S-01c, policy scope beyond workshop+account, P-63's phase placement — `PHASE_21.md` §15 is the authoritative list |
| **INVARIANT** | 9 | P-04, P-25, P-29, P-38, P-56, P-60, P-62, P-64, P-65 |

**No entry is marked DECIDED on this ledger without either shipped code, an existing written decision (18.F, 20.E), or a direct read of the current schema/graph — matching the standard `PHASE_21.md` §8's header table sets.**

## 7. What this inventory found that nothing else had

1. **P-18 is a live gap, not a future decision.** `CAPABILITY_MODEL.md` Rule 3 promises that removing the customer portal moves approval to the counter. **Nothing implements the counter path.**
2. **P-01's default creates P-27's problem** — now explicitly tagged second-order in §5.
3. **P-63 (realtime) belongs to no phase at all** — confirmed again on the resolution pass; decomposed into a CORE isolation half and a BOUNDED-SEPARATE delivery half, still unplaced in `PHASE_MAP.md`.
4. **Three edge cases turned out to be invariants with only one defensible answer** (E12, E18, E13).
5. **Four latent cycles in the relevance graph**, found only by auditing every recorded edge rather than the three the resolution pass went looking for — `PHASE_21.md` §9.
6. **One duplicate decision** (P-49 = S-01b), recorded under two names before the audit caught it.
7. **One boundary candidate (P-34) had a narrow form that passes admission**, found only by asking the redesign question explicitly.

**Full architectural resolution — S-01, policy scope, owner/Super-Admin authority, the QC decomposition, the decision-count analysis, and the consolidated relevance graph — is in `phases/PHASE_21.md` §8–§17.** This document's §5–§7 summarize; that document is where the reasoning lives.

---

## 8. Identity, Account, Vehicle & Vehicle-History Architecture

Prompted by an owner review demanding a platform-wide audit of identity/auth/account-provisioning/customer-identity/vehicle-identity/vehicle-history, treated as a first-class concern rather than a login-page feature. Same discipline as the rest of this document: read the existing code before proposing anything, mark DECIDED only against direct evidence, and record what is genuinely open rather than guessing.

**Headline finding: most of the hard architecture the review asked for already exists and is already correct.** This is not a rebuild — it is an audit that found a smaller, more precise set of real gaps than the review's own length implied.

### 8.A What already exists and is already correct (DECIDED, by direct code evidence)

| # | Requirement from the review | Existing implementation | Evidence |
|---|---|---|---|
| **P-72** | Staff provisioning must be Owner-initiated, never staff self-registration | `apps/api/src/organization/staff.service.ts` (`invite()`) — Owner-only (`organization.access.manage`), creates `Account(status: INVITED)` + `StaffUser`, invite-token flow. No code path anywhere lets a `TENANT_STAFF` account create itself or another staff account. | Built this session, Organization & Access — Staff tab |
| **P-73** | Customer onboarding must be a separate, self-service flow, never merged with staff provisioning | `apps/api/src/customer/register.service.ts` (`RegisterCustomerService`) — public, unauthenticated, resolves workshop by slug/code, creates `Account(accountType: CUSTOMER)` + `Customer` directly. Structurally a different controller (`public/register`), different account type, no permission check at all (by design — nobody is provisioning anyone). | Built this session, Register as Customer |
| **P-74** | Vehicle identity must be persistent and independent of current owner | `Asset` is the persistent entity (own `id`, category, plate, VIN, serial, hour-meter). `currentOwnerCustomerId` is a denormalized *pointer*, not the identity. Nothing in the schema or any service treats a change of owner as a reason to create a new `Asset` row. | `packages/database/prisma/schema.prisma` `Asset` model |
| **P-75** | Ownership must be a historical, time-ranged relationship, not a permanent link | `AssetOwnershipHistory` — one open row (`endedAt: null`) = current owner, closed rows preserved forever. `IntakeService.transferOwnership()` closes the old row and opens a new one in the same transaction as updating `Asset.currentOwnerCustomerId` — never a raw field overwrite with the old relationship silently discarded. | `apps/api/src/operations/intake.service.ts:250-262` |
| **P-76** | Ownership transfer must never be silent/inferred | `IntakeService.resolveAsset()` refuses (`409 ownership_transfer_required`) the moment an asset's `currentOwnerCustomerId` differs from the customer at the counter, and requires an explicit `confirmOwnershipTransfer: true` flag before it will act. The service's own comment: *"Quietly reassigning would give the new owner the previous owner's service history, which is a privacy incident, not a data-entry convenience."* | `apps/api/src/operations/intake.service.ts:193-204` |
| **P-77** | Vehicle history must survive ownership changes, and financial/personal data must not leak to a new owner | `SafeTechnicalHistory` is written per (`assetId`, `ownerCustomerId`) pair and queried filtered by the *viewing* customer's own id (`CustomerSafeHistoryService`/`safe-history.ts`) — a new owner's portal query structurally cannot return a row keyed to the previous owner's id. Financial records (`Invoice`, `Payment`) are keyed to the `WorkOrder`, never to the `Asset` directly, and Customer Portal services scope every query by `customerId` from the session, not by `assetId` alone. | `SafeTechnicalHistory` model + `apps/api/src/customer/*` |
| **P-78** | Plate/serial lookup must let staff find a vehicle without knowing any internal ID | `IntakeLookupService.search()` — searches `Asset.plateNumber`/`.serialNumber`/`.vinOrChassisNumber` (case-insensitive `contains`) alongside customer name/phone, already wired into Branch Manager's Customer Intake page. | `apps/api/src/branch-manager/intake-lookup.service.ts` |
| **P-79** | Tenant isolation, permission resolution, session/account lookup must be scale-ready | Already true of the whole platform (11-layer permission resolver, every query tenant-scoped, indexed on `[tenantId, …]` throughout) — this review did not find a new isolation gap; see the existing `docs/CAPABILITY_MODEL.md`/access-layer tests. | Pre-existing, unchanged by this review |

None of P-72–P-79 needed new code. They needed **verification and documentation**, which is what this section is.

### 8.B Genuine gaps found (implemented this pass)

| # | Gap | Decision | Why this scope, not more |
|---|---|---|---|
| **P-80** | `IntakeService.resolveCustomer()` creates a brand-new `Customer` row for any name+phone pair with no check against an existing customer at that phone — a staff member who does not use `IntakeLookupService`'s search-first UI can create a duplicate identity for a real returning customer. `RegisterCustomerService` has the identical gap (checks email uniqueness only). | **DECIDED, PREBUILT-ACTIVATABLE.** Mirror the ownership-transfer pattern exactly: on a phone match, refuse with a distinct code naming the existing customer, and require an explicit `confirmNewCustomerDespitePhoneMatch: true` (intake) / equivalent (registration) to proceed anyway. Never silently merge, never silently block a legitimate case (a shared household phone is real) — surface the ambiguity to a human, same as ownership transfer already does. | This is the *same* decision the codebase already made for ownership transfer, applied to the one place it was missing — not a new policy, a missing enforcement of an existing one. |
| **P-81** | No staff-facing (Technician / Team Leader) view of a vehicle's prior visits exists anywhere. The data is all there (`Inspection`, `Fault`, `WorkOrderPartLine`, `CustomerDecisionRequest`, all keyed to `assetId` via `WorkOrder`) but nothing queries "this asset's history" for the person about to work on it. This is the review's own emphasis: *"not just a customer-facing history feature… operationally important."* | **DECIDED, CORE.** Build `AssetHistoryService`: prior work orders for this asset, each with complaint (from `WorkOrder`/timeline), inspections, faults, actions/parts, decisions, and terminal outcome — **never the previous owner's name/phone/email when the visit belongs to a prior ownership period**, matching `SafeTechnicalHistory`'s existing per-owner discipline, just applied to the staff-facing feed instead of the customer-facing one. | Read-only, additive, no schema change — every field already exists. Wired into Technician's Work Card and Team Leader's read views. |
| **P-82** | Phone number has no verification mechanism | **DEFERRED — same class of gap as WhatsApp send, invite-email send, and Password Reset (`docs/detailed-specs/shared-system-pages.md`'s own placeholder note).** No SMS/OTP infrastructure exists anywhere in the product. Building a fake "verified" checkbox with no real verification behind it would be exactly the kind of silent stub `CLAUDE.md` forbids. Recorded here so it is not silently forgotten, not built as a placeholder. | — |
| **P-83** | License-plate change / historical-registration-identifier tracking (a vehicle that gets replated) | **DEFERRED.** No service anywhere lets a plate be edited after `Asset` creation at all — there is no live feature to retrofit history-tracking onto yet. Building a `PlateHistory` model now would be speculative against a feature that does not exist. When Asset editing is built, this is the first thing that implementation must decide, named here so it is a deliberate choice then, not a gap discovered by accident. | — |
| **P-84** | Whether a phone number may ever legitimately belong to more than one customer account (shared household phone), and what a hard per-tenant unique constraint would break for existing/seed data | **OPEN.** The review explicitly asked this as a question, not a directive ("I am not saying make phone number the database primary key"). P-80's refuse-and-confirm pattern is deliberately weaker than a DB-level `@@unique` constraint so this question stays open rather than being silently pre-empted by a migration — a hard constraint is a one-way door a soft confirmation gate is not. | Revisit if evidence (a real duplicate-account incident) accumulates. |

### 8.C The invariant this section exists to name

> **A person can change their contact information. A person can change roles. A vehicle can change owners. A vehicle can change its registration identifier. But the underlying identity and historical relationships must remain coherent and traceable.**

Every DECIDED entry above (P-72–P-81) is a direct instance of this invariant already holding, or now holding, in running code — not a diagram. The two DEFERRED entries (P-82, P-83) are exactly the two places new infrastructure (SMS, asset-editing) would be needed before the invariant could be extended further, named rather than faked.
