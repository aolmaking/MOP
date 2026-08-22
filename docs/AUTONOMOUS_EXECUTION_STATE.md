# Autonomous Execution State

This document tracks the current Codex autonomous run. It is not a replacement for project documentation.

## Current Phase

Implementation, after documentation and source audit.

## Current Subsystem

High-risk HTTP/API coverage after Governance Controls.

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
- Data Analyst export file generation is implemented: `GET /analytics/export` generates CSV for the current analytical page/filter configuration, gated by `analytics.export` and the plan's `allowedExports` category list.
- `PAGE_INVENTORY.md`, `PHASE_MAP.md`, and `PROJECT_STATE.md` now reflect 47 complete + 6 partial + 0 missing pages.
- Analytics Home now composes all five analytical service tiles, including Feature Adoption, rather than leaving the Feature Adoption page out of the home cross-section.
- The legacy `reports.company.view` backend surface remains live but now applies the current session's assigned branch/category scope to technician metrics, throughput, blockers, and finance totals.
- `Plan.allowedExports` and `analytics.export` are implemented; the permission resolver locks export permission when a workshop's plan has no allowed export categories.
- The Saved Views / Exports page now reflects plan entitlement truth, and each analytical page offers a CSV export action when `analytics.export` is allowed.
- Governance Controls / Limits & Entitlements now supports governed per-workshop overrides for Max Branches, Max Users, Max Warehouses, and Allowed Exports.
- Entitlement overrides are stored as audited `ControlSetting` rows, preserve plan ceilings, refuse numeric values below active usage, and refuse unsafe clearing when the plan default would fall below current usage.
- Effective entitlements now feed permission resolution, analytics export authorization, Platform workshop details, Organization user/branch writes, and Inventory warehouse writes.
- Control Center renders effective entitlement values, shows plan/default and usage context, applies overrides with a written reason, and clears active overrides.
- Finance Core now scopes invoice settlement reads, payment recording, refund decisions, discount decisions, and work-order billing entry points to the current tenant.
- Finance controller now threads the session tenant into invoice/refund/discount decision calls, and focused service/controller specs cover the tenant-isolation boundary without requiring Postgres.

## Current Task

Inspect Inventory controller/API boundaries for the next highest-risk missing request-boundary coverage or tenant/scope enforcement gap.

## Remaining Tasks

- Add or repair HTTP-level coverage for the riskiest Inventory and Billing controllers/workflows, starting where existing docs or tests show real behavior but no request-boundary proof.
- Continue validating country billing adapter/compliant-blocked behavior without silently inventing country-specific adapters.
- Keep deferred/unbacked Control Center Builder, workflow-policy, full rollback, and country-adapter work out of implementation unless the documented backing model exists.

## Last Verified Commit

`17719d6a9df6622d9d698437673824ddb062d39a`

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
- `corepack pnpm --filter @mop/api test -- analytics-export.service.spec.ts`
- `corepack pnpm --filter @mop/web test -- --include src/app/experiences/analyst/export-view-action.spec.ts --watch=false --isolate=false`
- `corepack pnpm --filter @mop/api test -- analytics-export.service.spec.ts plan-entitlement.layer.spec.ts permission-context.service.spec.ts`
- `corepack pnpm --filter @mop/web test -- --include src/app/experiences/analyst/saved-view-action.spec.ts --include src/app/experiences/analyst/analyst-saved-views-page.spec.ts --include src/app/experiences/analyst/export-view-action.spec.ts --watch=false --isolate=false`
- `corepack pnpm --filter @mop/api test -- tenant-entitlements.service.spec.ts analytics-export.service.spec.ts permission-context.service.spec.ts workshops.service.spec.ts`
- `corepack pnpm --filter @mop/web test -- --include src/app/experiences/platform/control-center/control-center-page.spec.ts --watch=false --isolate=false`
- `corepack pnpm -r typecheck`
- `corepack pnpm --filter @mop/web build`
- `corepack pnpm --filter @mop/api test -- finance.service.spec.ts finance.controller.spec.ts`
- `corepack pnpm --filter @mop/api typecheck`

## Known Blockers

- Local Postgres is not listening on `localhost:5432`.
- `docker compose up -d postgres` and Docker inspection commands hang in this runtime after starting the pull. Database-backed integration tests cannot be run until Docker/Postgres is healthy.

## Important Architectural Decisions

- Preserve backend-first behavior: UI reflects policies resolved by the API, never duplicates policy decisions locally.
- Do not treat old audit entries as current unless source confirms them. Role permission locks and technician part requests are implemented now.
- Keep legacy reporting endpoints only when they preserve current scope/privacy rules; scoped Data Analyst sessions must never receive unscoped tenant reports through an older permission surface.
- Deferred or missing features remain out of scope until their documented backing model exists: Data Analyst CSV export is now backed by its entitlement gate and endpoint; full country billing adapters still need a country-specific adapter, and audited billing override still needs its own path.
- Per-workshop Limits & Entitlements overrides are `ControlSetting` deltas on top of `Plan`, not a second plan model. Plan fields remain the ceiling; runtime consumers read the effective entitlement service.
- Finance service methods that accept session-derived `tenantId` must still prove that the target invoice, refund, discount, or work order belongs to that tenant before reading or mutating money records.

## Exact Next Action

Inspect Inventory controller/service tests for request-boundary gaps around warehouse scope, cost visibility, and tenant ownership; implement the smallest backend-first fix or coverage slice and verify it.
