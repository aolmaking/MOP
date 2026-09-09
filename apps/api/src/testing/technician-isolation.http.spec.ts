/**
 * A technician of one workshop cannot touch another workshop's job.
 *
 * Phase 2 of this recovery scoped three methods on `TechnicianWorkService` --
 * `startTask`, `completeTask`, `reportBlocker` -- after a runtime probe proved
 * all three exploitable: a technician signed into one workshop moved another
 * workshop's task from ASSIGNED to IN_PROGRESS to DONE, and the resulting
 * TaskBlocker was written under the victim's tenantId with the attacker's
 * account as `reportedBy`.
 *
 * Ten more methods on the same service were left unscoped, and
 * `requireWorkOrder` -- the sibling of the `requireTask` that fix introduced --
 * still loaded by bare id. So starting an inspection, starting work, recording
 * an inspection, logging a fault, adding an external part line, returning a
 * task for rework, resolving a blocker and finishing a job were all reachable
 * across tenants by exactly the same route, on exactly the same evidence.
 *
 * These are the probes for those, over real HTTP against real Postgres, with
 * the victim's rows read back afterwards. A 404 that left the row changed would
 * pass a status assertion and still be a breach.
 */
import { bootApp, expectCode, http, loginAs, LAUNCH_PROFILE, type BootedApp, type Session } from "./http-kit";
import { hashPassword } from "../identity/auth/password.util";

const SUFFIX = `iso-${Date.now()}`;
const PLATFORM_PASSWORD = "platform-password-123";
const OWNER_PASSWORD = "owner-password-123";
const STAFF_PASSWORD = "staff-password-123";

interface Workshop {
  readonly tenantId: string;
  readonly branchId: string;
  readonly ownerEmail: string;
}

