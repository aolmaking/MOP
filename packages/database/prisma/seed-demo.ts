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
import { DEFAULT_ROLE_PERMISSIONS, WORK_ORDER_GRAPH } from "@mop/shared";

const prisma = new PrismaClient();

/** The workshops `seed.ts` creates. Anything else is somebody's real work. */
const DEMO_TENANT_SLUGS = ["apex-motors", "delta-quick"];

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
/**
 * Demo-only delegations, applied ON TOP of the role's real defaults.
 *
 * Everything here is something an Owner would hand out on their first
 * day; the defaults themselves come from
 * `DEFAULT_ROLE_PERMISSIONS.BRANCH_MANAGER` and must not be re-listed
 * here, or this array drifts from them again.
 */
const MANAGER_PERMISSIONS = [
  // Delegated money handling.
  //
  // finance.running_invoice.add_line is ungranted to every role by
  // default, and deliberately so: tenant-owner.md's "Who Can Handle
  // Money" makes it something an Owner hands out rather than something a
  // role arrives with. That default is correct and stays -- but a demo
  // workshop where nobody can bill anything cannot show the service
  // chain reaching an invoice, so the seed performs the delegation the
  // Owner would perform on their first day.
  "finance.running_invoice.add_line",
  "finance.invoice.view",
  "workorders.branch.view",
  "workorders.branch.reassign_technician",
  "workorders.branch.manage_blockers",
  "customer.intake.create",
  "decisions.branch.view",
  // Granted in the template AND still denied until the owner delegates,
  // which is the pair the demo exists to show.
  "team_setup.branch.manage",
];

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000);

/**
 * The demo seed writes fictional customers, cars and jobs. On a database
 * that carries a real workshop, that is not fixture noise -- it is
 * invented operational history sitting beside somebody's actual work,
 * and the launch scope's acceptance criterion 6 exists to prevent it.
 *
 * So this refuses rather than trusting whoever typed the command to have
 * checked. Two independent signals, because either alone is easy to get
 * wrong: a production NODE_ENV, and the presence of any workshop this
 * script did not create.
 *
 * `MOP_ALLOW_DEMO_SEED=yes` overrides it, for the one legitimate case of
 * a demo environment that happens to run with NODE_ENV=production.
 */
async function refuseIfThisLooksReal(): Promise<boolean> {
  if (process.env.MOP_ALLOW_DEMO_SEED === "yes") return false;

  if (process.env.NODE_ENV === "production") {
    console.error("Refusing to write demo data with NODE_ENV=production.");
    console.error("Set MOP_ALLOW_DEMO_SEED=yes if this really is a demo environment.");
    return true;
  }

  const foreign = await prisma.tenant.findFirst({
    where: { slug: { notIn: DEMO_TENANT_SLUGS } },
    select: { name: true, slug: true },
  });
  if (foreign) {
    console.error(`Refusing: this database holds a workshop the demo seed did not create -- "${foreign.name}" (${foreign.slug}).`);
    console.error("Demo jobs alongside a real workshop's jobs is exactly what acceptance criterion 6 forbids.");
    console.error("Set MOP_ALLOW_DEMO_SEED=yes to override.");
    return true;
  }

  return false;
}

async function main() {
  if (await refuseIfThisLooksReal()) {
    process.exitCode = 1;
    return;
  }

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
  const technician = await ensureTechnician(tenant.id);
  await ensureOwner(tenant.id);
  await ensureInventoryManager(tenant.id);
  await ensureDataAnalyst(tenant.id);
  await ensureDelegatedTeams(tenant.id, branch.id);
  await ensureServiceCatalog(tenant.id);
  await clearDemoWork(tenant.id);
  await createStuckJobs(tenant.id, branch.id, technician.staffUserId);
  await ensurePartsCatalog(tenant.id);
  await ensureCatalogStructure(tenant.id);
  await createFinancialHistory(tenant.id, branch.id);
  await issuePartsToFinishedJobs(tenant.id);

  console.log("\nDemo data ready.\n");
  console.log(`  Sign in at http://localhost:4200/login`);
  console.log(`  Email     ${MANAGER_EMAIL}`);
  console.log(`  Password  ${MANAGER_PASSWORD}`);
  console.log(`  Then open http://localhost:4200/branch/attention\n`);
  console.log(`  Owner       ${OWNER_EMAIL} / ${OWNER_PASSWORD}`);
  console.log(`              lands on http://localhost:4200/owner/audit
`);
  console.log(`  Technician  ${TECHNICIAN_EMAIL} / ${TECHNICIAN_PASSWORD}`);
  console.log(`              lands on http://localhost:4200/tech\n`);
  console.log(`  Inventory Manager  ${INVENTORY_EMAIL} / ${INVENTORY_PASSWORD}`);
  console.log(`              lands on http://localhost:4200/inventory\n`);
  console.log(`  Data Analyst  ${ANALYST_EMAIL} / ${ANALYST_PASSWORD}`);
  console.log(`              lands on http://localhost:4200/analyst\n`);
  console.log(`  Customer    sara.nabil@customer.local / ${CUSTOMER_PASSWORD}`);
  console.log(`              has a decision waiting -- http://localhost:4200/customer/decisions`);
  console.log(`              every demo customer follows first.last@customer.local
`);
  console.log(`  Manager account ${manager.id}`);
}

const TEAM_LEADER_EMAIL = "leader-demo@apex-motors.local";
const TEAM_LEADER_PASSWORD = "ChangeMe-Leader-123";

/**
 * Turns on the owner's team-setup delegation and gives the branch
 * manager something to manage.
 *
 * Delegation is OFF by default and stays off for every other workshop.
 * It is switched on here because the alternative -- shipping the page
 * with no way to reach it -- is how a surface goes unlooked-at for a
 * phase. A second workshop with it off is what proves the switch works,
 * and the base seed's second tenant provides that for free.
 */
