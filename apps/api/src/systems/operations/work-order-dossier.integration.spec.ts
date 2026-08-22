/**
 * The work-order dossier, against a real database.
 *
 * The guarantees worth testing here are the ones a mock would simply
 * agree with: that the dossier composes records from three different
 * systems into one ordered narrative, that it never becomes a way around
 * branch scope, and that cost is absent rather than blanked when the
 * reader may not see it.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { WorkOrderDossierService } from "./work-order-dossier.service";
import { PolicyResolutionService } from "../../control/policies/policy-resolution.service";
import { CapabilityResolutionService } from "../../control/capabilities/capability-resolution.service";
import { AuditService } from "../../audit/audit.service";
import type { PrismaService } from "../../runtime/database/prisma.service";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;
const policiesForTest = new PolicyResolutionService(asService, new AuditService(asService), new CapabilityResolutionService(asService));
const dossier = new WorkOrderDossierService(asService, policiesForTest);

const SUFFIX = `dos-${Date.now()}`;
let tenantId: string;
let planId: string;
let branchA: string;
let branchB: string;
let customerId: string;
let assetId: string;
let workOrderId: string;
let technicianId: string;
let warehouseId: string;
let itemId: string;

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "Dossier Test",
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
      name: `Dossier WS ${SUFFIX}`,
      nameNormalized: `dossier ws ${SUFFIX}`,
      slug: `dossier-ws-${SUFFIX}`,
      customerRegistrationCode: `DOS-${SUFFIX}`,
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

  branchA = (await prisma.branch.create({ data: { tenantId, name: "A", code: `A-${SUFFIX}` } })).id;
  branchB = (await prisma.branch.create({ data: { tenantId, name: "B", code: `B-${SUFFIX}` } })).id;
  customerId = (await prisma.customer.create({ data: { tenantId, fullName: "Dina Fouad", phone: "0100000123" } })).id;
  assetId = (await prisma.asset.create({ data: { tenantId, category: "CARS", plateNumber: `DOS-${SUFFIX}` } })).id;

  const account = await prisma.account.create({
    data: { accountType: "TENANT_STAFF", tenantId, email: `dos-${SUFFIX}@example.com`, status: "ACTIVE" },
  });
  technicianId = (
    await prisma.staffUser.create({
      data: { accountId: account.id, tenantId, fullName: "Dossier Tech", role: "TECHNICIAN" },
    })
  ).id;

  warehouseId = (await prisma.warehouse.create({ data: { tenantId, name: "Store", code: `WH-${SUFFIX}` } })).id;
  itemId = (
    await prisma.inventoryItem.create({
      data: {
        tenantId,
        name: "Brake pad set",
        sku: `PAD-${SUFFIX}`,
        itemType: "PART",
        sellingPrice: 900,
        cost: 540,
        stockTracked: true,
      },
    })
  ).id;

  // A job in branch A, worked and part-consumed.
  workOrderId = (
    await prisma.workOrder.create({
      data: { tenantId, branchId: branchA, assetId, customerId, status: "IN_PROGRESS" },
    })
  ).id;

  const task = await prisma.task.create({
    data: { tenantId, workOrderId, title: "Replace front pads", serviceKey: "Replace front pads", status: "DONE" },
  });
  await prisma.taskAssignment.create({ data: { tenantId, taskId: task.id, staffUserId: technicianId } });

  await prisma.operationEvent.create({
    data: {
      tenantId,
      eventKey: "work_order.status_changed",
      actorId: "seed",
      actorType: "TENANT_STAFF",
      payload: { workOrderId, from: "DRAFT", to: "IN_PROGRESS" },
    },
  });

  await prisma.workOrderPartLine.create({
    data: {
      tenantId,
      workOrderId,
      taskId: task.id,
      provenance: "INVENTORY",
      inventoryItemId: itemId,
      name: "Brake pad set",
      quantity: 1,
      sellingPrice: 900,
      cost: 540,
      addedById: "staff-1",
    },
  });

  await prisma.stockMovement.create({
    data: {
      tenantId,
      inventoryItemId: itemId,
      warehouseId,
      type: "ISSUE",
      quantity: 1,
      beforeQty: 3,
      afterQty: 2,
      referenceType: "WorkOrder",
      referenceId: workOrderId,
      actorId: "staff-1",
    },
  });
}, 120_000);

afterAll(async () => {
  const where = { tenantId };
  await prisma.operationEvent.deleteMany({ where });
  await prisma.auditLog.deleteMany({ where });
  await prisma.payment.deleteMany({ where });
  await prisma.invoiceLine.deleteMany({ where });
  await prisma.invoice.deleteMany({ where });
  await prisma.runningInvoiceLine.deleteMany({ where }).catch(() => undefined);
  await prisma.runningInvoice.deleteMany({ where }).catch(() => undefined);
  await prisma.workOrderPartLine.deleteMany({ where });
  await prisma.stockMovement.deleteMany({ where });
  await prisma.taskAssignment.deleteMany({ where });
  await prisma.task.deleteMany({ where });
  await prisma.workOrder.deleteMany({ where });
  await prisma.asset.deleteMany({ where });
  await prisma.customer.deleteMany({ where });
  await prisma.inventoryItem.deleteMany({ where });
  await prisma.warehouse.deleteMany({ where });
  await prisma.staffUser.deleteMany({ where });
  await prisma.account.deleteMany({ where });
  await prisma.branch.deleteMany({ where });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 120_000);

describe("WorkOrderDossierService", () => {
  it("assembles one job from the three systems that own its records", async () => {
    const d = await dossier.build(tenantId, workOrderId, { canViewCost: true });

    expect(d.customer?.fullName).toBe("Dina Fouad");
    expect(d.asset?.identifier).toBe(`DOS-${SUFFIX}`);
    // Operations
    expect(d.servicesPerformed[0].serviceKey).toBe("Replace front pads");
    expect(d.people[0].fullName).toBe("Dossier Tech");
    // Inventory
    expect(d.parts[0].inventoryItemId).toBe(itemId);
    expect(d.stockMovements[0].beforeQty).toBe(3);
    expect(d.stockMovements[0].afterQty).toBe(2);
  });

  it("orders the timeline by time rather than by table", async () => {
    const d = await dossier.build(tenantId, workOrderId, { canViewCost: true });

    expect(d.timeline.length).toBeGreaterThan(1);
    const times = d.timeline.map((t) => t.at);
    expect([...times].sort()).toEqual(times);
    expect(d.timeline.some((t) => t.kind === "STATUS")).toBe(true);
    expect(d.timeline.some((t) => t.kind === "PART")).toBe(true);
  });

  it("omits cost entirely when the reader may not see it", async () => {
    const withCost = await dossier.build(tenantId, workOrderId, { canViewCost: true });
    const without = await dossier.build(tenantId, workOrderId, { canViewCost: false });

    expect(withCost.parts[0].cost).toBe("540");

    // Absent, not blanked: anyone can open developer tools, and this test
    // previously asserted `toBeNull()` under the name "omits cost
    // entirely" -- pinning the opposite of what it claimed. A null cost
    // is also indistinguishable from "may see cost, none recorded", so
    // the key itself has to be gone.
    expect("cost" in without.parts[0]).toBe(false);
    expect(Object.keys(without.parts[0])).not.toContain("cost");
    expect(JSON.stringify(without.parts[0])).not.toContain("cost");

    // What the customer is charged is not a secret, and must survive.
    expect(without.parts[0].charged).toBe("900");
  });


  it("reports the invoice's own locked lines once a job has been invoiced", async () => {
    // Before invoicing there is nothing to break down.
    const before = await dossier.build(tenantId, workOrderId, { canViewCost: true });
    expect(before.money.invoiceNumber).toBeNull();

    const invoice = await prisma.invoice.create({
      data: {
        tenantId,
        workOrderId,
        invoiceNumber: `DOSSIER-INV-${Date.now()}`,
        subtotal: "900.00",
        total: "900.00",
        paid: "400.00",
        balance: "500.00",
        issuedById: technicianId,
      },
    });
    await prisma.invoiceLine.create({
      data: {
        tenantId,
        invoiceId: invoice.id,
        name: "Replace front brake pads",
        itemType: "SERVICE",
        quantity: 1,
        lockedUnitPrice: "700.00",
        lockedLaborPrice: "200.00",
        total: "900.00",
      },
    });

    const after = await dossier.build(tenantId, workOrderId, { canViewCost: true });

    // The breakdown comes from the invoice, not the running invoice: once
    // issued, the locked lines are the record of what was charged, and a
    // total with nothing behind it fails the one question this band
    // exists to answer.
    expect(after.money.lines).toHaveLength(1);
    expect(after.money.lines[0]!.name).toBe("Replace front brake pads");
    expect(after.money.lines[0]!.total).toBe("900");

    expect(after.money.invoiceTotal).toBe("900");
    expect(after.money.paid).toBe("400");
    expect(after.money.outstanding).toBe("500");

    // No second, competing total beside the invoice's own.
    expect(after.money.runningTotal).toBeNull();

    await prisma.invoiceLine.deleteMany({ where: { invoiceId: invoice.id } });
    await prisma.invoice.delete({ where: { id: invoice.id } });
  });

  it("refuses a job outside the reader's branch scope, indistinguishably from one that does not exist", async () => {
    await expect(
      dossier.build(tenantId, workOrderId, { branchScope: [branchB], canViewCost: true }),
    ).rejects.toThrow(/not available to you/);

    // Same wording for a genuinely absent job, so the error cannot be used
    // to prove a job exists in a branch the reader cannot see.
    await expect(
      dossier.build(tenantId, "does-not-exist", { canViewCost: true }),
    ).rejects.toThrow(/not available to you/);
  });

  it("never reads across tenants", async () => {
    const other = await prisma.tenant.create({
      data: {
        name: `Other ${SUFFIX}`,
        nameNormalized: `other ${SUFFIX}`,
        slug: `other-${SUFFIX}`,
        customerRegistrationCode: `OTH-${SUFFIX}`,
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

    await expect(dossier.build(other.id, workOrderId, { canViewCost: true })).rejects.toThrow();
    await prisma.tenant.delete({ where: { id: other.id } });
  });

  it("links a part line back to the PartRequest it was issued against, in both the parts list and the timeline", async () => {
    const request = await prisma.partRequest.create({
      data: {
        tenantId,
        workOrderId,
        inventoryItemId: itemId,
        requestedById: technicianId,
        quantity: 1,
        status: "ISSUED",
      },
    });

    const requestedLine = await prisma.workOrderPartLine.create({
      data: {
        tenantId,
        workOrderId,
        provenance: "INVENTORY",
        inventoryItemId: itemId,
        name: "Brake pad set (requested)",
        quantity: 1,
        sellingPrice: 900,
        cost: 540,
        addedById: "staff-1",
        partRequestId: request.id,
      },
    });

    const d = await dossier.build(tenantId, workOrderId, { canViewCost: true });

    const requested = d.parts.find((p) => p.name === "Brake pad set (requested)");
    expect(requested?.partRequestId).toBe(request.id);
    // The line seeded in beforeAll has no PartRequest -- absent, not a
    // fabricated placeholder id, so the UI can tell "no request" from
    // "request not loaded".
    const direct = d.parts.find((p) => p.name === "Brake pad set");
    expect(direct?.partRequestId).toBeNull();

    const timelineEntry = d.timeline.find(
      (t) => t.kind === "PART" && t.summary.includes("Brake pad set (requested)"),
    );
    expect(timelineEntry?.summary).toContain("from parts request");
    expect(timelineEntry?.detail.partRequestId).toBe(request.id);

    await prisma.workOrderPartLine.delete({ where: { id: requestedLine.id } });
    await prisma.partRequest.delete({ where: { id: request.id } });
  });

  it("counts prior visits for the vehicle, excluding the job being read", async () => {
    const earlier = await prisma.workOrder.create({
      data: { tenantId, branchId: branchA, assetId, customerId, status: "CLOSED", closedAt: new Date() },
    });

    const d = await dossier.build(tenantId, workOrderId, { canViewCost: true });
    expect(d.priorVisits).toBe(1);

    await prisma.workOrder.delete({ where: { id: earlier.id } });
  });
});

/**
 * POST_CLOSE_ADDENDA, made real: whether a note can be added to a job
 * that has already reached CLOSED.
 */
