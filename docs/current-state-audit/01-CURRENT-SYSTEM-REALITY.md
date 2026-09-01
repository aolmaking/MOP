# 01 — Current System Reality

**Audit date:** 2026-08-26 · **Repo:** `aolmaking/MOP` @ `a8c8bb5` · **Scope:** full source read (926 files, ~68.8k lines TS), all 79 docs, schema + 31 migrations, both seeds, 172 test files, CI/tooling.
**Companion reports:** see [`README.md`](./README.md) for the map. Every claim below carries file/symbol evidence.

---

## 1. What MOP actually is today (one paragraph, no optimism)

MOP is a **multi-tenant workshop-management platform with an unusually real configuration engine and a genuinely solid foundation — wrapped around an operational core that is broken in its production wiring**. The data model (77 Prisma models), the permission resolver (11 ordered layers, deny-by-default), the capability engine (12 capabilities, reachability validator, runtime workflow router), the policy layer (16 policies with real consumers), workshop creation (9-stage transactional provisioning), auth (scrypt + opaque hashed session tokens + throttling), money handling (Decimal/string discipline, atomic invoice numbering, idempotent payments) and the inventory stock ledger (`SELECT … FOR UPDATE`, DB CHECK constraints, replayable ledger) are **real, tested code — not scaffolding**. But the single most important loop in the product — *customer walks in → job progresses → technician works → job finishes* — **cannot be completed through any HTTP endpoint that exists**: after intake, a work order strands at `REGISTERED` forever, because no production code ever applies the `START_INSPECTION`, `REQUEST_APPROVAL`, `APPROVE` or `START_WORK` lifecycle intents, and no endpoint creates tasks. The demo seed hides this by writing fabricated lifecycle history straight into the database (`packages/database/prisma/seed-demo.ts`, `recordLifecycleHistory()` / `LIFECYCLE_PATHS`). Everything downstream of "job in progress" is real; the bridge into it is missing.

---

## 2. The honest capability statement

### 2.1 Genuinely operational (verified end-to-end over HTTP: UI action → guarded route → service → DB → downstream effect)

| Capability | Evidence chain |
|---|---|
| Login / logout / invite accept / customer registration | `identity/auth/auth.controller.ts` → `auth.service.ts`; scrypt + timing-equalized login; invite token sha256 one-time; public register resolves tenant by slug/code |
| Workshop creation (9-stage wizard) | web `platform/onboarding/*` runs shared `validateDraft()` browser-side → `POST /platform/workshops` → `PlatformService.attemptCreateWorkshop()` — one `$transaction`, 13 provisioning steps, audited |
| Capability preview/apply with reachability check | `control/platform/workshops/capabilities.controller.ts` → `capability-change.service.ts:82` calls shared `validateCapabilityProfile()`; time-ranged `TenantCapability` rows; audit row inside same tx |
| Intake (customer + asset + WO + REGISTER) | `systems/operations/intake.service.ts:intake()` mega-transaction incl. ownership-transfer guard (P-80/E19 behaviour) |
| Technician task execution **once a task exists and the job is IN_PROGRESS** | `experiences/technician/technician.controller.ts`: start/complete/blocker/inspection/fault/finish all hit real services; TIME_TRACKING policy enforced at `technician-work.service.ts:192` |
| Part request request→approve→issue→receive→use (HTTP) | `POST /technician/work-orders/:id/parts` → `/inventory/requests/:id/approve|issue` → `/technician/parts/:id/receive|used`; issue writes stock + billable line in one tx (`part-request.service.ts:173`) |
| Inventory Manager console | full surface in `inventory.controller.ts`: catalog, stock, movements ledger, returns accept/reject/clarify, velocity reports |
| Stock ledger correctness | `stock.service.ts:record()` — FOR UPDATE lock, before/afterQty stored, negative refused + DB CHECKs (`20260809203000_stock_never_negative`) |
| Finance core (API-complete; its only UI screen is orphaned — G11) | running invoice → chargeable-item absorption (`finance.service.ts:absorbOperationalItems`) → discount authority (P-06) → issuance w/ atomic numbering + locked price snapshots + Billing document in-tx → idempotent payments (unique key + P2002 recovery) → partial-payment policy → refunds netting into settlement → credit notes |
| Delivery gate | `gate-evaluator.service.ts:payment.settled_or_policy_allows` reads Decimal balance or FinanceConfiguration flags; `POST /branch-manager/work-orders/:id/deliver` re-evaluates gates server-side |
| Customer decision cycle (ask → answer → consequence) | token link `/public/decisions/:token`, authenticated portal path, staff record-on-behalf (P-18); critical-ack enforced server-side (`decision.service.ts:applyAnswers`); stale-ownership detection (E19) |
| Customer portal reads | home/assets/current-service/invoices/decisions/safe-history — cost & internal data absent from response shapes by construction |
| Owner admin surfaces | organization/staff/branches/warehouses/teams, pricing config + effective-dated catalog, five report endpoints with real date ranges, workflow-health (5 of 6 checks computable), audit query with diffs |
| Analytics + saved views + CSV export | `analytics.controller.ts` 7 routes, plan-gated export, per-category entitlement, audit row on export |
| Platform administration | workshops list/drawer/freeze/reactivate (session-revoking, race-safe E14), archive lifecycle, role-permission locks (enforced by `PlatformControlLayer`), live view (read-only cross-tenant counts), plan ceilings enforced ongoing (`PlanLimitsService`) |

