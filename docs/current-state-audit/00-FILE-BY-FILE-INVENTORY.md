# 00 — File-by-File Repository Inventory

**Repo:** `aolmaking/MOP` @ `a8c8bb5` · **Audit date:** 2026-08-26 · **Method:** static read; no file modified.
**Sibling reports:** `01`–`15` in this directory assess product behavior; this report maps **what physically exists** and what each important file actually is. Where a verdict here ("complete") refers only to the *file*, never to the feature it participates in.

**Scope stats (verified by recursive count):**

| Area | TS total | production | spec | other |
|---|---:|---:|---:|---|
| `apps/api/src` | 313 | 209 | 104 | – |
| `apps/web/src` | 203 | 148 | 55 | 107 `.html`, 102 `.css` (1:1 with components), `favicon.ico` |
| `packages/shared/src` | 49 | 36 | 13 | – |
| `packages/database/prisma` | 2 seeds | – | – | `schema.prisma`, **31 migrations**, `migration_lock.toml`; `generated/` empty in checkout (Prisma client, gitignored) |
| `tools/` | 10 `.mjs` | – | – | – |
| `docs/` | ~72 `.md` (excl. this audit) | – | – | incl. `archive/`, `detailed-specs/`, `phases/` |
| root/config | 15 files | – | – | CI workflow ×1, docker-compose, env templates, workspace configs |

---

# PHASE 1 — Repository Topology

```
MOP/
├── .github/workflows/ci.yml        single CI workflow
├── apps/
│   ├── api/                        NestJS API (no Dockerfile anywhere in repo)
│   │   ├── src/
│   │   │   ├── main.ts             bootstrap
│   │   │   ├── app.module.ts       root module
│   │   │   ├── audit/              ONLY AuditLog writer (lint-enforced path)
│   │   │   ├── runtime/            config, db, health, http plumbing, scheduler
│   │   │   ├── identity/           auth/ (sessions) + access/ (permission resolver, 11 layers)
│   │   │   ├── control/            capabilities, policies, governance, platform+onboarding, tenant-relationships
│   │   │   ├── systems/            operations, inventory, finance, billing, customer(+messages), people(org/team/specialization), forms
│   │   │   ├── experiences/        branch-manager, owner, team-leader, technician (role composition over systems)
│   │   │   └── insights/           analytics(+saved views/export), analyst-reporting, owner-reports, workflow-health
│   │   ├── package.json / tsconfig.json / eslint config / jest (inline in package.json)
│   └── web/                        Angular 22 application
│       ├── src/app/
│       │   ├── app.ts|config|routes    bootstrap + route table (394 lines)
│       │   ├── runtime/            error interceptor, i18n locale service
│       │   ├── identity/           auth.store, auth.guard, landing resolution, access.api
│       │   ├── ui/                 presentational kit (button, charts x4, directives, toast...)
│       │   ├── domain/             journey strip, dossier drawer, decision-answer (cross-role)
│       │   └── experiences/        platform, branch-manager, technician, inventory, owner,
│       │                           team-leader, analyst, customer, finance, public, home (+shell each)
│       ├── angular.json / proxy.conf.json / tsconfigs / .prettierrc
│       └── public/favicon.ico      ONLY asset (no images/fonts/i18n catalogs ship)
├── packages/
│   ├── shared/                     @mop/shared - pure engines & registries (zero runtime deps)
│   │   └── src/: capabilities(7) policies(6) permissions(3) onboarding(7) operations(6)
│   │               contracts(2) money(1) errors(1) pages(1) platform(2) session(1) index
│   └── database/                   prisma/schema.prisma + migrations/31 + seed.ts + seed-demo.ts
├── tools/                          doctor + pnpm/env shims + 6 custom lint rules
├── docs/                           living docs, phases/, detailed-specs/, archive/{audits,discovery}
├── docker-compose.yml              Postgres dev container only
├── package.json / pnpm-workspace.yaml / pnpm-lock.yaml / .nvmrc(24) / .env.example / .env.test
└── CLAUDE.md CODE_MAP.md CONTRIBUTING.md MERGE_REPORT.md PROJECT_STATE.md README.md REORGANIZATION_REPORT.md
```

**Deployment-related files:** none beyond `ci.yml` + `docker-compose.yml` (Postgres only). No Dockerfile, manifests, Terraform, nginx configs anywhere.

**Generated code:** `packages/database/generated/` (Prisma client) is produced locally and absent from the checkout. Nothing else is generated.

**Assets:** exactly one (`apps/web/public/favicon.ico`).

---

# PHASE 2 — File Classification

Legend used throughout **Phases 3–4**:

- **Class:** domain · service · controller · DTO/contract · authorization · policy · capability · workflow · database · data-access · page · component · api-client · state · shell · shared-ui · utility · test · integration-test · config · tooling · migration · seed/demo · documentation · generated
- **Reach:** ACT actively used · IND indirectly used · T test-only · TOOL tooling-only · UNUSED apparently unused · U uncertain
- **Auth:** DOM authoritative domain logic · PROJ projection/read-model · AD adapter · UI UI representation · H helper · PERS persistence · CFG configuration · FIX test fixture
- **Compl:** C complete · PART partial · STUB stub · PH placeholder · OBS obsolete · DUP duplicated · ? unclear

*(Completeness describes the FILE, not its feature.)*

**Class totals (production files):**

| Class | Count (approx.) | Where |
|---|---:|---|
| capability/workflow/policy engines | 16 | shared/capabilities, policies; api control |
| authorization (layers/resolver/guards) | 17 | api identity |
| services (domain logic) | ~75 | api systems/control/insights/experiences |
| controllers | ~30 | api |
| DTO/validation | ~35 | api |
| modules (Nest wiring) | ~25 | api |
| runtime plumbing | 11 | api runtime + main/app.module |
| onboarding/draft engine + presentation | 6 | shared/onboarding |
| frontend pages | ~55 | web experiences |
| frontend components/drawers | ~20 | web experiences + domain |
| api-clients (frontend) | ~20 | web *.api.ts |
| shells/layouts | 9 | web */shell |
| shared-ui kit | 12 | web ui |
| state stores | 2 | auth.store, onboarding.store (+route-scoped signals elsewhere) |
| utilities | ~18 | both sides |
| tooling scripts | 10 | tools/ |
| migrations | 31 | database/prisma/migrations |
| seeds | 2 | database/prisma |

---

# PHASE 3/4 (part A) — Root, Configuration, Tooling, CI, Database

## A1. Root & configuration files

