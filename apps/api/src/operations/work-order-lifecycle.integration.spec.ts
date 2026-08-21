/**
 * The Phase 4 exit criterion, as a test.
 *
 * One work order is driven from intake to CLOSED under three different
 * capability profiles, through the same code, with no transition
 * hardcoded anywhere. The lifecycle differs in each case purely because
 * the workshop's capabilities differ:
 *
 *   full service   IN_PROGRESS -> team review -> QC -> invoice -> delivery
 *   quick service  IN_PROGRESS -> invoice -> delivery
 *   external finance  IN_PROGRESS -> delivery
 *
 * Integration rather than unit, because the router's decisions are only
 * meaningful against stored capabilities, real gates and a real
 * transaction.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import type { WorkflowIntent } from "@mop/shared";
import { WorkOrderLifecycleService } from "./work-order-lifecycle.service";
import { GateEvaluatorService } from "./gate-evaluator.service";
import { OperationEventsService } from "./operation-events.service";
import { CustomerSafeProjectionService } from "./customer-safe-projection.service";
import { CapabilityResolutionService } from "../capabilities/capability-resolution.service";
import { AuditService } from "../audit/audit.service";
import type { PrismaService } from "../database/prisma.service";
import { PolicyResolutionService } from "../policies/policy-resolution.service";

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

const capabilities = new CapabilityResolutionService(asService);
const audit = new AuditService(asService);
const events = new OperationEventsService(asService, audit, new CustomerSafeProjectionService());
const gates = new GateEvaluatorService(asService, policiesForTest);
const lifecycle = new WorkOrderLifecycleService(asService, capabilities, events, gates, policiesForTest);

const ACTOR = { accountId: "tech-1", displayName: "Technician", actorType: "TENANT_STAFF" as const };
const SUFFIX = `wo-${Date.now()}`;

interface Fixture {
  tenantId: string;
  branchId: string;
  customerId: string;
  assetId: string;
  planId: string;
}

async function createWorkshop(slug: string, disabled: Record<string, string>): Promise<Fixture> {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${slug}`,
      name: slug,
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

  const tenant = await prisma.tenant.create({
    data: {
      name: `WS ${slug}`,
      nameNormalized: `ws ${slug}`,
      slug,
      customerRegistrationCode: slug.toUpperCase(),
      status: "ACTIVE",
      planId: plan.id,
      country: "EG",
      city: "Cairo",
      businessType: "Garage",
      primaryCategory: "CARS",
      currency: "EGP",
      timezone: "Africa/Cairo",
    },
  });

  for (const [capabilityKey, status] of Object.entries(disabled)) {
    await prisma.tenantCapability.create({
      data: {
        tenantId: tenant.id,
        capabilityKey,
        status: status as never,
        source: "PLATFORM",
        configuredBy: "test",
      },
    });
  }

  const branch = await prisma.branch.create({ data: { tenantId: tenant.id, name: "Main", code: "MAIN" } });
  const customer = await prisma.customer.create({
    data: { tenantId: tenant.id, fullName: "Customer", phone: "0100000000" },
  });
  const asset = await prisma.asset.create({
    data: { tenantId: tenant.id, category: "CARS", plateNumber: `P-${slug}` },
  });

  return { tenantId: tenant.id, branchId: branch.id, customerId: customer.id, assetId: asset.id, planId: plan.id };
}

async function newWorkOrder(fixture: Fixture, inspectionDeclined = false) {
  return prisma.workOrder.create({
    data: {
      tenantId: fixture.tenantId,
      branchId: fixture.branchId,
      assetId: fixture.assetId,
      customerId: fixture.customerId,
      status: "DRAFT",
      inspectionDeclined,
    },
  });
}

/** Issues a settled invoice so the delivery gates can pass. */
async function settleInvoice(fixture: Fixture, workOrderId: string) {
  await prisma.invoice.create({
    data: {
      tenantId: fixture.tenantId,
      workOrderId,
      invoiceNumber: `INV-${workOrderId.slice(-8)}`,
      subtotal: 100,
      total: 100,
      paid: 100,
      balance: 0,
      issuedById: "staff-1",
    },
  });
}

async function drive(workOrderId: string, intents: readonly WorkflowIntent[]) {
  const path: string[] = [];
  for (const intent of intents) {
    const result = await lifecycle.apply(workOrderId, intent, ACTOR);
    path.push(result.to);
  }
  return path;
}

const fixtures: Fixture[] = [];

