# MOP — Master Documentation Index

> **Document ID:** DOC-00
> **Purpose:** the entry point to the whole documentation corpus — what each document is for, who reads it when, and which document is authoritative for which fact.
> **Authority:** NAVIGATIONAL. This file never states a product fact of its own; it points at the document that owns it.
> **Scope:** the entire MOP product and codebase.
> **Last verified:** 2026-09-01, against commit `a8c8bb5` on `main`.
> **Source of truth:** the repository itself, plus the pre-existing documents in `docs/` that this corpus reorganises rather than replaces.
> **Related:** every other document in `docs/corpus/`.

---

## 1. Why this corpus exists

MOP is worked on by several agents and sessions in sequence. Without a corpus, each one begins by rediscovering the same architecture, the same page set, the same policy engine and the same half-built edges — hours of codebase archaeology to reach a starting line that was already reached last week.

This corpus is **coordination infrastructure**, not a report. It is written to be read before work starts and updated as part of the work that changes it.

It documents the **intended product as well as the built one**. That is deliberate and it is dangerous, so it is governed by one rule that has no exceptions:

> **Every claim carries its implementation stage.** Intended behaviour is never written as though it were implemented behaviour.

---

## 2. The stage legend

Two vocabularies, used for two different jobs.

### 2.1 Stage tags — used on individual claims

| Tag | Meaning |
|---|---|
| `[INTENDED]` | The product should do this. Nothing has been designed or built. |
| `[DESIGNED]` | A design record exists (a phase document, a decision record, a spec section). No code. |
| `[IMPLEMENTED]` | Code exists in the repository that does this. |
| `[INTEGRATED]` | The implementation is reachable end-to-end by a real user through a real page and a real endpoint, and its downstream effects land. |
| `[VERIFIED]` | A test or a recorded manual run proves it, named at the claim. |
| `[DEFERRED]` | Consciously not built, with a reason recorded. Not the same as missing. |
| `[UNKNOWN]` | Sources disagree, or nothing in the repository settles it. Must also appear in `37_KNOWN_GAPS_AND_TECHNICAL_DEBT.md`. |

### 2.2 Status marks — used in tables and inventories

| Mark | Meaning |
|---|---|
| ✅ | Implemented, integrated, and covered by tests |
| 🟡 | Partial — a real surface exists, a named piece of the spec does not |
| 🔴 | Planned — specified, nothing built |
| ⚠️ | Implemented but broken, or implemented and unreachable |
| 🧪 | Exists only for tests or seeds |
| 💤 | Deferred with a recorded reason |

### 2.3 The six words that are not synonyms

These are used precisely throughout the corpus. Most false "done" claims in this project's history came from collapsing two of them.

| Word | Means |
|---|---|
| **Intended** | Someone decided the product should do it |
| **Designed** | The shape of the solution is settled and written down |
| **Implemented** | The code exists |
| **Integrated** | A real user reaches it through a real page, and the downstream effect actually lands |
| **Verified** | A test or a recorded run proves it, and the proof is named |
| **Production-ready** | Verified, plus multi-tenant-safe, plus permission-correct, plus audited, plus performant at the sizes §6 of `01_PRODUCT_VISION_AND_PHILOSOPHY.md` names |

The failure this distinction exists to prevent is documented in this project's own history: `PAGE_INVENTORY.md` records four separate systems that were implemented, tested and marked complete while having **no door** — no page, no route, no way for any human to reach them. Implemented is not integrated.

---

## 3. Reading order for a new engineer or agent

**First 20 minutes — no code changes yet.**

1. `01_PRODUCT_VISION_AND_PHILOSOPHY.md` — what MOP is and what it refuses to be
2. `18_SUBSYSTEM_CATALOG.md` — the map of what exists
3. `36_IMPLEMENTATION_STATUS_REGISTER.md` — where the build actually is
4. `40_AGENT_ENGINEERING_GUIDE.md` — the rules you will be held to

**Before touching a subsystem.** Read that subsystem's own document (§4 below), then `22_DATA_INTEGRITY_AND_INVARIANTS.md`.

**Before touching anything that changes a work order's route.** `07_WORK_ORDER_LIFECYCLE.md` and `08_WORKFLOW_ENGINE.md`, in that order.

**Before adding configuration of any kind.** `02_PRODUCT_SCOPE_AND_CAPABILITIES.md` and `04_POLICY_SYSTEM.md` — they define the only two legitimate kinds of workshop-level configuration, and the mechanical test that decides which one you have.

