# Merge: policy engine mission → directory reorg

**Date:** 2026-08-22
**Branches:** `claude/jolly-cray-as9y2r` (this mission) merged onto `main`
**Working branch for the merge itself:** `merge/policy-engine-into-reorg`, created from `origin/main` after fast-forwarding local `main`

---

## Why this was needed

`claude/jolly-cray-as9y2r` branched from `main` at commit `95d8f2b`, before two large, unrelated pieces of work landed on `main`:

1. A full directory reorganization of `apps/api/src` and `apps/web/src` into layered structures (`audit/`, `runtime/`, `identity/`, `control/`, `systems/`, `experiences/`, `insights/` on the API side; `runtime/`, `ui/`, `domain/`, `experiences/` on the web side) — see `REORGANIZATION_REPORT.md` and `CODE_MAP.md`.
2. A new authenticated customer-portal decision flow (`CustomerDecisionService.listForCustomer`/`respondAsCustomer`, the shared `DecisionAnswer` component, `record-approval-drawer.*`) and a documentation-consolidation pass (`PROJECT_STATE.md`, `docs/PAGE_INVENTORY.md`, `docs/PHASE_MAP.md`).

Meanwhile `claude/jolly-cray-as9y2r` carried the entire "policy engine — backend-first hard implementation" mission: converting `DISCOUNT_AUTHORITY`, `QC_MANDATORY`, `UNCOVERED_COUNTRY_BILLING`, `TIME_TRACKING`, `WORKING_WEEK`, `POST_CLOSE_ADDENDA` and `APPROVAL_WEIGHT` from `RECORDED` to real, `ENFORCED` backend behaviour — the last of which (`APPROVAL_WEIGHT`) was finished immediately before this merge began. All 16 registered policies are now `ENFORCED`.

Neither side had the other's work. A straight `git merge` produced **62 conflicting paths**: 13 genuine content conflicts, 14 directory-rename ambiguities, 4 modify/delete conflicts (files this mission edited that the reorg also moved), plus a handful of downstream issues (stale relative imports, a stale Prisma client, test fixtures assuming the older 2-item decision-request shape) that only surfaced once the conflict markers themselves were gone.

## What the merge actually is

Not a blind "pick a side." Every conflict was read and reconciled by hand:

- **Directory-rename conflicts** (e.g. `dead-consumers.spec.ts`, `add-note.dto.ts`, four onboarding-journey components): git had already placed this mission's new files at the correct new-layout path; these just needed `git add` to confirm, plus a pass for relative imports written for the old path (`shared/button/button.directive` → `ui/button/button.directive`) and one file's own `path.resolve(__dirname, ...)` depth (`dead-consumers.spec.ts` moved one directory deeper, so its two source-tree roots needed an extra `..`).
- **Modify/delete conflicts** (`technician.controller.ts`/`.dto.ts`, `decision-page.ts`/`.html`): the reorg had moved or, for the customer decision page, refactored these files out from under this mission's edits. The mission's actual diff (from `git diff 95d8f2b claude/jolly-cray-as9y2r -- <path>`) was re-applied onto the file's new shape — for the decision page, that meant porting the `requiresAcknowledgement`/`APPROVAL_WEIGHT` wiring into the new shared `DecisionAnswer` component (`apps/web/src/app/domain/decisions/decision-answer.ts`/`.html`), which the reorg-side session had extracted from the old `decision-page.ts` to share between the token link and the new authenticated portal.
- **Content conflicts** in shared plumbing that both sides had genuinely extended for different reasons:
  - `CustomerDecisionService`: reconciled by keeping the reorg side's `present()`/`detailForStaff`/`listForCustomer`/`respondAsCustomer` architecture and extending `present()` to also resolve `APPROVAL_WEIGHT` (via a new `approvalWeight()` helper, resolved once per caller rather than once per item).
  - `FinanceService.emit()`: both sides had added a different 7th parameter to the same private method — the reorg side's `workOrderId?` (for customer-timeline messages) and this mission's `targetType: string = "Invoice"` (for the discount-authority work). Kept both as separate parameters and fixed the three discount call sites to pass `undefined` for `workOrderId` (unchanged behaviour) and `"WorkOrder"` for `targetType` in the new, later position.
  - `AttentionQueueService`, `WorkOrderDossierService`, `WorkOrderLifecycleService`, `branch-manager.controller.ts`/`.module.ts`: import-path-only conflicts (old flat path vs. new layered path) plus, for the lifecycle service, one genuinely orphaned doc-comment left stranded above the wrong method by the 3-way merge, moved back into place.
  - `default-role-permissions.ts`, `PROJECT_STATE.md`, `docs/PAGE_INVENTORY.md`, the onboarding page's CSS: additive or narrative reconciliation — see the merge commit for the exact text. `PAGE_INVENTORY.md` also had a genuine pre-existing inconsistency (a section header claiming "5 ✅, 1 🟡" that didn't match either side's own row content once Platform Reports was correctly marked 🟡); corrected to "4 ✅, 2 🟡" while resolving.
  - `onboarding-page.css`: this mission had added sticky-rail styles (`.onb-rail-*`) for a stage-navigation rail that the reorg side's rebuilt `onboarding-page.html` no longer renders (confirmed by grep — zero references). Dropped rather than reintroduced as dead CSS.
