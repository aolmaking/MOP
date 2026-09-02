# MOP — Product Scope and Capabilities

> **Document ID:** DOC-02
> **Purpose:** every capability MOP has, what turning it on enables, what turning it off actually rewires, and where each one is implemented.
> **Authority:** DESCRIPTIVE. The registry in code is authoritative; this document explains it.
> **Scope:** the capability engine and the twelve capability keys.
> **Last verified:** 2026-09-01 against commit `a8c8bb5`.
> **Source of truth:** `packages/shared/src/capabilities/registry.ts` (definitions + removal policies), `gates.ts` (gate ownership), `workflow-graphs.ts` (which edges each capability guards), `types.ts` (the model), [`../CAPABILITY_MODEL.md`](../CAPABILITY_MODEL.md) (the design record).
> **Related:** 03 (profiles and specialisations), 04 (policies — the other configuration axis), 07/08 (lifecycle and engine), 20 (permissions — the third axis).

---

## 1. What a capability is, and what it is not

A capability answers **"does this workshop's business model include this thing at all?"**

```
capability  = "this workshop's business model includes an inventory"
permission  = "this user may issue a part from the inventory"
policy      = "when a part is issued, must a second person approve it?"
```

A permission can never resurrect a disabled capability. That is why capability sits **above** role and user override in the effective-access resolver order — see `20_PERMISSION_AND_AUTHORIZATION_MODEL.md`.

Three tests distinguish the axes. Apply them in this order:

| Question | If yes, it is a… |
|---|---|
| Could switching this change whether a work order can still reach a terminal state? | **Capability** |
| Does it change the rule a step runs under, without changing which steps exist? | **Policy** |
| Does it change who may perform an action that certainly exists? | **Permission** |

A setting that fails all three is not configuration; it is a preference, and it probably belongs in `FinanceConfiguration` or a form definition.

## 2. Capability status — five values, not a boolean

`[IMPLEMENTED]` — `CAPABILITY_STATUSES` in `types.ts`.

| Status | Meaning | Transitions and gates live? |
|---|---|---|
| `ENABLED` | Normal | Yes |
| `DISABLED` | Removed. The removal policy runs | No |
| `READ_ONLY` | Existing records readable, no new writes | Yes |
| `EXTERNAL` | **The business function still happens, outside MOP** | Yes |
| `LOCKED` | Platform-pinned; the tenant may not change it | Yes |

`EXTERNAL` is the important middle ground and the reason the model is not a boolean. A workshop that issues legal invoices from separate accounting software is `EXTERNAL` for `BILLING`, not `DISABLED` — MOP must still record the invoice reference and may still gate delivery on it.

**An absent key means `ENABLED`.** A capability profile records *deviations* from the full product, so a freshly-provisioned workshop with no rows at all is a complete workshop. Reading absent as *disabled* is the dangerous inversion: it silently strips every capability from a tenant whose provisioning half-finished. One function, `isCapabilityActive()`, owns that reading, because three separate places were deriving it independently.

## 3. The removal policy — why "off" is never enough

Every non-core capability carries a complete `RemovalPolicy`. A capability that is merely "off" with no declared policy is precisely the failure mode this model exists to prevent, and the registry refuses to accept one.

A removal policy declares:

| Field | Answers |
|---|---|
| `behavior` | `REROUTE` · `DROP_STEP` · `EXTERNALIZE` · `READ_ONLY` · `BLOCK_NEW_ENTRIES` |
| `statesToDisable` | Which states become unenterable |
| `addTransitions` | Replacement edges that keep the graph connected |
| `gatesToDrop` / `gatesToKeep` | Which checks die and which survive |
| `existingRecordsPolicy` | `PRESERVE_READ_ONLY` · `MIGRATE_TO_TERMINAL` · `REQUIRE_MANUAL_RESOLUTION` |
| `orphanedRolePolicy` | `HIDE_ROLE` · `READ_ONLY_ROLE` · `REQUIRE_REASSIGNMENT` |
| `customerSafeMessage` | Replacement customer-facing wording, where removal changes what the customer is told |