---

## 4. The corpus

### Layer A — Product truth

*What the product is, in the language of the business.*

| # | Document | Owns |
|---|---|---|
| 01 | [`PRODUCT_VISION_AND_PHILOSOPHY.md`](01_PRODUCT_VISION_AND_PHILOSOPHY.md) | Why MOP exists, its principles, its non-goals, how decisions get made |
| 02 | [`PRODUCT_SCOPE_AND_CAPABILITIES.md`](02_PRODUCT_SCOPE_AND_CAPABILITIES.md) | Every capability: what it enables, what its removal rewires |
| 03 | [`SPECIALIZATIONS_AND_WORKSHOP_PROFILES.md`](03_SPECIALIZATIONS_AND_WORKSHOP_PROFILES.md) | Specialisations, packs, and the seven shipped capability profiles |
| 04 | [`POLICY_SYSTEM.md`](04_POLICY_SYSTEM.md) | The policy engine and every policy, with its real runtime consumers |
| 05 | [`RESPONSIBILITY_AND_ROLE_MODEL.md`](05_RESPONSIBILITY_AND_ROLE_MODEL.md) | Roles, responsibilities, and how they differ from permissions |
| 06 | [`DOMAIN_MODEL_AND_ENTITIES.md`](06_DOMAIN_MODEL_AND_ENTITIES.md) | Every domain entity, its owner, its invariants |
| 07 | [`WORK_ORDER_LIFECYCLE.md`](07_WORK_ORDER_LIFECYCLE.md) | Every state and every transition of the central record |
| 08 | [`WORKFLOW_ENGINE.md`](08_WORKFLOW_ENGINE.md) | The machinery underneath: graphs, intents, gates, facts, routing |
| 09 | [`INVENTORY_SYSTEM.md`](09_INVENTORY_SYSTEM.md) | Parts, stock, requests, issues, returns, movements |
| 10 | [`FINANCE_AND_BILLING_SYSTEM.md`](10_FINANCE_AND_BILLING_SYSTEM.md) | Money: pricing, running totals, invoices, payments, refunds |
| 11 | [`CUSTOMER_EXPERIENCE.md`](11_CUSTOMER_EXPERIENCE.md) | The customer's surface and its privacy boundary |
| 12 | [`TECHNICIAN_WORKSPACE.md`](12_TECHNICIAN_WORKSPACE.md) | The technician's whole job, end to end |
| 13 | [`INVENTORY_MANAGER_WORKSPACE.md`](13_INVENTORY_MANAGER_WORKSPACE.md) | The storekeeper's whole job, end to end |
| 14 | [`OWNER_AND_MANAGEMENT_WORKSPACE.md`](14_OWNER_AND_MANAGEMENT_WORKSPACE.md) | Owner, Branch Manager, Team Leader and Platform Super Admin surfaces |
| 15 | [`PAGE_CATALOG.md`](15_PAGE_CATALOG.md) | Every page — built or planned — with route, role and dependencies |
| 16 | [`PAGE_FEATURE_MATRIX.md`](16_PAGE_FEATURE_MATRIX.md) | Page × feature × capability × policy × API × status, in one grid |
| 17 | [`FEATURE_CATALOG.md`](17_FEATURE_CATALOG.md) | The same content indexed by feature rather than by page |

### Layer B — Technical truth

*How the product is built.*

