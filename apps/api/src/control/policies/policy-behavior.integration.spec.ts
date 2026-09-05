/**
 * Workshop Policy Runtime Enforcement -- Integration Suite
 *
 * Proves that policies are not passive database records or UI questionnaire items,
 * but real operational decisions that genuinely alter runtime behavior across
 * backend services, workflows, gates, role permissions, and customer visibility.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { PolicyResolutionService } from "./policy-resolution.service";
import { CapabilityResolutionService } from "../capabilities/capability-resolution.service";
import { AuditService } from "../../audit/audit.service";
import { GateEvaluatorService } from "../../systems/operations/gate-evaluator.service";
import { WorkOrderLifecycleService } from "../../systems/operations/work-order-lifecycle.service";
import { OperationEventsService } from "../../systems/operations/operation-events.service";
import { CustomerSafeProjectionService } from "../../systems/operations/customer-safe-projection.service";
import { TechnicianWorkService } from "../../systems/operations/technician-work.service";
import { FinanceService } from "../../systems/finance/finance.service";
import { BillingService } from "../../systems/billing/billing.service";
import { GenericBillingAdapter } from "../../systems/billing/generic-billing-adapter.service";
import { PriceCatalogService } from "../../systems/finance/price-catalog.service";
import { ChargeableItemsService } from "../../systems/operations/chargeable-items.service";
import { CustomerPortalService } from "../../systems/customer/customer-portal.service";
import type { PrismaService } from "../../runtime/database/prisma.service";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;

const audit = new AuditService(asService);
const caps = new CapabilityResolutionService(asService);
const policies = new PolicyResolutionService(asService, audit, caps);
const events = new OperationEventsService(asService, audit, new CustomerSafeProjectionService());
const gates = new GateEvaluatorService(asService, policies);
const lifecycle = new WorkOrderLifecycleService(asService, caps, events, gates, policies);
const techWork = new TechnicianWorkService(asService, events, lifecycle, policies);
const priceCatalog = new PriceCatalogService(asService, audit);
const billing = new BillingService(asService, new GenericBillingAdapter());
const finance = new FinanceService(
  asService,
  caps,
  events,
  billing,
  priceCatalog,
  policies,
  new ChargeableItemsService(asService),
  lifecycle,
);
const portal = new CustomerPortalService(asService, policies);

const SUFFIX = `pb-${Date.now()}`;
const PLATFORM_ACTOR = { accountId: "admin", displayName: "Platform Admin", actorType: "PLATFORM" as const };

let planId: string;
let tenantId: string;
let branchId: string;
let customerId: string;
let assetId: string;
let warehouseId: string;

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "Policy Behavior Plan",
      maxBranches: 5,
      maxUsers: 50,
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
      name: `Policy Shop ${SUFFIX}`,
      nameNormalized: `policy shop ${SUFFIX}`,
      slug: `policy-shop-${SUFFIX}`,
      customerRegistrationCode: `PS-${SUFFIX}`,
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

  const branch = await prisma.branch.create({
    data: {
      tenantId,
      code: `BR-${Date.now() % 10000}`,
      name: "Main Branch",
    },
  });
  branchId = branch.id;

  const customer = await prisma.customer.create({
    data: {
      tenantId,
      fullName: "Policy Customer",
      phone: `01${Date.now() % 100000000}`,
    },
  });
  customerId = customer.id;

  const asset = await prisma.asset.create({
    data: {
      tenantId,
      category: "CARS",
      plateNumber: `POL-${Date.now() % 10000}`,
      currentOwnerCustomerId: customer.id,
    },
  });
  assetId = asset.id;

  const warehouse = await prisma.warehouse.create({
    data: {
      tenantId,
      code: `WH-${Date.now() % 10000}`,
      name: "Main Warehouse",
    },
  });
  warehouseId = warehouse.id;

  // Seed baseline active capabilities
  for (const capKey of ["FINANCE_CORE", "INVENTORY", "WORK_ORDERS", "CUSTOMER_PORTAL"] as const) {
    await prisma.tenantCapability.create({
      data: {
        tenantId,
        capabilityKey: capKey,
        status: "ENABLED",
        source: "PLATFORM",
        configuredBy: "setup",
      },
    });
  }
}, 120_000);

afterAll(async () => {
  await prisma.workOrderPartLine.deleteMany({ where: { tenantId } });
  await prisma.task.deleteMany({ where: { workOrder: { tenantId } } });
  await prisma.creditNote.deleteMany({ where: { tenantId } });
  await prisma.refundRequest.deleteMany({ where: { tenantId } });
  await prisma.payment.deleteMany({ where: { tenantId } });
  await prisma.invoiceLine.deleteMany({ where: { tenantId } });
  await prisma.invoice.deleteMany({ where: { tenantId } });
  await prisma.workOrder.deleteMany({ where: { tenantId } });
  await prisma.warehouseStockBalance.deleteMany({ where: { tenantId } });
  await prisma.inventoryItem.deleteMany({ where: { tenantId } });
  await prisma.warehouse.deleteMany({ where: { tenantId } });
  await prisma.workshopPolicy.deleteMany({ where: { tenantId } });
  await prisma.tenantCapability.deleteMany({ where: { tenantId } });
  await prisma.asset.deleteMany({ where: { tenantId } });
  await prisma.customer.deleteMany({ where: { tenantId } });
  await prisma.branch.deleteMany({ where: { tenantId } });
  await prisma.staffUser.deleteMany({ where: { tenantId } });
  await prisma.account.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 120_000);

describe("DELIVERY_BLOCKED_UNTIL_PAID runtime enforcement", () => {
  it("ALWAYS blocks delivery when work order has an unpaid invoice, NEVER permits it", async () => {
    const wo = await prisma.workOrder.create({
      data: {
        tenantId,
        branchId,
        customerId,
        assetId,
        status: "READY_FOR_DELIVERY",
      },
    });

    // Create an issued invoice with balance > 0
    await prisma.invoice.create({
      data: {
        tenantId,
        branchId,
        workOrderId: wo.id,
        invoiceNumber: `INV-DELIV-${Date.now()}`,
        status: "ISSUED",
        subtotal: 500,
        total: 500,
        paid: 0,
        balance: 500,
        issuedById: "platform-account",
      },
    });

    // Configure ALWAYS: unpaid delivery must be rejected
    await policies.set(tenantId, "DELIVERY_BLOCKED_UNTIL_PAID", "ALWAYS", PLATFORM_ACTOR, "PLATFORM", "Payment required before keys");
    const blockedGate = await gates.evaluate(wo.id, ["payment.settled_or_policy_allows"], { FINANCE_CORE: "ENABLED" }, "DELIVERY");
    expect(blockedGate.passed).toBe(false);

    // Switch policy to NEVER: unpaid delivery is permitted (e.g. fleet/commercial account)
    await policies.set(tenantId, "DELIVERY_BLOCKED_UNTIL_PAID", "NEVER", PLATFORM_ACTOR, "PLATFORM", "Allow credit handover for accounts");
    const allowedGate = await gates.evaluate(wo.id, ["payment.settled_or_policy_allows"], { FINANCE_CORE: "ENABLED" }, "DELIVERY");
    expect(allowedGate.passed).toBe(true);
  });
});

describe("REFUND_AUTHORITY runtime enforcement", () => {
  it("OWNER_ONLY permits owner and blocks staff, DIFFERENT_FROM_REQUESTER refuses self-approval", async () => {
    // Create accounts & staff users: one OWNER, two regular CASHIERS
    const ownerAccount = await prisma.account.create({
      data: { tenantId, email: `owner-${Date.now()}@x.local`, accountType: "TENANT_STAFF", status: "ACTIVE" },
    });
    const ownerStaff = await prisma.staffUser.create({
      data: {
        tenantId,
        accountId: ownerAccount.id,
        fullName: "Workshop Owner",
        role: "TENANT_OWNER",
      },
    });

    const cashier1Account = await prisma.account.create({
      data: { tenantId, email: `c1-${Date.now()}@x.local`, accountType: "TENANT_STAFF", status: "ACTIVE" },
    });
    const cashier1 = await prisma.staffUser.create({
      data: {
        tenantId,
        accountId: cashier1Account.id,
        fullName: "Cashier One",
        role: "BRANCH_MANAGER",
      },
    });

    const cashier2Account = await prisma.account.create({
      data: { tenantId, email: `c2-${Date.now()}@x.local`, accountType: "TENANT_STAFF", status: "ACTIVE" },
    });
    const cashier2 = await prisma.staffUser.create({
      data: {
        tenantId,
        accountId: cashier2Account.id,
        fullName: "Cashier Two",
        role: "BRANCH_MANAGER",
      },
    });

    // Work order for the invoice
    const wo = await prisma.workOrder.create({
      data: { tenantId, branchId, customerId, assetId, status: "IN_PROGRESS" },
    });

    // Setup invoice
    const invoice = await prisma.invoice.create({
      data: {
        tenantId,
        branchId,
        workOrderId: wo.id,
        invoiceNumber: `INV-REFUND-${Date.now()}`,
        status: "ISSUED",
        subtotal: 200,
        total: 200,
        paid: 200,
        balance: 0,
        issuedById: cashier1.accountId,
      },
    });

    await finance.recordPayment(
      tenantId,
      invoice.id,
      { amount: "200.00", method: "CASH", idempotencyKey: `pay-ref-${Date.now()}` },
      {
        accountId: cashier1.accountId,
        displayName: cashier1.fullName,
        actorType: "TENANT_STAFF",
      },
    );

    // Request refund by cashier1
    const refund = await finance.requestRefund(
      tenantId,
      invoice.id,
      "50.00",
      "Overcharge dispute",
      { accountId: cashier1.accountId, displayName: cashier1.fullName, actorType: "TENANT_STAFF" },
    );

    // Under OWNER_ONLY policy: cashier1 is rejected, owner succeeds
    await policies.set(tenantId, "REFUND_AUTHORITY", "OWNER_ONLY", PLATFORM_ACTOR, "PLATFORM", "Owner must authorize cash refunds");

    await expect(
      finance.approveRefund(refund.id, {
        accountId: cashier1.accountId,
        displayName: cashier1.fullName,
        actorType: "TENANT_STAFF",
      }),
    ).rejects.toMatchObject({
      status: 403,
      response: { code: "refund_approval_restricted" },
    });

    // Owner approves successfully
    const approved = await finance.approveRefund(refund.id, {
      accountId: ownerStaff.accountId,
      displayName: ownerStaff.fullName,
      actorType: "TENANT_STAFF",
    });
    expect(approved.creditNoteNumber).toMatch(/^CN-\d{6}$/);

    // Request a second refund for DIFFERENT_FROM_REQUESTER test
    const refund2 = await finance.requestRefund(
      tenantId,
      invoice.id,
      "30.00",
      "Second adjustment",
      { accountId: cashier1.accountId, displayName: cashier1.fullName, actorType: "TENANT_STAFF" },
    );

    await policies.set(
      tenantId,
      "REFUND_AUTHORITY",
      "DIFFERENT_FROM_REQUESTER",
      PLATFORM_ACTOR,
      "PLATFORM",
      "Four-eyes principle for refunds",
    );

    // Requester cashier1 cannot approve their own refund
    await expect(
      finance.approveRefund(refund2.id, {
        accountId: cashier1.accountId,
        displayName: cashier1.fullName,
        actorType: "TENANT_STAFF",
      }),
    ).rejects.toMatchObject({
      status: 403,
      response: { code: "self_approval_forbidden" },
    });

    // Second cashier approves successfully
    const approved2 = await finance.approveRefund(refund2.id, {
      accountId: cashier2.accountId,
      displayName: cashier2.fullName,
      actorType: "TENANT_STAFF",
    });
    expect(approved2.creditNoteNumber).toMatch(/^CN-\d{6}$/);
  });
});

describe("CUSTOMER_SUPPLIED_PARTS & DIRECT_PART_PURCHASE runtime enforcement", () => {
  it("REFUSED blocks customer parts, DIRECT_PART_PURCHASE respects warehouse stock availability", async () => {
    const wo = await prisma.workOrder.create({
      data: {
        tenantId,
        branchId,
        customerId,
        assetId,
        status: "IN_PROGRESS",
      },
    });

    const staffActor = { accountId: "tech-1", displayName: "Technician", actorType: "TENANT_STAFF" as const };

    // Set CUSTOMER_SUPPLIED_PARTS = REFUSED
    await policies.set(tenantId, "CUSTOMER_SUPPLIED_PARTS", "REFUSED", PLATFORM_ACTOR, "PLATFORM", "Workshop policy: no customer parts");

    await expect(
      techWork.addExternalPartLine(wo.id, { name: "Brought Oil Filter", provenance: "CUSTOMER_SUPPLIED", quantity: 1 }, staffActor),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: "customer_parts_refused" },
    });

    // Switch to ACCEPTED_LIABILITY_RECORDED: succeeds with $0 selling price & no warranty
    await policies.set(tenantId, "CUSTOMER_SUPPLIED_PARTS", "ACCEPTED_LIABILITY_RECORDED", PLATFORM_ACTOR, "PLATFORM", "Allow customer parts with disclaimer");
    const custLine = await techWork.addExternalPartLine(
      wo.id,
      { name: "Brought Oil Filter", provenance: "CUSTOMER_SUPPLIED", quantity: 1 },
      staffActor,
    );
    expect(custLine.sellingPrice.toString()).toBe("0");
    expect(custLine.workshopWarranted).toBe(false);

    // DIRECT_PART_PURCHASE: NEVER disallows direct external purchases
    await policies.set(tenantId, "DIRECT_PART_PURCHASE", "NEVER", PLATFORM_ACTOR, "PLATFORM", "All parts must pass through store");
    await expect(
      techWork.addExternalPartLine(wo.id, { name: "Local Spark Plug", provenance: "EXTERNAL_PURCHASE", quantity: 4 }, staffActor),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: "direct_purchase_forbidden" },
    });

    // DIRECT_PART_PURCHASE: ONLY_IF_OUT_OF_STOCK
    await policies.set(tenantId, "DIRECT_PART_PURCHASE", "ONLY_IF_OUT_OF_STOCK", PLATFORM_ACTOR, "PLATFORM", "Buy locally only when store is empty");

    // Create item in warehouse with stock > 0
    const inStockItem = await prisma.inventoryItem.create({
      data: {
        tenantId,
        sku: `SKU-IN-${Date.now()}`,
        name: "Warehouse Wiper Blade",
        itemType: "PART",
        sellingPrice: 150,
        cost: 80,
      },
    });
    await prisma.warehouseStockBalance.create({
      data: {
        tenantId,
        inventoryItemId: inStockItem.id,
        warehouseId,
        availableQty: 5,
      },
    });

    // Attempting direct purchase of item that is currently in stock must be rejected
    await expect(
      techWork.addExternalPartLine(wo.id, { name: inStockItem.name, provenance: "EXTERNAL_PURCHASE", quantity: 1 }, staffActor),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: "warehouse_stock_available" },
    });

    // Out-of-stock item direct purchase is permitted
    const outOfStockBuy = await techWork.addExternalPartLine(
      wo.id,
      { name: "Special Out-of-Stock Sensor", provenance: "EXTERNAL_PURCHASE", quantity: 1 },
      staffActor,
    );
    expect(outOfStockBuy.name).toBe("Special Out-of-Stock Sensor");
    expect(outOfStockBuy.provenance).toBe("EXTERNAL_PURCHASE");
  });
});

describe("UNAPPROVED_WORK_EXECUTION runtime enforcement", () => {
  it("BLOCKED refuses task execution while waiting for customer approval", async () => {
    const wo = await prisma.workOrder.create({
      data: {
        tenantId,
        branchId,
        customerId,
        assetId,
        status: "WAITING_CUSTOMER",
      },
    });

    const task = await prisma.task.create({
      data: {
        tenantId,
        workOrderId: wo.id,
        title: "Additional Brake Caliper Service",
        status: "ASSIGNED",
      },
    });

    const staffActor = { accountId: "tech-1", displayName: "Technician", actorType: "TENANT_STAFF" as const };

    // Policy BLOCKED: Technician cannot start work on job awaiting customer
    await policies.set(tenantId, "UNAPPROVED_WORK_EXECUTION", "BLOCKED", PLATFORM_ACTOR, "PLATFORM", "Customer must approve first");

    await expect(techWork.startTask(task.id, staffActor)).rejects.toMatchObject({
      status: 409,
      response: { code: "work_not_authorized" },
    });

    // Lifecycle guard also refuses
    await expect(lifecycle.assertOperationalWorkAuthorized(wo.id)).rejects.toMatchObject({
      status: 409,
      response: { code: "work_not_authorized" },
    });

    // Customer approves and job transitions to IN_PROGRESS
    await prisma.workOrder.update({
      where: { id: wo.id },
      data: { status: "IN_PROGRESS" },
    });

    // Now starting task succeeds
    await techWork.startTask(task.id, staffActor);
    const started = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
    expect(started.status).toBe("IN_PROGRESS");
  });
});

describe("PROMISED_TIME_VISIBILITY customer portal enforcement", () => {
  it("HIDDEN strips promisedAt from customer portal view, VISIBLE presents it", async () => {
    const promisedDate = new Date(Date.now() + 86400000);
    const wo = await prisma.workOrder.create({
      data: {
        tenantId,
        branchId,
        customerId,
        assetId,
        status: "IN_PROGRESS",
        promisedAt: promisedDate,
      },
    });

    // HIDDEN policy: customer cannot see promised delivery time
    await policies.set(tenantId, "PROMISED_TIME_VISIBILITY", "HIDDEN", PLATFORM_ACTOR, "PLATFORM", "Do not expose promises externally");
    const hiddenPortal = await portal.currentService(tenantId, customerId);
    const hiddenWo = hiddenPortal.find((p) => p.workOrderId === wo.id);
    expect(hiddenWo).toBeDefined();
    expect(hiddenWo?.promisedAt).toBeNull();

    // VISIBLE policy: customer sees estimated delivery time
    await policies.set(tenantId, "PROMISED_TIME_VISIBILITY", "VISIBLE", PLATFORM_ACTOR, "PLATFORM", "Display promised completion time");
    const visiblePortal = await portal.currentService(tenantId, customerId);
    const visibleWo = visiblePortal.find((p) => p.workOrderId === wo.id);
    expect(visibleWo).toBeDefined();
    expect(visibleWo?.promisedAt).toBe(promisedDate.toISOString());
  });
});

describe("Capability-derived Policy Relevance & Applicability", () => {
  it("inventory policies are irrelevant when INVENTORY is disabled", async () => {
    // Disable INVENTORY capability
    const now = new Date();
    await prisma.tenantCapability.updateMany({
      where: { tenantId, capabilityKey: "INVENTORY", effectiveTo: null },
      data: { effectiveTo: now },
    });
    await prisma.tenantCapability.create({
      data: {
        tenantId,
        capabilityKey: "INVENTORY",
        status: "DISABLED",
        source: "PLATFORM",
        configuredBy: "test",
        effectiveFrom: now,
      },
    });

    // Parts policies must now be computed as irrelevant
    expect(await policies.isRelevant(tenantId, "CUSTOMER_SUPPLIED_PARTS")).toBe(false);
    expect(await policies.isRelevant(tenantId, "DIRECT_PART_PURCHASE")).toBe(false);

    // Finance policies remain relevant because FINANCE_CORE is still enabled
    expect(await policies.isRelevant(tenantId, "REFUND_AUTHORITY")).toBe(true);
    expect(await policies.isRelevant(tenantId, "DELIVERY_BLOCKED_UNTIL_PAID")).toBe(true);
  });
});
