# MOP — 14-DAY MARKET-READY PRODUCT SCOPE

**Basis:** current-state audit (reports 00–15) + `16-MASTER-EXECUTION-PLAN.md`, code-verified @ `a8c8bb5`.
**Constraint:** ~14 days · 3 parallel engineering agents (Claude/Opus, Codex on a separate machine, one more OpenCode/ox-alpha).
**Posture:** one real, coherent, market-testable slice — zero throwaway architecture. Scope shrinks; architectural quality does not.

---

## 0. The two audit facts that decide everything

1. **The spine break (G1/G2):** six lifecycle intents (`START_INSPECTION`, `REQUEST_APPROVAL`, `APPROVE`, `START_WORK`, `ASK_CUSTOMER`, `CUSTOMER_RESPONDED`) have zero production callers, and `TechnicianWorkService.createTask()` has no endpoint. Nothing downstream matters until this lands — and everything downstream is already real (report 06).
2. **The compliance wall (G3):** `ADAPTER_COVERED_COUNTRIES` is an empty set; no country adapter exists; every tenant is `compliantBlocked` unless **External Billing Mode**. In 14 days we cannot build a lawful ETA/ZATCA invoice. Therefore the launch product runs **BILLING = EXTERNAL** — an officially designed capability state (`registry.ts`), where MOP owns the *money truth* (charges, running total, payments, settlement, delivery gate) while the legal tax document stays in the workshop's existing process. This is not a hack; it is the seam doing its job.

Everything else in this document is selection, wiring, and polish — not invention.

---

# PART I — THE FOUR STRATEGIES

## Strategy A — Minimum Real Workshop Operating System

| Field | Definition |
|---|---|
| Concept | The absolute smallest product that deserves the name "workshop-management product": one complete workflow made extremely reliable, across the standard role set. |
| Target workshop | Any small independent repair workshop (1–3 bays, 3–8 staff). |
| Target user | Owner-manager who currently runs on paper + WhatsApp. |
| Core promise | "Book it, fix it, approve it, bill it, get paid, hand it back — and every step is true." |
| Journey | Setup → Customer → Vehicle → Work Order → Technician → Inspection → Service/Part → Approval → Work → Billing → Payment → Delivery → CLOSED (verified against report 06: every step exists except the ignition gap and named dead ends). |
| Roles | Platform SA (setup only), Owner, Branch Manager, Technician, Inventory Manager, Customer. Team Leader/Analyst hidden. |
| Pages kept | ~30 of 53: intake, board/workspace, approvals, delivery+payments, work card, inventory console, portal, owner org/pricing/home, workshops+creation (internal). |
| Capabilities | Operations core, FINANCE_CORE, INVENTORY+PART_RETURNS, CUSTOMER_PORTAL, QUICK_INSPECTION, EXTERNAL_PARTS. Off: MULTI_BRANCH, MULTI_WAREHOUSE, TEAMS, TEAM_REVIEW, QC, BILLING(EXTERNAL mode). |
| Policies | Defaults of the 16 enforced; expose ~8 at creation (see §12). |
| Backend must be real | Spine ignition, decision lifecycle writers, returns leg, payments/delivery (already real), auth/session continuity. |
| DB changes | None structural beyond plan items: none required for A itself (intents need no schema). Optional `accessExpiresAt` (security SHOULD). |
| APIs required | 4–6 new endpoints + 2 return endpoints + 1 cancel endpoint (all mapped in Master Plan T1/T2). |
| UI interactions | Work-card contextual primary action; BM add-task/request-approval; attention actions wired; payments links. |
| Explicitly deferred | Specialization behavior, messaging senders, country adapters, governance levers, analyst suite, team leader, i18n strings, platform reports 3–6. |
| Simplified | One branch, one warehouse, review/QC configured off, reports reduced to overview. |
| Must NOT simplify | Money math/idempotency, delivery gate, permission layers, decision ack correctness, stock ledger. |
| Risks | Widest surface of the four → polish spread thin; ~35 pages must at least not embarrass. |
| Impossible in this version | Legal e-invoicing; automatic customer notifications; multi-branch; analytics role. |
| Why 14 days is plausible | 90% of backend already works over HTTP; effort concentrates on ignition (L) + wiring (S items) + sweep. |
| Evolution to full MOP | Turn capabilities back on per workshop; every hidden page already exists. |

## Strategy B — Service-Centric Quick-Service Workshop (vertical)