| # | Document | Owns |
|---|---|---|
| 18 | [`SUBSYSTEM_CATALOG.md`](18_SUBSYSTEM_CATALOG.md) | Every subsystem, its boundary, its dependencies |
| 19 | [`API_AND_DOMAIN_COMMAND_CATALOG.md`](19_API_AND_DOMAIN_COMMAND_CATALOG.md) | Every endpoint with its actor, effect and side effects |
| 20 | [`PERMISSION_AND_AUTHORIZATION_MODEL.md`](20_PERMISSION_AND_AUTHORIZATION_MODEL.md) | The eleven-layer resolver and all 80 permission keys |
| 21 | [`AUDIT_AND_TRACEABILITY_MODEL.md`](21_AUDIT_AND_TRACEABILITY_MODEL.md) | What is recorded, by whom, and how a number traces to its records |
| 22 | [`DATA_INTEGRITY_AND_INVARIANTS.md`](22_DATA_INTEGRITY_AND_INVARIANTS.md) | The rules that must never break |
| 23 | [`CONCURRENCY_IDEMPOTENCY_AND_TRANSACTIONS.md`](23_CONCURRENCY_IDEMPOTENCY_AND_TRANSACTIONS.md) | Races, locks, retries, transaction boundaries |
| 24 | [`FRONTEND_ARCHITECTURE.md`](24_FRONTEND_ARCHITECTURE.md) | Angular layout, shells, stores, HTTP, state |
| 25 | [`BACKEND_ARCHITECTURE.md`](25_BACKEND_ARCHITECTURE.md) | NestJS layering and the rules that hold it together |
| 26 | [`DATABASE_SCHEMA_GUIDE.md`](26_DATABASE_SCHEMA_GUIDE.md) | Schema philosophy, ownership, constraints, migrations |
| 27 | [`DESIGN_SYSTEM_AND_UX_PHILOSOPHY.md`](27_DESIGN_SYSTEM_AND_UX_PHILOSOPHY.md) | Why the interface looks and behaves as it does |
| 28 | [`WORKFLOW_UI_MAP.md`](28_WORKFLOW_UI_MAP.md) | Business state → page → control → API → transition |
| 29 | [`INTEGRATION_MAP.md`](29_INTEGRATION_MAP.md) | How subsystems reach each other, and where they must not |
| 30 | [`NOTIFICATIONS_AND_MESSAGING.md`](30_NOTIFICATIONS_AND_MESSAGING.md) | Templates, triggers, and the transport that does not exist yet |
| 31 | [`REPORTING_AND_ANALYTICS.md`](31_REPORTING_AND_ANALYTICS.md) | Every metric and the records it traces to |
| 32 | [`FORMS_CUSTOM_FIELDS_AND_CONFIGURATION.md`](32_FORMS_CUSTOM_FIELDS_AND_CONFIGURATION.md) | Forms, custom fields, and the four kinds of configuration |
| 33 | [`SECURITY_AND_TENANCY_MODEL.md`](33_SECURITY_AND_TENANCY_MODEL.md) | Isolation, authentication, sessions, attack surfaces |

### Layer C — Execution truth

*Where the build actually is, and what governs how it moves.*

| # | Document | Owns |
|---|---|---|
| 34 | [`TESTING_AND_VERIFICATION_STRATEGY.md`](34_TESTING_AND_VERIFICATION_STRATEGY.md) | What each test layer proves and what it does not |
| 35 | [`GOLDEN_JOURNEYS.md`](35_GOLDEN_JOURNEYS.md) | The journeys that must work, with acceptance criteria |
| 36 | [`IMPLEMENTATION_STATUS_REGISTER.md`](36_IMPLEMENTATION_STATUS_REGISTER.md) | Designed / implemented / integrated / verified, per element |
| 37 | [`KNOWN_GAPS_AND_TECHNICAL_DEBT.md`](37_KNOWN_GAPS_AND_TECHNICAL_DEBT.md) | Every known gap, with impact and root cause |
| 38 | [`DECISION_RECORDS.md`](38_DECISION_RECORDS.md) | Architectural and product decisions, with their reasoning |
| 39 | [`GLOSSARY.md`](39_GLOSSARY.md) | MOP-specific vocabulary |
| 40 | [`AGENT_ENGINEERING_GUIDE.md`](40_AGENT_ENGINEERING_GUIDE.md) | How to work on this repository without breaking it |

---

## 5. What is authoritative for what

The most common way a documentation set becomes harmful is two documents tracking the same fact and disagreeing. This project has already lived that: three trackers once held three different page counts (23/53, 34/53, 48/53), each maintained separately, each confidently wrong.

**One canonical owner per fact.** Everything else cites.

