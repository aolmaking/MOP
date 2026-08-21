# Phase Completion Audit — Phases 1–21

> Audit-only. No implementation, no fixes, no rework performed as part of this pass.
> Method: for each phase, the phase doc's own objective/scope/exit-criteria were extracted verbatim,
> then independently re-verified against the current repository (apps/api, apps/web, packages/shared,
> packages/database/prisma/schema.prisma, migrations, integration tests) — not against the doc's own
> status header. Phases 1–5, 6–10, 11–14, 15–17 were each audited by an isolated, read-only research
> pass with explicit instructions not to trust doc claims. Phases 18–21 were verified directly in-session.

## Legend

✅ Complete · 🟡 Partial · 🔴 Failed/Missing · 🔵 Blocked · 🟣 Needs Rework · ⚪ Deferred by Decision

---

## Phase Scorecard

| Phase | Objective | Status | Exit Criteria | Major Missing Work | Deferred Work | Architectural Debt | Evidence | Recommended Action |
|---|---|---|---|---|---|---|---|---|
| **1** — Runnable & Provable | Reproducible env, DB path proven, CI, security baseline, money serialization, resolver caching, RTL foundation | ✅ Complete | 8/8 PASS | Structured JSON logging (doc self-marks outstanding) | 1.6 resolver caching → landed Phase 3 (confirmed) | None | `tools/doctor.mjs`, `permission-context.service.ts`, `money-serialization.interceptor.ts`, `throttle.integration.spec.ts` | No action needed |
| **2** — Design Completeness | Gate registry, cross-system contracts, scenario matrix, schema for customer-supplied parts | ✅ Complete | 4/4 PASS, 1 not re-run | None found | None | None | `packages/shared/src/capabilities/gates.ts`, `contracts/cross-system.ts`, `docs/SCENARIOS.md` (39 entries) | No action needed |
| **3** — Governance Runtime | Capability engine real at runtime: storage, resolution, enforcement above role/user, live-checked change pipeline | ✅ Complete | 4/6 PASS, 1 PARTIAL, 1 not re-run | **`CapabilityResolutionService.resolveAsOf()` built + tested in isolation but has zero callers** — no work-order read path passes `createdAt` through it, so a work order is always read under *today's* capabilities, not creation-time ones | 3.E (Super Admin UI) → landed Phase 5.F (confirmed) | Confirmed gap: point-in-time capability interpretation is schema-ready but not wired anywhere | `apps/api/src/access/capability-resolution.service.ts:42-53`, `permission-resolver.service.ts:36-46` (layer order holds) | Wire `resolveAsOf` into the one or two read paths (work-order detail, vehicle history) that need creation-time capability context, or explicitly re-defer with a reason |
| **4** — Operations Spine | Router-mediated `WorkOrder.status`, gate evaluation, sole-writer lifecycle service | ✅ Complete | Router-only status write confirmed by repo-wide grep — the load-bearing CLAUDE.md rule holds | None found | None | None | `apps/api/src/operations/work-order-lifecycle.service.ts:120-122` is the *only* status write outside specs | No action needed |
| **5** — Branch Manager | First real role UI: Attention Center, Intake, Work Orders, Approvals, Delivery, Team Setup | ✅ Complete | 3/6 PASS, 3 not independently re-verified (empty states, count-to-list linkage) | Not disproven — simply not re-checked this pass | None | None | `attention.api.ts`, `intake-draft.ts`, `work-order-workspace.ts` — all real `HttpClient` calls, no stub data found | Optional: a follow-up pass could independently verify empty-state/count-linkage criteria |
| **6** — Technician | 3-page shell, density layer, 10-tool Work Card, Finish Gate preview | 🟡 Partial | Shell/gate PASS; Work Card's own named tools incomplete | **No standalone "add note"/"add photo" tool; no "request a part" tool anywhere in API or web** | None | None | Self-documented at `PROJECT_STATE.md:216`; confirmed by grep of `technician.controller.ts` | Build the missing note/photo/part-request tools, or formally re-scope the "10 tools" claim |
| **7** — Inventory | Catalog, stock, part-request lifecycle, returns, movements ledger, 6 pages | ✅ Complete | All PASS | None remaining | Historical "3 of 6 pages" gap — now closed, all 6 routed | None | `apps/web/src/app/app.routes.ts:247-281`, `inventory-returns.ts:62-166` | No action needed |
| **8** — Finance Core | Money arithmetic, running balance, invoice issue, idempotent payments; refunds explicitly deferred to 9 | ✅ Complete (as scoped) | All PASS | None | Refunds → delivered in Phase 9, confirmed real | None | `tools/lint-money.mjs`, `finance.service.ts:463-484` | No action needed |
| **9** — Billing/Invoicing | Module boundary, `GenericBillingAdapter`, refund→credit-note, `compliantBlocked` visibility | 🟡 Partial | 5/6 PASS | **`compliantBlocked` computed and stored but never surfaced on the Workshops list/drawer** — this is a numbered, unconditional exit criterion, not a "nice to have" | None | None | Self-documented at `PROJECT_STATE.md:123` (phrased as non-blocking — understates that it's a named exit criterion); zero UI references confirmed by grep | Add the badge/column to `workshops-page.html`/`workshop-drawer.html` — small, scoped fix |
| **10** — Team Leader & Owner Home | Team Leader role (4 pages, visibility-only), Owner Home (6 cards) | ✅ Complete | All PASS, after 2 historical false-completion incidents | None remaining | 6 Owner pages deferred → all now built in later phases (confirmed) | Gate stubs `review.team_review_passed`/`qc.passed` remain hardcoded `true` **by explicit, documented design** (state-reachability-as-proof), not a hidden regression | `default-role-permissions.ts:112-119`, `team-leader.controller.ts` routed and tested | No action needed; the hardcoded gates are a known, named open decision, not new debt |
| **11** — Customer Portal | 5 authenticated portal surfaces | ✅ Complete | All PASS | None | Fuller Current Service lifecycle strip — deferred, not built | `PermissionResolverService` gap: customer sessions bypass it entirely — documented, not silently patched | `customer-portal.controller.ts`, `customer-portal.integration.spec.ts:128` (privacy test) | No action needed this pass; permission-engine gap remains an open, named decision |
| **12** — Reporting & Data Analyst | Company-wide report (technician performance, throughput, finance) behind `reports.company.view` | 🟡 Partial | Backend PASS, frontend **FAIL** | **`ReportingController`/`ReportingService` fully built and tested but has zero frontend callers anywhere in the repo** — this phase's primary deliverable is orphaned. The Data Analyst UI that does exist (6/7 pages) runs on an entirely separate, later, undocumented-by-this-phase API surface (`/api/v1/analytics/*`) | Exports, saved views — deferred, not built; point-in-time snapshots — deferred to 19.G, tracked as P-52, still unresolved | `reports.company.view` permission and its backend exist but serve no page; possible silent closure of P-67 (workshop-defined field queryability decision) window — no evidence P-67 was decided before the later analytics build shipped | `apps/api/src/reporting/reporting.controller.ts` — zero matches in `apps/web`; `docs/POLICY_DECISION_INVENTORY.md:1073` (P-52), `:1278` (P-67) | Decide whether to build a frontend for the existing `ReportingController`, retire it, or formally fold it into the analytics subsystem — currently dead code from a product standpoint |
| **13** — System Automation | Fix `@nestjs/schedule` double-firing via Postgres advisory lock | ✅ Complete | All PASS | None | Separate worker deployable — explicitly declined until a real job justifies it | None | `scheduler-lock.service.ts:33-42`, `heartbeat.job.ts:31-37` | No action needed |
| **14** — Internationalization & Release Readiness | Narrowed to: permission-key linter, one perf fix, security review of that diff | ✅ Complete (narrowed scope, honestly disclosed) | All PASS against the narrowed scope | **Translation/i18n pass proper — not done at all**, despite the phase's own title | Translation pass — deferred, no target phase assigned; summary tables — deferred, no target phase | Phase title materially overstates content; a reader trusting the title alone would wrongly assume i18n shipped | `tools/lint-permission-keys.mjs`, migration `20260813000000_work_order_customer_index` | Worth a scoping decision: assign the translation pass to a phase, given Arabic is a named primary market in `CLAUDE.md` |
| **15** — Specialization Discovery | Schema verdicts for 5 specialization primitives | ✅ Complete (against own bar: 3/5 required proven end-to-end, delivered) | Met | Position taxonomy, blocker-reason-definition: schema-only, zero consuming callers — explicitly scoped that way, not a hidden gap | None | Two primitives inert until a future consumer wires them — real but self-disclosed | `specialization.integration.spec.ts:96-238` | No action needed |
| **16** — Specialization Structure | Structural concepts (16.A–16.I) specialization attaches to | ✅ Complete (against own minimum bar: 16.A/E/H + 16.I spike) | Met | 16.B–16.G explicitly deferred, confirmed not built (none silently claimed) | 16.B (resources) → circular dependency with Phase 17, still open (see below) | Attachment model (16.H) shipped with **zero callers anywhere** — same "inert, self-disclosed" pattern as Phase 15 | `WorkOrder.promisedAt`, `AttentionQueueService.slaOverruns()` wired end-to-end into a real page; `Attachment` model has zero non-schema references | No action needed against stated bar; 16.H needs a consumer before it does anything |
| **17** — Specialization at Creation | Super admin declares specializations at workshop creation, not later | 🟡 Partial | Backend seam PASS, frontend **FAIL** | **`starterSpecializationProfile` DTO field is unreachable from any UI** — zero references anywhere in `apps/web`; 17.B (branch definition), 17.C (bulk staff), 17.D (bulk data import), 17.E (regional-manager role) all wholesale unbuilt | All four sub-items explicitly deferred-for-budget in the doc, not silently dropped | **Confirmed live circular dependency**: 16.B (resources) waits on 17's setup-time authoring; 17 never built any resource authoring UI (only an unrelated 2-value enum). `POLICY_DECISION_INVENTORY.md` S-01b correctly reflects this as still-open | `platform.service.ts:194-297`, `add-workshop-page.ts/.html` (no specialization picker found) | Decide whether to build the frontend picker for the existing backend seam, and whether to break the 16.B↔17.A circular dependency by scoping a minimal resource-authoring slice |
| **18** — Tenant Relationships | Stakeholders, archive/reactivate lifecycle, tenant grouping | 🟡 Partial | 18.A/D/E shipped and verified; 18.B/C deferred by decision; 18.F correctly decision-only | None beyond named deferrals | 18.B/C — deferred with stated reasons | None | `TenantStakeholder`, `TenantLifecycleService`, `TenantGroupService.summary` | No action needed; deferrals are legitimate |
| **19** — Governance Depth | Deeper governance: separation of duties, plus 19.B–19.G | 🟡 Partial | 19.B/C/D shipped and tested; 19.A attempted-and-reverted; 19.E/F/G deferred with reasons | **19.A (separation-of-duties hard block) was built, broke 22 existing tests, and was deliberately reverted** — data foundation (`approvedById`) kept, enforcement not | 19.E/F/G — deferred with stated reasons | 19.A is the one item in the whole 1-21 range needing an actual fresh design pass, not a retry of the same approach | In-session verification this audit | 19.A needs a product/architecture decision before a second implementation attempt, not a repeat of the reverted approach |
| **20** — Operational Resilience at Scale | Concurrency/scale hardening | 🟡 Partial | 20.B (REPEATABLE READ fix) verified real; 20.E correctly decision-only (no offline clients); 20.A/C/D/F deferred with reasons | None beyond named deferrals | 20.A/C/D/F — deferred with stated reasons | None | `permission-context.service.ts` (REPEATABLE READ transaction) | No action needed; deferrals are legitimate |
| **21** — Policy & Decision Architecture | Formalize the Policy/Architecture Decision Inventory itself | ✅ Complete | Met, re-verified via its own conformance review | One minor doc-consistency note (§18 vs §18a language), not functional | None | None | `docs/POLICY_DECISION_INVENTORY.md` | No action needed |

---

## Phase Debt Register (deduplicated)

*Every unfinished obligation, listed once, tagged with origin and current status. This is the canonical list — later sections (Dependency Graph, What We Actually Owe) reference these IDs rather than restating them.*

| ID | Origin | Description | Status |
|---|---|---|---|
| D1 | Phase 6 | Technician Work Card missing standalone note/photo tools and a "request a part" tool | OPEN — self-documented `PROJECT_STATE.md:216` |
| D2 | Phase 9 | `compliantBlocked` computed/stored, never surfaced on Workshops list/drawer | OPEN — unconditional exit criterion, unmet |
| D3 | Phase 12 | `ReportingController`/`ReportingService` fully built, tested, zero frontend callers | OPEN — orphaned primary deliverable |
| D4 | Phase 3 | `CapabilityResolutionService.resolveAsOf()` built, tested, zero production callers | OPEN — work orders read under today's capabilities, not creation-time |
| D5 | Phase 1 (ongoing) | `role_permission_lock` `ControlSetting` has no writer anywhere in the codebase | OPEN — cross-referenced from the earlier 53-page audit, blocks 3+ features |
| D6 | Phase 6 ↔ 7 boundary | Inventory's part-request/return lifecycle has no Technician-side origination path | OPEN — round-trip never closes |
| D7 | Phase 16 ↔ 17 boundary | 16.B (resources) ↔ 17.A (setup-time authoring) — confirmed live circular deferral | OPEN — `POLICY_DECISION_INVENTORY.md` S-01b accurately reflects it |
| D8 | Phase 12 / Data Analyst | P-67 (workshop-defined field queryability) — no evidence it was decided before the 6-page analytics build shipped | OPEN — needs verification with whoever owns P-67 |
| D9 | Phase 19.A | Separation-of-duties hard block — attempted, broke 22 tests, deliberately reverted; `approvedById` kept, enforcement not | OPEN — attempted-and-reverted, needs fresh design, not a retry |
| D10 | Phase 14 | Full translation/i18n pass — never done despite the phase's own title | OPEN — deferred, no target phase assigned |
| D11 | Phase 14 | Summary tables | OPEN — deferred, no target phase assigned |
| D12 | Phase 12 | Exports, saved views, point-in-time snapshots (tracked as P-52) | OPEN — unresolved structural debt |
| D13 | Phase 16 | 16.C (linkage), 16.D (payer attribution), 16.F (location/site), 16.G (addenda) | OPEN — explicitly and honestly deferred |
| D14 | Phase 17 | 17.B (branch definition at onboarding), 17.C (bulk staff provisioning), 17.D (bulk data import), 17.E (regional-manager role) | OPEN — deferred-for-budget, confirmed not silently claimed done |
| D15 | Phase 18 | 18.B, 18.C | OPEN — deferred with stated reasons |
| D16 | Phase 19 | 19.E, 19.F, 19.G | OPEN — deferred with stated reasons |
| D17 | Phase 20 | 20.A, 20.C, 20.D, 20.F | OPEN — deferred with stated reasons |
| D18 | Phase 11 | Fuller Current Service lifecycle strip | OPEN — deferred, not built |
| D19 | Phase 11 | `PermissionResolverService` — customer sessions bypass it entirely | OPEN — documented, not silently patched |
| D20 | Pre-existing (53-page audit) | `TenantConfigurationVersion` model exists, zero code references — no Builder Control rollback service | OPEN — cross-referenced, not re-verified this pass |
| D21 | Pre-existing (53-page audit) | `Plan.allowedExports` field does not exist — blocks Data Analyst's Export permission | OPEN — cross-referenced, not re-verified this pass |

**Already resolved later — do not re-flag as debt:**

| Origin | What was deferred | Where it landed |
|---|---|---|
| Phase 1.6 | Resolver query caching | Phase 3 — confirmed, constant 6-query cost regardless of key count |
| Phase 3.E | Super Admin capability-shaping UI | Phase 5.F — confirmed, `TeamSetupPage`/`capabilities-page` |
| Phase 7 | "3 of 6 pages" historical gap | Closed — all 6 pages now exist and are routed |
| Phase 10 | "Controller with no caller" historical gap (`TeamLeaderController`, `OwnerHomeController`) | Closed — both now routed and tested |
| Phase 8 | Refund flow | Phase 9 — confirmed real (`finance.service.ts` `requestRefund`/`approveRefund`/`rejectRefund`), not a stub |
| Owner Home | 6 originally-deferred pages (Organization & Access, Forms & Fields, Messages & Templates, Pricing & Financial Configuration, Reports & Analytics, Workflow Health) | All now built in later phases, per recent commit history |

**Architectural rework (needs a design decision, not a build):** D9 is the only item across Phases 1–21 in this category. No other 🟣 Needs Rework classification was found — both regional audits explicitly checked for architectural drift and found none.

---

## Cross-Phase Dependency Graph

*Format: unfinished obligation → what it blocks.*

- **D5** (`role_permission_lock` has no writer) → blocks the Governance Controls subsystem (named in the earlier 53-page audit as the next unbuilt cluster) and 2 other permission-editing features that depend on lock/unlock being writable.
- **D20** (`TenantConfigurationVersion` — no rollback service) → blocks the Builder Control rollback feature.
- **D4** (`resolveAsOf` uncalled) → blocks accurate historical interpretation of work orders and vehicle history under changed capabilities. Not a hard block (nothing errors) — it silently produces the wrong answer, which is arguably worse.
- **D1** (Technician tools incomplete) → blocks **D6** (the Phase 6↔7 round-trip) from ever closing in practice — the missing "request a part" tool is the same gap from both ends.
- **D2** (`compliantBlocked` not surfaced) → blocks the Platform Super Admin's ability to see per-tenant legal/compliance exposure — the entire stated purpose of the flag is unreachable today.
- **D8** (P-67 undecided) → blocks safe, principled use of workshop-defined custom fields in any analytics query. This is a decision blocker, not a code blocker.
- **D7** (16.B ↔ 17.A circular) → blocks each other, and both together block S-01b (resource occupancy/scheduling), which is otherwise evidence-backed and prebuilt-activatable per `POLICY_DECISION_INVENTORY.md`.
- **D9** (19.A reverted) → blocks any future separation-of-duties enforcement until a new design is chosen; nothing currently depends on it downstream, so it blocks only itself.
- **D3** (`ReportingController` orphaned) → blocks nothing structurally (the Data Analyst subsystem bypassed it entirely), but represents stranded, unreferenced effort that a decision needs to resolve one way or another.
- **D10** (i18n pass never done) → blocks genuine Arabic-market readiness — a business-level blocker, not a technical dependency for any other phase.
- **D21** (`Plan.allowedExports` missing) → blocks the Data Analyst role's Export permission specifically.

No dependency chain in this graph reaches back into Phases 1–5's foundational architecture — every block terminates at an additive feature or a named decision, not at core infrastructure.

---

## What We Actually Owe — unified backlog

*One deduplicated list, referencing the Debt Register IDs above. Ordered by architectural leverage, then blocking impact, then business value, then implementation cost, then risk — descriptive ranking only, not a chosen sequence.*

| Rank | ID | Item | Architectural leverage | Blocking impact | Business value | Implementation cost | Risk | Bucket |
|---|---|---|---|---|---|---|---|---|
| 1 | D5 | Write path for `role_permission_lock` | High — foundational permission primitive | High — blocks Governance Controls + 2 features | Medium | Small–Medium | Low | **Safe to implement now** |
| 2 | D9 | Redesign decision for separation-of-duties (19.A) | High — governance depth | Low downstream, but compounds if deferred further | Medium–High | Unknown until scoped | High if re-attempted naively | **Must remain blocked** — needs a design decision before any code |
| 3 | D8 | P-67 decision (workshop-defined field queryability) | High — shapes all future analytics data access | High — blocks safe custom-field querying | High | N/A (decision, not code) | High if left undecided while more analytics ships | **Must remain blocked** — decision required first |
| 4 | D7 | 16.B ↔ 17.A resource-authoring scope decision | Medium | Medium — blocks S-01b | Medium | Medium once scoped | Low | **Must remain blocked** until minimal scope is chosen |
| 5 | D4 | Wire `resolveAsOf` into work-order/vehicle-history read paths | Medium — correctness, not architecture | Low (silent wrongness, not an error) | Medium | Small | Low | **Safe to implement now** |
| 6 | D2 | Surface `compliantBlocked` on Workshops UI | Low architecturally | Medium — restores a named exit criterion | High — legal/compliance visibility | Small | Low | **Safe to implement now** |
| 7 | D20 | Builder Control rollback service for `TenantConfigurationVersion` | Medium | Medium — blocks rollback feature | Medium | Medium | Low | **Safe to implement now** |
| 8 | D1 / D6 | Technician note/photo/part-request tools (closes the Phase 6↔7 round-trip) | Low architecturally | Medium — closes an incomplete round-trip | Medium–High — daily workflow completeness | Medium | Low | **Safe to implement now** |
| 9 | D21 | Add `Plan.allowedExports` | Low | Low — single permission unlock | Low–Medium | Small | Low | **Safe to implement now** |
| 10 | D3 | Decide `ReportingController`'s fate (build frontend / retire / fold into analytics) | Low | Low (nothing depends on it) | Low–Medium | Small–Medium once decided | Low | **Must remain blocked** until the decision is made — implementing before deciding risks building the wrong thing twice |
| 11 | D10 | Full translation/i18n pass | High business stakes, low architectural coupling | Low (blocks a market, not other phases) | High | Large | Medium (scope creep risk) | Should be deliberately scheduled — **not abandoned**, needs a scoping decision |
| 12 | D12 | Point-in-time reporting snapshots (P-52) | Medium — data-integrity/dispute-resolution question | Low today | Medium | Large | Medium | **Should remain deferred** until real demand (a dispute) makes the cost concrete |
| 13 | D14 | Phase 17.B–17.E (branch definition, bulk staff, bulk import, regional-manager role) | Low individually | Low | Low until multi-branch onboarding volume increases | Large (4 separate features) | Low | **Should remain deferred** — legitimately low priority at current scale |
| 14 | D13, D15, D16, D17, D18, D19, D11 | Remaining named deferrals (16.C/D/F/G, 18.B/C, 19.E/F/G, 20.A/C/D/F, Current Service strip, customer-session permission gap, summary tables) | Low–Medium, case by case | Low | Low–Medium | Varies | Low | **Should remain deferred** — each already carries a stated reason and no evidence of urgency |

**Buckets, restated plainly:**

- **Should be completed before continuing to Phase 22+:** none of the items strictly require this — no phase's foundational architecture is unfinished. D5 and D9 are the two most likely to compound the longer they're left, since later phases will keep building on the permission/governance core, but neither is a hard prerequisite.
- **Safe to implement now** (no blocking dependency, already scoped): D5, D4, D2, D20, D1/D6, D21.
- **Must remain blocked** until a decision is made, not more code: D9, D8, D7, D3.
- **Should be intentionally deferred** (not abandoned — named and reasoned): D10 (needs scoping, not abandonment), D12, D14, and the remaining long tail (D13/D15/D16/D17/D18/D19/D11).

No final priority order across these has been chosen — the ranking above is descriptive (leverage/blocking/value/cost/risk), not a decided sequence. That's for us to do together.

---

## Answering the two questions directly

**Are we genuinely at Phase 21, or do earlier phases have unfinished obligations that require going back first?**

Genuinely at Phase 21, with qualifications. The foundational architecture audited most aggressively — permission-layer ordering, the capability engine sitting above role/user, the sole-writer rule for `WorkOrder.status`, money-as-string serialization, resolver query-count caching — holds under direct, adversarial verification (repo-wide greps for the exact anti-patterns the project has been burned by before), not just doc claims. Phases 1–5 in particular show no instance of the "declared complete, actually missing" failure mode this audit was built to catch.

What exists instead is 5 concrete Category-A items and 4 Category-B items — real, but all additive or connective, not foundational. None require redoing earlier architectural work. The one item that did touch architecture (Phase 19.A) was already cleanly reverted, leaving no half-built state behind it. So there is no obligation to go backward before continuing; the obligations that exist can be picked up from where the project stands today.

**If continuing forward is allowed, what is the cleanest implementation frontier?**

Presented as facts, not a recommendation:

- Category A items are each small and scoped: a UI badge (Phase 9), two technician tools plus one endpoint (Phase 6), wiring one already-tested service into an existing read path (Phase 3), and a writer for one `ControlSetting` type (pre-existing finding).
- Category B items require either a scoping decision before any code (P-67, the 16.B/17.A resource-authoring slice) or a decision about what to do with orphaned but working backend code (Phase 12's `ReportingController`: build a frontend, retire it, or fold it into the analytics subsystem).
- Category C has exactly one item (Phase 19.A), and it needs a design decision before any second implementation attempt — not a default next step.
- The earlier 53-page implementation audit separately named Governance Controls as the next unbuilt subsystem cluster; nothing in this phase-level audit contradicts or supersedes that finding — it sits alongside these items as a still-valid, separate frontier.

No priority or sequencing across these has been chosen here, per your instruction — that's for us to decide together.
