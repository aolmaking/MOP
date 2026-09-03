/**
 * The Honesty Harness, contrasting profile.
 *
 * M-2 asks for the walkthrough green "on the launch profile (+1
 * contrasting profile for regression proof)". This is the +1, and the
 * word that matters is *regression*: the launch walkthrough could pass
 * for the wrong reason. A journey hardcoded to go
 * FINISH → PAYMENT_PENDING would look identical to one routed there by a
 * profile with TEAM_REVIEW and QC switched off.
 *
 * So this runs the SAME code against a workshop with everything on, and
 * asserts the route is different: FINISH lands in READY_FOR_TEAM_REVIEW,
 * the job passes a team review, then a quality check, and only then
 * reaches the money. Same endpoints, same services, same graph -- a
 * different shape because the configuration is different.
 *
 * If this file and `walkthrough.http.spec.ts` ever agree about where
 * FINISH goes, the capability engine has stopped deciding and something
 * has been hardcoded.
 */
import { bootApp, expectCode, http, loginAs, type BootedApp, type Session } from "./http-kit";
import { hashPassword } from "../identity/auth/password.util";

const SUFFIX = `ct-${Date.now()}`;
const PLATFORM_PASSWORD = "platform-password-123";
const OWNER_PASSWORD = "owner-password-123";
const STAFF_PASSWORD = "staff-password-123";

/**
 * Everything on -- `MULTI_BRANCH_FULL_SERVICE` in the shipped profiles,
 * which is an empty deviation set. Written as `{}` here rather than
 * imported, so this file states its own subject: a workshop that has
 * removed nothing.
 */
const FULL_SERVICE_PROFILE = {};