Listing a state in `statesToDisable` without also removing every transition **into** it is the classic smart-delete bug. The validator catches it as a stranded state before the change is applied.

### Gate ownership

**A gate belongs to the capability that produces the thing it checks, and dies with it.** `[IMPLEMENTED]` — `gates.ts`.

This is not tidiness. Before gates had owners they were free strings inside each removal policy, which made two things possible that must not be: a typo (`qc.pased`) silently creating a gate nothing satisfies, and two capabilities disagreeing about a shared gate. **The second already happened** — with Inventory and Part Returns both removed, one dropped `parts.received_used_or_returned` and the other kept it, resurrecting a check nothing could satisfy and stranding every job in the workshop.

Core gates (`owner: null`) are the product's floor and no profile may drop them.

## 4. The twelve capabilities

All twelve are `[IMPLEMENTED]` with complete removal policies, `[VERIFIED]` by `validator.spec.ts` against every shipped profile.

---

### `MULTI_BRANCH` — *More than one branch*
**Owning system:** Operations · **Depends on:** — · **Reversible:** yes · **Removal:** `DROP_STEP`

Several locations, each with its own manager, board and staff. A work order belongs to the branch that took it in; a branch manager sees their own branch's board, not everyone's.

| | |
|---|---|
| Gates owned | none |
| Roles affected | `BRANCH_MANAGER` (→ `READ_ONLY_ROLE` on removal) |
| Reports affected | `reports.branch_comparison` |
| States disabled | none |
| Historical records | `PRESERVE_ACTIVE` |
| Without it | One location. The branch dimension collapses to one, and branch comparison sections are **absent, not empty** |

**Design note.** Behaviour and presentation change; the data shape does not. The tenant keeps exactly one `Branch` row and `branchId` stays required — so re-enabling is a config change, not a migration, and records created meanwhile are still well-formed.

---

### `MULTI_WAREHOUSE` — *More than one store*
**Owning system:** Inventory · **Depends on:** `INVENTORY` · **Reversible:** yes · **Removal:** `DROP_STEP`

| | |
|---|---|
| Gates owned | none |
| Reports affected | `reports.inventory.warehouse_usage` |
| Orphaned roles | `HIDE_ROLE` |
| Without it | All stock sits in one store and no transfer step is ever asked for |

---

### `INVENTORY` — *Parts and stock*
**Owning system:** Inventory · **Depends on:** — · **Reversible:** yes · **Removal:** `REROUTE`

The case that proves the whole model.

| | |
|---|---|
| Gates owned | `parts.received_used_or_returned` |
| Roles affected | `INVENTORY_MANAGER` (→ `REQUIRE_REASSIGNMENT`) |
| Reports affected | `reports.inventory.stock_health`, `reports.inventory.consumption` |
| States disabled | `WAITING_PARTS` |
| Gates dropped | `parts.received_used_or_returned` |
| Gates kept | `approved_work_completed`, `no_open_blocker`, `customer_decisions_resolved` |
| Historical records | `PRESERVE_READ_ONLY` |
| Customer-safe message | *"We are waiting for a required part. The branch will update you when it arrives."* |
| Without it | Parts are bought for the job as needed. A parts wait is recorded as a **blocker** (`BlockerReason.WAITING_PART`), and `IN_PROGRESS ↔ BLOCKED` already exists unguarded — so no replacement edge is needed |

**Why this one proves the model.** Dropping the parts gate is not a convenience. Leaving it in place is what strands *every* job in a workshop that has no way to issue or return a part. The entire `PartRequest` graph is also skipped rather than reported unreachable — `requires: ["INVENTORY"]` on the graph itself, because "this never happens here" is a different fact from "this happens and then gets stuck."

---

### `PART_RETURNS` — *Parts can come back*
**Owning system:** Inventory · **Depends on:** `INVENTORY` · **Reversible:** yes · **Removal:** `DROP_STEP`