| File | Class | Responsibility / notes | Reach | Auth | Compl |
|---|---|---|---|---|---|
| `package.json` (root) | config | Workspace scripts all route through `tools/pnpm.mjs`: `doctor`, `db:generate/migrate/deploy/seed/seed:demo/test:prepare`, `typecheck`, `lint` (= eslint + **6 custom linters**), `test`, `build`; `engines.node` 24 | ACT | CFG | C |
| `pnpm-workspace.yaml` / `pnpm-lock.yaml` | config | members: apps/api, apps/web, packages/* | ACT | CFG | C |
| `.nvmrc` | config | `24` (bumped for Angular CLI 22) | ACT | CFG | C |
| `.env.example` / `.env.test` | config | dev DATABASE_URL (`mop_dev:mop_dev_secret`, committed); test adds relaxed throttle limits | TOOL | CFG | C |
| `.gitignore` | config | ignores `.env`, Prisma client | – | CFG | C |
| `docker-compose.yml` | config | **Postgres 16 only**, named volume, pg_isready healthcheck; no app containers | TOOL/dev | CFG | PART (dev-only by design) |
| `README.md` | documentation | product intro; status line (2026-08-21) claims "44/53 complete, 3 missing" — **contradicts** PAGE_INVENTORY's 47/6/0 (see report 01 §5.9) | – | doc | PART (stale status) |
| `PROJECT_STATE.md` (455 L) | documentation | session ledger; §0 entries newest-first; canonical for "where we are"; contains stale known-issues (e.g. #7 technician part-request endpoints — since built) | – | doc | PART (mixed vintages) |
| `CLAUDE.md` | documentation | permanent agent instructions; architecture sketch, 10 invariant rules; some refs stale ("14-phase plan", old paths) | – | doc | PART |
| `CODE_MAP.md` | documentation | directory index + "where do I change X" table | – | doc | C |
| `REORGANIZATION_REPORT.md` | documentation | why the layered structure exists; migration tables; declares structural-only change | – | doc | C |
| `MERGE_REPORT.md` | documentation | record of policy-engine x reorg merge; names POLICY_COVERAGE_MATRIX as stale (still true) | – | doc | C |
| `CONTRIBUTING.md` | documentation | conventional commits, PR rules | – | doc | C |
| `.github/workflows/ci.yml` | tooling | one job: pg16 service → install(frozen) → db:generate → **build:shared** → db:deploy → lint → typecheck → test → build; Node 24/pnpm 9.15; **no artifacts, no deploy**; repo docs state it has never executed | ACT (on push/PR) | tooling | C |

## A2. Tooling — `tools/*.mjs`

| File | L | Responsibility | Weakness noted |
|---|---:|---|---|
| `doctor.mjs` | 223 | env doctor: Node vs .nvmrc, dangling pnpm symlinks (realpath probe), Prisma client staleness (**mtime compare**), .env presence/NUL-corruption, git ownership, Postgres TCP reachability | port probe ≠ DB auth; mtime false-positives after fresh clone |
| `lint-audit-boundary.mjs` | 49 | fail if `.auditLog.(create/createMany/update/updateMany/upsert/delete/deleteMany)` outside `apps/api/src/audit/**`; specs exempt | line-regex: raw SQL writes invisible |
| `lint-directional-css.mjs` | 130 | ban physical left/right CSS in web stylesheets; `/* allow-physical */` escape | inline `[style]` bindings unscanned |
| `lint-money.mjs` | 166 | ban `Number()/parseFloat()` and arithmetic on money-named identifiers; scope = finance/inventory/branch-manager/operations/shared-money | **scope omits `systems/billing`**; name-heuristic bypassable |
| `lint-permission-keys.mjs` | 67 | every literal `access.can(session,"key")` / `require(session,"key")` must exist in the shared manifest | requires literal param named `session`; web side unchecked |
| `lint-touch-targets.mjs` | 88 | technician CSS interactive selectors must declare `min-block-size: var(--tap)` (56px floor) | hardcoded modifier list; only technician scope |
| `lint-no-hard-delete.mjs` | 60 | ban `controlSetting.delete/deleteMany` outside specs (H10) | registry holds exactly one model |
| `with-env.mjs` | 79 | load root/.env or `--mop-env <file>`; real env always wins; explains Prisma schema-relative .env trap | naive parser; `shell:true` spawn |
| `with-port.mjs` | 28 | pin PORT=4000 for api dev (proxy.conf.json depends on it) | duplicates port constant |
| `pnpm.mjs` | 36 | re-invoke pnpm via `npm_execpath` so scripts never need global pnpm | wrong-tool silent fallback risk |

## A3. Database package

### `packages/database/prisma/schema.prisma`
Class: database · Auth: PERS · Compl: C (internally consistent; drift documented below).
**77 models, 40 enums.** Grouped:

- Tenancy/org: Tenant, TenantConfiguration (+Version snapshot), Plan, Branch, Warehouse, BranchWarehouseAccess, TenantGroup(+Member), TenantStakeholder, ControlSetting
- Identity/session: Account, StaffUser, Session, PasswordResetToken, RolePermission, UserPermissionOverride
- Operations: WorkOrder, Task, TaskAssignment, TaskBlocker, Inspection, Fault, WorkOrderPartLine, OperationEvent, WorkOrderNote, relink fields (`relinkedFromWorkOrderId`)
- Inventory: InventoryItem, WarehouseStockBalance, StockMovement, PartRequest (19-state), IssuedItem (non-unique partRequestId => partial fulfilment), PartReturnRequest; SupplierOrder/InventoryTransfer residue (enums/view states only)
- Finance/Billing: RunningInvoice(+Line w/ sourceType/sourceId), Invoice(+Line, lockedUnitPrice snapshots), Payment (unique idempotencyKey), RefundRequest, DiscountRequest, CreditNote, BillingDocument, FinanceConfiguration, PriceCatalogEntry (effective-dated), InvoiceSequence/CreditNoteSequence
- People: Team, TeamMembership, SupervisionNote, SpecializationDefinition/Entry/Revision, Credential, PositionTaxonomyEntry
- Customer: Customer, Asset, AssetOwnershipHistory, CustomerDecisionRequest/Item, CustomerTimelineEvent, SafeTechnicalHistory, MessageTemplate(+versioned rows)
- Governance/analytics/forms: AuditLog, WorkflowIssueAcknowledgement, AnalystSavedView, CustomField, Attachment (**zero consumers**), QuotationItem (**zero consumers**), WorkshopPolicy, TenantCapability (time-ranged)

Money: `Decimal(12,2)` throughout; percentages `(5,2)` only in FinanceConfiguration; currency column only on Tenant. CHECK constraints from init + duplicated set in `20260809203000`. Known schema debts: ~15 child tables carry FK-less `tenantId`; `Session.tenantId` has no FK/index; no `statusChangedAt` column (updatedAt proxy); dead columns (`isFinalized`, `immutableVersion`, `priority`, `hourMeter`).

### Migrations (31) — each with verified purpose

| Migration | Purpose |
|---|---|
| `20260807133953_init` | full initial schema (incl. stock CHECKs, invoice balance CHECK, sequences tables) |
| `…145527_add_tenant_currency_timezone` | Tenant.currency/timezone |
| `20260808000000_add_invite_token_and_tenant_name_normalized` | invite token hash + normalized name |
| `20260808205139_add_part_provenance_and_external_billing` | WorkOrderPartLine.provenance; FinanceConfiguration external flags |
| `20260809054343_add_tenant_capabilities` | time-ranged TenantCapability |
| `20260809063242_add_inspection_declined` | WorkOrder.inspectionDeclined (inspection gate alternative) |
| `20260809063453_add_decision_cancelled` | CustomerDecisionStatus.CANCELLED (**uses ALTER TYPE ADD VALUE**) |
| `20260809195647_issued_items_allow_partial_fulfilment` | drop uniqueness on IssuedItem.partRequestId |
| `20260809203000_stock_never_negative` | 5 bucket CHECKs + movement sign CHECKs (duplicates init set under new names) |
| `20260812164416_return_pending_movement_and_clarification` | RETURN_PENDING movement type + clarification states (**ALTER TYPE ADD VALUE**) |
| `20260812170000_return_pending_may_be_negative` | relax returnPending CHECK |
| `20260812180000_billing_documents_and_credit_notes` | BillingDocument, CreditNote, credit_note_sequences |
| `20260812190000_return_request_warehouse` | PartReturnRequest warehouse binding |
| `20260812200000_supervision_notes` | SupervisionNote |
| `20260813000000_work_order_customer_index` | performance index |
| `20260813010000_specialization_primitives` | specialization definitions/entries/revisions, credentials, taxonomy |
| `20260813020000_phase16_scheduling_sla_attachments` | promisedAt, expectedDurationMinutes, Attachment, blocker reasons |
| `20260813030000_tenant_relationships` | tenant groups/stakeholders |
| `20260813040000_governance_depth` | staff restrictions, disputes, refund reason taxonomy |
| `20260813181933_workshop_policy` | WorkshopPolicy rows |
| `20260813212205_messages_and_custom_fields` | MessageTemplate versions, CustomField |
| `20260813213736_finance_configuration_pricing_fields` | thresholds, visibility, delivery-gate flags |
| `20260813214045_price_catalog_active` | PriceCatalogEntry.isActive |
| `20260819142532_task_service_key` | Task.serviceKey (finance linkage) |
| `20260819172546_workflow_issue_acknowledgement` | WorkflowIssueAcknowledgement |
| `20260820103000_running_invoice_line_source` | sourceType/sourceId traceability on invoice lines |
| `20260821194624_task_actual_minutes` | Task.actualMinutes (TIME_TRACKING policy) |
| `20260821200234_work_order_note` | WorkOrderNote append-only (P-16 addenda) |
| `20260822110000_password_reset_tokens` | PasswordResetToken |
| `20260822123000_analyst_saved_views` | AnalystSavedView |
| `20260822150000_plan_allowed_exports` | Plan.allowedExports |

Deployment note: three migrations use `ALTER TYPE … ADD VALUE` inside Prisma's transaction wrapper => PostgreSQL >= 12 required.

### Seeds

| File | L | Responsibility | Reach | Notes |
|---|---:|---|---|---|
| `seed.ts` | ~600 | base tenants **Apex Motors** (multi-branch) + **Delta Quick Service** (single-bay), plans (allowedExports populated for Reports-enabled plans), 7 roles' RolePermission/RolePage, staff incl. demo manager, warehouses/catalog floors; **no work orders** | TOOL (`db:seed`) | hard-coded credentials `ChangeMe-*`; two shapes by design (isolation provable) |
| `seed-demo.ts` | ~1345 | demo work orders at many lifecycle stages via **`LIFECYCLE_PATHS` + `recordLifecycleHistory()`** writing statuses/events directly ("the same history the lifecycle service would have written"); decisions SENT/RESOLVED, tasks DONE/ASSIGNED/BLOCKED, invoices/payments CLOSED history, parts issued to finished jobs; `$executeRaw` backdating of updatedAt (~L969); validates paths against WORK_ORDER_GRAPH at module scope | TOOL (`db:seed:demo`) | **this fabrication is why demos appear complete** (report 01 §2.2); predictable `secureToken`s |

---
# PHASE 3/4 (part B) — `packages/shared/src` (every file)

All pure TypeScript, zero runtime dependencies. Barrel: `index.ts` (35 module exports). 91 files in `apps/api/src` import `@mop/shared`; web imports the onboarding/operations/policies subsets.

## capabilities/

| File | L | Class | Responsibility | Consumers | Reach | Auth | Compl |
|---|---:|---|---|---|---|---|---|
| `types.ts` | 283 | capability | `CAPABILITY_KEYS`(12), statuses(5, ACTIVE=ENABLED/READ_ONLY/LOCKED), `CapabilityProfile`, `WorkflowTransition/Graph`, `RemovalPolicy` vocabulary, ValidationCodes; **absent key => ENABLED** convention (`isCapabilityActive`) | everything below + api | ACT | DOM | C |
| `registry.ts` | 309 | capability | `CAPABILITY_REGISTRY`: all 12 capabilities w/ deps, affectedRoles, owned gates, removal behavior; every `conflicts:[]` empty; none CORE | validator, router, api control | ACT | DOM | C |
| `gates.ts` | 171 | workflow | `GATE_REGISTRY` 12 gates (5 core undroppable, 7 owned) with `blockedMessage/satisfiedMessage`; `gatesOwnedBy()`, `coreGates()` | evaluator(api), validator, router | ACT | DOM | C |
| `workflow-graphs.ts` | 270 | workflow | `ALL_GRAPHS`: WORK_ORDER_GRAPH(16 states; policy/fact-conditioned edges incl. TECHNICIAN_DIRECT_SEND :116, QC_MANDATORY :124–168, INSPECTION_REQUIRED :50, APPROVAL_REQUIRED_SCOPE :66), PART_REQUEST_GRAPH(15, requires INVENTORY), CUSTOMER_DECISION_GRAPH(7) | router, journey/lanes, seeds | ACT | DOM | C |
| `workflow-router.ts` | 191 | workflow | `effectiveGraph(profile,policies,facts)`, `resolveIntent()` (declaration order = precedence; NO_SUCH_TRANSITION vs INTENT_UNAVAILABLE), `allowedTransitions/canTransition/gatesFor/isTerminal`; unanswered policy => edge stays | **work-order-lifecycle.service.ts:86,196,245** | ACT | DOM | C |
| `validator.ts` | 220 | capability | `validateCapabilityProfile()`: static integrity (deps/conflicts/core/gate-ownership via gate registry) + per-graph BFS reachability => STRANDED_STATE etc.; replacement edges merged ignoring policy/fact conditions (safe over-approximation, documented) | capability-change.service.ts:82; validateDraft; CI profiles test | ACT | DOM | C |
| `profiles.ts` | 71 | capability | 7 shipped starting profiles, all CI-validated | onboarding presentation; tests | IND | CFG | C |
| `permission-capability-map.ts` | 63 | authorization | permission keys -> owning capability (`CAPABILITY_BY_MODULE` + overrides); powers "capability cannot be resurrected by permission" | tenant-capability.layer.ts:31 | ACT | DOM | C |

Specs: `validator.spec.ts`(186, incl. synthetic-core injection), `workflow-router.spec.ts`(154, every shipped profile walks intents to terminal), `gates.spec.ts`(120, ownership invariants).

## policies/

| File | L | Class | Responsibility | Consumers | Reach | Auth | Compl |
|---|---:|---|---|---|---|---|---|
| `types.ts` | 248 | policy | `PolicyDefinition` schema (options/default+reason/relevantWhen/mutability/buildPosture/enforcement declaration/impact); ENFORCED|RECORDED statuses; 3-input relevance scoping of prior answers | registry, resolver(api), onboarding | ACT | DOM | C |
| `registry.ts` | 950 | policy | **16 WorkshopPolicy entries**, all ENFORCED, GOVERNED except TIME_TRACKING/WORKING_WEEK (FREELY); CORE posture only PORTAL_COUNTER_APPROVAL; per-option omissions documented inline; INSPECTION_REQUIRED is the sole entry without a P-number | resolver, onboarding questions, web policy-impact | ACT | DOM | C |
| `validator.ts` | 135 | policy | structural integrity: duplicate keys/options, default in options, reason lengths, unknown deps, **RELEVANCE_CYCLE DFS**; spec pins ENFORCED set == 16 keys | CI | ACT | H | C |
| `graph-safety.ts` | 251 | workflow | `validatePolicyGraphSafety()`: exhaustive profile x option-combo x fact-powerset reachability walk; edge-touching policies pinned to 4; stale-answer filter `relevantPolicyAnswers()` | lifecycle.service.ts:196 consumes filter; CI | ACT | DOM | C |

Specs: `relevance.spec.ts`(127), `graph-safety.spec.ts`(126).

## permissions/

| File | L | Class | Responsibility | Consumers | Reach | Auth | Compl |
|---|---:|---|---|---|---|---|---|
| `permission-manifest.ts` | 188 | authorization | **80 keys** across 9 modules; explicit key->module map (null => deny); `FEATURE_GATED_PERMISSIONS` honestly empty | resolver layers, lint-permission-keys, web access.api | ACT | DOM | C |
| `default-role-permissions.ts` | 169 | authorization | baseline grants for 7 StaffRoles incl. deliberate explicit denials (BM money=false etc.) | platform.service seeding; role-template layer | ACT | CFG | C |
| `delegated-permissions.ts` | 40 | authorization | exactly ONE delegation: `team_setup.branch.manage` <=> ControlSetting `team_setup.delegate` with denial reason | delegation layer, team controllers | ACT | DOM | C |

## onboarding/

| File | L | Class | Responsibility | Consumers | Reach | Auth | Compl |
|---|---:|---|---|---|---|---|---|
| `stages.ts` | 119 | domain | 9 ordered stages + dependency rationale | wizard rail/web stages, draft engine | ACT | DOM | C |
| `draft.ts` | 511 | domain | `WorkshopDraft`; `applyCapabilityChange()` (BFS-up enable / cascade-down disable + stranded-answer pruning); `modulesForProfile()`; `derivedFacts()`; `applicablePolicies()`; minor-unit price rules | platform.service (:217,:223,:345), web onboarding.store | ACT | DOM | C |
| `validator.ts` | 611 | domain | `validateDraft()` BLOCKER/WARNING (~40 codes): slug/currency/E.164 regexes, capability issues lifted from shared validator, warehouse<=>INVENTORY coherence, plan ceilings, operator-orphan, services-need-FINANCE, duplicate codes; same function browser + server | onboarding.service.ts:243 & platform.service.ts:822; web store | ACT | DOM | C |
| `progress.ts` | 127 | domain | derived progress denominators | wizard summary | ACT | PROJ | C |
| `responsibility.ts` | 220 | domain | 3 responsibility questions (BRANCH_MANAGER always asked); `grantsForResponsibilities()` moves positive-only grants, never laundered denials; orphan detection | platform.service:345; wizard stage | ACT | DOM | C |
| `specialization-packs.ts` | 274 | domain | 7 packs / 11 cards metadata mirroring Prisma kinds; `definitionsSeededBy()` dedupe | platform creation step 10 | ACT | CFG | C as metadata (no consumer reads values back — report 04) |
| `presentation.ts` | 294 | UI-helper | exhaustive per-capability/profile copy (compile-checked Record) | wizard copy | ACT | UI | C |

Specs: `draft.spec.ts`(421), `responsibility.spec.ts`(56).

## operations/ (shared projections)

| File | L | Class | Responsibility | Consumers | Reach | Auth | Compl |
|---|---:|---|---|---|---|---|---|
| `workflow-journey.ts` | 215 | workflow | greedy first-declared intent walk producing presented journey stages; label vocabularies x3 audiences | api workflow-journey.service | ACT | PROJ | C |
| `work-order-lanes.ts` | 97 | workflow | 6 lanes exactly partitioning 16 states (`laneForStatus`) | board(api+web) | ACT | PROJ | C |
| `attention-ranking.ts` | 162 | domain | tier scores, escalation hours, weekend-aware `workingHoursBetween` (UTC-day simplification documented) | attention-queue.service | ACT | DOM | C |
| `blocker-routing.ts` | 76 | domain | blocker reason -> audience/urgency map; read side built later per header | technician-work.service | ACT | CFG | PART |
| `categories.ts` | 22 | domain | OPERATING_CATEGORIES mirror of Prisma CategoryCode | intake validation | ACT | CFG | C |

Specs: workflow-journey(164), work-order-lanes(32), attention-ranking(144).

## contracts/, money/, errors/, pages/, platform/, session/

| File | L | Class | Responsibility | Reach | Auth | Compl |
|---|---:|---|---|---|---|---|
| `contracts/events.ts` | 92 | contract | closed union of **45 OperationEvent keys** across systems + envelope | operation-events.service | ACT | contract | C |
| `contracts/cross-system.ts` | 262 | contract | ChargeableWorkItem(+Provenance), InvoiceCandidate/TaxBreakdown, InvoiceIssued+ClearanceStatus, GateResult, TaskPerformanceRecord, `BillingCountryAdapter` seam (**ETA/ZATCA implementers absent**) | finance/billing/operations | ACT (types) | contract | C as types; adapters missing |
| `money/money.ts` | 197 | utility | integer-minor-units arithmetic: half-up-away rounding, discount-before-tax, line-sum totals, balance clamp, compare | ~91 importing files | ACT | DOM | C |
| `errors/api-error.ts` | 8 | utility | error envelope interfaces | filters | ACT | contract | C |
| `pages/page-registry.ts` | 64 | config | ROLE_PAGES nav data; feeds pagesAffected + RolePage seeding | onboarding, platform seeding | ACT | CFG | C |
| `platform/countries.ts` | 224 | config | 127-entry country table -> currency/timezone/working week | identity stage, weekend logic | ACT | CFG | C |
| `platform/workshop-options.ts` | 41 | config | Phase-17.A starter profiles/templates — superseded generation beside packs | onboarding copy grouping only | IND | CFG | OBS-leaning |
| `session/session-context.ts` | 48 | contract | SessionContext shape (permissions[] deliberately empty) | auth both sides | ACT | contract | C |

---

# PHASE 3/4 (part C) — `apps/api/src` · runtime, audit, identity

## Bootstrap & runtime

| File | L | Class | Responsibility / key symbols | Reach | Auth | Compl |
|---|---:|---|---|---|---|---|
| `main.ts` | 66 | config | loadEnvironment (exit 78 on bad env) -> prefix api/v1 -> CORS(credentials, validated origin) -> helmet(defaults) -> cookieParser -> **256kb body cap** -> request-id -> global filter/interceptor/pipe(whitelist+forbidNonWhitelisted+transform) -> shutdown hooks | ACT | CFG | C |
| `app.module.ts` | 80 | config | imports feature modules; APP_GUARD = ThrottlerGuard(global) | ACT | CFG | C |
| `runtime/config/environment.ts` | 102 | config | NODE_ENV enum, DATABASE_URL scheme check, PORT range, **CORS https-and-not-* in prod**, throttle ints | main.ts | ACT | CFG | C |
| `runtime/database/prisma.service.ts` + module | 11/8 | data-access | bare PrismaClient subclass; **no middleware/RLS** — isolation is per-query convention | everywhere | ACT | PERS | C |
| `runtime/health/health.controller.ts` | 21 | controller | GET /health: SELECT 1 + scheduler heartbeat timestamp; public | ACT | H | C |
| `runtime/http/filters/api-exception.filter.ts` | 42 | utility | normalize to ApiErrorDto; generic 500 body; logs stack **without request-id** | global | ACT | H | C |
| `runtime/http/money-serialization.interceptor.ts` | 58 | utility | structural Decimal->string over responses (cycle-safe) | global | ACT | H | C |
| `runtime/http/request-id.ts` | 5 | utility | honor inbound x-request-id <=128 else UUID; echo header | global | ACT | H | C |
| `runtime/http/validation/validation-exception-factory.ts` | 25 | utility | validation_error + per-field messages | global pipe | ACT | H | C |
| `runtime/scheduler/scheduler.module.ts` / `heartbeat.job.ts` | 11/37 | tooling | single @Cron(EVERY_MINUTE) job; publishes lastRunAt for health; boot tick | ACT | H | C |
| `runtime/scheduler/scheduler-lock.service.ts` | 40 | tooling | `pg_try_advisory_xact_lock(hashtext(jobKey))` single-flight across replicas | heartbeat | ACT | H | C |

## audit/ (write boundary)

| File | L | Responsibility | Notes |
|---|---:|---|---|
| `audit.service.ts` | 45 | `record(input, tx?)` — sole production writer of AuditLog (only other `.auditLog.create` hits are specs); tx-aware so audit lands atomically with mutation | enforced by lint-audit-boundary; reads unrestricted elsewhere |
| `audit.module.ts` | 21 | module wiring | – |

## identity/auth

| File | L | Class | Key symbols / behavior | Reach | Auth | Compl |
|---|---:|---|---|---|---|---|
| `auth.controller.ts` | 132 | controller | POST login/refresh/logout; GET me; invite describe/accept; password-reset request/describe/complete; throttle annotations; tenant_unavailable -> 403 | ACT | controller | C |
| `auth.service.ts` | 338 | service | `login()`: findMany OR(email,phone) -> dummy-verify timing safety -> scrypt verify -> lazy rehash (`needsRehash`) -> lockout (app-clock write vs DB-clock read inconsistency). `getSessionContext()` re-resolves DB each request (revoked/expiry via raw SQL NOW()). `rotateSession()` slides 14d expiry (**no absolute cap / reuse detection**). Customer context builder sets role CUSTOMER + landing; `resolveManagedTechnicianIds()`; `teamScope` hardcoded `[]`. LOGIN_BLOCKED_TENANT_STATUSES FROZEN/SUSPENDED/ARCHIVED/PENDING_SETUP | guards/controllers everywhere | DOM | C (with S1/S2 weaknesses — report 11) |
| `token.util.ts` / `password.util.ts` | 44/93 | utility | opaque `<sessionId>.<32-byte-hex>` secrets stored sha256; scrypt N=131072 versioned format + legacy parse | ACT | H | C |
| `cookie.util.ts` | 28 | utility | httpOnly cookies; refresh path-scoped `/api/v1/auth/refresh`; secure iff NODE_ENV=production | ACT | H | C |
| `session.guard.ts` | 27 | authorization | resolves SessionContext fresh per request; else 401 | all staff routes | authorization | C |
| `platform.guard.ts` | 24 | authorization | accountType==="PLATFORM" else 403; bypasses EffectiveAccessService by design | platform surfaces | authorization | C |
| `current-session.decorator.ts` | 5 | utility | param decorator reading request.session | controllers | H | C |
| `invite.service.ts` | 110 | service | describe (POST keeps token out of logs)/accept: sha256 one-time consume, >=12 password, activates, does not sign in | ACT | DOM | C |
| `password-reset.service.ts` | 85 | service | non-enumerating request (randomBytes32 -> sha256, 1h TTL)/describe/complete (consume+unlock) — **no delivery channel exists**, so end-to-end unreachable | endpoints ACT | DOM | PART (transport absent) |
| `dto.ts` | 51 | DTO | login/invite/reset validation (>=12 passwords) | ACT | DTO | C |

HTTP suites here: `auth.controller.integration.spec.ts`(232), `throttle.integration.spec.ts`(61, proves 429), `invite.integration.spec.ts`, `auth.service.integration.spec.ts`.

## identity/access — the permission resolver

| File | L | Class | Key behavior | Reach | Auth | Compl |
|---|---:|---|---|---|---|---|
| `permission-resolver.service.ts` | 102 | authorization | literal ordered array of **11 layers** over deny-by-default DEFAULT_DECISION; null defers; `locked:true` short-circuits. Header comment says "Layers 1-10" — stale numbering | access.controller + ~28 manual call sites | DOM | C |
| `permission-context.service.ts` | 157 | data-access | one REPEATABLE READ tx loading locks+delegations, plan, capability profile, RolePermission rows, UserPermissionOverride rows, roleExperience JSON; no cache | resolver | PERS | C |
| `effective-access.service.ts` | 36 | authorization | facade can()/check()/scope(); **scope() has zero production callers** | can/check used; scope UNUSED | DOM | PART (dead scope path) |
| `scope-resolver.service.ts` | 45 | helper | filterBy() empty-means-nothing semantics — opposite of living convention; **UNUSED in production** | tests only | H | OBS |
| `types.ts` | 36 | contract | PermissionContext/Decision types | layers | contract | C |
| `layers/platform-control.layer.ts` | 19 | authorization | ControlSetting `role_permission_lock` locks any definitive answer | resolver | authorization | C |
| `layers/plan-entitlement.layer.ts` | 25 | authorization | plan allowedModules/allowedExports (special-case analytics.export); locked deny | resolver | authorization | C |
| `layers/tenant-status.layer.ts` | 45 | authorization | fresh session.tenantStatus; READ_ONLY/ARCHIVED => only `.view` keys pass; else locked deny — mid-session freeze works here | resolver | authorization | C |
| `layers/staff-restriction.layer.ts` | 32 | authorization | restriction blocks non-.view keys; **trigger service has no route** | resolver | authorization | C enforcement / trigger MISSING |
| `layers/tenant-capability.layer.ts` | 49 | authorization | DISABLED/EXTERNAL capability => locked deny via shared capability map | resolver | authorization | C |
| `layers/module-enabled.layer.ts` | 21 | authorization | enabledModules locked deny | resolver | authorization | C |
| `layers/feature-enabled.layer.ts` | 23 | authorization | FEATURE_GATED_PERMISSIONS (empty map today) | resolver | authorization | STUB-honest |
| `layers/workshop-configuration.layer.ts` | 24 | authorization | published roleExperience.deniedPermissionKeys narrows-only | resolver | authorization | C |
| `layers/delegation.layer.ts` | 38 | authorization | delegation switches; denied-with-reason unless granted | resolver | authorization | C |
| `layers/role-permission-template.layer.ts` | 27 | authorization | RolePermission rows; never locks (override may win) | resolver | authorization | C |
| `layers/user-override.layer.ts` | 23 | authorization | override rows lock when present | resolver | authorization | C |
| `access.controller.ts` | 33 | controller | GET effective access for current session ("may I?") | web access.api | ACT | controller | C |
| `access.module.ts` | 42 | config | wires layers in order | app | CFG | C |
| `test-support/*` | 42 | FIX | context/session fixtures used by 11 layer specs | specs | FIX | C |

---
# PHASE 3/4 (part D) — `apps/api/src` · control/

## control/capabilities

| File | L | Class | Key behavior | Reach | Auth | Compl |
|---|---:|---|---|---|---|---|
| `capability-resolution.service.ts` | 84 | service | `resolveCurrent(tenantId)` reads latest open TenantCapability rows -> profile; `resolveAsOf()` for point-in-time (dossier) | lifecycle routingContext, permission-context, dossier | ACT | DOM | C |
| `capability-change.service.ts` | 246 | service | preview(): merge + shared validator (:82) + DB blockers (`countAffectedRecords` real stranded WOs/part-requests/decisions, orphaned staff, platform-lock unless actor.isPlatform); apply(): re-preview then tx {close old row, insert new(source, lockedByPlatform, configuredBy, reason), audit HIGH} | capabilities.controller | ACT | DOM | C |
| `capabilities.module.ts` | 17 | config | wiring | app | CFG | C |

## control/policies

| File | L | Class | Key behavior | Reach | Auth | Compl |
|---|---:|---|---|---|---|---|
| `policy-resolution.service.ts` | 195 | policy | resolveValue/resolveCurrent/isRelevant/resolveValueAsOf/set(); set closes+opens WorkshopPolicy rows in tx w/ reason>=10 + audit HIGH — **set/isRelevant/resolveValueAsOf have no production caller; no policies controller exists** (creation is the only writer via PlatformService) | consumers listed in report 05 §2 | reads ACT / writes T-only | DOM | PART (change path unmapped) |
| `dead-consumers.spec.ts` | 70 | test | source-tree scan failing build if an ENFORCED policy's declared consumer disappears | CI | tooling | C |
| `policies.module.ts` | 19 | config | provides PolicyResolutionService app-wide | app | CFG | C |

## control/governance & tenant-relationships

| File | L | Class | Responsibility | Reach | Auth | Compl |
|---|---:|---|---|---|---|---|
| `role-permission-lock.controller/.service(168)/.dto` | 36/168/30 | controller/service | ControlSetting role_permission_lock writer (list/history/set/remove), deactivate-not-delete history, audited | web control-center | ACT | DOM | C |
| `tenant-lifecycle.controller.ts` | 34 | controller | POST archive/reactivate (platform-guarded) | ACT | controller | C |
| `staff-restriction.service.ts` | 95 | service | restrict/lift consumed by StaffRestrictionLayer — **no HTTP route** (spec-only callers) | T-only | DOM | disconnected |
| `work-order-dispute.service.ts` | 67 | service | raise/resolve/forWorkOrder — **no HTTP route** | T-only | DOM | disconnected |
| `tenant-group.service.ts` / `tenant-stakeholder.service.ts` | 57/85 | service | read-only portfolio summary; stakeholder view-grants — **no routes; grants enforced by no layer** | T-only | DOM | disconnected |
| `tenant-lifecycle.service.ts` | 79 | service | archive(archivedAt + retentionUntil default 7y)/reactivate -> READ_ONLY; **does not revoke sessions** (asymmetry vs freeze) | controller | ACT | DOM | C |

## control/platform — creation, workshops, live view, reports

| File | L | Class | Key symbols / behavior | Reach | Auth | Compl |
|---|---:|---|---|---|---|---|
| `platform.service.ts` | **820** | service | createWorkshop(:118) -> attemptCreateWorkshop(:184): global-email uniqueness, assertWithinPlanLimits(:501), assertDraftIsPublishable = shared validateDraft refusing BLOCKERS (:818), P2002 translation, registration-code retry x3; tx steps: Tenant -> TenantConfiguration(enabledModules=modulesForProfile :217,:223) -> TenantCapability deviations -> WorkshopPolicy deviations -> FinanceConfiguration(writeFinanceConfiguration :731 materializes delivery-gate/visibility flags) -> owner Account+StaffUser(inviteTokenHash sha256 14d) -> baseline RolePermission+RolePage for all 7 roles regardless of shape (seedBaselineRolePermissionsAndPages :529–566, rationale comment) -> responsibility grant upserts (:345) -> Branch/Warehouse/BranchWarehouseAccess -> defineCard per pack -> PriceCatalogEntry rows -> TenantConfigurationVersion v1 -> audit HIGH. Also capabilityRowsFor/policyRowsFor. `demoDataEnqueued` echoed flag — nothing enqueues | platform.controller; onboarding | ACT | DOM | C |
| `platform.controller.ts` | 44 | controller | POST workshops (+name/slug/email availability GETs); SessionGuard+PlatformGuard | wizard | ACT | controller | C |
| `create-workshop.dto.ts` | 245 | DTO | full draft validation; money as minor-unit strings; slug regex (H9 proven with U+202E over HTTP) | controller | ACT | DTO | C |
| `workshop-draft.mapper.ts` | 60 | utility | DTO <=> shared WorkshopDraft mapping | create/validate paths | ACT | H | C |
| `onboarding/onboarding.controller.ts`(53)+`onboarding.service.ts`(281)+`validate-draft.dto.ts`(105) | – | controller/service | GET blueprint; POST validate = same shared validateDraft + DB uniqueness checks — **web never calls validate** (browser parity instead) | API exists; UI UNUSED | PROJ | PART (unused client-side) |
| `workshops/workshops.controller.ts`(43)+`workshops.service.ts`(420) | – | controller/service | paged/sorted/filtered list + details drawer aggregates + health warnings; freeze/reactivate conditional-updateMany race-safe (E14) + **revoke ALL tenant sessions on FROZEN/SUSPENDED** (:280–285) + impact preview counting sessions live (:214); subscription renewalDate/MRR honestly null | web workshops page | ACT | DOM | C |
| `workshops/capabilities.controller.ts`(81)+dto(25) | – | controller | POST preview/apply per workshop; reason required on apply | capabilities page | ACT | controller | C |
| `workshops/workshop-health.service.ts` | 60 | projection | per-workshop health signals for drawer | drawer | ACT | PROJ | C |
| `live-view.controller.ts`(13)+`live-view.service.ts`(133) | – | controller/service | cross-tenant read-only counts/event-keys ("the only cross-tenant read"); polling target of Live View page | ACT | PROJ | C |
| `reports/platform-reports.controller.ts`(19)+service(203)+dto(9) | – | controller/projection | Level 1 aggregate grid + Usage Overview (`usageScore` composite off lastActivityAt); five spec sections deliberately absent; aggregateMRR null | platform reports page | ACT | PROJ | PART (declared scope) |
| `plan-limits.service.ts`(+module 15) | 57 | authorization | assert{Branch,Warehouse,User}Capacity counting active rows; 403 naming limit; ongoing ceilings at staff invite + branch/warehouse create | staff.service:118, branch-warehouse:115,186 | ACT | authorization | C |

---

# PHASE 3/4 (part E) — `apps/api/src` · systems/

## systems/operations — the spine

| File | L | Class | Key symbols / behavior | Reach | Auth | Compl |
|---|---:|---|---|---|---|---|
| `intake.service.ts` | 271 | service | `intake()` one $transaction: resolveCustomer (phone-match confirm P-80 :158–191) -> resolveAsset (ownership-transfer confirm :205–249, plan categories) -> workOrder.create(DRAFT) -> optional assignment -> emit(work_order.created incl. customer projection); then **outside tx** lifecycle.apply(REGISTER) (:153) | BM intake controller | ACT | DOM | C |
| `work-order-lifecycle.service.ts` | 232 | workflow | **sole writer of WorkOrder.status.** apply(id,intent,actor,{reason,tx?}): routingContext()(:190)=capabilities+policies filtered by relevantPolicyAnswers+facts; facts = CRITICAL-fault query -> `work_order.has_critical_fault`; resolveIntent; gates.evaluate(FINISH or DELIVERY); guarded updateMany({id,status:from}) -> 409 concurrent_transition; closedAt on CLOSED; emits status_changed in same tx (accepts caller tx, H1). Production intents applied: REGISTER/FINISH/REPORT_BLOCKER/RESOLVE_BLOCKER/REQUEST_PART/PART_RECEIVED/SETTLE_PAYMENT/DELIVER/REVIEW_PASSED/REVIEW_REJECTED/QC_PASSED/QC_FAILED — **START_INSPECTION/REQUEST_APPROVAL/APPROVE/START_WORK/ASK_CUSTOMER/CUSTOMER_RESPONDED have zero production callers** (specs only) | every cycle | ACT | DOM | C engine / chain break documented |
| `gate-evaluator.service.ts` | 207 | workflow | evaluates registry gates w/ liveness (isLive drops gates whose owner capability inactive). inspection count-or-declined; tasks not DONE/CANCELLED==0; decisions not RESOLVED/EXPIRED/CANCELLED==0 (**EXPIRED/CANCELLED never written anywhere**); critical-warning ack; blockers OPEN/ESCALATED==0; three parts gates (one suppressedByPolicy P-08); **review.team_review_passed and qc.passed: hardcoded `return true` (:192–198)** and referenced by no edge; invoice.issued = Invoice row exists (not BillingDocument); payment gate = Decimal balance<=0 OR FinanceConfiguration allowUnpaidDelivery/allowPartialPaidDelivery | lifecycle.apply | ACT | DOM | C except two stub gates (violating own header rule) |
| `chargeable-items.service.ts` | 205 | service | builds ChargeableWorkItem from approved decision items (snapshot prices) + DONE tasks w/ serviceKey (price=null => finance resolves catalogue) + part lines (sellingPrice snapshot) | finance.absorbOperationalItems sole consumer | ACT | contract | C |
| `technician-work.service.ts` | 487 | service | createTask (**no controller caller**); startTask (task-only move, explicit non-lifecycle comment :113); completeTask (TIME_TRACKING OFF discards minutes :192); recordInspection (**fields:{} hardcoded at controller :133**); faults (CRITICAL -> fact); reportBlocker/resolveBlocker FOR UPDATE + escalation routing + REPORT/RESOLVE_BLOCKER moves; finishWorkOrder -> FINISH | technician.controller | ACT | DOM | C given IN_PROGRESS + existing tasks |
| `operation-events.service.ts` | 91 | data-access | emit(): OperationEvent row + AuditService.record + CustomerTimelineEvent via SafeProjection — inside caller's tx | all state changes | ACT | PERS | C |
| `customer-safe-projection.service.ts` | 79 | projection | internal vocab -> customer-safe phrases | events, journey | ACT | PROJ | C |
| `workflow-journey.service.ts` | 640 | projection | forWorkOrder(audience CUSTOMER/TECHNICIAN/MANAGER): behind from status_changed events (JSON-path query :684–705), ahead from effective graph; APPROVAL_REQUIRED_SCOPE hides stage (:168); task-blocker promotion; per-audience labels | 3 journey endpoints | ACT | PROJ | C |
| `journey-facts.service.ts` | 180 | data-access | one gathering of decisions/tasks/parts/blockers/invoice/money(strings) | journey | ACT | PROJ | C |
| `work-order-dossier.service.ts` | 446 | projection | full dossier; cost ABSENT without inventory.cost.view (:94–98); branch-scope == not-found; capabilityDeviationsAtOpen via resolveAsOf; addNote enforces P-16 seal (:126) | BM dossier/notes, owner audit deep-link | ACT | PROJ | C |
| `vehicle-history/asset-history.service.ts` | 127 | service | staff-facing whole-asset story; prior-owner PII excluded (sameOwnerAsCurrent); complaint JSONB query on operation_events | tech + TL vehicle-history endpoints | ACT | PROJ | C |

## systems/inventory

| File | L | Class | Key symbols / behavior | Reach | Auth | Compl |
|---|---:|---|---|---|---|---|
| `stock.service.ts` | 217 | domain/data-access | record(): movement effect table (:12–28) -> upsert balance -> raw SELECT…FOR UPDATE (:145–152) -> refuse after<0 (`insufficient_stock`) -> balance update + StockMovement(beforeQty,afterQty) in caller tx; replay() ledger recompute | issue/returns/warehouse | ACT | DOM | C |
| `part-request.service.ts` | 846 | service | request() requires INVENTORY capability (entity never exists when off) + REQUEST_PART move; approve() P-07 DIFFERENT_PERSON/ROLE_SEPARATED (:131) stamps approvedById on transition-in; issue() one-tx {IssuedItem + stock ISSUE + billable line upsert keyed unique partRequestId w/ price snapshots + ISSUED transition + event + PART_RECEIVED}; partial fulfilment derived; returns: requestReturn/requestClarification/respondToClarification/rejectReturn/resolveRejectedReturn/acceptReturn+completeReturn (RETURN_PENDING reversal at recorded warehouse; unbillReturnedQuantity shrinks/deletes bill line) — **requestReturn/respondToClarification/markArrived have NO controller callers** | inventory.controller; technician parts receive/used | ACT mostly / return-leg origin T-only | DOM | PART reachable surface |
| `catalog.service.ts` | 240 | service | item master CRUD; SKU clash refused; cost absent without permission; quantity never writable here | catalog endpoints | ACT | DOM | C |
| `warehouse.service.ts` | 140 | service | deactivate BLOCK_UNTIL_ZERO (any bucket incl. damaged) HIGH audit; reactivate | endpoints | ACT | DOM | C |
| `inventory-home.service.ts` | 220 | projection | triage cards incl. APPROVED waiting-store count | home endpoint | ACT | PROJ | C |
| `inventory-view.service.ts` | 313 | projection | requests queue (filter incl. unreachable WAITING_TRANSFER/WAITING_SUPPLIER), returns queue, item ledger | requests/item endpoints | ACT | PROJ | C |
| `inventory-reports.service.ts` | 260 | projection | velocity/usage/risk per warehouse; reused by analyst inventory analytics | reports + analytics | ACT | PROJ | C |
| `inventory.controller.ts`(230)+dtos(69/44) | – | controller | full IM surface (report 08 §2) | web inventory | ACT | controller | C |

## systems/finance

| File | L | Class | Key symbols / behavior | Reach | Auth | Compl |
|---|---:|---|---|---|---|---|
| `finance.service.ts` | **1028** | service | addLine(:110, catalogue fallback price_not_in_catalog, immutable after issue); jobTotal -> absorbOperationalItems(:911–1030 idempotent by (runningInvoiceId,sourceType,sourceId), stale-line deletion after returns); issueInvoice(:230): immutability precheck -> absorb -> invoiceTotal(shared) -> enforceDiscountAuthority(:830 NONE/UNLIMITED/THRESHOLD-vs-Decimal amount-or-percent/ALWAYS + matching APPROVED DiscountRequest spend-once) -> P-14 resolved pre-tx(:289) -> tx {atomic nextInvoiceNumber upsert(:1065–1073), lines w/ lockedUnitPrice, event+timeline, billing.issueDocument same-tx}; recordPayment(:419): required idempotencyKey, replay-same-amount OK/different 409, P2002 race recovery, FULL_ONLY refusal, settled -> SETTLE_PAYMENT outside money tx(:525); settlement()(:584) paid=sum−refunds authoritative + refreshCachedTotals reporting columns; refunds request/approve/reject (over-refund vs NET; CreditNote numbered same-tx); discounts request/approve/reject separate permissions | finance.controller | ACT | DOM | C |
| `price-catalog.service.ts` | 169 | service | effective-dated setPrice (close current/open new :132–140), active lookup | pricing endpoints, finance fallback, creation seeding | ACT | DOM | C |
| `finance-configuration.service.ts`(146)+controller(59)+dto(69) | – | service | get/update tax/discounts/methods/invoice settings/**delivery-gate flags**; "Who Can Handle Money deliberately not included" verbatim :54–59; HIGH audit | owner pricing page | ACT | DOM | C (named gap honest) |
| `finance.controller.ts`(129)+`finance.dto.ts`(96) | – | controller | totals/addLine/issue/get/payments/refunds/discounts; money-string regexes | web finance.api (jobTotal unused), take-payment | ACT | controller | C |

## systems/billing

| File | L | Class | Key symbols / behavior | Reach | Auth | Compl |
|---|---:|---|---|---|---|---|
| `billing.service.ts` | 237 | service | issueDocument(candidate,snapshot,tx?,rule="WARN_ONLY"): externalBillingEnabled -> null/no document; refreshCompliantBlocked() upserts compliantBlocked = !external && country NOT IN **ADAPTER_COVERED_COUNTRIES (empty Set :41)** => everyone blocked unless external mode; BLOCK/BLOCK_WITH_OVERRIDE refuse in-tx; adapter.validateInvoice -> BadRequest billing_validation_failed; artifact + submitForClearance + BillingDocument.create(documentNumber, adapter name, mapped clearance, qrPayload, immutable snapshot JSON); issueCreditNote via atomic credit_note_sequences (CN-######) | finance.issueInvoice same-tx | ACT | AD | C as generic; compliance hollow by design |
| `generic-billing-adapter.service.ts` | 98 | adapter | documentNumber=invoiceNumber; clearance synthetic immediate CLEARED(:65–67); QR `{format:"NONE",data:null}`(:73–75); credit/debit note docs | injected default | ACT | AD | C as placeholder-grade honesty |
| `billing.module.ts` + integration spec(365) | 20 | config/test | optional DI seam BILLING_COUNTRY_ADAPTER used by tests to prove swap | – | CFG/T | C |

## systems/customer

| File | L | Class | Key symbols / behavior | Reach | Auth | Compl |
|---|---:|---|---|---|---|---|
| `register.service.ts`(154)+controller(32)+dto(25) | – | service | public code-resolved registration (slug OR code case-insensitive, frozen/suspended/archived excluded), platform-wide email uniqueness, >=12 password, phone-match claim race closed w/ guarded updateMany({accountId:null})(:131–141), Account(CUSTOMER)+Customer one-tx, no auto-login | /public/register | ACT | DOM | C |
| `decision.service.ts` | **685** | service | raiseAndSend(:321 fresh SENT, secureToken randomBytes24, refuses terminal WOs); token auth uniform-404; applyAnswers(:440): terminal-refusal(H4), expiry-refusal(computed), per-item matching, already-answered refusal, server-side critical-ack gate w/ APPROVAL_WEIGHT re-read (:486,693), note<=1000, RESOLVED/PARTIALLY_RESPONDED, event fan-out actorType CUSTOMER, E19 stale-ownership flag + HIGH audit; recordOnBehalf(:406) governed by PORTAL_COUNTER_APPROVAL (+evidence variant), actor always staff, branch-scoped; pricingVisible via customerInvoiceVisible(:685–688). **Never writes VIEWED/EXPIRED/CANCELLED** | public decisions, portal respond, BM approvals record | ACT | DOM | C minus lifecycle-writer gaps |
| `customer-portal.service.ts`(173)+controller(116) | – | service/projection | home/assets/current-service/invoiceStatus/safeHistory/journey; require() bypasses resolver by design (accountType CUSTOMER + enabledModules) — customerId always session-sourced; safe-history scoped by ownership periods | /customer-portal/* | ACT | PROJ | C |
| `messages/message-template-registry.ts`(111)+service(147)+controller(49) | – | service | 8 template keys, immutable versioned rows, publish blocked naming missing vars, preview w/ SAMPLE_DATA, currentBody() **called by nothing** | owner messages page | authoring ACT / sending DISCONNECTED | DOM | PART product chain |

## systems/people & forms

| File | L | Class | Key symbols / behavior | Reach | Auth | Compl |
|---|---:|---|---|---|---|---|
| `organization/staff.service.ts` | 246 | service | invite(Account INVITED + sha256 token + StaffUser, plan capacity, BM-needs-branch/IM-needs-warehouse validation, audit), scope patch, activate/lock dual-write Account+StaffUser one-tx (lock HIGH) | organization controller | ACT | DOM | C |
| `organization/branch-warehouse.service.ts` | 219 | service | branches/warehouses/link-matrix CRUD + PlanLimits asserts (:115,:186); deactivation owned by WarehouseService (no duplication) | org controller | ACT | DOM | C |
| `team/team-setup.service.ts`(343)+controller(74)+dto(27) | – | service | page/createTeam/assignLeader/moveTechnician; leader must hold role+active+in-scope; membership END+CREATE in tx w/ FOR UPDATE on staff_users (H8); uniform not-found; audited; served twice: owner `/organization/teams` (empty scope=all) and delegated BM `/branch/teams` (team_setup.branch.manage) | org + BM team pages | ACT | DOM | C |
| `specialization/specialization.service.ts`(227) / `credential.service.ts`(69) / `position-taxonomy.service.ts`(34) | – | service | defineCard/revision-bump/fillEntry/entriesFor; credentials expiry; taxonomy override semantics — **no controllers; only creation-seeding + specs consume** | platform creation (defineCard) / rest T-only | BACKEND-ONLY | C engines, no surface |
| `forms/form-registry.ts` | 63 | config | 9 fixed forms, locked core fields | custom-fields service | ACT | CFG | C |
| `forms/custom-fields.service.ts` | 230 | service | list/addField(slugified deterministic keys, archived-clash messaging, ordered, audited)/setArchived/validateValues() (live + categoryScope + required + SELECT membership + NUMBER typing; unknown keys dropped) — **validateValues has no production consumer**; inspection receives fields:{} | forms controller (authoring) / validator T-only | authoring ACT / capture DISCONNECTED | PART product chain |
| `forms/forms.controller.ts`(62)+dto(29) | – | controller | GET/POST formKey, PATCH archived (organization.forms.manage) | owner forms page | ACT | controller | C |

---

# PHASE 3/4 (part F) — `apps/api/src` · experiences/ & insights/

## experiences/ (composition layer; never owns rules)

| File | L | Class | Routes / behavior | Reach | Auth | Compl |
|---|---:|---|---|---|---|---|
| `branch-manager/branch-manager.controller.ts` | 395 | controller | attention; intake search/branches/create (scope-checked dto.branchId); work-orders board/detail/journey/dossier/notes(GET+POST — **notes never called by web**); approvals list/detail/record; delivery list; deliver(:346); **advance(:367–400) derives review/qc permission from state and skips workorders.branch.view** | web BM pages | ACT | controller | C (advance scoping finding S3) |
| `branch-manager/work-order-board.service.ts` | 169 | projection | lane grouping via shared lanes; MAX_ROWS=300 (`total`=mapped length ambiguity); scope filter | board/workspace | ACT | PROJ | C |
| `branch-manager/approvals.service.ts`(107) / `delivery.service.ts`(111) | – | projection | chase lists split SENT/never-sent; delivery candidates READY_FOR_DELIVERY|PAYMENT_PENDING + whatIsHoldingIt via availableIntents+previewGates(:101–122) | pages | ACT | PROJ | C |
| `branch-manager/attention-queue.service.ts` | 276 | projection | 7 detectors (report 07 table) ranked by shared scoring; WORKING_WEEK weekend days(:248); emits REVIEW_OVERRUN primaryAction **missing from web union type** | attention endpoint | ACT | PROJ | C |
| `branch-manager/intake-lookup.service.ts` | 124 | projection | unified phone/name/plate search (min q=2, max 8) | intake search | ACT | PROJ | C |
| `owner/owner-home.controller/service` | 22/96 | controller/projection | six cards; three spec cards omitted-not-faked (doc :40–46) | owner home | ACT | PROJ | C |
| `owner/audit.controller.ts`(50)+`audit-query.service.ts`(182) | – | controller/projection | cursor-paged audit query (actorType/category-from-prefix/riskLevel/from/to(**never sent by UI**)/cursor), before/after diffs, categoriesPresent | owner audit page | ACT | PROJ | C |
| `team-leader/team-leader.controller.ts`(75)+service(321)+dto(9) | – | controller/projection | home/technicians/drawer/notes(supervision; escalate never touches WO/task)/work-orders(vehicle-history endpoint **never called by UI**)/reports(all-time, no ranges); strict managedTechnicianIds scope w/ not_your_technician | web TL pages | ACT | PROJ | C |
| `technician/technician.controller.ts`(268)+`technician-work-view.service.ts`(343)+dto(52) | – | controller/projection | active/my-work/work-card/journey/vehicle-history/finish-check(**embedded in card payload; endpoint uncalled**)/parts-catalog; writes start/complete/blocker/inspection(fields:{})/faults/decisions(raise+send one press)/parts request+receive+used/finish; ownership via view.workCard; return-leg actions absent | web technician pages | ACT | controller | PART (no return endpoints) |

## insights/

| File | L | Class | Behavior | Reach | Auth | Compl |
|---|---:|---|---|---|---|---|
| `analytics/analytics.controller.ts` | 144 | controller | home/operations/people/inventory/decisions/feature-adoption/export/:category/saved-views CRUD; per-category permissions; export double-gated (permission + plan.allowedExports membership in-service) | analyst pages | ACT | controller | C |
| `operations-analytics.service.ts` | 256 | projection | volume date_trunc SQL, status distribution, timeInStatus from events, blockers, funnel; never currency | ACT | PROJ | C |
| `people-analytics.service.ts` | 150 | projection | technician stats/reworkRate/team throughput; names yes, currency no (documented boundary) | ACT | PROJ | C |
| `inventory-analytics.service.ts` | 59 | projection | delegates InventoryReportsService; inventoryValue null w/o cost permission | ACT | PROJ | C |
| `decisions-analytics.service.ts` | 110 | projection | approval/rejection rates/response hours/criticalRejections/linkOpenRate; select-shape excludes customer identifiers (comment matches select; test-pinned) | ACT | PROJ | C |
| `feature-adoption-analytics.service.ts` | 71 | projection | inspection/decision counts; honest notTrackable[] for custom fields/messages | ACT | PROJ | C |
| `analytics-home.service.ts` | 90 | projection | composes the five so tiles cannot drift | ACT | PROJ | C |
| `analytics-export.service.ts`(106)+`csv.util.ts`(48) | – | utility | re-runs page build(), generic tree-walker CSV, attachment disposition, LOW audit | export endpoint | ACT | H | C |
| `saved-views.service.ts`(106)+dto/constants | – | persistence | AnalystSavedView ownership-scoped CRUD (sourcePage enum) | saved-views endpoints | ACT | PERS | C |
| `analytics-scope.util.ts` | 27 | helper | resolveScope from StaffUser scopes (empty=unscoped) | analytics services | ACT | H | C |
| `analyst-reporting/reporting.controller/service` | 23/114 | controller/projection | companyReport — **zero web callers** (superseded by analytics) | UNUSED-by-UI | PROJ | OBS-leaning |
| `owner-reports/reports.controller.ts`(100) + overview(213)/operations(321)/financial(264)/inventory(151)/customers(105) services + date-range.util(96)+lifecycle-duration.util(87) | – | controller/projection | five families w/ from/to/branchId/groupBy actually sent by UI; aging approximated (no due-date column); topServices free-text grouping honestly labeled | owner reports page | ACT | PROJ | C |
| `workflow-health/workflow-integrity.service.ts` | 444 | projection | 6 computable checks (PART_ARRIVAL_UNCONFIRMED, CUSTOMER_RESPONSE_NOT_REFLECTED, RETURN_PENDING_REVIEW, TEAM_LEADER_MISSING_REPORT_ACCESS, WORK_ORDER_TASK_STATUS_CONFLICT, ORPHANED_STATUS_CHANGE) + 1 declared notComputable (TenantConfiguration.workflowPolicy JSON unread); acknowledge upsert by fingerprint, no resolve by design | workflow-health endpoints | ACT | PROJ | C |
| `workflow-health/workflow-bottlenecks.service.ts`(162)+`loop-detection.util.ts`(36) | – | projection | stage dwell, WAITING cause attribution map, SLA snapshot off promisedAt, status-loop detection, reopened jobs | bottlenecks endpoint | ACT | PROJ | C |

---
# PHASE 3/4 (part G) — `apps/web/src` (every production file)

Bootstrap: `main.ts`(5) -> `app.config.ts`(15, withComponentInputBinding) -> `app.routes.ts`(**394**, lazy loadComponent everywhere; single authGuard per shell route; wildcard -> guarded fallback shell) -> `app.ts`(20).

## identity/ & runtime/

| File | L | Class | Responsibility | Reach | Auth | Compl |
|---|---:|---|---|---|---|---|
| `identity/auth.store.ts` | 62 | state | signals session/status; bootstrap -> GET /auth/me; login/logout; **no refresh call anywhere** (gap G9) | guards/shells | ACT | state | PART |
| `identity/auth.guard.ts` | 15 | authorization | redirect unauthenticated -> /login?redirectTo=… | all shell routes | ACT | authorization | C |
| `identity/landing.ts` | 24 | utility | server landingPage key -> route table (8 entries); unknown => /access-denied | login flow | ACT | H | C |
| `identity/access.api.ts` | 29 | api-client | GET effective access ("may I?") for nav gating (BranchShell + analyst export only) | 2 consumers | ACT | api-client | C |
| `runtime/http/error.interceptor.ts` | 33 | utility | PresentError normalization; **no 401-refresh retry** | global | ACT | H | PART |
| `runtime/i18n/locale.service.ts` | 61 | utility | en|ar persistence + `<html lang dir>` stamping; **zero translation catalogs exist** (direction-only) | App constructor | ACT | H | PART |

## ui/ (shared kit — presentational, no domain knowledge)

`button.directive`(26) · charts: `kpi-card`(33), `bar-list`(54), `trend-chart`(73), `volume-chart`(79+spec) · `dismiss-on-escape.directive`(38) · `error-banner`(17) · `form-field`(18) · `identifier`(41) · `status-pill`(17 — REORG report lists it as importer-less; U) · `toast-container`(14)+`toast.service`(29). All ACT within pages; authority UI; completeness C.

## domain/ (cross-role concepts)

| File | L | Class | Responsibility | Consumers | Reach | Auth | Compl |
|---|---:|---|---|---|---|---|---|
| `journey/workflow-strip.ts` | 115 | component | pure presentation of PresentedJourney (server decides stages+words); spoken-state text | tech card, BM workspace, customer current-service | ACT | UI | C |
| `journey/journey-poller.ts` | 84 | service | 20s polling, never optimistic, silent background errors | same three | ACT | api-client | C |
| `dossier/dossier-drawer.ts`(67)+`dossier.api.ts`(70) | – | component/api-client | fetch-on-open dossier w/ retry | BM workspace + owner audit deep-links | ACT | UI | C |
| `decisions/decision-answer.ts` | 123 | component | items + approve/reject + critical-ack modal driven by server `requiresAcknowledgement`; knows no HTTP | public decision page, my-decisions, record-approval drawer | ACT | UI | C |

## experiences/platform/

| File | L | Class | Responsibility / calls | Reach | Compl |
|---|---:|---|---|---|---|
| `shell/platform-shell.ts` | 31 | shell | rail Workshops/Control Center/Reports/Live View + logout | ACT | C |
| `workshops/workshops-page.ts`(299)+`platform-workshops.api.ts`(176)+`workshop-drawer.ts`(53) | – | page/api-client/component | paged/sorted/filtered list, drawer, freeze/reactivate dialogs w/ reason + impact preview; availability checks used only by dead add-workshop | ACT | C |
| `onboarding/onboarding-page.ts`(213)+`onboarding.store.ts`(**378**)+`onboarding.api.ts`(122) | – | page/state/api-client | 9-stage wizard; store holds draft in memory + browser-side shared validateDraft computed; publish POST; ProvisioningStep reveal; **validate endpoint wrapped but never called** | ACT | C (persistence absent by design) |
| `onboarding/stages/stage-{identity,plan,capabilities,policies,responsibility,structure,services,specialization,review}.ts` | 43–114 each | page | one stage each; policy stage renders derived question set + impact copy | ACT | C |
| `onboarding/components/{capability-shapes,onboarding-rail,onboarding-summary,policy-impact,publish-sequence,review-consequences}.ts` | 24–51 | component | wizard furniture | ACT | C |
| `capabilities/capabilities-page.ts`(134)+api(52) | – | page | staged changes -> server preview consequences -> apply w/ reason | ACT | C |
| `control-center/control-center-page.ts`(184)+api(64) | – | page | role-locks set/remove/history + archive/reactivate, reason-gated | ACT | C |
| `reports/reports-page.ts`(122)+`workshop-usage-page.ts`(70)+api(60) | – | page | Level 1 grid + usage drawer page | ACT | PART (declared scope) |
| `live-view/live-view-page.ts`(93)+api(39) | – | page | cross-tenant read-only, 30s auto-refresh toggle | ACT | C |
| `add-workshop/add-workshop-page.ts`(164)+`uniqueness.validator.ts`(37)(+specs) | – | page | superseded first-gen creation form — **zero inbound references, not routed** | UNUSED | OBS |

## experiences/branch-manager/

`shell/branch-shell.ts`(67 — nav incl. delegation-gated Team entry via access.can) · `attention-center/attention-center.ts`(139)+`attention.api.ts`(60 — **row act() and watch filterBy() are documented no-ops :127–136; PrimaryAction union missing REVIEW_OVERRUN**) · `intake/intake-page.ts`(242)+`intake.api.ts`(53)+`intake-draft.ts`(84, localStorage 12h versioned) · `approvals/approvals-page.ts`(78)+`approvals.api.ts`(74) · `approvals/delivery-page.ts`(74) · `approvals/record-approval-drawer.ts`(86) · `work-orders/work-orders-board.ts`(106)+`work-order-workspace.ts`(126, journey polling + advance + dossier)+`work-orders.api.ts`(89) · `team/team-setup-page.ts`(166)+`team.api.ts`(55, DI-overridable base path reused by owner). All ACT; completeness C except attention actions.

## experiences/technician/

`shell/technician-shell.ts`(36, bottom nav Now/My work, --tap 56px density) · `tech-now.ts`(53) · `tech-my-work.ts`(47) · `tech-work-card.ts`(**313** — task start/complete w/ time rules, blockers(5 reasons), inspection QUICK/FULL, faults, decision raise returning secureToken, parts request/receive/used, finish-check -> finish; reload-after-write) · `parts-picker.ts`(58) · `technician.api.ts`(159). All ACT; C.

## experiences/inventory/

`inventory.api.ts`(**269**, full IM surface) · home(164) · requests(98, issue capped by shelf qty) · stock(82) · catalog(230, cost-gated) · item(77, ledger-as-page) · returns(**246**, accept/reject/clarify + movements ledger) · reports(94) · shell(34). All ACT; C.

## experiences/owner/

`owner-shell.ts`(41, nine-entry rail) · owner-home-page(116)+api(25) · organization-page(**226**, staff/branches/warehouses/matrix)+api(80) · forms-page(94)+api(58) · messages-page(96)+api(26) · pricing-page(118)+api(50) · reports-page(154)+reports.api(**204**)+sections/{overview 25, operations 72, financial 73, inventory 75, customers 34} · workflow-health-page(198)+api(129) · audit-page(162, direct HttpClient to /audit, cursor append, inline diffs, opens DossierDrawer). All ACT; C as files (product gaps documented in report 07).

## experiences/team-leader/

shell(32) · team-leader-home(117, no-team state) · technicians-page(84)+technician-drawer(52, private note form + escalate) · team-work-orders(51) · team-reports(47) · team-leader.api(62). All ACT; C.

## experiences/analyst/

shell(34) · home(74, composes others) · operations/people/inventory/decisions/feature-adoption pages (42–55 each) · saved-views-page(119) · `export-action.ts`(60, permission-gated blob download) · `saved-view-action.ts`(55) · analyst.api(120 — **sends no date-range params despite API support**). All ACT; C.

## experiences/customer/

shell(39, bottom nav Home/Assets/Service/Invoices/History; Decisions contextual) · portal-home(53) · my-assets(52) · current-service(141, per-job journey strips) · my-decisions(86) · invoice-status(54) · safe-history(61, labels raw assetIds via forkJoin) · decision-page(69, token route + ack modal) · customer-portal.api(77, matches backend 1:1). All ACT; C.

## experiences/finance/, public/, home/

`finance/take-payment.ts`(120)+`finance.api.ts`(57): counter payment keyed by invoiceId, method buttons, per-attempt idempotencyKey regenerated on amount change, conflict-aware — **route /branch/payments/:id exists but nothing links to it** => orphaned screen. Public: `login/login-page.ts`(63), `register/register-page.ts`(111 two-step code flow), `invite/invite-accept.ts`(89), `password-reset/password-reset-page.ts`(76, six states), `access-denied-page.ts`(9), `tenant-frozen-page.ts`(17). Home fallback: `home/shell/shell.ts`(25)+`placeholder-home.ts`(15).

---

# PHASE 5 — Important Relationship Chains

## Working chains (verified both sides)

```
IntakePage --POST /branch-manager/intake--> IntakeService.intake()
    |- Customer/Asset/WorkOrder rows              (one tx)
    |- OperationEventsService.emit -> OperationEvent + AuditLog + CustomerTimelineEvent
    +- Lifecycle.apply(REGISTER) -> resolveIntent(WORK_ORDER_GRAPH, profile...) -> status=REGISTERED
```
```
TechWorkCard "request part" --POST /technician/work-orders/:id/parts--> PartRequestService.request()
    +-tx-> PartRequest row + lifecycle REQUEST_PART attempt + event
InventoryRequests "issue" --POST /inventory/requests/:id/issue--> issue()
    +-tx-> IssuedItem + StockService.record(ISSUE, FOR UPDATE) + WorkOrderPartLine(price snapshot)
           + ISSUED transition + event + PART_RECEIVED move
TechWorkCard receive/used --POST /technician/parts/:id/{receive,used}--> graph legs to USED
```
```
Finance.issueInvoice --tx--> InvoiceSequence atomic upsert -> Invoice+Lines(locked prices)
    |-- BillingService.issueDocument -> GenericBillingAdapter(QR null, synthetic CLEARANCE) -> BillingDocument
    +- event finance.invoice_issued -> CustomerTimelineEvent
DeliveryPage release --POST deliver--> Lifecycle.apply(DELIVER) -> gates re-evaluated
    (invoice.issued <- Invoice row; payment.settled_or_policy_allows <- Decimal balance OR FinanceConfiguration flags)
```
```
Wizard store --(shared validateDraft in-browser)--> publish POST /platform/workshops
    --> PlatformService.attemptCreateWorkshop --tx--> 13 provisioning steps --> AuditLog(HIGH) --> invite link
CapabilityChange.apply --> validateCapabilityProfile(shared) --> time-ranged TenantCapability -->
    next request: TenantCapabilityLayer denies + router drops edges + GateEvaluator.isLive drops owned gates
```

## Disconnected chains (each side real, bridge missing)

| Chain | Break point | Evidence |
|---|---|---|
| Intake -> REGISTERED -> ??? | no caller of START_INSPECTION/REQUEST_APPROVAL/APPROVE/START_WORK; createTask unconsumed | repo-wide greps (report 01 §2.2) |
| TechWorkCard return intent -> requestReturn/respondToClarification | no technician endpoints | controller surface listing |
| Inventory returns queue <- nothing arrives | same break from the other side | part-request.service callers |
| MessageTemplate.currentBody -> any sender | no transport exists | messages module |
| CustomFields.validateValues -> inspection capture | controller sends fields:{} | technician.controller:133 |
| SpecializationDefinition rows -> any reader | defineCard-only at creation | people/specialization has no controllers |
| PolicyResolution.set -> any route | no policies controller | control/policies |
| StaffRestriction / Disputes / TenantGroup / Stakeholder services -> routes | none mounted | governance modules |
| Web auth expiry -> POST /auth/refresh | client never calls refresh | error.interceptor / auth.store |
| TakePayment component -> nav entry | route unreachable | app.routes vs templates |
| Attention primaryAction REVIEW_OVERRUN -> web union type | type omits it | attention-center/attention.api.ts |
| Attachment model -> anything | zero prisma.attachment calls | schema + greps |
| QuotationItem model -> anything | comments only | price-catalog.service.ts:39 comment |
| SUSPENDED status -> writer | login/session-revoke know it; nothing sets it | tenant-lifecycle/changeStatus |
| PasswordReset tokens -> delivery channel | none exists | password-reset.service header |
| Analyst date-range params (API) <- UI params | pages send none | analyst.api.ts:101–127 |

---

# PHASE 6 — Duplication & Orphans (documented, untouched)

1. **Orphaned page:** `experiences/platform/add-workshop/*` (+ its uniqueness.validator) — superseded by onboarding; its availability API methods survive only for it.
2. **Orphaned screen:** `finance/take-payment.*`.
3. **Dead abstraction:** `ScopeResolverService.filterBy()` + `EffectiveAccessService.scope()` — opposite empty-semantics vs the living convention.
4. **Dead session field:** `session.teamScope` hardcoded `[]`.
5. **Legacy metadata:** `platform/workshop-options.ts` starter profiles/templates alongside specialization packs (two generations).
6. **Superseded endpoint:** `GET /reporting/company` (analytics covers the need).
7. **Uncalled endpoints:** BM notes GET/POST, TL vehicle-history, tech finish-check (data embedded in card payload).
8. **Stub gates:** review.team_review_passed and qc.passed hardcoded true AND unreferenced by any edge (double-dead).
9. **Duplicate constraint sets:** five stock CHECKs under two names (init vs 20260809203000).
10. **Dead columns/models:** isFinalized, immutableVersion, priority, hourMeter; Attachment; QuotationItem; view states WAITING_TRANSFER/WAITING_SUPPLIER with no writers.
11. **Unused exports (REORG-confirmed, still present):** SHIPPED_PROFILES external usage, CUSTOMER_DECISION_GRAPH export, several gate helpers — unused surface around live code.
12. **Doc drift cluster:** README vs PAGE_INVENTORY vs PHASE_MAP totals; POLICY_COVERAGE_MATRIX self-inconsistent; stale layer-count labels in resolver headers.
13. **ui/status-pill:** listed by REORGANIZATION_REPORT as importer-less (marked U — kit spec exists).

---

# PHASE 7 — Summary Tables

## Backend (`apps/api/src`, 209 production files)

| Subsystem | Files | Important responsibilities |
|---|---:|---|
| runtime + bootstrap | 13 | env validation(exit 78), Prisma access, health, throttling/global pipe/money interceptor/request-id, heartbeat cron + advisory lock |
| audit | 2 | sole AuditLog writer (lint-enforced boundary) |
| identity/auth | 16 | scrypt+opaque sessions, invite/reset machinery, guards, cookies |
| identity/access | 22 | 11-layer resolver over REPEATABLE READ snapshot; capability<=>permission enforcement |
| control/capabilities+policies | 6 | resolution, change pipeline w/ reachability validation, policy reads (+dead-consumers CI) |
| control/governance+tenant-rel | 10 | role locks, tenant archive/freeze split; 4 services without routes |
| control/platform | 21 | creation mega-tx, workshops lifecycle(freeze race-safe), live view, platform reports, plan limits |
| systems/operations | 15 | intake tx, sole-status-writer lifecycle, gate evaluator, chargeables, technician work, events, journey/dossier projections, asset history |
| systems/inventory | 12 | FOR UPDATE stock ledger, part-request machine(+returns), catalog, warehouse, IM surfaces |
| systems/finance+billing | 11 | absorption, discount authority, issuance(numbering+snapshots+same-tx billing doc), idempotent payments, refunds/credit notes; generic adapter seam |
| systems/customer(+messages) | 12 | public register, decisions(state machine+acks+E19), portal projection, template authoring |
| systems/people+forms | 17 | org/teams/specialization engines/forms registry |
| experiences | 19 | role composition endpoints (BM/Owner/TL/Tech) |
| insights | 27 | analytics x6 + saved views + export, owner-reports x5, workflow-health, legacy reporting |

## Frontend (`apps/web/src`, 148 production TS + 107 html + 102 css)

| Area | Pages | Components/drawers | API clients | Notes |
|---|---:|---:|---:|---|
| platform | 6 | workshop-drawer + 6 onboarding components | 5 | add-workshop orphaned |
| branch-manager | 7 | record-approval-drawer | 4 | attention actions inert |
| technician | 3 | parts-picker | 1 | 56px touch targets |
| inventory | 6 | – | 1 | returns ledger UI complete |
| owner | 8 (+5 report sections) | – | 7 | audit uses raw HttpClient |
| team-leader | 4 | technician-drawer | 1 | managed-scope enforced server-side |
| analyst | 7 | export/saved-view actions | 1 | no range filters sent |
| customer | 6 (+my-decisions) | – | 1 | token path ungated |
| finance/public/home | 1 + 6 + fallback | – | 1 | take-payment orphaned |
| domain/ui/identity/runtime | – | ~16 | 3 | journey strip consumed by 3 roles |

## Database

| Kind | Count | Notes |
|---|---:|---|
| schema | 1 | 77 models / 40 enums / Decimal money / CHECK-guarded stock |
| migrations | 31 | forward-only; 3 use ALTER TYPE ADD VALUE (PG>=12); one duplicated CHECK set |
| seeds | 2 | base (two tenant shapes, no WOs) + demo (**fabricates lifecycle history directly**) |
| generated | 0 in checkout | Prisma client gitignored |

## Tests (172 spec files — what each group proves)

| Group | Files | Proof level |
|---|---:|---|
| shared engines | 13 | exhaustive pure-behavior (profiles reach CLOSED; policy graph safety; money exactness; draft refusals) |
| HTTP-level integration | 7 | real guard chain + DTO rejection + status codes (auth, throttle, access, onboarding, platform, live-view, analytics-export) |
| service-integration (real PG) | ~56 | transactions/constraints/concurrency where they live — NOT routing/guards/error contracts |
| unit w/ fakes | ~41 | branching logic only |
| web component/unit | 51 + 4 | render/state machines; APIs faked at client level |

## Tooling (10 scripts)

Doctor (env truth-serum) · pnpm/env/port shims · 6 build-breaking linters whose blind spots are themselves documented (raw-SQL audit writes; money-lint scope omits billing; literal-`session` requirement; inline-style CSS escape).

---

# PHASE 8 — Limitation of this document

This inventory intentionally does **not** answer "how complete is the product" — that is reports 01–15's job, which rely on it. File-existence ≠ feature-existence throughout: the star examples are `TechnicianWorkService.createTask` (complete file, no consumer), the four early lifecycle intents (defined+routed in the graph, never fired), and every "disconnected chain" in Phase 5.

# PHASE 9 — Evidence & inspection depth

- **Read fully:** every file under `packages/shared/src`; all `apps/api/src` services/controllers listed above (line counts recorded); `app.routes.ts`; both seeds; `schema.prisma`; all 31 migration files; all 10 tools scripts; CI workflow.
- **Inspected at symbol level:** the ~40 files given detailed treatment above (lifecycle, gate evaluator, finance.service 1028L, part-request 846L, decision.service 685L, platform.service 820L, workflow-journey 640L, onboarding validator/store, etc.).
- **Counted, not read line-by-line:** the 107 HTML templates and 102 CSS files (paired with their components; direction/touch-target compliance verified via linter behavior and sampled reads), `pnpm-lock.yaml`, generated configs (tsconfigs, angular.json, eslint/prettier).
- **Reachability claims** come from repo-wide reference greps (symbols, URL fragments, decorator paths) cross-checked between web and api; negatives were confirmed by multiple strategies. Anything not settleable is marked `U`/uncertain rather than asserted.