describe("Walkthrough, contrasting profile (real HTTP, real Postgres)", () => {
  let booted: BootedApp;
  let platformEmail: string;
  let tenantId: string;
  let branchId: string;
  let ownerEmail: string;

  let managerSession: Session;
  let technicianSession: Session;
  let workOrderId: string;
  let taskId: string;

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
        code: `CONTRAST-${SUFFIX}`,
        name: "Contrast Plan",
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

    ownerEmail = `owner-${SUFFIX}@mop.local`;
    const created = await http(booted)
      .post("/api/v1/platform/workshops")
      .set("Cookie", platformSession.cookie)
      .send({
        planId: plan.id,
        name: `Contrast Motors ${SUFFIX}`,
        slug: `contrast-${SUFFIX}`.toLowerCase(),
        country: "EG",
        city: "Cairo",
        businessType: "Independent Garage",
        primaryCategory: "CARS",
        currency: "EGP",
        timezone: "Africa/Cairo",
        ownerFullName: "Contrast Owner",
        ownerEmail,
        ownerPhone: "+201234567890",
        starterBuilderTemplate: "MINIMAL",
        initialStatus: "ACTIVE",
        branches: [{ name: "Main Branch", code: "MAIN", city: "Cairo" }],
        warehouses: [{ name: "Main Store", code: "STORE", branchCodes: ["MAIN"] }],
        capabilities: FULL_SERVICE_PROFILE,
      });
    expectCode(created, 201);
    tenantId = created.body.tenant.id;

    await http(booted)
      .post("/api/v1/auth/invite/accept")
      .send({ token: String(created.body.ownerInvitation.link).split("token=")[1], password: OWNER_PASSWORD });

    branchId = (await booted.prisma.branch.findFirstOrThrow({ where: { tenantId }, select: { id: true } })).id;
    managerSession = await staff("BRANCH_MANAGER", "Contrast Manager");
    technicianSession = await staff("TECHNICIAN", "Contrast Technician");
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

  it("takes a job from intake to finished work, exactly as the launch profile does", async () => {
    const intake = await http(booted)
      .post("/api/v1/branch-manager/intake")
      .set("Cookie", managerSession.cookie)
      .send({
        branchId,
        customer: { fullName: "Contrast Customer", phone: "+201234567898" },
        asset: { category: "CARS", plateNumber: `CT-${Date.now()}` },
        complaint: "Rattle over bumps",
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
        .send({ type: "QUICK", note: "Drop link worn." }),
      201,
    );

    const raised = await http(booted)
      .post(`/api/v1/technician/work-orders/${workOrderId}/decisions`)
      .set("Cookie", technicianSession.cookie)
      .send({
        name: "Replace anti-roll bar drop link",
        explanation: "Worn; causes the rattle.",
        importance: "MEDIUM",
        price: "600.00",
      });
    expectCode(raised, 201);

    const read = await http(booted).get(`/api/v1/public/decisions/${raised.body.secureToken}`);
    expectCode(read, 200);
    expectCode(
      await http(booted)
        .post(`/api/v1/public/decisions/${raised.body.secureToken}/respond`)
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
      .send({ title: "Replace drop link" });
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
        .send({ minutesSpent: 40 }),
      201,
    );
  }, 180_000);

  /**
   * The assertion this whole file exists for.
   *
   * On the launch profile this same call lands in PAYMENT_PENDING. Here,
   * with TEAMS/TEAM_REVIEW/QC on, it must land in READY_FOR_TEAM_REVIEW
   * instead -- nothing in the request differs, only the workshop's shape.
   */
  it("routes FINISH into team review, where the launch profile routes it at the money", async () => {
    expectCode(
      await http(booted)
        .post(`/api/v1/technician/work-orders/${workOrderId}/finish`)
        .set("Cookie", technicianSession.cookie)
        .send({}),
      201,
    );

    const workOrder = await booted.prisma.workOrder.findUniqueOrThrow({
      where: { id: workOrderId },
      select: { status: true },
    });
    expect(workOrder.status).toBe("READY_FOR_TEAM_REVIEW");
  }, 120_000);

  it("passes the review, then the quality check, and only then reaches the money", async () => {
    expectCode(
      await http(booted)
        .post(`/api/v1/branch-manager/work-orders/${workOrderId}/advance`)
        .set("Cookie", managerSession.cookie)
        .send({ passed: true }),
      201,
    );

    const reviewed = await booted.prisma.workOrder.findUniqueOrThrow({
      where: { id: workOrderId },
      select: { status: true },
    });
    expect(reviewed.status).toBe("READY_FOR_QC");

    expectCode(
      await http(booted)
        .post(`/api/v1/branch-manager/work-orders/${workOrderId}/advance`)
        .set("Cookie", managerSession.cookie)
        .send({ passed: true }),
      201,
    );

    const checked = await booted.prisma.workOrder.findUniqueOrThrow({
      where: { id: workOrderId },
      select: { status: true },
    });
    expect(checked.status).toBe("PAYMENT_PENDING");
  }, 120_000);

  it("bills, settles and closes the same way the launch profile does", async () => {
    const owner = await loginAs(booted, ownerEmail, OWNER_PASSWORD);

    const issued = await http(booted)
      .post(`/api/v1/finance/work-orders/${workOrderId}/invoice`)
      .set("Cookie", owner.cookie)
      .send({});
    expectCode(issued, 201);
    const invoiceId = issued.body.id ?? issued.body.invoiceId;

    const settlement = await http(booted).get(`/api/v1/finance/invoices/${invoiceId}`).set("Cookie", owner.cookie);
    expectCode(settlement, 200);
    const due = settlement.body.outstanding ?? settlement.body.total;

    expectCode(
      await http(booted)
        .post(`/api/v1/finance/invoices/${invoiceId}/payments`)
        .set("Cookie", owner.cookie)
        .send({ amount: due, method: "CASH", idempotencyKey: `ct-pay-${SUFFIX}` }),
      201,
    );

    expectCode(
      await http(booted)
        .post(`/api/v1/branch-manager/work-orders/${workOrderId}/deliver`)
        .set("Cookie", managerSession.cookie)
        .send({}),
      201,
    );

    const closed = await booted.prisma.workOrder.findUniqueOrThrow({
      where: { id: workOrderId },
      select: { status: true },
    });
    expect(closed.status).toBe("CLOSED");
  }, 180_000);
});
