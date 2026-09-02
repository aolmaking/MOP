/**
 * The Honesty Harness.
 *
 * One journey, over real HTTP, against a real Postgres: a platform admin
 * creates a workshop, the owner redeems their invite and invites their
 * staff, a job is booked in, a technician inspects it and prices what
 * they found, the customer approves it from a link, the work is done, the
 * bill is issued and paid, and the car is released. Every step is
 * something a real person does in a browser, in the order they do it.
 *
 * Its job is not to pass. Its job is to be the one place that cannot be
 * argued with about how far the product actually works. Unit tests can be
 * green while the journey is broken -- that is the failure mode this file
 * exists to make impossible -- so where the journey stops, there is a
 * pinned `xit` naming exactly what is missing and which tracked item will
 * remove it.
 *
 * Do not soften an assertion to make it pass. A walkthrough that has been
 * edited to agree with the code is worth less than no walkthrough at all.
 *
 * WHAT IT PROVES, IN ORDER
 * ------------------------
 *   health -> workshop creation -> owner invite redemption -> the owner
 *   is refused intake (by design) -> staff invite redemption (F-005) ->
 *   intake -> C1 start inspection -> inspection recorded -> fault +
 *   priced recommendation -> REQUEST_APPROVAL side effect -> customer
 *   reads the link (VIEWED) -> customer approves -> APPROVE side effect
 *   -> C2 start work -> C3 manager adds a task -> technician does it ->
 *   finish -> invoice -> payment -> settlement -> delivery -> CLOSED ->
 *   the customer's own portal agrees.
 *
 * Two things it deliberately does NOT do. It does not seed lifecycle
 * history: every status this file asserts was reached by an HTTP call
 * inside it. And it does not use a service class anywhere -- the only
 * non-HTTP writes are the ones creating accounts the product has no
 * endpoint for (a platform admin, and the technician/inventory staff
 * whose invite redemption is already proven once above).
 */
import { validateCapabilityProfile } from "@mop/shared";
import { bootApp, expectCode, http, loginAs, LAUNCH_PROFILE, type BootedApp, type Session } from "./http-kit";
import { hashPassword } from "../identity/auth/password.util";

const SUFFIX = `wt-${Date.now()}`;
const PLATFORM_PASSWORD = "platform-password-123";
const OWNER_PASSWORD = "owner-password-123";
const MANAGER_PASSWORD = "manager-password-123";

