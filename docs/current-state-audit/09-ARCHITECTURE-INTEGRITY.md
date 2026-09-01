# 09 — Architecture and Source-of-Truth Integrity

Findings only; nothing fixed. Format: current design → why it's a problem → evidence → recommended direction.

## 1. Two vocabularies of "policy" (documentation-level duplication)
**Design:** P-01…P-84 decision inventory vs 16-entry runtime registry share the word "policy" with different machinery.
**Problem:** status docs conflate them ("Phase 21 documents-only, zero implementation" sits beside a shipped registry); owners cannot tell what exists.
**Evidence:** `docs/POLICY_DECISION_INVENTORY.md` header vs `packages/shared/src/policies/registry.ts`; MERGE_REPORT §leftovers naming the stale matrix.
**Direction:** rename one layer (e.g., "decision register" vs "workshop policies") in docs; single canonical coverage matrix.

## 2. Branch scoping: dead abstraction vs living convention with opposite semantics
`ScopeResolverService.filterBy()` treats empty scope as match-nothing; every real service treats empty as see-everything, hand-rolled.
**Problem:** two contradictory definitions of the same concept; the tested one is unused; new code can pick the wrong one silently.
**Evidence:** `identity/access/scope-resolver.service.ts` zero production callers; convention sites listed in Report 11 §2.
**Direction:** delete or align filterBy; centralize scope→Prisma-filter in one helper.

## 3. Lifecycle trigger ownership gap (the spine break)
Graph declares intents; lifecycle owns writes; **nobody owns invoking early-stage intents**. BM advance covers review/QC only; tech actions deliberately don't move WOs.
**Evidence:** Report 01 §2.2.
**Direction:** assign each intent an owning endpoint before any other feature work.

## 4. Hardcoded-true gates that no edge references
`review.team_review_passed`, `qc.passed` return true while appearing on no edge — simultaneously violating the repo's own no-hardcode rule and being dead.
**Evidence:** `gate-evaluator.service.ts:192–198`.
**Direction:** either wire real TeamReview/QC records to them or remove from evaluator until edges exist.

## 5. Permission tables identical across shapes by design
Baseline RolePermission seeded for all 7 roles regardless of capabilities; differentiation delegated entirely to layers.
**Problem:** defensible (comment platform.service.ts:531–537) but makes DB inspection lie about behavior; also means responsibility grants duplicate capability knowledge in rows.
**Direction:** keep design; document loudly; consider a `capability-shape snapshot` view for admins.

## 6. UI business logic kept honest — one exception
Journey strip/dossier/decisions correctly server-owned. Exception: attention watch-tiles & row actions computed client-side then wired to no-ops (`attention-center.ts:127–136`) — presentation pretending toward interactivity.
**Direction:** either route actions to existing endpoints (most targets exist: approvals/delivery/payments) or render read-only.

## 7. Orphaned first-generation surfaces (parallel implementations)
`experiences/platform/add-workshop/*` superseded by onboarding but still compiled with its own uniqueness validator; `STARTER_SPECIALIZATION_PROFILES` coexists with packs; `FinanceApi.jobTotal()` uncalled; `/reporting/company` superseded by analytics.
**Problem:** drift risk — two answers to "how do we add a workshop / what are starter profiles".
**Direction:** delete or archive behind clear deprecation notes.

## 8. Money-lint scope omits billing
`lint-money.mjs` covers finance/inventory/operations/shared but not `systems/billing` (which issues invoices) nor insights.
**Evidence:** tools/lint-money.mjs scope list.
**Direction:** extend scope.

## 9. Vocabulary inconsistencies
Permission layer count narrated as 8/10/11 across files (`permission-resolver.service.ts` header vs CLAUDE.md vs PHASE_MAP); VISION says five systems (SYSTEMS.md says six); INSPECTION_REQUIRED lacks a P-number; two tenant names in docs ("Delta Quick Service" vs "n Service").
**Direction:** docs sweep; make resolver self-describe its array length.

## 10. Suspicious coupling found
BM `advance` derives permission from state inside the controller and skips branch-view check — coupling authorization to graph position at the edge layer rather than the service (Report 11 §3). Customer portal intentionally bypasses resolver (documented) — acceptable, but it means permission changes never affect customers; any future staff-like customer capability needs its own model.

## 11. Duplicate constraint sets / schema residue
Five stock CHECKs exist twice under different names (init vs `20260809203000`); dead columns (`isFinalified` family); FK-less tenantId on ~15 tables.
**Direction:** consolidation migration eventually; FKs where feasible.

## Overall architectural integrity verdict
Boundaries (systems vs experiences, audit write boundary, money discipline, single status writer) are **real and enforced** — this is far cleaner than typical builds at this stage. The integrity problems concentrate in *reachability* and *naming*, not structure.
