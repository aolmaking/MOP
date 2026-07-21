import { scryptSync } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const databaseDir = join(rootDir, "packages/database");
const databaseRequire = createRequire(join(databaseDir, "package.json"));
const { PrismaClient } = databaseRequire("@prisma/client");

for (const envPath of [
  join(rootDir, ".env"),
  join(rootDir, "apps/api/.env"),
  join(databaseDir, ".env"),
  join(databaseDir, "prisma/.env")
]) {
  if (!existsSync(envPath)) continue;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const prisma = new PrismaClient();
const demoPassword = "0000000";

function demoPasswordHash(identifier) {
  const salt = `mop-demo:${identifier}`;
  return `scrypt$${salt}$${scryptSync(demoPassword, salt, 64).toString("hex")}`;
}

const accountUpdates = [
  ["acc_platform_nour", "platform_super_admin"],
  ["acc_staff_salma", "tenant_admin"],
  ["acc_staff_khaled", "branch_manager"],
  ["acc_staff_ahmed", "technician"],
  ["acc_staff_youssef", "team_leader"],
  ["acc_staff_mona", "inventory_manager"],
  ["acc_staff_dina", "data_analyst"],
  ["acc_customer_omar", "customer"],
  ["acc_delta_owner", "tenant_owner"],
  ["acc_delta_tech", "delta_technician"],
  ["acc_delta_customer", "delta_customer"]
];

const staffEmailUpdates = [
  ["u_super", "platform_super_admin@mop.local"],
  ["u_admin", "tenant_admin@mop.local"],
  ["u_branch", "branch_manager@mop.local"],
  ["u_tech", "technician@mop.local"],
  ["u_lead", "team_leader@mop.local"],
  ["u_stock", "inventory_manager@mop.local"],
  ["u_analyst", "data_analyst@mop.local"],
  ["u_delta_owner", "tenant_owner@mop.local"],
  ["u_delta_tech", "delta_technician@mop.local"]
];

async function main() {
  await prisma.$transaction(async (tx) => {
    for (const [id, loginIdentifier] of accountUpdates) {
      await tx.account.updateMany({
        where: { id },
        data: {
          loginIdentifier,
          passwordHash: demoPasswordHash(loginIdentifier),
          failedLoginAttempts: 0,
          lockedUntil: null
        }
      });
    }

    for (const [id, email] of staffEmailUpdates) {
      await tx.staffUser.updateMany({
        where: { id },
        data: { email }
      });
    }
  });

  const updated = await prisma.account.findMany({
    where: { id: { in: accountUpdates.map(([id]) => id) } },
    orderBy: { id: "asc" },
    select: { id: true, loginIdentifier: true }
  });

  console.table(updated);
  console.log(`Demo password updated to ${demoPassword}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
