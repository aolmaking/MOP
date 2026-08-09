/**
 * Demo data for looking at the interface.
 *
 * The base seed (seed.ts) creates the minimum needed to run: plans, a
 * platform admin, and two differently-shaped tenants. It deliberately
 * creates no work, because a seed that invents operational history makes
 * it impossible to tell a real bug from fixture noise.
 *
 * This script is separate and additive: it creates a branch manager who
 * can actually open the Branch pages, and a handful of deliberately stuck
 * jobs so the Attention Center has something to rank.
 *
 * Every job here is stuck for a DIFFERENT reason and a different length of
 * time, so the ranking is visible rather than theoretical -- including one
 * case that exercises age escalation (a customer waiting over a day
 * outranking a freshly blocked technician).
 *
 * Idempotent: re-running replaces the demo work rather than duplicating it.
 */
import { PrismaClient } from "../generated/client";
import { randomBytes, scryptSync } from "node:crypto";

const prisma = new PrismaClient();

const SCRYPT = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64, SCRYPT).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

const TENANT_SLUG = "apex-motors";
const MANAGER_EMAIL = "manager@apex-motors.local";
const MANAGER_PASSWORD = "ChangeMe-Manager-123";

/** Permissions a branch manager needs to open their own pages. */
const MANAGER_PERMISSIONS = [
  "workorders.branch.view",
  "workorders.branch.reassign_technician",
  "workorders.branch.manage_blockers",
  "customer.intake.create",
  "decisions.branch.view",
];

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000);

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG } });
  if (!tenant) {
    console.error(`No tenant "${TENANT_SLUG}". Run "corepack pnpm db:seed" first.`);
    process.exitCode = 1;
    return;
  }

  const branch = await prisma.branch.findFirst({ where: { tenantId: tenant.id }, orderBy: { code: "asc" } });
  if (!branch) {
    console.error("That workshop has no branch. Re-run the base seed.");
    process.exitCode = 1;
    return;
  }

  const manager = await ensureManager(tenant.id);
  await clearDemoWork(tenant.id);
  await createStuckJobs(tenant.id, branch.id);

  console.log("\nDemo data ready.\n");
  console.log(`  Sign in at http://localhost:4200/login`);
  console.log(`  Email     ${MANAGER_EMAIL}`);
  console.log(`  Password  ${MANAGER_PASSWORD}`);
  console.log(`  Then open http://localhost:4200/branch/attention\n`);
  console.log(`  Manager account ${manager.id}`);
}

async function ensureManager(tenantId: string) {
  const existing = await prisma.account.findFirst({ where: { tenantId, email: MANAGER_EMAIL } });

  const account =
    existing ??
    (await prisma.account.create({
      data: {
        accountType: "TENANT_STAFF",
        tenantId,
        email: MANAGER_EMAIL,
        passwordHash: hashPassword(MANAGER_PASSWORD),
        status: "ACTIVE",
      },
    }));

  const staff = await prisma.staffUser.findUnique({ where: { accountId: account.id } });
  if (!staff) {
    await prisma.staffUser.create({
      data: {
        accountId: account.id,
        tenantId,
        fullName: "Branch Manager",
        role: "BRANCH_MANAGER",
        // Empty branch scope means tenant-wide, which is what a
        // single-branch demo wants. A scoped manager is exercised by the
        // attention-queue integration tests instead.
        branchScope: [],
        warehouseScope: [],
        categoryScope: ["CARS"],
      },
    });
  }

  for (const permissionKey of MANAGER_PERMISSIONS) {
    await prisma.rolePermission.upsert({
      where: { tenantId_role_permissionKey: { tenantId, role: "BRANCH_MANAGER", permissionKey } },
      create: { tenantId, role: "BRANCH_MANAGER", permissionKey, allowed: true },
      update: { allowed: true },
    });
  }

  return account;
}

/** Demo assets carry a DEMO- plate so a re-run replaces exactly its own work. */
async function clearDemoWork(tenantId: string) {
  const assets = await prisma.asset.findMany({
    where: { tenantId, plateNumber: { startsWith: "DEMO-" } },
    select: { id: true, currentOwnerCustomerId: true },
  });
  const assetIds = assets.map((asset) => asset.id);
  if (assetIds.length === 0) return;

  // Their owners go too. Leaving them behind made every re-run add
  // another "Mona Adel", and a search that returns the same person three
  // times is worse than no demo data at all.
  const customerIds = [...new Set(assets.map((asset) => asset.currentOwnerCustomerId).filter((id): id is string => !!id))];

  const workOrders = await prisma.workOrder.findMany({ where: { assetId: { in: assetIds } }, select: { id: true } });
  const workOrderIds = workOrders.map((workOrder) => workOrder.id);

  await prisma.customerDecisionItem.deleteMany({ where: { decisionRequest: { workOrderId: { in: workOrderIds } } } });
  await prisma.customerDecisionRequest.deleteMany({ where: { workOrderId: { in: workOrderIds } } });
  await prisma.taskBlocker.deleteMany({ where: { task: { workOrderId: { in: workOrderIds } } } });
  await prisma.task.deleteMany({ where: { workOrderId: { in: workOrderIds } } });
  await prisma.workOrder.deleteMany({ where: { id: { in: workOrderIds } } });
  await prisma.assetOwnershipHistory.deleteMany({ where: { assetId: { in: assetIds } } });
  await prisma.asset.deleteMany({ where: { id: { in: assetIds } } });

  // Only customers left with nothing -- a demo customer who has since been
  // used in a real intake keeps their other records and stays.
  for (const customerId of customerIds) {
    const stillReferenced = await prisma.workOrder.count({ where: { customerId } });
    const stillOwns = await prisma.asset.count({ where: { currentOwnerCustomerId: customerId } });
    if (stillReferenced === 0 && stillOwns === 0) {
      await prisma.assetOwnershipHistory.deleteMany({ where: { customerId } });
      await prisma.customer.deleteMany({ where: { id: customerId, tenantId } });
    }
  }
}

