/**
 * Workflow Health -- consistency checks, against a real database.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { WorkflowIntegrityService } from "./workflow-integrity.service";
import type { PrismaService } from "../../runtime/database/prisma.service";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;
const integrity = new WorkflowIntegrityService(asService);

const SUFFIX = `wint-${Date.now()}`;
let tenantId: string;
let planId: string;
let branchId: string;
let customerId: string;
let assetId: string;
let warehouseId: string;

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "Integrity Test",
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
      name: `WInt WS ${SUFFIX}`,
      nameNormalized: `wint ws ${SUFFIX}`,
      slug: `wint-ws-${SUFFIX}`,
      customerRegistrationCode: `WINT-${SUFFIX}`,
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

  const branch = await prisma.branch.create({ data: { tenantId, name: "Main", code: `MAIN-${SUFFIX}` } });
  branchId = branch.id;
  const warehouse = await prisma.warehouse.create({ data: { tenantId, name: "Central", code: `CTR-${SUFFIX}` } });
  warehouseId = warehouse.id;
  const customer = await prisma.customer.create({ data: { tenantId, fullName: "Hana", phone: "0100000004" } });
  customerId = customer.id;
  const asset = await prisma.asset.create({ data: { tenantId, category: "CARS", plateNumber: `P-${SUFFIX}` } });
  assetId = asset.id;
}, 120_000);

afterAll(async () => {
  await prisma.workflowIssueAcknowledgement.deleteMany({ where: { tenantId } });
  await prisma.customerDecisionItem.deleteMany({ where: { tenantId } });
  await prisma.customerDecisionRequest.deleteMany({ where: { tenantId } });
  await prisma.partReturnRequest.deleteMany({ where: { tenantId } });
  await prisma.issuedItem.deleteMany({ where: { tenantId } });
  await prisma.partRequest.deleteMany({ where: { tenantId } });
  await prisma.task.deleteMany({ where: { tenantId } });
  await prisma.teamMembership.deleteMany({ where: { tenantId } });
  await prisma.team.deleteMany({ where: { tenantId } });
  await prisma.operationEvent.deleteMany({ where: { tenantId } });
  await prisma.workOrder.deleteMany({ where: { tenantId } });
  await prisma.inventoryItem.deleteMany({ where: { tenantId } });
  await prisma.asset.deleteMany({ where: { tenantId } });
  await prisma.customer.deleteMany({ where: { tenantId } });
  await prisma.staffUser.deleteMany({ where: { tenantId } });
  await prisma.account.deleteMany({ where: { tenantId } });
  await prisma.warehouse.deleteMany({ where: { tenantId } });
  await prisma.branch.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 120_000);

describe("WorkflowIntegrityService", () => {
  it("flags a part issued and never confirmed arrived, beyond the threshold", async () => {
    const wo = await prisma.workOrder.create({ data: { tenantId, branchId, assetId, customerId, status: "IN_PROGRESS" } });
    const item = await prisma.inventoryItem.create({
      data: { tenantId, sku: `SKU-${SUFFIX}`, name: "Filter", itemType: "PART", sellingPrice: 50 },
    });
    // ISSUED, not the default DRAFT. A request with a hand-over against
    // it is by definition not a draft, and the check now asks whether
    // the request is genuinely still out there -- so a fixture in an
    // impossible state would prove nothing about the real one.
    const partRequest = await prisma.partRequest.create({
      data: {
        tenantId,
        workOrderId: wo.id,
        inventoryItemId: item.id,
        requestedById: "staff-1",
        quantity: 1,
        status: "ISSUED",
      },
    });
    await prisma.issuedItem.create({
      data: {
        tenantId,
        partRequestId: partRequest.id,
        warehouseId,
        quantity: 1,
        issuedById: "staff-1",
        issuedAt: new Date(Date.now() - 30 * 60 * 60 * 1000),
        arrivedAt: null,
      },
    });

    const report = await integrity.build(tenantId);
    expect(report.issues.some((i) => i.type === "PART_ARRIVAL_UNCONFIRMED")).toBe(true);
  });

  /**
   * The bug this check had for its whole life.
   *
   * `arrivedAt` was written by nothing at all, and this check had no
   * status filter, so every part the workshop had ever issued -- fitted
   * months ago, on a closed job -- was reported as "arrival unconfirmed"
   * forever. The Owner's workflow-health page filled with permanent
   * noise, which is how a real warning stops being read.
   *
   * A part that reached the technician has had the arrival question
   * answered by a later fact, whether or not anybody pressed "arrived" --
   * and the graph deliberately lets an in-house hand-over skip ARRIVED
   * rather than write one nobody witnessed.
   */
  it("does not flag a part the technician already has, even with no arrival recorded", async () => {
    const wo = await prisma.workOrder.create({ data: { tenantId, branchId, assetId, customerId, status: "IN_PROGRESS" } });
    const item = await prisma.inventoryItem.create({
      data: { tenantId, sku: `SKU-FITTED-${SUFFIX}`, name: "Fitted pad", itemType: "PART", sellingPrice: 50 },
    });
    const partRequest = await prisma.partRequest.create({
      data: {
        tenantId,
        workOrderId: wo.id,
        inventoryItemId: item.id,
        requestedById: "staff-1",
        quantity: 1,
        status: "USED",
      },
    });
    const fitted = await prisma.issuedItem.create({
      data: {
        tenantId,
        partRequestId: partRequest.id,
        warehouseId,
        quantity: 1,
        issuedById: "staff-1",
        issuedAt: new Date(Date.now() - 30 * 60 * 60 * 1000),
        arrivedAt: null,
        receivedAt: new Date(Date.now() - 29 * 60 * 60 * 1000),
        usedAt: new Date(Date.now() - 28 * 60 * 60 * 1000),
      },
    });

    const report = await integrity.build(tenantId);
    expect(
      report.issues.some((i) => i.type === "PART_ARRIVAL_UNCONFIRMED" && i.entityId === fitted.id),
    ).toBe(false);
  });

  it("does not flag a part issued recently, within the threshold", async () => {
    const wo = await prisma.workOrder.create({ data: { tenantId, branchId, assetId, customerId, status: "IN_PROGRESS" } });
    const item = await prisma.inventoryItem.create({
      data: { tenantId, sku: `SKU2-${SUFFIX}`, name: "Belt", itemType: "PART", sellingPrice: 30 },
    });
    const partRequest = await prisma.partRequest.create({
      data: { tenantId, workOrderId: wo.id, inventoryItemId: item.id, requestedById: "staff-1", quantity: 1 },
    });
    const recentIssue = await prisma.issuedItem.create({
      data: { tenantId, partRequestId: partRequest.id, warehouseId, quantity: 1, issuedById: "staff-1", arrivedAt: null },
    });

    const report = await integrity.build(tenantId);
    expect(report.issues.some((i) => i.entityId === recentIssue.id)).toBe(false);
  });

  it("flags a fully-answered decision request whose work order is still waiting", async () => {
    const wo = await prisma.workOrder.create({
      data: { tenantId, branchId, assetId, customerId, status: "AWAITING_CUSTOMER_APPROVAL" },
    });
    const request = await prisma.customerDecisionRequest.create({
      data: {
        tenantId,
        workOrderId: wo.id,
        customerId,
        status: "PARTIALLY_RESPONDED",
        secureToken: `tok-${SUFFIX}-1`,
        createdById: "staff-1",
      },
    });
    await prisma.customerDecisionItem.create({
      data: {
        tenantId,
        decisionRequestId: request.id,
        name: "Brake pads",
        explanation: "Worn",
        importance: "HIGH",
        price: 100,
        total: 100,
        decision: "APPROVED",
        decidedAt: new Date(),
      },
    });

    const report = await integrity.build(tenantId);
    expect(report.issues.some((i) => i.type === "CUSTOMER_RESPONSE_NOT_REFLECTED" && i.entityId === request.id)).toBe(
      true,
    );
  });

  it("flags a return request open past the review threshold", async () => {
    const wo = await prisma.workOrder.create({ data: { tenantId, branchId, assetId, customerId, status: "IN_PROGRESS" } });
    const item = await prisma.inventoryItem.create({
      data: { tenantId, sku: `SKU3-${SUFFIX}`, name: "Spark plug", itemType: "PART", sellingPrice: 20 },
    });
    const partRequest = await prisma.partRequest.create({
      data: { tenantId, workOrderId: wo.id, inventoryItemId: item.id, requestedById: "staff-1", quantity: 1 },
    });
    const returnRequest = await prisma.partReturnRequest.create({
      data: {
        tenantId,
        partRequestId: partRequest.id,
        quantity: 1,
        requestedById: "staff-1",
        warehouseId,
        createdAt: new Date(Date.now() - 60 * 60 * 60 * 1000),
      },
    });

    const report = await integrity.build(tenantId);
    expect(report.issues.some((i) => i.type === "RETURN_PENDING_REVIEW" && i.entityId === returnRequest.id)).toBe(true);
  });

  it("flags a work order whose tasks are all done but the work order itself has not advanced", async () => {
    const wo = await prisma.workOrder.create({ data: { tenantId, branchId, assetId, customerId, status: "IN_PROGRESS" } });
    await prisma.task.create({ data: { tenantId, workOrderId: wo.id, title: "Replace oil", status: "DONE" } });

    const report = await integrity.build(tenantId);
    expect(report.issues.some((i) => i.type === "WORK_ORDER_TASK_STATUS_CONFLICT" && i.entityId === wo.id)).toBe(true);
  });

  it("flags a moved work order with zero status-change history as orphaned", async () => {
    const wo = await prisma.workOrder.create({ data: { tenantId, branchId, assetId, customerId, status: "CLOSED" } });
    // Deliberately no OperationEvent written -- simulating a status set by something other than the lifecycle service.

    const report = await integrity.build(tenantId);
    expect(report.issues.some((i) => i.type === "ORPHANED_STATUS_CHANGE" && i.entityId === wo.id)).toBe(true);
  });

  it("does not flag a work order whose status change is properly recorded", async () => {
    const wo = await prisma.workOrder.create({ data: { tenantId, branchId, assetId, customerId, status: "CLOSED" } });
    await prisma.operationEvent.create({
      data: {
        tenantId,
        eventKey: "work_order.status_changed",
        payload: { workOrderId: wo.id, from: "IN_PROGRESS", to: "CLOSED" },
        actorId: "staff-1",
        actorType: "TENANT_STAFF",
      },
    });

    const report = await integrity.build(tenantId);
    expect(report.issues.some((i) => i.type === "ORPHANED_STATUS_CHANGE" && i.entityId === wo.id)).toBe(false);
  });

  it("flags a Team Leader who manages an active team but whose role cannot view team reports", async () => {
    const account = await prisma.account.create({
      data: { accountType: "TENANT_STAFF", tenantId, email: `tl-${SUFFIX}@example.com`, status: "ACTIVE" },
    });
    const leader = await prisma.staffUser.create({
      data: { accountId: account.id, tenantId, fullName: "Team Leader Test", role: "TEAM_LEADER" },
    });
    await prisma.team.create({
      data: { tenantId, name: `Team ${SUFFIX}`, teamLeaderId: leader.id, isActive: true },
    });
    // No RolePermission row for TEAM_LEADER/reports.team.view -- falls back to the platform default.

    const report = await integrity.build(tenantId);
    const found = report.issues.find(
      (i) => i.type === "TEAM_LEADER_MISSING_REPORT_ACCESS" && i.entityId === leader.id,
    );
    // Only assert if the platform default for this key is actually false --
    // if a future default grants it, this specific leader should NOT be flagged.
    const { DEFAULT_ROLE_PERMISSIONS } = await import("@mop/shared");
    const defaultAllowed = DEFAULT_ROLE_PERMISSIONS.TEAM_LEADER?.["reports.team.view"] ?? false;
    if (!defaultAllowed) {
      expect(found).toBeDefined();
    } else {
      expect(found).toBeUndefined();
    }
  });

  it("names the Customer-Portal-policy check as explicitly not computable, rather than faking it", async () => {
    const report = await integrity.build(tenantId);
    expect(report.notComputable.some((n) => n.issueType === "CUSTOMER_PORTAL_POLICY_MODULE_CONTRADICTION")).toBe(true);
  });

  it("never leaks across tenants", async () => {
    const otherTenant = await prisma.tenant.create({
      data: {
        name: `WInt Other ${SUFFIX}`,
        nameNormalized: `wint other ${SUFFIX}`,
        slug: `wint-other-${SUFFIX}`,
        customerRegistrationCode: `WINTO-${SUFFIX}`,
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

    const report = await integrity.build(otherTenant.id);
    expect(report.issues).toEqual([]);

    await prisma.tenant.delete({ where: { id: otherTenant.id } });
  });
});

/**
 * The issue lifecycle.
 *
 * Workflow Health detects derived facts, so the issues themselves are
 * never stored -- storing them would create a second copy that drifts
 * from the records they came from, which is the exact failure this page
 * exists to catch. What cannot be recomputed is what a person decided, so
 * that is the only thing persisted, keyed by a fingerprint that is stable
 * across scans.
 */
describe("WorkflowIntegrityService -- issue lifecycle", () => {
  const ACTOR = { accountId: "owner-acct", displayName: "Amira Hassan" };

  async function anyIssue() {
    const report = await integrity.build(tenantId);
    expect(report.issues.length).toBeGreaterThan(0);
    return report.issues[0];
  }

  it("gives every issue an id that survives a rescan", async () => {
    const first = await integrity.build(tenantId);
    const second = await integrity.build(tenantId);

    const idsA = first.issues.map((i) => i.id).sort();
    const idsB = second.issues.map((i) => i.id).sort();
    expect(idsA).toEqual(idsB);
    // The id says what the issue is about, so it can be acted on without
    // a lookup table.
    expect(first.issues[0].id.split(":").length).toBeGreaterThanOrEqual(3);
  });

  it("starts every issue OPEN, and remembers a decision across rescans", async () => {
    const issue = await anyIssue();
    expect(issue.status).toBe("OPEN");

    await integrity.acknowledge(
      tenantId,
      issue.id,
      { status: "INVESTIGATING", note: "Checking the event history for this job." },
      ACTOR,
    );

    const after = await integrity.build(tenantId);
    const same = after.issues.find((i) => i.id === issue.id);
    expect(same!.status).toBe("INVESTIGATING");
    expect(same!.note).toBe("Checking the event history for this job.");
    expect(same!.handledBy).toBe("Amira Hassan");
    expect(same!.handledAt).not.toBeNull();
  });

  it("updates the decision rather than accumulating rows", async () => {
    const issue = await anyIssue();

    await integrity.acknowledge(tenantId, issue.id, { status: "ACKNOWLEDGED", note: "Seen it." }, ACTOR);
    await integrity.acknowledge(tenantId, issue.id, { status: "ESCALATED", note: "Raised with the platform." }, ACTOR);

    const rows = await prisma.workflowIssueAcknowledgement.count({ where: { tenantId, fingerprint: issue.id } });
    expect(rows).toBe(1);

    const after = await integrity.build(tenantId);
    expect(after.issues.find((i) => i.id === issue.id)!.status).toBe("ESCALATED");
  });

  it("refuses an acknowledgement with no reason, because that is indistinguishable from nobody looking", async () => {
    const issue = await anyIssue();
    await expect(
      integrity.acknowledge(tenantId, issue.id, { status: "ACKNOWLEDGED", note: "  " }, ACTOR),
    ).rejects.toThrow(/what you found/i);
  });

  it("groups by fault class, so the Owner sees one cause rather than N symptoms", async () => {
    const report = await integrity.build(tenantId);

    expect(report.groups.length).toBeGreaterThan(0);
    for (const group of report.groups) {
      expect(group.total).toBeGreaterThan(0);
      expect(group.open + group.handled).toBe(group.total);
      // A group has to explain itself, not just count.
      expect(group.whatItMeans.length).toBeGreaterThan(20);
      expect(group.recommendedAction.length).toBeGreaterThan(10);
      expect(group.fixableBy.length).toBeGreaterThan(0);
    }
    // Most severe first.
    const severities = report.groups.map((g) => g.severity);
    const rank = { CRITICAL: 0, WARNING: 1, INFO: 2 } as const;
    expect(severities.map((sv) => rank[sv])).toEqual([...severities.map((sv) => rank[sv])].sort((a, b) => a - b));
  });

  it("filters the list without distorting the totals", async () => {
    const all = await integrity.build(tenantId);
    const criticalOnly = await integrity.build(tenantId, { severity: "CRITICAL" });

    expect(criticalOnly.issues.every((i) => i.severity === "CRITICAL")).toBe(true);
    // Totals describe everything detected, so the filter controls can say
    // what they would reveal rather than collapsing to the current view.
    expect(criticalOnly.totals).toEqual(all.totals);
  });

  it("separates what nobody has looked at from what somebody has", async () => {
    const issue = await anyIssue();
    await integrity.acknowledge(tenantId, issue.id, { status: "ACKNOWLEDGED", note: "Looked at this one." }, ACTOR);

    const open = await integrity.build(tenantId, { status: "open" });
    const handled = await integrity.build(tenantId, { status: "handled" });

    expect(open.issues.some((i) => i.id === issue.id)).toBe(false);
    expect(handled.issues.some((i) => i.id === issue.id)).toBe(true);
    expect(handled.totals.handled).toBeGreaterThanOrEqual(1);
  });

  it("reports when it scanned, so nobody acts on a stale page", async () => {
    const before = Date.now();
    const report = await integrity.build(tenantId);
    expect(new Date(report.scannedAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it("never shows one workshop's decisions on another's issues", async () => {
    const issue = await anyIssue();
    await integrity.acknowledge(tenantId, issue.id, { status: "ESCALATED", note: "Ours, not theirs." }, ACTOR);

    // Same fingerprint, different tenant: the decision must not leak.
    const otherPlan = await prisma.plan.create({
      data: {
        code: `PLAN-WIL-${SUFFIX}`,
        name: "Other",
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
    const other = await prisma.tenant.create({
      data: {
        name: `WIL Other ${SUFFIX}`,
        nameNormalized: `wil other ${SUFFIX}`,
        slug: `wil-other-${SUFFIX}`,
        customerRegistrationCode: `WILO-${SUFFIX}`,
        status: "ACTIVE",
        planId: otherPlan.id,
        country: "EG",
        city: "Cairo",
        businessType: "Garage",
        primaryCategory: "CARS",
        currency: "EGP",
        timezone: "Africa/Cairo",
      },
    });

    const leaked = await prisma.workflowIssueAcknowledgement.count({
      where: { tenantId: other.id, fingerprint: issue.id },
    });
    expect(leaked).toBe(0);

    await prisma.tenant.delete({ where: { id: other.id } });
    await prisma.plan.delete({ where: { id: otherPlan.id } });
  });
});
