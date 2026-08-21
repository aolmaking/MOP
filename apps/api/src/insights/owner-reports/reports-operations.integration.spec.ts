/**
 * Reports & Analytics -- Operations, against a real database. Exercises
 * the historical-duration path against real OperationEvent rows shaped
 * exactly like work-order-lifecycle.service.ts's own emit() call
 * (payload: { workOrderId, from, to }), rather than re-driving the full
 * lifecycle machinery (that has its own dedicated tests).
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { TERMINAL_STATUSES } from "./lifecycle-duration.util";
import { ReportsOperationsService } from "./reports-operations.service";
import type { PrismaService } from "../../runtime/database/prisma.service";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;
const operations = new ReportsOperationsService(asService);

const SUFFIX = `rops-${Date.now()}`;
let tenantId: string;
let planId: string;
let branchId: string;
let customerId: string;
let assetId: string;

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "Ops Test",
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
      name: `ROp WS ${SUFFIX}`,
      nameNormalized: `rop ws ${SUFFIX}`,
      slug: `rop-ws-${SUFFIX}`,
      customerRegistrationCode: `ROP-${SUFFIX}`,
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
  const customer = await prisma.customer.create({ data: { tenantId, fullName: "Youssef", phone: "0100000002" } });
  customerId = customer.id;
  const asset = await prisma.asset.create({ data: { tenantId, category: "CARS", plateNumber: `P-${SUFFIX}` } });
  assetId = asset.id;
}, 120_000);

afterAll(async () => {
  await prisma.operationEvent.deleteMany({ where: { tenantId } });
  await prisma.workOrder.deleteMany({ where: { tenantId } });
  await prisma.asset.deleteMany({ where: { tenantId } });
  await prisma.customer.deleteMany({ where: { tenantId } });
  await prisma.branch.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 120_000);

async function emitStatusChange(workOrderId: string, from: string, to: string, at: Date) {
  return prisma.operationEvent.create({
    data: {
      tenantId,
      eventKey: "work_order.status_changed",
      payload: { workOrderId, from, to },
      actorId: "staff-1",
      actorType: "TENANT_STAFF",
      createdAt: at,
    },
  });
}

describe("ReportsOperationsService -- historical duration from real event history", () => {
  it("computes average time in WAITING_PARTS from the status-change event trail, not the current snapshot", async () => {
    const wo = await prisma.workOrder.create({
      data: { tenantId, branchId, assetId, customerId, status: "IN_PROGRESS" },
    });

    const t0 = new Date("2026-01-01T00:00:00Z");
    await emitStatusChange(wo.id, "DRAFT", "IN_PROGRESS", t0);
    await emitStatusChange(wo.id, "IN_PROGRESS", "WAITING_PARTS", new Date(t0.getTime() + 1 * 60 * 60 * 1000));
    await emitStatusChange(wo.id, "WAITING_PARTS", "IN_PROGRESS", new Date(t0.getTime() + 5 * 60 * 60 * 1000));

    const report = await operations.build(tenantId, {
      from: t0.toISOString(),
      to: new Date(t0.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    });

    const waitingParts = report.averageTimeInStatus.find((r) => r.status === "WAITING_PARTS");
    expect(waitingParts).toBeDefined();
    expect(waitingParts!.averageHours).toBeGreaterThan(3.9);
    expect(waitingParts!.averageHours).toBeLessThan(4.1);
  });

  it("never reports an average time in a terminal status, however wide the range", async () => {
    const wo = await prisma.workOrder.create({
      data: { tenantId, branchId, assetId, customerId, status: "CLOSED" },
    });

    const t0 = new Date("2026-01-01T00:00:00Z");
    await emitStatusChange(wo.id, "DRAFT", "IN_PROGRESS", t0);
    await emitStatusChange(wo.id, "IN_PROGRESS", "CLOSED", new Date(t0.getTime() + 2 * 60 * 60 * 1000));

    const narrow = await operations.build(tenantId, {
      from: t0.toISOString(),
      to: new Date(t0.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    });
    const wide = await operations.build(tenantId, {
      from: t0.toISOString(),
      to: new Date(t0.getTime() + 300 * 24 * 60 * 60 * 1000).toISOString(),
    });

    // The slice for a terminal state runs to the end of the range, so
    // publishing it made "average time in CLOSED" grow with the dates
    // asked for rather than describing the workshop.
    expect(narrow.averageTimeInStatus.find((r) => r.status === "CLOSED")).toBeUndefined();
    expect(wide.averageTimeInStatus.find((r) => r.status === "CLOSED")).toBeUndefined();

    // Non-terminal stages are still reported -- the filter removes the
    // meaningless rows, not the metric. (Their values are deliberately
    // not compared across ranges: a job still sitting in IN_PROGRESS
    // really has been there longer by the wider range's end date, which
    // is the open-ended span working as intended.)
    expect(narrow.averageTimeInStatus.some((r) => r.status === "IN_PROGRESS")).toBe(true);
    expect(narrow.averageTimeInStatus.every((r) => !TERMINAL_STATUSES.includes(r.status))).toBe(true);
    expect(wide.averageTimeInStatus.every((r) => !TERMINAL_STATUSES.includes(r.status))).toBe(true);
  });

  it("reflects the current status distribution regardless of date range (a snapshot, not history)", async () => {
    await prisma.workOrder.create({ data: { tenantId, branchId, assetId, customerId, status: "CLOSED" } });

    const report = await operations.build(tenantId, {});
    const closed = report.statusDistribution.find((r) => r.status === "CLOSED");
    expect(closed).toBeDefined();
    expect(closed!.count).toBeGreaterThanOrEqual(1);
  });

  it("counts a non-terminal work order past its promisedAt as delayed", async () => {
    await prisma.workOrder.create({
      data: {
        tenantId,
        branchId,
        assetId,
        customerId,
        status: "IN_PROGRESS",
        promisedAt: new Date(Date.now() - 60 * 60 * 1000),
      },
    });

    const report = await operations.build(tenantId, {});
    expect(report.delayedJobs).toBeGreaterThanOrEqual(1);
  });

  it("handles a workshop with no status-change history at all", async () => {
    const emptyTenant = await prisma.tenant.create({
      data: {
        name: `ROp Empty ${SUFFIX}`,
        nameNormalized: `rop empty ${SUFFIX}`,
        slug: `rop-empty-${SUFFIX}`,
        customerRegistrationCode: `ROPE-${SUFFIX}`,
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

    const report = await operations.build(emptyTenant.id, {});
    expect(report.averageTimeInStatus).toEqual([]);
    expect(report.statusDistribution).toEqual([]);
    expect(report.cancellationRate).toBe(0);

    await prisma.tenant.delete({ where: { id: emptyTenant.id } });
  });
});

/**
 * Vehicle throughput over time -- "how many cars did we do today, and
 * this month". The Owner's most basic operational question, and one
 * Reports could not answer before: the page had a status snapshot and a
 * financial trend, but nothing counted work in and out over time, so a
 * busy week and a quiet one looked identical.
 */