| Field | Definition |
|---|---|
| Concept | A tight vertical for quick-service/repair shops: the **existing `SINGLE_BAY_QUICK_SERVICE` capability profile** (already CI-validated, already strands nothing) becomes the product. Configuration hides complexity instead of code deletion. |
| Target workshop | Oil/service/tyres/battery/brakes quick shops; small general mechanics. |
| Target user | Counter manager + technicians + waiting customers. |
| Core promise | "From drive-in to drive-out in one system, with the customer approving what you do." |
| Journey | Identical skeleton to A but shorter in practice: walk-in intake → quick inspection → priced recommendation → customer approves (link/portal/counter) → tech executes (services + parts) → running bill → payment → delivery. With REVIEW/QC/TEAMS off, the graph literally routes FINISH straight toward payment/delivery. |
| Roles | Same five as A minus anything TEAMS-dependent. |
| Pages kept | ~22: intake, attention, board/workspace, approvals, delivery(+payment), work card(+parts picker), inventory home/requests/stock/catalog/item/returns, portal×6, owner home/org/pricing, login/register/invite/access/frozen/reset, platform creation/workshops (internal). |
| Capabilities | Exactly the `SINGLE_BAY_QUICK_SERVICE` deviations + PORTAL + EXTERNAL_PARTS + PART_RETURNS(on, with G5 fix) — i.e., a **shipped profile**, not a bespoke fork. |
| Policies | Same ~8 exposed; defaults elsewhere. INSPECTION_REQUIRED=CUSTOMER_MAY_DECLINE fits walk-ins. |
| Backend real | Same as A. |
| DB changes | Same as A (none structural). |
| APIs | Same as A. |
| UI | Same as A minus review/QC surfaces, minus team pages, minus second-branch UX edge cases. |
| Deferred | Everything in A, additionally: review/QC journeys (pages exist, capabilities off), team leader, heavy-equipment categories. |
| Simplified | One operating model; category set can start CARS-only. |
| Untouchable | Same list as A. |
| Risks | Narrowest market story; if the first real prospect is a dealership, fit suffers (answer: enable MULTI_BRANCH/QC later — configuration, not rebuild). |
| Impossible | Same as A. |
| Why 14 days | Smallest polished surface (~22 pages); profile pre-validates the workflow graph; demo narrative crisp. |
| Evolution | This vertical *is* MOP with a profile applied; widening = enabling capabilities that are already built and tested. |

## Strategy C — Configurable Workshop Core

| Field | Definition |
|---|---|
| Concept | Ship the *configurator* as the product: creation wizard + capabilities + a proven policy set produce genuinely different workshops; operations surface minimal. |
| Target user | Super Admin / franchise operator creating many differently-shaped workshops. |
| Core promise | "One platform, many shapes." |
| Journey | Create workshop A (quick-service) and B (full-service) → identical code, different permissions/pages/routing/gates → run the same job through both. |
| Roles/Pages | Creation wizard + the two resulting operational surfaces (still need B-like or A-like floors to be meaningful). |
| Capabilities/Policies | Emphasis: prove 2–3 profiles end-to-end + ~8 policies with visible consequences + responsibility grants. |
| Backend real | Policy setter (G6) would be needed for post-creation change — otherwise C is just… A/B with the wizard front-loaded. |
| DB/API/UI | Wizard exists; policy Matrix UI is new (L). |
| Deferred | Operational depth itself. |
| Risks | **Highest conceptual risk:** configurability without a flawless daily workflow impresses architects, not workshop owners. Audit showed the wizard already works — C's incremental value in 14 days is small. |
| Why 14 days | Wizard + engine already real. |
| Evolution | C's artifacts (exposed-policy set, Matrix UI) fold into M4 naturally. |

## Strategy D — Pilot Workshop Product

