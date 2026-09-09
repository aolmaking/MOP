/**
 * Refunds and discounts, over real HTTP against real Postgres.
 *
 * Both loops were complete behind the API before this file existed -- request,
 * approve, reject, all permission-gated, a refund even producing a real credit
 * note through the billing adapter -- and **no page in the product called any
 * of them**. Nothing failed; there was simply no way for a person to ask for a
 * refund or to grant one, and no way to see what was waiting.
 *
 * That made `DISCOUNT_AUTHORITY` worse than decorative. Set to anything but
 * `ANY_STAFF_UNLIMITED`, the policy routes a discount into a request that had
 * to be approved -- by a surface that did not exist. A workshop configuring
 * its discount rules was configuring a feature it could no longer use.
 *
 * What this file holds down is the queue those pages read, because the queue
 * is where the two mistakes would be invisible: showing one workshop's
 * requests to another, and showing a requester a list they may not decide.
 */
import { bootApp, expectCode, http, loginAs, LAUNCH_PROFILE, type BootedApp, type Session } from "./http-kit";
import { hashPassword } from "../identity/auth/password.util";

const SUFFIX = `money-${Date.now()}`;
const PLATFORM_PASSWORD = "platform-password-123";
const OWNER_PASSWORD = "owner-password-123";
const STAFF_PASSWORD = "staff-password-123";

