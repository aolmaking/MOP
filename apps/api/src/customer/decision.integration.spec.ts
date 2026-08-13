/**
 * The public customer decision link.
 *
 * This is the only unauthenticated surface in the product, so the tests
 * lead with what an attacker could try rather than with the happy path:
 * skipping the safety acknowledgement, answering somebody else's item,
 * and probing whether a token was ever real.
 *
 * It also closes a hole open since Phase 4 -- `secureToken` was written
 * on every request and read by nothing, so no customer could answer.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@mop/database";
import { CustomerDecisionService } from "./decision.service";
import { OperationEventsService } from "../operations/operation-events.service";
import { CustomerSafeProjectionService } from "../operations/customer-safe-projection.service";
import { AuditService } from "../audit/audit.service";
import type { PrismaService } from "../database/prisma.service";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;
const decisions = new CustomerDecisionService(
  asService,
  new OperationEventsService(asService, new AuditService(asService), new CustomerSafeProjectionService()),
);

const SUFFIX = `dec-${Date.now()}`;
let tenantId: string;
let planId: string;
let branchId: string;
let customerId: string;
let assetId: string;

interface Made {
  token: string;
  requestId: string;
  criticalItemId: string;
  normalItemId: string;
}

async function makeRequest(
  options: { expiresAt?: Date | null; answered?: boolean; workOrderStatus?: string } = {},
): Promise<Made> {
  const token = randomBytes(24).toString("hex");

  const workOrder = await prisma.workOrder.create({
    data: { tenantId, branchId, assetId, customerId, status: (options.workOrderStatus ?? "AWAITING_CUSTOMER_APPROVAL") as never },
  });

  const request = await prisma.customerDecisionRequest.create({
    data: {
      tenantId,
      workOrderId: workOrder.id,
      customerId,
      status: options.answered ? "RESOLVED" : "SENT",
      secureToken: token,
      createdById: "tech-1",
      sentAt: new Date(),
      expiresAt: options.expiresAt === undefined ? null : options.expiresAt,
    },
  });

  const critical = await prisma.customerDecisionItem.create({
    data: {
      tenantId,
      decisionRequestId: request.id,
      name: "Front brake pads",
      explanation: "Worn below the safe limit.",
      importance: "CRITICAL",
      price: "1500.00",
      laborPrice: "300.00",
      total: "1800.00",
      decision: options.answered ? "APPROVED" : "PENDING",
      decidedAt: options.answered ? new Date() : null,
    },
  });

  const normal = await prisma.customerDecisionItem.create({
    data: {
      tenantId,
      decisionRequestId: request.id,
      name: "Cabin filter",
      explanation: "Dirty, worth replacing while we are in there.",
      importance: "LOW",
      price: "200.00",
      laborPrice: "0.00",
      total: "200.00",
      decision: options.answered ? "REJECTED" : "PENDING",
      decidedAt: options.answered ? new Date() : null,
    },
  });

  return { token, requestId: request.id, criticalItemId: critical.id, normalItemId: normal.id };
}

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "Decision",
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
      name: `Decision WS ${SUFFIX}`,
      nameNormalized: `decision ws ${SUFFIX}`,
      slug: `decision-ws-${SUFFIX}`,
      customerRegistrationCode: `DC-${SUFFIX}`,
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
  customerId = (
    await prisma.customer.create({ data: { tenantId, fullName: "Mona Adel", phone: `010${Date.now() % 10000000}` } })
  ).id;
  assetId = (
    await prisma.asset.create({
      data: { tenantId, category: "CARS", plateNumber: `DEC-${Date.now() % 10000}`, currentOwnerCustomerId: customerId },
    })
  ).id;
}, 180_000);

afterAll(async () => {
  const where = { tenantId };
  await prisma.customerDecisionItem.deleteMany({ where });
  await prisma.customerDecisionRequest.deleteMany({ where });
  await prisma.operationEvent.deleteMany({ where });
  await prisma.auditLog.deleteMany({ where });
  await prisma.customerTimelineEvent.deleteMany({ where });
  await prisma.workOrder.deleteMany({ where });
  await prisma.assetOwnershipHistory.deleteMany({ where });
  await prisma.asset.deleteMany({ where });
  await prisma.customer.deleteMany({ where });
  await prisma.branch.deleteMany({ where });
  await prisma.financeConfiguration.deleteMany({ where });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 180_000);

describe("what an attacker would try first", () => {
  it("REFUSES a critical rejection without the acknowledgement", async () => {
    // The gate. The browser modal is a courtesy; a replayed or hand-built
    // request arrives here looking identical to an honest one and must be
    // refused just the same.
    const made = await makeRequest();

    await expect(
      decisions.respond(made.token, [{ itemId: made.criticalItemId, decision: "REJECTED" }]),
    ).rejects.toMatchObject({ status: 400, response: { code: "critical_warning_not_acknowledged" } });

    // And nothing was written -- not even the other items in the batch.
    const stored = await prisma.customerDecisionItem.findUniqueOrThrow({ where: { id: made.criticalItemId } });
    expect(stored.decision).toBe("PENDING");
  });

  it("accepts a critical rejection once acknowledged, and records the acknowledgement", async () => {
    const made = await makeRequest();

    await decisions.respond(made.token, [
      { itemId: made.criticalItemId, decision: "REJECTED", warningAcknowledged: true },
      { itemId: made.normalItemId, decision: "APPROVED" },
    ]);

    const stored = await prisma.customerDecisionItem.findUniqueOrThrow({ where: { id: made.criticalItemId } });
    expect(stored.decision).toBe("REJECTED");
    // The attention queue and the Finish Gate both read this later.
    expect(stored.warningAcknowledged).toBe(true);
  });

  it("refuses an item id belonging to a DIFFERENT request", async () => {
    // Refused rather than ignored: ignoring it would let somebody answer
    // another customer's item by pasting its id into a request they do
    // hold a token for.
    const mine = await makeRequest();
    const theirs = await makeRequest();

    await expect(
      decisions.respond(mine.token, [{ itemId: theirs.normalItemId, decision: "APPROVED" }]),
    ).rejects.toMatchObject({ status: 400, response: { code: "item_not_on_request" } });

    const untouched = await prisma.customerDecisionItem.findUniqueOrThrow({ where: { id: theirs.normalItemId } });
    expect(untouched.decision).toBe("PENDING");
  });

  it("cannot influence price or identity -- they are re-read from the row", async () => {
    // The submitted object carries no price, and the stored one is
    // unchanged after a response. There is no field through which a
    // modified client could alter what it is agreeing to.
    const made = await makeRequest();

    await decisions.respond(made.token, [{ itemId: made.normalItemId, decision: "APPROVED" }]);

    const stored = await prisma.customerDecisionItem.findUniqueOrThrow({ where: { id: made.normalItemId } });
    expect(stored.total.toFixed(2)).toBe("200.00");
    expect(stored.name).toBe("Cabin filter");
  });

  it("gives the same answer for an unknown token as for a cancelled one", async () => {
    const made = await makeRequest();
    await prisma.customerDecisionRequest.update({ where: { id: made.requestId }, data: { status: "CANCELLED" } });

    const messages: string[] = [];
    for (const token of [made.token, randomBytes(24).toString("hex")]) {
      await decisions.read(token).catch((error: { response?: { message?: string } }) => {
        messages.push(error.response?.message ?? "");
      });
    }

    expect(messages).toHaveLength(2);
    expect(new Set(messages).size).toBe(1);
  });
});

describe("the three link states", () => {
  it("shows an open request with its items and prices", async () => {
    const made = await makeRequest();

    const view = await decisions.read(made.token);

    expect(view.state).toBe("OPEN");
    expect(view.items).toHaveLength(2);
    expect(view.items.find((item) => item.importance === "Critical")?.total).toBe("1800.00");
    // Plain words, never the internal enum.
    expect(view.items.map((item) => item.importance)).not.toContain("CRITICAL");
  });

  it("shows an expired link with NO items at all", async () => {
    // Never a confusing empty decision list, and never a priced list
    // somebody can no longer act on.
    const made = await makeRequest({ expiresAt: new Date(Date.now() - 60_000) });

    const view = await decisions.read(made.token);

    expect(view.state).toBe("EXPIRED");
    expect(view.items).toEqual([]);
  });

  it("shows an already-answered link read-only, with what was chosen", async () => {
    const made = await makeRequest({ answered: true });

    const view = await decisions.read(made.token);

    expect(view.state).toBe("ANSWERED");
    expect(view.items).toHaveLength(2);
    expect(view.items.map((item) => item.decision).sort()).toEqual(["APPROVED", "REJECTED"]);
  });

  it("does not call a request with NO items 'answered'", async () => {
    // `[].every()` is vacuously true, so the first implementation reported
    // ANSWERED here and the page told a customer they had already replied
    // when they never had. Found against real seeded data.
    const made = await makeRequest();
    await prisma.customerDecisionItem.deleteMany({ where: { decisionRequestId: made.requestId } });

    const view = await decisions.read(made.token);

    expect(view.state).toBe("OPEN");
    expect(view.items).toEqual([]);
  });

  it("refuses to answer an expired link", async () => {
    const made = await makeRequest({ expiresAt: new Date(Date.now() - 60_000) });

    await expect(
      decisions.respond(made.token, [{ itemId: made.normalItemId, decision: "APPROVED" }]),
    ).rejects.toMatchObject({ status: 400, response: { code: "decision_expired" } });
  });

  it("refuses to answer the same item twice", async () => {
    const made = await makeRequest();
    await decisions.respond(made.token, [{ itemId: made.normalItemId, decision: "APPROVED" }]);

    await expect(
      decisions.respond(made.token, [{ itemId: made.normalItemId, decision: "REJECTED" }]),
    ).rejects.toMatchObject({ status: 400, response: { code: "already_answered" } });
  });

  it("H4 -- refuses to record a decision against a work order that has already closed", async () => {
    // The whole point of this flow is proving informed consent BEFORE
    // work proceeds. If the branch manager resolved things at the
    // counter instead of waiting on the link, and the job is already
    // CLOSED, an answer arriving now would falsely read as having come
    // before the work. docs/scenarios3/EDGE_CASE_REGISTER.md, H4.
    const made = await makeRequest({ workOrderStatus: "CLOSED" });

    await expect(
      decisions.respond(made.token, [{ itemId: made.normalItemId, decision: "APPROVED" }]),
    ).rejects.toMatchObject({ status: 409, response: { code: "work_order_already_closed" } });

    const item = await prisma.customerDecisionItem.findUniqueOrThrow({ where: { id: made.normalItemId } });
    expect(item.decision).toBe("PENDING");
  });

  it("H4 -- same refusal for a work order that was cancelled instead", async () => {
    const made = await makeRequest({ workOrderStatus: "CANCELLED" });

    await expect(
      decisions.respond(made.token, [{ itemId: made.normalItemId, decision: "APPROVED" }]),
    ).rejects.toMatchObject({ status: 409, response: { code: "work_order_already_closed" } });
  });
});

describe("a workshop that withholds pricing", () => {
  it("still shows the items, without numbers, rather than breaking", async () => {
    await prisma.financeConfiguration.upsert({
      where: { tenantId },
      create: { tenantId, customerInvoiceVisible: false },
      update: { customerInvoiceVisible: false },
    });

    const made = await makeRequest();
    const view = await decisions.read(made.token);

    expect(view.pricingVisible).toBe(false);
    expect(view.items).toHaveLength(2);
    // Absent, not zeroed -- a withheld price must not look like a free
    // item.
    expect(view.items[0].total).toBeNull();
    expect(view.items[0].name).toBeTruthy();

    await prisma.financeConfiguration.update({ where: { tenantId }, data: { customerInvoiceVisible: true } });
  });
});

describe("the answer reaches the rest of the system", () => {
  it("emits an operation event, like any staff action", async () => {
    // A customer's decision is exactly as consequential as a staff one,
    // and the branch manager's Approvals view reads the result.
    const made = await makeRequest();

    await decisions.respond(made.token, [
      { itemId: made.criticalItemId, decision: "APPROVED" },
      { itemId: made.normalItemId, decision: "APPROVED" },
    ]);

    const event = await prisma.operationEvent.findFirst({
      where: { tenantId, eventKey: "customer_decision.responded" },
      orderBy: { createdAt: "desc" },
    });

    expect(event).not.toBeNull();
    expect(event?.actorType).toBe("CUSTOMER");
  });

  it("resolves the request once every item is answered", async () => {
    const made = await makeRequest();

    await decisions.respond(made.token, [
      { itemId: made.criticalItemId, decision: "APPROVED" },
      { itemId: made.normalItemId, decision: "APPROVED" },
    ]);

    const stored = await prisma.customerDecisionRequest.findUniqueOrThrow({ where: { id: made.requestId } });
    expect(stored.status).toBe("RESOLVED");
    expect(stored.respondedAt).not.toBeNull();
  });

  it("marks a partly-answered request as PARTIALLY_RESPONDED, not resolved", async () => {
    const made = await makeRequest();

    await decisions.respond(made.token, [{ itemId: made.normalItemId, decision: "APPROVED" }]);

    const stored = await prisma.customerDecisionRequest.findUniqueOrThrow({ where: { id: made.requestId } });
    expect(stored.status).toBe("PARTIALLY_RESPONDED");
  });
});
