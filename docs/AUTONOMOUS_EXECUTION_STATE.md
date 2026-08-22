# Autonomous Execution State

This document tracks the current Codex autonomous run. It is not a replacement for project documentation.

## Current Phase

Implementation, after documentation and source audit.

## Current Subsystem

Historical policy/capability resolution consumer.

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

## Current Task

Inspect `resolveAsOf`/historical effective-state support and add the smallest production consumer if the documented audit gap still holds.

## Remaining Tasks

- Locate existing historical resolution helpers, stored history records, and current audit/report consumers.
- Add a production consumer without changing policy semantics or inventing a new feature.
- Add focused backend tests for historical effective-state behavior.
- Run focused verification, then recursive typecheck.
- Commit and push the completed unit once Git write permissions are available.

## Last Verified Commit

`2eee27abccde3d48a331e43181b3d00fc6bfa6e1`

## Last Successful Validation

- `corepack pnpm --filter @mop/api test -- technician-work-view.service.spec.ts`
- `corepack pnpm --filter @mop/web test -- --include src/app/experiences/technician/tech-work-card.spec.ts --watch=false --isolate=false`
- `corepack pnpm --filter @mop/api test -- workshops.service.spec.ts`
- `corepack pnpm --filter @mop/web test -- --include src/app/experiences/platform/workshops/workshops-page.spec.ts --watch=false --isolate=false`
- `corepack pnpm --filter @mop/web test -- --include src/app/experiences/platform/workshops/workshop-drawer.spec.ts --watch=false --isolate=false`
- `corepack pnpm -r typecheck`

## Known Blockers

- Local Postgres is not listening on `localhost:5432`.
- `docker compose up -d postgres` and Docker inspection commands hang in this runtime after starting the pull. Database-backed integration tests cannot be run until Docker/Postgres is healthy.

## Important Architectural Decisions

- Preserve backend-first behavior: UI reflects policies resolved by the API, never duplicates policy decisions locally.
- Do not treat old audit entries as current unless source confirms them. Role permission locks and technician part requests are implemented now.
- Deferred or missing features remain out of scope until their documented backing model exists: Data Analyst saved exports, full country billing adapters, and audited billing override path.

## Exact Next Action

Inspect historical policy/capability resolution helpers and add the smallest production consumer if the documented `resolveAsOf` audit gap still holds.
