# DETAILED EXECUTION PLAN — 14-Day Quick-Service Launch (Inventory First-Class)

**Supersedes** the day plan in `14-DAY-LAUNCH-SCOPE.md` (strategy B confirmed; Inventory Manager promoted to core launch role). Companion: `INVENTORY-EXECUTION-MAP.md` (authoritative for all inventory behavior). No code written yet.

---

## 1. Final launch scope

Quick-service vertical on shipped profile `SINGLE_BAY_QUICK_SERVICE` + PORTAL + EXTERNAL_PARTS + **INVENTORY + PART_RETURNS**, BILLING=EXTERNAL, FINANCE_CORE ON. Roles with UI: BM, Technician, **Inventory Manager**, Owner, Customer (+ Super Admin internal). One branch, one warehouse, review/QC/teams off by configuration.

## 2. Inventory integration scope

Exactly as the Execution Map: zero new inventory architecture; two technician-side endpoints (return, clarification-answer) + one conditional endpoint (external-part entry) + R3 unlock rule + UI state completion + HTTP tests A–J + browser journeys 1–7. The inventory→workflow→finance chain is already transactional and verified; launch work is connection, proof, and polish.

## 3. Updated critical path

```
D1 contracts+CI+harness-red
 └▶ D2–D4 ignition intents (A1)  ──────────────┐  ← unchanged, still the spine
        └▶ D4 golden path #1 (services only)   │
D2 IM console verification vs seeded catalog (A2/A3, parallel — needs NO ignition) ─┐
D3 return-leg endpoints (A1) ──▶ D5 parts round-trip tests (A3) ──▶ D6 browser journeys 1–7 (A2)
D4 golden path #1 EXTENDED with part loop (A1+A2+A3)  ◀──────────────────────────────┘
D7 CHECKPOINT-1 → D8–D11 hardening/pilot-data → D12 CHECKPOINT-2 → D13 critical-only → D14 launch
```

What moved earlier vs the old plan: return-leg endpoints D3 (was D5) because the parts loop is now launch-critical, not SHOULD; attention CHECK_PARTS action promoted into MUST-lite; inventory HTTP tests scheduled before polish. What stayed parallel: infra track (A3) untouched by inventory. What must serialize: `part-request.service.ts` / technician controller edits (A1 exclusively); migrations (A1); integration merges (orchestrator).

Inventory's dependency on M1 is **one-directional and partial**: the request→WAITING_PARTS→issue→PART_RECEIVED machinery works *today* once a job is IN_PROGRESS; only verification against live ignition waits for D4. Everything else (IM console, ledger, returns adjudication) is testable from Day 2 against seeded catalog via direct API calls that don't need an in-progress job (create request through service-level test path is forbidden for launch proof — A3 uses full HTTP once intake exists Day 2/3).

## 4. Inventory execution map → see companion document (authoritative).

## 5. Complete golden journey (acceptance sequence)

As approved §18, now with verified anchors at every step:

```
SA creates workshop (wizard, profile locked) → owner accepts invite
Owner: pricing catalog + staff invites (manager, tech, storekeeper)
BM: intake walk-in + car → POST /branch-manager/intake ⇒ REGISTERED
BM: assign tech (assignment at intake or workspace)
Tech: Start inspection ⇒ UNDER_INSPECTION            [NEW intent]
Tech: finds brake pads needed → POST .../parts       ⇒ PartRequest REQUESTED,
      WO ⇒ WAITING_PARTS; customer journey shows waiting-for-part   [existing]
IM : queue shows request → approve (P-07 ok)         ⇒ APPROVED
IM : issue qty ≤ shelf ⇒ ONE TX: IssuedItem + movement(before/after)
      + billable line(price snapshot) + PART_RECEIVED ⇒ WO IN_PROGRESS
Stock truth: item ledger shows ISSUE row; shelf count decremented        [Test C]
Tech : receive ⇒ RECEIVED_BY_TECHNICIAN ; fit ⇒ USED                     [Test D]
Customer: journey advances; no warehouse/cost details visible           [Test E]
Tech : completes tasks → finish-check lists satisfied gates
Billing: running invoice contains service line + part line @ snapshot;
         absorption idempotent (exactly once)                            [Test F]
BM  : invoice issued (external mode: money truth only) → delivery HELD reason
Take payment (linked page): POST payments {amount,idempotencyKey}
      ⇒ settlement; SETTLE_PAYMENT ⇒ READY_FOR_DELIVERY
BM  : deliver ⇒ gates re-evaluated ⇒ CLOSED                              [Test J]
Return variant: USED→return request→clarify→answer→accept ⇒ stock restored,
      bill line reduced, gates stay truthful                             [Test G]
Negative variant: while request APPROVED-unissued, finish ⇒ 409 gate_blocked [Tests H]
Isolation: second tenant sees none of the above                          [Test I]
```

