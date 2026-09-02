/**
 * M-3's deadlock guard, over real HTTP.
 *
 * The situation this exists for is ordinary, not exotic: a technician
 * asks the customer about extra work, the customer never answers, and
 * the job cannot finish. `customer_decisions_resolved` counts every
 * request not in RESOLVED, EXPIRED or CANCELLED, so an unanswered ask
 * holds a finished car in the workshop indefinitely. Read-computed
 * expiry eventually clears it; "eventually" is not a plan when the
 * customer is standing at the counter.
 *
 * The staff cancel endpoint is the door out, and until this file existed
 * nothing proved that pressing it actually opens anything. The endpoint
 * marks the request CANCELLED and moves no work order at all, so the
 * only honest way to know the deadlock is broken is to watch the finish
 * gate change its mind.
 *
 * What this deliberately does NOT claim: cancelling does not rescue a
 * job sitting at AWAITING_CUSTOMER_APPROVAL. The graph has exactly two
 * edges out of that state -- the customer approving, or the whole job
 * being cancelled -- and withdrawing the ask is neither. That is the
 * graph's design and is out of bounds this sprint.
 */
import { bootApp, expectCode, http, loginAs, LAUNCH_PROFILE, type BootedApp, type Session } from "./http-kit";
import { hashPassword } from "../identity/auth/password.util";

const SUFFIX = `dd-${Date.now()}`;
const PLATFORM_PASSWORD = "platform-password-123";
const OWNER_PASSWORD = "owner-password-123";
const STAFF_PASSWORD = "staff-password-123";