| | |
|---|---|
| Gates owned | `parts.no_pending_return` |
| Reports affected | `reports.inventory.returns` |
| States disabled | `RETURN_REQUESTED`, `RETURN_ACCEPTED`, `RETURNED_TO_STOCK` |
| Existing records | `REQUIRE_MANUAL_RESOLUTION` — an in-flight return cannot simply be dropped |
| Without it | An issued part is consumed by the job. Correcting a mistake is a stock adjustment, not a return |

---

### `EXTERNAL_PARTS` — *Customer-supplied and bought-in parts*
**Owning system:** Operations · **Depends on:** — · **Reversible:** yes · **Removal:** `DROP_STEP`

| | |
|---|---|
| Gates owned | `parts.external_resolved` |
| Without it | Every part on a job came from the workshop |

Note the owning system: parts that never touch the workshop's own stock are an **Operations** concern, not an Inventory one, which is why `EXTERNAL_PARTS` has no dependency on `INVENTORY` and a diagnostics-only shop can still have it off while a quick-service shop with no stock has it on.

---

### `TEAMS` — *Teams and team leaders*
**Owning system:** People & Performance · **Depends on:** — · **Reversible:** yes · **Removal:** `DROP_STEP`

| | |
|---|---|
| Roles affected | `TEAM_LEADER` (→ `REQUIRE_REASSIGNMENT`) |
| Reports affected | `reports.team.performance` |
| Existing records | `PRESERVE_READ_ONLY` — *who supervised job #123 last year must stay answerable* |
| Without it | Technicians report to the branch manager directly. Past team history stays readable |

---

### `TEAM_REVIEW` — *Team leader review*
**Owning system:** People & Performance · **Depends on:** `TEAMS` · **Reversible:** yes · **Removal:** `REROUTE`

| | |
|---|---|
| Gates owned | `review.team_review_passed` |
| Reports affected | `reports.team.review_time` |
| States disabled | `READY_FOR_TEAM_REVIEW` |
| Existing records | `MIGRATE_TO_TERMINAL` |
| Without it | Finished work goes straight to whatever comes next — QC, invoicing, or delivery |

**Interaction with policy.** The capability means *review is available*; the `TECHNICIAN_DIRECT_SEND` policy decides whether it is *compulsory*. Before policies could reach the graph these were conflated and a workshop with `TEAM_REVIEW` on had review unconditionally forced — see `04_POLICY_SYSTEM.md`.

---

### `QC` — *Quality control*
**Owning system:** Operations · **Depends on:** — · **Reversible:** yes · **Removal:** `REROUTE`

| | |
|---|---|
| Gates owned | `qc.passed` |
| Reports affected | `reports.operations.qc_failures` |
| States disabled | `READY_FOR_QC`, `QC_FAILED` |
| Existing records | `MIGRATE_TO_TERMINAL` |
| Without it | Finished work moves straight on. Past quality records stay readable |

Paired with the `QC_MANDATORY` policy, whose `RISK_FLAGGED_ONLY` option is the product's only per-work-order **fact** condition (`work_order.has_critical_fault`).

---

### `CUSTOMER_PORTAL` — *Customer portal*
**Owning system:** Operations · **Depends on:** — · **Reversible:** yes · **Removal:** `REROUTE`

| | |
|---|---|
| Gates owned | **none** — deliberately |
| Reports affected | `reports.customer.portal_usage` |
| States disabled | `SENT`, `VIEWED`, `PARTIALLY_RESPONDED` (on the decision graph) |
| Replacement edges | `PENDING → RESOLVED` ("approval recorded at counter by staff"), `PENDING → EXPIRED` ("customer never returned") |
| Gates kept | `customer_decisions_resolved`, `critical_warning_acknowledged` |
| Without it | The branch calls the customer and records the answer at the counter, with the same acknowledgement record and the same audit weight |

**The rule this encodes: the STEP is core, the CHANNEL is optional.** Customer approval does not disappear when the portal does; it moves to the counter. `customer_decisions_resolved` is therefore a **core gate with no owner**, not a portal-owned gate. Without the replacement edges, every decision request would strand at `PENDING` and no work could ever be approved.

