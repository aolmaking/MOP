/**
 * Jest, configured for a suite that runs against a REAL Postgres database.
 *
 * `maxWorkers: 1` is the load-bearing line. All 143 suites share one database,
 * and several of them assert things about the workshops in it -- "this job is
 * never in another workshop's queue" has to pick another workshop to be sure
 * about. Under jest's default worker pool those suites see tenants a sibling
 * worker created, mutated, or half-deleted, and fail for reasons that have
 * nothing to do with what they test. A red suite nobody trusts is a suite
 * nobody reads, which is how eight deleted capabilities went unnoticed for
 * weeks (REC-013 and the seven findings beside it).
 *
 * Parallelism is possible now, and it is opt-in: `MOP_TEST_WORKERS=4` clones
 * the migrated test database once per worker (Postgres `CREATE DATABASE ...
 * TEMPLATE`, so it costs a file copy rather than 47 migrations replayed), and
 * each worker talks only to its own. Serial stays the default because the
 * trade -- a database per worker for wall-clock time -- is the runner's to
 * make on the machine in front of them.
 */
module.exports = {
  rootDir: "src",
  testEnvironment: "node",
  testRegex: ".*\.spec\.ts$",
  transform: {
    "^.+\.ts$": "ts-jest",
  },
  setupFiles: ["<rootDir>/testing/jest-env.ts"],
  globalSetup: "<rootDir>/testing/jest-global-setup.ts",
  globalTeardown: "<rootDir>/testing/jest-global-teardown.ts",
  moduleFileExtensions: ["ts", "js", "json"],
  testTimeout: 120000,
  // Serial unless the runner asks otherwise. `MOP_TEST_WORKERS=4` clones the
  // migrated test database once per worker, so the suites stop sharing one and
  // parallelism becomes safe rather than merely faster.
  maxWorkers: Number(process.env.MOP_TEST_WORKERS) > 1 ? Number(process.env.MOP_TEST_WORKERS) : 1,
};