async function cleanup(fixture: Fixture) {
  const where = { tenantId: fixture.tenantId };
  await prisma.operationEvent.deleteMany({ where });
  await prisma.auditLog.deleteMany({ where });
  await prisma.invoice.deleteMany({ where });
  await prisma.workOrder.deleteMany({ where });
  await prisma.asset.deleteMany({ where });
  await prisma.customer.deleteMany({ where });
  await prisma.branch.deleteMany({ where });
  await prisma.tenantCapability.deleteMany({ where });
  await prisma.tenant.deleteMany({ where: { id: fixture.tenantId } });
  await prisma.plan.deleteMany({ where: { id: fixture.planId } });
}

afterAll(async () => {
  for (const fixture of fixtures) await cleanup(fixture);
  await prisma.$disconnect();
}, 120_000);

describe("a work order reaches CLOSED under three different capability profiles", () => {
  it("full service: review, then QC, then invoicing", async () => {
    const fixture = await createWorkshop(`full-${SUFFIX}`, {});
    fixtures.push(fixture);
    const workOrder = await newWorkOrder(fixture);

    const toWork = await drive(workOrder.id, ["REGISTER", "START_INSPECTION", "REQUEST_APPROVAL", "APPROVE", "START_WORK"]);
    expect(toWork).toEqual([
      "REGISTERED",
      "UNDER_INSPECTION",
      "AWAITING_CUSTOMER_APPROVAL",
      "APPROVED_FOR_WORK",
      "IN_PROGRESS",
    ]);

    // Inspection exists, no tasks, no decisions, no blockers -- the finish
    // gates pass on their own merits, not because they were skipped.
    await prisma.inspection.create({
      data: { tenantId: fixture.tenantId, workOrderId: workOrder.id, technicianId: "tech-1", type: "QUICK", fields: {} },
    });

    const rest = await drive(workOrder.id, ["FINISH", "REVIEW_PASSED", "QC_PASSED"]);
    expect(rest).toEqual(["READY_FOR_TEAM_REVIEW", "READY_FOR_QC", "PAYMENT_PENDING"]);

    await settleInvoice(fixture, workOrder.id);
    const end = await drive(workOrder.id, ["SETTLE_PAYMENT", "DELIVER"]);
    expect(end).toEqual(["READY_FOR_DELIVERY", "CLOSED"]);
  }, 120_000);

  it("quick service: no review, no QC -- finish goes straight to invoicing", async () => {
    const fixture = await createWorkshop(`quick-${SUFFIX}`, {
      TEAM_REVIEW: "DISABLED",
      TEAMS: "DISABLED",
      QC: "DISABLED",
      INVENTORY: "DISABLED",
      PART_RETURNS: "DISABLED",
      MULTI_WAREHOUSE: "DISABLED",
    });
    fixtures.push(fixture);

    // The customer declined inspection and asked for one named service.
    const workOrder = await newWorkOrder(fixture, true);

    const path = await drive(workOrder.id, ["REGISTER", "REQUEST_APPROVAL", "APPROVE", "START_WORK", "FINISH"]);

    expect(path).toEqual([
      "REGISTERED",
      "AWAITING_CUSTOMER_APPROVAL",
      "APPROVED_FOR_WORK",
      "IN_PROGRESS",
      "PAYMENT_PENDING", // straight past review and QC
    ]);

    await settleInvoice(fixture, workOrder.id);
    expect(await drive(workOrder.id, ["SETTLE_PAYMENT", "DELIVER"])).toEqual(["READY_FOR_DELIVERY", "CLOSED"]);
  }, 120_000);

  it("external finance: finish goes straight to delivery readiness", async () => {
    const fixture = await createWorkshop(`extfin-${SUFFIX}`, {
      TEAM_REVIEW: "DISABLED",
      TEAMS: "DISABLED",
      QC: "DISABLED",
      FINANCE_CORE: "EXTERNAL",
      BILLING: "EXTERNAL",
    });
    fixtures.push(fixture);
    const workOrder = await newWorkOrder(fixture, true);

    const path = await drive(workOrder.id, ["REGISTER", "REQUEST_APPROVAL", "APPROVE", "START_WORK", "FINISH"]);
    expect(path[path.length - 1]).toBe("READY_FOR_DELIVERY");

    // No internal invoice exists, and none is required -- the invoice and
    // payment gates belong to BILLING and FINANCE_CORE, both external, so
    // they are not evaluated at all.
    expect(await drive(workOrder.id, ["DELIVER"])).toEqual(["CLOSED"]);
  }, 120_000);
});

