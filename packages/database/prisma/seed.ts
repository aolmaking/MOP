/**
 * Minimal smoke-test seed: one plan, one platform admin, one tenant with
 * its first owner (plus one real RolePermission grant, so the owner has
 * at least one permission key that resolves ALLOW, not just DENY-by-
 * default). Enough to run the Phase 1 verification sequence end to end
 * against a real database -- not meant to represent realistic production
 * data, and not something later phases should build on top of.
 *
 * Idempotent: safe to re-run against the same database. Looks up each
 * row by a fixed, well-known identifier before creating it, rather than
 * inserting duplicates every run.
 */
// Relative, not "@prisma/client" or "@mop/database": the schema generates
// into a custom location (see prisma/schema.prisma's generator block), so
// the plain package name resolves to an uninitialized stub, not this
// project's real generated client.
import { PrismaClient } from "../generated/client";
import { randomBytes, scryptSync } from "node:crypto";

const prisma = new PrismaClient();

// --- password hashing -------------------------------------------------
// Duplicated from apps/api/src/auth/password.util.ts on purpose, not by
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
const PLAN_CODE = "SEED-STARTER";
const TENANT_SLUG = "seed-workshop";
const OWNER_EMAIL = "owner@seed-workshop.local";
const OWNER_PASSWORD = "ChangeMe-Owner-123";
// Granted directly below so the seeded owner has one real ALLOW path to
// test against, alongside every other key correctly denying by default.
const OWNER_GRANTED_PERMISSION_KEY = "organization.access.manage";

async function main() {
  const plan = await findOrCreatePlan();
  const platformAdmin = await findOrCreatePlatformAdmin();
  const { tenant, owner } = await findOrCreateTenantWithOwner(plan.id);

  console.log("Seed complete:");
  console.log(`  Platform admin: ${PLATFORM_ADMIN_EMAIL} / ${PLATFORM_ADMIN_PASSWORD} (account ${platformAdmin.id})`);
  console.log(`  Tenant:         ${tenant.name} (${tenant.id}, slug "${tenant.slug}")`);
  console.log(`  Owner:          ${OWNER_EMAIL} / ${OWNER_PASSWORD} (account ${owner.id})`);
  console.log(`  Owner is granted: ${OWNER_GRANTED_PERMISSION_KEY}`);
}

async function findOrCreatePlan() {
  const existing = await prisma.plan.findUnique({ where: { code: PLAN_CODE } });
  if (existing) return existing;

  return prisma.plan.create({
    data: {
      code: PLAN_CODE,
      name: "Seed Starter Plan",
      maxBranches: 3,
      maxUsers: 15,
      maxWarehouses: 3,
      allowedCategories: ["CARS"],
      allowedModules: [],
      allowedFeatures: [],
      allowedReports: [],
      monthlyPrice: 0,
    },
  });
}

async function findOrCreatePlatformAdmin() {
  const existing = await prisma.account.findFirst({ where: { accountType: "PLATFORM", email: PLATFORM_ADMIN_EMAIL } });
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

async function findOrCreateTenantWithOwner(planId: string) {
  const existingTenant = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG } });
  if (existingTenant) {
    const existingOwnerAccount = await prisma.account.findFirst({
      where: { tenantId: existingTenant.id, email: OWNER_EMAIL },
    });
    if (existingOwnerAccount) return { tenant: existingTenant, owner: existingOwnerAccount };
  }

  const tenant =
    existingTenant ??
    (await prisma.tenant.create({
      data: {
        name: "Seed Workshop",
        slug: TENANT_SLUG,
        customerRegistrationCode: "SEED-001",
        status: "ACTIVE",
        planId,
        country: "EG",
        city: "Cairo",
        businessType: "Independent Garage",
        primaryCategory: "CARS",
        currency: "EGP",
        timezone: "Africa/Cairo",
      },
    }));

  const existingConfiguration = await prisma.tenantConfiguration.findUnique({ where: { tenantId: tenant.id } });
  if (!existingConfiguration) {
    await prisma.tenantConfiguration.create({
      data: {
        tenantId: tenant.id,
        theme: {},
        pageLayouts: {},
        roleExperience: {},
        workflowPolicy: {},
        featureFlags: {},
        // ORGANIZATION enabled so OWNER_GRANTED_PERMISSION_KEY resolves
        // ALLOW rather than being blocked earlier by ModuleEnabledLayer.
        enabledModules: ["ORGANIZATION"],
        enabledFeatures: [],
        forms: {},
        messageTemplates: {},
      },
    });
  }

  const owner = await prisma.account.create({
    data: {
      accountType: "TENANT_STAFF",
      tenantId: tenant.id,
      email: OWNER_EMAIL,
      passwordHash: hashPassword(OWNER_PASSWORD),
      status: "ACTIVE",
    },
  });
  await prisma.staffUser.create({
    data: {
      accountId: owner.id,
      tenantId: tenant.id,
      fullName: "Seed Owner",
      role: "TENANT_OWNER",
      branchScope: [],
      warehouseScope: [],
      categoryScope: ["CARS"],
    },
  });
  await prisma.rolePermission.create({
    data: { tenantId: tenant.id, role: "TENANT_OWNER", permissionKey: OWNER_GRANTED_PERMISSION_KEY, allowed: true },
  });

  return { tenant, owner };
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
