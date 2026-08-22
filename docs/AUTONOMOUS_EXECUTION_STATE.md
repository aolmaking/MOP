# Autonomous Execution State

This document tracks the current Codex autonomous run. It is not a replacement for project documentation.

## Current Phase

Implementation, after documentation and source audit.

## Current Subsystem

Reporting coherence.

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
- Data Analyst export remains deliberately deferred because the required plan-level `allowedExports` entitlement does not exist yet.
- `PAGE_INVENTORY.md`, `PHASE_MAP.md`, and `PROJECT_STATE.md` now reflect 46 complete + 7 partial + 0 missing pages.
- Analytics Home now composes all five analytical service tiles, including Feature Adoption, rather than leaving the Feature Adoption page out of the home cross-section.
- The legacy `reports.company.view` backend surface remains live but now applies the current session's assigned branch/category scope to technician metrics, throughput, blockers, and finance totals.

## Current Task

Checkpoint reporting coherence, then move to the next high-leverage documented gap: Governance Controls / Limits & Entitlements, especially the plan entitlement backing needed for Data Analyst export and other deferred controls.

## Remaining Tasks

- Run the focused reporting specs after the scope-aware legacy report patch.
- Review, commit, and push the reporting coherence checkpoint.
- Inspect Governance Controls / Limits & Entitlements documentation and implementation without re-reading unrelated areas.
- Determine the smallest backend-first entitlement model work that unblocks documented deferred features without inventing new product scope.
- Keep Data Analyst export deferred until a real `Plan.allowedExports` entitlement and permission gate exist.

## Last Verified Commit

`7386101ec991a62530581b3358a39c5280b1280c`

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
- `node tools/lint-permission-keys.mjs`
- `corepack pnpm -r typecheck`
- `corepack pnpm --filter @mop/database validate`
- `corepack pnpm --filter @mop/web build`

## Known Blockers

- Local Postgres is not listening on `localhost:5432`.
- `docker compose up -d postgres` and Docker inspection commands hang in this runtime after starting the pull. Database-backed integration tests cannot be run until Docker/Postgres is healthy.

## Important Architectural Decisions

- Preserve backend-first behavior: UI reflects policies resolved by the API, never duplicates policy decisions locally.
- Do not treat old audit entries as current unless source confirms them. Role permission locks and technician part requests are implemented now.
- Keep legacy reporting endpoints only when they preserve current scope/privacy rules; scoped Data Analyst sessions must never receive unscoped tenant reports through an older permission surface.
- Deferred or missing features remain out of scope until their documented backing model exists: Data Analyst CSV export needs `Plan.allowedExports`, full country billing adapters need a country-specific adapter, and audited billing override still needs its own path.

## Exact Next Action

Run focused reporting tests, then commit and push the reporting coherence checkpoint.
