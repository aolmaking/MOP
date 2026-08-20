/**
 * The workflow journey against a real database.
 *
 * The pure graph projection is tested in
 * `packages/shared/src/operations/workflow-journey.spec.ts`. What can
 * only be proven here is that the projection is wired to the actual
 * records: that a capability row removes a stage, that a real customer
 * decision changes what the strip says, that inventory state and
 * payment state reach it, and that one tenant's journey can never be
 * read from another's.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { WorkflowJourneyService } from "./workflow-journey.service";
import { JourneyFactsService } from "./journey-facts.service";
import { CapabilityResolutionService } from "../capabilities/capability-resolution.service";
import { PolicyResolutionService } from "../policies/policy-resolution.service";
import { AuditService } from "../audit/audit.service";
import type { PrismaService } from "../database/prisma.service";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;

const capabilities = new CapabilityResolutionService(asService);
const journeys = new WorkflowJourneyService(
  asService,
  capabilities,
  new PolicyResolutionService(asService, new AuditService(asService), capabilities),
  new JourneyFactsService(asService),
);

const SUFFIX = `jrn-${Date.now()}`;
let planId: string;
let full: Shop;
let bare: Shop;

interface Shop {
  tenantId: string;
  branchId: string;
  customerId: string;
  assetId: string;
}

async function makeShop(name: string, disabled: Record<string, string> = {}): Promise<Shop> {
  const tenant = await prisma.tenant.create({
    data: {
      name: `${name} ${SUFFIX}`,
      nameNormalized: `${name.toLowerCase()} ${SUFFIX}`,
      slug: `${name.toLowerCase()}-${SUFFIX}`,
      customerRegistrationCode: `${name.toUpperCase()}-${SUFFIX}`,
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

  for (const [capabilityKey, status] of Object.entries(disabled)) {
    await prisma.tenantCapability.create({
      data: {
        tenantId: tenant.id,
        capabilityKey,
        status: status as never,
        source: "PLATFORM",
        effectiveFrom: new Date(Date.now() - 60_000),
        configuredBy: "seed",
      },
    });
  }

  const branch = await prisma.branch.create({ data: { tenantId: tenant.id, name: "Main", code: "MAIN" } });
  const customer = await prisma.customer.create({
    data: { tenantId: tenant.id, fullName: `${name} Owner`, phone: `01${Math.floor(Math.random() * 100000000)}` },
  });
  const asset = await prisma.asset.create({
    data: {
      tenantId: tenant.id,
      category: "CARS",
      plateNumber: `${name.slice(0, 3)}-${Date.now() % 100000}`,
      currentOwnerCustomerId: customer.id,
    },
  });

  return { tenantId: tenant.id, branchId: branch.id, customerId: customer.id, assetId: asset.id };
}

async function makeJob(shop: Shop, status: string): Promise<string> {
  const workOrder = await prisma.workOrder.create({
    data: {
      tenantId: shop.tenantId,
      branchId: shop.branchId,
      assetId: shop.assetId,
      customerId: shop.customerId,
      status: status as never,
    },
  });
  return workOrder.id;
}

const statuses = (journey: { stages: readonly { status: string }[] }) =>
  journey.stages.map((stage) => stage.status);

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "Journey",
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

  full = await makeShop("Full");
  bare = await makeShop("Bare", { QC: "DISABLED", TEAM_REVIEW: "DISABLED", INVENTORY: "DISABLED" });
}, 240_000);

afterAll(async () => {
  for (const shop of [full, bare]) {
    if (!shop) continue;
    const where = { tenantId: shop.tenantId };
    await prisma.payment.deleteMany({ where });
    await prisma.invoiceLine.deleteMany({ where });
    await prisma.invoice.deleteMany({ where });
    await prisma.customerDecisionItem.deleteMany({ where });
    await prisma.customerDecisionRequest.deleteMany({ where });
    await prisma.issuedItem.deleteMany({ where });
    await prisma.partRequest.deleteMany({ where });
    await prisma.stockMovement.deleteMany({ where });
    await prisma.warehouseStockBalance.deleteMany({ where });
    await prisma.inventoryItem.deleteMany({ where });
    await prisma.warehouse.deleteMany({ where });
    await prisma.taskBlocker.deleteMany({ where });
    await prisma.taskAssignment.deleteMany({ where });
    await prisma.task.deleteMany({ where });
    await prisma.staffUser.deleteMany({ where });
    await prisma.account.deleteMany({ where });
    await prisma.inspection.deleteMany({ where });
    await prisma.fault.deleteMany({ where });
    await prisma.operationEvent.deleteMany({ where });
    await prisma.auditLog.deleteMany({ where });
    await prisma.customerTimelineEvent.deleteMany({ where });
    await prisma.workOrder.deleteMany({ where });
    await prisma.assetOwnershipHistory.deleteMany({ where });
    await prisma.asset.deleteMany({ where });
    await prisma.customer.deleteMany({ where });
    await prisma.branch.deleteMany({ where });
    await prisma.tenantCapability.deleteMany({ where });
    await prisma.tenant.deleteMany({ where: { id: shop.tenantId } });
  }
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 240_000);

describe("capabilities decide which stages exist", () => {
  it("shows QC and team review in a workshop that has them", async () => {
    const job = await makeJob(full, "IN_PROGRESS");
    const journey = await journeys.forWorkOrder(full.tenantId, job, "MANAGER");

    expect(statuses(journey)).toContain("READY_FOR_QC");
    expect(statuses(journey)).toContain("READY_FOR_TEAM_REVIEW");
  });

  it("shows neither in a workshop with both switched off", async () => {
    const job = await makeJob(bare, "IN_PROGRESS");
    const journey = await journeys.forWorkOrder(bare.tenantId, job, "MANAGER");

    expect(statuses(journey)).not.toContain("READY_FOR_QC");
    expect(statuses(journey)).not.toContain("READY_FOR_TEAM_REVIEW");
  });

  it("never offers a parts stage to a workshop with no inventory", async () => {
    const job = await makeJob(bare, "IN_PROGRESS");
    const journey = await journeys.forWorkOrder(bare.tenantId, job, "TECHNICIAN");

    expect(statuses(journey)).not.toContain("WAITING_PARTS");
  });

  it("reacts to a capability being switched off between two reads", async () => {
    const job = await makeJob(full, "IN_PROGRESS");
    expect(statuses(await journeys.forWorkOrder(full.tenantId, job, "MANAGER"))).toContain("READY_FOR_QC");

    const row = await prisma.tenantCapability.create({
      data: {
        tenantId: full.tenantId,
        capabilityKey: "QC",
        status: "DISABLED",
        source: "PLATFORM",
        effectiveFrom: new Date(Date.now() - 60_000),
        configuredBy: "test",
      },
    });

    expect(statuses(await journeys.forWorkOrder(full.tenantId, job, "MANAGER"))).not.toContain("READY_FOR_QC");

    await prisma.tenantCapability.delete({ where: { id: row.id } });
  });
});

describe("optional stages appear only when this job needs them", () => {
  it("does not promise a customer an approval step on a job with no decision", async () => {
    const job = await makeJob(full, "UNDER_INSPECTION");
    const journey = await journeys.forWorkOrder(full.tenantId, job, "CUSTOMER");

    expect(statuses(journey)).not.toContain("AWAITING_CUSTOMER_APPROVAL");
  });

  it("draws the approval step once a decision genuinely exists", async () => {
    const job = await makeJob(full, "UNDER_INSPECTION");
    const request = await prisma.customerDecisionRequest.create({
      data: {
        tenantId: full.tenantId,
        workOrderId: job,
        customerId: full.customerId,
        status: "SENT",
        secureToken: `tok-${Math.random().toString(36).slice(2)}`,
        createdById: "tech-1",
        sentAt: new Date(),
      },
    });
    await prisma.customerDecisionItem.create({
      data: {
        tenantId: full.tenantId,
        decisionRequestId: request.id,
        name: "Brake discs",
        explanation: "Worn.",
        importance: "HIGH",
        price: "1000.00",
        total: "1000.00",
        decision: "PENDING",
      },
    });

    const journey = await journeys.forWorkOrder(full.tenantId, job, "CUSTOMER");
    expect(statuses(journey)).toContain("AWAITING_CUSTOMER_APPROVAL");
  });
});

describe("the journey reads real records, not the status alone", () => {
  it("names the part a job is waiting for, and who owes it", async () => {
    const job = await makeJob(full, "WAITING_PARTS");
    const warehouse = await prisma.warehouse.create({
      data: { tenantId: full.tenantId, name: "Store", code: `ST-${Date.now() % 10000}` },
    });
    const item = await prisma.inventoryItem.create({
      data: {
        tenantId: full.tenantId,
        sku: `ALT-${Date.now() % 100000}`,
        name: "Alternator",
        itemType: "PART",
        sellingPrice: "2200.00",
      },
    });
    await prisma.partRequest.create({
      data: {
        tenantId: full.tenantId,
        workOrderId: job,
        inventoryItemId: item.id,
        requestedById: "tech-1",
        quantity: 1,
        status: "REQUESTED",
      },
    });

    const tech = await journeys.forWorkOrder(full.tenantId, job, "TECHNICIAN");
    expect(tech.headline).toContain("Alternator");
    expect(tech.waitingOn?.who).toBe("the store");

    // Same truth, customer words, and no shop-floor vocabulary.
    const customer = await journeys.forWorkOrder(full.tenantId, job, "CUSTOMER");
    expect(customer.headline).toContain("part");
    expect(customer.headline).not.toContain("store");

    await prisma.partRequest.deleteMany({ where: { workOrderId: job } });
    await prisma.inventoryItem.delete({ where: { id: item.id } });
    await prisma.warehouse.delete({ where: { id: warehouse.id } });
  });

  it("reports the real outstanding balance, never a status-implied one", async () => {
    const job = await makeJob(full, "PAYMENT_PENDING");
    const invoice = await prisma.invoice.create({
      data: {
        tenantId: full.tenantId,
        workOrderId: job,
        invoiceNumber: `INV-${Date.now() % 1000000}`,
        subtotal: "1000.00",
        total: "1000.00",
        paid: "0.00",
        balance: "1000.00",
        issuedById: "cashier-1",
      },
    });
    await prisma.payment.create({
      data: {
        tenantId: full.tenantId,
        invoiceId: invoice.id,
        amount: "400.00",
        method: "CASH",
        idempotencyKey: `pay-${Date.now()}`,
        recordedById: "cashier-1",
      },
    });

    const journey = await journeys.forWorkOrder(full.tenantId, job, "CUSTOMER");
    // 600 outstanding -- derived from the payment row, not the status.
    expect(journey.headline).toContain("600.00");
  });

  it("does not claim a payment stage is settled just because the job moved past it", async () => {
    const job = await makeJob(full, "READY_FOR_DELIVERY");
    const journey = await journeys.forWorkOrder(full.tenantId, job, "MANAGER");
    const payment = journey.stages.find((stage) => stage.status === "PAYMENT_PENDING");

    // No invoice exists, so there is nothing true to say about payment.
    expect(payment?.detail ?? null).toBeNull();
  });

  it("says who is on the job to staff and never to the customer", async () => {
    const job = await makeJob(full, "IN_PROGRESS");
    const account = await prisma.account.create({
      data: { accountType: "TENANT_STAFF", tenantId: full.tenantId, email: `tech-${Date.now()}@journey.local`, status: "ACTIVE" },
    });
    const staff = await prisma.staffUser.create({
      data: { tenantId: full.tenantId, accountId: account.id, fullName: "Hassan Fathy", role: "TECHNICIAN" },
    });
    const task = await prisma.task.create({
      data: { tenantId: full.tenantId, workOrderId: job, title: "Replace pads", status: "IN_PROGRESS" },
    });
    await prisma.taskAssignment.create({
      data: { tenantId: full.tenantId, taskId: task.id, staffUserId: staff.id },
    });

    const manager = await journeys.forWorkOrder(full.tenantId, job, "MANAGER");
    const current = manager.stages.find((stage) => stage.status === "IN_PROGRESS");
    expect(current?.detail).toContain("Hassan Fathy");

    const customer = await journeys.forWorkOrder(full.tenantId, job, "CUSTOMER");
    const theirs = customer.stages.find((stage) => stage.status === "IN_PROGRESS");
    // Staff identity is absent from the response, not hidden client-side.
    expect(JSON.stringify(theirs)).not.toContain("Hassan");
  });

  it("keeps a blocker's shop-floor reason away from the customer", async () => {
    const job = await makeJob(full, "BLOCKED");
    const task = await prisma.task.create({
      data: { tenantId: full.tenantId, workOrderId: job, title: "Fit alternator", status: "BLOCKED" },
    });
    await prisma.taskBlocker.create({
      data: {
        tenantId: full.tenantId,
        taskId: task.id,
        reason: "TOOL_MISSING",
        note: "Torque wrench is out on another bay",
        status: "OPEN",
        reportedBy: "tech-1",
      },
    });

    const tech = await journeys.forWorkOrder(full.tenantId, job, "TECHNICIAN");
    const techStage = tech.stages.find((stage) => stage.status === "BLOCKED");
    expect(techStage?.detail).toContain("Torque wrench");
    expect(tech.blocked).toBe(true);

    const customer = await journeys.forWorkOrder(full.tenantId, job, "CUSTOMER");
    expect(JSON.stringify(customer)).not.toContain("Torque wrench");
    expect(customer.blocked).toBe(true);
  });
});

describe("terminal states are not dressed up as progress", () => {
  it("shows a closed job as finished, with nothing ahead", async () => {
    const job = await makeJob(full, "CLOSED");
    const journey = await journeys.forWorkOrder(full.tenantId, job, "CUSTOMER");

    expect(journey.finished).toBe(true);
    expect(journey.next).toBeNull();
    expect(journey.stages.every((stage) => stage.state === "DONE")).toBe(true);
  });

  it("shows a cancelled job as cancelled rather than continuing the journey", async () => {
    const job = await makeJob(full, "CANCELLED");
    const journey = await journeys.forWorkOrder(full.tenantId, job, "CUSTOMER");

    expect(journey.finished).toBe(true);
    expect(statuses(journey)).toEqual(["CANCELLED"]);
    expect(journey.headline).toContain("cancelled");
  });
});

describe("tenant isolation", () => {
  it("refuses to read one workshop's job from another's tenant id", async () => {
    const job = await makeJob(full, "IN_PROGRESS");

    await expect(journeys.forWorkOrder(bare.tenantId, job, "MANAGER")).rejects.toThrow();
  });
});

describe("a stage the job moved past is not called done if it is not", () => {
  it("keeps an approval stage WAITING while the customer still owes an answer", async () => {
    const job = await makeJob(full, "IN_PROGRESS");
    // The technician asked mid-repair: the work order carried on, the
    // customer still owes an answer. Both facts are true at once.
    await prisma.operationEvent.create({
      data: {
        tenantId: full.tenantId,
        eventKey: "work_order.status_changed",
        actorId: "tech-1",
        actorType: "TENANT_STAFF",
        payload: { workOrderId: job, from: "UNDER_INSPECTION", to: "AWAITING_CUSTOMER_APPROVAL" },
      },
    });
    const request = await prisma.customerDecisionRequest.create({
      data: {
        tenantId: full.tenantId,
        workOrderId: job,
        customerId: full.customerId,
        status: "SENT",
        secureToken: `tok-${Math.random().toString(36).slice(2)}`,
        createdById: "tech-1",
        sentAt: new Date(),
      },
    });
    await prisma.customerDecisionItem.create({
      data: {
        tenantId: full.tenantId,
        decisionRequestId: request.id,
        name: "Cabin filter",
        explanation: "Dirty.",
        importance: "LOW",
        price: "180.00",
        total: "180.00",
        decision: "PENDING",
      },
    });

    const journey = await journeys.forWorkOrder(full.tenantId, job, "CUSTOMER");
    const approval = journey.stages.find((stage) => stage.status === "AWAITING_CUSTOMER_APPROVAL");

    // Not DONE: "Your approval — done" above "1 item still needs your
    // answer" is a lie by juxtaposition even though both halves are true.
    expect(approval?.state).toBe("WAITING");
    expect(journey.headline).toContain("waiting on your answer");
  });

  it("lets it settle to DONE once every item is answered", async () => {
    const job = await makeJob(full, "IN_PROGRESS");
    await prisma.operationEvent.create({
      data: {
        tenantId: full.tenantId,
        eventKey: "work_order.status_changed",
        actorId: "tech-1",
        actorType: "TENANT_STAFF",
        payload: { workOrderId: job, from: "UNDER_INSPECTION", to: "AWAITING_CUSTOMER_APPROVAL" },
      },
    });
    const request = await prisma.customerDecisionRequest.create({
      data: {
        tenantId: full.tenantId,
        workOrderId: job,
        customerId: full.customerId,
        status: "RESOLVED",
        secureToken: `tok-${Math.random().toString(36).slice(2)}`,
        createdById: "tech-1",
        sentAt: new Date(),
        respondedAt: new Date(),
      },
    });
    await prisma.customerDecisionItem.create({
      data: {
        tenantId: full.tenantId,
        decisionRequestId: request.id,
        name: "Cabin filter",
        explanation: "Dirty.",
        importance: "LOW",
        price: "180.00",
        total: "180.00",
        decision: "APPROVED",
        decidedAt: new Date(),
      },
    });

    const journey = await journeys.forWorkOrder(full.tenantId, job, "CUSTOMER");
    expect(journey.stages.find((stage) => stage.status === "AWAITING_CUSTOMER_APPROVAL")?.state).toBe("DONE");
  });
});
