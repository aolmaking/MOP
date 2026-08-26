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
import { AuditService } from "../../audit/audit.service";
import { PolicyResolutionService } from "../../control/policies/policy-resolution.service";
import { CapabilityResolutionService } from "../../control/capabilities/capability-resolution.service";
import { GateEvaluatorService } from "../operations/gate-evaluator.service";
import { WorkOrderLifecycleService } from "../operations/work-order-lifecycle.service";
import type { PrismaService } from "../../runtime/database/prisma.service";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;
const audit = new AuditService(asService);
const policies = new PolicyResolutionService(asService, audit, new CapabilityResolutionService(asService));
const lifecycle = new WorkOrderLifecycleService(
  asService,
  new CapabilityResolutionService(asService),
  new OperationEventsService(asService, audit, new CustomerSafeProjectionService()),
  new GateEvaluatorService(asService, policies),
  policies,
);
const decisions = new CustomerDecisionService(asService, new OperationEventsService(asService, audit, new CustomerSafeProjectionService()), policies, lifecycle);

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
  highItemId: string;
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

  const high = await prisma.customerDecisionItem.create({
    data: {
      tenantId,
      decisionRequestId: request.id,
      name: "Timing belt",
      explanation: "Due at this mileage; not yet failed.",
      importance: "HIGH",
      price: "2200.00",
      laborPrice: "600.00",
      total: "2800.00",
      decision: options.answered ? "APPROVED" : "PENDING",
      decidedAt: options.answered ? new Date() : null,
    },
  });

  return { token, requestId: request.id, criticalItemId: critical.id, normalItemId: normal.id, highItemId: high.id };
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
    expect(view.items).toHaveLength(3);
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
    expect(view.items).toHaveLength(3);
    expect(view.items.map((item) => item.decision).sort()).toEqual(["APPROVED", "APPROVED", "REJECTED"]);
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
    expect(view.items).toHaveLength(3);
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

  it("E19 -- flags a response as stale-ownership when the asset changed hands after the link was sent", async () => {
    // The token was legitimately sent to made's customer -- the fix here
    // is not to block or re-scope the answer, it's to make sure the
    // branch manager reading the audit trail can plainly see the asset
    // changed hands in between. docs/scenarios3/EDGE_CASE_REGISTER.md,
    // E19.
    const made = await makeRequest();
    const newOwner = await prisma.customer.create({
      data: { tenantId, fullName: "New Owner", phone: `011${Date.now() % 10000000}` },
    });
    const workOrder = await prisma.customerDecisionRequest.findUniqueOrThrow({
      where: { id: made.requestId },
      select: { workOrder: { select: { assetId: true } } },
    });
    await prisma.asset.update({ where: { id: workOrder.workOrder.assetId }, data: { currentOwnerCustomerId: newOwner.id } });

    await decisions.respond(made.token, [{ itemId: made.normalItemId, decision: "APPROVED" }]);

    const auditRow = await prisma.auditLog.findFirst({
      where: { tenantId, action: "customer_decision.responded", targetId: made.requestId },
      orderBy: { createdAt: "desc" },
    });

    expect(auditRow?.riskLevel).toBe("HIGH");
    expect(auditRow?.after).toMatchObject({ ownershipChangedSinceRequest: true });

    // Restore the shared fixture asset's ownership -- makeRequest() reuses
    // the module-level assetId for every call, so leaving this changed
    // would falsely flag every later test in this file.
    await prisma.asset.update({ where: { id: workOrder.workOrder.assetId }, data: { currentOwnerCustomerId: customerId } });
  });

  it("E19 -- does not flag a normal response where ownership never changed", async () => {
    const made = await makeRequest();

    await decisions.respond(made.token, [{ itemId: made.normalItemId, decision: "APPROVED" }]);

    const auditRow = await prisma.auditLog.findFirst({
      where: { tenantId, action: "customer_decision.responded", targetId: made.requestId },
      orderBy: { createdAt: "desc" },
    });

    expect(auditRow?.riskLevel).toBe("MEDIUM");
  });

  it("resolves the request once every item is answered", async () => {
    const made = await makeRequest();

    await decisions.respond(made.token, [
      { itemId: made.criticalItemId, decision: "APPROVED" },
      { itemId: made.normalItemId, decision: "APPROVED" },
      { itemId: made.highItemId, decision: "APPROVED" },
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

describe("P-18 -- recordOnBehalf, staff recording a verbal decision", () => {
  const STAFF = { accountId: "staff-1", displayName: "Amira Hassan", actorType: "TENANT_STAFF" as const };

  it("records the decision under ALLOWED_ATTRIBUTED (the default), attributed to staff, never the customer", async () => {
    const made = await makeRequest();

    await decisions.recordOnBehalf(tenantId, [branchId], made.requestId, [
      { itemId: made.normalItemId, decision: "APPROVED" },
    ], STAFF);

    const item = await prisma.customerDecisionItem.findUniqueOrThrow({ where: { id: made.normalItemId } });
    expect(item.decision).toBe("APPROVED");

    const event = await prisma.operationEvent.findFirst({
      where: { tenantId, eventKey: "customer_decision.responded" },
      orderBy: { createdAt: "desc" },
    });
    expect(event?.actorType).toBe("TENANT_STAFF");
    expect(event?.actorId).toBe(STAFF.accountId);

    const auditRow = await prisma.auditLog.findFirst({
      where: { tenantId, action: "customer_decision.responded", targetId: made.requestId },
      orderBy: { createdAt: "desc" },
    });
    expect(auditRow?.riskLevel).toBe("HIGH");
    expect(auditRow?.after).toMatchObject({ recordedOnBehalf: true });
    expect(auditRow?.actorName).toBe(STAFF.displayName);
  });

  it("refuses out-of-scope requests the same way it refuses ones that don't exist", async () => {
    const made = await makeRequest();

    await expect(
      decisions.recordOnBehalf(tenantId, ["some-other-branch"], made.requestId, [
        { itemId: made.normalItemId, decision: "APPROVED" },
      ], STAFF),
    ).rejects.toMatchObject({ status: 404, response: { code: "decision_not_found" } });
  });

  it("respects PORTAL_ONLY -- refuses to let staff record anything", async () => {
    await policies.set(tenantId, "PORTAL_COUNTER_APPROVAL", "PORTAL_ONLY", STAFF, "PLATFORM", "test: portal only");
    const made = await makeRequest();

    await expect(
      decisions.recordOnBehalf(tenantId, [branchId], made.requestId, [
        { itemId: made.normalItemId, decision: "APPROVED" },
      ], STAFF),
    ).rejects.toMatchObject({ status: 409, response: { code: "counter_approval_not_allowed" } });

    await policies.set(tenantId, "PORTAL_COUNTER_APPROVAL", "ALLOWED_ATTRIBUTED", STAFF, "PLATFORM", "test: restore");
  });

  it("respects ALLOWED_WITH_EVIDENCE -- refuses without a reference, accepts with one", async () => {
    await policies.set(
      tenantId,
      "PORTAL_COUNTER_APPROVAL",
      "ALLOWED_WITH_EVIDENCE",
      STAFF,
      "PLATFORM",
      "test: evidence required",
    );
    const made = await makeRequest();

    await expect(
      decisions.recordOnBehalf(tenantId, [branchId], made.requestId, [
        { itemId: made.normalItemId, decision: "APPROVED" },
      ], STAFF),
    ).rejects.toMatchObject({ status: 400, response: { code: "evidence_required" } });

    await decisions.recordOnBehalf(
      tenantId,
      [branchId],
      made.requestId,
      [{ itemId: made.normalItemId, decision: "APPROVED" }],
      STAFF,
      "Called customer, she confirmed by phone at 14:20.",
    );

    const item = await prisma.customerDecisionItem.findUniqueOrThrow({ where: { id: made.normalItemId } });
    expect(item.decision).toBe("APPROVED");

    await policies.set(tenantId, "PORTAL_COUNTER_APPROVAL", "ALLOWED_ATTRIBUTED", STAFF, "PLATFORM", "test: restore");
  });

  it("H4 still applies through this path -- refuses against an already-closed work order", async () => {
    const made = await makeRequest({ workOrderStatus: "CLOSED" });

    await expect(
      decisions.recordOnBehalf(tenantId, [branchId], made.requestId, [
        { itemId: made.normalItemId, decision: "APPROVED" },
      ], STAFF),
    ).rejects.toMatchObject({ status: 409, response: { code: "work_order_already_closed" } });
  });

  it("detailForStaff shows the manager exactly what the token link would have shown", async () => {
    const made = await makeRequest();

    const staffView = await decisions.detailForStaff(tenantId, [branchId], made.requestId);
    const customerView = await decisions.read(made.token);

    expect(staffView).toEqual(customerView);
    expect(staffView.items.map((i) => i.id)).toEqual(expect.arrayContaining([made.criticalItemId, made.normalItemId]));
  });

  it("detailForStaff refuses out-of-scope requests the same way the write does", async () => {
    const made = await makeRequest();

    await expect(
      decisions.detailForStaff(tenantId, ["some-other-branch"], made.requestId),
    ).rejects.toMatchObject({ status: 404, response: { code: "decision_not_found" } });
  });
});

/**
 * `raiseAndSend` -- the piece that was missing before this session:
 * nothing in production code ever created a `CustomerDecisionRequest`.
 * `customer_decision.create`/`.send` were declared true for TECHNICIAN in
 * `default-role-permissions.ts` and the `customer_decision.requested`
 * event already had a customer-safe projection message, but no service
 * method and no route ever used either. This proves the whole seam: a
 * technician's "ask the customer" press produces a request the SAME
 * public token link can read and answer, and the customer's own
 * timeline picks it up -- not just that a row appears in the table.
 */
describe("raiseAndSend -- a technician actually asking the customer something", () => {
  const STAFF = { accountId: "tech-1", displayName: "Hassan Fathy" };

  it("creates a request the public token link can read, sent immediately", async () => {
    const workOrder = await prisma.workOrder.create({
      data: { tenantId, branchId, assetId, customerId, status: "IN_PROGRESS" as never },
    });

    const result = await decisions.raiseAndSend(
      tenantId,
      workOrder.id,
      { name: "Replace rear shock absorbers", explanation: "Leaking, failed the bounce test.", importance: "HIGH", price: "1200.00", laborPrice: "300.00" },
      STAFF,
    );

    // The exact object a `customer_decision_request` row should look like
    // -- SENT, not a draft nobody sent.
    const row = await prisma.customerDecisionRequest.findUniqueOrThrow({
      where: { id: result.requestId },
      include: { items: true },
    });
    expect(row.status).toBe("SENT");
    expect(row.sentAt).not.toBeNull();
    expect(row.customerId).toBe(customerId);
    expect(row.items).toHaveLength(1);
    expect(row.items[0].total.toFixed(2)).toBe("1500.00");

    // The same token the public page would be sent resolves to the same
    // item -- proving this is not a parallel, disconnected record.
    const publicView = await decisions.read(result.secureToken);
    expect(publicView.state).toBe("OPEN");
    expect(publicView.items).toHaveLength(1);
    expect(publicView.items[0].name).toBe("Replace rear shock absorbers");
    expect(publicView.items[0].total).toBe("1500.00");

    // And the event fan-out actually happened: the customer's own
    // timeline (what Portal Home's "recent activity" reads) has an entry,
    // using the canned safe message for this event key.
    const timelineEntry = await prisma.customerTimelineEvent.findFirst({
      where: { tenantId, customerId, workOrderId: workOrder.id, eventKey: "customer_decision.requested" },
    });
    expect(timelineEntry?.message).toBe("We've sent you a decision to review.");
  });

  it("refuses to ask about a job that has already closed", async () => {
    const workOrder = await prisma.workOrder.create({
      data: { tenantId, branchId, assetId, customerId, status: "CLOSED" as never },
    });

    await expect(
      decisions.raiseAndSend(
        tenantId,
        workOrder.id,
        { name: "Late finding", explanation: "Found after the fact.", importance: "LOW", price: "100.00" },
        STAFF,
      ),
    ).rejects.toMatchObject({ status: 409, response: { code: "work_order_already_closed" } });
  });

  it("computes the total itself rather than trusting a client-sent number", async () => {
    const workOrder = await prisma.workOrder.create({
      data: { tenantId, branchId, assetId, customerId, status: "IN_PROGRESS" as never },
    });

    const result = await decisions.raiseAndSend(
      tenantId,
      workOrder.id,
      { name: "Alignment", explanation: "Pulling right.", importance: "LOW", price: "0.10", laborPrice: "0.20" },
      STAFF,
    );

    const item = await prisma.customerDecisionItem.findFirstOrThrow({ where: { decisionRequestId: result.requestId } });
    // Exact decimal arithmetic -- 0.10 + 0.20, not the float that famously
    // is not 0.30.
    expect(item.total.toFixed(2)).toBe("0.30");
  });
});

/**
 * The authenticated portal's own way in.
 *
 * The portal counted pending decisions on its home page and listed them
 * nowhere; Current Service showed a "Needs you" flag with nothing behind
 * it. The only way to answer was a token link the customer had to still
 * have -- which is the one channel the portal exists to make optional.
 */
describe("answering from inside the customer's own session", () => {
  it("lists a sent decision, and does not list a drafted-but-unsent one", async () => {
    const sent = await makeRequest();
    const draft = await makeRequest();
    // PENDING is the workshop's unfinished business, not the customer's.
    await prisma.customerDecisionRequest.update({ where: { id: draft.requestId }, data: { status: "PENDING" } });

    const listed = await decisions.listForCustomer(tenantId, customerId);
    const ids = listed.map((entry) => entry.requestId);

    expect(ids).toContain(sent.requestId);
    expect(ids).not.toContain(draft.requestId);
  });

  it("does not list a decision that is already resolved", async () => {
    const done = await makeRequest();
    await prisma.customerDecisionRequest.update({ where: { id: done.requestId }, data: { status: "RESOLVED" } });

    const listed = await decisions.listForCustomer(tenantId, customerId);
    expect(listed.map((entry) => entry.requestId)).not.toContain(done.requestId);
  });

  it("shows the customer exactly what the token page shows", async () => {
    const made = await makeRequest();

    const [viaSession] = (await decisions.listForCustomer(tenantId, customerId)).filter(
      (entry) => entry.requestId === made.requestId,
    );
    const viaToken = await decisions.read(made.token);

    // requestId is the only addition; everything a customer reads matches.
    const { requestId, ...sessionView } = viaSession;
    expect(requestId).toBe(made.requestId);
    expect(sessionView).toEqual(viaToken);
  });

  it("records an answer that the token page then agrees with", async () => {
    const made = await makeRequest();

    await decisions.respondAsCustomer(tenantId, customerId, made.requestId, [
      { itemId: made.normalItemId, decision: "APPROVED" },
      { itemId: made.criticalItemId, decision: "APPROVED" },
      { itemId: made.highItemId, decision: "APPROVED" },
    ]);

    const viaToken = await decisions.read(made.token);
    expect(viaToken.state).toBe("ANSWERED");
    expect(viaToken.items.every((item) => item.decision === "APPROVED")).toBe(true);
  });

  it("re-validates a critical rejection exactly as the token path does", async () => {
    const made = await makeRequest();

    await expect(
      decisions.respondAsCustomer(tenantId, customerId, made.requestId, [
        { itemId: made.normalItemId, decision: "APPROVED" },
        // No acknowledgement. The modal is a courtesy; this is the gate.
        { itemId: made.criticalItemId, decision: "REJECTED" },
      ]),
    ).rejects.toThrow();
  });

  it("refuses another customer's request id as not-found", async () => {
    const made = await makeRequest();
    const stranger = await prisma.customer.create({
      data: { tenantId, fullName: "Someone Else", phone: `019${Math.floor(Math.random() * 10000000)}` },
    });

    await expect(
      decisions.respondAsCustomer(tenantId, stranger.id, made.requestId, [
        { itemId: made.normalItemId, decision: "APPROVED" },
      ]),
    ).rejects.toThrow();

    // And it never appears in that customer's own list.
    const listed = await decisions.listForCustomer(tenantId, stranger.id);
    expect(listed).toHaveLength(0);

    await prisma.customer.delete({ where: { id: stranger.id } });
  });
});

describe("APPROVAL_WEIGHT -- how heavy a decision request is", () => {
  const STAFF = { accountId: "staff-1", displayName: "Amira Hassan", actorType: "TENANT_STAFF" as const };

  it("TWO_TIER (the default): a LOW item needs no acknowledgement to reject", async () => {
    const made = await makeRequest();

    await decisions.respond(made.token, [{ itemId: made.normalItemId, decision: "REJECTED" }]);

    const stored = await prisma.customerDecisionItem.findUniqueOrThrow({ where: { id: made.normalItemId } });
    expect(stored.decision).toBe("REJECTED");
  });

  it("TWO_TIER: a HIGH item is refused without acknowledgement, exactly like CRITICAL", async () => {
    const made = await makeRequest();

    await expect(
      decisions.respond(made.token, [{ itemId: made.highItemId, decision: "REJECTED" }]),
    ).rejects.toMatchObject({ status: 400, response: { code: "critical_warning_not_acknowledged" } });

    const stored = await prisma.customerDecisionItem.findUniqueOrThrow({ where: { id: made.highItemId } });
    expect(stored.decision).toBe("PENDING");
  });

  it("TWO_TIER: a HIGH item is accepted once acknowledged", async () => {
    const made = await makeRequest();

    await decisions.respond(made.token, [{ itemId: made.highItemId, decision: "REJECTED", warningAcknowledged: true }]);

    const stored = await prisma.customerDecisionItem.findUniqueOrThrow({ where: { id: made.highItemId } });
    expect(stored.decision).toBe("REJECTED");
  });

  it("read() marks requiresAcknowledgement per item under TWO_TIER -- HIGH/CRITICAL true, LOW false", async () => {
    const made = await makeRequest();

    const view = await decisions.read(made.token);

    expect(view.items.find((item) => item.id === made.normalItemId)?.requiresAcknowledgement).toBe(false);
    expect(view.items.find((item) => item.id === made.highItemId)?.requiresAcknowledgement).toBe(true);
    expect(view.items.find((item) => item.id === made.criticalItemId)?.requiresAcknowledgement).toBe(true);
  });

  it("SINGLE_WEIGHT extends the same acknowledgement requirement down to a LOW item", async () => {
    await policies.set(tenantId, "APPROVAL_WEIGHT", "SINGLE_WEIGHT", STAFF, "PLATFORM", "test: single weight for everything");

    try {
      const made = await makeRequest();

      await expect(
        decisions.respond(made.token, [{ itemId: made.normalItemId, decision: "REJECTED" }]),
      ).rejects.toMatchObject({ status: 400, response: { code: "critical_warning_not_acknowledged" } });

      const view = await decisions.read(made.token);
      expect(view.items.every((item) => item.requiresAcknowledgement)).toBe(true);

      await decisions.respond(made.token, [{ itemId: made.normalItemId, decision: "REJECTED", warningAcknowledged: true }]);
      const stored = await prisma.customerDecisionItem.findUniqueOrThrow({ where: { id: made.normalItemId } });
      expect(stored.decision).toBe("REJECTED");
    } finally {
      await policies.set(tenantId, "APPROVAL_WEIGHT", "TWO_TIER", STAFF, "PLATFORM", "test: restore two tier");
    }
  });
});
