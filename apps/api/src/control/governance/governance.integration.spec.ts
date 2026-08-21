/**
 * Phase 19's governance-depth primitives, proven against a real database:
 * 19.B (dispute state, non-destructive), 19.D (restricted-account state,
 * both the service that sets it and the layer that enforces it).
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { WorkOrderDisputeService } from "./work-order-dispute.service";
import { StaffRestrictionService } from "./staff-restriction.service";
import { AuditService } from "../../audit/audit.service";
import { StaffRestrictionLayer } from "../../identity/access/layers/staff-restriction.layer";
import type { PrismaService } from "../../runtime/database/prisma.service";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;
const disputes = new WorkOrderDisputeService(asService);
const restrictions = new StaffRestrictionService(asService, new AuditService(asService));

const SUFFIX = `gov-${Date.now()}`;
let planId: string;
let tenantId: string;
let workOrderId: string;
let staffUserId: string;

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "Governance",
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
      name: `Gov ${SUFFIX}`,
      nameNormalized: `gov ${SUFFIX}`,
      slug: `gov-${SUFFIX}`,
      customerRegistrationCode: `GOV-${SUFFIX}`,
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

  const branch = await prisma.branch.create({ data: { tenantId, name: "Main", code: `B-${SUFFIX}` } });
  const customer = await prisma.customer.create({ data: { tenantId, fullName: "Customer", phone: "0100000030" } });
  const asset = await prisma.asset.create({ data: { tenantId, category: "CARS" } });
  const workOrder = await prisma.workOrder.create({
    data: { tenantId, branchId: branch.id, assetId: asset.id, customerId: customer.id, status: "CLOSED" },
  });
  workOrderId = workOrder.id;

  const account = await prisma.account.create({
    data: { accountType: "TENANT_STAFF", email: `staff-${SUFFIX}@example.com`, status: "ACTIVE" },
  });
  const staff = await prisma.staffUser.create({
    data: { accountId: account.id, tenantId, fullName: "Technician", role: "TECHNICIAN" },
  });
  staffUserId = staff.id;
}, 120_000);

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { tenantId } });
  await prisma.workOrderDispute.deleteMany({ where: { tenantId } });
  await prisma.workOrder.deleteMany({ where: { tenantId } });
  await prisma.asset.deleteMany({ where: { tenantId } });
  await prisma.customer.deleteMany({ where: { tenantId } });
  await prisma.staffUser.deleteMany({ where: { tenantId } });
  await prisma.branch.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 120_000);

describe("19.B -- dispute state, non-destructive", () => {
  it("raises a dispute without touching WorkOrder.status", async () => {
    const dispute = await disputes.raise(tenantId, workOrderId, "customer-1", "Customer says the invoice total is wrong");

    expect(dispute.status).toBe("OPEN");

    const workOrder = await prisma.workOrder.findUniqueOrThrow({ where: { id: workOrderId } });
    expect(workOrder.status).toBe("CLOSED"); // unchanged -- WorkOrderLifecycleService's domain, untouched
  });

  it("resolving a dispute adds a resolution without deleting the original dispute row", async () => {
    const dispute = await disputes.raise(tenantId, workOrderId, "customer-1", "Second dispute");
    const resolved = await disputes.resolve(dispute.id, "owner-1", "Reviewed and corrected");

    expect(resolved.status).toBe("RESOLVED");
    expect(resolved.resolutionNote).toBe("Reviewed and corrected");

    const all = await disputes.forWorkOrder(tenantId, workOrderId);
    expect(all.map((d) => d.id)).toContain(dispute.id); // still there, not deleted
  });
});

describe("19.D -- restricted account state", () => {
  it("restricts an account, recorded with a HIGH-risk audit row", async () => {
    const result = await restrictions.restrict(tenantId, staffUserId, "Under investigation", "owner-1", "Owner");

    expect(result.restrictionStatus).toBe("RESTRICTED_PENDING_INVESTIGATION");
    expect(result.restrictedAt).not.toBeNull();

    const auditRow = await prisma.auditLog.findFirst({
      where: { tenantId, targetId: staffUserId, action: "governance.staff.restricted" },
    });
    expect(auditRow?.riskLevel).toBe("HIGH");
  });

  it("refuses to restrict an already-restricted account", async () => {
    await expect(restrictions.restrict(tenantId, staffUserId, "again", "owner-1", "Owner")).rejects.toThrow();
  });

  it("lifting a restriction clears it, and the layer allows mutations again", async () => {
    const before = await restrictions.lift(tenantId, staffUserId, "owner-1", "Owner");
    expect(before.restrictionStatus).toBe("NONE");

    const layer = new StaffRestrictionLayer();
    const decision = layer.evaluate(
      { staffRestrictionStatus: before.restrictionStatus } as never,
      "inventory.stock.adjust",
    );
    expect(decision).toBeNull(); // no restriction, layer has no opinion
  });

  it("the layer denies a mutation while an account is restricted -- proven against a real restriction record", async () => {
    const restricted = await restrictions.restrict(tenantId, staffUserId, "Second review", "owner-1", "Owner");

    const layer = new StaffRestrictionLayer();
    const decision = layer.evaluate(
      { staffRestrictionStatus: restricted.restrictionStatus } as never,
      "inventory.stock.adjust",
    );
    expect(decision?.allowed).toBe(false);

    await restrictions.lift(tenantId, staffUserId, "owner-1", "Owner");
  });
});
