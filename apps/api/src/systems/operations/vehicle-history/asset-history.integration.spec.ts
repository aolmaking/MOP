/**
 * Vehicle history (P-81, docs/POLICY_DECISION_INVENTORY.md §8.B),
 * against a real database -- including the ownership-transfer privacy
 * boundary and staff authorization.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { AssetHistoryService } from "./asset-history.service";
import { TechnicianWorkViewService } from "../../../experiences/technician/technician-work-view.service";
import { WorkshopHistoryService } from "../history/workshop-history.service";
import { WorkOrderLifecycleService } from "../work-order-lifecycle.service";
import { CapabilityResolutionService } from "../../../control/capabilities/capability-resolution.service";
import { GateEvaluatorService } from "../gate-evaluator.service";
import { OperationEventsService } from "../operation-events.service";
import { AuditService } from "../../../audit/audit.service";
import { CustomerSafeProjectionService } from "../customer-safe-projection.service";
import type { PrismaService } from "../../../runtime/database/prisma.service";
import { PolicyResolutionService } from "../../../control/policies/policy-resolution.service";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;

/**
 * Policies read at runtime by the services under test. Backed by the
 * real Prisma client, so a test that writes a WorkshopPolicy row sees
 * the behaviour change -- a stub here would prove nothing about the
 * thing these tests exist to prove.
 */
const policiesForTest = new PolicyResolutionService(
  asService,
  new AuditService(asService),
  new CapabilityResolutionService(asService),
);
const history = new AssetHistoryService(asService);
const workshopHistory = new WorkshopHistoryService(asService, history);

const events = new OperationEventsService(asService, new AuditService(asService), new CustomerSafeProjectionService());
const lifecycle = new WorkOrderLifecycleService(
  asService,
  new CapabilityResolutionService(asService),
  events,
  new GateEvaluatorService(asService, policiesForTest),
  policiesForTest,
);
const techView = new TechnicianWorkViewService(
  asService,
  lifecycle,
  history,
  workshopHistory,
  policiesForTest,
  new CapabilityResolutionService(asService),
);

const SUFFIX = `avh-${Date.now()}`;
let tenantId: string;
let otherTenantId: string;
let planId: string;
let branchId: string;
let otherBranchId: string;