### 2.2 The broken spine (production blocker)

> **A work order created through the UI can never leave `REGISTERED`.**

Evidence:

- Production callers of `WorkOrderLifecycleService.apply()/moveIfPossible()` are exactly: `REGISTER` (intake.service.ts:153), `FINISH` (technician-work.service.ts:239), `REPORT_BLOCKER`/`RESOLVE_BLOCKER` (:439,:491), `REQUEST_PART`/`PART_RECEIVED` (part-request.service.ts:109,:256), `SETTLE_PAYMENT` (finance.service.ts:525), `DELIVER` (branch-manager.controller.ts:346), `REVIEW_PASSED/REVIEW_REJECTED/QC_PASSED/QC_FAILED` (branch-manager.controller.ts:400). Repo-wide grep for `"START_INSPECTION"|"REQUEST_APPROVAL"|"APPROVE"|"START_WORK"|"ASK_CUSTOMER"|"CUSTOMER_RESPONDED"` as lifecycle intents returns **zero production call sites** (integration specs only).
- `TechnicianWorkService.createTask()` has **no controller caller** — there is no endpoint that creates a task. `startTask` explicitly does not move the WO (comment at :113).
- `CustomerDecisionService.applyAnswers()` does not call the lifecycle on approval.
- Consequence chain: intake lands the job at `REGISTERED`; `FINISH` from `REGISTERED` has no graph edge → 409; nothing the technician UI offers can progress it.
- Why demos look complete: `seed-demo.ts` defines `LIFECYCLE_PATHS` and `recordLifecycleHistory()`, writing statuses + OperationEvents directly ("the same history the lifecycle service would have written"). This is precisely the demo-vs-reality split this audit was warned about.

### 2.3 Implemented but disconnected (backend exists, no reachable trigger)

