/**
 * Workflow Health -- consistency checks, against a real database.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { WorkflowIntegrityService } from "./workflow-integrity.service";
import type { PrismaService } from "../database/prisma.service";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;
const integrity = new WorkflowIntegrityService(asService);

const SUFFIX = `wint-${Date.now()}`;
let tenantId: string;
let planId: string;
let branchId: string;
let customerId: string;
let assetId: string;
let warehouseId: string;

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "Integrity Test",
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
      name: `WInt WS ${SUFFIX}`,
      nameNormalized: `wint ws ${SUFFIX}`,
      slug: `wint-ws-${SUFFIX}`,
      customerRegistrationCode: `WINT-${SUFFIX}`,
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

  const branch = await prisma.branch.create({ data: { tenantId, name: "Main", code: `MAIN-${SUFFIX}` } });
  branchId = branch.id;
  const warehouse = await prisma.warehouse.create({ data: { tenantId, name: "Central", code: `CTR-${SUFFIX}` } });
  warehouseId = warehouse.id;
  const customer = await prisma.customer.create({ data: { tenantId, fullName: "Hana", phone: "0100000004" } });
  customerId = customer.id;
  const asset = await prisma.asset.create({ data: { tenantId, category: "CARS", plateNumber: `P-${SUFFIX}` } });
  assetId = asset.id;
}, 120_000);

afterAll(async () => {
  await prisma.customerDecisionItem.deleteMany({ where: { tenantId } });
  await prisma.customerDecisionRequest.deleteMany({ where: { tenantId } });
  await prisma.partReturnRequest.deleteMany({ where: { tenantId } });
  await prisma.issuedItem.deleteMany({ where: { tenantId } });
  await prisma.partRequest.deleteMany({ where: { tenantId } });
  await prisma.task.deleteMany({ where: { tenantId } });
  await prisma.teamMembership.deleteMany({ where: { tenantId } });
  await prisma.team.deleteMany({ where: { tenantId } });
  await prisma.operationEvent.deleteMany({ where: { tenantId } });
  await prisma.workOrder.deleteMany({ where: { tenantId } });
  await prisma.inventoryItem.deleteMany({ where: { tenantId } });
  await prisma.asset.deleteMany({ where: { tenantId } });
  await prisma.customer.deleteMany({ where: { tenantId } });
  await prisma.staffUser.deleteMany({ where: { tenantId } });
  await prisma.account.deleteMany({ where: { tenantId } });
  await prisma.warehouse.deleteMany({ where: { tenantId } });
  await prisma.branch.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 120_000);

describe("WorkflowIntegrityService", () => {
  it("flags a part issued and never confirmed arrived, beyond the threshold", async () => {
    const wo = await prisma.workOrder.create({ data: { tenantId, branchId, assetId, customerId, status: "IN_PROGRESS" } });
    const item = await prisma.inventoryItem.create({
      data: { tenantId, sku: `SKU-${SUFFIX}`, name: "Filter", itemType: "PART", sellingPrice: 50 },
    });
    const partRequest = await prisma.partRequest.create({
      data: { tenantId, workOrderId: wo.id, inventoryItemId: item.id, requestedById: "staff-1", quantity: 1 },
    });
    await prisma.issuedItem.create({
      data: {
        tenantId,
        partRequestId: partRequest.id,
        warehouseId,
        quantity: 1,
        issuedById: "staff-1",
        issuedAt: new Date(Date.now() - 30 * 60 * 60 * 1000),
        arrivedAt: null,
      },
    });

    const report = await integrity.build(tenantId);
    expect(report.issues.some((i) => i.type === "PART_ARRIVAL_UNCONFIRMED")).toBe(true);
  });

  it("does not flag a part issued recently, within the threshold", async () => {
    const wo = await prisma.workOrder.create({ data: { tenantId, branchId, assetId, customerId, status: "IN_PROGRESS" } });
    const item = await prisma.inventoryItem.create({
      data: { tenantId, sku: `SKU2-${SUFFIX}`, name: "Belt", itemType: "PART", sellingPrice: 30 },
    });
    const partRequest = await prisma.partRequest.create({
      data: { tenantId, workOrderId: wo.id, inventoryItemId: item.id, requestedById: "staff-1", quantity: 1 },
    });
    const recentIssue = await prisma.issuedItem.create({
      data: { tenantId, partRequestId: partRequest.id, warehouseId, quantity: 1, issuedById: "staff-1", arrivedAt: null },
    });

    const report = await integrity.build(tenantId);
    expect(report.issues.some((i) => i.entityId === recentIssue.id)).toBe(false);
  });

  it("flags a fully-answered decision request whose work order is still waiting", async () => {
    const wo = await prisma.workOrder.create({
      data: { tenantId, branchId, assetId, customerId, status: "AWAITING_CUSTOMER_APPROVAL" },
    });
    const request = await prisma.customerDecisionRequest.create({
      data: {
        tenantId,
        workOrderId: wo.id,
        customerId,
        status: "PARTIALLY_RESPONDED",
        secureToken: `tok-${SUFFIX}-1`,
        createdById: "staff-1",
      },
    });
    await prisma.customerDecisionItem.create({
      data: {
        tenantId,
        decisionRequestId: request.id,
        name: "Brake pads",
        explanation: "Worn",
        importance: "HIGH",
        price: 100,
        total: 100,
        decision: "APPROVED",
        decidedAt: new Date(),
      },
    });

    const report = await integrity.build(tenantId);
    expect(report.issues.some((i) => i.type === "CUSTOMER_RESPONSE_NOT_REFLECTED" && i.entityId === request.id)).toBe(
      true,
    );
  });

  it("flags a return request open past the review threshold", async () => {
    const wo = await prisma.workOrder.create({ data: { tenantId, branchId, assetId, customerId, status: "IN_PROGRESS" } });
    const item = await prisma.inventoryItem.create({
      data: { tenantId, sku: `SKU3-${SUFFIX}`, name: "Spark plug", itemType: "PART", sellingPrice: 20 },
    });
    const partRequest = await prisma.partRequest.create({
      data: { tenantId, workOrderId: wo.id, inventoryItemId: item.id, requestedById: "staff-1", quantity: 1 },
    });
    const returnRequest = await prisma.partReturnRequest.create({
      data: {
        tenantId,
        partRequestId: partRequest.id,
        quantity: 1,
        requestedById: "staff-1",
        warehouseId,
        createdAt: new Date(Date.now() - 60 * 60 * 60 * 1000),
      },
    });

    const report = await integrity.build(tenantId);
    expect(report.issues.some((i) => i.type === "RETURN_PENDING_REVIEW" && i.entityId === returnRequest.id)).toBe(true);
  });

  it("flags a work order whose tasks are all done but the work order itself has not advanced", async () => {
    const wo = await prisma.workOrder.create({ data: { tenantId, branchId, assetId, customerId, status: "IN_PROGRESS" } });
    await prisma.task.create({ data: { tenantId, workOrderId: wo.id, title: "Replace oil", status: "DONE" } });

    const report = await integrity.build(tenantId);
    expect(report.issues.some((i) => i.type === "WORK_ORDER_TASK_STATUS_CONFLICT" && i.entityId === wo.id)).toBe(true);
  });

  it("flags a moved work order with zero status-change history as orphaned", async () => {
    const wo = await prisma.workOrder.create({ data: { tenantId, branchId, assetId, customerId, status: "CLOSED" } });
    // Deliberately no OperationEvent written -- simulating a status set by something other than the lifecycle service.

    const report = await integrity.build(tenantId);
    expect(report.issues.some((i) => i.type === "ORPHANED_STATUS_CHANGE" && i.entityId === wo.id)).toBe(true);
  });

  it("does not flag a work order whose status change is properly recorded", async () => {
    const wo = await prisma.workOrder.create({ data: { tenantId, branchId, assetId, customerId, status: "CLOSED" } });
    await prisma.operationEvent.create({
      data: {
        tenantId,
        eventKey: "work_order.status_changed",
        payload: { workOrderId: wo.id, from: "IN_PROGRESS", to: "CLOSED" },
        actorId: "staff-1",
        actorType: "TENANT_STAFF",
      },
    });

    const report = await integrity.build(tenantId);
    expect(report.issues.some((i) => i.type === "ORPHANED_STATUS_CHANGE" && i.entityId === wo.id)).toBe(false);
  });

  it("flags a Team Leader who manages an active team but whose role cannot view team reports", async () => {
    const account = await prisma.account.create({
      data: { accountType: "TENANT_STAFF", tenantId, email: `tl-${SUFFIX}@example.com`, status: "ACTIVE" },
    });
    const leader = await prisma.staffUser.create({
      data: { accountId: account.id, tenantId, fullName: "Team Leader Test", role: "TEAM_LEADER" },
    });
    await prisma.team.create({
      data: { tenantId, name: `Team ${SUFFIX}`, teamLeaderId: leader.id, isActive: true },
    });
    // No RolePermission row for TEAM_LEADER/reports.team.view -- falls back to the platform default.

    const report = await integrity.build(tenantId);
    const found = report.issues.find(
      (i) => i.type === "TEAM_LEADER_MISSING_REPORT_ACCESS" && i.entityId === leader.id,
    );
    // Only assert if the platform default for this key is actually false --
    // if a future default grants it, this specific leader should NOT be flagged.
    const { DEFAULT_ROLE_PERMISSIONS } = await import("@mop/shared");
    const defaultAllowed = DEFAULT_ROLE_PERMISSIONS.TEAM_LEADER?.["reports.team.view"] ?? false;
    if (!defaultAllowed) {
      expect(found).toBeDefined();
    } else {
      expect(found).toBeUndefined();
    }
  });

  it("names the Customer-Portal-policy check as explicitly not computable, rather than faking it", async () => {
    const report = await integrity.build(tenantId);
    expect(report.notComputable.some((n) => n.issueType === "CUSTOMER_PORTAL_POLICY_MODULE_CONTRADICTION")).toBe(true);
  });

  it("never leaks across tenants", async () => {
    const otherTenant = await prisma.tenant.create({
      data: {
        name: `WInt Other ${SUFFIX}`,
        nameNormalized: `wint other ${SUFFIX}`,
        slug: `wint-other-${SUFFIX}`,
        customerRegistrationCode: `WINTO-${SUFFIX}`,
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

    const report = await integrity.build(otherTenant.id);
    expect(report.issues).toEqual([]);

    await prisma.tenant.delete({ where: { id: otherTenant.id } });
  });
});