## 6–7. Exact agent ownership & file boundaries

### Agent 1 — Backend / Domain (Claude/Opus) — also default integrator
- **Own:** lifecycle ignition (6 intents), task creation endpoint, decision transitions (auto-APPROVE/CUSTOMER_RESPONDED, cancel, VIEWED write), **inventory backend completion**: `POST /technician/parts/:id/return`, `/clarification`, conditional external-part entry, R3 unlock verification; finance touch-points if surfaced; ALL migrations.
- Files: `systems/operations/{work-order-lifecycle,technician-work,intake}.service.ts`, `systems/customer/decision.service.ts`, `systems/inventory/part-request.service.ts`, `experiences/technician/technician.controller.ts`, `experiences/branch-manager/*` (new endpoints only), `packages/database/prisma/migrations`.
- Must NOT touch: any `apps/web` file, `shared/capabilities` internals, money helpers, permission resolver, another agent's claimed controllers.
- Dependencies: provides endpoint contracts to A2 by end of Day 1 (`board/contracts.md`).
- Acceptance: unit+integration suites per intent/part-path; Honesty Harness green; migration chain clean.
- Daily checkpoint: push `track/a` + board status 18:00; integrates merges.

### Agent 2 — Frontend / UX (Codex, remote machine)
- **Own:** work-card parts panel completion (return button, clarify answer form, external-part entry per contract, state/action map verification); IM console verification & micro-polish (queue badges, issue cap UX); Attention CHECK_PARTS + TAKE_PAYMENT actions; payment links from delivery rows; portal/journey copy verification for waiting states; operational surface narrowing pass; empty/error/forbidden sweep.
- Files: `apps/web/src/app/experiences/{technician,inventory,branch-manager,customer}/**`, api-client files matching A1 contracts.
- Must NOT touch: any `apps/api` file, auth store semantics beyond pre-agreed refresh interceptor change (M-6), shared engines.
- Dependencies: consumes A1 contracts (mocked until landed); blocked only on real payloads for browser journeys D5–D6.
- Acceptance: scripted browser journeys 1–7; zero dead buttons on visible surface; screenshots to board.
- Checkpoint: daily push `track/b` + screenshot set.

### Agent 3 — Integration / Infra / Verification (ox-alpha #2)
- **Own:** Honesty Harness incl. golden journey WITH inventory loop; HTTP kit; CI green w/ artifacts; staging deploy/TLS; backups + restore drill; observability-lite (request-id logs, health probe); seed honesty (realistic pilot catalog w/ stock levels, staff; NO fabricated open lifecycle states); tests A–J implementation alongside A1 landings; cross-role verification passes; launch-gate checklist execution.
- Files: `apps/api/src/testing/**`, spec additions across subsystems (claim coordination with A1 to avoid same-file edits — A1 owns service code, A3 owns spec files), `tools/`, `.github/workflows`, infra configs, `seed*.ts`.
- Must NOT touch: business logic services, schema, web app.
- Acceptance: acceptance tests A–J green over HTTP; staging smoke suite; documented restore drill; CI artifacts.
- Checkpoint: daily push `track/c` + test-run evidence links.

**Hotspot table (single-writer enforced):** `part-request.service.ts`→A1 · `technician.controller.ts`→A1 · web experiences→A2 · specs/testing→A3 · `app.routes.ts`→A2 · migrations→A1 · `board/*`→all append, orchestrator curates.

## 8. Day-by-day plan