describe("POST_CLOSE_ADDENDA governs whether a note can be added after close", () => {
  const AUTHOR = { accountId: "bm-1", displayName: "Branch Manager" };

  it("adds a note to an open job with no policy check at all", async () => {
    const note = await dossier.addNote(tenantId, workOrderId, "Customer called about the noise.", AUTHOR);
    expect(note.body).toBe("Customer called about the noise.");
    expect(note.authorName).toBe("Branch Manager");

    const notes = await dossier.notes(tenantId, workOrderId);
    expect(notes.some((n) => n.id === note.id)).toBe(true);
  });

  it("APPEND_ONLY_NOTES (the default): a closed job still accepts a note", async () => {
    const closed = await prisma.workOrder.create({
      data: { tenantId, branchId: branchA, assetId, customerId, status: "CLOSED", closedAt: new Date() },
    });

    const note = await dossier.addNote(tenantId, closed.id, "Customer collected two days late.", AUTHOR);
    expect(note.body).toBe("Customer collected two days late.");

    const stored = await prisma.workOrderNote.findUnique({ where: { id: note.id } });
    expect(stored?.workOrderId).toBe(closed.id);

    await prisma.workOrder.delete({ where: { id: closed.id } });
  });

  it("NOTHING refuses a note on a closed job, and does not touch an open one", async () => {
    const setupActor = { accountId: "test-setup", displayName: "Test setup", actorType: "PLATFORM" as const };
    await policiesForTest.set(tenantId, "POST_CLOSE_ADDENDA", "NOTHING", setupActor, "PLATFORM", "Integration test.");

    const closed = await prisma.workOrder.create({
      data: { tenantId, branchId: branchA, assetId, customerId, status: "CLOSED", closedAt: new Date() },
    });

    await expect(dossier.addNote(tenantId, closed.id, "Too late now.", AUTHOR)).rejects.toMatchObject({
      response: { code: "closed_work_order_sealed" },
    });

    // The open job is unaffected -- the policy is exclusively about CLOSED.
    const stillOpen = await dossier.addNote(tenantId, workOrderId, "Still open, still fine.", AUTHOR);
    expect(stillOpen.body).toBe("Still open, still fine.");

    await policiesForTest.set(
      tenantId,
      "POST_CLOSE_ADDENDA",
      "APPEND_ONLY_NOTES",
      setupActor,
      "PLATFORM",
      "Restored after test.",
    );
    await prisma.workOrder.delete({ where: { id: closed.id } });
  });

  it("notes are read back oldest first, and never appear on another work order", async () => {
    const other = await prisma.workOrder.create({
      data: { tenantId, branchId: branchA, assetId, customerId, status: "IN_PROGRESS" },
    });

    const before = await dossier.notes(tenantId, other.id);
    expect(before).toHaveLength(0);

    await dossier.addNote(tenantId, other.id, "First on the other job.", AUTHOR);
    await dossier.addNote(tenantId, other.id, "Second on the other job.", AUTHOR);

    const otherNotes = await dossier.notes(tenantId, other.id);
    expect(otherNotes.map((n) => n.body)).toEqual(["First on the other job.", "Second on the other job."]);

    // Never leaks onto the shared fixture's own notes.
    const ownNotes = await dossier.notes(tenantId, workOrderId);
    expect(ownNotes.every((n) => !n.body.includes("other job"))).toBe(true);

    await prisma.workOrder.delete({ where: { id: other.id } });
  });
});
