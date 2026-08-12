/**
 * The part request lifecycle, and what the capability profile does to it.
 *
 * Covers SCENARIOS.md 3.1 (normal flow), 3.3 (damaged return), 3.5
 * (partial fulfilment through the real service rather than raw rows), and
 * the two profile cases that matter most: no INVENTORY at all, and
 * INVENTORY without PART_RETURNS.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { PartRequestService } from "./part-request.service";
import { StockService } from "./stock.service";
import { CapabilityResolutionService } from "../capabilities/capability-resolution.service";
import { OperationEventsService } from "../operations/operation-events.service";
import { CustomerSafeProjectionService } from "../operations/customer-safe-projection.service";
import { AuditService } from "../audit/audit.service";
import type { PrismaService } from "../database/prisma.service";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;

const stock = new StockService(asService);
const events = new OperationEventsService(asService, new AuditService(asService), new CustomerSafeProjectionService());
const capabilities = new CapabilityResolutionService(asService);
const parts = new PartRequestService(asService, capabilities, stock, events);

const ACTOR = { accountId: "store-1", displayName: "Storekeeper", actorType: "TENANT_STAFF" as const };
const SUFFIX = `pr-${Date.now()}`;

/** Three workshops with three different shapes. */
let full: Workshop;
let noReturns: Workshop;
let noInventory: Workshop;
let planId: string;

interface Workshop {
  tenantId: string;
  warehouseId: string;
  itemId: string;
  workOrderId: string;
}

async function makeWorkshop(name: string, capabilityOverrides: Record<string, string> = {}): Promise<Workshop> {
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

  for (const [capabilityKey, status] of Object.entries(capabilityOverrides)) {
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
  const warehouse = await prisma.warehouse.create({ data: { tenantId: tenant.id, name: "Store", code: "ST" } });
  const item = await prisma.inventoryItem.create({
    data: { tenantId: tenant.id, sku: `SKU-${name}-${SUFFIX}`, name: "Brake pad", itemType: "PART", sellingPrice: "250.00" },
  });
  const customer = await prisma.customer.create({
    data: { tenantId: tenant.id, fullName: `${name} Customer`, phone: `01${Math.floor(Math.random() * 100000000)}` },
  });
  const asset = await prisma.asset.create({
    data: { tenantId: tenant.id, category: "CARS", plateNumber: `${name.slice(0, 3)}-${Date.now() % 10000}`, currentOwnerCustomerId: customer.id },
  });
  const workOrder = await prisma.workOrder.create({
    data: { tenantId: tenant.id, branchId: branch.id, assetId: asset.id, customerId: customer.id, status: "IN_PROGRESS" },
  });

  await stock.record({
    tenantId: tenant.id,
    inventoryItemId: item.id,
    warehouseId: warehouse.id,
    type: "SUPPLIER_RECEIPT",
    quantity: 20,
    actorId: ACTOR.accountId,
  });

  return { tenantId: tenant.id, warehouseId: warehouse.id, itemId: item.id, workOrderId: workOrder.id };
}

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "Parts",
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

  full = await makeWorkshop("Full");
  noReturns = await makeWorkshop("NoRet", { PART_RETURNS: "DISABLED" });
  noInventory = await makeWorkshop("NoInv", { INVENTORY: "DISABLED" });
}, 240_000);