async function createStuckJobs(tenantId: string, branchId: string) {
  const jobs = [
    { plate: "DEMO-4471", customer: "Mona Adel", kind: "critical" as const },
    { plate: "DEMO-1188", customer: "Sara Nabil", kind: "customerLongWait" as const },
    { plate: "DEMO-9023", customer: "Omar Farid", kind: "blocked" as const },
    { plate: "DEMO-3356", customer: "Hala Kamal", kind: "waitingParts" as const },
    { plate: "DEMO-7742", customer: "Youssef Amin", kind: "rework" as const },
    // Two at the handover end, so Delivery & Payments has something to
    // evaluate. Neither has an invoice, so the delivery gates should hold
    // both -- which is the behaviour worth being able to see.
    { plate: "DEMO-5510", customer: "Nadia Roshdy", kind: "readyToLeave" as const },
    { plate: "DEMO-6621", customer: "Tarek Selim", kind: "awaitingPayment" as const },
  ];

  for (const job of jobs) {
    const customer = await prisma.customer.create({
      data: { tenantId, fullName: job.customer, phone: `0100${Math.floor(Math.random() * 9_000_000 + 1_000_000)}` },
    });
    const asset = await prisma.asset.create({
      data: { tenantId, category: "CARS", plateNumber: job.plate, currentOwnerCustomerId: customer.id },
    });

    // Both halves, exactly as IntakeService writes them. currentOwnerCustomerId
    // alone is an inconsistent state real code cannot produce: "who owns this
    // now" is the column, but "which vehicles are this customer's" is read
    // through the open history row, so a seed that skips it makes every
    // returning customer look like they own nothing.
    await prisma.assetOwnershipHistory.create({
      data: { tenantId, assetId: asset.id, customerId: customer.id },
    });

    const status =
      job.kind === "waitingParts"
        ? "WAITING_PARTS"
        : job.kind === "rework"
          ? "QC_FAILED"
          : job.kind === "readyToLeave"
            ? "READY_FOR_DELIVERY"
            : job.kind === "awaitingPayment"
              ? "PAYMENT_PENDING"
              : "IN_PROGRESS";

    const workOrder = await prisma.workOrder.create({
      data: { tenantId, branchId, assetId: asset.id, customerId: customer.id, status, inspectionDeclined: false },
    });

    if (job.kind === "critical") {
      // Tier 1: liability, and it never decays. Should sit at the top even
      // though it is the newest thing here.
      const request = await prisma.customerDecisionRequest.create({
        data: {
          tenantId,
          workOrderId: workOrder.id,
          customerId: customer.id,
          status: "RESOLVED",
          secureToken: `demo-${asset.id}`,
          createdById: "demo",
          sentAt: hoursAgo(3),
        },
      });
      await prisma.customerDecisionItem.create({
        data: {
          tenantId,
          decisionRequestId: request.id,
          name: "Front brake pads",
          explanation: "Worn below the minimum safe thickness.",
          importance: "CRITICAL",
          price: 1800,
          total: 1800,
          decision: "REJECTED",
          warningAcknowledged: false,
          decidedAt: hoursAgo(2),
        },
      });
    }

    if (job.kind === "customerLongWait") {
      // Waiting 3 days: escalates a tier and should outrank the blocked
      // technician below, which is the ranking rule made visible.
      await prisma.customerDecisionRequest.create({
        data: {
          tenantId,
          workOrderId: workOrder.id,
          customerId: customer.id,
          status: "SENT",
          secureToken: `demo-wait-${asset.id}`,
          createdById: "demo",
          sentAt: hoursAgo(74),
        },
      });
    }

    if (job.kind === "blocked") {
      const task = await prisma.task.create({
        data: { tenantId, workOrderId: workOrder.id, title: "Replace alternator", status: "BLOCKED" },
      });
      await prisma.taskBlocker.create({
        data: {
          tenantId,
          taskId: task.id,
          reason: "TOOL_MISSING",
          note: "Torque wrench is on loan to the other bay.",
          reportedBy: "demo",
          status: "OPEN",
        },
      });
    }

    const backdated: Partial<Record<typeof job.kind, Date>> = {
      waitingParts: hoursAgo(26),
      rework: hoursAgo(5),
      readyToLeave: hoursAgo(9),
      awaitingPayment: hoursAgo(31),
    };
    const age = backdated[job.kind];
    if (age) {
      await prisma.$executeRaw`UPDATE work_orders SET "updatedAt" = ${age} WHERE id = ${workOrder.id}`;
    }
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
