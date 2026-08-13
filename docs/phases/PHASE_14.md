# Phase 14 — Internationalization & Release Readiness

Scope per `docs/PHASE_MAP.md` (already narrowed by an earlier workshop finding): translation pass, security review, performance, summary tables, permission-key assertion check.

## Shipped

- **Permission-key assertion check** (`tools/lint-permission-keys.mjs`, wired into `pnpm lint`). `permission-manifest.ts`'s own header comment named this as owed since Phase 11 and it was never built: `EffectiveAccessService.can(session, permissionKey: string)` takes a bare `string`, so a misspelled literal like `"finance.invoice.issued"` (past tense, doesn't exist) type-checks fine and silently denies forever. The linter scans every `.can(session, "...")` and `require(session, "...")` call site across `apps/api/src` and fails the build if the literal isn't a declared key. Verified against a real planted typo before wiring it in.
- **Performance**: found and fixed a real gap from this session's own earlier work — `WorkOrder` had no index on `customerId` despite Phase 11's Customer Portal filtering every page load by `(tenantId, customerId, status)`. Added `@@index([tenantId, customerId])`, migrated on both dev and test databases.
- **Security review**: ran against this phase's own diff (the two items above). No findings — the lint script is dev-time only with no user input, and the migration is a static, non-parameterized `CREATE INDEX`.

## Not done this pass, named rather than dropped

- **Translation pass proper.** Dialect-accurate Arabic (Egyptian vs. Gulf register) across every UI string is a content task spanning the whole `apps/web` surface, not a schema or service change — it needs either real translation resources or an i18n pipeline decision (`@angular/localize` vs. a runtime library) that this phase did not make. Owed to whichever pass takes on the web layer holistically.
- **Summary tables.** Not identified as a concrete, scoped deliverable distinct from the reporting work Phase 12 already shipped; revisit once a real second consumer of "summary table" exists to define the shape against.
