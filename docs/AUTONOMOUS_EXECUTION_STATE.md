# Autonomous Execution State

This document tracks the current Codex autonomous run. It is not a replacement for project documentation.

## Current Phase

Implementation, after documentation and source audit.

## Current Subsystem

Governance Controls / Limits & Entitlements.

## Completed Tasks

- Documentation-first takeover pass completed.
- Source audit completed for the current priority set.
- Isolated branch created: `codex/autonomous-mop`.
- Local `.env` created from `.env.example`.
- `@mop/shared` built successfully.
- `corepack pnpm -r typecheck` passes after building `@mop/shared`.
- `TIME_TRACKING` is exposed on the Technician Work Card API payload.
- Technician Work Card supports minute entry for `TIME_TRACKING=OPTIONAL` and requires whole minutes for `TIME_TRACKING=REQUIRED`.
- Technician Work Card hides time entry and posts no minutes for `TIME_TRACKING=OFF`.
- Backend and frontend focused tests cover the time-tracking policy path.
- `FinanceConfiguration.compliantBlocked` is projected on Platform Workshops list rows and details.
- Platform Workshops list shows a dedicated Compliance badge beside Builder and Health.
- Platform Workshop drawer shows the itemized compliance warning when local billing is not covered.
- Backend and frontend focused tests cover the compliance projection and rendering path.
- Work-order dossier now resolves capability deviations with `CapabilityResolutionService.resolveAsOf()` at the work order's opened-at timestamp.
- Dossier drawer renders the workshop shape that was in force when the job opened.
- Backend and frontend focused tests cover the historical dossier capability path.
- Access Denied is a real routed public support page and unknown post-login landing pages now route to it.
- Password Reset has dedicated token fields, migration, non-enumerating request endpoint, token validation/completion endpoints, and public reset UI.
- Backend and frontend focused tests cover the password-reset support path.
- Data Analyst saved views now have a persistent `AnalystSavedView` model, migration, tenant/account ownership, and `analytics.saved_views.manage` permission.
- Analytics API exposes saved-view list/get/create/rename/delete, always using the current session's tenant/account rather than client-supplied ownership.
- The five analytical pages expose Save This View actions, Analytics Home renders saved-view shortcuts, and `/analyst/saved-views` supports Open/Rename/Delete.
- Data Analyst export remains deliberately deferred because no export file endpoint exists yet; the required plan-level `allowedExports` entitlement now exists and gates `analytics.export`.
- `PAGE_INVENTORY.md`, `PHASE_MAP.md`, and `PROJECT_STATE.md` now reflect 46 complete + 7 partial + 0 missing pages.
- Analytics Home now composes all five analytical service tiles, including Feature Adoption, rather than leaving the Feature Adoption page out of the home cross-section.
- The legacy `reports.company.view` backend surface remains live but now applies the current session's assigned branch/category scope to technician metrics, throughput, blockers, and finance totals.
- `Plan.allowedExports` and `analytics.export` are implemented; the permission resolver locks export permission when a workshop's plan has no allowed export categories.
- The Saved Views / Exports page now reflects plan entitlement truth: plan-locked when `analytics.export` denies, and links out to each analytical page's own Export action when the plan permits exports.
- **Data Analyst Export is now real, not deferred.** `GET /analytics/export/:category` (`apps/api/src/insights/analytics/analytics-export.service.ts` + `csv.util.ts`) re-runs the same `build()` each analytical page calls and streams a real CSV, gated by `analytics.export` and then, per category, `Plan.allowedExports`. Every export writes a `LOW`-risk `analytics.export.generated` audit row. All 5 analytical pages carry their own `ExportAction` button. Proven by a real-HTTP integration test (success, plan-category-denied, plan-empty, unauthenticated) plus a unit test for the CSV serializer, and by hand against the real dev DB and a running API process logged in as the seeded Data Analyst. `docs/PAGE_INVENTORY.md` now reads Data Analyst 7/7 ✅.
- Fixed in passing: `login-page.spec.ts` asserted the pre-Access-Denied fallback route; updated to match `identity/landing.ts`'s intentional `/access-denied` behavior for an unrecognized landing page.

## Current Task

Governance Controls / Limits & Entitlements: per-workshop governed overrides is the one item still open from this subsystem.

## Remaining Tasks

- Inspect whether per-workshop Limits & Entitlements should be modeled as `ControlSetting` overrides on top of the plan fields (`allowedModules`, `allowedFeatures`, `allowedReports`, `allowedExports`, `maxBranches`/`maxUsers`/`maxWarehouses`) — i.e. can Super Admin narrow one workshop below its plan's ceiling without a new plan row, using the existing `ControlSetting(scope=TENANT)` mechanism the governance layer already has.
- No analytical page has a date-range filter UI yet, so the new export endpoint currently always exports the server's default range — real filters are a natural follow-up once any analytical page grows its own date-range control.

## Last Verified Commit

