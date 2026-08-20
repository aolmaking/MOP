/**
 * Phase 7 exit criteria, as one walkthrough.
 *
 * The other inventory specs prove each piece. This proves the two things
 * only a whole-system test can:
 *
 *   1. The stored balance still equals its replayed ledger AFTER a real
 *      day of work -- issues, partial issues, returns and a damaged
 *      write-off, not a hand-built sequence designed to balance.
 *
 *   2. SCENARIOS.md 3.6 -- a technician finishing with a received part
 *      neither used nor returned is blocked, AND is not blocked when the
 *      workshop has no inventory, because the gate does not exist there.
 *      That is the exact case the capability engine exists to get right.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { StockService } from "./stock.service";
import { PartRequestService } from "./part-request.service";
import { PolicyResolutionService } from "../policies/policy-resolution.service";
import { InventoryViewService } from "./inventory-view.service";
import { CapabilityResolutionService } from "../capabilities/capability-resolution.service";
import { OperationEventsService } from "../operations/operation-events.service";
import { CustomerSafeProjectionService } from "../operations/customer-safe-projection.service";
import { GateEvaluatorService } from "../operations/gate-evaluator.service";
import { AuditService } from "../audit/audit.service";
import type { PrismaService } from "../database/prisma.service";

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

const stock = new StockService(asService);
const capabilities = new CapabilityResolutionService(asService);
const events = new OperationEventsService(asService, new AuditService(asService), new CustomerSafeProjectionService());
const parts = new PartRequestService(
  asService,
  capabilities,
  stock,
  events,
  new PolicyResolutionService(asService, new AuditService(asService), capabilities),
);
const view = new InventoryViewService(asService, parts);
const gates = new GateEvaluatorService(asService, policiesForTest);

const ACTOR = { accountId: "store-1", displayName: "Storekeeper", actorType: "TENANT_STAFF" as const };
const SUFFIX = `walk7-${Date.now()}`;

interface Shop {
  tenantId: string;
  warehouseId: string;
  itemId: string;
  workOrderId: string;
}

let planId: string;
let shop: Shop;
let bare: Shop;

async function makeShop(name: string, overrides: Record<string, string> = {}): Promise<Shop> {
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

  for (const [capabilityKey, status] of Object.entries(overrides)) {
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
    data: {
      tenantId: tenant.id,
      sku: `SKU-${name}-${SUFFIX}`,
      name: "Brake pad",
      itemType: "PART",
      sellingPrice: "250.00",
      lowStockThreshold: 5,
      criticalStockThreshold: 2,
    },
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
  const workOrder = await prisma.workOrder.create({
    data: { tenantId: tenant.id, branchId: branch.id, assetId: asset.id, customerId: customer.id, status: "IN_PROGRESS" },
  });

  return { tenantId: tenant.id, warehouseId: warehouse.id, itemId: item.id, workOrderId: workOrder.id };
}

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "Walk7",
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

  shop = await makeShop("Stocked");
  bare = await makeShop("Bare", { INVENTORY: "DISABLED" });

  await stock.record({
    tenantId: shop.tenantId,
    inventoryItemId: shop.itemId,
    warehouseId: shop.warehouseId,
    type: "SUPPLIER_RECEIPT",
    quantity: 12,
    actorId: ACTOR.accountId,
  });
}, 240_000);

afterAll(async () => {
  for (const each of [shop, bare]) {
    if (!each) continue;
    const where = { tenantId: each.tenantId };
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
    await prisma.tenant.deleteMany({ where: { id: each.tenantId } });
  }
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 240_000);

const ask = (quantity: number) =>
  parts.request(
    { tenantId: shop.tenantId, workOrderId: shop.workOrderId, inventoryItemId: shop.itemId, quantity },
    ACTOR,
  );

describe("a day in the store", () => {
  it("runs a full day of movements without anyone balancing the books", async () => {
    // Deliberately messy: a clean issue, a partial one finished later, a
    // good return and a damaged write-off. Nothing here is arranged to
    // come out even.
    const first = await ask(2);
    await parts.approve(first.id, ACTOR);
    await parts.issue({ partRequestId: first.id, warehouseId: shop.warehouseId, quantity: 2 }, ACTOR);

    const second = await ask(3);
    await parts.approve(second.id, ACTOR);
    await parts.issue({ partRequestId: second.id, warehouseId: shop.warehouseId, quantity: 2 }, ACTOR);
    await parts.issue({ partRequestId: second.id, warehouseId: shop.warehouseId, quantity: 1 }, ACTOR);

    const third = await ask(1);
    await parts.approve(third.id, ACTOR);
    await parts.issue({ partRequestId: third.id, warehouseId: shop.warehouseId, quantity: 1 }, ACTOR);
    await parts.markArrived(third.id, ACTOR);
    await parts.receive(third.id, ACTOR);
    await parts.requestReturn(third.id, 1, ACTOR, "Wrong size");
    await parts.acceptReturn(third.id, ACTOR);
    await parts.completeReturn(third.id, shop.warehouseId, 1, ACTOR);

    const fourth = await ask(1);
    await parts.approve(fourth.id, ACTOR);
    await parts.issue({ partRequestId: fourth.id, warehouseId: shop.warehouseId, quantity: 1 }, ACTOR);
    await parts.markArrived(fourth.id, ACTOR);
    await parts.receive(fourth.id, ACTOR);
    await parts.requestReturn(fourth.id, 1, ACTOR, "Cracked");
    await parts.acceptReturn(fourth.id, ACTOR);
    await parts.completeReturn(fourth.id, shop.warehouseId, 1, ACTOR, { damaged: true });

    // 12 received. Issued 2 + (2+1) + 1 + 1 = 7. One good return comes
    // back to sellable; the damaged one does NOT -- that is the whole
    // point of 3.3. So 12 - 7 + 1 = 6 sellable, and 1 damaged.
    //
    // Worth recording: the first version of this test asserted 7,
    // because I counted six issues instead of seven. The replay
    // assertion below still passed -- the ledger and the balance agreed
    // with each other while my arithmetic disagreed with both, which is
    // exactly the failure the ledger exists to make impossible to hide.
    const balance = await stock.balanceOf(shop.itemId, shop.warehouseId);
    expect(balance.availableQty).toBe(6);
    expect(balance.damagedQty).toBe(1);
  });

  it("EXIT CRITERION: the stored balance still equals its replayed ledger", async () => {
    // The rule the whole phase is judged by. If this fails, something
    // moved a number without recording why.
    const stored = await stock.balanceOf(shop.itemId, shop.warehouseId);

    expect(await stock.replay(shop.itemId, shop.warehouseId, "availableQty")).toBe(stored.availableQty);
    expect(await stock.replay(shop.itemId, shop.warehouseId, "damagedQty")).toBe(stored.damagedQty);
  });

  it("every movement carries the before and after that produced it", async () => {
    // A ledger you cannot replay is a rumour. Walking it forward must
    // reproduce every step, not just the total.
    const movements = await prisma.stockMovement.findMany({
      where: { inventoryItemId: shop.itemId, warehouseId: shop.warehouseId },
      orderBy: { createdAt: "asc" },
      select: { type: true, quantity: true, beforeQty: true, afterQty: true },
    });

    const running = { availableQty: 0, damagedQty: 0, returnPendingQty: 0 };
    for (const movement of movements) {
      // RETURN_PENDING moves its own bucket -- opened when a return is
      // requested, reversed when it's accepted or rejected -- and must
      // not be folded into availableQty's chain, which is what a bare
      // `type !== "DAMAGED"` check used to do before this test caught it.
      const bucket =
        movement.type === "DAMAGED" ? "damagedQty" : movement.type === "RETURN_PENDING" ? "returnPendingQty" : "availableQty";
      expect(movement.beforeQty).toBe(running[bucket]);
      running[bucket] = movement.afterQty;
    }

    const stored = await stock.balanceOf(shop.itemId, shop.warehouseId);
    expect(running.availableQty).toBe(stored.availableQty);
    expect(running.damagedQty).toBe(stored.damagedQty);
  });

  it("the stock page reports what the ledger says, not its own arithmetic", async () => {
    const table = await view.stockTable(shop.tenantId);
    const row = table.rows.find((candidate) => candidate.itemId === shop.itemId);
    const stored = await stock.balanceOf(shop.itemId, shop.warehouseId);

    expect(row?.totalAvailable).toBe(stored.availableQty);
    // Damaged is reported beside available, never folded into it.
    expect(row?.byWarehouse[0].damaged).toBe(stored.damagedQty);
  });

  it("the requests queue lists only what somebody is still waiting for", async () => {
    // A fully-issued request is nobody's queue, whatever its status says.
    const waiting = await view.waiting(shop.tenantId);

    for (const row of waiting) expect(row.outstanding).toBeGreaterThan(0);
  });
});

describe("SCENARIOS.md 3.6 — a received part neither used nor returned", () => {
  it("blocks the Finish Gate in a workshop that holds stock", async () => {
    const request = await ask(1);
    await parts.approve(request.id, ACTOR);
    await parts.issue({ partRequestId: request.id, warehouseId: shop.warehouseId, quantity: 1 }, ACTOR);
    await parts.markArrived(request.id, ACTOR);
    await parts.receive(request.id, ACTOR);
    // Deliberately left there: not used, not returned.

    const profile = await capabilities.resolveCurrent(shop.tenantId);
    const result = await gates.evaluate(
      shop.workOrderId,
      ["parts.received_used_or_returned"],
      profile,
      "FINISH",
    );

    expect(result.passed).toBe(false);
  });

  it("cannot block a workshop with no inventory, because the gate does not exist there", async () => {
    // The exact case the capability engine exists to get right. Not
    // "passes anyway" -- the gate is not evaluated at all, so there is
    // nothing that could ever hold the job shut.
    const profile = await capabilities.resolveCurrent(bare.tenantId);
    const result = await gates.evaluate(
      bare.workOrderId,
      ["parts.received_used_or_returned"],
      profile,
      "FINISH",
    );

    expect(result.evaluations).toHaveLength(0);
    expect(result.passed).toBe(true);
  });
});
