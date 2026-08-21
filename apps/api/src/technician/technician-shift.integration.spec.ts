/**
 * Phase 6 exit criterion: a technician's shift, and what the branch
 * manager sees while it happens.
 *
 * Phase 5's walkthrough proved the manager's five surfaces agree with
 * each other. This proves something different and harder: that what a
 * technician records on a tablet reaches the manager's screen correctly
 * and promptly. Those are two different roles reading two different APIs
 * over the same rows, which is exactly where a system starts lying to
 * one of them.
 *
 * It also pins the scope rule that cannot be checked from the UI: a
 * technician sees their own work and gets a 404 -- not a filtered list --
 * for anything else.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { IntakeService } from "../operations/intake.service";
import { WorkOrderLifecycleService } from "../operations/work-order-lifecycle.service";
import { GateEvaluatorService } from "../operations/gate-evaluator.service";
import { OperationEventsService } from "../operations/operation-events.service";
import { CustomerSafeProjectionService } from "../operations/customer-safe-projection.service";
import { TechnicianWorkService } from "../operations/technician-work.service";
import { CapabilityResolutionService } from "../capabilities/capability-resolution.service";
import { AuditService } from "../audit/audit.service";
import { AttentionQueueService } from "../branch-manager/attention-queue.service";
import { TechnicianWorkViewService } from "./technician-work-view.service";
import { AssetHistoryService } from "../vehicle-history/asset-history.service";
import type { PrismaService } from "../database/prisma.service";
import { PolicyResolutionService } from "../policies/policy-resolution.service";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;

/**
 * Policies read at runtime by the services under test. Backed by the
 * real Prisma client, so a test that writes a WorkshopPolicy row sees
 * the behaviour change -- a stub here would prove nothing about the
 * thing these tests exist to prove.
 */
const policiesForTest = new PolicyResolutionService(
  asService,
  new AuditService(asService),
  new CapabilityResolutionService(asService),
);

const events = new OperationEventsService(asService, new AuditService(asService), new CustomerSafeProjectionService());
const lifecycle = new WorkOrderLifecycleService(
  asService,
  new CapabilityResolutionService(asService),
  events,
  new GateEvaluatorService(asService, policiesForTest),
  policiesForTest,
);
const intake = new IntakeService(asService, events, lifecycle);
const techWork = new TechnicianWorkService(asService, events, lifecycle, policiesForTest);
const techView = new TechnicianWorkViewService(asService, lifecycle, new AssetHistoryService(asService));
const attention = new AttentionQueueService(asService);

const ACTOR = { accountId: "tech-1", displayName: "Hassan Fathy", actorType: "TENANT_STAFF" as const };
const SUFFIX = `shift-${Date.now()}`;

let tenantId: string;
let planId: string;
let branchId: string;
let mineStaffId: string;
let theirsStaffId: string;
let myJobId: string;
let theirJobId: string;
let myTaskId: string;

async function makeTechnician(name: string): Promise<string> {
  const account = await prisma.account.create({
    data: { accountType: "TENANT_STAFF", tenantId, email: `${name}-${SUFFIX}@x.local`, status: "ACTIVE" },
  });
  const staff = await prisma.staffUser.create({
    data: {
      accountId: account.id,
      tenantId,
      fullName: name,
      role: "TECHNICIAN",
      branchScope: [],
      warehouseScope: [],
      categoryScope: ["CARS"],
    },
  });
  return staff.id;
}

async function bookIn(plate: string): Promise<string> {
  const result = await intake.intake(
    {
      tenantId,
      branchId,
      customer: { fullName: `Owner ${plate}`, phone: `0100${Math.floor(Math.random() * 9000000 + 1000000)}` },
      asset: { category: "CARS", plateNumber: plate },
    },
    ACTOR,
  );
  return result.workOrderId;
}

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "Shift",
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
      name: `Shift WS ${SUFFIX}`,
      nameNormalized: `shift ws ${SUFFIX}`,
      slug: `shift-ws-${SUFFIX}`,
      customerRegistrationCode: `SH-${SUFFIX}`,
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

  mineStaffId = await makeTechnician("Mine");
  theirsStaffId = await makeTechnician("Theirs");

  myJobId = await bookIn(`MINE-${Date.now() % 10000}`);
  theirJobId = await bookIn(`THEIRS-${Date.now() % 10000}`);

  await prisma.workOrderAssignment.create({ data: { tenantId, workOrderId: myJobId, staffUserId: mineStaffId } });
  await prisma.workOrderAssignment.create({ data: { tenantId, workOrderId: theirJobId, staffUserId: theirsStaffId } });
}, 180_000);