| Day | Backend (A1) | Frontend (A2) | Inventory objective | Infra/Verify (A3) | Exit criterion |
|---|---|---|---|---|---|
| **1** | Contracts doc for ALL new endpoints (incl. 2–3 inventory ones); implement `start-inspection`, `start-work` behind tests; claim registry | Worktree/DB online; card primary-action scaffold; begin surface-narrowing inventory of routes | Map §F/G reviewed; IM pages walked against base-seed catalog; gaps list to board | CI actually green (fix breaks); harness red test pinned; staging VPS ready; per-agent DBs | 2 intents merged; red walkthrough committed; contracts published |
| **2** | Task-creation endpoint; decision auto-moves (APPROVE/CUSTOMER_RESPONDED) in applyAnswers; REQUEST_APPROVAL move in raiseAndSend | Card states for inspection/request/approve; Add-task modal skeleton | **IM console E2E vs seed**: create request via API helper (pre-ignition OK for IM-side verify), approve, issue; ledger check | Staging boot attempt; Dockerfiles; smoke script v1; start Test C harness | 5 intents coded; IM approve/issue proven over HTTP |
| **3** | BM request-approval; decision CANCEL; VIEWED write; **return + clarification endpoints**; external-part path verification (R3) | Card return/clarify actions; portal decisions copy pass; refresh interceptor (M-6) | Return round-trip service-level proof; R3 rule implemented/verified | Staging HTTPS alive; Tests A,B,D authored | Walkthrough reaches APPROVED_FOR_WORK; parts loop complete at API level |
| **4** | Fix fallout; START_WORK wired end-to-end | Delivery/take-payment links; attention union type fix | Golden path #1 **with part loop** attempted on staging | Full HTTP walkthrough (services+parts) run; backup script drafted | **Golden journey green through CLOSED incl. inventory** |
| **5** | Decision sweeper OR finalize cancel/read-expiry UX; edge fixes from D4 | IM queue badges/Home consistency; workspace WAITING_PARTS label check | Tests E (customer waiting), F (billing exactly-once) authored+green | Tests G,H authored; restore drill executed | Acceptance tests A–F green |
| **6** | Support fixes from browser findings | **Surface-narrowing pass lands**; error/empty sweep on operational pages incl. inventory | Browser journeys 1–5 executed | Seed honesty rework lands (pilot catalog+stock, no fabricated open states); Tests I,J green | A–J all green; visible surface dead-button-free |
| **7** | **CHECKPOINT-1 (hard):** merge debt, regression triage, scope freeze | Critical-only | Journeys 6 (return) browser-verified | Full gate ×2 profiles on staging; go/no-go SHOULD list | All MUST GREEN or re-planned in writing |
| **8** | Edge fixes (discount/payment surfaces from A2 testing) | Pricing/org flows verified unaided; portal invoice copy | Pilot catalog import helper validated (uses catalog API) | Observability-lite done; load smoke skeleton | Owner setup flows self-serviceable |
| **9** | S-2 security pair if capacity | Empty/error sweep complete | Returns queue UX final pass | Nightly backup scheduled; uptime probe | Kill-switch drills rehearsed |
| **10** | Bug-fix queue | Scripted browser golden journey ×3 consecutive | Cross-role verification pass (tech↔IM↔BM↔customer views consistent) | Flaky quarantine; CI time budget | Zero known red on staging |
| **11** | Pilot data support | Training one-pagers (incl. IM role page) | Pilot workshop configured: real catalog, stock levels, staff | Pilot tenant via wizard; credentials handover pack | Pilot environment true-to-life |
| **12** | **CHECKPOINT-2 (hard):** critical-only | Critical-only | Dress rehearsal #1: owner performs journey w/ real device incl. parts flow | Issue triage CRITICAL/rest; final restore verification | Rehearsal issues triaged |
| **13** | Critical fixes only | Critical fixes only | — | Full gate + walkthrough + browser suite final; launch-gate checklist | All CRITICAL closed |
| **14** | On-call hotfix | On-call | — | Tag `v0.1-pilot`; production(ish) deploy; monitor; handover doc | **Pilot runs its real week** |

## 9. Dependency graph (inventory-aware)

