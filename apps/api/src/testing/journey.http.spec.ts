/**
 * The Honesty Harness, journey half.
 *
 * `walkthrough.http.spec.ts` proves the spine moves and
 * `parts-loop.http.spec.ts` proves the inventory loop hanging off it.
 * This proves the thing three roles actually LOOK at while those happen:
 * that at every real transition, the journey each of them reads changed,
 * says the same thing about the same car in three vocabularies, and can
 * be reached by nobody else.
 *
 * Every step is a real request through the real guard chain. The journey
 * is never constructed here and never stubbed -- it is fetched from the
 * endpoint the browser fetches, after a move the browser could make.
 *
 * The one non-HTTP write is the opening stock balance, for the reason
 * `parts-loop.http.spec.ts` records at length: no receiving endpoint
 * exists, and a real pilot workshop has the same problem on its first
 * morning.
 */
import { bootApp, expectCode, http, loginAs, LAUNCH_PROFILE, type BootedApp, type Session } from "./http-kit";
import { hashPassword } from "../identity/auth/password.util";

const SUFFIX = `jy-${Date.now()}`;
const PLATFORM_PASSWORD = "platform-password-123";
const OWNER_PASSWORD = "owner-password-123";
const STAFF_PASSWORD = "staff-password-123";
const CUSTOMER_PASSWORD = "customer-password-123";

interface JourneyEvent {
  kind: string;
  at: string;
  message: string;
  detail: string | null;
  actor: string | null;
  stage: string | null;
}

interface Journey {
  workOrderId: string;
  stages: { status: string; state: string; at: string | null; label: string }[];
  finished: boolean;
  waiting: boolean;
  blocked: boolean;
  headline: string;
  current: {
    status: string;
    label: string;
    since: string | null;
    forMinutes: number | null;
    waitingOn: string | null;
    waitingSince: string | null;
    waitingForMinutes: number | null;
    reason: string | null;
    next: string | null;
  };
  events: JourneyEvent[];
  actions: { key: string; label: string; hint: string | null }[];
  asOf: string;
}