async function ensureDelegatedTeams(tenantId: string, branchId: string): Promise<void> {
  const existing = await prisma.controlSetting.findFirst({
    where: { scope: "TENANT", tenantId, type: "delegation", key: "team_setup.delegate" },
  });

  if (existing) {
    await prisma.controlSetting.update({
      where: { id: existing.id },
      data: { value: { enabled: true }, active: true },
    });
  } else {
    await prisma.controlSetting.create({
      data: {
        scope: "TENANT",
        tenantId,
        key: "team_setup.delegate",
        value: { enabled: true },
        type: "delegation",
        active: true,
        reason: "Demo: the owner has handed team structure to the branch manager",
        createdBy: "seed-demo",
      },
    });
  }

  const account =
    (await prisma.account.findFirst({ where: { email: TEAM_LEADER_EMAIL } })) ??
    (await prisma.account.create({
      data: {
        accountType: "TENANT_STAFF",
        tenantId,
        email: TEAM_LEADER_EMAIL,
        passwordHash: hashPassword(TEAM_LEADER_PASSWORD),
        status: "ACTIVE",
      },
    }));

  const leader =
    (await prisma.staffUser.findUnique({ where: { accountId: account.id } })) ??
    (await prisma.staffUser.create({
      data: {
        accountId: account.id,
        tenantId,
        fullName: "Nadia Kamal",
        role: "TEAM_LEADER",
        branchScope: [branchId],
        warehouseScope: [],
        categoryScope: ["CARS"],
      },
    }));

  let team = await prisma.team.findFirst({ where: { tenantId, name: "Bay One" } });
  if (!team) {
    team = await prisma.team.create({ data: { tenantId, branchId, name: "Bay One", teamLeaderId: leader.id } });
  }

  // A team with a leader and no members is a real, valid, but empty demo
  // -- the seed already has a technician account, so give the leader
  // something real to manage rather than always showing the (correctly
  // built, but less convincing) empty state.
  const technicianAccount = await prisma.account.findFirst({ where: { email: TECHNICIAN_EMAIL } });
  const technicianStaff = technicianAccount
    ? await prisma.staffUser.findUnique({ where: { accountId: technicianAccount.id } })
    : null;
  if (technicianStaff) {
    const membership = await prisma.teamMembership.findFirst({
      where: { teamId: team.id, technicianId: technicianStaff.id, endedAt: null },
    });
    if (!membership) {
      await prisma.teamMembership.create({ data: { tenantId, teamId: team.id, technicianId: technicianStaff.id } });
    }
  }

  // Unlike MANAGER_PERMISSIONS/TECHNICIAN_PERMISSIONS below, TEAM_LEADER
  // had no permission grant here at all -- the role could log in and see
  // its own nav, but every page including its own Team Home denied
  // access outright. The real defaults, not a curated subset: this role
  // has no demo narrative reason to withhold any of its own permissions.
  const leaderPermissions = DEFAULT_ROLE_PERMISSIONS.TEAM_LEADER ?? {};
  for (const [permissionKey, allowed] of Object.entries(leaderPermissions)) {
    await prisma.rolePermission.upsert({
      where: { tenantId_role_permissionKey: { tenantId, role: "TEAM_LEADER", permissionKey } },
      create: { tenantId, role: "TEAM_LEADER", permissionKey, allowed: allowed! },
      update: { allowed: allowed! },
    });
  }
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

  // The role's real defaults FIRST, then the demo-only delegations on
  // top. A hand-kept list alone was the bug this replaces: it named
  // seven keys and silently omitted whatever had been added to
  // `DEFAULT_ROLE_PERMISSIONS.BRANCH_MANAGER` since somebody last
  // remembered to edit it, so `workorders.branch.release_delivery` --
  // true by default for this role since it was declared -- was denied in
  // the demo and the Hand Over button answered "You cannot release a
  // vehicle."
  //
  // A blind replace would have been just as wrong in the other
  // direction: MANAGER_PERMISSIONS carries deliberate demo-only
  // overrides on top of a `false` default. Hence a merge.
  const managerDefaults = DEFAULT_ROLE_PERMISSIONS.BRANCH_MANAGER ?? {};
  const managerGrants = new Map<string, boolean>(Object.entries(managerDefaults));
  for (const permissionKey of MANAGER_PERMISSIONS) managerGrants.set(permissionKey, true);

  for (const [permissionKey, allowed] of managerGrants) {
    await prisma.rolePermission.upsert({
      where: { tenantId_role_permissionKey: { tenantId, role: "BRANCH_MANAGER", permissionKey } },
      create: { tenantId, role: "BRANCH_MANAGER", permissionKey, allowed },
      update: { allowed },
    });
  }

  return account;
}

const OWNER_EMAIL = "owner-demo@apex-motors.local";
const OWNER_PASSWORD = "ChangeMe-Owner-123";

/**
 * The seeded owner from the BASE seed has only organization.access.manage,
 * so it cannot open History. This one carries the role's real defaults.
 */
async function ensureOwner(tenantId: string): Promise<void> {
  const existing = await prisma.account.findFirst({ where: { tenantId, email: OWNER_EMAIL } });

  const account =
    existing ??
    (await prisma.account.create({
      data: {
        accountType: "TENANT_STAFF",
        tenantId,
        email: OWNER_EMAIL,
        passwordHash: hashPassword(OWNER_PASSWORD),
        status: "ACTIVE",
      },
    }));

  const staff = await prisma.staffUser.findUnique({ where: { accountId: account.id } });
  if (!staff) {
    await prisma.staffUser.create({
      data: {
        accountId: account.id,
        tenantId,
        fullName: "Amira Hassan",
        role: "TENANT_OWNER",
        branchScope: [],
        warehouseScope: [],
        categoryScope: ["CARS"],
      },
    });
  }

  // The real defaults, not a hand-picked list that drifts every time a
  // phase adds a new TENANT_OWNER permission key -- this comment used to
  // claim that and stopped being true the moment DEFAULT_ROLE_PERMISSIONS
  // grew past what was hand-copied here, silently locking the demo owner
  // out of its own Owner Home.
  const ownerPermissions = DEFAULT_ROLE_PERMISSIONS.TENANT_OWNER ?? {};
  for (const [permissionKey, allowed] of Object.entries(ownerPermissions)) {
    await prisma.rolePermission.upsert({
      where: { tenantId_role_permissionKey: { tenantId, role: "TENANT_OWNER", permissionKey } },
      create: { tenantId, role: "TENANT_OWNER", permissionKey, allowed: allowed! },
      update: { allowed: allowed! },
    });
  }
}

const ANALYST_EMAIL = "analyst@apex-motors.local";
const ANALYST_PASSWORD = "ChangeMe-Analyst-123";

/**
 * Same gap as Inventory Manager: no demo account at all, no way to sign
 * in and demonstrate the role.
 */
async function ensureDataAnalyst(tenantId: string): Promise<void> {
  const existing = await prisma.account.findFirst({ where: { tenantId, email: ANALYST_EMAIL } });

  const account =
    existing ??
    (await prisma.account.create({
      data: {
        accountType: "TENANT_STAFF",
        tenantId,
        email: ANALYST_EMAIL,
        passwordHash: hashPassword(ANALYST_PASSWORD),
        status: "ACTIVE",
      },
    }));

  const staff = await prisma.staffUser.findUnique({ where: { accountId: account.id } });
  if (!staff) {
    await prisma.staffUser.create({
      data: {
        accountId: account.id,
        tenantId,
        fullName: "Layla Mostafa",
        role: "DATA_ANALYST",
        branchScope: [],
        warehouseScope: [],
        categoryScope: ["CARS"],
      },
    });
  }

  const analystPermissions = DEFAULT_ROLE_PERMISSIONS.DATA_ANALYST ?? {};
  for (const [permissionKey, allowed] of Object.entries(analystPermissions)) {
    await prisma.rolePermission.upsert({
      where: { tenantId_role_permissionKey: { tenantId, role: "DATA_ANALYST", permissionKey } },
      create: { tenantId, role: "DATA_ANALYST", permissionKey, allowed: allowed! },
      update: { allowed: allowed! },
    });
  }
}

