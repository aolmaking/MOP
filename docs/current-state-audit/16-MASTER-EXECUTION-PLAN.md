# 16 — MASTER EXECUTION PLAN: MOP from Audit Truth to Launch-Grade Product

**Basis:** reports 00–15 (code-verified audit @ `a8c8bb5`). Every work item cites its audit trace (`G#` gap register, `S#` security finding, chain refs from report 00 Phase 5).
**Nature:** plan only — no code was changed.

---

## 0. How to read this plan

- **Tracks** are vertical capability streams. **Phases** inside a track are the unit of done. **Milestones** are the horizontal checkpoints that matter to humans.
- Sequencing follows three rules inherited from the repo's own doctrine: (1) *foundations before features*, (2) *nothing ships past a broken predecessor*, (3) *every phase ends with the full gate green* (`typecheck` + 6 linters + all tests + build) **plus the phase's own new proof**.
- Effort keys: **S** ≤ 2 dev-days · **M** ≤ 5 · **L** ≤ 10 · **XL** > 10 (single senior fullstack equivalent; multiply by integration friction in practice).
- The plan deliberately refuses to promise calendar dates; it promises **order, exit criteria, and proof artifacts**. Duration scenarios are in §D.

### The one strategic insight from the audit

MOP does not need more pages. It needs: **an ignition switch** (jobs cannot progress past REGISTERED through the product — G1/G2), **a mailbox and a legal stamp** (no messaging, no lawful invoice — G3/G7), and **a governance runtime for its own configurator** (16 real policies frozen at creation; target is 100+ live ones — G6). Everything else is finishing work on systems that are already real. The tracks below are ordered exactly around those three sentences.

---

## Milestone ladder (what "done" means at each altitude)

| # | Milestone | Exit condition (user-verifiable) | Tracks consumed |
|---|---|---|---|
| **M0** | **Truth restored** | CI green on GitHub (actually executed); one HTTP-only walkthrough test fails today proving the spine break; docs agree on page totals | T0 |
| **M1** | **Ignition** | A human can book a car and drive it to CLOSED using only the UI, on every shipped capability profile; walkthrough test passes over pure HTTP | T1 |
| **M2** | **Complete workshop floor** | Daily operations have no dead buttons: returns round-trip, decisions expire, payments reachable, inspections capture real forms, sessions survive the day | T2 |
| **M3** | **Pilot-ready** | One real workshop runs a real week: deployed over HTTPS, observed, backed up, invoicing legally in one country, Arabic-readable core screens | T0·T3(first adapter)·T8(core)·T11(start) |
| **M4** | **Governed configurator** | Super Admin changes any policy on a living workshop with impact preview + audit; governance levers (restrict/dispute/suspend) routable; security findings S1–S3 fixed | T5(P5.1–P5.2)·T7 |
| **M5** | **Differentiation at scale** | 85–110 enforced policies behind the conformance pipeline; specializations alter real behavior; two created workshops demonstrably diverge in workflow, vocabulary, forms and money rules | T5(tranches)·T6 |
| **M6** | **Commercial launch** | Self-sustaining SaaS: subscription lifecycle, second billing market, full observability/load baseline, translation-complete, platform reports complete | T8(rest)·T10–T13 |

---

## Dependency map (who blocks whom)

```
T0 ──▶ T1 ──▶ T2 ──▶ everything user-facing
 │            └──▶ T6 (forms consumption shares inspection work)
 ├──▶ T8.core (parallel; needed by M3)
 ├──▶ T5.1 governance runtime ──▶ T5 tranches ──▶ T5.6 scale guards
 ├──▶ T7 (security/isolation; parallel after T1)
T3 (billing adapter) ── independent, START EARLY (external lead times)
T4 (messaging) ──▶ T10 (portal notifications), T2 expiry notices benefit
T9 (people productization) ── after T5.1 (uses policy machinery)
T10/T11/T12/T13 ── last-mile, gated by M3/M4/M5
```

---

# TRACK 0 — Restore verification truth (M0)

> *Why first:* the audit proved the product's own demos lie about reachability (`seed-demo.ts recordLifecycleHistory`) and its own docs disagree on totals. Before building anything, make truth cheap.

### P0.1 — Make CI real · **S**
- Trigger the workflow on a scratch commit; fix whatever surfaces (env, pnpm fetch, flaky specs under CI runners).
- Add artifacts: jest results + coverage summaries (api/shared/web), lint reports.
- Branch protection: require the `ci` job.
- **Proof:** green run URL; artifacts downloadable.

### P0.2 — The Honesty Harness (permanent anti-masking test) · **M**
- New spec: `apps/api/src/testing/walkthrough.http.spec.ts` — boots the real Nest app + real Postgres, creates a workshop via `POST /platform/workshops` **through HTTP**, accepts the invite, books a car, and attempts the full lifecycle **using only HTTP calls** (cookie auth, no direct service calls).
- Today this test MUST fail at the REGISTERED→UNDER_INSPECTION step — that failure is M0's evidence the audit is right and M1's acceptance test when it passes.
- Parameterize it over all **7 shipped capability profiles** (matrix test) — this generalizes `scenario-walkthrough.integration.spec.ts`.
- Rule committed to CLAUDE.md: *no seed may fabricate open-state lifecycle history; `recordLifecycleHistory` restricted to CLOSED historical demos.*
- **Proof:** red test pinned as `xit` with tracked issue; converted to passing in M1.