describe("the lifecycle refuses what the graph does not allow", () => {
  it("refuses a transition that skips the lifecycle", async () => {
    const fixture = await createWorkshop(`refuse-${SUFFIX}`, {});
    fixtures.push(fixture);
    const workOrder = await newWorkOrder(fixture);

    // A brand-new work order cannot be finished.
    await expect(lifecycle.apply(workOrder.id, "FINISH", ACTOR)).rejects.toThrow(/not available/i);

    const unchanged = await prisma.workOrder.findUnique({ where: { id: workOrder.id } });
    expect(unchanged?.status).toBe("DRAFT");
  }, 120_000);

  it("refuses an intent the workshop's capabilities removed", async () => {
    const fixture = await createWorkshop(`noparts-${SUFFIX}`, {
      INVENTORY: "DISABLED",
      PART_RETURNS: "DISABLED",
      MULTI_WAREHOUSE: "DISABLED",
    });
    fixtures.push(fixture);
    const workOrder = await newWorkOrder(fixture, true);
    await drive(workOrder.id, ["REGISTER", "REQUEST_APPROVAL", "APPROVE", "START_WORK"]);

    await expect(lifecycle.apply(workOrder.id, "REQUEST_PART", ACTOR)).rejects.toThrow();
  }, 120_000);
});

describe("gates block, with a message a person can act on", () => {
  it("blocks finish while a task is unfinished", async () => {
    const fixture = await createWorkshop(`gate-${SUFFIX}`, { TEAM_REVIEW: "DISABLED", TEAMS: "DISABLED", QC: "DISABLED" });
    fixtures.push(fixture);
    const workOrder = await newWorkOrder(fixture, true);
    await drive(workOrder.id, ["REGISTER", "REQUEST_APPROVAL", "APPROVE", "START_WORK"]);

    await prisma.task.create({
      data: { tenantId: fixture.tenantId, workOrderId: workOrder.id, title: "Replace pads", status: "IN_PROGRESS" },
    });

    await expect(lifecycle.apply(workOrder.id, "FINISH", ACTOR)).rejects.toThrow(/outstanding/i);

    // And the preview shows the same thing without moving anything.
    const preview = await lifecycle.previewGates(workOrder.id, "FINISH");
    expect(preview?.passed).toBe(false);
    expect(preview?.evaluations.some((e) => e.gate === "approved_work_completed" && !e.satisfied)).toBe(true);

    await prisma.task.updateMany({ where: { workOrderId: workOrder.id }, data: { status: "DONE" } });
    expect((await lifecycle.apply(workOrder.id, "FINISH", ACTOR)).to).toBe("PAYMENT_PENDING");
  }, 120_000);

  it("never evaluates a gate whose capability is inactive", async () => {
    // A workshop with no inventory must never be asked about parts -- that
    // check has no meaning there, and leaving it in place is exactly what
    // would strand every job.
    const fixture = await createWorkshop(`nogate-${SUFFIX}`, {
      INVENTORY: "DISABLED",
      PART_RETURNS: "DISABLED",
      MULTI_WAREHOUSE: "DISABLED",
      TEAM_REVIEW: "DISABLED",
      TEAMS: "DISABLED",
      QC: "DISABLED",
    });
    fixtures.push(fixture);
    const workOrder = await newWorkOrder(fixture, true);
    await drive(workOrder.id, ["REGISTER", "REQUEST_APPROVAL", "APPROVE", "START_WORK"]);

    const preview = await lifecycle.previewGates(workOrder.id, "FINISH");
    const evaluated = preview?.evaluations.map((e) => e.gate) ?? [];

    expect(evaluated).not.toContain("parts.received_used_or_returned");
    expect(evaluated).not.toContain("parts.no_pending_return");
    // Core gates are still evaluated.
    expect(evaluated).toContain("approved_work_completed");
  }, 120_000);
});

describe("every transition emits its domain event", () => {
  it("records a status_changed event with from and to", async () => {
    const fixture = await createWorkshop(`events-${SUFFIX}`, {});
    fixtures.push(fixture);
    const workOrder = await newWorkOrder(fixture);

    await lifecycle.apply(workOrder.id, "REGISTER", ACTOR, { reason: "intake complete" });

    const event = await prisma.operationEvent.findFirst({
      where: { tenantId: fixture.tenantId, eventKey: "work_order.status_changed" },
      orderBy: { createdAt: "desc" },
    });

    expect(event).not.toBeNull();
    expect(event?.payload).toMatchObject({ from: "DRAFT", to: "REGISTERED", intent: "REGISTER" });
  }, 120_000);
});