- **Downstream fixes found only after the conflict markers were gone:**
  - `technician-work.service.ts` had an unconflicted but stale import of `PolicyResolutionService` at the old path.
  - The generated Prisma client (`@mop/database`) was stale relative to the merged `schema.prisma` (main had added `RunningInvoiceLine.sourceType`/`sourceId` via its own migration) — regenerated with `prisma generate`, and the test database brought current with `db:test:prepare` (which also picked up main's `20260820103000_running_invoice_line_source` migration).
  - Five test files (`billing.integration.spec.ts`, `finance.integration.spec.ts`, `inventory-walkthrough.integration.spec.ts`, `part-request.integration.spec.ts`) constructed `WorkOrderLifecycleService` with 4 arguments; this mission's earlier QC_MANDATORY work had added a 5th (`PolicyResolutionService`) that these main-side-only test files never picked up.
  - One main-side test (`decision.integration.spec.ts`, "records an answer that the token page then agrees with") answered only 2 of the 3 items `makeRequest()` now creates — this mission added a third (`highItemId`) fixture item earlier in the APPROVAL_WEIGHT work, after that test was written on `main`. Fixed to answer all three.

## Verification

- `corepack pnpm typecheck` (shared + api): clean.
- `corepack pnpm --filter @mop/shared test`: **243/243 passed**.
- `corepack pnpm --filter @mop/web run build`: clean (pre-existing CSS budget warnings only, unrelated to this merge).
- `corepack pnpm --filter @mop/web run test` (vitest): **255/255 passed**.
- Targeted API integration suites covering every file this merge touched (`decision`, `finance`, `billing`, `technician-work`, `work-order-lifecycle`, `work-order-dossier`, `attention-queue`, `onboarding`, `dead-consumers`), against real Postgres: **199/199 passed** after the fixes above.
- Full `@mop/api` suite (`jest --maxWorkers=2`, all integration + unit tests): **839/839 passed, 94 suites, 56.9s.** (A first attempt at the full suite, before the fixes above were complete, was killed for resource reasons — Postgres itself went down under the load and had to be restarted; the second attempt, after `db:test:prepare` re-ran against the restarted server, completed cleanly.)
- Full six-linter gate (`corepack pnpm run lint` — ESLint, audit-boundary, directional-CSS, touch-targets, money, permission-keys, no-hard-delete): **all seven checks clean.**

Every check the project's own toolchain runs is green on the merge commit.

## What's left

1. **Regenerate `docs/POLICY_COVERAGE_MATRIX.md`.** It still reflects an early state of the registry (9 ENFORCED / 7 RECORDED); the real number as of this merge is 16 ENFORCED / 0 RECORDED. Not done as part of this merge — it's a content regeneration task, not a conflict this merge needed to resolve.
2. **`PROJECT_STATE.md` §1–§13** (the "Current objective" / "Where we are" / phase-history sections) were carried through from `main`'s side unconflicted, and by that side's own admission may cite pre-reorg file paths in places — not re-verified as part of this merge, since this merge's own §0 entry documents what changed here without touching those older sections.
3. **This mission's own remaining, previously-deferred items** (from the original policy-engine mission brief, not created by this merge): re-verify all 16 now-ENFORCED policies' consumers are still real and reachable post-merge (the dead-consumers check covers this mechanically and passed, but a human read of the registry against the new file layout has not been done); a final consolidated browser-verification pass with a live API server has not been repeated since before this merge.
4. Once 1 is done, this report can be folded into `PROJECT_STATE.md`'s next entry rather than kept as a standalone file.