describe("ReportsOperationsService -- volume over time", () => {
  it("counts vehicles in and out per bucket, and totals the range", async () => {
    const now = new Date();
    // Created and closed today.
    const closed = await prisma.workOrder.create({
      data: { tenantId, branchId, assetId, customerId, status: "CLOSED", closedAt: now },
    });
    // Created today, still open -- counts as created, not closed.
    const open = await prisma.workOrder.create({
      data: { tenantId, branchId, assetId, customerId, status: "IN_PROGRESS" },
    });

    const report = await operations.build(tenantId, {});

    expect(report.volume.length).toBeGreaterThan(0);
    expect(report.volumeTotals.created).toBeGreaterThanOrEqual(2);
    expect(report.volumeTotals.closed).toBeGreaterThanOrEqual(1);
    // Buckets arrive in chronological order so a chart can render them as-is.
    const buckets = report.volume.map((p) => p.bucket);
    expect([...buckets].sort()).toEqual(buckets);

    await prisma.workOrder.deleteMany({ where: { id: { in: [closed.id, open.id] } } });
  });

  it("honours the requested granularity", async () => {
    const daily = await operations.build(tenantId, { groupBy: "day" });
    const monthly = await operations.build(tenantId, { groupBy: "month" });

    // A month cannot contain more buckets than the days inside it.
    expect(monthly.volume.length).toBeLessThanOrEqual(daily.volume.length);
    // Whatever the bucketing, the same work is counted.
    expect(monthly.volumeTotals.created).toBe(daily.volumeTotals.created);
  });

  it("states the granularity it actually bucketed by, and truncates to it", async () => {
    const monthly = await operations.build(tenantId, { groupBy: "month" });

    expect(monthly.granularity).toBe("month");
    // Every month bucket must land on the first of a month at midnight --
    // proof the series really is monthly and not day buckets relabelled.
    for (const point of monthly.volume) {
      const d = new Date(point.bucket);
      expect(d.getUTCDate()).toBe(1);
    }
  });

  it("reports day when the caller asks for something it does not support", async () => {
    // resolveGranularity falls back to day. The response must say so,
    // otherwise a chart would label day buckets with the caller's word.
    const report = await operations.build(tenantId, { groupBy: "fortnight" });

    expect(report.granularity).toBe("day");
  });

  it("never counts another workshop's vehicles", async () => {
    const otherPlan = await prisma.plan.create({
      data: {
        code: `PLAN-OTHER-${SUFFIX}`,
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
        name: `Other WS ${SUFFIX}`,
        nameNormalized: `other ws ${SUFFIX}`,
        slug: `other-ws-${SUFFIX}`,
        customerRegistrationCode: `OTHV-${SUFFIX}`,
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

    const report = await operations.build(other.id, {});
    expect(report.volumeTotals).toEqual({ created: 0, closed: 0 });

    await prisma.tenant.delete({ where: { id: other.id } });
    await prisma.plan.delete({ where: { id: otherPlan.id } });
  });
});