### P0.3 — HTTP test kit extraction · **M**
- Extract from `auth.controller.integration.spec.ts`: `bootApp()`, `loginAs(email)`, `expectCode(res, code)` helpers into `apps/api/src/testing/http-kit.ts`; refactor the 7 existing supertest suites onto it.
- This kit is the vehicle for Track 1–2 acceptance tests and closes G12 progressively.

### P0.4 — Documentation single-source sweep · **S**
- Regenerate `POLICY_COVERAGE_MATRIX.md` from `registry.ts` (script, not hand-edited — add `tools/gen-policy-matrix.mjs` reading the registry).
- Fix totals: README status line, PHASE_MAP, PROJECT_STATE §1/§2 all cite PAGE_INVENTORY programmatically (link, don't restate numbers).
- Correct CLAUDE.md stale refs (phase count, moved files, linter count).

---

# TRACK 1 — Ignition: complete the operational spine (M1)

> Closes **G1 + G2** (report 01 §2.2). Nothing else in the product matters until this lands.

### P1.1 — Intent ownership design (half-day decision doc, then code) · **S**
Map every unowned intent to an actor, endpoint, permission key, and UI affordance. Recommended ownership (consistent with existing permission philosophy):

| Intent (edge) | Owner actor | Endpoint | Permission | UI affordance |
|---|---|---|---|---|
| `START_INSPECTION` (REGISTERED→UNDER_INSPECTION) | assigned technician | `POST /technician/work-orders/:id/start-inspection` | `task.view_assigned` (reuse) + assignment check | Work Card primary button when status=REGISTERED |
| `REQUEST_APPROVAL` (REGISTERED/UNDER_INSPECTION→AWAITING_CUSTOMER_APPROVAL) | technician (raise-and-send already exists for decisions) | fold into existing decision raise: after `applyAnswers`-style creation, attempt `moveIfPossible(REQUEST_APPROVAL)`; plus explicit BM button `POST /branch-manager/work-orders/:id/request-approval` for the ALWAYS_INSPECT/no-decision path | `customer_decision.create` / `customer_decision.send` | existing decision modal + new BM workspace button |
| `APPROVE` (…→APPROVED_FOR_WORK) | **the system, on customer consent** | `CustomerDecisionService.applyAnswers()` gains `moveIfPossible(APPROVE)` after RESOLVED-all-approved (mirrors part-request pattern; outside answer tx, refusal-swallowing) | none (system actor, audited) | – |
| `START_WORK` (APPROVED_FOR_WORK→IN_PROGRESS) | technician | `POST /technician/work-orders/:id/start-work` | `task.view_assigned` + assignment | Work Card primary button |
| `ASK_CUSTOMER` (IN_PROGRESS→WAITING_CUSTOMER) | technician raising a mid-job question | reuse decision raise; attempt `moveIfPossible(ASK_CUSTOMER)` | `customer_decision.create` | existing modal |
| `CUSTOMER_RESPONDED` (WAITING_CUSTOMER→IN_PROGRESS) | system on decision resolution | `applyAnswers()` adds `moveIfPossible(CUSTOMER_RESPONDED)` | system actor | – |

Design rules honored: lifecycle remains sole status writer; intents never client-chosen; refusal-swallowing `moveIfPossible` only where a stale-state race is acceptable (documented pattern already in part-request/finance); every move emits `status_changed`.

### P1.2 — Implement the six triggers + task creation · **L**
- Backend: 3 new technician endpoints, BM request-approval, decision-service auto-moves (APPROVE, CUSTOMER_RESPONDED), `POST /branch-manager/work-orders/:id/tasks {title, serviceKey?, assignToStaffUserId?}` exposing the existing-but-unconsumed `TechnicianWorkService.createTask` (validate serviceKey against live catalog — logic already there).
- Permission manifest: no new keys required by the recommendation above (verify with `lint-permission-keys`); add keys only if design doc overrides.
- Frontend: Work Card contextual primary action (Start inspection → Start work → Finish), BM workspace "Add task" + "Request approval", decision-send confirmation showing resulting stage (journey poller picks it up).
- Update `workflow-journey` labels if new audience phrasing needed (labels already exist for these stages — verify only).
- **Tests:** unit for each endpoint guard; integration per intent incl. refusal cases (wrong state, wrong actor, policy-narrowed edge absent → INTENT_UNAVAILABLE mapped to honest 409 copy).

### P1.3 — Profile-matrix walkthrough green (P0.2 un-xit) · **M**
- All 7 profiles drive intake→CLOSED over HTTP: quick-service (no QC/review), full dealership (review+QC), external finance, external billing, diagnostics-only, motorcycle, heavy-equipment.
- Assert per-profile finish landing (PAYMENT_PENDING vs READY_FOR_TEAM_REVIEW vs READY_FOR_QC vs straight READY_FOR_DELIVERY) — codifying router precedence into executable proof.
- Convert relevant `seed-demo.ts` open-state demos to service-driven creation; keep fabricated history only for CLOSED archives.
- **Exit (M1):** the Honesty Harness is green; a recorded browser session shows the full loop on two contrasting profiles.

---
# TRACK 2 — Close every live-cycle hole (M2)

> Closes G4, G5, G9, G10, G11 + the forms half of G8. Target: a workshop's *daily* operations have zero dead ends.

### P2.1 — Decision lifecycle becomes real · **M** (G4)
- `VIEWED`: written by public token read (`GET /public/decisions/:token` first successful render) and portal open — one guarded updateMany, idempotent.
- Expiry sweeper: extend heartbeat job (advisory-locked) with a sweep: open decision requests past `P-17` window → status EXPIRED + event + timeline sentence; gate counts then self-heal. Read-computed expiry display stays (belt) but state now matches it (braces).
- `CANCELLED`: staff endpoint `POST /branch-manager/approvals/:requestId/cancel` (permission `customer_decision.create`; reason required; audit MEDIUM).
- Finish-check payload already surfaces blocking decisions — add "which ones and since when" so BM can chase or cancel.
- **Tests:** sweeper integration (fake clock via tx timestamps), VIEWED idempotency, cancel-after-answer refusal.

### P2.2 — Technician return leg · **S** (G5)
- `POST /technician/parts/:id/return {qty, reason}` → existing `requestReturn()`; `POST /technician/parts/:id/clarification {answer}` → `respondToClarification()`. Work Card buttons wired to the already-rendered waitingOn/action states.
- Inventory Returns queue now receives real traffic; full loop tested over HTTP both sides.

### P2.3 — Attention Center actions live · **S** (G10)
- Implement `act(item)` router: CHASE_CUSTOMER→approvals deep-link; TAKE_PAYMENT→payments route; RESOLVE_BLOCKER→workspace blocker panel; CHECK_PARTS→requests filter; ESCALATE_CRITICAL→approvals item; REVIEW_OVERRUN/REASSIGN→workspace advance; add `REVIEW_OVERRUN` to web union type (type currently cannot represent it).
- Watch tiles filter in place (`filterBy`).

### P2.4 — Take Payment reachable · **S** (G11)
- Delivery held-rows link "Take payment"; attention READY_UNPAID action links; invoice-status drawer link from workspace dossier money band.

### P2.5 — Forms & inspections consume configuration · **L** (G8 forms half)
- Work Card inspection modal renders tenant-configured fields for QUICK/FULL forms (form registry + CustomField list already served by `/organization/forms` — add technician-scoped read endpoint `GET /technician/forms/:formKey` returning live fields only).
- Server passes posted values through existing `validateValues()` (its first production consumer); persisted on Inspection.fields JSON; Dossier displays values; unknown keys dropped server-side (behavior already implemented).
- **Tests:** field-required refusal; categoryScope filtering; archived-field disappearance mid-flight (graceful).

### P2.6 — Web session continuity · **S** (G9)
- Error interceptor: on 401 → single `POST /auth/refresh` → retry original once → else clear store to login. Bootstrap treats refresh-cookie-only state as authenticated-pending.
- **Test:** component-level fake + one HTTP test proving rotation works through the UI path.

### P2.7 — Loop-closure sweep · **S**
- Extend money-lint scope to `systems/billing` (audit finding §A2).
- Remove-or-route decisions recorded for remaining uncalled endpoints (notes GET/POST → surface in workspace dossier tab OR delete; TL vehicle-history → add drawer link; finish-check → delete or keep documented as internal).
- **Exit (M2):** Honesty Harness extended with a "day-in-the-life" scenario (return leg, expiry sweep, partial payment, attention action each type) — all green over HTTP.

---

# TRACK 3 — Money you can legally take (starts immediately; M3 needs adapter #1)

> Closes G3. The seam exists (`BillingCountryAdapter`, `ADAPTER_COVERED_COUNTRIES`, clearance statuses, credit/debit notes, compliantBlocked plumbing). This track fills it with law.

### P3.1 — Jurisdiction decision & requirements freeze · **S** (external dependency)
- Choose **Egypt ETA** first (document rationale: home market of discovery scenarios; ZATCA phase-2 waves second). Freeze: e-invoice JSON schema version, submission auth (certificate/OTP), clearance vs pre-approval document types, QR (TLV base64), UUID/timestamp rules, credit-note linkage semantics.
- Output: `docs/billing/ETA_REQUIREMENTS.md` + sandbox credentials plan. *This step has real-world lead time — start week 1 of the track.*

### P3.2 — Adapter implementation · **XL**
- `EgyptETAAdapter implements BillingCountryAdapter`: validateInvoice (jurisdiction fields), generateDocument (ETA JSON), submitForClearance (async call → pending status), getClearanceStatus (poll/callback), generateQr (real TLV), generateCreditNote/generateDebitNote (linked submission).
- Async reality: BillingDocument gains submission queue semantics (status PENDING→SUBMITTED→CLEARED|FAILED w/ retry + `clearance_failed` event already defined in contracts). Scheduler sweeps pending submissions (heartbeat extension pattern).
- Secrets: certificate storage decision (env-mounted file vs KMS) — document per INFRASTRUCTURE.md posture.
- **Tests:** adapter contract suite against ETA sandbox stub + golden JSON snapshots; failure-path tests (rejection → FAILED + retry budget).

### P3.3 — Compliance UX end-to-end · **M**
- `compliantBlocked` now country-aware automatically (set membership driven by adapter registration); issuance blocked under BLOCK/BLOCK_WITH_OVERRIDE policies proven over HTTP incl. override flow (who can override? permission `finance.invoice.override_compliance` new key + audit HIGH).
- Invoice document artifact retrieval endpoint + customer portal download (ties to T10.3).
- Workshops-list badge already exists — verify states after adapter ships.

### P3.4 — Second market (ZATCA) · **XL** *(post-M5; same seam)*
- Saudi ZATCA phase-2 adapter; multi-country tenants get per-branch country determination rule (branch address country) — small schema addition if needed (Invoice.countryOfIssuance snapshot exists via candidate.country — verify sufficiency).

---

# TRACK 4 — The workshop grows a voice (messaging)

> Closes G7. Everything exists except a sender: templates, versions, variable enforcement, `currentBody()` awaiting a consumer.

### P4.1 — Outbound infrastructure · **L**
- New system slice `systems/messaging`: model `OutboundMessage {tenantId, channel, templateKey|null, to, bodySnapshot, relatedType/Id, status QUEUED→SENT|FAILED, providerMessageId, attempts}` (+ migration); sender service consuming `currentBody()`; retry policy; opt-out flag on Customer.
- Provider adapters behind tiny interface: `WhatsAppCloudAdapter` (Meta Cloud API — market-appropriate), `EmailSmtpAdapter`. Credentials per environment, not per tenant (v1).
- Heartbeat-extension dispatch loop (same advisory-lock pattern).

### P4.2 — Business events that send · **M**
- Wire sends at: decision raise-and-send (the token link finally delivers itself), invoice issued (portal/payment link), job ready-for-delivery notice, password-reset (identity service consumes same sender), staff invite delivery (opt-in send vs hand-link).
- Per-tenant notification preferences: `NotificationConfiguration` (one row/tenant: which events on which channels; silent hours honored by scheduler). Super Admin sets defaults at creation stage (new optional wizard sub-step within POLICIES stage copy, not a new stage).

### P4.3 — Compliance & honesty · **S**
- Every outbound logged w/ body snapshot (audit-grade); customer opt-out honored globally; no marketing v1 (transactional only — keeps consent surface small).
- **Tests:** template-render golden tests, provider adapter contract tests against stubs, silent-hours scheduling, opt-out suppression.

*(Inbound WhatsApp two-way = explicitly deferred; note as future capability with admission-test check.)*

---

# TRACK 5 — The policy engine grows up: from 16 to 100+ governed behaviors

> The user's headline requirement. Architecture is ready (derived question sets, relevance DAG w/ cycle rejection, graph-safety combinatorics, dead-consumer CI). What's missing is governance runtime, then disciplined mass addition.

### P5.1 — Governance runtime (prerequisite for everything below) · **L** (G6)
- `control/policies/policies.controller.ts`: 
  - `GET /platform/workshops/:id/policies` → relevant questions only (isPolicyRelevant w/ current capabilities+specializations), current answer or default, mutability, last-changed audit ref.
  - `POST .../policies/preview` → impact projection (affected edges via shared graph diff, affected consumers list from enforcement declarations, stranded-answer warnings).
  - `PUT .../policies/:key` → PolicyResolutionService.set() (already built!) + mutability gate + reason + audit HIGH + history row exposure.
- Mutability enforcement (classes exist, unenforced): FREELY any time; GOVERNED requires actor = platform **or** owner-permitted set (decision: Super Admin ceiling / Owner tunes-within — resolves Phase-21 OPEN item using Limits&Entitlements pattern); IMMUTABLE_AFTER_FIRST_USE blocked when usage-detector says used (usage detectors registered per policy: e.g., numbering scheme used iff any Invoice exists).
- Owner-side read mirror: `GET /organization/policies` (visible, tunable only where GOVERNED-owner allowed).
- Web: Builder Control page gains Policy Matrix tab (list/filter/edit w/ preview modal); Owner Pricing page links to its finance-relevant subset.
- **Tests:** HTTP suite for the four endpoints; mutability refusals; preview accuracy vs actual apply (diff must be empty).

### P5.2 — Conformance pipeline (how 100 policies stay true) · **M**
- Codify the PHASE_21 §3.7 admission test into tooling: `tools/gen-policy-scaffold.mjs <key>` emits registry entry skeleton + spec skeleton + checklist (relevance predicate, ≥2 options w/ reasoned defaults, enforcement.where, consumer PR link, graph-safety run, dead-consumers update).
- CI additions: (a) registry count telemetry comment on PRs touching policies; (b) graph-safety runtime budget assert (<500ms full walk) so scale doesn't silently rot; (c) lint: every ENFORCED entry's consumer file must reference the key literal (strengthen dead-consumers from identifier-exists to call-site-exists where feasible).
- Rule: **a policy without a same-PR consumer is RECORDED, and RECORDED entries older than one sprint fail CI** — makes the old 9/7 matrix drift impossible again.

### P5.3 — Tranche A: activate designed-but-unimplemented inventory (~22 policies) · **XL across phases, ship in batches of 4–6**

| Batch | Policies (from P-01…P-84 inventory) | Notable work |
|---|---|---|
| A1 ops | P-13 walk-ins BLOCKED variant (intake refuses no-customer), P-19 no-answer escalation timers (uses T2 sweeper), P-20 revise-rules (void-and-reask flow), P-50 promise-time visibility variants | decision/intake services |
| A2 finance | P-05 FULL_ONLY exists; add P-28 deposits (Payment.kind=DEPOSIT + deposit-required thresholds), P-23 refund approver variants (ABOVE_THRESHOLD_OWNER etc.), P-24 numbering schemes BRANCH_SEQUENTIAL/YEAR_PREFIXED (sequence table gains branch/year columns — IMMUTABLE_AFTER_FIRST_USE detector), P-22 tax-inclusive pricing (money math switch + FinanceConfiguration.taxInclusive; invoice lines show incl/excl correctly) | finance.service + money helpers |
| A3 inventory | P-30 customer-supplied variants (REFUSED blocks provenance CUSTOMER_SUPPLIED intake), P-31 direct-purchase ONLY_IF_OUT_OF_STOCK, P-32 warehouse deactivation alternatives (TRANSFER_THEN_DEACTIVATE uses future T-transfer mini-feature or write-off movement), P-57 cost visibility default-off (exists — expose toggle) | part-request/catalog/warehouse |
| A4 people | P-37 exit-reason/rehire enforcement (deactivate gains reason enum; rehire checks), P-39 credential expiry WARN/BLOCK assignment (consumes CredentialService — first behavioral specialization synergy), P-61 shared-device PIN step-up (per-role session policy; auth change M), P-34 PRIMARY_PLUS_SECONDARY dual roles (join table StaffRoleAssignment; resolver iterates roles; UI picker) | org/team/auth |
| A5 misc | P-16 NOTHING/NOTES/LINKED_FOLLOW_UP completes (needs P-40 typed links), P-14 BLOCK_WITH_OVERRIDE (done in T3.3), P-47 GDPR anonymise flow (customer anonymize job preserving financial rows), P-48/P-55 retention purge jobs (archived tenants, audit tiers) | cross-system |

### P5.4 — Tranche B: structural-lite enablers (~12) · **XL**
- **P-40 typed WO-WO links** COMEBACK_OF/FOLLOW_UP_TO/CHILD_OF (schema relink fields partially exist → proper Link table + dossier chain view + reporting rollups).
- **P-42 Account entity (narrow)** + **P-43 payer-on-work-order**: nullable payerCustomerId defaults to customer; finance attribution/reporting respect payer; portal visibility follows payer consent flag.
- P-52 PERIOD_CLOSE_SNAPSHOTS (nightly aggregate tables feeding owner reports fast path), P-53 AUDIT_TRAIL_ONLY formalized, P-67 custom-fields promoted queryable (analytics join on Inspection.fields via promotion registry), P-68 CSV validated import per entity (dry-run report → commit batch; doubles as bulk onboarding for T9.3), P-45 custom blocker reasons w/ audience declaration (blocker-routing read side finally consumed), P-70 done in T8.5, P-56 in-flight-wins race guard (T8.7 spike landing), P-35 role label overrides (vocabulary store + ROLE_PAGES label resolution), P-36 regional-manager tier OFF-by-default capability-lite (branchScope parent layer).

### P5.5 — Tranche C: new-generation policies (~40–50 candidates → expect ~35–45 to pass admission) · **XL**
Generated from pack semantics + market discovery docs. Candidates (each will be individually admitted or rejected with reasons):

- *Operations:* estimate-validity window; comeback auto-link window (uses P-40); mandatory photo classes per task (needs T-attachments activation); bay-blocking rule (SCENARIOS 4.5 revival, pairs S-01b); fluid-disposal fee auto-line; reattribution-on-absence rule; courtesy-loaner flag; warranty claim window (P-12 activation needs warranty fields on Asset/service).
- *Finance:* labor-rate tiers by technician skill (pairs credentials); margin-floor warning; late-payment interest %; account credit limit block; price-lock duration on quotes; minimum-job charge; tax-exemption certificate capture; rounding-donation line.
- *Inventory:* reorder-point alerts (notification tie-in T4); bin locations; core-charge handling; supplier lead-time SLA flags; hazmat acknowledgment on issue; consumption costing display (FIFO/WAVG label-only v1).
- *People:* shift-window task acceptance; junior supervision ratio (pairs TEAM_REVIEW); skill-based routing suggestion; overtime approval threshold.
- *Customer comms:* status-update cadence; preferred language per contact (i18n tie T11); silent-hours already global—per-customer overrides; escalation contact chain.
- *Governance/security:* session idle timeout per role; export watermarking; audit-reason-required threshold; IP allowlist per branch (deployment-dependent).
- *Portal:* decision-expiry reminder count; partial-payment reminder tone; document-language policy.

Projection honesty: 16 current + ~22 A + ~12 B + ~40 C ≈ **90 admitted**, plus stragglers ⇒ **target band 85–110 enforced**. Anything reachability-changing gets rejected back to capability track — that rejection *is* the architecture working.

### P5.6 — Scale guards for the questionnaire & validator · **M**
- Derived question-set size telemetry per profile (assert ≤ 60 in CI fixture workshops); relevance-DAG depth guard; graph-safety fact-key powerset cap with pairwise fallback beyond 8 facts (algorithmic swap documented before needed).
- Workshop DNA page: Super Admin "compare two workshops" diff view (capabilities × policies × modules side-by-side) — cheap once data model is uniform; invaluable for sales/demos.

### Exit (M5): two created workshops with contrasting packs/policies demonstrate divergence in: finish routing, question counts, invoice shape, forms captured, notification cadence — recorded as automated screenshot + HTTP assertion suite ("divergence proof").

---
# TRACK 6 — Specialization becomes behavioral

> Report 04 verdict today: metadata-only. This track makes packs alter what staff see, capture, and are allowed to do.

### P6.1 — Service cards & measurement forms consumed · **M** (G13)
- Intake "add service" picker lists tenant's SERVICE_CARD definitions (read endpoint `GET /organization/specializations/cards` — engine exists, surface missing); selecting a card creates the task with mapped serviceKey + default title.
- MEASUREMENT_FORM definitions render inside inspection/task modals (shares P2.5 form-rendering component); entries saved via `SpecializationService.fillEntry` (first production consumer) keyed to WorkOrder; values displayed in Dossier and counted in Feature-Adoption analytics (replacing its notTrackable entry for forms).

### P6.2 — Credentials gate work · **M**
- Assignment picker warns on expired/missing required credentials; with **P-39** policy set to BLOCK, assignment refuses (`credential_expired`) — the first specialization→behavior edge via RelevanceContext.
- Technician card shows own credential status banner.

### P6.3 — Position taxonomy drives defaults · **S**
- Org page role suggestions per category; reporting groups technicians by taxonomy position.

### P6.4 — Authoring at creation ("start from nothing") · **L** *(completes owed Phase 17)*
- Wizard SPECIALIZATION stage gains: pick packs **and/or** author custom cards inline (name/category/kind/fields w/ types+options); platform-level pack library management page (create/edit/deprecate packs globally).
- Custom cards seed exactly like built-ins (same defineCard path) — no schema fork.

### P6.5 — Specialization-reactive policies · **M**
- Wire `RelevanceContext.specializations` into ≥5 Tranche-C policies (tread-depth form required for TYRES; DTC-report required for DIAGNOSTICS estimates; alignment-spec sheet for BRAKES_AND_SUSPENSION…). From here, packs genuinely change question sets and required evidence.

---

# TRACK 7 — Governance, security, isolation hardening (M4 co-requisite)

### P7.1 — Route the orphaned levers · **M** *(four disconnected services from report 08 §5)*
- Staff restriction: `POST /platform/workshops/:id/staff/:staffId/restrict|lift` (+reason, audit HIGH) → enforcement layer already live. Platform Control-Center UI section.
- Disputes: BM-facing raise on delivered jobs + owner resolve queue; feeds audit + financial report note.
- SUSPENDED writer: Super Admin suspend action (distinct from freeze: heavier, implies investigation) with session revocation reuse.
- Tenant groups/stakeholders: either ship minimal routes + enforcement layer consultation **or** formally park with ADR — recommend ship-read-only portfolio grouping first (platform reports feed), stakeholder grants deferred behind P-58 boundary note.

### P7.2 — Security findings S1–S3 · **M** *(report 11)*
- **S1:** sessions gain `accessExpiresAt` (20-min server-side, slid on activity); guard checks it; refresh rotates as today. Migration + backfill trivial.
- **S2:** refresh tokens get absolute family expiry (30d cap) + reuse detection: presented-rotated token ⇒ revoke whole session family (hash-chain parent pointer), audit WARN.
- **S3:** advance endpoint adds branch-scope assertion (or dedicated `workorders.review.decide` scope rule: TL limited to managed-tech jobs — choose in 1-line design note; test both roles).
- Minor: messages preview permission; lockout clock consistency (use DB clock everywhere); invite/reset link TTL display.

### P7.3 — Isolation defense-in-depth · **L**
- Prisma `$extends` query middleware: every tenant-scoped model query must carry tenantId (model registry list; startup self-test throws if a known-scoped model runs unscoped outside platform allowlist). Catches the *next* hand-written query automatically.
- FK migration batch: add `tenantId` FKs on the ~15 child tables + Session.tenantId index (expand→contract safe).
- RLS spike (time-boxed 3 days): Postgres row-level security feasibility with session variable `app.tenant_id`; likely defer with written rationale if Prisma friction high — middleware already delivers class-of-bug protection.

### P7.4 — Archive read-path & retention UX · **M**
- Platform admin retained-data viewer for ARCHIVED tenants (read-only, permission-gated) — closes 18.x deferral honestly; retention countdown shown; purge job from P-48 executes.

---

# TRACK 8 — Production readiness (core by M3, rest by M6)

### Core (M3 gate)

| Phase | Item | Size |
|---|---|---|
| P8.1 | Dockerfiles (multi-stage api/web) + prod compose profile + Caddy/nginx TLS config + image publish in CI | L |
| P8.2 | Structured logging: pino w/ request-id enrichment (filter logs it too); error tracking SDK wired to exception filter; `/metrics` Prometheus endpoint (http histograms, db pool, scheduler lastRun, business counters: WO-created/closed, payments, decisions-expired) | M |
| P8.3 | Backups: scheduled pg_dump+WAL archive to object storage; scripted restore drill incl. single-tenant logical restore script; runbook doc executed once for proof | M |
| P8.8 | Deployment runbook + staging environment (compose on a VPS acceptable for pilot); smoke-test suite run against staging post-deploy | S |

### Hardening (by M6)

| Phase | Item | Size |
|---|---|---|
| P8.4 | k6 load harness on critical paths (intake, board read, payment, issue-part, analytics); capacity baseline doc; pooling decision (pgbouncer) if needed | L |
| P8.5 | `statusChangedAt` column (P-70): migration + lifecycle writes it + backfill from OperationEvents + byStatus rewrite | M |
| P8.6 | Worker-extraction trigger criteria documented; scheduler stays in-process until hit (Phase-13 doctrine preserved) | S |
| P8.7 | Edge-case closures: E13 capability-change race guard (in-flight transition wins — P-56), E17 dormant-tenant migration rehearsal script, E12 documented DB-clock posture verification test, E20 failover drill execution record | M |
| P8.9 | Dependency audit automation (pnpm audit CI step w/ baseline file); Node/Prisma/Angular upgrade cadence note | S |

---

# TRACK 9 — People & staffing productization

### P9.1 — Dual roles (P-34 narrow form) · **M** *(if not already consumed by T5-A4 ordering — same work item)*
### P9.2 — Money-authority matrix · **M**
- Resolves Phase-21 OPEN item: Super Admin sets ceiling locks (existing role_permission_lock), Owner tunes within unlocked space; Owner Pricing page ships the promised "Who Can Handle Money" panel reading lock state; report-visibility toggles join the same mechanism (closes two named-owed gaps).
### P9.3 — Bulk provisioning · **L** (17.C/17.D)
- CSV validated import (P-68 engine) applied to: staff invites (email+role+branch), customers, assets. Dry-run report → commit; per-row errors downloadable.
### P9.4 — Scheduling primitive S-01b · **XL** *(post-M5, demand-gated per plan doctrine)*
- Resource occupancy: Branch resources (bays/lifts) entity + promise-time conflict warning at intake + utilization analytics. P-51 overbooking policy becomes meaningful here.

---

# TRACK 10 — Trust product polish (customer portal)

| Phase | Item | Size |
|---|---|---|
| P10.1 | Full journey strip for customers (D18 debt) — audience labels exist; expose full stage list when portal-on | S |
| P10.2 | Portal notifications via T4 channels + decision reminders cadence (P-candidate) | M |
| P10.3 | Legal invoice PDF download (T3 artifact) + credit notes visible | M |
| P10.4 | Approval receipt view (what customer acknowledged, when, critical items flagged) — printable | S |
| P10.5 | Promise-time display variants (P-50 done in T5-A1; portal consumes) | S |

---

# TRACK 11 — Language & markets (Arabic is a launch requirement, not polish)

| Phase | Item | Size |
|---|---|---|
| P11.1 | i18n infrastructure: typed dictionary (`apps/web/src/assets/i18/{en,ar}.json` + strict key lint reusing permission-key linter pattern); extract ~95 templates' strings incrementally per role folder | XL total, ship per-role |
| P11.2 | Arabic translation pass (dialect decision: MSA base + Gulf/Egypt glossary from discovery docs); locale-aware date/number formatting (Intl API); RTL visual QA sweep checklist executed per milestone screenshot | L |
| P11.3 | Server-side strings: gate messages, decision timeline sentences, email/WhatsApp bodies — bilingual template variants selected by tenant language preference | M |
| P11.4 | Invoice document language policy (Tranche-C candidate) tied to adapter country | S |

---

# TRACK 12 — Reporting maturity

| Phase | Item | Size |
|---|---|---|
| P12.1 | Analyst date-range filters UI + exports honor them (API ready today) | S |
| P12.2 | Period-close snapshots (P-52/T5-B) fast-path owner reports + summary tables (D11/D12 debts) | M |
| P12.3 | Platform Reports sections 3–6: Feature Usage (feeds exist), Builder Adoption (onboarding telemetry counters), Operational Activity, Health & Risk (workflow-health cross-tenant rollup — second deliberate cross-tenant read, platform-guarded) | L |
| P12.4 | Commercial Snapshot after T13 subscription data exists | M |

---

# TRACK 13 — SaaS commercialization (the product that sells the product)

| Phase | Item | Size |
|---|---|---|
| P13.1 | Subscription truth: fill the honest-nulls (renewalDate/paidThroughDate/MRR) — Subscription model or Tenant columns; manual payment recording by Super Admin v1 (invoice-style record + audit), Stripe checkout adapter later | M then M |
| P13.2 | Lifecycle automation: trial→active conversion flow; non-payment → SUSPENDED (uses T7 writer) after grace policy; freeze/reactivate polished w/ comms (T4) | M |
| P13.3 | Self-serve funnel v1: public "request a workshop" form (tenant request table → Super Admin queue) — white-glove creation via existing wizard remains the act of provisioning | M |
| P13.4 | Plan management UI for platform (CRUD plans/ceilings/exports beyond current seed-only) + per-tenant below-plan override (documented open question — decide now using ControlSetting pattern) | M |
| P13.5 | Legal pack: ToS/Privacy pages, DPA template, GDPR tooling tie-in (P-47 anonymisation from T5-A5), data-residency note per region | M |

---

# Cross-cutting quality bar ("100% perfect" made checkable)

A subsystem may be declared **launch-grade** only when ALL hold:

1. Full gate green (typecheck, 6 linters incl. billing-scope money-lint, all tests, build).
2. HTTP-level suite exists for every controller in the subsystem (P0.3 kit pattern) — closes G12 fully.
3. No hardcoded-true gates, no RECORDED policies older than one sprint, no uncalled exported service methods without an ADR (dead-consumers philosophy generalized).
4. Honesty Harness scenarios cover the subsystem's user journey for ≥2 contrasting profiles.
5. Structured logs emitted at each state change; business counter incremented.
6. Arabic keys present (post-P11.1 start) for any user-visible string added.
7. Load smoke within baseline budget (post-P8.4).

---

# Risk register (top 10, with mitigations baked into tracks)

| # | Risk | Mitigation |
|---|---|---|
| R1 | ETA sandbox/legal lead time slips M3 | T3 starts day one; External-Billing mode keeps pilot legal stopgap |
| R2 | Policy mass-addition reintroduces drift | P5.2 conformance pipeline BEFORE tranches; RECORDED-age CI rule |
| R3 | Intent ownership design contested mid-build | P1.1 half-day doc gates P1.2; fallback endpoints listed per intent |
| R4 | Middleware (P7.3) fights Prisma patterns | Time-boxed RLS/middleware spike; allowlist escape hatch w/ lint visibility |
| R5 | WhatsApp provider approval delays | Email adapter parallel path; links remain hand-shareable (today's mode) |
| R6 | i18n extraction bloats PRs | Per-role incremental shipping; key-lint prevents regressions |
| R7 | Concurrent-session collisions (repo history!) | One worktree per track; trunk-based small PRs; CODEOWNERS on control/ |
| R8 | Demo-data debt regrows | T0.2 rule + walkthrough suite guards forever |
| R9 | Performance cliff at questionnaire/graph scale | P5.6 budgets in CI before growth, not after |
| R10 | Scope creep toward multi-session/offline/merge-split | §Boundaries below — written refusals, revisit only on paying-customer demand |

## Explicit boundaries — NOT building (doctrine holds)

Multi-session jobs (P-41) · offline clients (P-64) · broad B2B accounts / cross-tenant staff (P-42/P-58 broad forms) · tenant merge/split tooling (18.F) · full impersonation (P-54 stays read-only live-view) · inbound conversational WhatsApp (v1).

---

# §D — Team-shape & duration scenarios (honest ranges)

Assumption: experienced TypeScript fullstack(s), repo discipline followed, no hero weeks.

| Scenario | To M3 (pilot) | To M4 | To M5 | To M6 (launch) |
|---|---|---|---|---|
| **1 senior dev** | 10–14 wks | 16–20 | 28–36 | 40–50+ |
| **2 devs (split T1–T2 vs T3+T8)** | 6–8 | 10–12 | 18–22 | 26–32 |
| **3 devs (+1 front-heavy at T5/T11)** | 5–6 | 8–9 | 14–17 | 20–25 |

Critical path overall: **T0→T1→T2** (floor) ∥ **T3** (external clock) ∥ **T5.1→tranches** (differentiation) → T13 last-mile. Everything else parallelizes.

# Immediate next actions (this week, in order)

1. Push a scratch commit → watch CI actually run (P0.1).
2. Write the P1.1 intent-ownership one-pager; get sign-off (it changes 6 endpoints' shapes).
3. Start T3.1 ETA requirements doc + sandbox application (longest external pole).
4. Land P0.2 Honesty Harness red test — pin it as the M1 target.
5. Extract P0.3 HTTP kit; migrate auth suite onto it.
6. Regenerate POLICY_COVERAGE_MATRIX from code (P0.4) — kills the oldest standing contradiction.

---

## Appendix — Traceability index (audit finding → plan item)

| Finding | Where handled |
|---|---|
| G1/G2 spine break | T1.1–T1.3 |
| G3 billing adapters | T3.1–T3.4 |
| G4 decision writers | T2.1 |
| G5 return leg | T2.2 |
| G6 policy setter/governance | T5.1–T5.2 |
| G7 messaging | T4.1–T4.3 |
| G8 forms/specialization consumption | T2.5 + T6.1–T6.5 |
| G9 web refresh | T2.6 |
| G10 attention actions | T2.3 |
| G11 take-payment reachability | T2.4 |
| G12 HTTP tests | T0.3 + quality bar §2 |
| G13 specialization runtime | Track 6 |
| G14 governance routes | T7.1 |
| G15 operator-orphan ongoing check | T5.1 (preview warnings) + org-page badge — extend deactivation flow warning |
| G16 transfers/supplier orders | Tranche-C inventory candidates (lead-time SLA, supplier flags) + mini transfer feature bundled with P-32 TRANSFER_THEN_DEACTIVATE |
| G17 attachments/photos | Tranche-C mandatory-photo policy forces activation: upload route + storage adapter + EXIF strip (size L) |
| G18 i18n | Track 11 |
| G19 deploy/CI | T0.1 + T8.1/P8.8 |
| G20 observability | P8.2 |
| G21 S1–S3 | T7.2 |
| G22 stub gates | T1 lands real review/QC semantics decision: wire TeamReview record OR remove gates until edges exist (decided inside P1.1 doc) |
| G23 analyst ranges | P12.1 |
| G24 money authority/report visibility | P9.2 |
| G25 draft persistence/plan override | Draft autosave bundled into P13.3 wizard hardening; plan override decided in P13.4 |
| G26 realtime phase placement | ADR during M4: SSE channel for board/journey refresh behind feature flag — admitted as capability-lite, NOT started until pilot feedback demands |
