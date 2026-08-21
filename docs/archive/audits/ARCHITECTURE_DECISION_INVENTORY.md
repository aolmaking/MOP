# Architecture Decision Inventory

> **Status: OPEN — nothing here is decided.** This document exists to be argued with. It enumerates the questions that must be answered before the next implementation wave, the competing answers, and what each answer would cost. No code follows from it until the decisions are made deliberately.
> **Date:** 2026-08-13.
> **Companion:** [`CAPABILITY_MODEL.md`](./CAPABILITY_MODEL.md) (the shaping engine that already exists), [`PHASE_MAP.md`](./PHASE_MAP.md) (what's planned), [`scenarios3/EDGE_CASE_REGISTER.md`](./scenarios3/EDGE_CASE_REGISTER.md) (the 7 remaining hardening items).

---

## 0. The headline, first

**The "multiple workshop architectures" question has already been asked and answered inside this project — with evidence — and the answer was no.**

`docs/scenarios/FINDINGS_SYNTHESIS.md`, written after 20 scenarios across four deliberately maximally-different workshops (one-man oil change, 4-branch dealership network, field-service heavy equipment, 6-branch quick-lube chain), states it directly:

> "Every workshop in this set is the same six-system spine. **None of them needed a different spine.** What they needed, over and over, in 78 different specific instances, was the spine filled in with their own vocabulary."

The second pass — 40 scenarios, 8 tenants, watched from the platform console rather than the workshop floor — did not overturn this. It found three new concerns (tenant relationships, governance depth, resilience at scale), and **none of them is "this workshop needs a different operating model."** They are all things the *platform* lacked, uniformly, for every tenant.

So the honest answer to "should we support Architecture A / B / C?" is: **no, and the project already has the evidence to say so.**

**But the instinct behind the question is right, and points at something real.** There is a genuine gap. It is just not an architecture gap — it is a **policy** gap, and it currently has no home. Section 2 makes that case. Section 4 is the inventory you asked for.

---

## 1. Where the roadmap genuinely varies

Three distinct axes of variation exist in the roadmap. Two already have engines. One does not, and that is the actual finding.

### Axis 1 — Structural shape: *which steps exist* ✅ has an engine

Does this workshop have inventory? Multiple branches? A QC step? A team leader?

**This is the capability engine, and it is built and proven.** Seven shipped profiles, a reachability validator that rejects any configuration able to strand a work order, removal policies that reroute rather than delete, all validated in CI. `packages/shared/src/capabilities/`.

Critically — **this is already "multiple architectures," done correctly.** `DIAGNOSTICS_ONLY` and `MULTI_BRANCH_FULL_SERVICE` are genuinely different operating models: different lifecycle graphs, different reachable states, different gates, different roles, different pages. They just share one codebase and one proof obligation instead of forking. The mechanism you are describing exists; it is called a capability profile.

### Axis 2 — Vocabulary: *what things are called and what fields they carry* 🟠 has a partial engine

Service cards, measurement forms, position taxonomies, credentials, blocker reasons — declared per workshop at creation.

**This is Phases 15–17, schema settled, 3 of 5 primitives proven end-to-end.** The engine exists; the authoring UI does not, and "start from nothing" (Phase 17's own sharpened requirement) is still owed.

### Axis 3 — Policy: *what the same step means here* ❌ **no engine, no home, no owner**

This is the gap. The evidence is in the scenario findings themselves, and it is unusually clean because the same feature drew **opposite complaints from different workshops**:

| Finding | Workshop A said | Workshop C said |
|---|---|---|
| Delivery gate (A 1.3 vs C 15.1) | "Paid-before-release is right" | "We invoice net-30 B2B, this blocks us" |
| Customer decision link (D 19.1) | Correctly heavy for a safety warning | Absurdly heavy for a wiper-blade upsell |

`FINDINGS_SYNTHESIS.md` names the resolution itself: *"resolved by making the policy workshop/account-configurable rather than picking a side."*

And this is exactly what broke Phase 19.A in practice. Separation of duties was built as a **global rule**, and it broke 22 existing tests modeling a legitimate single-storekeeper shop. `PHASE_19.md`'s own conclusion: *"the real fix needs a per-workshop opt-in policy, not a global rule."* The enforcement was reverted. **There was nowhere to put the policy.**

**A policy is not a capability and not a specialization:**

- A **capability** answers *does this step exist here?* → structural, changes the graph, governed by reachability.
- A **specialization** answers *what is this called and what fields does it carry?* → vocabulary, data-shaped.
- A **policy** answers *this step exists and is called this — but under what rule does it pass?* → behavioural, changes a decision, not a shape.

Delivery-before-payment is not a capability (the delivery step exists either way, and disabling it would be wrong) and not a specialization (nothing is renamed). It is a rule with two legitimate settings. **The current model has no third slot, so this class of decision keeps getting resolved by picking a side and hardcoding it** — which is precisely what 19.A did, and had to be reverted for.

---

## 2. The competing architecture strategies

| Strategy | What it means here | Complexity | Testing burden | DB implications | Verdict |
|---|---|---|---|---|---|
| **A. One universal architecture + flags** | What v11.9 did. Config becomes an untyped second language. | Low upfront, unbounded later | Untestable — combinatorial and undeclared | None | ❌ **Already failed once.** `VISION.md` §3.2 names this as the trap v11.9 fell into |
| **B. Capability-based composition** | **What exists today.** Typed registry, removal policies, reachability proof. | Moderate, bounded | Bounded — profiles validated in CI | None (Rule 2: removal never changes data shape) | ✅ **Keep.** Proven, tested, load-bearing |
| **C. Explicit architecture profiles (A/B/C)** | Separate operating models chosen at creation | High | **Multiplicative** — ~490 API tests × N architectures; N reachability validators | Divergent schemas or a discriminator on everything | ❌ **Recommend against** — see below |
| **D. Strategy/plugin per behaviour** | Injectable policy objects behind stable interfaces | Moderate, *localized* | Additive, not multiplicative — test each policy once | None; a policy row, not a schema fork | ✅ **This is the missing piece** (Axis 3) |
| **E. Separate bounded architectures on a shared core** | True forking with a shared library | Very high | Per-architecture full suite | Divergent | ❌ Only justified if two products genuinely diverge. No evidence of that |
| **F. Capability + specialization + policy, one spine** | B + Axis 2 + D | Moderate | Additive | One new policy model | ✅ **Recommended** |

### Why C (explicit architecture profiles) is the wrong shape here

Not because it's a bad idea in general — because of what it would cost *against this specific codebase*:

1. **It breaks the project's own load-bearing rule.** `CAPABILITY_MODEL.md` Rule 2: *"Removal changes behaviour and presentation, never the shape of the data."* That rule is what makes capability changes reversible and history-safe. Separate architectures with separate schemas would make switching a workshop's architecture a **data migration**, and every record created under the old one potentially malformed. You would lose the single property that lets Super Admin reshape a live workshop without fear.

2. **Testing goes multiplicative.** Today: ~490 API + 121 shared + 225 web tests, one lifecycle graph, one reachability validator proving every shipped profile can't strand a job. With N architectures that becomes N proof obligations, and the cross-architecture cases (a workshop *changing* architecture) are new and much harder than anything currently tested.

3. **It has no customer.** Twenty scenarios across four maximally-different workshops produced 78 findings and **zero** that required a different spine. Building the abstraction now would be speculative — and `CLAUDE.md`'s own instruction is not to design for hypothetical future requirements.

4. **The capability engine already delivers 90% of what you want from it.** "Different workflows, different pages, different roles, chosen at creation time" is a literal description of what a capability profile already does today.

**The 10% it does not deliver is Axis 3.** That is the gap worth closing — and it closes with strategy D (a policy layer), which is small, local, and additive, not with a second architecture axis.

---

## 3. Should workshop creation select an architecture?

**Recommendation: no — but it should select a *policy set*, and that is a bigger change to Add Workshop than it sounds.**

The distinction that matters:

- **Architecture** should stay an internal implementation detail. There is one spine; there must remain one spine; the reachability proof depends on it.
- **Capability profile** is already selected at creation (`starterBuilderTemplate`) and should stay there. ✅ built
- **Specialization profile** is already selected at creation (`starterSpecializationProfile`, Phase 17.A). ✅ backend seam built, wizard owed
- **Policy set** is *not* selected anywhere, does not exist as a model, and is the thing that keeps forcing hardcoded decisions. ❌ **the gap**

So `Create Workshop` grows a fourth axis — but it is a **policy set**, not an architecture. That keeps one spine, one test suite, one reachability proof, and gives the D 19.1 / A 1.3-vs-C 15.1 / 19.A class of finding somewhere to live.

---

## 4. The decision inventory

**34 open decisions across 7 groups.** The eight marked ⚠️ are architectural lock-in — expensive or impossible to reverse once pages are built on them. Those get full treatment below; the rest are listed compactly and can be expanded on demand.

### 4.1 The eight lock-in decisions (full treatment)

---

#### ⚠️ D-01 — Is there a policy layer at all, and where does it sit?

1. **Question.** When a step exists and is named correctly but must behave differently per workshop (delivery-before-payment, decision weight, separation of duties), what mechanism decides? Today: nothing — it gets hardcoded.
2. **Options.** **(a)** Keep hardcoding, accept per-case reverts like 19.A. **(b)** Add policies as capability statuses (overload the existing engine). **(c)** A distinct `WorkshopPolicy` model + typed policy registry, resolved like capabilities but *not* reachability-governed. **(d)** Push each policy into the specialization engine as a config field.
3. **Consequences.** (a) is the status quo and its failure mode is already documented (19.A). (b) corrupts the capability model — a policy has no removal semantics and no reachability meaning; the validator would have to ignore it, which weakens a proof that currently holds absolutely. (c) is additive and typed; costs one model, one resolver path, one registry. (d) makes policies untyped data, which is `VISION.md` §3.2's exact trap.
4. **Changes.** New `WorkshopPolicy` table (tenant, key, value, source, effectiveFrom — time-ranged, same reasoning as `TenantCapability`); a `POLICY_REGISTRY` in `packages/shared`; policy reads in `FinanceService` (delivery gate), `CustomerDecisionService` (decision weight), `PartRequestService` (separation of duties). **No permission-resolver change** — a policy is not a permission.
5. **Depends on it.** 19.A (blocked on exactly this), Governance Controls page, Phase 9's delivery gate, D 19.1's lighter decision mechanism, Owner's Pricing/Financial Configuration page, most of Phase 20.D.
6. **Reversible?** The *decision* is lock-in — retrofitting a policy layer after 6 more pages read hardcoded rules is the expensive version. The *policies themselves* are reversible by design.
7. **Affects creation?** Yes — a policy set becomes the fourth creation axis.
8. **Existing workshops?** Both. Needs a documented default per policy so existing tenants keep current behaviour exactly.
9. **Migration?** Only defaults backfill. No data reshaping.
10. **Recommendation. (c).** It is the smallest change that gives this recurring class of finding a home, it keeps the capability engine's proof intact by staying out of it, and it is the only option that doesn't either repeat 19.A or repeat v11.9.

---

#### ⚠️ D-02 — Asset ownership transfer semantics (your example)

1. **Question.** When a vehicle changes hands, when exactly does ownership transfer, and what happens to in-flight work and pending decisions?
2. **Options.** **(a)** Immediate (today's behaviour — intake transfers on confirmation). **(b)** Transition period where the previous owner retains defined rights. **(c)** Review/approval workflow before transfer commits.
3. **Consequences.** (a) is simple and already shipped, but E19 showed it can leave a valid decision link answerable by a former owner (now flagged in the audit trail, not blocked). (b) requires ownership to become time-ranged *for authorisation*, not just for history — `AssetOwnershipHistory` already stores the periods, but nothing reads them for access decisions. (c) adds a new approval lifecycle and a pending-transfer state that intake must handle.
4. **Changes.** (b)/(c) change `CustomerPortalService`, `CustomerDecisionService`, and the customer-safe projection: "which customer may see this asset's history" stops being `Asset.currentOwnerCustomerId` and becomes a time-ranged query. (c) adds a lifecycle graph → reachability obligation.
5. **Depends on it.** Customer Portal history, E19's final shape, warranty (a warranty follows the vehicle or the owner — undecided), Phase 16.D payer attribution.
6. **Reversible?** **Lock-in.** Every page that reads "the owner" hardcodes the answer.
7. **Affects creation?** Only under D-01(c) — it would be a policy.
8. **Existing workshops?** All.
9. **Migration?** (b)/(c) need backfill of transfer timestamps; `AssetOwnershipHistory` already has them.
10. **Recommendation. (a) + explicit rule**, i.e. keep immediate transfer, and write down the two facts it implies: technical history follows the vehicle, financial history stays with the payer. Add (b) only if a real scenario demands it. (c) is a workflow nobody has asked for. **But the rule must be written** — it is currently implied by code and asserted nowhere.

---

#### ⚠️ D-03 — Are custom specialization fields queryable and reportable?

1. **Question.** A workshop defines "hydraulic pressure at test" on its measurement form. Can the owner then filter, report, or alert on it?
2. **Options.** **(a)** Store-and-display only (today: `SpecializationEntry` values). **(b)** Typed columns per definition (EAV-ish, indexed). **(c)** JSONB + GIN indexes + a query DSL. **(d)** Store-and-display now, promote to queryable per-field on demand.
3. **Consequences.** (a) means Reports & Analytics can never see the data that most distinguishes a specialized workshop — a serious product hole. (b) is fast but rigid and multiplies migrations. (c) is flexible and is where most SaaS products land, but a query DSL over tenant-defined fields is a genuinely large subsystem and a real injection surface. (d) defers cost but requires the promotion path to be designed now.
4. **Changes.** Reporting engine, Data Analyst's 7 pages (0/7 built), Owner's Reports & Analytics, possibly a new indexing strategy.
5. **Depends on it.** All 7 Data Analyst pages, Owner Reports, Phase 12's export work, any alerting.
6. **Reversible?** **Lock-in for the reporting engine.** Building reports against fixed columns and retrofitting tenant-defined fields later means rewriting the query layer.
7. **Affects creation?** No.
8. **Existing workshops?** All with specializations.
9. **Migration?** (b) yes, per-field. (c)/(d) no.
10. **Recommendation. (d)**, with the promotion path designed before the first Data Analyst page ships. Reporting is currently 0/7 pages, so the window to decide cheaply is open — it closes the moment the first analytics page is built.

---

#### ⚠️ D-04 — Scheduling and resources: is there a calendar?

1. **Question.** `FINDINGS_SYNTHESIS.md` calls appointments/queue/promise-time *"the single largest gap in the whole document, found independently in all four workshops"* (A 4.1), with resources (lifts, bays, crews — A 4.2) beside it. Does MOP get a scheduling model?
2. **Options.** **(a)** No — promised-time only (Phase 16.A shipped this). **(b)** Capacity/queue model without a calendar. **(c)** Full appointments + resource booking.
3. **Consequences.** (c) is a new bounded system — a seventh, beside the six on the spine — with its own lifecycle, conflicts, reachability, and UI. (b) is materially cheaper and covers a walk-in workshop. (a) is what exists.
4. **Changes.** New entities (`Resource`, `Appointment`/`Slot`), new work-order relationships, Branch Manager and Technician pages both grow a scheduling surface, Attention Center ranking changes.
5. **Depends on it.** Phase 16.B/16.C (deferred), Branch Manager's board, field-service workshops (heavy equipment scenarios), any SLA work beyond 16.E.
6. **Reversible?** **Lock-in.** Retrofitting scheduling into a lifecycle five roles depend on is the same shape of mistake as retrofitting capability-awareness — the mistake this project explicitly organized itself to avoid (`PHASE_MAP.md` rule 3).
7. **Affects creation?** Yes if it becomes a capability (`SCHEDULING`).
8. **Existing workshops?** New capability, default off → existing behaviour unchanged.
9. **Migration?** None if default-off.
10. **Recommendation.** Decide **now**, build later. My read: (b) as a `SCHEDULING` capability, since four of four scenario workshops needed *promise and queue*, and only field-service needed true calendar booking. But this needs its own scenario pass before committing — it is the largest single open item in the roadmap.

---

#### ⚠️ D-05 — Is `StaffUser` permanently bound to one tenant?

1. **Question.** `StaffUser.tenantId` and `Tenant.id` are treated as permanent 1:1 facts everywhere. Scenario set 2's dominant finding is that real businesses are sold, merged, split, and staff are seconded across tenants.
2. **Options.** **(a)** Permanent binding (today) + `TenantStakeholder` for narrow external access (18.A, shipped). **(b)** Account-to-tenant as a many-to-many membership model with time bounds. **(c)** Full identity/organisation split.
3. **Consequences.** (b)/(c) touch the permission resolver's entry point — every one of the 11 layers currently assumes one tenant per session. That is the single most load-bearing code path in the product.
4. **Changes.** `PermissionContextService`, `SessionGuard`, every scoped query's tenant assumption, `AuditLog.tenantId` semantics.
5. **Depends on it.** Phase 18.B/18.C (deferred), Phase 10 People/Performance tenure tracking, regional-manager role (17.E/D 20.1), E17.
6. **Reversible?** **Hard lock-in.**
7. **Affects creation?** No.
8. **Existing workshops?** All.
9. **Migration?** (b)/(c) require a real migration of every staff account.
10. **Recommendation. (a) — hold.** 18.A's narrow stakeholder grant covers the observed cases without touching the resolver. Revisit only when a paying customer actually needs cross-tenant staff. **But record it as a conscious deferral**, because `PHASE_MAP.md` already notes 18.A/18.B "should land before Phase 10's People/Performance work" — so Phase 10 must not build tenure tracking that assumes permanence.

---

#### ⚠️ D-06 — Point-in-time truth: does history get snapshots?

1. **Question.** Phase 12 shipped live-only reporting by explicit choice. 19.E (historical permission reconstruction) and 19.G (point-in-time snapshots) are deferred. Does MOP ever answer *"what did this report say last March, under the permissions and capabilities in force then?"*
2. **Options.** **(a)** Live-only forever. **(b)** Snapshot reports at close/period boundaries. **(c)** Full temporal reconstruction from the event log.
3. **Consequences.** (c) is the most expensive thing in the roadmap and `PHASE_19.md` calls it its own "hardest item." (b) is bounded. (a) is honest but limits dispute resolution and any regulated market.
4. **Changes.** Reporting engine, a snapshot store, `AuditLog` read patterns.
5. **Depends on it.** Phase 19.E/19.G, dispute resolution (19.B shipped the state, not the evidence), Data Analyst pages, any audit-grade export.
6. **Reversible?** (a)→(b) is reversible. (a)→(c) effectively is not — reconstruction needs the events to have been recorded with that intent from the start. **`OperationEvent` already records them**, which quietly preserves the option.
7. **Affects creation?** No.
8. **Existing workshops?** All.
9. **Migration?** (c) can only reconstruct back to the event log's start.
10. **Recommendation. (b)**, and verify explicitly that `OperationEvent` + time-ranged `TenantCapability` are sufficient to reconstruct — because if they are, (c) stays available for free and no decision is urgent.

---

#### ⚠️ D-07 — Realtime: promised, absent

1. **Question.** The original brief promises progress that "updates in real time on the technician, team leader and customer pages." `VISION.md` §4.5: *"there is currently no realtime mechanism in the codebase at all."* Still true.
2. **Options.** **(a)** Polling. **(b)** SSE. **(c)** WebSockets. **(d)** Drop the promise explicitly.
3. **Consequences.** Any of (a)–(c) is a new cross-tenant leakage surface — `VISION.md` flags this directly. (c) needs connection-state infrastructure MOP doesn't have. (a) is cheapest and interacts badly with 20.F's bandwidth concerns.
4. **Changes.** New transport, tenant-scoped channel authorisation, client state management on 3+ page families.
5. **Depends on it.** Technician Now page, Team Leader Home, Customer portal service view, Workshop Live View (Platform, unbuilt).
6. **Reversible?** Transport choice is reversible; the *isolation model* for channels is not.
7. **Affects creation?** No.
8. **Existing workshops?** All.
9. **Migration?** None.
10. **Recommendation. (b) SSE**, or (d) stated openly. What must not continue is the current state: promised in the brief, absent in the code, unmentioned in the phase map.

---

#### ⚠️ D-08 — Country as a configuration axis: when does compliant-blocked actually block?

1. **Question.** `compliantBlocked` is computed and stored but is **visibility-only** — a tenant in a country with no adapter can still issue invoices the state doesn't recognise. Phase 20.D wants country as a real axis (legal identity fields, working week, tax).
2. **Options.** **(a)** Visibility only (today). **(b)** Block invoice issuance when blocked. **(c)** Block, with a platform-granted override.
3. **Consequences.** (b) can hard-stop a paying tenant's ability to trade — enormous blast radius, and precisely the "no destructive action without knowing who it affects" bar `VISION.md` §2 sets. (a) means MOP silently helps produce invalid invoices.
4. **Changes.** `FinanceService.issueInvoice`, billing adapter seam, Workshops list, Governance Controls.
5. **Depends on it.** Any second-country tenant going live, ZATCA/ETA adapters, Phase 20.D, Phase 14's legal-adaptation half.
6. **Reversible?** Reversible, but (b) shipped unannounced would be an outage for someone.
7. **Affects creation?** Yes — country is chosen at creation and currently can't be changed.
8. **Existing workshops?** All in non-adapter countries — currently every tenant, since `ADAPTER_COVERED_COUNTRIES` is empty.
9. **Migration?** None.
10. **Recommendation. (c)**, gated behind a policy (D-01) so it can be turned on per tenant as adapters land, rather than flipped globally.

---

### 4.2 The remaining 26 (compact)

| # | Decision | Lock-in? | Blocks |
|---|---|:--:|---|
| D-09 | Payer as first-class entity vs. invoice field (warranty/insurer/fleet/rework) | ⚠️ high | 16.D, B2B, Finance reports |
| D-10 | B2B `Account` entity distinct from `Customer` (B 10.1) | ⚠️ high | Customer model, portal, D-09 |
| D-11 | Decision weight: one heavy mechanism vs. a second lighter one (D 19.1) | med | Customer Portal, D-01 |
| D-12 | Separation of duties: global vs. per-workshop opt-in | med | 19.A (**currently blocked on this**) |
| D-13 | Roles: fixed enum vs. workshop-defined roles | ⚠️ high | Permission model, Builder Control |
| D-14 | One person holding several roles (A 1.1) | med | Small-workshop usability, permission resolver |
| D-15 | Regional-manager tier between branch manager and owner (17.E / D 20.1) | med | Scope resolver, 17.E |
| D-16 | Blocker reason: fixed enum vs. workshop-defined (Phase 15, schema-only) | low | Phase 15 completion |
| D-17 | Specialization scope: platform / network / branch override (16.I) | med | 16.I — spike recommends reusing capability machinery |
| D-18 | Work-order-to-work-order linkage: comeback / follow-up / parent-child | ⚠️ high | 16.C, warranty, rework attribution |
| D-19 | Multi-session / multi-day jobs at multiple locations (C 11.1) | ⚠️ high | Field service, D-04 |
| D-20 | Location/site entity with persistent facts and travel time (C 12.1) | med | 16.F, field service |
| D-21 | Append-only addenda on closed work orders (C 13.1) | med | 16.G, immutability rules |
| D-22 | Warranty: follows vehicle or owner? + leap-year arithmetic (**E11**) | med | D-02, warranty field |
| D-23 | Data import path — none exists for any entity (D 16.1) | med | 17.D, 20.C, onboarding |
| D-24 | Bulk data correction tool (D 16.2) | low | 17.D |
| D-25 | Outbound customer messaging + workshop templates (A 4.4) | med | Owner Messages page |
| D-26 | Direct-purchase parts that never touch a warehouse (A 2.1) | med | Inventory, `EXTERNAL_PARTS` capability |
| D-27 | Warehouse deactivation with nonzero stock (**H7**) | low | Inventory admin |
| D-28 | `statusChangedAt` column vs. `updatedAt` proxy (known issue #3) | low | Reporting accuracy, D-06 |
| D-29 | Retention/archive clocks + migrations against dormant tenants (**E17**) | med | 18.D, E17 |
| D-30 | Offline: confirmed no? (20.E decided) — revisit trigger? | ⚠️ high | Would invalidate every concurrency proof if reversed |
| D-31 | Clock authority across replicas (**E12**) | low | Token expiry, SLA math |
| D-32 | DB failover posture + runbook (**E20**) | low | Ops readiness |
| D-33 | Password hash versioning / lazy rehash (**E18**) | low | Auth baseline |
| D-34 | Capability rollback racing an in-flight transition (**E13**) | med | Capability engine correctness |

**The 7 remaining edge cases map onto D-22 (E11), D-27 (H7), D-29 (E17), D-31 (E12), D-32 (E20), D-33 (E18), D-34 (E13)** — confirming they were never really "bugs left over," but the small tail of a much larger decision surface.

---

## 5. Dependency map

The chain you asked for, drawn for the two decisions that dominate everything else.

```
D-01  Is there a policy layer?
  │
  ├─ architectural consequence ─→ third resolution axis beside capability + specialization
  │                                 (deliberately OUTSIDE the reachability proof)
  ├─ affected services ─────────→ FinanceService (delivery gate)
  │                               CustomerDecisionService (decision weight)
  │                               PartRequestService (separation of duties)
  ├─ affected DB models ────────→ NEW WorkshopPolicy (time-ranged, like TenantCapability)
  │                               NEW POLICY_REGISTRY in packages/shared
  ├─ affected permissions ──────→ NONE — a policy is not a permission (this is the point)
  ├─ affected UI/workflows ─────→ Add Workshop (4th axis) · Governance Controls ·
  │                               Owner Pricing & Financial Configuration
  └─ phases blocked ────────────→ 19.A (blocked TODAY) · 20.D · Phase 9 delivery gate ·
                                  Governance Controls page · D-08 · D-11 · D-12


D-04  Is there a scheduling model?
  │
  ├─ architectural consequence ─→ a SEVENTH bounded system on the spine, or not
  ├─ affected services ─────────→ WorkOrderLifecycleService (promise/queue states)
  │                               AttentionQueueService (ranking inputs)
  ├─ affected DB models ────────→ NEW Resource, Appointment/Slot; WorkOrder gains links
  ├─ affected permissions ──────→ new key family (scheduling.*)
  ├─ affected UI/workflows ─────→ Branch Manager board · Technician Now ·
  │                               Customer portal (promise visibility)
  └─ phases blocked ────────────→ 16.B · 16.C · field-service viability · SLA beyond 16.E
```

**The general shape, applicable to every row in §4.2:**

```
Decision → architectural consequence → service boundary → DB model
        → permission model → workflow/UI → phases blocked
```

---

## 6. Recommendation

1. **Reject multiple architectures.** One spine. The capability engine already *is* the multi-architecture mechanism, correctly built, with a proof obligation that separate architectures would destroy.
2. **Accept that the instinct was pointing at something real** — Axis 3, policy — and close that gap with the smallest typed mechanism that works (D-01 option (c)).
3. **Decide D-01 through D-08 before the next implementation wave**, because each is lock-in and each is currently being answered implicitly by whatever gets built next.
4. **D-04 (scheduling) probably deserves its own scenario pass** before being decided — it is the largest open item and the one most likely to be a seventh system.
5. **Do not build Governance Controls yet.** It is the page that would surface policies, so D-01 determines a large part of what it even contains. Building it first would hardcode the answer.

---

## 7. What I need from you

Ordered by how much they unblock:

1. **D-01 — is there a policy layer?** Everything else in §4.1 partly depends on the answer.
2. **D-04 — does MOP get scheduling?** Largest scope question in the roadmap.
3. **D-03 — are custom fields reportable?** The window closes when the first Data Analyst page is built.
4. **D-07 — realtime: build it or drop the promise?**
5. **Is my rejection of multiple architectures right?** I have argued it from the project's own evidence, but it is your product — if you know of a workshop shape the four scenario workshops did not cover, that changes the analysis and I would want to hear it before we commit.