describe("Technician cross-tenant probes (real HTTP, real Postgres)", () => {
  let booted: BootedApp;
  let platformEmail: string;
  let alpha: Workshop;
  let beta: Workshop;
  let alphaTechnician: Session;

  /** A work order of Beta's, sitting where each probe needs it. */
  let victimWorkOrderId: string;
  let victimTaskId: string;

  async function createWorkshop(name: string): Promise<Workshop> {
    const plan = await booted.prisma.plan.create({
      data: {
        code: `ISO-${name}-${SUFFIX}`,
        name: `${name} Plan`,
        maxBranches: 3,
        maxUsers: 20,
        maxWarehouses: 3,
        allowedCategories: ["CARS"],
        allowedModules: [],
        allowedFeatures: [],
        allowedReports: [],
        monthlyPrice: 0,
      },
    });

    const platformSession = await loginAs(booted, platformEmail, PLATFORM_PASSWORD);
    const ownerEmail = `owner-${name}-${SUFFIX}@mop.local`.toLowerCase();
    const created = await http(booted)
      .post("/api/v1/platform/workshops")
      .set("Cookie", platformSession.cookie)
      .send({
        planId: plan.id,
        name: `${name} Motors ${SUFFIX}`,
        slug: `${name}-motors-${SUFFIX}`.toLowerCase(),
        country: "EG",
        city: "Cairo",
        businessType: "Independent Garage",
        primaryCategory: "CARS",
        currency: "EGP",
        timezone: "Africa/Cairo",
        ownerFullName: `${name} Owner`,
        ownerEmail,
        ownerPhone: `+2012345${Math.floor(Math.random() * 90000) + 10000}`,
        starterBuilderTemplate: "MINIMAL",
        initialStatus: "ACTIVE",
        branches: [{ name: "Main Branch", code: "MAIN", city: "Cairo" }],
        warehouses: [{ name: "Main Store", code: "STORE", branchCodes: ["MAIN"] }],
        capabilities: LAUNCH_PROFILE,
      });
    expectCode(created, 201);

    const tenantId = created.body.tenant.id as string;
    await http(booted)
      .post("/api/v1/auth/invite/accept")
      .send({ token: String(created.body.ownerInvitation.link).split("token=")[1], password: OWNER_PASSWORD });

    const branchId = (await booted.prisma.branch.findFirstOrThrow({ where: { tenantId } })).id;
    return { tenantId, branchId, ownerEmail };
  }

  async function technicianIn(workshop: Workshop, label: string): Promise<Session> {
    const email = `tech-${label}-${SUFFIX}@mop.local`.toLowerCase();
    const account = await booted.prisma.account.create({
      data: {
        accountType: "TENANT_STAFF",
        tenantId: workshop.tenantId,
        email,
        passwordHash: hashPassword(STAFF_PASSWORD),
        status: "ACTIVE",
      },
    });
    await booted.prisma.staffUser.create({
      data: {
        accountId: account.id,
        tenantId: workshop.tenantId,
        fullName: `${label} Technician`,
        role: "TECHNICIAN",
        branchScope: [],
        warehouseScope: [],
        categoryScope: ["CARS"],
      },
    });
    return loginAs(booted, email, STAFF_PASSWORD);
  }

  beforeAll(async () => {
    booted = await bootApp();

    platformEmail = `platform-${SUFFIX}@mop.local`;
    await booted.prisma.account.create({
      data: {
        accountType: "PLATFORM",
        email: platformEmail,
        passwordHash: hashPassword(PLATFORM_PASSWORD),
        status: "ACTIVE",
      },
    });

    alpha = await createWorkshop("alpha");
    beta = await createWorkshop("beta");
    alphaTechnician = await technicianIn(alpha, "alpha");

    // Beta's job, with a task on it, sitting in REGISTERED.
    const customer = await booted.prisma.customer.create({
      data: { tenantId: beta.tenantId, fullName: "Beta Customer", phone: `+2011${Date.now() % 100000000}` },
    });
    const asset = await booted.prisma.asset.create({
      data: { tenantId: beta.tenantId, category: "CARS", plateNumber: `BETA-${SUFFIX.slice(-4)}`, currentOwnerCustomerId: customer.id },
    });
    const order = await booted.prisma.workOrder.create({
      data: {
        tenantId: beta.tenantId,
        branchId: beta.branchId,
        customerId: customer.id,
        assetId: asset.id,
        status: "REGISTERED",
      },
    });
    victimWorkOrderId = order.id;

    victimTaskId = (
      await booted.prisma.task.create({
        data: { tenantId: beta.tenantId, workOrderId: order.id, title: "Beta's own work", status: "ASSIGNED" },
      })
    ).id;
  }, 240_000);

  afterAll(async () => {
    for (const tenantId of [alpha?.tenantId, beta?.tenantId].filter(Boolean) as string[]) {
      const where = { tenantId };
      await booted.prisma.taskBlocker.deleteMany({ where });
      await booted.prisma.task.deleteMany({ where });
      await booted.prisma.fault.deleteMany({ where });
      await booted.prisma.inspection.deleteMany({ where });
      await booted.prisma.workOrderPartLine.deleteMany({ where });
      await booted.prisma.workOrder.deleteMany({ where });
      await booted.prisma.assetOwnershipHistory.deleteMany({ where });
      await booted.prisma.asset.deleteMany({ where });
      await booted.prisma.customer.deleteMany({ where });
      await booted.prisma.session.deleteMany({ where });
      await booted.prisma.staffUser.deleteMany({ where });
      await booted.prisma.account.deleteMany({ where });
    }
    await booted.prisma.account.deleteMany({ where: { email: platformEmail } });
    await booted.close();
  }, 240_000);

  /** Beta's job, exactly as it stands right now. */
  const victim = () => booted.prisma.workOrder.findUniqueOrThrow({ where: { id: victimWorkOrderId } });

  it("cannot start an inspection on another workshop's job", async () => {
    const before = await victim();

    const res = await http(booted)
      .post(`/api/v1/technician/work-orders/${victimWorkOrderId}/start-inspection`)
      .set("Cookie", alphaTechnician.cookie)
      .send({});

    expect([403, 404]).toContain(res.status);

    // The status assertion alone is not enough: a refusal that still moved the
    // row would pass it.
    const after = await victim();
    expect(after.status).toBe(before.status);
    expect(await booted.prisma.inspection.count({ where: { workOrderId: victimWorkOrderId } })).toBe(0);
  });

  it("cannot start work on another workshop's job", async () => {
    const before = await victim();

    const res = await http(booted)
      .post(`/api/v1/technician/work-orders/${victimWorkOrderId}/start-work`)
      .set("Cookie", alphaTechnician.cookie)
      .send({});

    expect([403, 404, 409]).toContain(res.status);
    expect((await victim()).status).toBe(before.status);
  });

  it("cannot log a fault against another workshop's job", async () => {
    const res = await http(booted)
      .post(`/api/v1/technician/work-orders/${victimWorkOrderId}/faults`)
      .set("Cookie", alphaTechnician.cookie)
      .send({ description: "Planted by another workshop", severity: "CRITICAL" });

    expect([403, 404]).toContain(res.status);
    // Nothing written under the victim's tenant.
    expect(await booted.prisma.fault.count({ where: { workOrderId: victimWorkOrderId } })).toBe(0);
  });

  it("cannot record an inspection on another workshop's job", async () => {
    const res = await http(booted)
      .post(`/api/v1/technician/work-orders/${victimWorkOrderId}/inspection`)
      .set("Cookie", alphaTechnician.cookie)
      .send({ type: "QUICK", odometerOrHours: 120000 });

    expect([403, 404, 409]).toContain(res.status);
    expect(await booted.prisma.inspection.count({ where: { workOrderId: victimWorkOrderId } })).toBe(0);
  });

  it("cannot add a part line to another workshop's job", async () => {
    const res = await http(booted)
      .post(`/api/v1/technician/work-orders/${victimWorkOrderId}/external-parts`)
      .set("Cookie", alphaTechnician.cookie)
      .send({ name: "Planted part", provenance: "CUSTOMER_SUPPLIED", quantity: 1 });

    expect([403, 404]).toContain(res.status);
    // A part line is billable on creation, so one planted here reaches the
    // victim's customer's invoice.
    expect(await booted.prisma.workOrderPartLine.count({ where: { workOrderId: victimWorkOrderId } })).toBe(0);
  });

  it("cannot finish another workshop's job", async () => {
    const before = await victim();

    const res = await http(booted)
      .post(`/api/v1/technician/work-orders/${victimWorkOrderId}/finish`)
      .set("Cookie", alphaTechnician.cookie)
      .send({});

    expect([403, 404, 409]).toContain(res.status);
    expect((await victim()).status).toBe(before.status);
  });

  it("still cannot start another workshop's task -- the Phase 2 probe, still closed", async () => {
    const res = await http(booted)
      .post(`/api/v1/technician/tasks/${victimTaskId}/start`)
      .set("Cookie", alphaTechnician.cookie)
      .send({});

    expect([403, 404]).toContain(res.status);
    const task = await booted.prisma.task.findUniqueOrThrow({ where: { id: victimTaskId } });
    expect(task.status).toBe("ASSIGNED");
  });

  it("leaves the victim's job exactly as it found it, after every probe above", async () => {
    // The point of the whole file, stated once: none of the refusals above
    // wrote anything.
    const order = await victim();
    expect(order.status).toBe("REGISTERED");
    expect(order.tenantId).toBe(beta.tenantId);

    const [tasks, faults, inspections, lines] = await Promise.all([
      booted.prisma.task.count({ where: { workOrderId: victimWorkOrderId } }),
      booted.prisma.fault.count({ where: { workOrderId: victimWorkOrderId } }),
      booted.prisma.inspection.count({ where: { workOrderId: victimWorkOrderId } }),
      booted.prisma.workOrderPartLine.count({ where: { workOrderId: victimWorkOrderId } }),
    ]);

    expect(tasks).toBe(1);
    expect(faults).toBe(0);
    expect(inspections).toBe(0);
    expect(lines).toBe(0);
  });
});