---

### `FINANCE_CORE` — *Pricing and payment*
**Owning system:** Finance Core · **Depends on:** — · **Reversible:** yes · **Removal:** `EXTERNALIZE`

| | |
|---|---|
| Gates owned | `payment.settled_or_policy_allows` |
| Reports affected | `reports.finance.revenue`, `reports.finance.outstanding` |
| States disabled | `PAYMENT_PENDING` |
| Replacement edges | `IN_PROGRESS → READY_FOR_DELIVERY` (intent `FINISH`), `READY_FOR_TEAM_REVIEW → READY_FOR_DELIVERY` (intent `REVIEW_PASSED`, requires `TEAM_REVIEW`) |
| Orphaned roles | `READ_ONLY_ROLE` |
| Without it | **External Finance Mode.** MOP runs operations; money is handled entirely outside. Delivery must still be reachable, so finish routes straight to delivery readiness |

---

### `BILLING` — *Invoices issued by MOP*
**Owning system:** Billing · **Depends on:** `FINANCE_CORE` · **Reversible:** yes · **Removal:** `EXTERNALIZE`

| | |
|---|---|
| Gates owned | `invoice.issued` |
| Reports affected | `reports.billing.compliance` |
| Historical records | `EXTERNAL_REFERENCE_ONLY` — an issued legal invoice can never be rewritten or removed, only referenced |
| Gates kept | `payment.settled_or_policy_allows` |
| Without it | **External Billing Mode.** MOP tracks charges and payments; the legal invoice is issued elsewhere and its reference recorded. Finance Core is untouched |

That last line is the Finance/Billing split earning its keep: two bounded systems rather than one, precisely so a workshop can externalise the legal document without externalising the money.

---

### `QUICK_INSPECTION` — *Quick inspection*
**Owning system:** Operations · **Depends on:** — · **Reversible:** yes · **Removal:** `DROP_STEP`

| | |
|---|---|
| Gates owned | none |
| Gates kept | `inspection_completed` |
| Without it | Every inspection uses the full form |

Inspection itself is core; Quick Inspection is a *mode* of it. This is why `inspection_completed` is a core gate and `QUICK_INSPECTION` owns nothing.

---

## 5. The gate registry

Twelve gates, two checkpoints. `[IMPLEMENTED]` — `gates.ts`.

### Finish Gate — checked before a technician may finish a job

| Gate | Owner | Blocked message |
|---|---|---|
| `inspection_completed` | **core** | Complete the inspection before finishing. |
| `approved_work_completed` | **core** | Some approved work is still outstanding. |
| `customer_decisions_resolved` | **core** | The customer has not answered every request yet. |
| `critical_warning_acknowledged` | **core** | A critical item was rejected and needs the customer's acknowledgement. |
| `no_open_blocker` | **core** | Resolve or escalate the open blocker before finishing. |
| `parts.received_used_or_returned` | `INVENTORY` | A received part is neither marked used nor returned. |
| `parts.no_pending_return` | `PART_RETURNS` | A return is still waiting for the inventory manager to accept it. |
| `parts.external_resolved` | `EXTERNAL_PARTS` | A customer-supplied or externally-sourced part is still unresolved. |
| `review.team_review_passed` | `TEAM_REVIEW` | Waiting for the team leader's review. |
| `qc.passed` | `QC` | Waiting for quality control to pass. |

### Delivery Gate — checked before a vehicle may leave

| Gate | Owner | Blocked message |
|---|---|---|
| `invoice.issued` | `BILLING` | The final invoice has not been issued. |
| `payment.settled_or_policy_allows` | `FINANCE_CORE` | Payment is outstanding and this workshop does not allow unpaid delivery. |

Every gate carries **both** a `blockedMessage` and a `satisfiedMessage`, because a checklist shows passed rows next to failed ones. Without the second, passing rows were rendered by stripping separators out of the gate key — so a technician read *"Complete the inspection before finishing."* directly above *"parts received used or returned"*, half the list in English and half in database.

