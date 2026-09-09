#!/usr/bin/env node
// The migration history and schema.prisma must describe the same database.
//
// This exists because they silently stopped doing so. `StaffUser.specializations`
// and `Team.specializations` were added to the schema in commit 6d92a8b with no
// migration behind them, and a stale two-column index on `operation_events`
// outlived the three-column index that replaced it. Neither was visible locally:
// `prisma migrate dev` and `db push` apply the SCHEMA, so a developer's database
// is correct by construction. Only a database built from the migration history --
// every CI, staging, production and test database -- was wrong, and the symptom
// was 43 failing suites and a `staffUser.create()` that could not run at all.
//
// `prisma migrate diff --from-migrations --to-schema-datamodel` answers the exact
// question: "if I replayed every migration onto an empty database, would I get
// what schema.prisma describes?" Anything but "no difference" is drift.
//
// Needs a shadow database to replay migrations into. It creates and drops one of
// its own rather than borrowing an existing database, so running this can never
// touch real data.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const DB_DIR = join(ROOT, "packages", "database");
const SCHEMA = join(DB_DIR, "prisma", "schema.prisma");
const MIGRATIONS = join(DB_DIR, "prisma", "migrations");

const SHADOW_DB = "mop_migration_drift_shadow";

function fail(message, detail) {
  console.error(message);
  if (detail) console.error("\n" + detail);
  process.exit(1);
}

if (!existsSync(SCHEMA)) fail(`Migration-drift check cannot find ${SCHEMA}.`);
if (!existsSync(MIGRATIONS)) fail(`Migration-drift check cannot find ${MIGRATIONS}.`);

// The admin URL is derived from DATABASE_URL by swapping the database name, so
// this works against whatever server the developer or CI is already pointed at.
const source = process.env.DATABASE_URL;
if (!source) {
  console.error("Migration-drift check skipped: DATABASE_URL is not set.");
  console.error("Set it (or run `node tools/with-env.mjs node tools/lint-migration-drift.mjs`) to enable this check.");
  // Skipping is a warning, not a failure: a contributor without a database
  // should still be able to run the rest of the lint chain.
  process.exit(0);
}

let adminUrl;
let shadowUrl;
try {
  const parsed = new URL(source);
  const search = parsed.search;
  adminUrl = `${parsed.protocol}//${parsed.username}:${parsed.password}@${parsed.host}/postgres${search}`;
  shadowUrl = `${parsed.protocol}//${parsed.username}:${parsed.password}@${parsed.host}/${SHADOW_DB}${search}`;
} catch {
  fail("Migration-drift check could not parse DATABASE_URL.");
}

// Prisma's own JS entrypoint, run under this Node -- not the `.bin` shim.
// Node 22+ refuses to spawn a `.cmd` without a shell (EINVAL), and going
// through a shell to work around that would make the argument quoting
// platform-specific for no gain.
const prismaCli = join(DB_DIR, "node_modules", "prisma", "build", "index.js");

function prisma(args, env = {}) {
  return execFileSync(process.execPath, [prismaCli, ...args], {
    cwd: DB_DIR,
    encoding: "utf8",
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

// Prisma has no "create database" command, so the shadow database is made with a
// raw statement through the client's own engine -- the one dependency already
// guaranteed to be present.
async function withShadowDatabase(run) {
  const { PrismaClient } = await import(
    "file://" + join(DB_DIR, "generated", "client", "index.js").split("\\").join("/")
  );
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl } } });
  try {
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${SHADOW_DB}" WITH (FORCE)`);
    await admin.$executeRawUnsafe(`CREATE DATABASE "${SHADOW_DB}"`);
  } catch (error) {
    await admin.$disconnect();
    console.error("Migration-drift check skipped: could not create a shadow database.");
    console.error("  " + String(error.message).split("\n")[0]);
    process.exit(0);
  }
  try {
    return await run();
  } finally {
    try {
      await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${SHADOW_DB}" WITH (FORCE)`);
    } catch {
      // A leftover shadow database is untidy, never dangerous -- it holds no
      // real data and the next run drops it before recreating.
    }
    await admin.$disconnect();
  }
}

const diff = await withShadowDatabase(() =>
  prisma([
    "migrate",
    "diff",
    "--from-migrations",
    "./prisma/migrations",
    "--to-schema-datamodel",
    "./prisma/schema.prisma",
    "--shadow-database-url",
    shadowUrl,
    "--script",
  ]),
);

// Prisma prints an update banner to stdout on some versions; the meaningful
// output is SQL, and "empty migration" is its way of saying there is none.
const sql = diff
  .split("\n")
  .filter((line) => !/^[│┌└├]/.test(line) && !/Update available|npm i /.test(line))
  .join("\n")
  .trim();

if (sql === "" || /This is an empty migration/i.test(sql)) {
  console.log("Migration drift OK -- replaying every migration reproduces schema.prisma exactly.");
  process.exit(0);
}

fail(
  "Migration drift: replaying every migration does NOT reproduce schema.prisma.\n\n" +
    "A database built from migrations (CI, staging, production, the test database)\n" +
    "would differ from the schema the Prisma client is generated against. The SQL\n" +
    "below is what is missing -- add it as a new migration rather than editing an\n" +
    "existing one:",
  sql,
);