afterAll(async () => {
  const where = { tenantId };
  await prisma.taskBlocker.deleteMany({ where });
  await prisma.taskAssignment.deleteMany({ where });
  await prisma.task.deleteMany({ where });
  await prisma.fault.deleteMany({ where });
  await prisma.customerDecisionItem.deleteMany({ where });
  await prisma.customerDecisionRequest.deleteMany({ where });
  await prisma.operationEvent.deleteMany({ where });
  await prisma.auditLog.deleteMany({ where });
  await prisma.customerTimelineEvent.deleteMany({ where });
  await prisma.workOrderAssignment.deleteMany({ where });
  await prisma.workOrder.deleteMany({ where });
  await prisma.assetOwnershipHistory.deleteMany({ where });
  await prisma.asset.deleteMany({ where });
  await prisma.customer.deleteMany({ where });
  await prisma.staffUser.deleteMany({ where });
  await prisma.account.deleteMany({ where: { tenantId } });
  await prisma.branch.deleteMany({ where });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 180_000);

describe("a technician's shift", () => {
  it("sees only their own work", async () => {
    const mine = await techView.myWork(mineStaffId, tenantId);

    expect(mine.map((job) => job.workOrderId)).toContain(myJobId);
    expect(mine.map((job) => job.workOrderId)).not.toContain(theirJobId);
  });

  it("is refused another technician's job outright, not shown a filtered version", async () => {
    // A filtered response would still confirm the job exists. Absent
    // beats hidden -- anyone can open developer tools on a workshop
    // tablet.
    await expect(techView.workCard(mineStaffId, tenantId, theirJobId)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("has nothing 'on now' until they actually start something", async () => {
    // Assignment is not activity. A technician with nine assigned jobs
    // still has exactly one car in their hands, and guessing from
    // assignment alone would put the wrong one on the page they never tap.
    await techWork.createTask(myJobId, "Replace front brake pads", ACTOR, mineStaffId);
    const beforeStart = await techView.activeJob(mineStaffId, tenantId);

    expect(beforeStart).toBeNull();
  });

  it("shows the job as 'on now' once a task is started", async () => {
    const card = await techView.workCard(mineStaffId, tenantId, myJobId);
    myTaskId = card.tasks[0].id;

    await techWork.startTask(myTaskId, ACTOR);
    const active = await techView.activeJob(mineStaffId, tenantId);

    expect(active?.workOrderId).toBe(myJobId);
  });

  it("refuses to start a task that somebody has declared blocked", async () => {
    // A task declared un-workable must not become workable because a
    // different button was pressed.
    await techWork.reportBlocker({ taskId: myTaskId, reason: "TOOL_MISSING", note: "Torque wrench on loan" }, ACTOR);

    await expect(techWork.startTask(myTaskId, ACTOR)).rejects.toMatchObject({ status: 400 });
  });

  it("puts the blocker on the branch manager's attention queue immediately", async () => {
    // The whole point of the hand-off: what a technician records on a
    // tablet has to reach the person who can clear it.
    const items = await attention.build({ tenantId, branchScope: [] });
    const mine = items.filter((item) => item.workOrderId === myJobId);

    expect(mine.some((item) => item.kind === "TECHNICIAN_BLOCKED")).toBe(true);
  });

  it("and the technician's own card says the same thing", async () => {
    const card = await techView.workCard(mineStaffId, tenantId, myJobId);

    expect(card.tasks[0].blockedReason).toContain("Torque wrench");
  });

  it("clears from the manager's queue when the technician resolves it", async () => {
    const blocker = await prisma.taskBlocker.findFirstOrThrow({ where: { taskId: myTaskId, status: "OPEN" } });
    await techWork.resolveBlocker(blocker.id, ACTOR);

    const items = await attention.build({ tenantId, branchScope: [] });

    expect(items.some((item) => item.workOrderId === myJobId && item.kind === "TECHNICIAN_BLOCKED")).toBe(false);
  });

  it("escalates a safety blocker rather than merely opening it", async () => {
    // Routed by reason, not by a flag the technician sets. A safety
    // issue is ESCALATED the moment it is reported -- the technician
    // should not have to also know to mark it urgent.
    await techWork.reportBlocker({ taskId: myTaskId, reason: "SAFETY_ISSUE" }, ACTOR);

    const blocker = await prisma.taskBlocker.findFirstOrThrow({
      where: { taskId: myTaskId, status: { in: ["OPEN", "ESCALATED"] } },
    });
    expect(blocker.status).toBe("ESCALATED");
  });

  it("refuses to complete a task while a blocker is still open", async () => {
    await expect(techWork.completeTask(myTaskId, ACTOR)).rejects.toMatchObject({ status: 400 });

    const blocker = await prisma.taskBlocker.findFirstOrThrow({
      where: { taskId: myTaskId, status: { in: ["OPEN", "ESCALATED"] } },
    });
    await techWork.resolveBlocker(blocker.id, ACTOR);
  });

  it("shows the finish conditions before anything is pressed", async () => {
    // Exit criterion 3. Being refused after the tap means the technician
    // has already put the tablet down and picked a tool back up.
    const card = await techView.workCard(mineStaffId, tenantId, myJobId);

    if (card.finish.available) {
      expect(card.finish.conditions.length).toBeGreaterThan(0);
      // Sentences, never gate keys -- "invoice.issued" is not actionable.
      for (const condition of card.finish.conditions) {
        expect(condition.text).not.toMatch(/^[a-z_]+\.[a-z_]+$/);
      }
    } else {
      // Not reachable from this state, which is a legitimate answer and
      // must not be reported as "everything passed".
      expect(card.finish.passed).toBe(false);
    }
  });

  it("records a fault the technician found, which becomes the customer's decision", async () => {
    const fault = await techWork.createFault(
      { workOrderId: myJobId, description: "Rear discs scored beyond limit", severity: "HIGH" },
      ACTOR,
    );

    expect(fault).toBeDefined();
    const stored = await prisma.fault.count({ where: { workOrderId: myJobId } });
    expect(stored).toBeGreaterThan(0);
  });

  it("completes the task once nothing is blocking it", async () => {
    await techWork.completeTask(myTaskId, ACTOR);

    const card = await techView.workCard(mineStaffId, tenantId, myJobId);
    expect(card.tasks[0].status).toBe("DONE");

    // And it stops being "on now", so the next pick-up shows the truth.
    await expect(techView.activeJob(mineStaffId, tenantId)).resolves.toBeNull();
  });
});