| Fact | Canonical owner |
|---|---|
| Page completion count and per-page state | [`../PAGE_INVENTORY.md`](../PAGE_INVENTORY.md) — pre-dates this corpus and remains canonical. `15_PAGE_CATALOG.md` extends it with planned pages and dependency detail, and cites it for status |
| Phase status | [`../PHASE_MAP.md`](../PHASE_MAP.md) Progress table |
| Session history and in-flight work | [`../../PROJECT_STATE.md`](../../PROJECT_STATE.md) |
| The current autonomous work queue | [`../AUTONOMOUS_EXECUTION_STATE.md`](../AUTONOMOUS_EXECUTION_STATE.md) |
| Which capabilities exist and what removing one does | `packages/shared/src/capabilities/registry.ts` — **code, not prose.** Doc 02 describes it |
| Which gates exist and who owns them | `packages/shared/src/capabilities/gates.ts` |
| Which transitions exist | `packages/shared/src/capabilities/workflow-graphs.ts` |
| Which policies exist, their defaults and their real consumers | `packages/shared/src/policies/registry.ts`, asserted against the source tree by `policy-consumers.spec.ts` in CI |
| Which permission keys exist | `packages/shared/src/permissions/permission-manifest.ts`, asserted by `tools/lint-permission-keys.mjs` |
| The data shape | `packages/database/prisma/schema.prisma` |
| Business intent | [`../PRODUCT_SPEC_CANONICAL.md`](../PRODUCT_SPEC_CANONICAL.md) |
| Where to change something | [`../../CODE_MAP.md`](../../CODE_MAP.md) |

Note the shape of that table: for anything that changes behaviour, **the registry in code is canonical and the document describes it.** A prose list of capabilities maintained by hand is a second source of truth that will drift, and drifted lists are how this product previously ended up with two capabilities disagreeing about a shared gate and stranding every work order in a workshop.

---

## 6. Relationship to the pre-existing `docs/`

This corpus does not replace `docs/`. It sits on top of it.

- **`docs/` root documents** (`VISION.md`, `SYSTEMS.md`, `CAPABILITY_MODEL.md`, `PHASE_MAP.md`, `PRODUCT_SPEC_CANONICAL.md`, the engineering charters) remain the deep source material. Corpus documents cite them rather than restating them at length.
- **`docs/phases/`** remains the working record of each phase.
- **`docs/archive/`** is historical. Its status claims are known-stale — two archived audits claimed Platform Governance Controls and Workshop Live View were unbuilt when both were real and working.
- **`docs/detailed-specs/`** is the field-level page specification, one file per role, and remains the source for what a page must contain.

The corpus adds what `docs/` did not have: a single navigable surface, planned-as-well-as-built coverage, per-claim stage labelling, and cross-cutting indexes (page × feature, feature × runtime, subsystem × dependency) that make a gap visible instead of discoverable.

---

## 7. What building this corpus found

Writing a document per subsystem forced a read of the code behind each claim, and that read produced findings no prior document contained. They are recorded in [`37_KNOWN_GAPS_AND_TECHNICAL_DEBT.md`](37_KNOWN_GAPS_AND_TECHNICAL_DEBT.md) with ids, and summarised here because they change what to work on next.

**Six domain commands are implemented, tested, and unreachable over HTTP.**
`resolveBlocker` · `createTask` · `requestReturn` · `respondToClarification` · `markArrived` · `resolveRejectedReturn`. Two consequences stand out: **a blocked job can never be finished** (`no_open_blocker` is a core Finish gate and nothing clears a blocker), and **`Task` rows can only be created by the demo seed** — `createTask` is the only writer of `Task` anywhere.

**Four `PartRequestStatus` values are read by live code and written by nothing.**
`WAREHOUSE_REVIEWING`, `IN_TRANSIT`, `WAITING_TRANSFER`, `WAITING_SUPPLIER` have no graph edge and no writer, yet three services filter and count on them and the technician view carries customer-facing copy for all four.

**The closed domain-event union is not enforced.**
`eventKey` is typed `string`; `OperationEventKey` is imported only by its own spec. Four undeclared keys are emitted today, and **26 of the 45 declared keys are never emitted** — several belonging to flows that are built (stock movements, refunds, credit notes) and simply do not emit.

**Twenty of eighty permission keys have no production consumer**, ten of them by design (`PlatformGuard`, customer sessions) and ten genuinely orphaned.

**Eight Prisma models have no production access at all.**

None of these was found by the test suite, and none would have been: they are all failures of *reachability*, and CI has no mechanism that checks it. That absence is itself recorded, as `G-DEBT-02`.

## 8. Maintaining this corpus

1. **A change that alters behaviour updates its document in the same commit.** A corpus that lags the code is worse than no corpus, because it is believed.
2. **Never upgrade a stage tag without the evidence the tag requires.** `[VERIFIED]` names its test. `[INTEGRATED]` names the page and the endpoint.
3. **Contradictions are recorded, not resolved silently.** If a phase document and the code disagree, that is an entry in `37_KNOWN_GAPS_AND_TECHNICAL_DEBT.md`, not a judgement call made in passing.
4. **Never change product behaviour to make a document look complete.** The document describes the product; it does not get a vote.