Data Analyst Export work, on top of `a7520ae931eb6399bb3e6fc549616e3de79cecfb` (see git log for the actual SHA once committed).

## Last Successful Validation

- `corepack pnpm --filter @mop/api test -- technician-work-view.service.spec.ts`
- `corepack pnpm --filter @mop/web test -- --include src/app/experiences/technician/tech-work-card.spec.ts --watch=false --isolate=false`
- `corepack pnpm --filter @mop/api test -- workshops.service.spec.ts`
- `corepack pnpm --filter @mop/web test -- --include src/app/experiences/platform/workshops/workshops-page.spec.ts --watch=false --isolate=false`
- `corepack pnpm --filter @mop/web test -- --include src/app/experiences/platform/workshops/workshop-drawer.spec.ts --watch=false --isolate=false`
- `corepack pnpm --filter @mop/api test -- work-order-dossier.service.spec.ts`
- `corepack pnpm --filter @mop/web test -- --include src/app/domain/dossier/dossier-drawer.spec.ts --watch=false --isolate=false`
- `corepack pnpm --filter @mop/api test -- password-reset.service.spec.ts`
- `corepack pnpm --filter @mop/web test -- --include src/app/identity/landing.spec.ts --watch=false --isolate=false`
- `corepack pnpm --filter @mop/web test -- --include src/app/experiences/public/access-denied/access-denied-page.spec.ts --watch=false --isolate=false`
- `corepack pnpm --filter @mop/web test -- --include src/app/experiences/public/password-reset/password-reset-page.spec.ts --watch=false --isolate=false`
- `corepack pnpm --filter @mop/database generate`
- `corepack pnpm --filter @mop/api test -- saved-views.service.spec.ts`
- `corepack pnpm --filter @mop/web test -- --include src/app/experiences/analyst/saved-view-action.spec.ts --include src/app/experiences/analyst/analyst-saved-views-page.spec.ts --watch=false --isolate=false`
- `corepack pnpm --filter @mop/api test -- analytics-home.service.spec.ts reporting.service.spec.ts`
- `corepack pnpm --filter @mop/web test -- --include src/app/experiences/analyst/analyst-home-page.spec.ts --watch=false --isolate=false`
- `corepack pnpm --filter @mop/shared build`
- `corepack pnpm --filter @mop/database generate`
- `corepack pnpm --filter @mop/database validate`
- `corepack pnpm --filter @mop/api test -- plan-entitlement.layer.spec.ts permission-context.service.spec.ts`
- `corepack pnpm --filter @mop/web test -- --include src/app/experiences/analyst/analyst-saved-views-page.spec.ts --watch=false --isolate=false`
- `node tools/lint-permission-keys.mjs`
- `corepack pnpm -r typecheck`
- `corepack pnpm --filter @mop/database validate`
- `corepack pnpm --filter @mop/web build`
- `corepack pnpm --filter @mop/api test -- csv.util.spec.ts`
- `corepack pnpm --filter @mop/api test -- analytics-export.controller.integration.spec.ts` (real HTTP: success + audit row, plan-category-denied, plan-empty, unauthenticated)
- `corepack pnpm --filter @mop/web test -- --include src/app/experiences/analyst/export-action.spec.ts --watch=false --isolate=false`
- `corepack pnpm --filter @mop/web test -- --include "src/app/experiences/analyst/**/*.spec.ts" --watch=false --isolate=false`
- `corepack pnpm lint` (all 6 rules)
- `corepack pnpm -r typecheck`
- `corepack pnpm --filter @mop/shared test` (243 tests), `corepack pnpm --filter @mop/api test` (866 tests), `corepack pnpm --filter @mop/web test -- --watch=false --isolate=false` (272 tests)
- `corepack pnpm build` (full monorepo)
- Manual verification against the real dev DB: `db:deploy`, `db:seed`, `db:seed:demo`, `apps/api` dev server, logged in as `analyst@apex-motors.local` over real HTTP, pulled all 5 export categories, confirmed real CSV bytes and real `analytics.export.generated` audit rows, confirmed a role without `analytics.export` gets 403

## Known Blockers

- None currently — local Postgres (`mop-platform-postgres-1`) is up and healthy, and the full test suite (866 API + 243 shared + 272 web) runs clean against it in this environment.

## Important Architectural Decisions

- Preserve backend-first behavior: UI reflects policies resolved by the API, never duplicates policy decisions locally.
- Do not treat old audit entries as current unless source confirms them. Role permission locks and technician part requests are implemented now.
- Keep legacy reporting endpoints only when they preserve current scope/privacy rules; scoped Data Analyst sessions must never receive unscoped tenant reports through an older permission surface.
- Deferred or missing features remain out of scope until their documented backing model exists: Data Analyst CSV export has its entitlement gate now but still needs an export endpoint, full country billing adapters need a country-specific adapter, and audited billing override still needs its own path.

## Exact Next Action

Push the Data Analyst Export checkpoint, then inspect per-workshop Limits & Entitlements override requirements against `ControlSetting`.