## 6. Dependency and conflict graph

```
INVENTORY ──────► MULTI_WAREHOUSE
     └──────────► PART_RETURNS

TEAMS ──────────► TEAM_REVIEW

FINANCE_CORE ───► BILLING

MULTI_BRANCH        (no dependencies)
QC                  (no dependencies)
CUSTOMER_PORTAL     (no dependencies)
EXTERNAL_PARTS      (no dependencies)
QUICK_INSPECTION    (no dependencies)
```

No capability currently declares a conflict. The `conflicts` field exists and is validated; it is simply empty today.

## 7. The change pipeline

`[IMPLEMENTED]` — `apps/api/src/control/capabilities/`, surfaced at `/platform/workshops/:id/capabilities`.

```
draft
  → validate            (reachability proof — VALIDATOR REFUSES rather than warns)
  → live-data preconditions
  → impact preview      ("14 jobs are in Payment Pending; turning this off releases all of them")
  → apply               (one transaction)
  → audit               (capability.changed)
  → rollback available
```

Endpoints: `GET /platform/workshops/:id/capabilities`, `POST …/preview`, `POST …/apply`.

### Validation codes

`MISSING_DEPENDENCY` · `CONFLICT` · `CORE_CAPABILITY_DISABLED` · `STRANDED_STATE` · `DISABLED_STATE_REACHABLE` · `UNKNOWN_STATE_REFERENCE` · `TERMINAL_UNREACHABLE` · `GATE_NOT_OWNED`

## 8. Historical interpretation

`TenantCapability` rows are **time-ranged**, not overwritten. A work order opened three months ago is interpreted against the capability profile that was in force when it opened, not today's.

`[IMPLEMENTED]` `[VERIFIED]` — `CapabilityResolutionService.resolveAsOf()`, consumed by `WorkOrderDossierService` so the dossier drawer renders the workshop shape that was in force when the job opened. This is the same discipline `WorkshopPolicy`, `MessageTemplate`, `PriceCatalogEntry` and `SpecializationDefinition.version` all follow: **current configuration and historical record are different questions.**

## 9. What is not a capability

Recorded here because each was considered and rejected, and re-proposing them wastes a session.

| Candidate | Why it is not a capability |
|---|---|
| "Require customer approval for all work" | Does not change reachability — it is the `APPROVAL_REQUIRED_SCOPE` **policy** |
| "Block delivery until paid" | Same — `DELIVERY_BLOCKED_UNTIL_PAID` **policy** |
| "Allow partial payment" | Same — `PARTIAL_PAYMENT` **policy** |
| "This user can issue parts" | A **permission**, `inventory.request.issue` |
| "This workshop does brakes and suspension" | A **specialisation pack** — see doc 03 |
| "Max 10 branches" | A **plan entitlement** — `Plan.maxBranches`, enforced by `PlanLimitsService` |
| "Theme colour" | Presentation. Belongs to Builder Control, which is `[INTENDED]` — see doc 37 |

## 10. Implementation status summary

| Element | Status |
|---|---|
| Capability model, statuses, `isCapabilityActive` | ✅ `[VERIFIED]` |
| All 12 definitions with complete removal policies | ✅ `[VERIFIED]` |
| Gate registry with ownership + both message forms | ✅ `[VERIFIED]` |
| Reachability validator | ✅ `[VERIFIED]` — every shipped profile validated in CI |
| Workflow router reading the graph | ✅ `[VERIFIED]` |
| Change pipeline (draft→validate→preview→apply→audit) | ✅ `[INTEGRATED]` |
| Historical resolution (`resolveAsOf`) | ✅ `[INTEGRATED]` |
| Super Admin capability-shaping page | ✅ `[INTEGRATED]` — `/platform/workshops/:id/capabilities` |
| Capability set at workshop creation | ✅ `[INTEGRATED]` — onboarding stage `CAPABILITIES` |
| Broader "Builder Control" (theme, layouts, role experience, config version rollback) | 🔴 `[INTENDED]` — see doc 37 |
