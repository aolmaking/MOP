/**
 * Data Analyst -- Customer Decision Analytics, against a real database.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { DecisionsAnalyticsService } from "./decisions-analytics.service";
import type { PrismaService } from "../../runtime/database/prisma.service";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;
const decisions = new DecisionsAnalyticsService(asService);

const SUFFIX = `adec-${Date.now()}`;
let tenantId: string;
let planId: string;
let branchId: string;
let customerId: string;
let assetId: string;

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "Analytics Decisions Test",
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
      name: `ADec WS ${SUFFIX}`,
      nameNormalized: `adec ws ${SUFFIX}`,
      slug: `adec-ws-${SUFFIX}`,
      customerRegistrationCode: `ADEC-${SUFFIX}`,
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
  const customer = await prisma.customer.create({ data: { tenantId, fullName: "Fady", phone: "0100000008" } });
  customerId = customer.id;
  const asset = await prisma.asset.create({ data: { tenantId, category: "CARS", plateNumber: `P-${SUFFIX}` } });
  assetId = asset.id;
}, 120_000);

afterAll(async () => {
  await prisma.customerDecisionItem.deleteMany({ where: { tenantId } });
  await prisma.customerDecisionRequest.deleteMany({ where: { tenantId } });
  await prisma.workOrder.deleteMany({ where: { tenantId } });
  await prisma.asset.deleteMany({ where: { tenantId } });
  await prisma.customer.deleteMany({ where: { tenantId } });
  await prisma.branch.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 120_000);

const NO_SCOPE = { branchIds: [], categoryIds: [] };
let requestCounter = 0;

async function makeRequest(status: string, sentAt: Date | null, respondedAt: Date | null) {
  const wo = await prisma.workOrder.create({ data: { tenantId, branchId, assetId, customerId, status: "AWAITING_CUSTOMER_APPROVAL" } });
  requestCounter += 1;
  return prisma.customerDecisionRequest.create({
    data: {
      tenantId,
      workOrderId: wo.id,
      customerId,
      status: status as never,
      secureToken: `tok-${SUFFIX}-${requestCounter}`,
      createdById: "staff-1",
      sentAt,
      respondedAt,
    },
  });
}

describe("DecisionsAnalyticsService", () => {
  it("never includes any customer-identifying field anywhere in its output shape", async () => {
    const report = await decisions.build(tenantId, NO_SCOPE, {});
    const serialized = JSON.stringify(report);
    expect(serialized).not.toMatch(/phone|email|fullName/i);
  });

  it("computes approval rate as approved items over total decided items", async () => {
    const request = await makeRequest("RESOLVED", new Date(), new Date());
    await prisma.customerDecisionItem.create({
      data: { tenantId, decisionRequestId: request.id, name: "A", explanation: "x", importance: "MEDIUM", price: 10, total: 10, decision: "APPROVED", decidedAt: new Date() },
    });
    await prisma.customerDecisionItem.create({
      data: { tenantId, decisionRequestId: request.id, name: "B", explanation: "x", importance: "MEDIUM", price: 10, total: 10, decision: "REJECTED", decidedAt: new Date() },
    });

    const report = await decisions.build(tenantId, NO_SCOPE, {});
    expect(report.approvalRate).toBeCloseTo(50, 0);
    expect(report.rejectionRate).toBeCloseTo(50, 0);
  });

  it("flags a critical rejection, and detects when the same work order was later approved on anything", async () => {
    const request = await makeRequest("RESOLVED", new Date(), new Date());
    await prisma.customerDecisionItem.create({
      data: {
        tenantId,
        decisionRequestId: request.id,
        name: "Critical repair",
        explanation: "x",
        importance: "CRITICAL",
        price: 500,
        total: 500,
        decision: "REJECTED",
        decidedAt: new Date(),
      },
    });
    const laterRequest = await prisma.customerDecisionRequest.create({
      data: {
        tenantId,
        workOrderId: request.workOrderId,
        customerId,
        status: "RESOLVED",
        secureToken: `tok-${SUFFIX}-later`,
        createdById: "staff-1",
      },
    });
    await prisma.customerDecisionItem.create({
      data: {
        tenantId,
        decisionRequestId: laterRequest.id,
        name: "Follow-up",
        explanation: "x",
        importance: "MEDIUM",
        price: 50,
        total: 50,
        decision: "APPROVED",
        decidedAt: new Date(),
      },
    });

    const report = await decisions.build(tenantId, NO_SCOPE, {});
    expect(report.criticalRejections).toBeGreaterThanOrEqual(1);
    expect(report.criticalRejectionsLaterApproved).toBeGreaterThanOrEqual(1);
  });

  it("computes average response hours only from requests that were actually responded to", async () => {
    const sentAt = new Date(Date.now() - 5 * 60 * 60 * 1000);
    await makeRequest("RESOLVED", sentAt, new Date());

    const report = await decisions.build(tenantId, NO_SCOPE, {});
    expect(report.averageResponseHours).not.toBeNull();
    expect(report.averageResponseHours!).toBeGreaterThan(0);
  });

  it("handles a workshop with zero decision requests", async () => {
    const emptyTenant = await prisma.tenant.create({
      data: {
        name: `ADec Empty ${SUFFIX}`,
        nameNormalized: `adec empty ${SUFFIX}`,
        slug: `adec-empty-${SUFFIX}`,
        customerRegistrationCode: `ADECE-${SUFFIX}`,
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

    const report = await decisions.build(emptyTenant.id, NO_SCOPE, {});
    expect(report.approvalRate).toBe(0);
    expect(report.averageResponseHours).toBeNull();
    expect(report.byImportance).toEqual([]);

    await prisma.tenant.delete({ where: { id: emptyTenant.id } });
  });
});
