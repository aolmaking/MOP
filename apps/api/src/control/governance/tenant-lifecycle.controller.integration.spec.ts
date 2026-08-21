/**
 * The archive/reactivate HTTP surface -- TenantLifecycleService has
 * existed since Phase 18 with no route calling it. Guard behavior
 * (SessionGuard/PlatformGuard) is already exhaustively proven against
 * real HTTP for the identical pattern in platform.controller.integration.spec.ts;
 * this proves the controller wiring itself reaches the real service
 * against a real tenant.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { TenantLifecycleController } from "./tenant-lifecycle.controller";
import { TenantLifecycleService } from "../tenant-relationships/tenant-lifecycle.service";
import type { PrismaService } from "../../runtime/database/prisma.service";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;
const controller = new TenantLifecycleController(new TenantLifecycleService(asService));

const SUFFIX = `tlc-${Date.now()}`;
let planId: string;
let tenantId: string;

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "TLC",
      maxBranches: 5,
      maxUsers: 50,
      maxWarehouses: 5,
      allowedCategories: ["CARS"],
      allowedModules: [],
      allowedFeatures: [],
      allowedReports: [],
      monthlyPrice: 0,
    },
  });
  planId = plan.id;

  const tenant = await prisma.tenant.create({
    data: {
      name: `TLC ${SUFFIX}`,
      nameNormalized: `tlc ${SUFFIX}`,
      slug: `tlc-${SUFFIX}`,
      customerRegistrationCode: `TLC-${SUFFIX}`,
      status: "ACTIVE",
      planId,
      country: "EG",
      city: "Cairo",
      businessType: "Garage",
      primaryCategory: "CARS",
      currency: "EGP",
      timezone: "Africa/Cairo",
    },
  });
  tenantId = tenant.id;
}, 120_000);

afterAll(async () => {
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 120_000);

describe("archive/reactivate over the real controller", () => {
  it("archives a real tenant with a custom retention period", async () => {
    const result = await controller.archive(tenantId, { retentionYears: 3 });
    expect(result.status).toBe("ARCHIVED");

    const stored = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    expect(stored.status).toBe("ARCHIVED");
    expect(new Date(stored.retentionUntil!).getFullYear()).toBe(new Date().getFullYear() + 3);
  });

  it("reactivates into READ_ONLY, not ACTIVE", async () => {
    const result = await controller.reactivate(tenantId);
    expect(result.status).toBe("READ_ONLY");

    const stored = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    expect(stored.status).toBe("READ_ONLY");
  });
});
