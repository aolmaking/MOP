import { templateUrl, urlForDatabase, workerDatabaseName } from "./worker-databases";

/**
 * Test-environment defaults, applied before any application module is
 * imported.
 *
 * `http-kit.ts` sets the same three, but too late to be reliable: jest
 * hoists imports, so a spec that imports the kit alongside anything that
 * transitively reaches `runtime/config/environment.ts` can have the
 * config read first and take production's 10-logins-a-minute limit. The
 * symptom is brutal to diagnose -- a walkthrough passes its first
 * seventeen steps and then every remaining `loginAs` returns 429, which
 * reads as a broken feature rather than a throttled test.
 *
 * `setupFiles` runs before the module registry is touched at all, which
 * is the only place this can be set once and be true for every spec.
 *
 * `??=` throughout: a value already in the environment always wins, so
 * `auth/throttle.integration.spec.ts` can still set its own strict limit
 * and prove throttling actually works.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

// Under parallelism, this worker talks to its own clone of that database.
//
// Set here rather than in the config because `JEST_WORKER_ID` only exists
// inside a worker, and this file is the first thing that runs in one. Without
// it the suites share a database and start seeing each other's workshops --
// which is the whole reason the suite ran serially for so long.
if (process.env.MOP_TEST_WORKERS && process.env.JEST_WORKER_ID) {
  const { url, database } = templateUrl();
  process.env.DATABASE_URL = urlForDatabase(url, workerDatabaseName(database, process.env.JEST_WORKER_ID));
}

// An integration suite legitimately logs in dozens of times from one
// address. Production defaults would fail it for a reason that has
// nothing to do with what it is testing.
process.env.THROTTLE_AUTH_LIMIT ??= "1000";
process.env.THROTTLE_GLOBAL_LIMIT ??= "10000";
