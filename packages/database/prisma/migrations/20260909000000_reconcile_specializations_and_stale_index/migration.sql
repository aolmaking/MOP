-- Reconciles migration history with schema.prisma.
--
-- Three drifts had accumulated. None of them were visible on a machine whose
-- database had been built with `prisma migrate dev` or `db push`, because those
-- apply the schema directly; they were only visible on a database built from the
-- migration history alone -- which is every CI, staging and production database,
-- and the test database. `prisma migrate diff --from-migrations
-- --to-schema-datamodel` is the check that finds this class of drift, and it is
-- now wired into `pnpm lint` (tools/lint-migration-drift.mjs) so it cannot recur.
--
-- 1 + 2. `StaffUser.specializations` and `Team.specializations` were added to
--        schema.prisma in commit 6d92a8b, which shipped only the migration that
--        adds the OPERATOR enum value. Every `staffUser.create()` and every
--        `team.findMany()` therefore failed against a migration-built database
--        with "The column `specializations` does not exist" -- taking staff
--        provisioning, invite acceptance, workshop creation and the branch
--        manager's work-order board down with them, plus 43 test suites.
--
-- 3.     `operation_events_tenantId_eventKey_idx` was created by the init
--        migration and superseded by `operation_events_tenantId_eventKey_createdAt_idx`
--        in 20260904190000_operational_intelligence_foundation, which added the
--        wider index without dropping the narrower one. The schema declares only
--        the three-column form. Dropping the two-column index is safe: the
--        three-column index shares its leading columns, so every query the old
--        index served is still served by the new one.

-- IF NOT EXISTS on both, and that is the whole point of this migration.
--
-- It exists to reconcile a database built from migrations with one built by
-- `prisma migrate dev`/`db push`, which applies schema.prisma directly. On the
-- second kind the columns are ALREADY THERE -- so a bare ADD COLUMN fails with
-- 42701, marks the migration failed, and blocks every later migration on the
-- very machines this was written to rescue. Idempotent, it produces exactly the
-- same schema on a fresh database and succeeds on a drifted one.

-- AlterTable
ALTER TABLE "staff_users" ADD COLUMN IF NOT EXISTS "specializations" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "specializations" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- DropIndex
DROP INDEX IF EXISTS "operation_events_tenantId_eventKey_idx";