const INVENTORY_EMAIL = "inventory@apex-motors.local";
const INVENTORY_PASSWORD = "ChangeMe-Inventory-123";

/**
 * The base seed never created an Inventory Manager at all -- there was no
 * way to sign in and demo the role, real gap or not.
 */
async function ensureInventoryManager(tenantId: string): Promise<void> {
  const existing = await prisma.account.findFirst({ where: { tenantId, email: INVENTORY_EMAIL } });

  const account =
    existing ??
    (await prisma.account.create({
      data: {
        accountType: "TENANT_STAFF",
        tenantId,
        email: INVENTORY_EMAIL,
        passwordHash: hashPassword(INVENTORY_PASSWORD),
        status: "ACTIVE",
      },
    }));

  const staff = await prisma.staffUser.findUnique({ where: { accountId: account.id } });
  if (!staff) {
    await prisma.staffUser.create({
      data: {
        accountId: account.id,
        tenantId,
        fullName: "Youssef Nabil",
        role: "INVENTORY_MANAGER",
        branchScope: [],
        warehouseScope: [],
        categoryScope: ["CARS"],
      },
    });
  }

  const inventoryPermissions = DEFAULT_ROLE_PERMISSIONS.INVENTORY_MANAGER ?? {};
  for (const [permissionKey, allowed] of Object.entries(inventoryPermissions)) {
    await prisma.rolePermission.upsert({
      where: { tenantId_role_permissionKey: { tenantId, role: "INVENTORY_MANAGER", permissionKey } },
      create: { tenantId, role: "INVENTORY_MANAGER", permissionKey, allowed: allowed! },
      update: { allowed: allowed! },
    });
  }
}

/**
 * The demo customers' own logins.
 *
 * Added because the seed built seven customers with live jobs and gave
 * none of them an account, so the Customer Portal -- a primary
 * deliverable, not a secondary surface -- could not be opened as anybody
 * who actually had a car in the workshop. The decision waiting on
 * DEMO-1188 was unanswerable except through its token link.
 *
 * One password for all of them, matching every other demo credential
 * here: this seed is for a local demo database and says so.
 */
const CUSTOMER_PASSWORD = "ChangeMe-Customer-123";

const TECHNICIAN_EMAIL = "tech@apex-motors.local";
const TECHNICIAN_PASSWORD = "ChangeMe-Tech-123";

async function ensureTechnician(tenantId: string): Promise<{ staffUserId: string }> {
  const existing = await prisma.account.findFirst({ where: { tenantId, email: TECHNICIAN_EMAIL } });

  const account =
    existing ??
    (await prisma.account.create({
      data: {
        accountType: "TENANT_STAFF",
        tenantId,
        email: TECHNICIAN_EMAIL,
        passwordHash: hashPassword(TECHNICIAN_PASSWORD),
        status: "ACTIVE",
      },
    }));

  const staff =
    (await prisma.staffUser.findUnique({ where: { accountId: account.id } })) ??
    (await prisma.staffUser.create({
      data: {
        accountId: account.id,
        tenantId,
        fullName: "Hassan Fathy",
        role: "TECHNICIAN",
        branchScope: [],
        warehouseScope: [],
        categoryScope: ["CARS"],
      },
    }));

  // The real defaults, not a hand-curated subset -- the same fix already
  // applied to TEAM_LEADER above, for the same reason. The old
  // TECHNICIAN_PERMISSIONS array named five keys "the pages read" and
  // silently missed two more the platform's own defaults had granted
  // since before this comment was written (customer_decision.create/
  // .send): a technician could log in, but "Ask the customer" -- the
  // permission scaffolding for which existed in default-role-permissions.ts
  // with no caller until this session -- came back 403 in a real demo
  // walkthrough because this seed had drifted from the map it was meant
  // to mirror.
  const technicianPermissions = DEFAULT_ROLE_PERMISSIONS.TECHNICIAN ?? {};
  for (const [permissionKey, allowed] of Object.entries(technicianPermissions)) {
    await prisma.rolePermission.upsert({
      where: { tenantId_role_permissionKey: { tenantId, role: "TECHNICIAN", permissionKey } },
      create: { tenantId, role: "TECHNICIAN", permissionKey, allowed: allowed! },
      update: { allowed: allowed! },
    });
  }

  return { staffUserId: staff.id };
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

  // Finance unwinds before the work orders it hangs off. Invoice ->
  // WorkOrder is onDelete: Restrict, so skipping this does not leave
  // stray rows behind -- it makes the second seed run fail outright.
  const invoices = await prisma.invoice.findMany({
    where: { workOrderId: { in: workOrderIds } },
    select: { id: true },
  });
  const invoiceIds = invoices.map((invoice) => invoice.id);
  if (invoiceIds.length > 0) {
    await prisma.payment.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.invoiceLine.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    // Billing's own artifacts come off first. `FinanceService.issueInvoice`
    // calls BillingService in the same transaction, so any invoice issued
    // through the product -- rather than inserted by this seed -- has a
    // `BillingDocument` pointing at it, and a credit note if it was ever
    // refunded. Neither cascades. This only started failing once the demo
    // could actually issue an invoice from the UI, which is precisely when
    // a re-seed matters most.
    await prisma.creditNote.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.refundRequest.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.billingDocument.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
  }

  // StockMovement points at a work order through a plain referenceId
  // string, not a foreign key, so nothing cascades these away. Left
  // behind they accumulate on every re-seed and the issue history stops
  // matching the part lines it is supposed to explain.
  await prisma.stockMovement.deleteMany({
    where: { tenantId, referenceType: "WorkOrder", referenceId: { in: workOrderIds } },
  });

  await prisma.workOrder.deleteMany({ where: { id: { in: workOrderIds } } });
  await prisma.assetOwnershipHistory.deleteMany({ where: { assetId: { in: assetIds } } });
  await prisma.asset.deleteMany({ where: { id: { in: assetIds } } });

  // Only customers left with nothing -- a demo customer who has since been
  // used in a real intake keeps their other records and stays.
  for (const customerId of customerIds) {
    const stillReferenced = await prisma.workOrder.count({ where: { customerId } });
    const stillOwns = await prisma.asset.count({ where: { currentOwnerCustomerId: customerId } });
    if (stillReferenced === 0 && stillOwns === 0) {
      // The login goes with them. `customers.accountId` is ON DELETE SET
      // NULL, so deleting the customer alone would strand an orphan
      // account holding the demo email -- and the next re-seed would hit
      // the (tenantId, email) unique index and fail.
      const customer = await prisma.customer.findUnique({
        where: { id: customerId },
        select: { accountId: true },
      });
      await prisma.assetOwnershipHistory.deleteMany({ where: { customerId } });
      await prisma.customer.deleteMany({ where: { id: customerId, tenantId } });
      if (customer?.accountId) {
        await prisma.session.deleteMany({ where: { accountId: customer.accountId } });
        await prisma.account.deleteMany({ where: { id: customer.accountId } });
      }
    }
  }
}