| Item | State |
|---|---|
| Lifecycle intents above | Graph edges exist, tests drive them via direct service calls; no route does |
| Technician part-return leg | `PartRequestService.requestReturn/respondToClarification/markArrived` have zero controller callers; manager side of returns is fully built — the two halves cannot meet over HTTP |
| Policy change after creation | `PolicyResolutionService.set/isRelevant/resolveValueAsOf` have no production caller; **no policies HTTP controller exists** — policies are writable only at creation |
| Staff restriction | `StaffRestrictionService.restrict/lift` — no route, though `StaffRestrictionLayer` enforces it |
| Work-order disputes | `WorkOrderDisputeService.raise/resolve` — no route |
| Tenant groups & stakeholders | `TenantGroupService`/`TenantStakeholderService` — providers only; stakeholder grants consulted by no resolver layer |
| Messages/templates | `MessageTemplateService.currentBody()` built "for whatever eventually sends" — nothing sends; no email/SMS/WhatsApp integration anywhere |
| Forms/custom fields | `CustomFieldsService.validateValues()` unconsumed; inspection recorded with hardcoded `fields: {}` (`technician.controller.ts:133`) |
| Specialization runtime | cards seeded at creation; `SpecializationService.fillEntry/entriesFor`, `CredentialService`, `PositionTaxonomyService` have no controllers/readers |
| Decision VIEWED / EXPIRED / CANCELLED writers | never written by any code (expiry computed on read only); abandoned decisions block the finish gate indefinitely — the sole minute-cron heartbeat job does no sweeps |
| Transfers & supplier orders | movement types + view states (`WAITING_TRANSFER/WAITING_SUPPLIER`) only; no services/endpoints |
| `Attachment` model | zero consumers — no file/photo upload exists |
| Web refresh flow | `POST /auth/refresh` implemented server-side, never called client-side; 20-min access-cookie expiry bounces users to login despite valid refresh cookie |
| Take Payment page | real component at `/branch/payments/:id`, orphaned — no UI links to it |
| Attention Center actions | row buttons are documented no-ops (`attention-center.ts:127–136`) |

### 2.4 Compliance/product blockers beyond the spine

1. **Legal invoicing does not exist.** `GenericBillingAdapter` produces QR `{format:"NONE",data:null}` and synthetic immediate clearance; `ADAPTER_COVERED_COUNTRIES` is an empty set (`billing.service.ts:41`) so **every tenant is `compliantBlocked` unless External Billing Mode**. No Egypt ETA / Saudi ZATCA adapter.
2. **No deployment story**: no Dockerfile for app/web, CI has never executed (self-declared, docs/INFRASTRUCTURE.md:16), no artifacts, no environments.
3. **i18n is direction-only**: RTL plumbing + logical-CSS lint are real; zero translated strings ship.
4. **HTTP-level test coverage ≈ absent outside auth/platform/analytics-export** (7 supertest files vs ~56 service-integration suites).

---

## 3. Subsystem maturity (layered estimates derived from evidence, not a project percentage)

Format: Backend / API+authz wiring / Frontend / Workflow-integration / Production readiness.

| Subsystem | Assessment |
|---|---|
| Identity & sessions | Operational / Operational / Operational / n-a / Near-ready (two findings: access-TTL gap §11) |
| Permission resolution | Operational (11 layers, deny-by-default) / Operational / mirrors backend / n-a / Near-ready |
| Capability engine | Operational (pure, exhaustively tested) / Operational (preview/apply) / Operational / Operational (router consumed by lifecycle) / Ready |
| Policy engine | Operational consumers (16/16 wired) / **Partial — no post-creation setter** / Creation-time only / Operational (4 edge policies rewire graphs) / Partial |
| Workshop creation | Operational / Operational / Operational / Shapes runtime correctly / Ready (draft persistence deliberately absent) |
| Operations spine | Engine operational / **Broken chain REGISTERED→IN_PROGRESS** / Real pages / Partial (strands) / Blocker |
| Technician execution | Operational given IN_PROGRESS + existing tasks / Partial (no task-create, no return leg) / Real / Partial / Blocker (via spine) |
| Inventory | Strong / Strong / Strong / Partial (returns leg unreachable from tech side) / Near-ready |
| Finance Core | Strong / Strong / Take-payment page orphaned / Strong / Near-ready |
| Billing | Partial (generic adapter only) / Strong / none needed / Gate satisfied by Invoice row / **Production blocker (compliance)** |
| Customer portal & decisions | Strong / Strong / Strong / Partial (VIEWED/EXPIRED unwritten; abandoned asks block gate) / Near-ready |
| Messaging | Authoring only / Authoring only / Authoring only / Missing sender / Missing |
| Forms & specialization | Registry+validator only / Registry CRUD only / Authoring only / Disconnected / Missing consumption half |
| Reporting & analytics | Strong / Strong / Strong (no date-range UI) / n-a / Near-ready |
| Governance controls | Partial (locks/archive/freeze real; disputes/restriction untriggerable; SUSPENDED unwritable) / Partial / Partial / n-a / Partial |
| Tenancy isolation | Manual-but-consistent tenantId scoping / Session-sourced IDs / n-a / n-a / Acceptable-with-notes (§11) |
| Testing evidence | Inverted pyramid: strong service-level, thin HTTP / — / component tests shallow-ish / — / Gap |
| Deployment & observability | Architecture-only / — / — / — / Missing |

