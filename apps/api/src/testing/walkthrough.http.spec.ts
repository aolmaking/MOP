/**
 * The Honesty Harness.
 *
 * One journey, over real HTTP, against a real Postgres: a platform admin
 * creates a workshop, the owner redeems their invite, a job is booked in,
 * and a technician starts the inspection. Every step is something a real
 * person does in a browser, in the order they do it.
 *
 * Its job is not to pass. Its job is to be the one place that cannot be
 * argued with about how far the product actually works. Unit tests can be
 * green while the journey is broken -- that is the failure mode this file
 * exists to make impossible -- so where the journey stops, there is a
 * pinned `xit` naming exactly what is missing and which tracked item will
 * remove it.
 *
 * PINNED, INTENTIONALLY RED
 * -------------------------
 *   xit  "an invited branch manager can accept their invite over HTTP"
 *        -> board/reviews/F-005-staff-invites-can-never-be-accepted.md
 *        StaffService.invite() hashes the invite token and discards the
 *        raw value. It is never returned, never mailed, and there is no
 *        resend, so an invited staff account can never be activated. Turns
 *        green when invite() surfaces the link the way
 *        PlatformService.createWorkshop already does.
 *
 *   xit  "a technician starts inspection on a REGISTERED job"
 *        -> CONTRACTS-v0 C1, POST /technician/work-orders/:id/start-inspection
 *        The route does not exist yet (a repository-wide search for
 *        "start-inspection" returns nothing). Turns green when C1 lands.
 *
 * Un-pin by deleting the `x`. Do not delete the test, and do not soften an
 * assertion to make it pass -- a walkthrough that has been edited to agree
 * with the code is worth less than no walkthrough at all.
 */
import { bootApp, expectCode, http, loginAs, type BootedApp, type Session } from "./http-kit";
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
   * PINNED RED -- CONTRACTS-v0 C1.
   *
   * `POST /technician/work-orders/:id/start-inspection` does not exist: a
   * repository-wide search for "start-inspection" returns nothing, in the
   * API or the web app. The closest existing route is
   * `POST /technician/work-orders/:id/inspection`, which submits an
   * inspection rather than entering the state.
   *
   * So today this returns 404. Once the route lands it must return 200
   * with `{ workOrderId, status: "UNDER_INSPECTION" }`, and 409
   * `transition_not_allowed` from any state other than REGISTERED.
   *
   * Un-pin with W1-A3-002.
   */
  it("[C1] a technician starts inspection on a REGISTERED job", async () => {
    const technicianEmail = `tech-${SUFFIX}@mop.local`;
    const account = await booted.prisma.account.create({
      data: {
        accountType: "TENANT_STAFF",
        tenantId,
        email: technicianEmail,
        passwordHash: hashPassword(MANAGER_PASSWORD),
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

    const session = await loginAs(booted, technicianEmail, MANAGER_PASSWORD);

    const res = await http(booted)
      .post(`/api/v1/technician/work-orders/${workOrderId}/start-inspection`)
      .set("Cookie", session.cookie)
      .send({});

    expectCode(res, 200);
    expect(res.body).toEqual({ workOrderId, status: "UNDER_INSPECTION" });
  }, 120_000);

});