| Field | Definition |
|---|---|
| Concept | One named pilot workshop; breadth sacrificed for operational reliability and learning. |
| Target | The one workshop you can physically sit inside. |
| Core promise | "Your week runs on this." |
| Journey | Whatever the pilot actually does (assume quick-service shape → converges on B's journey). |
| Roles/Pages | Exactly who the pilot employs; pages they touch. |
| Capabilities/Policies | Fixed profile chosen with the owner; config frozen behind the scenes. |
| Backend real | B's backend **plus** deployment, HTTPS, backups, basic observability, realistic seeded data, daily-use session continuity. |
| DB changes | Same as A/B. |
| APIs/UI | Same as B, plus whatever the pilot's paper process demands (discoverable only by sitting with them — a schedule risk in itself). |
| Deferred | Everything not used by the pilot in week one. |
| Simplified | No generic onboarding story; Super Admin sets it up manually. |
| Untouchable | Same invariants. |
| Risks | Single-customer feedback loops can distort architecture if indulged; requires pilot commitment inside the 14 days (external dependency). |
| Impossible | Multi-tenant sales readiness (onboarding another workshop mid-flight). |
| Why 14 days | Smallest honest surface; feedback replaces breadth. |
| Evolution | Pilot learnings feed B/A widening; nothing thrown away. |

---

# PART II — COMPARISON & RECOMMENDATION

## Comparison matrix

| Dimension | A Minimal OS | B Quick-Service Vertical | C Configurable Core | D Pilot Product |
|---|---|---|---|---|
| Delivery risk | Medium-High (wide polish surface) | **Low-Medium** | Medium | Low (but external dependency on pilot availability) |
| Product usefulness | High | High (for its segment) | Low-Medium (as a standalone sale) | High (for that one shop) |
| Technical complexity | Medium | **Low-Medium** (profile-driven) | Medium (Matrix UI new) | Low-Medium |
| Code required | ~L ignition + many small wirings + wide UI pass | Same L ignition + **narrower UI pass** | L ignition + Matrix UI (new L) | B + ops scripts |
| Backend depth | High (all cycles) | High where it counts | Medium | High where it counts |
| UI scope | ~30 pages touched | **~22 pages** | ~15 + wizard emphasis | pilot-specific subset |
| Configuration depth | Medium (one default shape) | Medium (one shipped profile) | **High** | Low (frozen) |
| Expandability | Excellent | **Excellent** (enable capabilities later) | Excellent | Good |
| Demo quality | Broad but shallower polish | **Crisp, end-to-end, one story** | Impressive to architects only | Real but private |
| Real customer usability | Good if polish holds | **Best polish-per-page** | Weak alone | Best (bespoke) |
| Production readiness | Needs full ops floor | Needs same ops floor | Least ops pressure | Ops floor mandatory (it IS the pitch) |
| Biggest risk | Polish spread thin | Segment mismatch for early prospects | Selling configuration w/o workflow perfection | Pilot unavailable/uncommitted |

## Recommendation: **Strategy B — the Quick-Service Vertical**, hardened with Strategy D's operational floor.

Rationale against the five optimization targets:
- **Real functionality:** identical working backend to A (the backend doesn't know it's a "vertical" — the profile is configuration).
- **Fast delivery:** fewest pages to make genuinely good; REVIEW/QC/TEAMS-off removes entire stage families from testing burden; the shipped profile is already proven strand-free by CI.
- **Low architectural debt:** hiding = `CapabilityProfile` values + nav/route gating. Zero forks, zero bypasses — the capability engine was built for exactly this.
- **Extensibility:** turning on QC/TEAMS/MULTI_BRANCH later flips configuration and lights up already-built, already-tested pages.
- **Market usefulness:** quick-service is the largest, least-served segment in the discovery docs; one crisp story beats twenty half-stories.

D's floor (deploy, HTTPS, backups, session continuity, honest seed) is absorbed into B's MUST list — a "product in front of real users" without those is a demo.

---
# PART III — THE 14-DAY PRODUCT CONTRACT (Strategy B)

## MUST SHIP (launch fails without these)

| # | Item | Audit trace |
|---|---|---|
| M-1 | Spine ignition: `START_INSPECTION`, `START_WORK` endpoints; decision-service auto-moves (`APPROVE`, `CUSTOMER_RESPONDED`) after `applyAnswers`; BM `request-approval`; task creation endpoint exposing existing `createTask()` | G1/G2, Plan T1.1–T1.2 |
| M-2 | Honesty Harness: HTTP-only walkthrough green on the launch profile (+1 contrasting profile for regression proof) | Plan P0.2 |
| M-3 | Decision lifecycle hygiene: `VIEWED` written on token/portal read; staff **cancel** endpoint; read-computed expiry already exists → gate deadlock eliminated for the pilot's real usage | G4 |
| M-4 | Take Payment reachable (delivery rows + attention READY_UNPAID link) | G11 |
| M-5 | Technician part-return leg (`return`, answer clarification) — parts loop complete or PART_RETURNS capability off | G5 |
| M-6 | Web session refresh flow (20-min logouts make daily use impossible) | G9/S-report |
| M-7 | Launch profile locked: `SINGLE_BAY_QUICK_SERVICE` + PORTAL + EXTERNAL_PARTS + BILLING=EXTERNAL + FINANCE_CORE + INVENTORY(+PART_RETURNS) | Strategy B |
| M-8 | Surface narrowing: hidden routes/nav per §Hidden list; unknown-role landing stays Access-Denied | §Hidden |
| M-9 | Deployment: Dockerfiles, TLS reverse proxy, staging VPS boot, smoke suite green against staging | G19 |
| M-10 | Backups: nightly dump to storage + one scripted restore drill executed | G19/Plan P8.3 |
| M-11 | Basic observability: request-id into logs, error surface to operator, `/health` verified externally | G20-lite |
| M-12 | CI actually running with the full gate on every PR | G19 |
| M-13 | Honest seed: pilot workshop created through the real wizard path; no fabricated open-state lifecycle history in any demo a customer can reach | report 01 §2.2 |
| M-14 | Owner service catalog set up (real services/prices via Pricing page) and one trained admin |

## SHOULD SHIP (trim under pressure, in this order)

S-1 Attention Center row actions wired (G10) · S-2 Security S1/S2 (server-side access TTL, refresh cap) · S-3 Owner Reports overview tab exposed · S-4 Decision expiry sweeper cron (M-3 covers deadlock via cancel+read-expiry otherwise) · S-5 Dossier polish for counter staff · S-6 Platform Reports Level 1 kept internal-only.

## DEFERRED (explicitly out)

Country adapters (T3 post-M5) · messaging senders (T4) · policy setter UI / governance runtime (T5/M4) · specialization consumption (T6) · analyst role & saved views/export UI · team-leader role · multi-branch/multi-warehouse · review/QC journeys (capabilities off) · platform reports sections 3–6 · i18n string pass (RTL layout intact) · attachments/photos · transfers/supplier orders · disputes/staff-restriction routes · realtime.

## FORBIDDEN SCOPE (do not touch this sprint)

`shared/capabilities/*` engine internals & graphs (except *adding nothing*; the launch profile already validates) · permission layer order/resolver · money helpers · gate evaluator semantics (hardcoded-true gates stay untouched-and-unreferenced — removing them is M4 work) · tenant isolation model · audit boundary · Prisma schema beyond zero-to-one additive columns if a SHOULD demands it (prefer none).

---

## The golden journey (every step references reality)

```
SUPER ADMIN (once)
→ /platform/workshops/new (wizard, 9 stages, shared validateDraft browser-side)
→ POST /api/v1/platform/workshops
→ PlatformService.attemptCreateWorkshop() — one $transaction:
   Tenant(status ACTIVE) → TenantConfiguration(enabledModules=modulesForProfile)
   → TenantCapability deviations → WorkshopPolicy deviations → FinanceConfiguration(
     allowUnpaidDelivery=false, allowPartialPaidDelivery=false [P-01 ALWAYS chosen],
     customerInvoiceVisible=true) → owner Account(INVITED)+StaffUser
   → RolePermission+RolePage(7 roles) → responsibility grants → Branch(MAIN)+Warehouse
   → PriceCatalogEntry[] → TenantConfigurationVersion v1 → AuditLog(HIGH)
→ invite link handed over → owner accepts (POST /auth/invite/accept, sha256 one-time)

OWNER (once)
→ /owner/pricing → POST /organization/finance-configuration/catalog {serviceKey, price}
→ effective-dated PriceCatalogEntry rows                      [real: price-catalog.service]
→ POST /organization/staff (invite manager/techs/inventory)    [plan limits enforced]

BRANCH MANAGER — intake
→ /branch/intake: search phone/name/plate (GET /branch-manager/intake/search)
→ POST /branch-manager/intake {customerId?|new, asset{plate,...}|existingId,
   complaint, branchId} [+ confirm flags for phone-match / ownership-transfer]
→ IntakeService.intake() one tx: Customer reuse/create → Asset reuse/create
   (+ownership history) → WorkOrder(DRAFT) → assignment? → OperationEvent
   work_order.created (+AuditLog+CustomerTimelineEvent)
→ lifecycle.apply(REGISTER) ⇒ status REGISTERED                [real today]

TECHNICIAN
→ /tech/work sees job → open card → "Start inspection"
→ POST /technician/work-orders/:id/start-inspection            [NEW → lifecycle.apply(
   START_INSPECTION) ⇒ UNDER_INSPECTION]                        closes G1 part 1
→ records inspection (QUICK/FULL), logs faults (severity CRITICAL ⇒ fact
   work_order.has_critical_fault)
→ adds findings → "Request approval" raises priced recommendation
→ POST /technician/work-orders/:id/decisions                   [exists]
→ CustomerDecisionService.raiseAndSend(): status SENT, secureToken,
   timeline sentence … then NEW moveIfPossible(REQUEST_APPROVAL)
   ⇒ AWAITING_CUSTOMER_APPROVAL                                 [closes G1 part 2]

CUSTOMER
→ opens link /decide/:token (or portal /customer/decisions)
→ GET /public/decisions/:token        → request rendered; VIEWED now written  [NEW, G4]
→ taps APPROVE (critical items require server-enforced acknowledgement)
→ POST /public/decisions/:token/respond
→ applyAnswers(): terminal/expiry checks → critical-ack gate (APPROVAL_WEIGHT)
   → RESOLVED → event fan-out … then NEW moveIfPossible(APPROVE)
   ⇒ APPROVED_FOR_WORK                                          [closes G1 part 3]

TECHNICIAN
→ "Start work" → POST /technician/work-orders/:id/start-work
   ⇒ lifecycle START_WORK ⇒ IN_PROGRESS                         [closes G1 part 4]
→ creates/starts tasks (BM-added via NEW POST /branch-manager/
   work-orders/:id/tasks {title, serviceKey?, assignee?} → createTask())
→ completes tasks (TIME_TRACKING honored); may REPORT/RESOLVE blocker;
   needs a part → POST .../parts → PartRequest(REQUESTED) + REQUEST_PART move
INVENTORY MANAGER
→ /inventory/requests approve → issue: ONE TX = IssuedItem + stock ISSUE
   (FOR UPDATE, before/afterQty) + billable line (price snapshot) + ISSUED
   + PART_RECEIVED move                                        [all real today]
TECHNICIAN
→ receive → used ⇒ part accounted; optional return leg          [NEW endpoints, G5]

FINANCE
→ every DONE task(serviceKey)/approved item/part line is absorbed pull-based
   into the RunningInvoice (idempotent by source keys)          [chargeable-items → finance]
BM/OWNER
→ POST /finance/work-orders/:id/invoice → enforceDiscountAuthority →
   atomic number → Invoice+Lines(locked prices) → external-billing mode
   writes NO document (externalInvoiceReference conceptually elsewhere) [by design]
COUNTER/BM
→ Delivery board shows HELD ("The invoice has not been settled.")
→ Take payment (linked page): POST /finance/invoices/:id/payments
   {amount, method, idempotencyKey} → Payment row, cached totals,
   settlement derived; SETTLE_PAYMENT ⇒ READY_FOR_DELIVERY      [real; linking = M-4]
BM
→ POST /branch-manager/work-orders/:id/deliver → gates re-evaluated
   (invoice issued ✓, settled ✓) ⇒ CLOSED                       [real today]
CUSTOMER
→ portal Current Service flips to completed; Invoice Status settled; safe history updated
```

**Deadlock guards on the golden path:** unanswered asks are cancellable by staff (M-3) and show read-expiry; blockers block FINISH until resolved (correct); abandoned jobs surface on Attention (S-1 if shipped).

---

## Minimum capabilities (each verified against full downstream chain)

| Capability | Status at launch | Permissions | Pages | Workflow | Responsibility | Backend | Customer |
|---|---|---|---|---|---|---|---|
| OPERATIONS core | always-on | workorders.*, task.*, customer_decision.* | board/workspace/card/approvals/delivery | whole graph | BM owns intake/review-of-record | lifecycle/gates/events | journey strip, decisions |
| FINANCE_CORE | ENABLED | finance.* keys as seeded | pricing, payments | PAYMENT_PENDING stage live, settle/deliver edges | Owner money authority (defaults) | running invoice/payments/settlement/refunds | invoice status (own totals only) |
| BILLING | **EXTERNAL** | – | – | invoice.issued satisfied without documents | – | billing suppressed by design | n/a (paper invoice unchanged) |
| INVENTORY | ENABLED | inventory.* (cost.view false default) | IM console ×6 | PART_REQUEST_GRAPH live; parts gates live | storekeeper named at creation (grants) | ledger/FOR UPDATE/CHECKs | n/a internal |
| PART_RETURNS | ENABLED (with M-5) | return accept/reject/clarify | returns queue | return sub-loop live | storekeeper | reversal + unbilling | n/a |
| CUSTOMER_PORTAL | ENABLED | portal bypass-by-design | portal ×6 | SENT/VIEWED/PARTIALLY_RESPONDED live | – | token auth, scoped reads | decisions, invoices, history |
| QUICK_INSPECTION / EXTERNAL_PARTS | ENABLED | – | card options | inspection_completed core; external gate live | – | provenance lines | n/a |
| MULTI_BRANCH / MULTI_WAREHOUSE / TEAMS / TEAM_REVIEW / QC | **DISABLED** | layers deny | pages unreachable | reroutes active (counter edges, straight finish) | single-branch fallback MAIN | validator-proven strand-free | simpler journey |

## Minimum policies (exposed at creation; all consumers verified in code)

| Policy | Question | Options | Storage | Consumer (verified) | Runtime effect | UI consequence |
|---|---|---|---|---|---|---|
| DELIVERY_BLOCKED_UNTIL_PAID | Hold cars until paid? | ALWAYS (**launch default**) / NEVER | WorkshopPolicy deviation → materialized `FinanceConfiguration.allowUnpaidDelivery=false` | `gate-evaluator.service.ts:222–224` | delivery gate requires Decimal balance ≤ 0 | held-reason text on delivery board |
| PARTIAL_PAYMENT | Accept part-payments? | ALLOWED / FULL_ONLY | deviation → `allowPartialPaidDelivery` | pre-settlement check in `finance.service.recordPayment` | short pays refused or accepted | payment form behavior |
| APPROVAL_REQUIRED_SCOPE | Which work needs approval? | ALL_WORK / BEYOND_INITIAL_SCOPE (default) / CRITICAL_ONLY | WorkshopPolicy row | edge condition `workflow-graphs.ts:66` + journey hiding `workflow-journey.service.ts:168` | skip-edge appears/disappears | approval queue volume |
| INSPECTION_REQUIRED | May customers decline inspection? | CUSTOMER_MAY_DECLINE (default) / ALWAYS_INSPECT | row | edge condition `workflow-graphs.ts:50` | walk-in fast path vs forced inspection | intake/card prompts |
| CUSTOMER_INVOICE_VISIBILITY | Show prices before approval? | SHOWN (default) / HIDDEN | row → `customerInvoiceVisible` | `decision.service.ts:685–688` | recommendation hides/shows totals | decision page |
| TIME_TRACKING | Track minutes? | OFF / OPTIONAL (default) / REQUIRED | row | `technician-work.service.ts:192` | minutesSpent captured/discarded/required | card timer field |
| WORKING_WEEK | Weekend definition | FROM_COUNTRY (default) / SEVEN_DAY | row | `attention-queue.service.ts:248` + shared workingHours | SLA escalation timing | attention ordering |
| PORTAL_COUNTER_APPROVAL | Counter approvals allowed? | ALLOWED_ATTRIBUTED (default) / WITH_EVIDENCE / PORTAL_ONLY | row (CORE posture) | `decision.service.ts:406 recordOnBehalf` | desk approval path open/closed | approvals drawer |

All other 8 registered policies remain at defaults, stored-but-unexposed (advanced section collapsed). A launch policy that failed this table's test was dropped.

## Minimum roles & pages

Roles with UI: **Branch Manager, Technician, Inventory Manager, Tenant Owner, Customer** (+ Super Admin internal). Hidden entirely: Team Leader (capability off anyway), Data Analyst.

Page classes: **Operational (must be excellent, ~15):** intake, attention, board, workspace, approvals(+drawer), delivery, take-payment, work card(+picker), inventory requests/stock/item/returns, portal home/current-service/decisions(token+my)/invoices/safe-history. **Admin (functional, ~6):** owner home/org/pricing, login/register/invite/reset/access/frozen. **Internal (kept, marked internal):** creation wizard, workshops list+capabilities, control-center, live-view. **Hidden this sprint:** analyst ×7, team-leader ×4, owner forms/messages/audit*/workflow-health/reports(S-3 optional), platform reports/live-view links from nav, add-workshop orphan (already unrouted).

## What we temporarily hide (hide ≠ delete)

- Nav/route pruning per above; routes remain registered where capability-off already denies them (architecture does the hiding).
- Policies beyond the eight: not offered in wizard UI.
- `compliantBlocked` never shown as an error to pilot staff — external mode means it never triggers.
- Password-reset page stays (endpoints real) but staff invites are hand-delivered links this sprint; reset delivery deferred with messaging.
- Analyst/TL landing keys resolve to Access-Denied by design if anyone logs in.

---

## Three-agent execution split

**Coordination spine (all agents):** worktrees `w1/w2/w3` + own `.env` DBs (`mop_test_w1..w3`); Codex (remote machine) runs its own Postgres container; integration = push to `track/a|b|c`, orchestrator (you + Agent 1 as integrator) merges daily 18:00 into `develop`, runs full gate; **migration ownership exclusively Agent 1**; shared-magnet claims on the board before touching `registry.ts`, `workflow-graphs.ts`, big controllers, `app.routes.ts`.

### Agent 1 — Backend/domain owner (Claude/Opus)
- Scope: M-1 intents+tasks, M-3 decision writers+cancel, M-5 return endpoints, discount/payment support tweaks if surfaced, migration queue, walkthrough tests backend side.
- Files: `systems/operations/{work-order-lifecycle,intake,technician-work,workflow-journey*}`, `systems/customer/decision.service`, `systems/inventory/part-request.service`, new `experiences/**` endpoints, `packages/database/prisma/migrations`.
- Must NOT touch: web UI, `shared/capabilities` internals, money helpers, resolver.
- Acceptance: Honesty Harness green (launch profile + quick-service contrast), intent unit/integration suites, zero linter regressions.
- Checkpoints: nightly push + board status; D7/D12 hard checkpoints.

### Agent 2 — Frontend/UX + role experiences (Codex, remote)
- Scope: work-card contextual actions, BM workspace add-task/request-approval buttons, approvals drawer counter path, delivery/take-payment links, attention wiring (S-1), portal polish pass, **surface-narrowing pass** (nav/route gating, internal flags, hidden pages), empty/error state sweep on operational pages.
- Files: `apps/web/src/app/experiences/**`, minimal api-client additions matching Agent 1 contracts (agreed day 1 in `board/contracts.md`).
- Must NOT touch: API code, shared engines, auth store semantics beyond refresh wiring (owns M-6 interceptor change).
- Acceptance: scripted browser pass of golden journey; every operational page has loading/empty/error/forbidden states; no dead buttons on visible surfaces.
- Checkpoint: daily branch push + screenshots of changed surfaces to board.

### Agent 3 — Integration/infra/testing/support (ox-alpha #2)
- Scope: M-2 harness kit, M-12 CI, M-9 deploy (Dockerfiles/TLS/staging), M-10 backups+drill, M-11 observability-lite, M-13 seed honesty rework, HTTP-kit adoption for existing suites, security S-2 if capacity.
- Files: `tools/`, `.github/workflows`, `apps/api/src/testing/**`, infra configs, `seed*.ts`, targeted spec additions across subsystems (coordinates claims with Agent 1 to avoid same-file edits).
- Must NOT touch: business logic services (except tests), schema.
- Acceptance: green CI URL w/ artifacts; staging URL serving HTTPS smoke-green; restore drill documented with timestamps; seed audit note proving no fabricated open states.

---

# PART IV — Day-by-day plan

| Day | Objective | Backend (A1) | Frontend (A2) | Integration (A3) | Exit criterion |
|---|---|---|---|---|---|
| 1 | Foundations + decisions | Fleet setup; write `board/contracts.md` (endpoint shapes for all NEW endpoints); implement `start-inspection` + `start-work` behind tests | Worktree+DB online; scaffold card primary-action component behind feature flag | CI live (fix whatever breaks); harness red test pinned; staging VPS provisioned | Red walkthrough committed; first two intents merged to develop |
| 2 | Ignition core | Task-creation endpoint; REQUEST_APPROVAL move in raiseAndSend; decision auto-move APPROVE + CUSTOMER_RESPONDED in applyAnswers (outside answer tx, refusal-swallowing) | Card actions wired (inspection/start/request/approve-state aware); workspace Add-task modal | Dockerfiles built; first staging boot attempt; per-agent DB matrix verified | Unit+integration green for 5 intents; screenshots of card states |
| 3 | Approval loop E2E | BM request-approval endpoint; decision CANCEL endpoint; VIEWED write on read | Approvals drawer counter-path verify; portal decisions polish; refresh interceptor (M-6) landed | Staging HTTPS alive; smoke script v1 (login→intake→…→REGISTERED) | Walkthrough reaches AWAITING_CUSTOMER_APPROVAL→APPROVED_FOR_WORK over HTTP |
| 4 | Golden path attempt #1 | START_WORK wired end; fix fallout from full-chain test | Board/workspace integration of new actions; take-payment links (delivery rows) | Full walkthrough script runs against staging; backup script drafted | **Walkthrough green through CLOSED on launch profile (backend)** |
| 5 | Parts completeness | Return-leg endpoints (`/technician/parts/:id/return`, clarification answer) | Card return/clarify actions; returns queue sanity pass | Restore drill executed once (documented); request-id into logs | Parts round-trip HTTP test green incl. unbilling |
| 6 | Surface narrowing | Support hidden-surface needs (e.g., internal flags on platform endpoints if any) | **Nav/route pruning per Hidden list**; internal badges on platform pages; error/empty sweep begins | Seed honesty rework: pilot demo driven through real services; `recordLifecycleHistory` restricted to CLOSED | Visible surface contains zero dead buttons; seed audit note |
| 7 | **Checkpoint 1 (hard)** | Merge debt; regression triage; freeze scope changes | Polish pass on operational 15 | Full gate + walkthrough ×2 profiles on staging; go/no-go on SHOULD list | All MUST items status GREEN or re-planned in writing |
| 8 | Money & owner flows | Discount/payment edge fixes if surfaced by A2 testing | Pricing page flow (catalog setup) verified; org/staff invite flows verified; portal invoice/status copy pass | Observability: error tracking hook (optional), healthcheck external probe; load smoke script skeleton | Owner can set catalog+staff unaided; payments E2E on staging |
| 9 | Reliability day | Expiry sweeper cron (if S-4 kept) or finalize cancel/read-expiry UX contract; S-2 security pair if capacity | Empty/error/forbidden completion on all operational pages; RTL spot-check (layout intact) | Nightly backup scheduled; monitoring probe (uptime check on /health + login) | Kill-switch drills: DB restore + redeploy rehearsed |
| 10 | Browser-hardening day | Bug-fix queue from A2/A3 findings | Scripted browser golden-journey run; fix visual/state bugs found | Flaky-test quarantine; CI time budget check | Zero known red on staging; browser journey passes 3× consecutively |
| 11 | Pilot readiness data | Import helper for real services CSV (tiny, validated, uses catalog API — not raw SQL) | Training one-pagers content (per role, screenshots) | Pilot tenant created via wizard with REAL profile/policies decided with owner | Pilot workshop configured with its true catalog/staff/users |
| 12 | **Checkpoint 2 (hard)** | Critical-only fixes | Critical-only fixes | Dress rehearsal #1: owner performs golden journey on staging w/ real device; issue list | Rehearsal issues triaged CRITICAL/non-CRITICAL |
| 13 | Fix-critical day | Critical fixes only | Critical fixes only | Re-run full gate + walkthrough + browser journey; final backup/restore verification | All CRITICAL closed; SHOULD items frozen as-is |
| 14 | Launch | On-call for hotfixes | On-call | Tag `v0.1-pilot`; production(ish) deploy; monitor; handover doc (known limitations included) | **Pilot workshop working their real week on MOP** |

Slack logic: D7 and D12 are sacrificial buffers; anything not MUST by D7 checkpoint is descope-candidate; D13 admits CRITICALs only.

---

## Acceptance criteria (the launch bar)

1. Honesty Harness: HTTP-only golden journey green on launch profile + quick-service contrast profile; runs in CI on every PR.
2. Staging serves HTTPS; smoke suite (login→intake→CLOSED→portal reflects) passes post-deploy.
3. Every visible button on operational pages performs its action (automated sweep: grep click-handlers → assert route/API exists).
4. Backup restore drill: RPO ≤ 24h demonstrated; restore time recorded.
5. Money: partial-payment policy, idempotent replay, refund netting each have ≥1 passing test touched this sprint (they exist — assert they still pass in CI artifacts).
6. Zero fabricated open-state lifecycle data anywhere reachable by the pilot.
7. Session survives a working day (refresh flow) — explicit test.
8. Known-limitations handover doc lists every DEFERRED item with its plan reference (nothing silent).

## Risks & contingencies

| Risk | Likelihood | Contingency |
|---|---|---|
| Intent design reveals graph friction (e.g., WAITING_CUSTOMER edges awkward) | Medium | Fallback bridge: single BM endpoint `POST /work-orders/:id/advance-stage` mapping state→next server-derived intent — still lifecycle-owned, still auditable; replace later |
| Walkthrough exposes latent gate/graph bugs | Medium | D4 buffer exists; worst case narrow launch profile further (e.g., force INSPECTION_REQUIRED=ALWAYS_INSPECT to drop one edge family) |
| Codex remote-machine env drift | Medium | Containerized dev instructions day 1; its DB local; integration only via git |
| ETA/compliance pressure from pilot | High (expectation mgmt) | Pre-agreed in writing: external invoicing for pilot; adapter = post-M5 track |
| Agent downtime/context churn | Certain | Board contracts + small PRs + daily merges keep any single loss ≤ half-day |
| Pilot no-shows/uncommitted | Low-Medium | If D11 arrives without pilot commitment, pivot deliverable to "deployed vertical + recorded golden-path evidence" (still honest product slice) |
| Scope creep pressure mid-sprint | Certain | FORBIDDEN list is contractual; new ideas go to `board/backlog.md`, never into the sprint |

## After Day 14 — what we will honestly claim

A deployed, backed-up, monitored multi-tenant SaaS on which **one real quick-service workshop can run its entire week**: book-inspect-approve-execute-part-bill-collect-deliver-close, with the customer approving through a link/portal/counter, money math exact and idempotent, permissions and isolation fully enforced, and the whole thing one configuration flip away from QC/review/multi-branch/full-service as those tracks land.

## What we explicitly do NOT claim

Legal tax invoices from MOP (external mode) · automatic customer notifications (links are delivered by hand/WhatsApp by staff) · analytics/team-leader/QC/multi-branch features · post-creation policy editing · specialization-driven behavior · Arabic-translated UI (layout-ready only) · photos/documents · more than one workshop operating shape at launch.

---

## FINAL ANSWER (plainly)

> **At the end of 14 days, a real workshop owner can:** sign in from their counter and their technicians' phones; book a walk-in customer and their car in under a minute; have the technician inspect it, price the findings, and send the customer an approval link that the customer answers from the parking lot (with critical warnings properly acknowledged); watch approved work, tasks, and parts flow through the shop with the stock ledger staying true; see the running bill become an invoice; take full or partial payment at the counter with idempotent safety; and release the car only when the money gate says so — then find the whole truthful story in the job dossier, the customer's portal, and the audit log. The owner sets their own service prices and staff; you (Super Admin) created their workshop in nine audited stages.
>
> **They still cannot:** get a government-compliant invoice printed by MOP (their tax document process stays as-is; MOP holds the money truth), receive automatic WhatsApp/SMS notifications, use QC/team-review stages, manage multiple branches or warehouses, view analytics dashboards, capture photos, edit policies after setup, or use the system in Arabic text. None of those are missing walls — they are switched-off rooms in a house whose electricity already works.
