import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const databaseDir = join(rootDir, "packages/database");
const databaseRequire = createRequire(join(databaseDir, "package.json"));
const { PrismaClient } = databaseRequire("@prisma/client");

function loadEnv() {
  const loaded = [];
  for (const envPath of [
    join(rootDir, ".env"),
    join(rootDir, "apps/api/.env"),
    join(databaseDir, ".env"),
    join(databaseDir, "prisma/.env")
  ]) {
    if (!existsSync(envPath)) continue;
    loaded.push(envPath);
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
  return loaded;
}

function safeDatabaseUrl() {
  const value = process.env.DATABASE_URL || "";
  return value.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:***@");
}

const loadedEnv = loadEnv();
const prisma = new PrismaClient();

async function main() {
  const checks = [];
  const add = (name, pass, detail = "") => checks.push({ name, pass, detail });

  add("env file discovered", loadedEnv.length > 0, loadedEnv.join("; "));
  add("DATABASE_URL configured", Boolean(process.env.DATABASE_URL), safeDatabaseUrl());

  const delegates = ["tenant", "financeAuditEvent", "account", "staffUser", "customer", "workOrder", "inventoryItem"];
  const missingDelegates = delegates.filter((name) => typeof prisma[name]?.deleteMany !== "function");
  add("Prisma Client delegates match schema", missingDelegates.length === 0, missingDelegates.length ? missingDelegates.join(", ") : "ok");

  try {
    await prisma.$connect();
    add("database connection", true, "connected");
  } catch (error) {
    add("database connection", false, error instanceof Error ? error.message : "connect failed");
  }

  try {
    const rows = await prisma.$queryRaw`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
      order by table_name
    `;
    add("database schema has tables", Array.isArray(rows) && rows.length > 0, `${Array.isArray(rows) ? rows.length : 0} tables`);
    const tableNames = new Set((Array.isArray(rows) ? rows : []).map((row) => row.table_name));
    const expectedTables = ["Tenant", "Account", "StaffUser", "Customer", "FinanceAuditEvent"];
    const missingTables = expectedTables.filter((name) => !tableNames.has(name));
    add("required Prisma tables exist", missingTables.length === 0, missingTables.length ? missingTables.join(", ") : "ok");
  } catch (error) {
    add("database schema has tables", false, error instanceof Error ? error.message : "table check failed");
  }

  for (const check of checks) {
    console.log(`${check.pass ? "PASS" : "FAIL"} ${check.name}${check.detail ? ` - ${check.detail}` : ""}`);
  }

  const failed = checks.filter((check) => !check.pass);
  if (failed.length) {
    console.error(`DB DOCTOR: FAIL (${failed.length}/${checks.length} failed)`);
    process.exitCode = 1;
  } else {
    console.log(`DB DOCTOR: PASS (${checks.length}/${checks.length})`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
