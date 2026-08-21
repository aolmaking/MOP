/**
 * Development seed: one platform admin and **two tenants with deliberately
 * different shapes**.
 *
 * The two-tenant part is not decoration. A single-tenant database makes
 * tenant-isolation bugs invisible -- there is no second tenant to leak
 * from, so an unscoped query looks correct. It also leaves the product's
 * central claim (one codebase, differently-shaped workshops) untested by
 * construction.
 *
 * So the two tenants differ in every dimension that matters:
 *
 *   Apex Motors    multi-branch, full service, inventory + teams + QC,
 *                  2 branches, 2 warehouses, EGP / Africa-Cairo
 *   Delta Quick    single bay, no inventory, no teams, no QC,
 *                  1 branch, 0 warehouses, AED / Asia-Dubai
 *
 * Delta is the shape that breaks naive code: no inventory means no part
 * lifecycle, and a Finish Gate that still demands "parts used or returned"
 * would strand every job (see docs/CAPABILITY_MODEL.md).
 *
 * Idempotent: safe to re-run. Every row is looked up by a fixed, well-known
 * identifier before being created.
 */
// Relative, not "@prisma/client" or "@mop/database": the schema generates
// into a custom location (see prisma/schema.prisma's generator block), so
// the plain package name resolves to an uninitialized stub, not this
// project's real generated client.
import { PrismaClient, type CategoryCode, type Prisma } from "../generated/client";
import { randomBytes, scryptSync } from "node:crypto";

const prisma = new PrismaClient();

// --- password hashing -------------------------------------------------
// Duplicated from apps/api/src/identity/auth/password.util.ts on purpose, not by
// oversight: this script runs standalone via `tsx`, and packages/database
// cannot depend on apps/api (that dependency would point the wrong way --
// apps depend on packages, not the reverse). @mop/shared can't take it
// either, since that package is also consumed by the browser build and
// this uses node:crypto, which doesn't exist there. Must keep producing
// the exact "scrypt$<saltHex>$<hashHex>" format apps/api's
// verifyPassword() checks against -- if the real implementation's
// parameters ever change, update both.
const SCRYPT_N = 131072;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAXMEM = 256 * 1024 * 1024;
const KEY_LENGTH = 64;

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  }).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

// --- fixed, well-known seed identifiers --------------------------------
const PLATFORM_ADMIN_EMAIL = "platform-admin@mop.local";
const PLATFORM_ADMIN_PASSWORD = "ChangeMe-Platform-123";
const OWNER_PASSWORD = "ChangeMe-Owner-123";

/**
 * Granted directly so each seeded owner has one real ALLOW path to test
 * against, alongside every other key correctly denying by default.
 */
const OWNER_GRANTED_PERMISSION_KEY = "organization.access.manage";

interface TenantSpec {
  name: string;
  slug: string;
  registrationCode: string;
  planCode: string;
  planName: string;
  maxBranches: number;
  maxUsers: number;
  maxWarehouses: number;
  country: string;
  city: string;
  businessType: string;
  primaryCategory: CategoryCode;
  currency: string;
  timezone: string;
  ownerEmail: string;
  ownerName: string;
  /** Mirrors a capability profile in @mop/shared until Phase 3 stores capabilities properly. */
  enabledModules: string[];
  branches: Array<{ name: string; code: string }>;
  warehouses: Array<{ name: string; code: string }>;
}

const TENANTS: readonly TenantSpec[] = [
  {
    name: "Apex Motors",
    slug: "apex-motors",
    registrationCode: "APEX-001",
    planCode: "SEED-FULL-SERVICE",
    planName: "Full Service",
    maxBranches: 10,
    maxUsers: 100,
    maxWarehouses: 5,
    country: "EG",
    city: "Cairo",
    businessType: "Multi-Branch Service Centre",
    primaryCategory: "CARS",
    currency: "EGP",
    timezone: "Africa/Cairo",
    ownerEmail: "owner@apex-motors.local",
    ownerName: "Apex Owner",
    enabledModules: [
      "ORGANIZATION",
      "OPERATIONS",
      "INVENTORY",
      "FINANCE",
      "TEAM_MANAGEMENT",
      "REPORTS",
      "AUDIT",
      "CUSTOMER_PORTAL",
    ],
    branches: [
      { name: "Nasr City", code: "NC" },
      { name: "Giza", code: "GZ" },
    ],
    warehouses: [
      { name: "Central Warehouse", code: "CENTRAL" },
      { name: "Giza Store", code: "GZ-STORE" },
    ],
  },
  {
    name: "Delta Quick Service",
    slug: "delta-quick",
    registrationCode: "DELTA-001",
    planCode: "SEED-QUICK-SERVICE",
    planName: "Quick Service",
    maxBranches: 1,
    maxUsers: 10,
    maxWarehouses: 0,
    country: "AE",
    city: "Dubai",
    businessType: "Single-Bay Quick Service",
    primaryCategory: "MOTORCYCLES",
    currency: "AED",
    timezone: "Asia/Dubai",
    ownerEmail: "owner@delta-quick.local",
    ownerName: "Delta Owner",
    // No INVENTORY, no TEAM_MANAGEMENT -- this is the shape that strands
    // work orders if the Finish Gate is not capability-aware.
    enabledModules: ["ORGANIZATION", "OPERATIONS", "FINANCE", "REPORTS", "AUDIT", "CUSTOMER_PORTAL"],
    // Rule 1 of the capability model: a single-branch workshop still has
    // exactly one Branch row. "No branches" is never modelled as null.
    branches: [{ name: "Main Bay", code: "MAIN" }],
    warehouses: [],
  },
];