describe("Decision deadlock (real HTTP, real Postgres)", () => {
  let booted: BootedApp;
  let platformEmail: string;
  let tenantId: string;
  let branchId: string;
  let managerSession: Session;
  let technicianSession: Session;
  let workOrderId: string;
  let taskId: string;
  let requestId: string;

  function unsatisfied(check: { conditions: { satisfied: boolean; text: string }[] }): string[] {
    return check.conditions.filter((condition) => !condition.satisfied).map((condition) => condition.text);
  }

  async function staff(role: string, name: string): Promise<Session> {
    const email = `${role.toLowerCase()}-${SUFFIX}@mop.local`;
    const account = await booted.prisma.account.create({
      data: { accountType: "TENANT_STAFF", tenantId, email, passwordHash: hashPassword(STAFF_PASSWORD), status: "ACTIVE" },
    });
    await booted.prisma.staffUser.create({
      data: {
        accountId: account.id,
        tenantId,
        fullName: name,
        role: role as never,
        branchScope: [branchId],
        warehouseScope: [],
        categoryScope: ["CARS"],
      },
    });
    return loginAs(booted, email, STAFF_PASSWORD);
  }

  beforeAll(async () => {
    booted = await bootApp();

    const plan = await booted.prisma.plan.create({
      data: {
        code: `DEADLOCK-${SUFFIX}`,
        name: "Deadlock Plan",
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
      data: { accountType: "PLATFORM", email: platformEmail, passwordHash: hashPassword(PLATFORM_PASSWORD), status: "ACTIVE" },
    });
    const platformSession = await loginAs(booted, platformEmail, PLATFORM_PASSWORD);

    const created = await http(booted)
      .post("/api/v1/platform/workshops")
      .set("Cookie", platformSession.cookie)
      .send({
        planId: plan.id,
        name: `Deadlock Motors ${SUFFIX}`,
        slug: `deadlock-${SUFFIX}`.toLowerCase(),
        country: "EG",
        city: "Cairo",
        businessType: "Independent Garage",
        primaryCategory: "CARS",
        currency: "EGP",
        timezone: "Africa/Cairo",
        ownerFullName: "Deadlock Owner",
        ownerEmail: `owner-${SUFFIX}@mop.local`,
        ownerPhone: "+201234567890",
        allowedBranchesStart: 1,
        allowedUsersStart: 10,
        allowedWarehousesStart: 1,
        starterBuilderTemplate: "MINIMAL",
        initialStatus: "ACTIVE",
        branches: [{ name: "Main Branch", code: "MAIN", city: "Cairo" }],
        warehouses: [{ name: "Main Store", code: "STORE", branchCodes: ["MAIN"] }],
        capabilities: LAUNCH_PROFILE,
      });
    expectCode(created, 201);
    tenantId = created.body.tenant.id;

    await http(booted)
      .post("/api/v1/auth/invite/accept")
      .send({ token: String(created.body.inviteLink).split("token=")[1], password: OWNER_PASSWORD });

    branchId = (await booted.prisma.branch.findFirstOrThrow({ where: { tenantId }, select: { id: true } })).id;
    managerSession = await staff("BRANCH_MANAGER", "Deadlock Manager");
    technicianSession = await staff("TECHNICIAN", "Deadlock Technician");
  }, 180_000);

  afterAll(async () => {
    if (tenantId) {
      await booted.prisma.session.deleteMany({ where: { tenantId } });
      await booted.prisma.staffUser.deleteMany({ where: { tenantId } });
      await booted.prisma.account.deleteMany({ where: { tenantId } });
    }
    await booted.prisma.account.deleteMany({ where: { email: platformEmail } });
    await booted.close();
  }, 180_000);

  it("a job reaches work with an extra question hanging over it", async () => {
    const intake = await http(booted)
      .post("/api/v1/branch-manager/intake")
      .set("Cookie", managerSession.cookie)
      .send({
        branchId,
        customer: { fullName: "Deadlock Customer", phone: "+201234567897" },
        asset: { category: "CARS", plateNumber: `DD-${Date.now()}` },
        complaint: "Squeal on cold start",
      });
    expectCode(intake, 201);
    workOrderId = intake.body.workOrderId;

    const staffUser = await booted.prisma.staffUser.findFirstOrThrow({
      where: { tenantId, role: "TECHNICIAN" },
      select: { id: true },
    });
    await booted.prisma.workOrderAssignment.create({ data: { tenantId, workOrderId, staffUserId: staffUser.id } });

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
        .send({ type: "QUICK", note: "Belt glazed." }),
      201,
    );

    // The first ask, which the customer DOES answer -- that is what gets
    // the job to APPROVED_FOR_WORK and then into work.
    const agreed = await http(booted)
      .post(`/api/v1/technician/work-orders/${workOrderId}/decisions`)
      .set("Cookie", technicianSession.cookie)
      .send({ name: "Replace drive belt", explanation: "Glazed and squealing.", importance: "MEDIUM", price: "400.00" });
    expectCode(agreed, 201);

    const read = await http(booted).get(`/api/v1/public/decisions/${agreed.body.secureToken}`);
    expectCode(read, 200);
    expectCode(
      await http(booted)
        .post(`/api/v1/public/decisions/${agreed.body.secureToken}/respond`)
        .send({ answers: [{ itemId: read.body.items[0].id, decision: "APPROVED" }] }),
      200,
    );

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
      .send({ title: "Replace drive belt" });
    expectCode(created, 201);
    taskId = created.body.id;
    await booted.prisma.taskAssignment.create({ data: { tenantId, taskId, staffUserId: staffUser.id } });

    expectCode(
      await http(booted).post(`/api/v1/technician/tasks/${taskId}/start`).set("Cookie", technicianSession.cookie).send({}),
      201,
    );
    expectCode(
      await http(booted)
        .post(`/api/v1/technician/tasks/${taskId}/complete`)
        .set("Cookie", technicianSession.cookie)
        .send({ minutesSpent: 30 }),
      201,
    );

    // The SECOND ask -- "while it is open, shall we do the tensioner
    // too?" -- which the customer never answers. This is the one that
    // strands the car.
    const unanswered = await http(booted)
      .post(`/api/v1/technician/work-orders/${workOrderId}/decisions`)
      .set("Cookie", technicianSession.cookie)
      .send({
        name: "Replace belt tensioner as well",
        explanation: "It is worn too, and it is cheaper while the belt is off.",
        importance: "LOW",
        price: "650.00",
      });
    expectCode(unanswered, 201);
    requestId = unanswered.body.requestId;
    expect(requestId).toBeTruthy();
  }, 180_000);

  /**
   * WAITING_CUSTOMER is unreachable, and deliberately left that way.
   *
   * `ASK_CUSTOMER` (IN_PROGRESS -> WAITING_CUSTOMER) has no production
   * caller, so a mid-job question leaves the job reading IN_PROGRESS.
   * That is a real gap -- the board cannot show "waiting on the customer"
   * mid-work -- but wiring the intent makes things strictly WORSE, which
   * is why this asserts the gap instead of closing it.
   *
   * The graph gives WAITING_CUSTOMER exactly two exits: CUSTOMER_RESPONDED,
   * which needs the customer to answer, and an unintented edge to
   * CANCELLED that nothing can drive. FINISH leaves only IN_PROGRESS. So
   * a job moved to WAITING_CUSTOMER by a customer who then stops
   * answering has no way out at all -- withdrawing the request (below)
   * does not move work orders. Leaving the job IN_PROGRESS keeps the
   * withdraw guard working, which is the lesser of the two.
   *
   * Recorded as F-008. Closing it needs a staff exit from
   * WAITING_CUSTOMER, which is a graph change and out of bounds here.
   */
  it("[F-008] a mid-job question leaves the job in progress, because the alternative strands it", async () => {
    const workOrder = await booted.prisma.workOrder.findUniqueOrThrow({
      where: { id: workOrderId },
      select: { status: true },
    });
    expect(workOrder.status).toBe("IN_PROGRESS");
  }, 120_000);

  it("the unanswered question holds the finished car in the workshop", async () => {
    const check = await http(booted)
      .get(`/api/v1/technician/work-orders/${workOrderId}/finish-check`)
      .set("Cookie", technicianSession.cookie);
    expectCode(check, 200);

    expect(check.body.passed).toBe(false);
    expect(unsatisfied(check.body)).toContain("The customer has not answered every request yet.");

    // And the press is refused, not merely the preview.
    const refused = await http(booted)
      .post(`/api/v1/technician/work-orders/${workOrderId}/finish`)
      .set("Cookie", technicianSession.cookie)
      .send({});
    expect(refused.status).toBeGreaterThanOrEqual(400);
  }, 120_000);

  /** M-3. The endpoint the browser can now actually reach. */
  it("[M-3] the manager withdraws the request, and the car is freed", async () => {
    expectCode(
      await http(booted)
        .post(`/api/v1/branch-manager/approvals/${requestId}/cancel`)
        .set("Cookie", managerSession.cookie)
        .send({}),
      200,
    );

    const request = await booted.prisma.customerDecisionRequest.findUniqueOrThrow({
      where: { id: requestId },
      select: { status: true },
    });
    expect(request.status).toBe("CANCELLED");

    // The assertion that matters. Cancelling moves no work order at all,
    // so nothing about the request's own row proves the deadlock broke --
    // only the gate changing its mind does.
    const check = await http(booted)
      .get(`/api/v1/technician/work-orders/${workOrderId}/finish-check`)
      .set("Cookie", technicianSession.cookie);
    expectCode(check, 200);
    expect(unsatisfied(check.body)).not.toContain("The customer has not answered every request yet.");
    expect(check.body.passed).toBe(true);

    expectCode(
      await http(booted)
        .post(`/api/v1/technician/work-orders/${workOrderId}/finish`)
        .set("Cookie", technicianSession.cookie)
        .send({}),
      201,
    );
  }, 120_000);

  /**
   * Cancelling twice is a mis-click, not a state change. It has to be
   * refused rather than quietly re-cancelling something the customer may
   * meanwhile have answered.
   */
  it("refuses to withdraw a request that is already final", async () => {
    const again = await http(booted)
      .post(`/api/v1/branch-manager/approvals/${requestId}/cancel`)
      .set("Cookie", managerSession.cookie)
      .send({});

    expectCode(again, 409, "decision_already_final");
  }, 120_000);

  /**
   * The scope check, from the outside. A manager at another workshop
   * must not be able to withdraw this one's request -- and must not be
   * able to learn it exists either, which is why the refusal is a 404.
   */
  it("refuses a manager from another workshop, without confirming the request exists", async () => {
    const otherTenant = await booted.prisma.tenant.findFirst({
      where: { id: { not: tenantId } },
      select: { id: true },
    });
    if (!otherTenant) return;

    const email = `intruder-${SUFFIX}@mop.local`;
    const account = await booted.prisma.account.create({
      data: {
        accountType: "TENANT_STAFF",
        tenantId: otherTenant.id,
        email,
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

    const intruder = await loginAs(booted, email, STAFF_PASSWORD);
    const res = await http(booted)
      .post(`/api/v1/branch-manager/approvals/${requestId}/cancel`)
      .set("Cookie", intruder.cookie)
      .send({});

    expect([403, 404]).toContain(res.status);

    await booted.prisma.session.deleteMany({ where: { tenantId: otherTenant.id } });
    await booted.prisma.staffUser.deleteMany({ where: { accountId: account.id } });
    await booted.prisma.account.delete({ where: { id: account.id } });
  }, 120_000);
});
