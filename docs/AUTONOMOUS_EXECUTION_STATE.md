# Autonomous Execution State

This document tracks the current Codex autonomous run. It is not a replacement for project documentation.

## Current Phase

Paused at user request after a verified implementation checkpoint.

## Current Subsystem

Paused before starting any next mission.

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
- Inventory Manager part-request mutations now pass the session tenant into `PartRequestService`, and the service can scope request, fulfilment, issue, return, and transition reads to that tenant.
- Inventory Manager routes now refuse explicit warehouse actions outside the session's `warehouseScope` while preserving empty-scope-as-all access for owner/admin-style sessions.
- Focused Inventory controller/service specs cover tenant-scoped part-request mutation and explicit warehouse-scope enforcement without requiring Postgres.
- Billing now rejects mismatched candidate/snapshot tenant contracts before writing compliance state or documents.
- Billing credit-note issuance now scopes invoice and billing-document reads to the input tenant and returns `invoice_not_found` instead of reading another tenant's invoice by bare ID.
- Focused Billing service specs cover contract tenant mismatch, tenant-scoped credit-note reads, and foreign-invoice refusal without requiring Postgres.
- Finance Configuration now validates discount ceilings against the effective post-update configuration, so updating only the branch ceiling or only the workshop ceiling cannot leave branch authority above the workshop-wide max.
- Finance Configuration now rejects branch discount and deposit percentages above 100 before writing or auditing.
- Focused Finance Configuration service specs cover effective ceiling validation and percentage bounds without requiring Postgres.
- Price Catalog now validates blank item type and invalid unit/labour prices at the service boundary, trims item identity before persistence, and audits the normalized value.
- Owner Pricing controller specs now prove the session tenant and actor are threaded into Finance Configuration and Price Catalog services, and denied access calls do not reach services.
- Focused Price Catalog and Owner Pricing controller specs cover validation and request-boundary behavior without requiring Postgres.
- Platform Reports now implements the full six-section per-workshop detail: Usage Overview, Feature Usage, Builder Adoption, Operational Activity, Commercial Snapshot, and Health & Risk.
- Platform Reports cards now include active-user, feature-adoption, and builder-adoption signals alongside usage score, health, plan, staff and customer counts.
- Platform Reports keeps platform subscription money as explicit null placeholders because no platform billing table exists, while all usage/operations/health metrics are derived from existing product rows.
- `PAGE_INVENTORY.md`, `PHASE_MAP.md`, and `PROJECT_STATE.md` now reflect 48 complete + 5 partial + 0 missing pages.
- Focused Platform Reports backend/web specs and the web build cover the new detail contract and UI rendering.
- Finance HTTP route coverage now proves guarded payment routes reject unauthenticated requests before access checks, enforce DTO money validation before FinanceService, respect permission denies, thread the session tenant/actor into payment recording, and wire invoice issuance through the Finance boundary that owns Billing downstream.
- Inventory HTTP route coverage now proves guarded stock issue routes reject unauthenticated requests before access checks, enforce DTO quantity validation before PartRequestService, thread the session tenant/actor into issue calls, enforce explicit warehouse scope over HTTP, and keep warehouse deactivation as a validated 200-status command.
- Billing has no standalone controller in the current bounded-system architecture; its HTTP exposure remains through Finance invoice issuance while BillingService retains service/integration coverage.
- Owner Pricing backend/API now exposes the documented "Who Can Handle Money" role-permission slice for `finance.invoice.issue` and `finance.payment.record`.
- Money-handling delegation writes audited `RolePermission` rows with `OWNER_OVERRIDE`, refuses unsupported roles/permission keys, and refuses to override platform/plan/resolver-locked decisions.
- `EffectiveAccessService.checkMany()` now exposes the resolver's existing batch path so administrative views can render lock-aware permission cells without duplicating permission logic.

## Current Task

