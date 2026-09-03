/**
 * The live journey's event projection, against a real database.
 *
 * What can only be proven here is that the chronology is REAL: that
 * every event is dated by the record that proves it, that two jobs in
 * one workshop never bleed into each other's history, that the order is
 * stable between reads, and that a customer's copy is missing the
 * internal events rather than merely styling them differently.
 *
 * These are the guarantees a timeline is worthless without. A strip that
 * shows the right shape but attributes another car's part hand-over to
 * this one is worse than no strip, because somebody will act on it.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { JourneyEventsService } from "./journey-events.service";
import { WorkflowJourneyService } from "./workflow-journey.service";
import { JourneyFactsService } from "./journey-facts.service";
import { WorkOrderLifecycleService } from "./work-order-lifecycle.service";
import { GateEvaluatorService } from "./gate-evaluator.service";
import { OperationEventsService } from "./operation-events.service";
import { CustomerSafeProjectionService } from "./customer-safe-projection.service";
import { CapabilityResolutionService } from "../../control/capabilities/capability-resolution.service";
import { PolicyResolutionService } from "../../control/policies/policy-resolution.service";
import { AuditService } from "../../audit/audit.service";
import type { PrismaService } from "../../runtime/database/prisma.service";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;

const capabilities = new CapabilityResolutionService(asService);
const audit = new AuditService(asService);
const policies = new PolicyResolutionService(asService, audit, capabilities);
const events = new JourneyEventsService(asService);
const journeys = new WorkflowJourneyService(
  asService,
  capabilities,
  policies,
  new JourneyFactsService(asService),
  events,
  new WorkOrderLifecycleService(
    asService,
    capabilities,
    new OperationEventsService(asService, audit, new CustomerSafeProjectionService()),
    new GateEvaluatorService(asService, policies),
    policies,
  ),
);

const SUFFIX = `jev-${Date.now()}`;

interface Shop {
  tenantId: string;
  branchId: string;
  customerId: string;
  assetId: string;
  warehouseId: string;
  itemId: string;
  accountId: string;
  staffUserId: string;
  staffName: string;
}

let planId: string;
let shop: Shop;
let other: Shop;

/** A fixed clock, so "in order" is a fact about the data and not a race. */
const T = (minutes: number): Date => new Date(Date.UTC(2026, 0, 5, 8, 0, 0) + minutes * 60_000);

async function makeShop(name: string): Promise<Shop> {
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

  const branch = await prisma.branch.create({ data: { tenantId: tenant.id, name: "Main", code: "MAIN" } });
  const warehouse = await prisma.warehouse.create({
    data: { tenantId: tenant.id, name: `${name} Store`, code: `WH-${name.slice(0, 3).toUpperCase()}` },
  });
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
  const item = await prisma.inventoryItem.create({
    data: {
      tenantId: tenant.id,
      sku: `SKU-${name}-${SUFFIX}`,
      name: "Brake pad set",
      itemType: "PART",
      sellingPrice: "250.00",
    },
  });
  const account = await prisma.account.create({
    data: {
      email: `tech-${name.toLowerCase()}-${SUFFIX}@example.test`,
      passwordHash: "x",
      accountType: "TENANT_STAFF",
      status: "ACTIVE",
      tenantId: tenant.id,
    },
  });
  const staffName = `Ahmed ${name}`;
  const staff = await prisma.staffUser.create({
    data: { tenantId: tenant.id, accountId: account.id, fullName: staffName, role: "TECHNICIAN" },
  });

  return {
    tenantId: tenant.id,
    branchId: branch.id,
    customerId: customer.id,
    assetId: asset.id,
    warehouseId: warehouse.id,
    itemId: item.id,
    accountId: account.id,
    staffUserId: staff.id,
    staffName,
  };
}

async function makeJob(where: Shop, status: string): Promise<string> {
  const workOrder = await prisma.workOrder.create({
    data: {
      tenantId: where.tenantId,
      branchId: where.branchId,
      assetId: where.assetId,
      customerId: where.customerId,
      status: status as never,
    },
  });
  return workOrder.id;
}

/** A real `work_order.status_changed` row, dated. */
async function enteredStatus(where: Shop, workOrderId: string, to: string, at: Date): Promise<void> {
  await prisma.operationEvent.create({
    data: {
      tenantId: where.tenantId,
      eventKey: "work_order.status_changed",
      payload: { workOrderId, to },
      actorId: where.accountId,
      actorType: "TENANT_STAFF",
      createdAt: at,
    },
  });
}

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "Journey events",
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
  shop = await makeShop("Apex");
  other = await makeShop("Rival");
}, 240_000);

