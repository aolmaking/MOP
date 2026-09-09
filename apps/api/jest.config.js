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
 * This does not make the suite parallel-safe; it removes the one way to run it
 * that silently is not. Real parallelism needs a schema per worker, which is
 * recorded as the open half of REC-032 rather than pretended here.
 */
module.exports = {
  rootDir: "src",
  testEnvironment: "node",
  testRegex: ".*\.spec\.ts$",
  transform: {
    "^.+\.ts$": "ts-jest",
  },
  setupFiles: ["<rootDir>/testing/jest-env.ts"],
  moduleFileExtensions: ["ts", "js", "json"],
  testTimeout: 120000,
  maxWorkers: 1,
};
