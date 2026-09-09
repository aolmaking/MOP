/**
 * One database per jest worker, cloned from the migrated test database.
 *
 * The whole suite ran serially because it could not safely run any other way.
 * 147 suites share one database and several assert things about the *other*
 * workshops in it — "this job is never in another workshop's queue" has to
 * pick another workshop to be sure about — so under a worker pool they saw
 * tenants a sibling had created, mutated or half-deleted, and failed for
 * reasons unrelated to what they test. A red suite nobody trusts is a suite
 * nobody reads, which is how eight deleted capabilities went unnoticed.
 *
 * `CREATE DATABASE ... TEMPLATE` is why this is cheap enough to do at all.
 * Postgres copies the template's files directly, so cloning a fully migrated
 * database costs about as much as copying it on disk — no replaying 47
 * migrations per worker. The template must have no other connections while it
 * is being copied, which is true here: this runs in jest's global setup,
 * before any worker has opened one.
 */
import { execFileSync } from "node:child_process";

const DEFAULT_URL = "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

/** The template's URL, and the name of the database it points at. */
export function templateUrl(): { url: string; database: string } {
  const url = process.env.MOP_TEST_TEMPLATE_URL ?? process.env.DATABASE_URL ?? DEFAULT_URL;
  const database = new URL(url).pathname.replace(/^\//, "");
  return { url, database };
}

/** The same URL pointing at a different database on the same server. */
export function urlForDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

export function workerDatabaseName(template: string, worker: string | number): string {
  return `${template}_w${worker}`;
}

/**
 * How many workers to clone for, or 0 to stay serial.
 *
 * Serial is still the default. Parallel is a deliberate choice a person makes
 * — `MOP_TEST_WORKERS=4 pnpm --filter @mop/api test` — because it costs a
 * database per worker and buys wall-clock time, and the trade is the runner's
 * to make, not a silent default that surprises somebody on a small machine.
 */
export function requestedWorkers(): number {
  const raw = process.env.MOP_TEST_WORKERS;
  if (!raw) return 0;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 1 ? parsed : 0;
}

/**
 * Runs one statement against the `postgres` maintenance database.
 *
 * Through Prisma's own CLI rather than a `pg` client, because the API package
 * does not depend on one and adding a driver to run two DDL statements in a
 * test harness would be a real dependency bought for a test-only need.
 */
function maintenance(url: string, sql: string): void {
  const adminUrl = urlForDatabase(url, "postgres");
  execFileSync(
    process.execPath,
    [
      require.resolve("../../../../packages/database/node_modules/prisma/build/index.js"),
      "db",
      "execute",
      "--url",
      adminUrl,
      "--stdin",
    ],
    { input: sql, stdio: ["pipe", "ignore", "pipe"] },
  );
}

export function createWorkerDatabases(workers: number): void {
  const { url, database } = templateUrl();

  for (let worker = 1; worker <= workers; worker += 1) {
    const name = workerDatabaseName(database, worker);
    // Dropped first: a previous run killed mid-way leaves them behind, and a
    // stale clone is worse than no clone -- it would carry that run's rows.
    maintenance(url, `DROP DATABASE IF EXISTS "${name}";`);
    maintenance(url, `CREATE DATABASE "${name}" TEMPLATE "${database}";`);
  }
}

export function dropWorkerDatabases(workers: number): void {
  const { url, database } = templateUrl();

  for (let worker = 1; worker <= workers; worker += 1) {
    try {
      maintenance(url, `DROP DATABASE IF EXISTS "${workerDatabaseName(database, worker)}";`);
    } catch {
      // Teardown must not fail a green run. A clone left behind is dropped by
      // the next run's setup, which drops before it creates for this reason.
    }
  }
}