async function main() {
  const platformAdmin = await findOrCreatePlatformAdmin();
  console.log("Seed complete:\n");
  console.log(`  Platform admin  ${PLATFORM_ADMIN_EMAIL} / ${PLATFORM_ADMIN_PASSWORD}`);
  console.log(`                  account ${platformAdmin.id}\n`);

  for (const spec of TENANTS) {
    const { tenant, ownerAccount } = await findOrCreateTenant(spec);
    console.log(`  ${spec.name}`);
    console.log(`                  tenant ${tenant.id} (slug "${tenant.slug}", ${tenant.currency}/${tenant.timezone})`);
    console.log(`                  owner  ${spec.ownerEmail} / ${OWNER_PASSWORD} (account ${ownerAccount.id})`);
    console.log(`                  modules ${spec.enabledModules.join(", ")}`);
    console.log(`                  ${spec.branches.length} branch(es), ${spec.warehouses.length} warehouse(s)\n`);
  }

  console.log(`  Every owner is granted: ${OWNER_GRANTED_PERMISSION_KEY}`);
}

async function findOrCreatePlatformAdmin() {
  const existing = await prisma.account.findFirst({
    where: { accountType: "PLATFORM", email: PLATFORM_ADMIN_EMAIL },
  });
  if (existing) return existing;

  return prisma.account.create({
    data: {
      accountType: "PLATFORM",
      email: PLATFORM_ADMIN_EMAIL,
      passwordHash: hashPassword(PLATFORM_ADMIN_PASSWORD),
      status: "ACTIVE",
    },
  });
}

async function findOrCreatePlan(spec: TenantSpec) {
  const existing = await prisma.plan.findUnique({ where: { code: spec.planCode } });
  if (existing) return existing;

  return prisma.plan.create({
    data: {
      code: spec.planCode,
      name: spec.planName,
      maxBranches: spec.maxBranches,
      maxUsers: spec.maxUsers,
      maxWarehouses: spec.maxWarehouses,
      allowedCategories: [spec.primaryCategory],
      allowedModules: spec.enabledModules,
      allowedFeatures: [],
      allowedReports: [],
      monthlyPrice: 0,
    },
  });
}

async function findOrCreateTenant(spec: TenantSpec) {
  const plan = await findOrCreatePlan(spec);

  const tenant =
    (await prisma.tenant.findUnique({ where: { slug: spec.slug } })) ??
    (await prisma.tenant.create({
      data: {
        name: spec.name,
        nameNormalized: spec.name.toLowerCase(),
        slug: spec.slug,
        customerRegistrationCode: spec.registrationCode,
        status: "ACTIVE",
        planId: plan.id,
        country: spec.country,
        city: spec.city,
        businessType: spec.businessType,
        primaryCategory: spec.primaryCategory,
        currency: spec.currency,
        timezone: spec.timezone,
      },
    }));

  await ensureConfiguration(tenant.id, spec);
  await ensureBranchesAndWarehouses(tenant.id, spec);
  const ownerAccount = await ensureOwner(tenant.id, spec);

  return { tenant, ownerAccount };
}

async function ensureConfiguration(tenantId: string, spec: TenantSpec) {
  const existing = await prisma.tenantConfiguration.findUnique({ where: { tenantId } });
  if (existing) return existing;

  const empty: Prisma.InputJsonValue = {};
  return prisma.tenantConfiguration.create({
    data: {
      tenantId,
      theme: empty,
      pageLayouts: empty,
      roleExperience: empty,
      workflowPolicy: empty,
      featureFlags: empty,
      enabledModules: spec.enabledModules,
      enabledFeatures: [],
      forms: empty,
      messageTemplates: empty,
    },
  });
}

async function ensureBranchesAndWarehouses(tenantId: string, spec: TenantSpec) {
  for (const branch of spec.branches) {
    const existing = await prisma.branch.findUnique({
      where: { tenantId_code: { tenantId, code: branch.code } },
    });
    if (!existing) {
      await prisma.branch.create({ data: { tenantId, name: branch.name, code: branch.code, city: spec.city } });
    }
  }

  for (const warehouse of spec.warehouses) {
    const existing = await prisma.warehouse.findUnique({
      where: { tenantId_code: { tenantId, code: warehouse.code } },
    });
    if (!existing) {
      await prisma.warehouse.create({ data: { tenantId, name: warehouse.name, code: warehouse.code } });
    }
  }
}

async function ensureOwner(tenantId: string, spec: TenantSpec) {
  const existing = await prisma.account.findFirst({ where: { tenantId, email: spec.ownerEmail } });
  if (existing) return existing;

  const account = await prisma.account.create({
    data: {
      accountType: "TENANT_STAFF",
      tenantId,
      email: spec.ownerEmail,
      passwordHash: hashPassword(OWNER_PASSWORD),
      status: "ACTIVE",
    },
  });

  await prisma.staffUser.create({
    data: {
      accountId: account.id,
      tenantId,
      fullName: spec.ownerName,
      role: "TENANT_OWNER",
      branchScope: [],
      warehouseScope: [],
      categoryScope: [spec.primaryCategory],
    },
  });

  await prisma.rolePermission.upsert({
    where: {
      tenantId_role_permissionKey: {
        tenantId,
        role: "TENANT_OWNER",
        permissionKey: OWNER_GRANTED_PERMISSION_KEY,
      },
    },
    create: { tenantId, role: "TENANT_OWNER", permissionKey: OWNER_GRANTED_PERMISSION_KEY, allowed: true },
    update: {},
  });

  return account;
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
