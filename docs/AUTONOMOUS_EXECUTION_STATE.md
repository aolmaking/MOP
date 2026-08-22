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

## Current Task

Inspect reporting drift and reconcile the smallest backed gaps first: Analytics Home's missing Feature Adoption tile and the legacy `reports.company.view` reporting surface with no frontend consumer.

## Remaining Tasks

- Decide from docs/source whether Analytics Home should include Feature Adoption now or remain documented as 4-tile-only.
- Trace `apps/api/src/insights/analyst-reporting` and `reports.company.view` consumers; either retire stale product surface or fold it into the current analytics subsystem without duplicating report logic.
- Preserve Data Analyst's privacy/no-finance leakage constraints while reconciling reporting surfaces.
- Add focused backend/web tests for whatever reporting coherence change is made.
- Run focused verification, recursive typecheck, Prisma validate when schema is touched, and web build when Angular routes/templates change.

## Last Verified Commit

`a7ecc90236af8095d31f9098ec0966c21bd3eb95`

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
- Deferred or missing features remain out of scope until their documented backing model exists: Data Analyst CSV export needs `Plan.allowedExports`, full country billing adapters need a country-specific adapter, and audited billing override still needs its own path.

## Exact Next Action

Commit and push the saved-view checkpoint, update this ledger with the new verified commit SHA, then inspect Analytics Home and legacy `reports.company.view` reporting drift.