```
contracts(D1) ─▶ A2 UI work (any day)
ignition intents(D1–3) ─▶ golden path(D4) ─▶ everything user-facing
request/issue machinery(EXISTS) ─┐
return endpoints(D3) ────────────┴─▶ parts-loop tests(D5) ─▶ browser journeys(D6) ─▶ rehearsal(D12)
decision auto-moves(D2) ─▶ approval leg of journey
CI(D1) ─▶ every merge; staging(D2) ─▶ D4 onward verification
backups/obs(D5,D9) independent
```

## 10. Integration checkpoints

Daily 18:00: branches pushed → orchestrator rebases onto `develop` sequentially (A1 first when migrations present) → scoped tests → full gate when ≥2 agents merged → golden-journey smoke on staging → board updated. Hard checkpoints D7/D12 as tabled; D14 launch gate = acceptance criteria list of the scope doc + tests A–J + rehearsal sign-off.

## 11–12. Test & browser verification plans

Covered by Map §H (tests A–J with owners/days) and §I (journeys 1–7, executed D6, re-run D10/D12/D13). Existing suites remain mandatory-green; nothing replaces them.

## 13. Scope-cut rules (in order, if time compresses)

Cut S-items first (attention extras beyond CHECK_PARTS/TAKE_PAYMENT, S-2 security pair, S-3 reports tab) → then descope browser-journey automation to manual-with-checklist (keep HTTP tests) → then PART_RETURNS capability OFF (configuration; removes G5 dependency entirely — decide at D7 only) → never cut: M-1..M-6, M-9..M-13, tests A–C,F,H,J.

## 14–15. Risks & contingencies

| Risk | Contingency |
|---|---|
| External-part entry path missing (R3) | Minimal endpoint inside existing service/controller (Day-3 decision slot); worst case launch rule = "rejected part ⇒ request alternative" only |
| Ignition slips past D4 | Bridge advance-endpoint fallback (pre-designed in scope doc); inventory loop unaffected — it hangs off IN_PROGRESS which bridge reaches |
| PART_RETURNS quality slip | Capability OFF via config (gates die by ownership); ship note documents it |
| Codex env drift | Containerized setup instructions Day 1; git-only integration |
| Concurrent-session collisions | Board claims + single-writer hotspot table + daily merge order |

## 16–18. Hard checkpoints

- **Day 7:** every MUST item GREEN or re-planned in writing; scope freeze; PART_RETURNS keep/cut decision.
- **Day 12:** dress rehearsal with owner on staging including parts flow; CRITICAL/non-CRITICAL triage published.
- **Day 14 launch gate:** scope-doc acceptance criteria + Tests A–J green in CI artifacts + rehearsal sign-off + handover doc with known limitations.

---

## Review log (mandatory double review)

**Review 1 — corrections applied:** (a) initially slotted return-leg endpoints at D5 per original plan; moved to **D3** because PART_RETURNS is now launch-core and journeys 6–7 depend on it before D6. (b) Caught an implicit assumption that IM pages "need building" — audit proves they are complete; re-scoped A2's inventory work to verification/micro-polish, freeing A2 for the surface-narrowing pass earlier. (c) Added the rejected/unavailable unlock rule (R3) after tracing WAITING_PARTS exit edges — without it, an IM rejection would strand jobs; resolution uses existing entities only. (d) Marked external-part entry as *verify-then-conditionally-add* rather than assuming it exists. (e) Confirmed no new status vocabulary anywhere — map uses only existing enum values; dormant states documented as out-of-surface.

**Review 2 — feasibility verdict:** Three agents can execute this in 14 days because the inventory addition costs ~2 endpoint-days + test/browser days, and it *replaces* generic polish work rather than stacking on it; the critical path remains ignition→golden-path (D1–D4), identical to the approved plan. Cut-order protects the product's truth floor (isolation, money, ledger, gates). Every visible launch action maps to a named backend behavior; nothing ships as decoration. Compatibility with full MOP vision: zero forks — the launch profile, EXTERNAL billing mode, and dormant states are all first-class architecture awaiting later waves.

**Cannot be cut under any circumstance:** M-1 ignition, M-3 decision hygiene, tests A/B/C/F/H/J, deployment+backup floor, honest seed.