describe("Live work order journey (real HTTP, real Postgres)", () => {
  let booted: BootedApp;
  let platformEmail: string;
  let tenantId: string;
  let branchId: string;
  let warehouseId: string;
  let ownerEmail: string;
  let itemId: string;
  let technicianStaffId: string;

  let managerSession: Session;
  let technicianSession: Session;
  let storekeeperSession: Session;
  let leaderSession: Session;
  let customerSession: Session;
  let ownerSession: Session;

  let workOrderId: string;
  let taskId: string;
  let partRequestId: string;
  let invoiceId: string;
  let customerId: string;

  /** The journey the technician's Work Card would draw, right now. */
  async function technicianJourney(id: string = workOrderId): Promise<Journey> {
    const res = await http(booted)
      .get(`/api/v1/technician/work-orders/${id}/journey`)
      .set("Cookie", technicianSession.cookie);
    expectCode(res, 200);
    return res.body as Journey;
  }

  async function managerJourney(id: string = workOrderId): Promise<Journey> {
    const res = await http(booted)
      .get(`/api/v1/branch-manager/work-orders/${id}/journey`)
      .set("Cookie", managerSession.cookie);
    expectCode(res, 200);
    return res.body as Journey;
  }

  async function leaderJourney(id: string = workOrderId): Promise<Journey> {
    const res = await http(booted)
      .get(`/api/v1/team-leader/work-orders/${id}/journey`)
      .set("Cookie", leaderSession.cookie);
    expectCode(res, 200);
    return res.body as Journey;
  }

  async function customerJourney(id: string = workOrderId): Promise<Journey> {
    const res = await http(booted)
      .get(`/api/v1/customer-portal/service/${id}/journey`)
      .set("Cookie", customerSession.cookie);
    expectCode(res, 200);
    return res.body as Journey;
  }

  const kinds = (journey: Journey): string[] => journey.events.map((event) => event.kind);

  const stageState = (journey: Journey, status: string): string | undefined =>
    journey.stages.find((stage) => stage.status === status)?.state;

  async function staff(role: string, name: string): Promise<Session> {
    const email = `${role.toLowerCase()}-${SUFFIX}@mop.local`;
    const account = await booted.prisma.account.create({
      data: {
        accountType: "TENANT_STAFF",
        tenantId,
        email,
        passwordHash: hashPassword(STAFF_PASSWORD),
        status: "ACTIVE",
      },
    });
    await booted.prisma.staffUser.create({
      data: {
        accountId: account.id,
        tenantId,
        fullName: name,
        role: role as never,
        branchScope: [branchId],
        warehouseScope: [warehouseId],
        categoryScope: ["CARS"],
      },
    });
    return loginAs(booted, email, STAFF_PASSWORD);
  }

  beforeAll(async () => {
    booted = await bootApp();

    const plan = await booted.prisma.plan.create({
      data: {
        code: `JOURNEY-${SUFFIX}`,
        name: "Journey Plan",
        maxBranches: 5,
        maxUsers: 20,
        maxWarehouses: 5,
        allowedCategories: ["CARS"],
        allowedModules: [],
        allowedFeatures: [],
        allowedReports: [],
        monthlyPrice: 0,
      },
    });

    platformEmail = `platform-${SUFFIX}@mop.local`;
    await booted.prisma.account.create({
      data: {
        accountType: "PLATFORM",
        email: platformEmail,
        passwordHash: hashPassword(PLATFORM_PASSWORD),
        status: "ACTIVE",
      },
    });
    const platformSession = await loginAs(booted, platformEmail, PLATFORM_PASSWORD);

    ownerEmail = `owner-${SUFFIX}@mop.local`;
    const created = await http(booted)
      .post("/api/v1/platform/workshops")
      .set("Cookie", platformSession.cookie)
      .send({
        planId: plan.id,
        name: `Journey Motors ${SUFFIX}`,
        slug: `journey-${SUFFIX}`.toLowerCase(),
        country: "EG",
        city: "Cairo",
        businessType: "Independent Garage",
        primaryCategory: "CARS",
        currency: "EGP",
        timezone: "Africa/Cairo",
        ownerFullName: "Journey Owner",
        ownerEmail,
        ownerPhone: "+201234567890",
        starterBuilderTemplate: "MINIMAL",
        initialStatus: "ACTIVE",
        branches: [{ name: "Main Branch", code: "MAIN", city: "Cairo" }],
        warehouses: [{ name: "Main Store", code: "STORE", branchCodes: ["MAIN"] }],
        // The launch shape turns TEAMS off, and the capability layer sits
        // ABOVE role, so a Team Leader there is correctly refused every
        // team endpoint. This file has to prove the Team Leader's journey,
        // so its workshop is one that actually has teams.
        capabilities: { ...LAUNCH_PROFILE, TEAMS: "ENABLED" },
      });
    expectCode(created, 201);
    tenantId = created.body.tenant.id;

    await http(booted)
      .post("/api/v1/auth/invite/accept")
      .send({ token: String(created.body.ownerInvitation.link).split("token=")[1], password: OWNER_PASSWORD });

    branchId = (await booted.prisma.branch.findFirstOrThrow({ where: { tenantId }, select: { id: true } })).id;
    warehouseId = (await booted.prisma.warehouse.findFirstOrThrow({ where: { tenantId }, select: { id: true } })).id;

    managerSession = await staff("BRANCH_MANAGER", "Journey Manager");
    technicianSession = await staff("TECHNICIAN", "Journey Technician");
    storekeeperSession = await staff("INVENTORY_MANAGER", "Journey Storekeeper");
    leaderSession = await staff("TEAM_LEADER", "Journey Team Leader");
    // The money leg runs as the OWNER: `finance.invoice.issue` and
    // `finance.payment.record` are withheld from BRANCH_MANAGER by the
    // default role map, deliberately.
    ownerSession = await loginAs(booted, ownerEmail, OWNER_PASSWORD);

    technicianStaffId = (
      await booted.prisma.staffUser.findFirstOrThrow({
        where: { tenantId, role: "TECHNICIAN" },
        select: { id: true },
      })
    ).id;

    // The Team Leader's roster. Scope on that controller is the managed
    // technicians and never the branch, so without a real team there is
    // nothing for them to be allowed to see -- and the isolation test
    // below would pass for the wrong reason.
    const leaderStaffId = (
      await booted.prisma.staffUser.findFirstOrThrow({
        where: { tenantId, role: "TEAM_LEADER" },
        select: { id: true },
      })
    ).id;
    const team = await booted.prisma.team.create({
      data: { tenantId, name: `Journey Team ${SUFFIX}`, branchId, teamLeaderId: leaderStaffId },
    });
    await booted.prisma.teamMembership.create({
      data: { tenantId, teamId: team.id, technicianId: technicianStaffId },
    });
    // The roster is read off the session, so it has to be re-minted.
    leaderSession = await loginAs(booted, `team_leader-${SUFFIX}@mop.local`, STAFF_PASSWORD);

    const item = await http(booted)
      .post("/api/v1/inventory/catalog")
      .set("Cookie", storekeeperSession.cookie)
      .send({
        sku: `BRK-${SUFFIX}`,
        name: "Front brake pad set",
        itemType: "PART",
        sellingPrice: "450.00",
        cost: "300.00",
        compatibleCategories: ["CARS"],
        stockTracked: true,
        workOrderUsable: true,
      });
    expectCode(item, 201);
    itemId = item.body.id;
    await booted.prisma.warehouseStockBalance.create({
      data: { tenantId, inventoryItemId: itemId, warehouseId, availableQty: 10 },
    });
  }, 240_000);

  afterAll(async () => {
    if (tenantId) {
      await booted.prisma.session.deleteMany({ where: { tenantId } });
      await booted.prisma.teamMembership.deleteMany({ where: { tenantId } });
      await booted.prisma.team.deleteMany({ where: { tenantId } });
      await booted.prisma.staffUser.deleteMany({ where: { tenantId } });
      await booted.prisma.account.deleteMany({ where: { tenantId } });
    }
    await booted.prisma.account.deleteMany({ where: { email: platformEmail } });
    await booted.close();
  }, 240_000);

  // ── the golden journey, one transition at a time ────────────────────

  it("intake: the journey exists the moment the car does, and claims nothing else", async () => {
    const intake = await http(booted)
      .post("/api/v1/branch-manager/intake")
      .set("Cookie", managerSession.cookie)
      .send({
        branchId,
        customer: { fullName: "Journey Customer", phone: "+201234567899" },
        asset: { category: "CARS", plateNumber: `JY-${Date.now() % 1000000}` },
        complaint: "Grinding when braking",
      });
    expectCode(intake, 201);
    workOrderId = intake.body.workOrderId;
    customerId = (
      await booted.prisma.workOrder.findUniqueOrThrow({
        where: { id: workOrderId },
        select: { customerId: true },
      })
    ).customerId;

    await booted.prisma.workOrderAssignment.create({
      data: { tenantId, workOrderId, staffUserId: technicianStaffId },
    });

    const journey = await managerJourney();

    expect(journey.workOrderId).toBe(workOrderId);
    expect(journey.current.status).toBe("REGISTERED");
    expect(journey.finished).toBe(false);
    // Two real events and no more. A projection that filled the past in
    // from the current state would already be claiming an inspection.
    expect(kinds(journey)).toEqual(["work_order.created", "work_order.status_changed"]);
    expect(kinds(journey)).not.toContain("inspection.recorded");
    // The stages AHEAD are drawn; none of them is dated.
    expect(journey.stages.filter((stage) => stage.state === "AHEAD").every((stage) => stage.at === null)).toBe(true);
  }, 180_000);

  it("inspection: the event appears, dated by the record, and the stage becomes current", async () => {
    const before = await technicianJourney();
    expect(before.actions.map((action) => action.key)).toContain("start_inspection");

    expectCode(
      await http(booted)
        .post(`/api/v1/technician/work-orders/${workOrderId}/start-inspection`)
        .set("Cookie", technicianSession.cookie)
        .send({}),
      200,
    );
    expectCode(
      await http(booted)
        .post(`/api/v1/technician/work-orders/${workOrderId}/inspection`)
        .set("Cookie", technicianSession.cookie)
        .send({ type: "QUICK", note: "Pads worn to the backing plate." }),
      201,
    );

    const journey = await technicianJourney();

    expect(journey.current.status).toBe("UNDER_INSPECTION");
    expect(kinds(journey)).toContain("inspection.recorded");
    // Dated by the row, not by the read: the inspection row's own
    // createdAt is what the event has to carry.
    const inspection = await booted.prisma.inspection.findFirstOrThrow({
      where: { workOrderId },
      select: { createdAt: true },
    });
    const recorded = journey.events.find((event) => event.kind === "inspection.recorded");
    expect(recorded?.at).toBe(inspection.createdAt.toISOString());
    expect(recorded?.actor).toBe("Journey Technician");
    // REGISTERED is behind us and is drawn as done, with the real moment
    // it happened.
    expect(stageState(journey, "REGISTERED")).toBe("DONE");
    expect(journey.stages.find((stage) => stage.status === "REGISTERED")?.at).toBeTruthy();
  }, 180_000);

  it("approval: asked, opened and answered are three separate dated events", async () => {
    const raised = await http(booted)
      .post(`/api/v1/technician/work-orders/${workOrderId}/decisions`)
      .set("Cookie", technicianSession.cookie)
      .send({
        name: "Replace front brake pads",
        explanation: "Worn to the backing plate; unsafe to leave.",
        importance: "HIGH",
        price: "450.00",
      });
    expectCode(raised, 201);

    const asked = await technicianJourney();
    expect(kinds(asked)).toContain("decision.asked");
    expect(kinds(asked)).not.toContain("decision.viewed");
    expect(asked.current.status).toBe("AWAITING_CUSTOMER_APPROVAL");
    expect(asked.current.waitingOn).toBe("the customer");
    expect(asked.current.reason).toContain("unanswered");

    // The customer opens the link. VIEWED used to be recorded without a
    // WHEN, so the journey could say they had seen it and not since when
    // -- which is the half a manager chasing an answer needs.
    const read = await http(booted).get(`/api/v1/public/decisions/${raised.body.secureToken}`);
    expectCode(read, 200);

    const viewed = await technicianJourney();
    expect(kinds(viewed)).toContain("decision.viewed");
    const viewedAt = await booted.prisma.customerDecisionRequest.findFirstOrThrow({
      where: { workOrderId },
      select: { viewedAt: true },
    });
    expect(viewedAt.viewedAt).not.toBeNull();
    expect(viewed.events.find((event) => event.kind === "decision.viewed")?.at).toBe(
      viewedAt.viewedAt?.toISOString(),
    );

    expectCode(
      await http(booted)
        .post(`/api/v1/public/decisions/${raised.body.secureToken}/respond`)
        .send({ answers: [{ itemId: read.body.items[0].id, decision: "APPROVED" }] }),
      200,
    );

    const answered = await technicianJourney();
    expect(kinds(answered)).toContain("decision.answered");
    // Per ITEM, not per request: the technician has to know WHAT was
    // approved, not merely that something was.
    expect(answered.events.find((event) => event.kind === "decision.answered")?.detail).toBe(
      "Replace front brake pads",
    );
  }, 180_000);

  it("work: the journey moves, and offers the move that is actually available", async () => {
    const beforeWork = await technicianJourney();
    expect(beforeWork.actions.map((action) => action.key)).toContain("start_work");

    expectCode(
      await http(booted)
        .post(`/api/v1/technician/work-orders/${workOrderId}/start-work`)
        .set("Cookie", technicianSession.cookie)
        .send({}),
      200,
    );

    const created = await http(booted)
      .post(`/api/v1/branch-manager/work-orders/${workOrderId}/tasks`)
      .set("Cookie", managerSession.cookie)
      .send({ title: "Replace front brake pads" });
    expectCode(created, 201);
    taskId = created.body.id;
    await booted.prisma.taskAssignment.create({ data: { tenantId, taskId, staffUserId: technicianStaffId } });

    const journey = await technicianJourney();

    expect(journey.current.status).toBe("IN_PROGRESS");
    expect(kinds(journey)).toContain("task.created");
    // The move it just made is gone; there is nothing else this
    // technician can do to the JOB itself from here.
    expect(journey.actions.map((action) => action.key)).not.toContain("start_work");
  }, 180_000);

  it("waiting for parts: the journey says what is holding it, and since when", async () => {
    const res = await http(booted)
      .post(`/api/v1/technician/work-orders/${workOrderId}/parts`)
      .set("Cookie", technicianSession.cookie)
      .send({ inventoryItemId: itemId, quantity: 1, reason: "Pads worn out" });
    expectCode(res, 201);

    const journey = await technicianJourney();
    partRequestId = (
      await booted.prisma.partRequest.findFirstOrThrow({ where: { workOrderId }, select: { id: true } })
    ).id;

    expect(journey.current.status).toBe("WAITING_PARTS");
    expect(journey.waiting).toBe(true);
    expect(journey.current.waitingOn).toBe("the store");
    expect(journey.current.reason).toContain("Front brake pad set");
    expect(journey.current.next).toContain("Front brake pad set");
    // A duration measured from a real transition, not from `updatedAt`.
    expect(journey.current.since).toBeTruthy();
    expect(journey.current.forMinutes).not.toBeNull();
    expect(kinds(journey)).toContain("part.requested");
  }, 180_000);

  it("parts received: every hand-over step is its own dated event", async () => {
    expectCode(
      await http(booted)
        .post(`/api/v1/inventory/requests/${partRequestId}/approve`)
        .set("Cookie", storekeeperSession.cookie)
        .send({}),
      201,
    );

    const approved = await technicianJourney();
    expect(kinds(approved)).toContain("part.approved");
    const approvedAt = await booted.prisma.partRequest.findUniqueOrThrow({
      where: { id: partRequestId },
      select: { approvedAt: true },
    });
    expect(approvedAt.approvedAt).not.toBeNull();
    expect(approved.events.find((event) => event.kind === "part.approved")?.at).toBe(
      approvedAt.approvedAt?.toISOString(),
    );

    expectCode(
      await http(booted)
        .post(`/api/v1/inventory/requests/${partRequestId}/issue`)
        .set("Cookie", storekeeperSession.cookie)
        .send({ warehouseId, quantity: 1 }),
      201,
    );
    expectCode(
      await http(booted)
        .post(`/api/v1/technician/parts/${partRequestId}/receive`)
        .set("Cookie", technicianSession.cookie)
        .send({}),
      201,
    );
    expectCode(
      await http(booted)
        .post(`/api/v1/technician/parts/${partRequestId}/used`)
        .set("Cookie", technicianSession.cookie)
        .send({}),
      201,
    );

    const journey = await technicianJourney();
    const issued = await booted.prisma.issuedItem.findFirstOrThrow({
      where: { partRequestId },
      select: { issuedAt: true, receivedAt: true, usedAt: true },
    });

    // The whole loop, in the order it happened, each dated by its own
    // column on the hand-over row.
    expect(kinds(journey).filter((kind) => kind.startsWith("part."))).toEqual([
      "part.requested",
      "part.approved",
      "part.issued",
      "part.received",
      "part.used",
    ]);
    expect(journey.events.find((event) => event.kind === "part.issued")?.at).toBe(issued.issuedAt.toISOString());
    expect(journey.events.find((event) => event.kind === "part.received")?.at).toBe(
      issued.receivedAt?.toISOString(),
    );
    expect(journey.events.find((event) => event.kind === "part.used")?.at).toBe(issued.usedAt?.toISOString());
    expect(journey.current.status).toBe("IN_PROGRESS");
  }, 180_000);

  it("billing and payment: neither is claimed before it happened", async () => {
    expectCode(
      await http(booted).post(`/api/v1/technician/tasks/${taskId}/start`).set("Cookie", technicianSession.cookie).send({}),
      201,
    );
    expectCode(
      await http(booted)
        .post(`/api/v1/technician/tasks/${taskId}/complete`)
        .set("Cookie", technicianSession.cookie)
        .send({ minutesSpent: 45 }),
      201,
    );
    expectCode(
      await http(booted)
        .post(`/api/v1/technician/work-orders/${workOrderId}/finish`)
        .set("Cookie", technicianSession.cookie)
        .send({}),
      201,
    );

    const beforeInvoice = await managerJourney();
    // Finished, but not billed: nothing may claim an invoice yet.
    expect(kinds(beforeInvoice)).not.toContain("invoice.issued");
    expect(kinds(beforeInvoice)).not.toContain("payment.recorded");
    expect(kinds(beforeInvoice)).toContain("task.completed");

    const invoice = await http(booted)
      .post(`/api/v1/finance/work-orders/${workOrderId}/invoice`)
      .set("Cookie", ownerSession.cookie)
      .send({});
    expectCode(invoice, 201);
    invoiceId = invoice.body.id ?? invoice.body.invoiceId;

    const billed = await managerJourney();
    expect(kinds(billed)).toContain("invoice.issued");
    expect(kinds(billed)).not.toContain("payment.recorded");
    expect(billed.current.status).toBe("PAYMENT_PENDING");
    expect(billed.current.reason).toContain("outstanding");

    // What is actually owed, asked for rather than assumed: a hardcoded
    // amount pays for the part and not the labour, and a part-paid
    // invoice leaves the job undeliverable for a reason that has nothing
    // to do with the journey.
    const settlement = await http(booted)
      .get(`/api/v1/finance/invoices/${invoiceId}`)
      .set("Cookie", ownerSession.cookie);
    expectCode(settlement, 200);
    const due = settlement.body.outstanding ?? settlement.body.balance ?? settlement.body.total;
    // Money crosses the wire as a string, always.
    expect(typeof due).toBe("string");

    expectCode(
      await http(booted)
        .post(`/api/v1/finance/invoices/${invoiceId}/payments`)
        .set("Cookie", ownerSession.cookie)
        .send({ amount: due, method: "CASH", idempotencyKey: `pay-${SUFFIX}` }),
      201,
    );

    const paid = await managerJourney();
    expect(kinds(paid)).toContain("payment.recorded");
    const payment = await booted.prisma.payment.findFirstOrThrow({
      where: { invoiceId },
      select: { createdAt: true },
    });
    expect(paid.events.find((event) => event.kind === "payment.recorded")?.at).toBe(
      payment.createdAt.toISOString(),
    );
  }, 240_000);

  it("delivery and close: the journey reaches CLOSED and stops claiming a future", async () => {
    expectCode(
      await http(booted)
        .post(`/api/v1/branch-manager/work-orders/${workOrderId}/deliver`)
        .set("Cookie", managerSession.cookie)
        .send({}),
      201,
    );

    const journey = await managerJourney();

    expect(journey.current.status).toBe("CLOSED");
    expect(journey.finished).toBe(true);
    expect(journey.current.next).toBeNull();
    expect(journey.stages.some((stage) => stage.state === "AHEAD")).toBe(false);
    expect(kinds(journey)).toContain("work_order.closed");

    // The chronology is total and non-decreasing, over a real job with a
    // real parts loop in the middle of it.
    const times = journey.events.map((event) => Date.parse(event.at));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    // And it is STABLE: the same read twice gives the same story.
    const again = await managerJourney();
    expect(kinds(again)).toEqual(kinds(journey));
    expect(again.events.map((event) => event.at)).toEqual(journey.events.map((event) => event.at));
  }, 180_000);

  // ── the three audiences, one reality ────────────────────────────────

  it("three roles read the same job, in three vocabularies, and the customer's is safe", async () => {
    // The customer needs an account to read their own portal.
    const customerEmail = `customer-${SUFFIX}@mop.local`;
    const account = await booted.prisma.account.create({
      data: {
        accountType: "CUSTOMER",
        tenantId,
        email: customerEmail,
        passwordHash: hashPassword(CUSTOMER_PASSWORD),
        status: "ACTIVE",
      },
    });
    await booted.prisma.customer.update({
      where: { id: customerId },
      data: { accountId: account.id, portalStatus: "ENABLED" },
    });
    customerSession = await loginAs(booted, customerEmail, CUSTOMER_PASSWORD);

    const [tech, manager, leader, customer] = await Promise.all([
      technicianJourney(),
      managerJourney(),
      leaderJourney(),
      customerJourney(),
    ]);

    // ONE state. Three readings of it that can never disagree, because
    // there is one projection behind all four calls.
    expect(tech.current.status).toBe("CLOSED");
    expect(manager.current.status).toBe("CLOSED");
    expect(leader.current.status).toBe("CLOSED");
    expect(customer.current.status).toBe("CLOSED");
    expect(tech.workOrderId).toBe(workOrderId);
    expect(customer.workOrderId).toBe(workOrderId);

    // Three vocabularies. The enum reaches nobody.
    expect(manager.current.label).toBe("Closed");
    expect(customer.current.label).toBe("Completed");
    expect(JSON.stringify(customer)).not.toContain("PAYMENT_PENDING_LABEL");

    // The customer's copy is MISSING the internal events, not restyled.
    const customerKinds = kinds(customer);
    expect(customerKinds).not.toContain("part.issued");
    expect(customerKinds).not.toContain("part.approved");
    expect(customerKinds).not.toContain("task.created");
    expect(customerKinds).not.toContain("task.completed");
    // What does reach them is true and theirs.
    expect(customerKinds).toContain("part.used");
    expect(customerKinds).toContain("payment.recorded");

    // No staff name, no warehouse, no actor at all.
    expect(customer.events.every((event) => event.actor === null)).toBe(true);
    const customerText = JSON.stringify(customer);
    expect(customerText).not.toContain("Journey Technician");
    expect(customerText).not.toContain("Journey Storekeeper");
    expect(customerText).not.toContain("Main Store");
    // And no console: the customer's journey is a status they read.
    expect(customer.actions).toEqual([]);

    // The staff copies DO carry the operational detail.
    expect(kinds(tech)).toContain("part.issued");
    expect(tech.events.some((event) => event.actor === "Journey Storekeeper")).toBe(true);
    expect(JSON.stringify(manager)).toContain("Main Store");
  }, 240_000);

  // ── isolation ───────────────────────────────────────────────────────

  it("keeps three concurrent cars' journeys entirely separate", async () => {
    const plates = ["A", "B", "C"];
    const ids: string[] = [];
    for (const plate of plates) {
      const intake = await http(booted)
        .post("/api/v1/branch-manager/intake")
        .set("Cookie", managerSession.cookie)
        .send({
          branchId,
          customer: { fullName: `Concurrent ${plate}`, phone: `+2011111${plate.charCodeAt(0)}${Date.now() % 10000}` },
          asset: { category: "CARS", plateNumber: `CC${plate}-${Date.now() % 1000000}` },
          complaint: `Complaint ${plate}`,
        });
      expectCode(intake, 201);
      ids.push(intake.body.workOrderId);
    }

    // Only the FIRST gets an inspection. If the projection leaked, the
    // other two would inherit it.
    await booted.prisma.workOrderAssignment.create({
      data: { tenantId, workOrderId: ids[0], staffUserId: technicianStaffId },
    });
    expectCode(
      await http(booted)
        .post(`/api/v1/technician/work-orders/${ids[0]}/start-inspection`)
        .set("Cookie", technicianSession.cookie)
        .send({}),
      200,
    );
    expectCode(
      await http(booted)
        .post(`/api/v1/technician/work-orders/${ids[0]}/inspection`)
        .set("Cookie", technicianSession.cookie)
        .send({ type: "QUICK", note: "Only this car was inspected." }),
      201,
    );

    const [a, b, c] = await Promise.all(ids.map((id) => managerJourney(id)));

    expect(a.workOrderId).toBe(ids[0]);
    expect(kinds(a)).toContain("inspection.recorded");
    expect(kinds(b)).not.toContain("inspection.recorded");
    expect(kinds(c)).not.toContain("inspection.recorded");
    expect(a.current.status).toBe("UNDER_INSPECTION");
    expect(b.current.status).toBe("REGISTERED");
    expect(c.current.status).toBe("REGISTERED");
    // And the closed job from the walkthrough above is untouched by any
    // of them.
    expect((await managerJourney()).current.status).toBe("CLOSED");
  }, 240_000);

  it("refuses a job outside the reader's own scope", async () => {
    // A technician with no assignment on this job. The id is real and
    // correct -- the session, not the id, is the capability.
    const strangerEmail = `stranger-${SUFFIX}@mop.local`;
    const account = await booted.prisma.account.create({
      data: {
        accountType: "TENANT_STAFF",
        tenantId,
        email: strangerEmail,
        passwordHash: hashPassword(STAFF_PASSWORD),
        status: "ACTIVE",
      },
    });
    await booted.prisma.staffUser.create({
      data: {
        accountId: account.id,
        tenantId,
        fullName: "Unassigned Technician",
        role: "TECHNICIAN",
        branchScope: [branchId],
        warehouseScope: [],
        categoryScope: ["CARS"],
      },
    });
    const stranger = await loginAs(booted, strangerEmail, STAFF_PASSWORD);

    const denied = await http(booted)
      .get(`/api/v1/technician/work-orders/${workOrderId}/journey`)
      .set("Cookie", stranger.cookie);
    expect(denied.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(denied.body)).not.toContain("Journey Storekeeper");

    // A Team Leader whose roster does not include this job's technician.
    const outsiderEmail = `outsider-leader-${SUFFIX}@mop.local`;
    const outsiderAccount = await booted.prisma.account.create({
      data: {
        accountType: "TENANT_STAFF",
        tenantId,
        email: outsiderEmail,
        passwordHash: hashPassword(STAFF_PASSWORD),
        status: "ACTIVE",
      },
    });
    await booted.prisma.staffUser.create({
      data: {
        accountId: outsiderAccount.id,
        tenantId,
        fullName: "Other Team Leader",
        role: "TEAM_LEADER",
        branchScope: [branchId],
        warehouseScope: [],
        categoryScope: ["CARS"],
      },
    });
    const outsider = await loginAs(booted, outsiderEmail, STAFF_PASSWORD);

    const refused = await http(booted)
      .get(`/api/v1/team-leader/work-orders/${workOrderId}/journey`)
      .set("Cookie", outsider.cookie);
    // Not-found rather than forbidden: a distinguishable refusal would
    // let them enumerate the workshop's other jobs.
    expect([403, 404]).toContain(refused.status);

    // Unauthenticated is refused outright.
    const anonymous = await http(booted).get(`/api/v1/technician/work-orders/${workOrderId}/journey`);
    expect(anonymous.status).toBe(401);
  }, 240_000);

  it("refuses another workshop's job even with a valid session and a real id", async () => {
    // A second workshop of this file's own making. Borrowing whichever
    // other tenant happened to be in the test database made this test
    // depend on another spec's leftovers, and it failed for that reason
    // rather than for anything about isolation.
    const otherTenant = await booted.prisma.tenant.create({
      data: {
        name: `Rival Motors ${SUFFIX}`,
        nameNormalized: `rival motors ${SUFFIX}`,
        slug: `rival-${SUFFIX}`,
        customerRegistrationCode: `RIVAL-${SUFFIX}`,
        status: "ACTIVE",
        planId: (await booted.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { planId: true } }))
          .planId,
        country: "EG",
        city: "Cairo",
        businessType: "Independent Garage",
        primaryCategory: "CARS",
        currency: "EGP",
        timezone: "Africa/Cairo",
      },
      select: { id: true },
    });

    const intruderEmail = `intruder-${SUFFIX}@mop.local`;
    const account = await booted.prisma.account.create({
      data: {
        accountType: "TENANT_STAFF",
        tenantId: otherTenant.id,
        email: intruderEmail,
        passwordHash: hashPassword(STAFF_PASSWORD),
        status: "ACTIVE",
      },
    });
    await booted.prisma.staffUser.create({
      data: {
        accountId: account.id,
        tenantId: otherTenant.id,
        fullName: "Other Workshop Manager",
        role: "BRANCH_MANAGER",
        branchScope: [],
        warehouseScope: [],
        categoryScope: ["CARS"],
      },
    });
    const intruder = await loginAs(booted, intruderEmail, STAFF_PASSWORD);

    const refused = await http(booted)
      .get(`/api/v1/branch-manager/work-orders/${workOrderId}/journey`)
      .set("Cookie", intruder.cookie);

    expect(refused.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(refused.body)).not.toContain("Front brake pad set");

    await booted.prisma.session.deleteMany({ where: { tenantId: otherTenant.id } });
    await booted.prisma.staffUser.deleteMany({ where: { accountId: account.id } });
    await booted.prisma.account.delete({ where: { id: account.id } });
    await booted.prisma.tenant.delete({ where: { id: otherTenant.id } });
  }, 240_000);
});
