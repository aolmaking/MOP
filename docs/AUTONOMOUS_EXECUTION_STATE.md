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
- **`Plan.maxBranches`/`maxUsers`/`maxWarehouses` now enforced on an ongoing basis, not just at workshop-creation time.** Found while starting the "per-workshop governed overrides" investigation below: these ceilings were checked exactly once, at creation, and never again -- `BranchWarehouseService.createBranch()`/`createWarehouse()` and `StaffService.invite()` had zero awareness the fields existed. New `PlanLimitsService` (`apps/api/src/control/platform/plan-limits.service.ts`) asserts capacity (active-row count vs. plan ceiling) as the first check in all three creation paths, throwing a real 403 with the actual limit named. No web changes needed -- the existing Organization & Access forms already render `PresentedError.message` through the shared error plumbing. Proven by a new integration suite against a plan capped at 1 of each resource (accepts the first, refuses the second, frees the seat on deactivation), and by hand against the real seeded tenants (both sit comfortably under their ceilings, confirming the new check doesn't accidentally block existing demo data).

## Current Task

Governance Controls / Limits & Entitlements: per-workshop governed overrides (narrowing one tenant's ceiling below its shared plan's) is the one item still open from this subsystem. The "is the ceiling even enforced at all" half of that question is now closed -- see directly above.

## Remaining Tasks

- Decide whether per-workshop Limits & Entitlements needs a narrower-than-plan override at all: today, giving one workshop a different ceiling means moving it onto a different `Plan` row (`Tenant.planId`), which already works end-to-end (including the ongoing enforcement above) without any new machinery. A `ControlSetting`-based per-tenant override would only be justified by a real product need for "same plan, one exception" that a plan swap can't express -- no product surface asks for that yet, so this is recorded as an open design question, not built speculatively.
- No analytical page has a date-range filter UI yet, so the export endpoint currently always exports the server's default range — real filters are a natural follow-up once any analytical page grows its own date-range control.

## Last Verified Commit

Plan-limits enforcement work, on top of the Data Analyst Export commit, on top of `a7520ae931eb6399bb3e6fc549616e3de79cecfb` (see git log for the actual SHAs once committed).

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
- `corepack pnpm --filter @mop/api test -- plan-limits.service.integration.spec.ts` (real Postgres: accept-then-refuse for branches/warehouses/users against a plan capped at 1, seat freed on deactivation, real error shape through `BranchWarehouseService.createBranch()`)
- `corepack pnpm --filter @mop/api test` (871 tests, full suite, after the plan-limits change), `corepack pnpm lint`, `corepack pnpm --filter @mop/api typecheck`, `corepack pnpm --filter @mop/api build`
- Sanity-checked the seeded dev tenants directly against Postgres (`psql`) to confirm neither sits at or over its new ceiling: Apex Motors 2/10 branches, 2/5 warehouses, 7/100 staff; Delta Quick Service 1/1 branches, 0/0 warehouses (by design, no Inventory module), 1/10 staff

## Known Blockers

- None currently — local Postgres (`mop-platform-postgres-1`) is up and healthy, and the full test suite (871 API + 243 shared + 272 web) runs clean against it in this environment.

## Important Architectural Decisions

- Preserve backend-first behavior: UI reflects policies resolved by the API, never duplicates policy decisions locally.
- Do not treat old audit entries as current unless source confirms them. Role permission locks and technician part requests are implemented now.
- Keep legacy reporting endpoints only when they preserve current scope/privacy rules; scoped Data Analyst sessions must never receive unscoped tenant reports through an older permission surface.
- Deferred or missing features remain out of scope until their documented backing model exists: full country billing adapters need a country-specific adapter, and audited billing override still needs its own path.
- A per-tenant ceiling override does not need new `ControlSetting` machinery today: moving a tenant onto a different `Plan` row already achieves "this one workshop has a different limit," end-to-end. Build a narrower override only once a real scenario needs "same plan in every other respect, one ceiling exception" — see Remaining Tasks.

## Exact Next Action

Push the Plan Limits enforcement checkpoint, then run the next product-completion audit pass (orphaned models, write-only or read-only configuration, unused endpoints/permissions/capabilities, UI without backend, backend without UI, metrics without lineage) now that this queue's two named items (Data Analyst Export, Limits & Entitlements) are both closed.
