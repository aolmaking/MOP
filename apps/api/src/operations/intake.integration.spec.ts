/**
 * Intake against a real database, covering the SCENARIOS.md entries it
 * owns: standard intake (1.1), declined inspection (1.2), walk-in with no
 * prior record (1.5), ownership transfer (2.1) and category refusal (2.4).
 *
 * Integration because the guarantees are transactional: a half-finished
 * intake -- a customer with no work order, an asset with no owner -- is
 * worse than a failed one, and only a real database can prove it does not
 * happen.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { IntakeService } from "./intake.service";
import { WorkOrderLifecycleService } from "./work-order-lifecycle.service";
import { GateEvaluatorService } from "./gate-evaluator.service";
import { OperationEventsService } from "./operation-events.service";
import { CustomerSafeProjectionService } from "./customer-safe-projection.service";
import { CapabilityResolutionService } from "../capabilities/capability-resolution.service";
import { AuditService } from "../audit/audit.service";
import type { PrismaService } from "../database/prisma.service";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;

const events = new OperationEventsService(asService, new AuditService(asService), new CustomerSafeProjectionService());
const lifecycle = new WorkOrderLifecycleService(
  asService,
  new CapabilityResolutionService(asService),
  events,
  new GateEvaluatorService(asService),
);
const intake = new IntakeService(asService, events, lifecycle);

const ACTOR = { accountId: "reception-1", displayName: "Receptionist", actorType: "TENANT_STAFF" as const };
const SUFFIX = `intake-${Date.now()}`;

let tenantId: string;
let planId: string;
let branchId: string;

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "Cars only",
      maxBranches: 5,
      maxUsers: 50,
      maxWarehouses: 5,
      // Cars only, so a motorcycle must be refused (SCENARIOS.md 2.4).
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
      name: `Intake WS ${SUFFIX}`,
      nameNormalized: `intake ws ${SUFFIX}`,
      slug: `intake-ws-${SUFFIX}`,
      customerRegistrationCode: `IN-${SUFFIX}`,
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
}, 120_000);

afterAll(async () => {
  const where = { tenantId };
  await prisma.operationEvent.deleteMany({ where });
  await prisma.auditLog.deleteMany({ where });
  await prisma.customerTimelineEvent.deleteMany({ where });
  await prisma.workOrderAssignment.deleteMany({ where });
  await prisma.workOrder.deleteMany({ where });
  await prisma.assetOwnershipHistory.deleteMany({ where });
  await prisma.asset.deleteMany({ where });
  await prisma.customer.deleteMany({ where });
  await prisma.branch.deleteMany({ where });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 120_000);

describe("standard intake", () => {
  it("creates customer, asset, ownership and work order in one go", async () => {
    const result = await intake.intake(
      {
        tenantId,
        branchId,
        customer: { fullName: "Ahmed Salah", phone: "01000000001" },
        asset: { category: "CARS", plateNumber: `AAA-${SUFFIX}` },
        complaint: "Brake noise",
      },
      ACTOR,
    );

    // Registered, not draft: intake finishes by asking the lifecycle to
    // move it, rather than writing a status itself.
    expect(result.status).toBe("REGISTERED");

    const ownership = await prisma.assetOwnershipHistory.findMany({ where: { assetId: result.assetId } });
    expect(ownership).toHaveLength(1);
    expect(ownership[0]?.endedAt).toBeNull(); // open period = current owner
    expect(ownership[0]?.customerId).toBe(result.customerId);
  }, 120_000);

  it("records the declined-inspection decision on the work order", async () => {
    const result = await intake.intake(
      {
        tenantId,
        branchId,
        customer: { fullName: "Mona Adel", phone: "01000000002" },
        asset: { category: "CARS", plateNumber: `BBB-${SUFFIX}` },
        inspectionDeclined: true,
      },
      ACTOR,
    );

    const workOrder = await prisma.workOrder.findUnique({ where: { id: result.workOrderId } });
    expect(workOrder?.inspectionDeclined).toBe(true);
  }, 120_000);

  it("emits work_order.created and a customer-safe timeline entry", async () => {
    const result = await intake.intake(
      {
        tenantId,
        branchId,
        customer: { fullName: "Sara Nabil", phone: "01000000003" },
        asset: { category: "CARS", plateNumber: `CCC-${SUFFIX}` },
      },
      ACTOR,
    );

    const event = await prisma.operationEvent.findFirst({
      where: { tenantId, eventKey: "work_order.created" },
      orderBy: { createdAt: "desc" },
    });
    expect(event?.payload).toMatchObject({ workOrderId: result.workOrderId });

    const timeline = await prisma.customerTimelineEvent.findFirst({
      where: { customerId: result.customerId },
    });
    expect(timeline).not.toBeNull();
  }, 120_000);

  it("assigns a technician when asked", async () => {
    const account = await prisma.account.create({
      data: { accountType: "TENANT_STAFF", tenantId, email: `tech-${SUFFIX}@x.local`, status: "ACTIVE" },
    });
    const staff = await prisma.staffUser.create({
      data: { accountId: account.id, tenantId, fullName: "Tech", role: "TECHNICIAN", categoryScope: ["CARS"] },
    });

    const result = await intake.intake(
      {
        tenantId,
        branchId,
        customer: { fullName: "Omar Farid", phone: "01000000004" },
        asset: { category: "CARS", plateNumber: `DDD-${SUFFIX}` },
        assignToStaffUserId: staff.id,
      },
      ACTOR,
    );

    const assignment = await prisma.workOrderAssignment.findFirst({ where: { workOrderId: result.workOrderId } });
    expect(assignment?.staffUserId).toBe(staff.id);
  }, 120_000);
});

describe("ownership", () => {
  it("refuses to move a vehicle to a new customer without explicit confirmation", async () => {
    // Silently reassigning would give the new owner the previous owner's
    // service history -- a privacy incident, not a convenience.
    const first = await intake.intake(
      {
        tenantId,
        branchId,
        customer: { fullName: "First Owner", phone: "01000000005" },
        asset: { category: "CARS", plateNumber: `EEE-${SUFFIX}` },
      },
      ACTOR,
    );

    await expect(
      intake.intake(
        {
          tenantId,
          branchId,
          customer: { fullName: "Second Owner", phone: "01000000006" },
          asset: { existingAssetId: first.assetId },
        },
        ACTOR,
      ),
    ).rejects.toThrow(/ownership transfer/i);
  }, 120_000);

  it("closes the old ownership period and opens a new one when confirmed", async () => {
    const first = await intake.intake(
      {
        tenantId,
        branchId,
        customer: { fullName: "Old Owner", phone: "01000000007" },
        asset: { category: "CARS", plateNumber: `FFF-${SUFFIX}` },
      },
      ACTOR,
    );

    const second = await intake.intake(
      {
        tenantId,
        branchId,
        customer: { fullName: "New Owner", phone: "01000000008" },
        asset: { existingAssetId: first.assetId },
        confirmOwnershipTransfer: true,
      },
      ACTOR,
    );

    expect(second.ownershipTransferred).toBe(true);

    const periods = await prisma.assetOwnershipHistory.findMany({
      where: { assetId: first.assetId },
      orderBy: { startedAt: "asc" },
    });

    expect(periods).toHaveLength(2);
    expect(periods[0]?.endedAt).not.toBeNull(); // previous owner's period is closed, not deleted
    expect(periods[1]?.endedAt).toBeNull();
    expect(periods[1]?.customerId).toBe(second.customerId);

    // The earlier work order still belongs to the person who authorised it
    // (SCENARIOS.md 2.2) -- the asset changed hands, the work order did not.
    const earlier = await prisma.workOrder.findUnique({ where: { id: first.workOrderId } });
    expect(earlier?.customerId).toBe(first.customerId);
  }, 120_000);
});

describe("refusals", () => {
  it("refuses a category the workshop does not service", async () => {
    await expect(
      intake.intake(
        {
          tenantId,
          branchId,
          customer: { fullName: "Biker", phone: "01000000009" },
          asset: { category: "MOTORCYCLES", plateNumber: `GGG-${SUFFIX}` },
        },
        ACTOR,
      ),
    ).rejects.toThrow(/does not service/i);
  }, 120_000);

  it("refuses a branch belonging to another workshop", async () => {
    await expect(
      intake.intake(
        {
          tenantId,
          branchId: "not-a-real-branch",
          customer: { fullName: "Nobody", phone: "01000000010" },
          asset: { category: "CARS" },
        },
        ACTOR,
      ),
    ).rejects.toThrow(/branch/i);
  }, 120_000);

  it("leaves nothing behind when intake fails", async () => {
    // The transactional guarantee: a rejected intake must not leave an
    // orphaned customer for someone to find later.
    const before = await prisma.customer.count({ where: { tenantId } });

    await expect(
      intake.intake(
        {
          tenantId,
          branchId,
          customer: { fullName: "Ghost", phone: "01000000011" },
          asset: { category: "MOTORCYCLES" }, // refused
        },
        ACTOR,
      ),
    ).rejects.toThrow();

    expect(await prisma.customer.count({ where: { tenantId } })).toBe(before);
  }, 120_000);

  it("requires a name and phone for a new customer", async () => {
    await expect(
      intake.intake(
        { tenantId, branchId, customer: { fullName: "Only a name" }, asset: { category: "CARS" } },
        ACTOR,
      ),
    ).rejects.toThrow(/phone/i);
  }, 120_000);

  it("refuses a new-customer phone that already belongs to someone else, and names them (P-80)", async () => {
    const phone = `0155${SUFFIX}-a`;
    const first = await intake.intake(
      { tenantId, branchId, customer: { fullName: "Original Person", phone }, asset: { category: "CARS" } },
      ACTOR,
    );
    expect(first.customerId).toBeDefined();

    await expect(
      intake.intake(
        { tenantId, branchId, customer: { fullName: "Second Person", phone }, asset: { category: "CARS" } },
        ACTOR,
      ),
    ).rejects.toMatchObject({ status: 409, response: { code: "phone_number_already_registered" } });
  }, 120_000);

  it("creates a genuinely new customer at a shared phone once explicitly confirmed", async () => {
    const phone = `0155${SUFFIX}-b`;
    const first = await intake.intake(
      { tenantId, branchId, customer: { fullName: "Household Member A", phone }, asset: { category: "CARS" } },
      ACTOR,
    );

    const second = await intake.intake(
      {
        tenantId,
        branchId,
        customer: { fullName: "Household Member B", phone },
        asset: { category: "CARS" },
        confirmNewCustomerDespitePhoneMatch: true,
      },
      ACTOR,
    );

    expect(second.customerId).not.toBe(first.customerId);
  }, 120_000);
});