async function makeTenant(slug: string) {
  const tenant = await prisma.tenant.create({
    data: {
      name: `AVH WS ${slug}`,
      nameNormalized: `avh ws ${slug}`,
      slug: `avh-ws-${slug}`,
      customerRegistrationCode: `AVH-${slug}`,
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
  return tenant.id;
}

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "Vehicle History Test",
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
  tenantId = await makeTenant(SUFFIX);
  otherTenantId = await makeTenant(`${SUFFIX}-other`);

  const branch = await prisma.branch.create({ data: { tenantId, name: "Main", code: `MAIN-${SUFFIX}` } });
  branchId = branch.id;
  // The cross-tenant test needs a real work order in the OTHER tenant:
  // `technicianBrief` is asked for an asset id and a work order id, and
  // the refusal has to come from the tenant check rather than from the
  // work order simply not existing.
  const otherBranch = await prisma.branch.create({
    data: { tenantId: otherTenantId, name: "Main", code: `MAIN-${SUFFIX}-other` },
  });
  otherBranchId = otherBranch.id;
}, 120_000);

afterAll(async () => {
  for (const id of [tenantId, otherTenantId]) {
    await prisma.taskAssignment.deleteMany({ where: { tenantId: id } });
    await prisma.task.deleteMany({ where: { tenantId: id } });
    await prisma.fault.deleteMany({ where: { tenantId: id } });
    await prisma.inspection.deleteMany({ where: { tenantId: id } });
    await prisma.operationEvent.deleteMany({ where: { tenantId: id } });
    await prisma.workOrder.deleteMany({ where: { tenantId: id } });
    await prisma.assetOwnershipHistory.deleteMany({ where: { tenantId: id } });
    await prisma.asset.deleteMany({ where: { tenantId: id } });
    await prisma.staffUser.deleteMany({ where: { tenantId: id } });
    await prisma.account.deleteMany({ where: { tenantId: id } });
    await prisma.customer.deleteMany({ where: { tenantId: id } });
    await prisma.branch.deleteMany({ where: { tenantId: id } });
    await prisma.tenant.deleteMany({ where: { id } });
  }
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 120_000);

/**
 * These three cases moved with the projection they cover.
 *
 * `AssetHistoryService.build` was the flat staff-facing vehicle history
 * and is gone -- superseded by `WorkshopHistoryService.technicianBrief`,
 * which answers the same question with a truthful outcome per
 * recommendation instead of a raw customer decision. The BEHAVIOURS these
 * tests protect are not about that shape though: they are the ownership
 * boundary, tenant isolation, and the empty vehicle, and every one of
 * them still has to hold. So they are re-pointed rather than deleted.
 */
describe("WorkshopHistoryService.technicianBrief -- ownership, tenancy and emptiness", () => {
  it("preserves technical history across an ownership transfer, but never names a prior owner anywhere in the output", async () => {
    const ownerA = await prisma.customer.create({ data: { tenantId, fullName: "Owner Alpha", phone: `0166${SUFFIX}a` } });
    const ownerB = await prisma.customer.create({ data: { tenantId, fullName: "Owner Beta", phone: `0166${SUFFIX}b` } });
    const asset = await prisma.asset.create({
      data: { tenantId, category: "CARS", plateNumber: `ABC-${SUFFIX}`, currentOwnerCustomerId: ownerA.id },
    });
    await prisma.assetOwnershipHistory.create({ data: { tenantId, assetId: asset.id, customerId: ownerA.id } });

    const firstVisit = await prisma.workOrder.create({
      data: { tenantId, branchId, assetId: asset.id, customerId: ownerA.id, status: "CLOSED", closedAt: new Date() },
    });
    await prisma.fault.create({
      data: { tenantId, workOrderId: firstVisit.id, description: "Worn belt tensioner", severity: "MEDIUM" },
    });

    // Transfer ownership -- same discipline as IntakeService.transferOwnership.
    await prisma.assetOwnershipHistory.updateMany({ where: { assetId: asset.id, endedAt: null }, data: { endedAt: new Date() } });
    await prisma.assetOwnershipHistory.create({ data: { tenantId, assetId: asset.id, customerId: ownerB.id } });
    await prisma.asset.update({ where: { id: asset.id }, data: { currentOwnerCustomerId: ownerB.id } });

    const secondVisit = await prisma.workOrder.create({
      data: { tenantId, branchId, assetId: asset.id, customerId: ownerB.id, status: "IN_PROGRESS" },
    });

    const report = await workshopHistory.technicianBrief(tenantId, asset.id, secondVisit.id);

    // The technical fact from Owner A's era is still visible to the new owner's technician...
    expect(report.hasPriorOwnerHistory).toBe(true);
    const priorFinding = report.previousFindings.find((f) => f.workOrderId === firstVisit.id);
    expect(priorFinding).toBeDefined();
    expect(priorFinding!.description).toBe("Worn belt tensioner");
    expect(priorFinding!.sameOwnerAsCurrent).toBe(false);

    // ...but Owner A's identity never appears anywhere in the payload.
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("Owner Alpha");
    expect(serialized).not.toContain(ownerA.id);
    expect(serialized).not.toMatch(/phone/i);
  });

  it("never leaks another tenant's asset history", async () => {
    const customer = await prisma.customer.create({ data: { tenantId: otherTenantId, fullName: "Other Tenant Customer", phone: `9${SUFFIX}` } });
    const otherAsset = await prisma.asset.create({
      data: { tenantId: otherTenantId, category: "CARS", plateNumber: `OTH-${SUFFIX}`, currentOwnerCustomerId: customer.id },
    });
    const otherWorkOrder = await prisma.workOrder.create({
      data: { tenantId: otherTenantId, branchId: otherBranchId, assetId: otherAsset.id, customerId: customer.id, status: "IN_PROGRESS" },
    });

    await expect(workshopHistory.technicianBrief(tenantId, otherAsset.id, otherWorkOrder.id)).rejects.toMatchObject({ status: 404 });
  });

  it("handles a vehicle with no prior visits at all", async () => {
    const customer = await prisma.customer.create({ data: { tenantId, fullName: "Fresh Owner", phone: `0177${SUFFIX}` } });
    const asset = await prisma.asset.create({
      data: { tenantId, category: "CARS", plateNumber: `NEW-${SUFFIX}`, currentOwnerCustomerId: customer.id },
    });
    const onlyVisit = await prisma.workOrder.create({
      data: { tenantId, branchId, assetId: asset.id, customerId: customer.id, status: "REGISTERED" },
    });

    const report = await workshopHistory.technicianBrief(tenantId, asset.id, onlyVisit.id);
    expect(report.priorVisits).toBe(0);
    expect(report.hasPriorOwnerHistory).toBe(false);
    expect(report.previousComplaints).toEqual([]);
    expect(report.previousFindings).toEqual([]);
    expect(report.previousRecommendations).toEqual([]);
    expect(report.unresolved).toEqual([]);
  });
});

describe("TechnicianWorkViewService.vehicleHistory -- authorization boundary", () => {
  it("refuses a technician access to vehicle history for a work order not assigned to them", async () => {
    const customer = await prisma.customer.create({ data: { tenantId, fullName: "Boundary Customer", phone: `0188${SUFFIX}` } });
    const asset = await prisma.asset.create({
      data: { tenantId, category: "CARS", plateNumber: `BND-${SUFFIX}`, currentOwnerCustomerId: customer.id },
    });
    const workOrder = await prisma.workOrder.create({
      data: { tenantId, branchId, assetId: asset.id, customerId: customer.id, status: "IN_PROGRESS" },
    });

    const account = await prisma.account.create({
      data: { accountType: "TENANT_STAFF", tenantId, email: `unassigned-${SUFFIX}@example.com`, status: "ACTIVE" },
    });
    const unassignedTech = await prisma.staffUser.create({
      data: { accountId: account.id, tenantId, fullName: "Unassigned Tech", role: "TECHNICIAN" },
    });

    await expect(techView.vehicleHistory(unassignedTech.id, tenantId, workOrder.id)).rejects.toMatchObject({ status: 404 });
  });

  it("lets an assigned technician see the vehicle's history", async () => {
    const customer = await prisma.customer.create({ data: { tenantId, fullName: "Assigned Customer", phone: `0199${SUFFIX}` } });
    const asset = await prisma.asset.create({
      data: { tenantId, category: "CARS", plateNumber: `ASG-${SUFFIX}`, currentOwnerCustomerId: customer.id },
    });
    const workOrder = await prisma.workOrder.create({
      data: { tenantId, branchId, assetId: asset.id, customerId: customer.id, status: "IN_PROGRESS" },
    });

    const account = await prisma.account.create({
      data: { accountType: "TENANT_STAFF", tenantId, email: `assigned-${SUFFIX}@example.com`, status: "ACTIVE" },
    });
    const tech = await prisma.staffUser.create({
      data: { accountId: account.id, tenantId, fullName: "Assigned Tech", role: "TECHNICIAN" },
    });
    await prisma.workOrderAssignment.create({ data: { tenantId, workOrderId: workOrder.id, staffUserId: tech.id } });

    const report = await techView.vehicleHistory(tech.id, tenantId, workOrder.id);
    expect(report.asset.id).toBe(asset.id);
  });
});
