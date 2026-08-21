/**
 * Real-database integration test -- proves the Phase 1 DoD claim that
 * emitting one operation event produces an AuditLog row and, when
 * customer-relevant, a CustomerTimelineEvent row, and that all of it is
 * genuinely atomic (a failure partway through rolls back everything from
 * that same emit() call, not just the piece that failed).
 *
 * Requires the local Postgres test database (`mop_platform_test`) to be up
 * and migrated -- see docker-compose.yml and .env.test.
 */
process.env.DATABASE_URL ??=
  "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import { AuditActorType, AuditRiskLevel, PrismaClient } from "@mop/database";
import { AuditService } from "../audit/audit.service";
import type { PrismaService } from "../runtime/database/prisma.service";
import { CustomerSafeProjectionService } from "./customer-safe-projection.service";
import { OperationEventsService } from "./operation-events.service";

describe("OperationEventsService (integration)", () => {
  const prisma = new PrismaClient();
  let service: OperationEventsService;
  let tenantId: string;
  let planId: string;
  let customerId: string;

  beforeAll(async () => {
    const prismaService = prisma as unknown as PrismaService;
    const auditService = new AuditService(prismaService);
    service = new OperationEventsService(prismaService, auditService, new CustomerSafeProjectionService());

    const plan = await prisma.plan.create({
      data: {
        code: `TEST-${Date.now()}`,
        name: "Test Plan",
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

    const tenant = await prisma.tenant.create({
      data: {
        name: "Integration Test Workshop",
        nameNormalized: `integration test workshop ${Date.now()}`,
        slug: `integration-test-${Date.now()}`,
        customerRegistrationCode: `ITC-${Date.now()}`,
        planId,
        country: "EG",
        city: "Cairo",
        businessType: "Independent Garage",
        primaryCategory: "CARS",
        currency: "EGP",
        timezone: "Africa/Cairo",
      },
    });
    tenantId = tenant.id;

    const customer = await prisma.customer.create({
      data: { tenantId, fullName: "Test Customer", phone: "+201000000000" },
    });
    customerId = customer.id;
  });

  afterAll(async () => {
    await prisma.customerTimelineEvent.deleteMany({ where: { tenantId } });
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.operationEvent.deleteMany({ where: { tenantId } });
    await prisma.customer.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.plan.delete({ where: { id: planId } });
    await prisma.$disconnect();
  });

  it("writes an OperationEvent and an AuditLog row for a non-customer event, and nothing to the customer timeline", async () => {
    await service.emit({
      tenantId,
      eventKey: "test.staff_only_event",
      payload: { note: "internal only" },
      actorId: "staff-1",
      actorType: AuditActorType.TENANT_STAFF,
      actorName: "Ahmed",
      targetType: "WorkOrder",
      targetId: "wo-integration-1",
      riskLevel: AuditRiskLevel.LOW,
    });

    const events = await prisma.operationEvent.findMany({ where: { tenantId, eventKey: "test.staff_only_event" } });
    expect(events).toHaveLength(1);
    expect(events[0].payload).toEqual({ note: "internal only" });

    const audits = await prisma.auditLog.findMany({ where: { tenantId, action: "test.staff_only_event" } });
    expect(audits).toHaveLength(1);
    expect(audits[0].actorName).toBe("Ahmed");
    expect(audits[0].riskLevel).toBe(AuditRiskLevel.LOW);

    const timeline = await prisma.customerTimelineEvent.findMany({
      where: { tenantId, eventKey: "test.staff_only_event" },
    });
    expect(timeline).toHaveLength(0);
  });

  it("also writes a CustomerTimelineEvent with safe-projected text when customer context is provided", async () => {
    await service.emit({
      tenantId,
      eventKey: "part.requested",
      payload: {},
      actorId: "staff-1",
      actorType: AuditActorType.TENANT_STAFF,
      actorName: "Ahmed",
      targetType: "PartRequest",
      targetId: "part-integration-1",
      riskLevel: AuditRiskLevel.LOW,
      customer: {
        customerId,
        suppliedText: "Inventory Manager created supplier order for unavailable brake pads.",
      },
    });

    const timeline = await prisma.customerTimelineEvent.findMany({
      where: { tenantId, customerId, eventKey: "part.requested" },
    });
    expect(timeline).toHaveLength(1);
    expect(timeline[0].message).toBe(
      "We are waiting for a required part. The branch will update you when it is available.",
    );
  });

  it("rolls back the OperationEvent and AuditLog together if the transaction fails partway through", async () => {
    // customerId references a row that doesn't exist -- the
    // CustomerTimelineEvent insert fails its FK constraint, and because
    // everything runs in one transaction, the OperationEvent/AuditLog rows
    // written earlier in this same emit() call must not survive either.
    await expect(
      service.emit({
        tenantId,
        eventKey: "test.should_roll_back",
        payload: {},
        actorId: "staff-1",
        actorType: AuditActorType.TENANT_STAFF,
        actorName: "Ahmed",
        targetType: "WorkOrder",
        targetId: "wo-integration-2",
        riskLevel: AuditRiskLevel.LOW,
        customer: { customerId: "does-not-exist" },
      }),
    ).rejects.toBeDefined();

    const events = await prisma.operationEvent.findMany({ where: { tenantId, eventKey: "test.should_roll_back" } });
    expect(events).toHaveLength(0);
    const audits = await prisma.auditLog.findMany({ where: { tenantId, action: "test.should_roll_back" } });
    expect(audits).toHaveLength(0);
  });
});