describe("Money approvals (real HTTP, real Postgres)", () => {
  let booted: BootedApp;
  let platformEmail: string;
  let tenantId: string;
  let northBranchId: string;
  let southBranchId: string;
  let ownerEmail: string;

  let ownerSession: Session;
  let northManager: Session;

  async function staffAt(role: string, name: string, branchScope: string[]): Promise<Session> {
    const email = `${role.toLowerCase()}-${name.replace(/\W/g, "")}-${SUFFIX}@mop.local`;
    const account = await booted.prisma.account.create({
      data: { accountType: "TENANT_STAFF", tenantId, email, passwordHash: hashPassword(STAFF_PASSWORD), status: "ACTIVE" },
    });
    await booted.prisma.staffUser.create({
      data: {
        accountId: account.id,
        tenantId,
        fullName: name,
        role: role as never,
        branchScope,
        warehouseScope: [],
        categoryScope: ["CARS"],
      },
    });
    return loginAs(booted, email, STAFF_PASSWORD);
  }

  /** A job with one chargeable line on it, at a named branch. */
  async function jobAt(branchId: string, plate: string, unitPrice = "100.00"): Promise<string> {
    const customer = await booted.prisma.customer.create({
      data: { tenantId, fullName: `Owner of ${plate}`, phone: `+2011${Math.floor(Math.random() * 100000000)}` },
    });
    const asset = await booted.prisma.asset.create({
      data: { tenantId, category: "CARS", plateNumber: plate, currentOwnerCustomerId: customer.id },
    });
    const order = await booted.prisma.workOrder.create({
      data: { tenantId, branchId, customerId: customer.id, assetId: asset.id, status: "IN_PROGRESS" },
    });

    // A part fitted to the job, which is how a real charge gets onto one:
    // Finance PULLS chargeable items from Operations rather than being told
    // about them, so a line written here is the same line the invoice absorbs.
    await booted.prisma.workOrderPartLine.create({
      data: {
        tenantId,
        workOrderId: order.id,
        provenance: "INVENTORY",
        name: "Brake pad set",
        quantity: 1,
        sellingPrice: unitPrice,
        workshopWarranted: true,
        addedById: "money-approvals-spec",
      },
    });

    return order.id;
  }

  /** A job taken all the way to a settled invoice, which is what a refund reverses. */
  async function paidJobAt(branchId: string, plate: string, amount = "100.00"): Promise<string> {
    const workOrderId = await jobAt(branchId, plate, amount);

    const issued = await http(booted)
      .post(`/api/v1/finance/work-orders/${workOrderId}/invoice`)
      .set("Cookie", ownerSession.cookie)
      .send({});
    expectCode(issued, 201);

    const paid = await http(booted)
      .post(`/api/v1/finance/invoices/${issued.body.invoiceId}/payments`)
      .set("Cookie", ownerSession.cookie)
      .send({ amount, method: "CASH", idempotencyKey: `pay-${plate}-${Date.now()}` });
    expectCode(paid, 201);

    return issued.body.invoiceId;
  }

  beforeAll(async () => {
    booted = await bootApp();

    const plan = await booted.prisma.plan.create({
      data: {
        code: `MONEY-${SUFFIX}`,
        name: "Money Approvals Plan",
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

    platformEmail = `platform-${SUFFIX}@mop.local`;
    await booted.prisma.account.create({
      data: { accountType: "PLATFORM", email: platformEmail, passwordHash: hashPassword(PLATFORM_PASSWORD), status: "ACTIVE" },
    });
    const platformSession = await loginAs(booted, platformEmail, PLATFORM_PASSWORD);

    ownerEmail = `owner-${SUFFIX}@mop.local`;
    const created = await http(booted)
      .post("/api/v1/platform/workshops")
      .set("Cookie", platformSession.cookie)
      .send({
        planId: plan.id,
        name: `Money Motors ${SUFFIX}`,
        slug: `money-motors-${SUFFIX}`.toLowerCase(),
        country: "EG",
        city: "Cairo",
        businessType: "Franchise / Chain",
        primaryCategory: "CARS",
        currency: "EGP",
        timezone: "Africa/Cairo",
        ownerFullName: "Money Owner",
        ownerEmail,
        ownerPhone: "+201234567891",
        starterBuilderTemplate: "MINIMAL",
        initialStatus: "ACTIVE",
        // Two branches, because one cannot demonstrate a scope leak.
        branches: [
          { name: "North Branch", code: "NORTH", city: "Cairo" },
          { name: "South Branch", code: "SOUTH", city: "Giza" },
        ],
        warehouses: [{ name: "Main Store", code: "STORE", branchCodes: ["NORTH", "SOUTH"] }],
        capabilities: LAUNCH_PROFILE,
      });
    expectCode(created, 201);
    tenantId = created.body.tenant.id;

    await http(booted)
      .post("/api/v1/auth/invite/accept")
      .send({ token: String(created.body.ownerInvitation.link).split("token=")[1], password: OWNER_PASSWORD });
    ownerSession = await loginAs(booted, ownerEmail, OWNER_PASSWORD);

    northBranchId = (await booted.prisma.branch.findFirstOrThrow({ where: { tenantId, code: "NORTH" } })).id;
    southBranchId = (await booted.prisma.branch.findFirstOrThrow({ where: { tenantId, code: "SOUTH" } })).id;

    northManager = await staffAt("BRANCH_MANAGER", "North Manager", [northBranchId]);
  }, 240_000);

  afterAll(async () => {
    if (tenantId) {
      await booted.prisma.creditNote.deleteMany({ where: { tenantId } });
      await booted.prisma.refundRequest.deleteMany({ where: { tenantId } });
      await booted.prisma.discountRequest.deleteMany({ where: { tenantId } });
      await booted.prisma.payment.deleteMany({ where: { tenantId } });
      await booted.prisma.billingDocument.deleteMany({ where: { tenantId } });
      await booted.prisma.invoiceLine.deleteMany({ where: { tenantId } });
      await booted.prisma.invoice.deleteMany({ where: { tenantId } });
      await booted.prisma.runningInvoiceLine.deleteMany({ where: { tenantId } });
      await booted.prisma.runningInvoice.deleteMany({ where: { tenantId } });
      await booted.prisma.operationEvent.deleteMany({ where: { tenantId } });
      await booted.prisma.workOrder.deleteMany({ where: { tenantId } });
      await booted.prisma.assetOwnershipHistory.deleteMany({ where: { tenantId } });
      await booted.prisma.asset.deleteMany({ where: { tenantId } });
      await booted.prisma.customer.deleteMany({ where: { tenantId } });
      await booted.prisma.session.deleteMany({ where: { tenantId } });
      await booted.prisma.staffUser.deleteMany({ where: { tenantId } });
      await booted.prisma.account.deleteMany({ where: { tenantId } });
    }
    await booted.prisma.account.deleteMany({ where: { email: platformEmail } });
    await booted.close();
  }, 240_000);

  describe("a refund is asked for by one person and granted by another", () => {
    it("the queue carries what the decider needs to decide with", async () => {
      const invoiceId = await paidJobAt(northBranchId, `REF-${Date.now() % 100000}`);

      const asked = await http(booted)
        .post(`/api/v1/finance/invoices/${invoiceId}/refunds`)
        .set("Cookie", northManager.cookie)
        .send({ amount: "40.00", reason: "Charged for a filter we did not fit" });
      expectCode(asked, 201);

      const queue = await http(booted).get("/api/v1/finance/approvals").set("Cookie", ownerSession.cookie);
      expectCode(queue, 200);

      const row = queue.body.refunds.find((r: { id: string }) => r.id === asked.body.id);
      expect(row).toBeDefined();
      // Amount, who asked and why -- a row that omits any of the three is a
      // decision made blind.
      expect(row.amount).toBe("40.00");
      expect(row.reason).toBe("Charged for a filter we did not fit");
      expect(row.requestedBy).toBe("North Manager");
      expect(row.customerName).toContain("Owner of REF-");
    });

    it("approving writes a real credit note and clears the row", async () => {
      const invoiceId = await paidJobAt(northBranchId, `REF2-${Date.now() % 100000}`);
      const asked = await http(booted)
        .post(`/api/v1/finance/invoices/${invoiceId}/refunds`)
        .set("Cookie", northManager.cookie)
        .send({ amount: "25.00", reason: "Goodwill after a delay" });
      expectCode(asked, 201);

      const approved = await http(booted)
        .post(`/api/v1/finance/refunds/${asked.body.id}/approve`)
        .set("Cookie", ownerSession.cookie)
        .send({});
      expectCode(approved, 201);
      // Money leaving without a document is money nobody can account for.
      expect(approved.body.creditNoteNumber).toBeTruthy();

      const queue = await http(booted).get("/api/v1/finance/approvals").set("Cookie", ownerSession.cookie);
      expect(queue.body.refunds.map((r: { id: string }) => r.id)).not.toContain(asked.body.id);
    });

    it("refuses the manager who asked the right to grant it", async () => {
      const invoiceId = await paidJobAt(northBranchId, `REF3-${Date.now() % 100000}`);
      const asked = await http(booted)
        .post(`/api/v1/finance/invoices/${invoiceId}/refunds`)
        .set("Cookie", northManager.cookie)
        .send({ amount: "10.00", reason: "Duplicate charge" });
      expectCode(asked, 201);

      const attempted = await http(booted)
        .post(`/api/v1/finance/refunds/${asked.body.id}/approve`)
        .set("Cookie", northManager.cookie)
        .send({});
      expectCode(attempted, 403);
    });

    it("shows a requester who cannot decide anything the door, not a list", async () => {
      // BRANCH_MANAGER holds both request permissions and neither decide one,
      // so there is nothing on this page for them to do.
      const queue = await http(booted).get("/api/v1/finance/approvals").set("Cookie", northManager.cookie);
      expectCode(queue, 403);
    });
  });

  describe("a discount is a request the workshop's own policy routes", () => {
    it("appears in the queue with the job it would come off", async () => {
      const workOrderId = await jobAt(northBranchId, `DIS-${Date.now() % 100000}`, "200.00");

      const asked = await http(booted)
        .post(`/api/v1/finance/work-orders/${workOrderId}/discounts`)
        .set("Cookie", northManager.cookie)
        .send({ amount: "30.00", reason: "Long-standing customer" });
      expectCode(asked, 201);

      const queue = await http(booted).get("/api/v1/finance/approvals").set("Cookie", ownerSession.cookie);
      const row = queue.body.discounts.find((r: { id: string }) => r.id === asked.body.id);
      expect(row).toBeDefined();
      expect(row.amount).toBe("30.00");
      expect(row.workOrderId).toBe(workOrderId);
      expect(row.requestedBy).toBe("North Manager");
    });

    it("a declined discount leaves the queue and says why", async () => {
      const workOrderId = await jobAt(northBranchId, `DIS2-${Date.now() % 100000}`, "200.00");
      const asked = await http(booted)
        .post(`/api/v1/finance/work-orders/${workOrderId}/discounts`)
        .set("Cookie", northManager.cookie)
        .send({ amount: "150.00", reason: "Asked for most of it off" });
      expectCode(asked, 201);

      const rejected = await http(booted)
        .post(`/api/v1/finance/discounts/${asked.body.id}/reject`)
        .set("Cookie", ownerSession.cookie)
        .send({ reason: "Too large for a routine job" });
      expectCode(rejected, 201);

      const queue = await http(booted).get("/api/v1/finance/approvals").set("Cookie", ownerSession.cookie);
      expect(queue.body.discounts.map((r: { id: string }) => r.id)).not.toContain(asked.body.id);
    });
  });

  describe("the queue is branch-scoped, like every other manager surface", () => {
    it("does not show one branch's request to a manager at another", async () => {
      // The owner grants the south manager the right to decide, so the only
      // thing that can keep the north job off their page is branch scope.
      const southManager = await staffAt("BRANCH_MANAGER", "South Manager", [southBranchId]);
      const southStaff = await booted.prisma.staffUser.findFirstOrThrow({
        where: { tenantId, fullName: "South Manager" },
        select: { id: true },
      });
      for (const permission of ["finance.refund.decide", "finance.discount.decide"]) {
        await booted.prisma.userPermissionOverride.create({
          data: {
            tenantId,
            staffUserId: southStaff.id,
            permissionKey: permission,
            allowed: true,
            createdBy: "money-approvals-spec",
          },
        });
      }

      const northJob = await jobAt(northBranchId, `SCOPE-${Date.now() % 100000}`, "200.00");
      const asked = await http(booted)
        .post(`/api/v1/finance/work-orders/${northJob}/discounts`)
        .set("Cookie", northManager.cookie)
        .send({ amount: "20.00", reason: "North branch goodwill" });
      expectCode(asked, 201);

      const southQueue = await http(booted).get("/api/v1/finance/approvals").set("Cookie", southManager.cookie);
      expectCode(southQueue, 200);
      expect(southQueue.body.discounts.map((r: { id: string }) => r.id)).not.toContain(asked.body.id);

      // And the owner, who is scoped to no branch, sees it.
      const ownerQueue = await http(booted).get("/api/v1/finance/approvals").set("Cookie", ownerSession.cookie);
      expect(ownerQueue.body.discounts.map((r: { id: string }) => r.id)).toContain(asked.body.id);
    });
  });
});