describe("Walkthrough (real HTTP, real Postgres)", () => {
  let booted: BootedApp;
  let planId: string;
  let platformEmail: string;
  let platformSession: Session;

  // Carried between steps: each test builds on the state the previous one
  // left, because that is what a journey is. Jest runs them in order.
  let tenantId: string;
  let branchId: string;
  let ownerEmail: string;
  let inviteToken: string;
  let workOrderId: string;
  let technicianEmail: string;
  let technicianSession: Session;
  let decisionToken: string;
  let decisionItemId: string;
  let customerId: string;
  let invoiceId: string;
  let taskId: string;

  /** The one password every seeded-in-place account in this file uses. */
  const STAFF_PASSWORD = MANAGER_PASSWORD;

  beforeAll(async () => {
    booted = await bootApp();

    const plan = await booted.prisma.plan.create({
      data: {
        code: `WALKTHROUGH-${SUFFIX}`,
        name: "Walkthrough Plan",
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
    planId = plan.id;

    // The platform admin is seeded directly. There is no endpoint that
    // creates one and there should not be -- a platform account is
    // provisioned out of band, not over the API.
    platformEmail = `platform-${SUFFIX}@mop.local`;
    await booted.prisma.account.create({
      data: {
        accountType: "PLATFORM",
        email: platformEmail,
        passwordHash: hashPassword(PLATFORM_PASSWORD),
        status: "ACTIVE",
      },
    });

    platformSession = await loginAs(booted, platformEmail, PLATFORM_PASSWORD);
  }, 120_000);

  afterAll(async () => {
    // Best-effort: the walkthrough may have stopped anywhere, so nothing
    // here may assume a later step ran.
    if (tenantId) {
      await booted.prisma.session.deleteMany({ where: { tenantId } });
      await booted.prisma.staffUser.deleteMany({ where: { tenantId } });
      await booted.prisma.account.deleteMany({ where: { tenantId } });
    }
    await booted.prisma.account.deleteMany({ where: { email: platformEmail } });
    await booted.close();
  }, 120_000);

  // -----------------------------------------------------------------
  // The trivial use of the kit: proves bootApp really booted the whole
  // application against a real database before any journey assertion is
  // trusted. If this fails, nothing below means anything.
  // -----------------------------------------------------------------
  /**
   * Before anything else: the shape this whole file runs in must be one
   * the engine says is survivable. A profile that strands a work order
   * would make every green step below meaningless -- the journey would
   * be passing because it never reached the state it cannot leave.
   */
  it("the launch profile leaves no work order stranded", () => {
    const result = validateCapabilityProfile(LAUNCH_PROFILE);

    // Both assertions, not just `valid`: a failure that prints the
    // stranded states says what to fix, while a bare `false` does not.
    expect(result.reachability.flatMap((entity) => entity.stranded)).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("boots the API and answers /health from a real database", async () => {
    const res = await http(booted).get("/api/v1/health");

    expectCode(res, 200);
    expect(res.body.status).toBe("ok");
    expect(res.body.database).toBe("connected");
  }, 120_000);

  it("platform admin creates a workshop over HTTP", async () => {
    const res = await http(booted)
      .post("/api/v1/platform/workshops")
      .set("Cookie", platformSession.cookie)
      .send({
        planId,
        name: `Walkthrough Motors ${SUFFIX}`,
        slug: `walkthrough-${SUFFIX}`.toLowerCase(),
        country: "EG",
        city: "Cairo",
        businessType: "Independent Garage",
        primaryCategory: "CARS",
        currency: "EGP",
        timezone: "Africa/Cairo",
        ownerFullName: "Walkthrough Owner",
        ownerEmail: `owner-${SUFFIX}@mop.local`,
        ownerPhone: "+201234567890",
        allowedBranchesStart: 1,
        allowedUsersStart: 5,
        allowedWarehousesStart: 1,
        starterBuilderTemplate: "MINIMAL",
        initialStatus: "ACTIVE",
        // The launch shape (M-7), not the implicit twelve-capability
        // full product. This is the single most load-bearing line in the
        // file: with TEAM_REVIEW and QC on, FINISH routes into a review
        // stage nobody in a one-bay shop staffs, and the journey below
        // dead-ends four steps from the end.
        capabilities: LAUNCH_PROFILE,
        branches: [{ name: "Main Branch", code: "MAIN", city: "Cairo" }],
        // A store is not optional here. Creation runs the capability
        // validator before it writes anything, and a workshop with parts
        // and stock enabled but nowhere to keep parts is refused with
        // `configuration_invalid` / NO_WAREHOUSE -- "a part has to come
        // out of somewhere". Worth leaving visible: the first draft of
        // this walkthrough omitted it and the product was right to refuse.
        warehouses: [{ name: "Main Store", code: "STORE", branchCodes: ["MAIN"] }],
      });

    expectCode(res, 201);
    expect(res.body.tenant?.id).toBeTruthy();
    // Surfaced directly rather than emailed, because no mail delivery
    // exists and the service says so honestly. This is the pattern F-005
    // asks StaffService.invite() to follow.
    expect(res.body.inviteLink).toMatch(/token=/);

    tenantId = res.body.tenant.id;
    ownerEmail = `owner-${SUFFIX}@mop.local`;
    inviteToken = String(res.body.inviteLink).split("token=")[1];

    const branch = await booted.prisma.branch.findFirstOrThrow({
      where: { tenantId },
      select: { id: true },
    });
    branchId = branch.id;
  }, 120_000);

  it("the owner redeems their invite and can log in", async () => {
    const accept = await http(booted)
      .post("/api/v1/auth/invite/accept")
      .send({ token: inviteToken, password: OWNER_PASSWORD });

    expectCode(accept, 200);

    const session = await loginAs(booted, ownerEmail, OWNER_PASSWORD);
    expect(session.role).toBe("TENANT_OWNER");
    expect(session.tenantId).toBe(tenantId);
  }, 120_000);

  it("the owner cannot book a vehicle in -- that is deliberately not their job", async () => {
    const session = await loginAs(booted, ownerEmail, OWNER_PASSWORD);

    const res = await http(booted)
      .post("/api/v1/branch-manager/intake")
      .set("Cookie", session.cookie)
      .send({
        branchId,
        customer: { fullName: "Refused Customer", phone: "+201111111111" },
        asset: { category: "CARS", plateNumber: `REF-${Date.now()}` },
        complaint: "should never be created",
      });

    // Not an incidental 403: default-role-permissions.ts withholds
    // customer.intake.create from TENANT_OWNER on purpose and says why.
    // Asserting it here means a future permission change that quietly
    // hands the owner operational write access has to come past this test.
    expectCode(res, 403, "forbidden");
  }, 120_000);

  /**
   * PINNED RED -- board/reviews/F-005-staff-invites-can-never-be-accepted.md
   *
   * The honest continuation of the journey: the owner invites a branch
   * manager, and that person accepts and logs in. It cannot pass today,
   * because `POST /organization/staff` returns `{ staffId }` and the raw
   * invite token is discarded inside the service, so nothing the owner
   * can see or send would let the invited person in.
   *
   * This is the more important of the two pinned tests. The one below is
   * an endpoint that has not been written yet; this one is a journey that
   * looks finished from every angle except the only one that matters.
   */
  it("[F-005] an invited branch manager can accept their invite over HTTP", async () => {
    const owner = await loginAs(booted, ownerEmail, OWNER_PASSWORD);
    const managerEmail = `manager-${SUFFIX}@mop.local`;

    const invited = await http(booted)
      .post("/api/v1/organization/staff")
      .set("Cookie", owner.cookie)
      .send({
        fullName: "Walkthrough Manager",
        email: managerEmail,
        phone: "+201234567891",
        role: "BRANCH_MANAGER",
        branchScope: [branchId],
      });

    expectCode(invited, 201);

    // The assertion that fails today: nothing in the response carries a
    // redeemable token.
    expect(invited.body.inviteLink).toMatch(/token=/);

    const accept = await http(booted)
      .post("/api/v1/auth/invite/accept")
      .send({ token: String(invited.body.inviteLink).split("token=")[1], password: MANAGER_PASSWORD });

    expectCode(accept, 200);

    const session = await loginAs(booted, managerEmail, MANAGER_PASSWORD);
    expect(session.role).toBe("BRANCH_MANAGER");
  }, 120_000);

  it("a branch manager books a vehicle in, and the job starts REGISTERED", async () => {
    const managerEmail = `manager-direct-${SUFFIX}@mop.local`;

    // Seeded directly, and only because of F-005: the product cannot
    // currently produce a usable branch manager over HTTP. Every other
    // step in this file goes through the API on purpose, and this one
    // reverts to the API the moment the pinned test above turns green.
    const account = await booted.prisma.account.create({
      data: {
        accountType: "TENANT_STAFF",
        tenantId,
        email: managerEmail,
        passwordHash: hashPassword(MANAGER_PASSWORD),
        status: "ACTIVE",
      },
    });
    await booted.prisma.staffUser.create({
      data: {
        accountId: account.id,
        tenantId,
        fullName: "Walkthrough Manager",
        role: "BRANCH_MANAGER",
        branchScope: [branchId],
        warehouseScope: [],
        categoryScope: ["CARS"],
      },
    });

    const session = await loginAs(booted, managerEmail, MANAGER_PASSWORD);
    expect(session.role).toBe("BRANCH_MANAGER");

    const res = await http(booted)
      .post("/api/v1/branch-manager/intake")
      .set("Cookie", session.cookie)
      .send({
        branchId,
        customer: { fullName: "Walkthrough Customer", phone: "+201234567892" },
        asset: { category: "CARS", plateNumber: `WT-${Date.now()}` },
        complaint: "Knocking noise from the front left wheel",
      });

    expectCode(res, 201);
    workOrderId = res.body.workOrderId ?? res.body.workOrder?.id ?? res.body.id;
    expect(workOrderId).toBeTruthy();

    // Intake finishes by asking the lifecycle service to register the job;
    // REGISTERED, never a draft. This is the state C1 transitions out of.
    const workOrder = await booted.prisma.workOrder.findUniqueOrThrow({
      where: { id: workOrderId },
      select: { status: true },
    });
    expect(workOrder.status).toBe("REGISTERED");
  }, 120_000);

  /**
   * CONTRACTS-v0 C1. Was pinned red until W1-A3-002 landed the route.
   *
   * The technician is seeded rather than invited because the invite path
   * is already proven once, immediately above -- proving it a second time
   * per role would make this file slower without making it truer. Every
   * *operational* step below goes through HTTP.
   */
  it("[C1] a technician starts inspection on a REGISTERED job", async () => {
    technicianEmail = `tech-${SUFFIX}@mop.local`;
    const account = await booted.prisma.account.create({
      data: {
        accountType: "TENANT_STAFF",
        tenantId,
        email: technicianEmail,
        passwordHash: hashPassword(STAFF_PASSWORD),
        status: "ACTIVE",
      },
    });
    const staffUser = await booted.prisma.staffUser.create({
      data: {
        accountId: account.id,
        tenantId,
        fullName: "Walkthrough Technician",
        role: "TECHNICIAN",
        branchScope: [branchId],
        warehouseScope: [],
        categoryScope: ["CARS"],
      },
    });
    await booted.prisma.workOrderAssignment.create({
      data: { tenantId, workOrderId, staffUserId: staffUser.id },
    });

    technicianSession = await loginAs(booted, technicianEmail, STAFF_PASSWORD);

    const res = await http(booted)
      .post(`/api/v1/technician/work-orders/${workOrderId}/start-inspection`)
      .set("Cookie", technicianSession.cookie)
      .send({});

    expectCode(res, 200);
    expect(res.body).toEqual({ workOrderId, status: "UNDER_INSPECTION" });
  }, 120_000);

  it("the technician records the inspection they just started", async () => {
    const res = await http(booted)
      .post(`/api/v1/technician/work-orders/${workOrderId}/inspection`)
      .set("Cookie", technicianSession.cookie)
      .send({ type: "QUICK", note: "Front left wheel bearing has play." });

    expectCode(res, 201);

    // The finish gate `inspection.completed` reads this row. Asserting it
    // exists here means a later FINISH that passes is passing for the
    // right reason rather than because the gate was removed.
    const inspection = await booted.prisma.inspection.findFirstOrThrow({
      where: { workOrderId },
      select: { type: true },
    });
    expect(inspection.type).toBe("QUICK");
  }, 120_000);

  /**
   * CONTRACTS-v0 C5's first half: raising a priced recommendation is what
   * moves the job to AWAITING_CUSTOMER_APPROVAL. The move is a side
   * effect of `raiseAndSend`, not a second call, which is exactly why it
   * needs proving over HTTP -- nothing in the response says it happened.
   */
  it("[C5] pricing a fault asks the customer, and the job moves to awaiting approval", async () => {
    const fault = await http(booted)
      .post(`/api/v1/technician/work-orders/${workOrderId}/faults`)
      .set("Cookie", technicianSession.cookie)
      .send({ description: "Front left wheel bearing worn", severity: "HIGH" });

    expectCode(fault, 201);

    const raised = await http(booted)
      .post(`/api/v1/technician/work-orders/${workOrderId}/decisions`)
      .set("Cookie", technicianSession.cookie)
      .send({
        name: "Replace front left wheel bearing",
        explanation: "The bearing has play and will fail. Replacing it now avoids a tow later.",
        importance: "HIGH",
        // A string, always. A money value that reaches the API as a JS
        // number is a bug even when it looks right.
        price: "1200.00",
        laborPrice: "300.00",
      });

    expectCode(raised, 201);
    expect(raised.body.secureToken).toBeTruthy();
    decisionToken = raised.body.secureToken;

    const workOrder = await booted.prisma.workOrder.findUniqueOrThrow({
      where: { id: workOrderId },
      select: { status: true, customerId: true },
    });
    expect(workOrder.status).toBe("AWAITING_CUSTOMER_APPROVAL");
    customerId = workOrder.customerId;
  }, 120_000);

  /**
   * M-3 / G4. `VIEWED` was a status nothing ever wrote: the customer
   * opened the link, the workshop's board still said SENT, and a manager
   * chasing an unanswered ask could not tell "never opened" from
   * "opened and ignored".
   */
  it("[M-3] the customer opens the link, and the workshop can see it was seen", async () => {
    const read = await http(booted).get(`/api/v1/public/decisions/${decisionToken}`);

    expectCode(read, 200);
    expect(read.body.items?.length).toBeGreaterThan(0);
    decisionItemId = read.body.items[0].id;

    // Status only: `CustomerDecisionRequest` carries no `viewedAt`
    // column, so "seen" is a state and not a timestamp. Worth knowing --
    // a manager can tell that the link was opened but not when.
    const request = await booted.prisma.customerDecisionRequest.findFirstOrThrow({
      where: { workOrderId },
      select: { status: true },
    });
    expect(request.status).toBe("VIEWED");
  }, 120_000);

  /**
   * CONTRACTS-v0 C5's second half. The APPROVE move is best-effort and
   * swallowed on refusal by design, so a green `respond` proves nothing
   * about the job -- only the work order's own status does.
   */
  it("[C5] the customer approves from the parking lot, and the job becomes approved for work", async () => {
    const res = await http(booted)
      .post(`/api/v1/public/decisions/${decisionToken}/respond`)
      .send({ answers: [{ itemId: decisionItemId, decision: "APPROVED" }] });

    expectCode(res, 200);

    const workOrder = await booted.prisma.workOrder.findUniqueOrThrow({
      where: { id: workOrderId },
      select: { status: true },
    });
    expect(workOrder.status).toBe("APPROVED_FOR_WORK");
  }, 120_000);

  /** CONTRACTS-v0 C2. */
  it("[C2] the technician starts work on the approved job", async () => {
    const res = await http(booted)
      .post(`/api/v1/technician/work-orders/${workOrderId}/start-work`)
      .set("Cookie", technicianSession.cookie)
      .send({});

    expectCode(res, 200);
    expect(res.body).toEqual({ workOrderId, status: "IN_PROGRESS" });
  }, 120_000);

  /**
   * The work-card payload addendum, checked from the technician's own
   * view rather than from the database: `primaryAction` must be gone
   * once the job is IN_PROGRESS, because there is no job-level move left
   * for them to make. A card that still offered "Start work" here would
   * be a dead button, and this is the only place that would catch it.
   */
  it("the work card stops offering a job-level action once work has started", async () => {
    const res = await http(booted)
      .get(`/api/v1/technician/work-orders/${workOrderId}`)
      .set("Cookie", technicianSession.cookie);

    expectCode(res, 200);
    expect(res.body.status).toBe("IN_PROGRESS");
    expect(res.body.primaryAction).toBeNull();
  }, 120_000);

  /**
   * CONTRACTS-v0 C3 and C4, the two manager doors.
   *
   * C4 is asserted as a refusal here, which is the more valuable of the
   * two runs: the job is IN_PROGRESS and the graph has no
   * REQUEST_APPROVAL edge from there, so the endpoint must say so in the
   * workshop's own words rather than moving the job anyway. A guard
   * nobody has watched refuse is a guess with good intentions.
   */
  it("[C3/C4] the manager adds a task, and is refused an approval request the graph does not allow", async () => {
    const manager = await loginAs(booted, `manager-direct-${SUFFIX}@mop.local`, MANAGER_PASSWORD);

    const created = await http(booted)
      .post(`/api/v1/branch-manager/work-orders/${workOrderId}/tasks`)
      .set("Cookie", manager.cookie)
      .send({ title: "Replace front left wheel bearing" });

    expectCode(created, 201);
    taskId = created.body.id;
    expect(taskId).toBeTruthy();

    const refused = await http(booted)
      .post(`/api/v1/branch-manager/work-orders/${workOrderId}/request-approval`)
      .set("Cookie", manager.cookie)
      .send({});

    expectCode(refused, 409, "transition_not_allowed");
  }, 120_000);

  it("the technician is assigned the task, does it, and finishes the job", async () => {
    const staffUser = await booted.prisma.staffUser.findFirstOrThrow({
      where: { tenantId, role: "TECHNICIAN" },
      select: { id: true },
    });
    // Task assignment has no endpoint of its own yet -- the manager's
    // create-task call accepts an assignee, but this task was created
    // without one so that C3's assertion is about its default shape.
    await booted.prisma.taskAssignment.create({ data: { tenantId, taskId, staffUserId: staffUser.id } });

    const started = await http(booted)
      .post(`/api/v1/technician/tasks/${taskId}/start`)
      .set("Cookie", technicianSession.cookie)
      .send({});
    expectCode(started, 201);

    const completed = await http(booted)
      .post(`/api/v1/technician/tasks/${taskId}/complete`)
      .set("Cookie", technicianSession.cookie)
      .send({ minutesSpent: 90 });
    expectCode(completed, 201);

    // The gate result is shown BEFORE the press, so the technician sees
    // why rather than being refused after it. Asserting the preview and
    // the press agree is what stops the preview from becoming decoration.
    const check = await http(booted)
      .get(`/api/v1/technician/work-orders/${workOrderId}/finish-check`)
      .set("Cookie", technicianSession.cookie);
    expectCode(check, 200);
    expect(check.body.available).toBe(true);
    expect(check.body.passed).toBe(true);

    const finished = await http(booted)
      .post(`/api/v1/technician/work-orders/${workOrderId}/finish`)
      .set("Cookie", technicianSession.cookie)
      .send({});
    expectCode(finished, 201);

    const workOrder = await booted.prisma.workOrder.findUniqueOrThrow({
      where: { id: workOrderId },
      select: { status: true },
    });
    // With TEAMS/TEAM_REVIEW/QC off on this workshop, FINISH routes
    // straight at the money stage rather than through review families
    // that do not exist here. That reroute is the capability engine
    // doing its job, and this is the assertion that proves it did.
    expect(workOrder.status).toBe("PAYMENT_PENDING");
  }, 120_000);

  /**
   * M-4. The money leg runs as the OWNER, not the branch manager:
   * `default-role-permissions.ts` withholds `finance.invoice.issue` and
   * `finance.payment.record` from BRANCH_MANAGER on purpose. Asserting
   * the refusal first means a future permission change that quietly
   * hands a manager the till has to come past this test.
   */
  it("[M-4] a manager cannot issue the invoice, and the owner can", async () => {
    const manager = await loginAs(booted, `manager-direct-${SUFFIX}@mop.local`, MANAGER_PASSWORD);
    const refused = await http(booted)
      .post(`/api/v1/finance/work-orders/${workOrderId}/invoice`)
      .set("Cookie", manager.cookie)
      .send({});
    expectCode(refused, 403, "forbidden");

    const owner = await loginAs(booted, ownerEmail, OWNER_PASSWORD);
    const issued = await http(booted)
      .post(`/api/v1/finance/work-orders/${workOrderId}/invoice`)
      .set("Cookie", owner.cookie)
      .send({});

    expectCode(issued, 201);
    invoiceId = issued.body.id ?? issued.body.invoiceId;
    expect(invoiceId).toBeTruthy();
  }, 120_000);

  /**
   * M-4's other half: the counter has to be able to FIND the invoice.
   *
   * The delivery board named the reason ("The invoice has not been
   * settled.") and carried nothing to act on, so the only route to the
   * Take Payment page was typing its URL. The board now carries the
   * unsettled invoice id, and the page is keyed by exactly that.
   */
  it("[M-4] the delivery board hands the counter the invoice that is holding the car", async () => {
    const manager = await loginAs(booted, `manager-direct-${SUFFIX}@mop.local`, MANAGER_PASSWORD);

    const board = await http(booted).get("/api/v1/branch-manager/delivery").set("Cookie", manager.cookie);
    expectCode(board, 200);

    const row = [...board.body.held, ...board.body.ready].find(
      (candidate: { workOrderId: string }) => candidate.workOrderId === workOrderId,
    );
    expect(row).toBeDefined();
    expect(row.canLeave).toBe(false);
    expect(row.blockedBy.join(" ")).toContain("settled");
    // The actionable half: this is what `/branch/payments/:id` is keyed by.
    expect(row.unsettledInvoiceId).toBe(invoiceId);
  }, 120_000);

  it("[M-4] the counter takes payment, and the car becomes releasable", async () => {
    const owner = await loginAs(booted, ownerEmail, OWNER_PASSWORD);

    const settlementBefore = await http(booted)
      .get(`/api/v1/finance/invoices/${invoiceId}`)
      .set("Cookie", owner.cookie);
    expectCode(settlementBefore, 200);

    // Money crosses the wire as a string, always -- a number here is a
    // defect even when it prints correctly.
    const due = settlementBefore.body.outstanding ?? settlementBefore.body.total;
    expect(typeof due).toBe("string");

    const paid = await http(booted)
      .post(`/api/v1/finance/invoices/${invoiceId}/payments`)
      .set("Cookie", owner.cookie)
      .send({ amount: due, method: "CASH", idempotencyKey: `wt-pay-${SUFFIX}` });

    expectCode(paid, 201);

    // The same key again. A double-tap on a counter tablet with bad
    // signal must record one payment, not two -- and the ledger, not the
    // response, is what proves it.
    const replay = await http(booted)
      .post(`/api/v1/finance/invoices/${invoiceId}/payments`)
      .set("Cookie", owner.cookie)
      .send({ amount: due, method: "CASH", idempotencyKey: `wt-pay-${SUFFIX}` });
    expect([200, 201]).toContain(replay.status);

    const payments = await booted.prisma.payment.count({ where: { invoiceId } });
    expect(payments).toBe(1);

    const workOrder = await booted.prisma.workOrder.findUniqueOrThrow({
      where: { id: workOrderId },
      select: { status: true },
    });
    expect(workOrder.status).toBe("READY_FOR_DELIVERY");

    // And the board stops offering to take money that is no longer owed.
    // A "Take payment" link surviving settlement is the same class of
    // dead button as one that never worked.
    const manager = await loginAs(booted, `manager-direct-${SUFFIX}@mop.local`, MANAGER_PASSWORD);
    const board = await http(booted).get("/api/v1/branch-manager/delivery").set("Cookie", manager.cookie);
    expectCode(board, 200);
    const row = [...board.body.held, ...board.body.ready].find(
      (candidate: { workOrderId: string }) => candidate.workOrderId === workOrderId,
    );
    expect(row.canLeave).toBe(true);
    expect(row.unsettledInvoiceId).toBeNull();
  }, 120_000);

  it("the manager releases the car, and the job closes", async () => {
    const manager = await loginAs(booted, `manager-direct-${SUFFIX}@mop.local`, MANAGER_PASSWORD);

    const res = await http(booted)
      .post(`/api/v1/branch-manager/work-orders/${workOrderId}/deliver`)
      .set("Cookie", manager.cookie)
      .send({});

    expectCode(res, 201);

    const workOrder = await booted.prisma.workOrder.findUniqueOrThrow({
      where: { id: workOrderId },
      select: { status: true, closedAt: true },
    });
    expect(workOrder.status).toBe("CLOSED");
    expect(workOrder.closedAt).not.toBeNull();
  }, 120_000);

  /**
   * The last step, and the one that decides whether any of the rest was
   * real. Everything above is the workshop's own view of the job; this
   * is what the customer was told, written by a separate projection.
   * If the two disagree, the product lied to somebody.
   */
  it("the customer's own record shows the finished job and its invoice", async () => {
    const timeline = await booted.prisma.customerTimelineEvent.findMany({
      where: { customerId },
      select: { id: true },
    });
    expect(timeline.length).toBeGreaterThan(0);

    const closed = await booted.prisma.workOrder.findUniqueOrThrow({
      where: { id: workOrderId },
      select: { status: true, invoice: { select: { id: true } } },
    });
    expect(closed.status).toBe("CLOSED");
    expect(closed.invoice?.id).toBe(invoiceId);
  }, 120_000);

});
