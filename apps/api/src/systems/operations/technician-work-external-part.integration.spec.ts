process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_test_w3?schema=public";
import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { TechnicianWorkService } from "./technician-work.service";
import { WorkOrderLifecycleService } from "./work-order-lifecycle.service";
import { OperationEventsService } from "./operation-events.service";
import { CustomerSafeProjectionService } from "./customer-safe-projection.service";
import { GateEvaluatorService } from "./gate-evaluator.service";
import { PolicyResolutionService } from "../../control/policies/policy-resolution.service";
import { CapabilityResolutionService } from "../../control/capabilities/capability-resolution.service";
import { AuditService } from "../../audit/audit.service";
import type { PrismaService } from "../../runtime/database/prisma.service";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;
const audit = new AuditService(asService);
const caps = new CapabilityResolutionService(asService);
const policies = new PolicyResolutionService(asService, audit, caps);
const events = new OperationEventsService(asService, audit, new CustomerSafeProjectionService());
const gates = new GateEvaluatorService(asService, policies);
const lifecycle = new WorkOrderLifecycleService(asService, caps, events, gates, policies);
const work = new TechnicianWorkService(asService, events, lifecycle, policies);

describe("W3-A3-010 external-part billing", () => {
  it("CUSTOMER_SUPPLIED creates line with 0 price, not warranted, no stock movement", async () => {
    // A tenant that actually holds the three rows a work order needs.
    //
    // This used to take `tenant.findFirstOrThrow()` and then look for a
    // branch, a customer and an asset inside whatever came back. On a
    // test database carrying the workshops the HTTP suites leave behind,
    // the first tenant is regularly one with no customers at all, and the
    // test then failed on its own fixture rather than on the behaviour it
    // exists to prove. Asking for the tenant BY the rows required picks a
    // usable one by construction.
    const tenant = await prisma.tenant.findFirstOrThrow({
      where: { branches: { some: {} }, customers: { some: {} }, assets: { some: {} } },
      select: {
        id: true,
        branches: { take: 1, select: { id: true } },
        customers: { take: 1, select: { id: true } },
        assets: { take: 1, select: { id: true } },
      },
    });
    const workOrder = await prisma.workOrder.create({
      data: {
        tenantId: tenant.id,
        branchId: tenant.branches[0].id,
        assetId: tenant.assets[0].id,
        customerId: tenant.customers[0].id,
        status: "IN_PROGRESS",
      },
      select: { id: true, tenantId: true },
    });
    const line = await work.addExternalPartLine(workOrder.id, { name: "Customer Brake Pad", provenance: "CUSTOMER_SUPPLIED", quantity: 2 }, { accountId: "test", displayName: "Test", actorType: "TENANT_STAFF" });
    expect(line.sellingPrice.toString()).toBe("0");
    expect(line.workshopWarranted).toBe(false);
    expect(line.partRequestId).toBeNull();
    const gate = await gates.evaluate(workOrder.id, ["parts.external_resolved"], {}, "FINISH");
    expect(gate.passed).toBe(true);
    await prisma.workOrderPartLine.deleteMany({ where: { workOrderId: workOrder.id } });
    await prisma.workOrder.delete({ where: { id: workOrder.id } });
  });
});