afterAll(async () => {
  for (const where of [shop, other]) {
    if (!where) continue;
    const scope = { tenantId: where.tenantId };
    await prisma.payment.deleteMany({ where: scope });
    await prisma.invoiceLine.deleteMany({ where: scope });
    await prisma.invoice.deleteMany({ where: scope });
    await prisma.customerDecisionItem.deleteMany({ where: scope });
    await prisma.customerDecisionRequest.deleteMany({ where: scope });
    await prisma.partReturnRequest.deleteMany({ where: scope });
    await prisma.issuedItem.deleteMany({ where: scope });
    await prisma.workOrderPartLine.deleteMany({ where: scope });
    await prisma.partRequest.deleteMany({ where: scope });
    await prisma.stockMovement.deleteMany({ where: scope });
    await prisma.warehouseStockBalance.deleteMany({ where: scope });
    await prisma.inventoryItem.deleteMany({ where: scope });
    await prisma.warehouse.deleteMany({ where: scope });
    await prisma.taskBlocker.deleteMany({ where: scope });
    await prisma.taskAssignment.deleteMany({ where: scope });
    await prisma.task.deleteMany({ where: scope });
    await prisma.inspection.deleteMany({ where: scope });
    await prisma.fault.deleteMany({ where: scope });
    await prisma.operationEvent.deleteMany({ where: scope });
    await prisma.auditLog.deleteMany({ where: scope });
    await prisma.customerTimelineEvent.deleteMany({ where: scope });
    await prisma.workOrder.deleteMany({ where: scope });
    await prisma.assetOwnershipHistory.deleteMany({ where: scope });
    await prisma.asset.deleteMany({ where: scope });
    await prisma.customer.deleteMany({ where: scope });
    await prisma.staffUser.deleteMany({ where: scope });
    await prisma.account.deleteMany({ where: scope });
    await prisma.branch.deleteMany({ where: scope });
    await prisma.tenant.deleteMany({ where: { id: where.tenantId } });
  }
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 240_000);

describe("every event is dated by the record that proves it", () => {
  it("walks the whole parts loop from the real hand-over timestamps", async () => {
    const job = await makeJob(shop, "WAITING_PARTS");
    const request = await prisma.partRequest.create({
      data: {
        tenantId: shop.tenantId,
        workOrderId: job,
        inventoryItemId: shop.itemId,
        requestedById: shop.accountId,
        approvedById: shop.accountId,
        approvedAt: T(10),
        quantity: 2,
        status: "USED",
        createdAt: T(5),
      },
    });
    await prisma.issuedItem.create({
      data: {
        tenantId: shop.tenantId,
        partRequestId: request.id,
        warehouseId: shop.warehouseId,
        quantity: 2,
        issuedById: shop.accountId,
        issuedAt: T(20),
        arrivedAt: T(25),
        receivedAt: T(30),
        usedAt: T(40),
      },
    });

    const timeline = await events.forWorkOrder(shop.tenantId, job, "TECHNICIAN");
    const kinds = timeline.map((event) => event.kind);

    expect(kinds).toEqual([
      "part.requested",
      "part.approved",
      "part.issued",
      "part.arrived",
      "part.received",
      "part.used",
    ]);
    // The exact timestamps, not merely "some timestamp": a projection
    // that dated events by when it RAN would still pass an ordering
    // check while being entirely fictional.
    expect(timeline.map((event) => event.at)).toEqual([
      T(5).toISOString(),
      T(10).toISOString(),
      T(20).toISOString(),
      T(25).toISOString(),
      T(30).toISOString(),
      T(40).toISOString(),
    ]);
    expect(timeline[0].actor).toBe(shop.staffName);
  });

  it("invents nothing for a job whose status merely implies a part", async () => {
    // WAITING_PARTS with NO PartRequest row. A projection that read the
    // status and wrote "part requested" would be fabricating the one
    // event a technician would act on.
    const job = await makeJob(shop, "WAITING_PARTS");
    await enteredStatus(shop, job, "WAITING_PARTS", T(3));

    const timeline = await events.forWorkOrder(shop.tenantId, job, "TECHNICIAN");

    expect(timeline.map((event) => event.kind)).toEqual(["work_order.status_changed"]);
  });

  it("does not record a payment that was never confirmed", async () => {
    const job = await makeJob(shop, "PAYMENT_PENDING");
    const invoice = await prisma.invoice.create({
      data: {
        tenantId: shop.tenantId,
        workOrderId: job,
        invoiceNumber: `INV-${SUFFIX}-1`,
        subtotal: "500.00",
        total: "500.00",
        balance: "500.00",
        issuedById: shop.accountId,
        issuedAt: T(60),
      },
    });
    await prisma.payment.create({
      data: {
        tenantId: shop.tenantId,
        invoiceId: invoice.id,
        amount: "500.00",
        method: "CARD",
        status: "FAILED",
        idempotencyKey: `pay-${SUFFIX}-failed`,
        recordedById: shop.accountId,
        createdAt: T(65),
      },
    });

    const timeline = await events.forWorkOrder(shop.tenantId, job, "MANAGER");

    expect(timeline.map((event) => event.kind)).toContain("invoice.issued");
    expect(timeline.map((event) => event.kind)).not.toContain("payment.recorded");
  });
});

describe("one journey per work order", () => {
  it("keeps three concurrent jobs' events entirely apart", async () => {
    const [a, b, c] = await Promise.all([
      makeJob(shop, "WAITING_PARTS"),
      makeJob(shop, "IN_PROGRESS"),
      makeJob(shop, "PAYMENT_PENDING"),
    ]);

    // A: a part on order. B: a task and a blocker. C: an invoice.
    await prisma.partRequest.create({
      data: {
        tenantId: shop.tenantId,
        workOrderId: a,
        inventoryItemId: shop.itemId,
        requestedById: shop.accountId,
        quantity: 1,
        status: "REQUESTED",
        createdAt: T(100),
      },
    });
    const task = await prisma.task.create({
      data: { tenantId: shop.tenantId, workOrderId: b, title: "Replace pads", createdAt: T(101) },
    });
    await prisma.taskBlocker.create({
      data: {
        tenantId: shop.tenantId,
        taskId: task.id,
        reason: "TOOL_MISSING",
        note: "torque wrench on loan",
        reportedBy: shop.accountId,
        createdAt: T(102),
      },
    });
    await prisma.invoice.create({
      data: {
        tenantId: shop.tenantId,
        workOrderId: c,
        invoiceNumber: `INV-${SUFFIX}-2`,
        subtotal: "300.00",
        total: "300.00",
        balance: "300.00",
        issuedById: shop.accountId,
        issuedAt: T(103),
      },
    });

    const [ea, eb, ec] = await Promise.all([
      events.forWorkOrder(shop.tenantId, a, "MANAGER"),
      events.forWorkOrder(shop.tenantId, b, "MANAGER"),
      events.forWorkOrder(shop.tenantId, c, "MANAGER"),
    ]);

    expect(ea.map((event) => event.kind)).toEqual(["part.requested"]);
    expect(eb.map((event) => event.kind)).toEqual(["task.created"]);
    expect(ec.map((event) => event.kind)).toEqual(["invoice.issued"]);
  });

  it("cannot be read across tenants even with a correct work order id", async () => {
    const job = await makeJob(shop, "IN_PROGRESS");
    await prisma.task.create({
      data: { tenantId: shop.tenantId, workOrderId: job, title: "Not yours", createdAt: T(110) },
    });

    // The id is real. The tenant is not. Nothing comes back, and the
    // journey above it answers not-found rather than forbidden.
    expect(await events.forWorkOrder(other.tenantId, job, "MANAGER")).toEqual([]);
    await expect(journeys.forWorkOrder(other.tenantId, job, "MANAGER")).rejects.toThrow();
  });
});

describe("chronology", () => {
  it("returns the same order on every read, including at equal timestamps", async () => {
    const job = await makeJob(shop, "UNDER_INSPECTION");
    // Two events sharing an instant, which a real transaction produces:
    // the causal rank has to decide, or the order is the planner's whim.
    await enteredStatus(shop, job, "UNDER_INSPECTION", T(200));
    // The Inspection ROW, not the `inspection.saved` event: the record
    // carries the moment the inspection happened, and the event row is
    // written milliseconds later in the same transaction.
    await prisma.inspection.create({
      data: {
        tenantId: shop.tenantId,
        workOrderId: job,
        technicianId: shop.staffUserId,
        type: "FULL",
        fields: {},
        createdAt: T(200),
      },
    });

    const first = await events.forWorkOrder(shop.tenantId, job, "MANAGER");
    const second = await events.forWorkOrder(shop.tenantId, job, "MANAGER");

    expect(first.map((event) => event.kind)).toEqual(second.map((event) => event.kind));
    // The inspection CAUSED nothing here, but a status change is always
    // the consequence in a shared instant, so it sorts last.
    expect(first.map((event) => event.kind)).toEqual(["inspection.recorded", "work_order.status_changed"]);
  });

  it("dates the current stage from the LAST entry into it, not the first", async () => {
    const job = await makeJob(shop, "READY_FOR_QC");
    await enteredStatus(shop, job, "READY_FOR_QC", T(300));
    await enteredStatus(shop, job, "QC_FAILED", T(310));
    await enteredStatus(shop, job, "IN_PROGRESS", T(320));
    await enteredStatus(shop, job, "READY_FOR_QC", T(400));

    const journey = await journeys.forWorkOrder(shop.tenantId, job, "MANAGER");

    // A job that failed QC and came back has been here twice. "How long
    // has this been waiting for QC" means since it got here THIS time.
    expect(journey.current.since).toBe(T(400).toISOString());
    expect(journey.current.status).toBe("READY_FOR_QC");
    expect(journey.current.forMinutes).toBeGreaterThan(0);
  });
});

describe("the customer's copy is missing the internal events, not restyled", () => {
  it("drops the store's paperwork and never names staff", async () => {
    const job = await makeJob(shop, "IN_PROGRESS");
    const request = await prisma.partRequest.create({
      data: {
        tenantId: shop.tenantId,
        workOrderId: job,
        inventoryItemId: shop.itemId,
        requestedById: shop.accountId,
        approvedById: shop.accountId,
        approvedAt: T(501),
        quantity: 1,
        status: "USED",
        createdAt: T(500),
      },
    });
    const issued = await prisma.issuedItem.create({
      data: {
        tenantId: shop.tenantId,
        partRequestId: request.id,
        warehouseId: shop.warehouseId,
        quantity: 1,
        issuedById: shop.accountId,
        issuedAt: T(502),
        receivedAt: T(503),
        usedAt: T(504),
      },
    });
    const task = await prisma.task.create({
      data: { tenantId: shop.tenantId, workOrderId: job, title: "Internal task name", createdAt: T(505) },
    });
    await prisma.taskBlocker.create({
      data: {
        tenantId: shop.tenantId,
        taskId: task.id,
        reason: "TOOL_MISSING",
        note: "torque wrench on loan to bay 3",
        reportedBy: shop.accountId,
        createdAt: T(506),
      },
    });
    expect(issued.id).toBeTruthy();

    const staff = await events.forWorkOrder(shop.tenantId, job, "TECHNICIAN");
    const customer = await events.forWorkOrder(shop.tenantId, job, "CUSTOMER");

    const staffKinds = staff.map((event) => event.kind);
    const customerKinds = customer.map((event) => event.kind);

    // The store's own paperwork -- approval, the hand-over, the
    // technician taking possession, the task list -- is ABSENT, not
    // reworded. Absent is the only version that cannot leak.
    expect(staffKinds).toContain("part.approved");
    expect(staffKinds).toContain("part.issued");
    expect(staffKinds).toContain("part.received");
    expect(staffKinds).toContain("task.created");
    expect(customerKinds).not.toContain("part.approved");
    expect(customerKinds).not.toContain("part.issued");
    expect(customerKinds).not.toContain("part.received");
    expect(customerKinds).not.toContain("task.created");

    // What DOES reach them is true and theirs: a part was ordered and
    // fitted to their car.
    expect(customerKinds).toContain("part.requested");
    expect(customerKinds).toContain("part.used");

    // Never a name, never the warehouse, never the shop-floor reason.
    const customerText = customer.map((event) => `${event.message} ${event.detail ?? ""} ${event.actor ?? ""}`).join(" | ");
    expect(customerText).not.toContain(shop.staffName);
    expect(customerText).not.toContain("Store");
    expect(customerText).not.toContain("torque wrench");
    expect(customer.every((event) => event.actor === null)).toBe(true);
  });
});
