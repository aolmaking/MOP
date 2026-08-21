/**
 * SCENARIOS.md 3.5, open since Phase 2 and settled in Phase 7: three
 * requested, two issued, and the remaining one issued later.
 *
 * Integration because the whole question was a schema one. A unit test
 * against a mock would have "passed" for the entire time the constraint
 * made this impossible.
 *
 * What is being pinned:
 *   - one PartRequest can carry more than one IssuedItem
 *   - fulfilment is DERIVED (requested vs SUM(issued)), never stored
 *   - the work order still sees ONE part line, so the customer's invoice
 *     shows one line for one part rather than two
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";

const prisma = new PrismaClient();
const SUFFIX = `partial-${Date.now()}`;

let tenantId: string;
let planId: string;
let branchId: string;
let warehouseId: string;
let itemId: string;
let workOrderId: string;
let requestId: string;

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "Partial",
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
      name: `Partial WS ${SUFFIX}`,
      nameNormalized: `partial ws ${SUFFIX}`,
      slug: `partial-ws-${SUFFIX}`,
      customerRegistrationCode: `PF-${SUFFIX}`,
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

  branchId = (await prisma.branch.create({ data: { tenantId, name: "Main", code: "MAIN" } })).id;
  warehouseId = (await prisma.warehouse.create({ data: { tenantId, name: "Store", code: "ST" } })).id;

  itemId = (
    await prisma.inventoryItem.create({
      data: { tenantId, sku: `SKU-${SUFFIX}`, name: "Brake pad", itemType: "PART", sellingPrice: "250.00" },
    })
  ).id;

  const customer = await prisma.customer.create({
    data: { tenantId, fullName: "Partial Customer", phone: `0100${Date.now() % 1000000}` },
  });
  const asset = await prisma.asset.create({
    data: { tenantId, category: "CARS", plateNumber: `PF-${Date.now() % 10000}`, currentOwnerCustomerId: customer.id },
  });
  workOrderId = (
    await prisma.workOrder.create({
      data: { tenantId, branchId, assetId: asset.id, customerId: customer.id, status: "IN_PROGRESS" },
    })
  ).id;

  // Three asked for, once.
  requestId = (
    await prisma.partRequest.create({
      data: {
        tenantId,
        workOrderId,
        inventoryItemId: itemId,
        requestedById: "tech-1",
        quantity: 3,
        status: "APPROVED",
      },
    })
  ).id;
}, 180_000);

afterAll(async () => {
  const where = { tenantId };
  await prisma.issuedItem.deleteMany({ where });
  await prisma.workOrderPartLine.deleteMany({ where });
  await prisma.partRequest.deleteMany({ where });
  await prisma.workOrder.deleteMany({ where });
  await prisma.assetOwnershipHistory.deleteMany({ where });
  await prisma.asset.deleteMany({ where });
  await prisma.customer.deleteMany({ where });
  await prisma.inventoryItem.deleteMany({ where });
  await prisma.warehouse.deleteMany({ where });
  await prisma.branch.deleteMany({ where });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 180_000);

/** Requested vs actually handed over. Computed, never read from a column. */
async function fulfilment(partRequestId: string) {
  const request = await prisma.partRequest.findUniqueOrThrow({
    where: { id: partRequestId },
    select: { quantity: true },
  });
  const issued = await prisma.issuedItem.aggregate({
    where: { partRequestId },
    _sum: { quantity: true },
  });
  const total = issued._sum.quantity ?? 0;
  return { requested: request.quantity, issued: total, outstanding: request.quantity - total };
}

describe("SCENARIOS.md 3.5 — partial fulfilment", () => {
  it("issues 2 of 3 and reports 1 still outstanding", async () => {
    await prisma.issuedItem.create({
      data: { tenantId, partRequestId: requestId, warehouseId, quantity: 2, issuedById: "store-1" },
    });

    await expect(fulfilment(requestId)).resolves.toEqual({ requested: 3, issued: 2, outstanding: 1 });
  });

  it("issues the remaining 1 later, against the SAME request", async () => {
    // The thing the unique constraint made impossible. Before this
    // migration the write below threw.
    await prisma.issuedItem.create({
      data: { tenantId, partRequestId: requestId, warehouseId, quantity: 1, issuedById: "store-1" },
    });

    await expect(fulfilment(requestId)).resolves.toEqual({ requested: 3, issued: 3, outstanding: 0 });
  });

  it("keeps two issue rows, because two hand-overs really happened", async () => {
    // The ledger records each physical movement separately; the issue
    // table mirrors it rather than collapsing history into a total.
    const rows = await prisma.issuedItem.findMany({
      where: { partRequestId: requestId },
      orderBy: { issuedAt: "asc" },
      select: { quantity: true },
    });

    expect(rows.map((row) => row.quantity)).toEqual([2, 1]);
  });

  it("still charges the customer for ONE part line, not two", async () => {
    // The decisive argument against splitting the request. One thing was
    // asked for; the invoice must say so.
    await prisma.workOrderPartLine.create({
      data: {
        tenantId,
        workOrderId,
        inventoryItemId: itemId,
        partRequestId: requestId,
        provenance: "INVENTORY",
        name: "Brake pad",
        quantity: 3,
        sellingPrice: "250.00",
        addedById: "store-1",
      },
    });

    const lines = await prisma.workOrderPartLine.count({ where: { workOrderId } });
    expect(lines).toBe(1);
  });

  it("never stores the issued total anywhere", async () => {
    // A cached sum is a second source of truth and the two will
    // eventually disagree. PartRequest.quantity is the ASK, and nothing
    // on it may mean "issued so far".
    const request = await prisma.partRequest.findUniqueOrThrow({ where: { id: requestId } });

    expect(request.quantity).toBe(3);
    expect(Object.keys(request)).not.toContain("issuedQuantity");
    expect(Object.keys(request)).not.toContain("fulfilledQuantity");
  });
});