---

## 4. "Exists" vs "works" vs "production-ready" — the three-tier reading

- **Exists:** nearly everything the docs claim exists really exists. This repo does not fake much; hollow spots are usually labeled in-code ("deliberately not included here", `notComputable[]`, `notTrackable[]`).
- **Works (end-to-end, arbitrary real usage):** roughly the list in §2.1 — but note even those compose into a *full repair cycle* only up to the broken spine; today a complete job can be demonstrated only with seed-fabricated state.
- **Production-ready:** none of it yet, for four reasons independent of features: legal invoicing absent; deployment/observability absent; the execution spine break; and HTTP-layer test coverage too thin to protect the money/stock code during future change.

---

## 5. Most serious risks (ranked)

1. **Execution-spine break** (§2.2) — the product's central promise is unverifiable through its own UI.
2. **Demo-seed masking** — every walkthrough, screenshot and possibly some confidence in phase completion rests on `recordLifecycleHistory()` writing states the product itself cannot reach.
3. **Billing compliance wall** — no market can be legally invoiced; `compliantBlocked=true` everywhere by construction.
4. **Hardcoded-true gates** `review.team_review_passed`, `qc.passed` (`gate-evaluator.service.ts:192–198`) contradict the repo's own "no silent stubs" rule; currently moot because no edge references them, which is its own smell (dead-but-hardcoded).
5. **Policy immutability after creation** — 16 enforced policies with no setter endpoint means misconfiguration at creation is permanent without DB surgery; mutability metadata says GOVERNED but no governed path exists.
6. **Abandoned-decision deadlock** — no expiry/cancel writer + finish-gate counting ⇒ one ignored customer link blocks delivery of that job forever.
7. **Security findings** — stolen access cookie valid up to 14 days (server-side TTL not enforced); refresh rotation slides expiry indefinitely; Team-Leader review-advance path bypasses branch view-scoping (`branch-manager.controller.ts:367–400` + empty-scope convention).
8. **Verification debt** — 500-vs-403 error-contract bugs class unguarded for most controllers (only 7 HTTP specs).
9. **Docs drift as a process risk** — page totals appear as 44/6/3 (README), 47/6/0 (PAGE_INVENTORY), 46/7/0 (PHASE_MAP/PROJECT_STATE); POLICY_COVERAGE_MATRIX contradicts itself and the merge report; Phase 21 declared "documents-only" while a 16-policy runtime registry ships. None of these change the code verdicts above, but they show status reporting cannot currently be trusted without code verification — which is what this audit had to redo.

## 6. What would falsify this report

If any production route can be shown to apply `START_INSPECTION`/`REQUEST_APPROVAL`/`APPROVE`/`START_WORK`, or to create tasks, §2.2 collapses — we grepped intent literals, dynamic-intent call sites (all state-derived, listed in §2.2), and controller surfaces; the negative result held across all three methods.