/**
 * The transitions a job really passes through on its way to a status,
 * replayed as `work_order.status_changed` events so seeded work carries
 * the same history the lifecycle service would have written.
 *
 * Kept deliberately close to the real graph rather than emitting a single
 * synthetic DRAFT -> final hop: Workflow Health and the stage-duration
 * reports both read this history, and a one-hop shortcut would make every
 * seeded job look like it spent zero time in every stage.
 */
const LIFECYCLE_PATHS: Record<string, readonly string[]> = {
  IN_PROGRESS: ["AWAITING_CUSTOMER_APPROVAL", "APPROVED_FOR_WORK", "IN_PROGRESS"],
  WAITING_PARTS: ["AWAITING_CUSTOMER_APPROVAL", "APPROVED_FOR_WORK", "IN_PROGRESS", "WAITING_PARTS"],
  QC_FAILED: ["AWAITING_CUSTOMER_APPROVAL", "APPROVED_FOR_WORK", "IN_PROGRESS", "QC_FAILED"],
  READY_FOR_DELIVERY: [
    "AWAITING_CUSTOMER_APPROVAL",
    "APPROVED_FOR_WORK",
    "IN_PROGRESS",
    "PAYMENT_PENDING",
    "READY_FOR_DELIVERY",
  ],
  PAYMENT_PENDING: ["AWAITING_CUSTOMER_APPROVAL", "APPROVED_FOR_WORK", "IN_PROGRESS", "PAYMENT_PENDING"],
  CLOSED: [
    "AWAITING_CUSTOMER_APPROVAL",
    "APPROVED_FOR_WORK",
    "IN_PROGRESS",
    "PAYMENT_PENDING",
    "READY_FOR_DELIVERY",
    "CLOSED",
  ],
};

/**
 * Every status above must be a real one.
 *
 * This map used to name `AWAITING_APPROVAL` and `APPROVED`, which are not
 * `WorkOrderStatus` members and not states in WORK_ORDER_GRAPH -- so the
 * demo workshop's entire lifecycle history was written in a vocabulary
 * the product does not use. Nothing caught it because the history is
 * stored as JSON payload, not as an enum column, so the database accepted
 * it happily and every reader downstream (stage durations, Workflow
 * Health, and the workflow strip) silently carried the invented names.
 *
 * Checked at seed time against the graph itself rather than a second
 * hand-kept list.
 */
for (const [final, path] of Object.entries(LIFECYCLE_PATHS)) {
  for (const status of [final, ...path]) {
    if (!WORK_ORDER_GRAPH.states.includes(status)) {
      throw new Error(`LIFECYCLE_PATHS names "${status}", which is not a state in WORK_ORDER_GRAPH.`);
    }
  }
}

/**
 * `endingAt` is when the job reached `finalStatus`, defaulting to now.
 *
 * It matters for anything already finished: without it every closed job
 * -- whatever date it carries -- replays its transitions as having
 * happened in the last few hours, so a workshop with ten weeks of
 * history reports all of it as today's activity.
 */
async function recordLifecycleHistory(
  tenantId: string,
  workOrderId: string,
  finalStatus: string,
  endingAt: Date = new Date(),
): Promise<void> {
  const path = LIFECYCLE_PATHS[finalStatus] ?? [finalStatus];
  let from = "DRAFT";
  // Spread the hops backwards from the end so each stage has a plausible
  // dwell time rather than every transition sharing one timestamp.
  const stepMinutes = 45;
  let offset = path.length * stepMinutes;

  for (const to of path) {
    await prisma.operationEvent.create({
      data: {
        tenantId,
        eventKey: "work_order.status_changed",
        actorId: "seed-demo",
        actorType: "TENANT_STAFF",
        createdAt: new Date(endingAt.getTime() - offset * 60_000),
        payload: { workOrderId, from, to, intent: "SEED_REPLAY", reason: null },
      },
    });
    from = to;
    offset -= stepMinutes;
  }
}


/**
 * The workshop's own Service Catalog.
 *
 * Seeded because the whole service chain hangs off it: a task carries a
 * `serviceKey` naming a row here, billing resolves the price from here,
 * and Reports group work by it. Without a catalogue the demo can only
 * show ad-hoc work, which is the one case that proves nothing.
 */
const DEMO_SERVICES: readonly { itemKey: string; unitPrice: number; laborPrice: number }[] = [
  { itemKey: "Replace front brake pads", unitPrice: 1800, laborPrice: 400 },
  { itemKey: "Diagnose gearbox noise", unitPrice: 350, laborPrice: 350 },
  { itemKey: "Replace alternator", unitPrice: 2200, laborPrice: 500 },
];

async function ensureServiceCatalog(tenantId: string): Promise<void> {
  for (const service of DEMO_SERVICES) {
    const open = await prisma.priceCatalogEntry.findFirst({
      where: { tenantId, itemKey: service.itemKey, effectiveTo: null },
    });
    if (open) continue;

    await prisma.priceCatalogEntry.create({
      data: {
        tenantId,
        itemKey: service.itemKey,
        itemType: "SERVICE",
        unitPrice: service.unitPrice,
        laborPrice: service.laborPrice,
        isActive: true,
      },
    });
  }
}