Stopped by direct user instruction. Do not start another mission until the user explicitly resumes.

## Remaining Tasks

- Continue the documented gap scan after the HTTP coverage pass, prioritizing remaining partial pages and backend-first runtime gaps over UI polish.
- Finish the Owner Pricing "Who Can Handle Money" slice only after user resumes: wire the Pricing web page to `GET/POST /organization/finance-configuration/money-handlers`, add focused web tests, then update page inventory if the full page gap is closed.
- Add more route-level coverage only where a remaining subsystem exposes high-risk money, stock, permission, or lifecycle endpoints without an HTTP proof.
- Continue validating country billing adapter/compliant-blocked behavior without silently inventing country-specific adapters.
- Keep deferred/unbacked Control Center Builder, workflow-policy, full rollback, and country-adapter work out of implementation unless the documented backing model exists.

## Last Verified Commit

`64486fc90b63a2a456efb4a5d889c52b3057511c`

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
- `corepack pnpm --filter @mop/api test -- part-request.service.spec.ts inventory.controller.spec.ts`
- `corepack pnpm --filter @mop/api typecheck`
- `corepack pnpm --filter @mop/api test -- billing.service.spec.ts`
- `corepack pnpm --filter @mop/api typecheck`
- `corepack pnpm --filter @mop/api test -- finance-configuration.service.spec.ts`
- `corepack pnpm --filter @mop/api typecheck`
- `corepack pnpm --filter @mop/api test -- price-catalog.service.spec.ts finance-configuration.controller.spec.ts`
- `corepack pnpm --filter @mop/api typecheck`
- `corepack pnpm --filter @mop/api test -- tenant-entitlements.service.spec.ts finance.service.spec.ts finance.controller.spec.ts part-request.service.spec.ts inventory.controller.spec.ts billing.service.spec.ts finance-configuration.service.spec.ts price-catalog.service.spec.ts finance-configuration.controller.spec.ts`
- `corepack pnpm -r typecheck`
- `corepack pnpm --filter @mop/api typecheck`
- `corepack pnpm --filter @mop/api test -- platform-reports.service.spec.ts`
- `corepack pnpm --filter @mop/web test -- --include src/app/experiences/platform/reports/reports-page.spec.ts --include src/app/experiences/platform/reports/workshop-usage-page.spec.ts --watch=false --isolate=false`
- `corepack pnpm --filter @mop/web build`
- `corepack pnpm -r typecheck`
- `corepack pnpm --filter @mop/api test -- finance.controller.http.spec.ts inventory.controller.http.spec.ts`
- `corepack pnpm --filter @mop/api typecheck`
- `corepack pnpm --filter @mop/api test -- money-handling-permissions.service.spec.ts finance-configuration.controller.spec.ts`
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
- Inventory Manager service methods reached from route IDs must prove the target part request belongs to the session tenant; explicit warehouse mutations must respect non-empty `warehouseScope`.
- Billing is downstream of Finance, but it still enforces tenant consistency on its typed contract and any invoice/document lookup it performs.
- Finance Configuration validation must compare effective post-update values, not only fields present in the same PATCH/POST body.
- Price Catalog must normalize and validate item identity at the service boundary, not rely solely on DTO validators.
- Platform Reports may aggregate platform-visible staff/workshop metrics, but must not expose customer PII; platform subscription money remains placeholder/null until a real platform billing source exists.
- Billing has no public/controller HTTP boundary in the current codebase; until a documented Billing controller exists, route-level Billing exposure is proven through Finance invoice issuance and Billing's own service/integration contract tests.
- Owner "Who Can Handle Money" is a narrow `RolePermission` writer, not a `FinanceConfiguration` field. Its read shape must be lock-aware and use the real permission resolver decisions.

## Exact Next Action

Wait for the user's next instruction. If resumed on this same mission, continue with the Owner Pricing web integration for the money-handling permission slice; do not start a different subsystem first.
