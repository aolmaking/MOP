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
    const tenant = await prisma.tenant.findFirstOrThrow({ select: { id: true } });
    const branch = await prisma.branch.findFirstOrThrow({ where: { tenantId: tenant.id }, select: { id: true } });
    const customer = await prisma.customer.findFirstOrThrow({ where: { tenantId: tenant.id }, select: { id: true } });
    const asset = await prisma.asset.findFirstOrThrow({ where: { tenantId: tenant.id }, select: { id: true } });
    const workOrder = await prisma.workOrder.create({
      data: { tenantId: tenant.id, branchId: branch.id, assetId: asset.id, customerId: customer.id, status: "IN_PROGRESS" },
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