async function createStuckJobs(tenantId: string, branchId: string, technicianStaffUserId: string) {
  const jobs = [
    { plate: "DEMO-4471", customer: "Mona Adel", kind: "critical" as const },
    { plate: "DEMO-1188", customer: "Sara Nabil", kind: "customerLongWait" as const },
    { plate: "DEMO-9023", customer: "Omar Farid", kind: "blocked" as const },
    { plate: "DEMO-3356", customer: "Hala Kamal", kind: "waitingParts" as const },
    { plate: "DEMO-7742", customer: "Youssef Amin", kind: "rework" as const },
    // Two at the handover end, so Delivery & Payments has something to
    // evaluate, and deliberately in two DIFFERENT states.
    //
    // DEMO-5510 has completed work and a running total but NO invoice, so
    // the delivery gate holds it -- the behaviour worth being able to see.
    //
    // DEMO-6621 carries completed work and a running total ready to be
    // invoiced, so the money path can actually be walked end to end:
    // invoice -> take payment -> balance clears -> the release gate opens.
    // Until this carried charges both jobs totalled 0.00 with nothing to
    // bill, so the payment half of the core journey could not be
    // demonstrated at all -- only the gate refusing it.
    { plate: "DEMO-5510", customer: "Nadia Roshdy", kind: "readyToLeave" as const },
    { plate: "DEMO-6621", customer: "Tarek Selim", kind: "awaitingPayment" as const },
  ];

  for (const job of jobs) {
    // An account each, so the Customer Portal can be opened as the person
    // whose car is actually in the bay. Email is derived from the name so
    // the demo credentials are guessable from the job list itself.
    const email = `${job.customer.toLowerCase().replace(/\s+/g, ".")}@customer.local`;
    const account = await prisma.account.create({
      data: {
        accountType: "CUSTOMER",
        tenantId,
        email,
        passwordHash: hashPassword(CUSTOMER_PASSWORD),
        status: "ACTIVE",
      },
    });

    const customer = await prisma.customer.create({
      data: {
        tenantId,
        fullName: job.customer,
        phone: `0100${Math.floor(Math.random() * 9_000_000 + 1_000_000)}`,
        accountId: account.id,
      },
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

    // NO lifecycle history is written for an open job, deliberately.
    //
    // This used to replay a plausible path to the job's status, because
    // Workflow Health correctly flags a work order whose status nothing
    // ever transitioned it into, and every demo workshop opened with
    // seven CRITICAL integrity violations that were fixture artefacts.
    //
    // But making the detector quiet by forging the evidence it looks for
    // is not honesty, it is a better forgery -- and it is exactly what
    // the launch scope's acceptance criterion 6 forbids: "zero fabricated
    // open-state lifecycle data anywhere reachable by the pilot". A
    // seeded IN_PROGRESS job did not pass through
    // AWAITING_CUSTOMER_APPROVAL, and writing an event saying it did is a
    // lie told to every report, dossier and journey strip that reads
    // those events.
    //
    // So the violations come back, and they are TRUE: these jobs really
    // did bypass the lifecycle, because a seed is not a workshop. The one
    // place history is still written is a CLOSED job (below), where the
    // whole record is over and the replay describes something that
    // genuinely finished rather than something still in flight.
    //
    // Restricting this to CLOSED is the Day-6 instruction in
    // docs/14-DAY-LAUNCH-SCOPE.md, in those words.

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
      const request = await prisma.customerDecisionRequest.create({
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

      // Real items, one of them safety-critical. A request with nothing on
      // it is not a thing a technician can create, and seeding one hid a
      // bug: the public page reported it as already answered, because
      // `[].every()` is vacuously true.
      await prisma.customerDecisionItem.createMany({
        data: [
          {
            tenantId,
            decisionRequestId: request.id,
            name: "Front brake discs",
            explanation: "Scored past the wear limit. They will not pass an inspection and stopping distance is affected.",
            importance: "CRITICAL",
            price: 2400,
            laborPrice: 400,
            total: 2800,
          },
          {
            tenantId,
            decisionRequestId: request.id,
            name: "Cabin air filter",
            explanation: "Dirty. Worth doing while the dashboard is already apart, otherwise it is a separate job later.",
            importance: "LOW",
            price: 180,
            laborPrice: 0,
            total: 180,
          },
        ],
      });
    }

    // The handover-end jobs carry finished, catalogued work so there is
    // something real to invoice and pay for. Priced from the Service
    // Catalog above rather than typed here, so editing Pricing changes
    // what the demo bills -- the same chain a real job follows.
    if (job.kind === "readyToLeave" || job.kind === "awaitingPayment") {
      const service = DEMO_SERVICES[0];
      const task = await prisma.task.create({
        data: {
          tenantId,
          workOrderId: workOrder.id,
          title: service.itemKey,
          serviceKey: service.itemKey,
          status: "DONE",
        },
      });
      await prisma.taskAssignment.create({
        data: { tenantId, taskId: task.id, staffUserId: technicianStaffUserId },
      });

      const running = await prisma.runningInvoice.create({
        data: { tenantId, workOrderId: workOrder.id },
      });
      await prisma.runningInvoiceLine.create({
        data: {
          tenantId,
          runningInvoiceId: running.id,
          name: service.itemKey,
          itemType: "SERVICE",
          quantity: 1,
          unitPrice: service.unitPrice,
          laborPrice: service.laborPrice,
          total: service.unitPrice + service.laborPrice,
          addedById: "seed",
        },
      });
    }

    // Every in-progress job carries work for the demo technician, so the
    // Technician pages have something real to show. Assigned at both the
    // job and task level, because the API treats either as "mine".
    if (job.kind === "critical" || job.kind === "customerLongWait" || job.kind === "blocked") {
      await prisma.workOrderAssignment.create({
        data: { tenantId, workOrderId: workOrder.id, staffUserId: technicianStaffUserId },
      });

      if (job.kind !== "blocked") {
        const task = await prisma.task.create({
          data: {
            tenantId,
            workOrderId: workOrder.id,
            title: job.kind === "critical" ? "Replace front brake pads" : "Diagnose gearbox noise",
            // Names a real row in the catalogue above, so the job is
            // billable at the workshop's own price and countable by
            // service in Reports -- not a string that merely looks like
            // one.
            serviceKey: job.kind === "critical" ? "Replace front brake pads" : "Diagnose gearbox noise",
            // One started, one waiting: "Now" needs exactly one active
            // job or it cannot demonstrate what it is for.
            status: job.kind === "critical" ? "IN_PROGRESS" : "ASSIGNED",
          },
        });
        await prisma.taskAssignment.create({
          data: { tenantId, taskId: task.id, staffUserId: technicianStaffUserId },
        });
      }
    }

    if (job.kind === "blocked") {
      const task = await prisma.task.create({
        data: {
          tenantId,
          workOrderId: workOrder.id,
          title: "Replace alternator",
          serviceKey: "Replace alternator",
          status: "BLOCKED",
        },
      });
      await prisma.taskAssignment.create({
        data: { tenantId, taskId: task.id, staffUserId: technicianStaffUserId },
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

/**
 * Jobs that finished, were invoiced, and were mostly paid.
 *
 * Every other seeded job is deliberately stuck somewhere, which is right
 * for the operational surfaces but leaves Reports -> Financial completely
 * empty: no invoice was ever issued, so revenue, collected, payment
 * methods, branch revenue, top services and the aging buckets all read
 * zero, and the tab demonstrated nothing.
 *
 * These twelve are the other half of the picture. They are spread back
 * over ten weeks so the revenue trend has real shape rather than one
 * spike, and the payment states are mixed on purpose:
 *
 *   - most are paid in full, across three different methods
 *   - two are part-paid, so PARTIALLY_PAID and a real outstanding
 *     balance exist
 *   - three are unpaid at 10, 45 and 80 days, one for each aging bucket,
 *     because an aging report whose buckets are all empty cannot be read
 *
 * Prices come from DEMO_SERVICES rather than invented numbers, so the
 * invoice lines agree with the live price catalogue the technician and
 * POS surfaces resolve against.
 */
const FINISHED_JOBS: readonly {
  plate: string;
  customer: string;
  daysAgo: number;
  services: readonly number[];
  method: "CASH" | "CARD" | "BANK_TRANSFER";
  /** Fraction of the total actually collected. */
  paidFraction: number;
}[] = [
  { plate: "DEMO-2001", customer: "Rania Fouad", daysAgo: 68, services: [0], method: "CASH", paidFraction: 1 },
  { plate: "DEMO-2002", customer: "Khaled Mansour", daysAgo: 61, services: [2], method: "CARD", paidFraction: 1 },
  { plate: "DEMO-2003", customer: "Dalia Sobhy", daysAgo: 52, services: [0, 1], method: "BANK_TRANSFER", paidFraction: 1 },
  { plate: "DEMO-2004", customer: "Ahmed Zaki", daysAgo: 44, services: [1], method: "CASH", paidFraction: 1 },
  { plate: "DEMO-2005", customer: "Mervat Salah", daysAgo: 37, services: [2], method: "CARD", paidFraction: 0.5 },
  { plate: "DEMO-2006", customer: "Bassem Nour", daysAgo: 29, services: [0], method: "CASH", paidFraction: 1 },
  { plate: "DEMO-2007", customer: "Iman Tawfik", daysAgo: 22, services: [0, 2], method: "BANK_TRANSFER", paidFraction: 1 },
  { plate: "DEMO-2008", customer: "Sherif Adel", daysAgo: 15, services: [1], method: "CARD", paidFraction: 1 },
  { plate: "DEMO-2009", customer: "Ghada Hilmy", daysAgo: 9, services: [0], method: "CASH", paidFraction: 0.6 },
  // The three that pay for the aging report: one per bucket.
  { plate: "DEMO-2010", customer: "Fady Riad", daysAgo: 10, services: [2], method: "CASH", paidFraction: 0 },
  { plate: "DEMO-2011", customer: "Nermin Osman", daysAgo: 45, services: [0, 1], method: "CASH", paidFraction: 0 },
  { plate: "DEMO-2012", customer: "Waleed Hegazy", daysAgo: 80, services: [1], method: "CASH", paidFraction: 0 },
];

async function createFinancialHistory(tenantId: string, branchId: string): Promise<void> {
  const manager = await prisma.staffUser.findFirst({ where: { tenantId, role: "BRANCH_MANAGER" } });
  const issuedById = manager?.id ?? "seed-demo";

  for (const [index, job] of FINISHED_JOBS.entries()) {
    const closedAt = hoursAgo(job.daysAgo * 24);

    const customer = await prisma.customer.create({
      data: { tenantId, fullName: job.customer, phone: `0101${Math.floor(Math.random() * 9_000_000 + 1_000_000)}` },
    });
    const asset = await prisma.asset.create({
      data: { tenantId, category: "CARS", plateNumber: job.plate, currentOwnerCustomerId: customer.id },
    });
    await prisma.assetOwnershipHistory.create({
      data: { tenantId, assetId: asset.id, customerId: customer.id },
    });

    const workOrder = await prisma.workOrder.create({
      data: {
        tenantId,
        branchId,
        assetId: asset.id,
        customerId: customer.id,
        status: "CLOSED",
        inspectionDeclined: false,
        createdAt: closedAt,
        closedAt,
      },
    });
    await recordLifecycleHistory(tenantId, workOrder.id, "CLOSED", closedAt);

    const lines = job.services.map((i) => DEMO_SERVICES[i]);
    // Kept in minor-unit integers until the very last step. Summing
    // floats and rounding at the end is how an invoice ends up one
    // piastre away from the lines that make it up.
    const totalPiastres = lines.reduce((sum, line) => sum + Math.round((line.unitPrice + line.laborPrice) * 100), 0);
    const paidPiastres = Math.round(totalPiastres * job.paidFraction);
    const money = (piastres: number) => (piastres / 100).toFixed(2);

    const invoice = await prisma.invoice.create({
      data: {
        tenantId,
        workOrderId: workOrder.id,
        invoiceNumber: `DEMO-INV-${String(index + 1).padStart(4, "0")}`,
        status: paidPiastres === 0 ? "ISSUED" : paidPiastres >= totalPiastres ? "PAID" : "PARTIALLY_PAID",
        subtotal: money(totalPiastres),
        total: money(totalPiastres),
        paid: money(paidPiastres),
        balance: money(totalPiastres - paidPiastres),
        issuedById,
        issuedAt: closedAt,
      },
    });

    for (const line of lines) {
      await prisma.invoiceLine.create({
        data: {
          tenantId,
          invoiceId: invoice.id,
          name: line.itemKey,
          itemType: "SERVICE",
          quantity: 1,
          lockedUnitPrice: line.unitPrice.toFixed(2),
          lockedLaborPrice: line.laborPrice.toFixed(2),
          total: (line.unitPrice + line.laborPrice).toFixed(2),
        },
      });
    }

    if (paidPiastres > 0) {
      await prisma.payment.create({
        data: {
          tenantId,
          invoiceId: invoice.id,
          amount: money(paidPiastres),
          method: job.method,
          status: "CONFIRMED",
          idempotencyKey: `demo-payment-${invoice.id}`,
          recordedById: issuedById,
          createdAt: closedAt,
        },
      });
    }
  }
}

/**
 * The workshop's parts catalogue, its stock, and the parts those finished
 * jobs actually consumed.
 *
 * Without this the demo workshop owns two warehouses and nothing to put
 * in them, so Reports -> Inventory has no profitability, no dead stock
 * and no stock risk to show, and the Inventory Manager's whole shell is
 * empty. Every part therefore carries a real cost as well as a selling
 * price, because margin is the question that section exists to answer and
 * a catalogue without cost can only report revenue.
 *
 * The three shapes here are deliberate, and each one makes a different
 * panel say something:
 *
 *   - fast movers, issued often, so stock risk has a real velocity to
 *     divide by rather than dividing by zero
 *   - a slow, expensive item held in stock and never sold, so dead stock
 *     is not an empty list
 *   - one item stocked below its own critical threshold, so the low-stock
 *     signal fires on a real balance instead of being asserted in a test
 *     and never seen
 */
const DEMO_PARTS: readonly {
  sku: string;
  name: string;
  sellingPrice: number;
  cost: number;
  stock: number;
  lowStockThreshold: number;
  criticalStockThreshold: number;
  /** How many of these each finished job that uses parts consumes. */
  perJob: number;
}[] = [
  { sku: "BRK-PAD-F", name: "Front brake pad set", sellingPrice: 1800, cost: 1150, stock: 24, lowStockThreshold: 10, criticalStockThreshold: 4, perJob: 1 },
  { sku: "ALT-12V", name: "Alternator 12V", sellingPrice: 2200, cost: 1600, stock: 6, lowStockThreshold: 4, criticalStockThreshold: 2, perJob: 1 },
  { sku: "OIL-5W30", name: "Engine oil 5W-30 (litre)", sellingPrice: 120, cost: 78, stock: 60, lowStockThreshold: 20, criticalStockThreshold: 8, perJob: 4 },
  // Stocked below its own critical threshold, on purpose.
  { sku: "FLT-AIR", name: "Air filter", sellingPrice: 260, cost: 150, stock: 1, lowStockThreshold: 12, criticalStockThreshold: 5, perJob: 1 },
  // Never issued: this is the dead stock the report should surface.
  { sku: "TRB-KIT", name: "Turbocharger rebuild kit", sellingPrice: 9800, cost: 7400, stock: 2, lowStockThreshold: 1, criticalStockThreshold: 1, perJob: 0 },
];

/**
 * The one part every job uses, and the only one actually running out.
 *
 * Stock risk divides remaining stock by recent consumption, so nothing
 * appears there unless something is genuinely consumed often and held
 * thinly -- with only the rotated parts above, every item had months of
 * runway and the panel was correctly, but uselessly, empty.
 *
 * A brake fluid top-up on every service is both the realistic shape and
 * the one that gives that panel something true to show.
 */
const DEMO_CONSUMABLE = {
  sku: "FLD-DOT4",
  name: "Brake fluid DOT 4 (500ml)",
  sellingPrice: 180,
  cost: 95,
  stock: 15,
  lowStockThreshold: 6,
  criticalStockThreshold: 3,
  perJob: 1,
};

/**
 * The catalog's structure: what a technician browses, and the questions
 * they can ask about it.
 *
 * Seeded because an empty structure makes the technician's catalog look
 * broken rather than unconfigured -- and because a demo with categories
 * but no filters would not exercise the one thing this feature is for.
 * Every value here is ordinary workshop vocabulary; none of it is known
 * to the application, which reads it back the same way it would read a
 * real workshop's own.
 */
const DEMO_CATEGORIES: readonly { slug: string; name: string; parent?: string; filters: readonly string[] }[] = [
  { slug: "brakes", name: "Brakes", filters: ["vehicle-type", "brand"] },
  { slug: "brakes-pads", name: "Pads & discs", parent: "brakes", filters: ["vehicle-type", "brand"] },
  { slug: "engine", name: "Engine", filters: ["vehicle-type", "brand", "engine-size"] },
  { slug: "filters", name: "Filters", filters: ["vehicle-type", "brand"] },
  { slug: "electrical", name: "Electrical", filters: ["vehicle-type", "brand"] },
  { slug: "fluids", name: "Fluids", filters: ["vehicle-type"] },
];

const DEMO_ATTRIBUTES: readonly { key: string; label: string; values: readonly string[] }[] = [
  { key: "vehicle-type", label: "Vehicle Type", values: ["Sedan", "SUV", "Truck"] },
  { key: "brand", label: "Brand", values: ["Toyota", "Hyundai", "BMW"] },
  { key: "engine-size", label: "Engine Size", values: ["1.4", "1.6", "2.0"] },
];

/** sku -> where it is filed, what it is, and how it reads on a card. */
const DEMO_PART_CONFIGURATION: Readonly<
  Record<string, { category: string; summary: string; attributes: Readonly<Record<string, string>> }>
> = {
  "BRK-PAD-F": {
    category: "brakes-pads",
    summary: "Ceramic, low dust",
    attributes: { "vehicle-type": "Sedan", brand: "Toyota" },
  },
  "ALT-12V": {
    category: "electrical",
    summary: "90A, remanufactured",
    attributes: { "vehicle-type": "SUV", brand: "Hyundai" },
  },
  "OIL-5W30": {
    category: "fluids",
    summary: "Fully synthetic, sold by the litre",
    attributes: { "vehicle-type": "Sedan" },
  },
  "FLT-AIR": {
    category: "filters",
    summary: "Paper element",
    attributes: { "vehicle-type": "Sedan", brand: "Toyota" },
  },
  "TRB-KIT": {
    category: "engine",
    summary: "Complete rebuild kit with gaskets",
    attributes: { "vehicle-type": "Truck", brand: "BMW", "engine-size": "2.0" },
  },
  "FLD-DOT4": {
    category: "brakes",
    summary: "DOT 4, 500ml",
    attributes: { "vehicle-type": "SUV" },
  },
};

async function ensureCatalogStructure(tenantId: string): Promise<void> {
  const attributeIds = new Map<string, string>();
  const valueIds = new Map<string, string>();

  for (const [index, definition] of DEMO_ATTRIBUTES.entries()) {
    const attribute = await prisma.catalogAttribute.upsert({
      where: { tenantId_key: { tenantId, key: definition.key } },
      update: { label: definition.label, sortOrder: index },
      create: { tenantId, key: definition.key, label: definition.label, sortOrder: index },
    });
    attributeIds.set(definition.key, attribute.id);

    for (const [order, label] of definition.values.entries()) {
      const value = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const row = await prisma.catalogAttributeValue.upsert({
        where: { attributeId_value: { attributeId: attribute.id, value } },
        update: { label, sortOrder: order },
        create: { tenantId, attributeId: attribute.id, value, label, sortOrder: order },
      });
      valueIds.set(`${definition.key}|${label}`, row.id);
    }
  }

  const categoryIds = new Map<string, string>();
  for (const [index, definition] of DEMO_CATEGORIES.entries()) {
    const category = await prisma.catalogCategory.upsert({
      where: { tenantId_slug: { tenantId, slug: definition.slug } },
      update: {
        name: definition.name,
        sortOrder: index,
        parentId: definition.parent ? (categoryIds.get(definition.parent) ?? null) : null,
      },
      create: {
        tenantId,
        slug: definition.slug,
        name: definition.name,
        sortOrder: index,
        parentId: definition.parent ? (categoryIds.get(definition.parent) ?? null) : null,
      },
    });
    categoryIds.set(definition.slug, category.id);

    // Replaced rather than added to, so re-seeding after a filter is
    // renamed does not leave the old attachment behind.
    await prisma.catalogCategoryAttribute.deleteMany({ where: { tenantId, categoryId: category.id } });
    await prisma.catalogCategoryAttribute.createMany({
      data: definition.filters
        .map((key, order) => ({ tenantId, categoryId: category.id, attributeId: attributeIds.get(key)!, sortOrder: order }))
        .filter((row) => Boolean(row.attributeId)),
    });
  }

  for (const [sku, configuration] of Object.entries(DEMO_PART_CONFIGURATION)) {
    const item = await prisma.inventoryItem.findFirst({ where: { tenantId, sku }, select: { id: true } });
    if (!item) continue;

    await prisma.inventoryItem.update({
      where: { id: item.id },
      data: {
        catalogCategoryId: categoryIds.get(configuration.category) ?? null,
        summary: configuration.summary,
      },
    });

    await prisma.inventoryItemAttributeValue.deleteMany({ where: { tenantId, inventoryItemId: item.id } });
    for (const [key, label] of Object.entries(configuration.attributes)) {
      const attributeId = attributeIds.get(key);
      const valueId = valueIds.get(`${key}|${label}`);
      if (!attributeId || !valueId) continue;
      await prisma.inventoryItemAttributeValue.create({
        data: { tenantId, inventoryItemId: item.id, attributeId, valueId },
      });
    }
  }
}

async function ensurePartsCatalog(tenantId: string): Promise<void> {
  const warehouse = await prisma.warehouse.findFirst({ where: { tenantId }, orderBy: { code: "asc" } });
  if (!warehouse) return;

  for (const part of [...DEMO_PARTS, DEMO_CONSUMABLE]) {
    const existing = await prisma.inventoryItem.findFirst({ where: { tenantId, sku: part.sku } });
    if (existing) {
      // Put the shelf back how it started. Without this the balance only
      // ever falls -- each re-seed issues more parts against stock the
      // previous run already spent, and after a few runs the warehouse
      // is empty and the reports go quiet again.
      await prisma.warehouseStockBalance.updateMany({
        where: { tenantId, inventoryItemId: existing.id, warehouseId: warehouse.id },
        data: { availableQty: part.stock, issuedQty: 0 },
      });
      continue;
    }

    const item = await prisma.inventoryItem.create({
      data: {
        tenantId,
        sku: part.sku,
        name: part.name,
        itemType: "PART",
        compatibleCategories: ["CARS"],
        lowStockThreshold: part.lowStockThreshold,
        criticalStockThreshold: part.criticalStockThreshold,
        sellingPrice: part.sellingPrice.toFixed(2),
        cost: part.cost.toFixed(2),
        stockTracked: true,
      },
    });

    await prisma.warehouseStockBalance.create({
      data: { tenantId, inventoryItemId: item.id, warehouseId: warehouse.id, availableQty: part.stock },
    });

    // The receipt that put it there. A balance with no movement behind it
    // is stock that appeared from nowhere, which is exactly the shape
    // Workflow Health is built to notice.
    await prisma.stockMovement.create({
      data: {
        tenantId,
        inventoryItemId: item.id,
        warehouseId: warehouse.id,
        type: "SUPPLIER_RECEIPT",
        quantity: part.stock,
        beforeQty: 0,
        afterQty: part.stock,
        actorId: "seed-demo",
        createdAt: hoursAgo(90 * 24),
      },
    });
  }
}

/**
 * Puts real parts on the finished jobs, and takes them out of stock.
 *
 * Both halves matter. A part line with no stock movement bills a customer
 * for something the warehouse never gave up, and that mismatch is a
 * genuine integrity fault rather than a cosmetic one.
 */
async function issuePartsToFinishedJobs(tenantId: string): Promise<void> {
  const warehouse = await prisma.warehouse.findFirst({ where: { tenantId }, orderBy: { code: "asc" } });
  if (!warehouse) return;

  const jobs = await prisma.workOrder.findMany({
    where: { tenantId, status: "CLOSED", asset: { plateNumber: { startsWith: "DEMO-" } } },
    select: { id: true, closedAt: true },
    orderBy: { closedAt: "asc" },
  });

  const consumable = DEMO_PARTS.filter((part) => part.perJob > 0);

  for (const [index, job] of jobs.entries()) {
    // Rotated rather than random so a re-seed produces the same picture
    // and a demo does not change shape between two runs of the script.
    // Every job gets the consumable; the rotated part is on top of it.
    await issuePart(tenantId, warehouse.id, job, DEMO_CONSUMABLE);

    const part = consumable[index % consumable.length]!;
    await issuePart(tenantId, warehouse.id, job, part);
  }
}

interface DemoPart {
  sku: string;
  name: string;
  sellingPrice: number;
  cost: number;
  perJob: number;
}

/**
 * One part onto one job, and out of stock in the same breath.
 *
 * Refuses rather than goes negative: a seed that issues stock the
 * warehouse does not hold produces exactly the balance/movement mismatch
 * Workflow Health exists to catch, and a demo that opens with a fabricated
 * integrity fault teaches the wrong thing about the product.
 */
async function issuePart(
  tenantId: string,
  warehouseId: string,
  job: { id: string; closedAt: Date | null },
  part: DemoPart,
): Promise<void> {
  const item = await prisma.inventoryItem.findFirst({ where: { tenantId, sku: part.sku } });
  if (!item) return;

  const balance = await prisma.warehouseStockBalance.findFirst({
    where: { tenantId, inventoryItemId: item.id, warehouseId },
  });
  if (!balance || balance.availableQty < part.perJob) return;

  const at = job.closedAt ?? new Date();

  await prisma.workOrderPartLine.create({
    data: {
      tenantId,
      workOrderId: job.id,
      provenance: "INVENTORY",
      inventoryItemId: item.id,
      name: part.name,
      quantity: part.perJob,
      sellingPrice: part.sellingPrice.toFixed(2),
      cost: part.cost.toFixed(2),
      addedById: "seed-demo",
      createdAt: at,
    },
  });

  const after = balance.availableQty - part.perJob;
  await prisma.warehouseStockBalance.update({
    where: { id: balance.id },
    data: { availableQty: after, issuedQty: { increment: part.perJob } },
  });
  await prisma.stockMovement.create({
    data: {
      tenantId,
      inventoryItemId: item.id,
      warehouseId,
      type: "ISSUE",
      quantity: part.perJob,
      beforeQty: balance.availableQty,
      afterQty: after,
      referenceType: "WorkOrder",
      referenceId: job.id,
      actorId: "seed-demo",
      createdAt: at,
    },
  });
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