afterAll(async () => {
  for (const shop of [full, noReturns, noInventory]) {
    if (!shop) continue;
    const where = { tenantId: shop.tenantId };
    await prisma.issuedItem.deleteMany({ where });
    await prisma.partRequest.deleteMany({ where });
    await prisma.stockMovement.deleteMany({ where });
    await prisma.warehouseStockBalance.deleteMany({ where });
    await prisma.operationEvent.deleteMany({ where });
    await prisma.auditLog.deleteMany({ where });
    await prisma.customerTimelineEvent.deleteMany({ where });
    await prisma.workOrder.deleteMany({ where });
    await prisma.assetOwnershipHistory.deleteMany({ where });
    await prisma.asset.deleteMany({ where });
    await prisma.customer.deleteMany({ where });
    await prisma.inventoryItem.deleteMany({ where });
    await prisma.warehouse.deleteMany({ where });
    await prisma.branch.deleteMany({ where });
    await prisma.tenantCapability.deleteMany({ where });
    await prisma.tenant.deleteMany({ where: { id: shop.tenantId } });
  }
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 240_000);

const ask = (shop: Workshop, quantity: number) =>
  parts.request(
    { tenantId: shop.tenantId, workOrderId: shop.workOrderId, inventoryItemId: shop.itemId, quantity },
    ACTOR,
  );

describe("SCENARIOS.md 3.1 — the normal flow", () => {
  it("goes request → approve → issue → arrive → receive → used, moving stock once", async () => {
    const before = (await stock.balanceOf(full.itemId, full.warehouseId)).availableQty;

    const request = await ask(full, 2);
    expect(request.status).toBe("REQUESTED");

    await parts.approve(request.id, ACTOR);
    const fulfilment = await parts.issue({ partRequestId: request.id, warehouseId: full.warehouseId, quantity: 2 }, ACTOR);
    expect(fulfilment).toEqual({ requested: 2, issued: 2, outstanding: 0 });

    await parts.markArrived(request.id, ACTOR);
    await parts.receive(request.id, ACTOR);
    await parts.markUsed(request.id, ACTOR);

    const after = (await stock.balanceOf(full.itemId, full.warehouseId)).availableQty;
    // Exactly one deduction, at issue. Later steps are custody, not stock.
    expect(after).toBe(before - 2);

    const stored = await prisma.partRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(stored.status).toBe("USED");
  });
});

describe("SCENARIOS.md 3.5 — partial fulfilment through the service", () => {
  it("stays un-issued until fully covered, then advances", async () => {
    const request = await ask(full, 3);
    await parts.approve(request.id, ACTOR);

    const afterFirst = await parts.issue(
      { partRequestId: request.id, warehouseId: full.warehouseId, quantity: 2 },
      ACTOR,
    );
    expect(afterFirst).toEqual({ requested: 3, issued: 2, outstanding: 1 });

    // A request half filled has not been filled.
    let stored = await prisma.partRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(stored.status).toBe("APPROVED");

    const afterSecond = await parts.issue(
      { partRequestId: request.id, warehouseId: full.warehouseId, quantity: 1 },
      ACTOR,
    );
    expect(afterSecond).toEqual({ requested: 3, issued: 3, outstanding: 0 });

    stored = await prisma.partRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(stored.status).toBe("ISSUED");
  });

  it("refuses to over-issue rather than trimming silently", async () => {
    // Issuing four against a request for three means somebody miscounted.
    // Trimming to three hides it while the fourth walks out of the store.
    const request = await ask(full, 1);
    await parts.approve(request.id, ACTOR);

    await expect(
      parts.issue({ partRequestId: request.id, warehouseId: full.warehouseId, quantity: 2 }, ACTOR),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("moves stock in the same transaction as the issue", async () => {
    // If the two could split, a store ends up with paperwork saying a part
    // left and a shelf that still has it.
    const request = await ask(full, 1);
    await parts.approve(request.id, ACTOR);

    const before = (await stock.balanceOf(full.itemId, full.warehouseId)).availableQty;
    await parts.issue({ partRequestId: request.id, warehouseId: full.warehouseId, quantity: 1 }, ACTOR);
    const after = (await stock.balanceOf(full.itemId, full.warehouseId)).availableQty;

    expect(after).toBe(before - 1);

    const movement = await prisma.stockMovement.findFirst({
      where: { referenceType: "PartRequest", referenceId: request.id },
    });
    expect(movement).toMatchObject({ type: "ISSUE", quantity: 1 });
  });
});

describe("SCENARIOS.md 3.3 — a part comes back damaged", () => {
  it("puts it in the damaged bucket and never back into sellable stock", async () => {
    const request = await ask(full, 1);
    await parts.approve(request.id, ACTOR);
    await parts.issue({ partRequestId: request.id, warehouseId: full.warehouseId, quantity: 1 }, ACTOR);
    await parts.markArrived(request.id, ACTOR);
    await parts.receive(request.id, ACTOR);
    await parts.requestReturn(request.id, 1, ACTOR, "Arrived cracked");
    await parts.acceptReturn(request.id, ACTOR);

    const before = await stock.balanceOf(full.itemId, full.warehouseId);
    await parts.completeReturn(request.id, full.warehouseId, 1, ACTOR, { damaged: true });
    const after = await stock.balanceOf(full.itemId, full.warehouseId);

    expect(after.damagedQty).toBe(before.damagedQty + 1);
    expect(after.availableQty).toBe(before.availableQty);
  });

  it("puts an undamaged return back into sellable stock", async () => {
    const request = await ask(full, 1);
    await parts.approve(request.id, ACTOR);
    await parts.issue({ partRequestId: request.id, warehouseId: full.warehouseId, quantity: 1 }, ACTOR);
    await parts.markArrived(request.id, ACTOR);
    await parts.receive(request.id, ACTOR);
    await parts.requestReturn(request.id, 1, ACTOR, "Not needed");
    await parts.acceptReturn(request.id, ACTOR);

    const before = await stock.balanceOf(full.itemId, full.warehouseId);
    await parts.completeReturn(request.id, full.warehouseId, 1, ACTOR);
    const after = await stock.balanceOf(full.itemId, full.warehouseId);

    expect(after.availableQty).toBe(before.availableQty + 1);
    expect(after.damagedQty).toBe(before.damagedQty);
  });
});

describe("the capability profile decides, not an if-statement", () => {
  it("a workshop with no INVENTORY never creates a part request at all", async () => {
    // Not created-and-stranded. The entity does not exist there, which is
    // why PART_REQUEST_GRAPH carries `requires` at entity level.
    await expect(ask(noInventory, 1)).rejects.toMatchObject({ status: 403 });

    const count = await prisma.partRequest.count({ where: { tenantId: noInventory.tenantId } });
    expect(count).toBe(0);
  });

  it("a workshop without PART_RETURNS can still issue and use, but cannot return", async () => {
    const request = await ask(noReturns, 1);
    await parts.approve(request.id, ACTOR);
    await parts.issue({ partRequestId: request.id, warehouseId: noReturns.warehouseId, quantity: 1 }, ACTOR);
    await parts.markArrived(request.id, ACTOR);
    await parts.receive(request.id, ACTOR);

    // The return edge does not exist in this profile -- refused by the
    // router, not by a hidden button.
    await expect(parts.requestReturn(request.id, 1, ACTOR)).rejects.toMatchObject({ status: 409 });

    // And the part can still be used, which is the point: removing
    // returns must not strand a part in the technician's hands.
    await parts.markUsed(request.id, ACTOR);
    const stored = await prisma.partRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(stored.status).toBe("USED");
  });

  it("refuses a transition the graph does not allow, with a readable reason", async () => {
    const request = await ask(full, 1);

    // REQUESTED cannot jump straight to USED.
    await expect(parts.markUsed(request.id, ACTOR)).rejects.toMatchObject({
      status: 409,
      response: { code: "transition_not_allowed" },
    });
  });
});

/**
 * Returns/Movements' four actions. The two the previous build was
 * entirely missing -- Reject Return and Request Clarification -- plus
 * the RETURN_PENDING bucket both rely on, and the PartReturnRequest row
 * the queue reads that nothing used to write.
 */
async function receivedRequest(shop: Workshop, quantity: number) {
  const request = await ask(shop, quantity);
  await parts.approve(request.id, ACTOR);
  await parts.issue({ partRequestId: request.id, warehouseId: shop.warehouseId, quantity }, ACTOR);
  await parts.markArrived(request.id, ACTOR);
  await parts.receive(request.id, ACTOR);
  return request;
}

describe("Returns/Movements: requesting a return opens RETURN_PENDING", () => {
  it("moves the quantity out of available and into returnPendingQty, not damaged or issued", async () => {
    const request = await receivedRequest(full, 1);
    const before = await stock.balanceOf(full.itemId, full.warehouseId);

    await parts.requestReturn(request.id, 1, ACTOR, "Wrong size");

    const after = await stock.balanceOf(full.itemId, full.warehouseId);
    expect(after.returnPendingQty).toBe(before.returnPendingQty + 1);
    // Requesting a return does not touch availableQty -- the part has not
    // come back yet, it has only stopped being "with the technician".
    expect(after.availableQty).toBe(before.availableQty);
  });

  it("writes a PartReturnRequest row the queue can read -- previously nothing did", async () => {
    const request = await receivedRequest(full, 1);
    await parts.requestReturn(request.id, 1, ACTOR, "Doesn't fit");

    const row = await prisma.partReturnRequest.findUnique({ where: { partRequestId: request.id } });
    expect(row).toMatchObject({ quantity: 1, reason: "Doesn't fit", resolvedAt: null });

    const queue = await parts.openReturns(full.tenantId);
    expect(queue.map((entry) => entry.partRequestId)).toContain(request.id);
  });

  it("refuses to return more than was issued", async () => {
    const request = await receivedRequest(full, 1);
    await expect(parts.requestReturn(request.id, 2, ACTOR)).rejects.toMatchObject({
      status: 400,
      response: { code: "over_return" },
    });
  });
});

describe("Returns/Movements: Request Clarification", () => {
  it("asks a question without deciding, and it shows up on the queue row", async () => {
    const request = await receivedRequest(full, 1);
    await parts.requestReturn(request.id, 1, ACTOR, "Cracked casing");

    await parts.requestClarification(request.id, ACTOR, "Is this the correct part number?");

    const stored = await prisma.partRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(stored.status).toBe("RETURN_CLARIFICATION_REQUESTED");

    const row = await prisma.partReturnRequest.findUniqueOrThrow({ where: { partRequestId: request.id } });
    expect(row.clarificationQuestion).toBe("Is this the correct part number?");
  });

  it("does not touch stock -- asking a question is not a decision about the part", async () => {
    const request = await receivedRequest(full, 1);
    await parts.requestReturn(request.id, 1, ACTOR, "Cracked casing");
    const before = await stock.balanceOf(full.itemId, full.warehouseId);

    await parts.requestClarification(request.id, ACTOR, "Which SKU is this?");

    const after = await stock.balanceOf(full.itemId, full.warehouseId);
    expect(after).toEqual(before);
  });

  it("the technician's reply loops back to RETURN_REQUESTED and clears the question", async () => {
    const request = await receivedRequest(full, 1);
    await parts.requestReturn(request.id, 1, ACTOR, "Cracked casing");
    await parts.requestClarification(request.id, ACTOR, "Which SKU is this?");

    await parts.respondToClarification(request.id, ACTOR, "BRK-4471, confirmed against the box");

    const stored = await prisma.partRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(stored.status).toBe("RETURN_REQUESTED");

    const row = await prisma.partReturnRequest.findUniqueOrThrow({ where: { partRequestId: request.id } });
    expect(row.clarificationQuestion).toBeNull();
    expect(row.reason).toBe("BRK-4471, confirmed against the box");
  });

  it("can repeat: clarify, reply, clarify again", async () => {
    const request = await receivedRequest(full, 1);
    await parts.requestReturn(request.id, 1, ACTOR, "Cracked casing");

    await parts.requestClarification(request.id, ACTOR, "First question");
    await parts.respondToClarification(request.id, ACTOR, "First answer");
    await parts.requestClarification(request.id, ACTOR, "Second question");

    const stored = await prisma.partRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(stored.status).toBe("RETURN_CLARIFICATION_REQUESTED");

    const row = await prisma.partReturnRequest.findUniqueOrThrow({ where: { partRequestId: request.id } });
    expect(row.clarificationQuestion).toBe("Second question");
  });
});

describe("Returns/Movements: Reject Return", () => {
  it("moves to RETURN_REJECTED, not the top-level REJECTED -- the part already left the shelf", async () => {
    const request = await receivedRequest(full, 1);
    await parts.requestReturn(request.id, 1, ACTOR, "Doesn't fit");

    await parts.rejectReturn(request.id, ACTOR, "Shows clear signs of use");

    const stored = await prisma.partRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(stored.status).toBe("RETURN_REJECTED");
  });

  it("does not silently drop the part from tracking -- it must be resolved", async () => {
    const request = await receivedRequest(full, 1);
    await parts.requestReturn(request.id, 1, ACTOR);
    await parts.rejectReturn(request.id, ACTOR, "Used, not defective");

    // The exact resolution the spec names: mark it Used after all.
    await parts.resolveRejectedReturn(request.id, ACTOR);

    const stored = await prisma.partRequest.findUniqueOrThrow({ where: { id: request.id } });
    expect(stored.status).toBe("USED");
  });

  it("marks the PartReturnRequest resolved, so it drops off the open queue", async () => {
    const request = await receivedRequest(full, 1);
    await parts.requestReturn(request.id, 1, ACTOR);
    await parts.rejectReturn(request.id, ACTOR, "Used, not defective");

    const queue = await parts.openReturns(full.tenantId);
    expect(queue.map((entry) => entry.partRequestId)).not.toContain(request.id);
  });
});

/**
 * Code-review regression: completeReturn() used to reverse RETURN_PENDING
 * against whatever warehouseId the caller passed for "where the part
 * lands on the shelf," which is a legitimate choice that can differ from
 * where requestReturn() actually opened the pending balance. The two
 * must never be conflated -- fixed by reading the warehouse back from
 * PartReturnRequest instead of trusting the caller.
 */
describe("Returns/Movements: accepting into a different warehouse than it was issued from", () => {
  beforeAll(async () => {
    // Topped up separately from the shared fixture's original 20 units --
    // this file's tests draw from the same balance throughout, and these
    // two tests must not be starved by whatever earlier tests consumed.
    await stock.record({
      tenantId: full.tenantId,
      inventoryItemId: full.itemId,
      warehouseId: full.warehouseId,
      type: "SUPPLIER_RECEIPT",
      quantity: 10,
      actorId: ACTOR.accountId,
    });
  });

  it("reverses RETURN_PENDING against the ORIGINAL warehouse, not the one chosen at accept time", async () => {
    const otherWarehouseId = (
      await prisma.warehouse.create({ data: { tenantId: full.tenantId, name: "Annexe", code: `AX-${SUFFIX}` } })
    ).id;

    const request = await receivedRequest(full, 1);
    await parts.requestReturn(request.id, 1, ACTOR); // opens RETURN_PENDING against full.warehouseId

    const originalBefore = await stock.balanceOf(full.itemId, full.warehouseId);
    const otherBefore = await stock.balanceOf(full.itemId, otherWarehouseId);
    expect(originalBefore.returnPendingQty).toBeGreaterThan(0);
    expect(otherBefore.returnPendingQty).toBe(0);

    await parts.acceptReturn(request.id, ACTOR);
    // The manager is physically standing at the annexe and accepts the
    // part back there -- a legitimate, different warehouse.
    await parts.completeReturn(request.id, otherWarehouseId, 1, ACTOR);

    const originalAfter = await stock.balanceOf(full.itemId, full.warehouseId);
    const otherAfter = await stock.balanceOf(full.itemId, otherWarehouseId);

    // The pending balance clears on the warehouse it was actually opened
    // against -- a delta, since other tests in this file share the same
    // balance throughout and may have left their own pending quantity on
    // the books. The annexe, brand new, must stay untouched at zero.
    expect(originalAfter.returnPendingQty).toBe(originalBefore.returnPendingQty - 1);
    expect(otherAfter.returnPendingQty).toBe(0);
    // The part becomes sellable stock in the warehouse it was physically
    // accepted into.
    expect(otherAfter.availableQty).toBe(otherBefore.availableQty + 1);
    expect(originalAfter.availableQty).toBe(originalBefore.availableQty);
  });

  it("resolving a rejected return also clears RETURN_PENDING on the original warehouse", async () => {
    const request = await receivedRequest(full, 1);
    await parts.requestReturn(request.id, 1, ACTOR);
    await parts.rejectReturn(request.id, ACTOR, "Used, not defective");

    const pending = await stock.balanceOf(full.itemId, full.warehouseId);
    expect(pending.returnPendingQty).toBeGreaterThan(0);

    await parts.resolveRejectedReturn(request.id, ACTOR);

    const after = await stock.balanceOf(full.itemId, full.warehouseId);
    expect(after.returnPendingQty).toBe(pending.returnPendingQty - 1);
  });
});

describe("Returns/Movements: Accept Return to Stock reverses RETURN_PENDING", () => {
  it("the pending quantity returns to zero and availableQty gains it, in one transaction", async () => {
    const request = await receivedRequest(full, 1);
    await parts.requestReturn(request.id, 1, ACTOR);
    const pending = await stock.balanceOf(full.itemId, full.warehouseId);
    expect(pending.returnPendingQty).toBeGreaterThan(0);

    await parts.acceptReturn(request.id, ACTOR);
    await parts.completeReturn(request.id, full.warehouseId, 1, ACTOR);

    const after = await stock.balanceOf(full.itemId, full.warehouseId);
    expect(after.returnPendingQty).toBe(pending.returnPendingQty - 1);
    expect(after.availableQty).toBe(pending.availableQty + 1);
  });

  it("accepting as damaged reverses the same pending quantity but credits damagedQty instead", async () => {
    const request = await receivedRequest(full, 1);
    await parts.requestReturn(request.id, 1, ACTOR);
    const pending = await stock.balanceOf(full.itemId, full.warehouseId);

    await parts.acceptReturn(request.id, ACTOR);
    await parts.completeReturn(request.id, full.warehouseId, 1, ACTOR, { damaged: true });

    const after = await stock.balanceOf(full.itemId, full.warehouseId);
    expect(after.returnPendingQty).toBe(pending.returnPendingQty - 1);
    expect(after.damagedQty).toBe(pending.damagedQty + 1);
    expect(after.availableQty).toBe(pending.availableQty);
  });

  it("removes the request from the open-returns queue once resolved", async () => {
    const request = await receivedRequest(full, 1);
    await parts.requestReturn(request.id, 1, ACTOR);
    await parts.acceptReturn(request.id, ACTOR);
    await parts.completeReturn(request.id, full.warehouseId, 1, ACTOR);

    const queue = await parts.openReturns(full.tenantId);
    expect(queue.map((entry) => entry.partRequestId)).not.toContain(request.id);
  });
});
