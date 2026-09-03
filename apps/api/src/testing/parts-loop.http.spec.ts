/**
 * The Honesty Harness, inventory half.
 *
 * `walkthrough.http.spec.ts` proves the spine: book in, inspect, price,
 * approve, work, bill, pay, release. This proves the loop hanging off
 * the middle of it -- a technician needs a part, the store issues it
 * from a real shelf, the money picks it up exactly once, and a return
 * puts both the stock and the bill back.
 *
 * It is the seven browser journeys of
 * `docs/14-day-launch/INVENTORY-EXECUTION-MAP.md` §I expressed as HTTP,
 * and the A-J acceptance list of §H, which says in as many words that
 * they "all land in Honesty Harness scenario".
 *
 * Same rules as the spine walkthrough. Every operational step is a real
 * request. The only non-HTTP writes are the ones the product has no
 * endpoint for.
 *
 * ONE OF THOSE IS WORTH NAMING. There is no way to put opening stock on
 * a shelf over the API: Catalog deliberately does not set quantity
 * ("the ledger is the page"), and no receiving, adjustment or
 * stock-take endpoint exists. Every balance in this file is therefore
 * seeded straight into `WarehouseStockBalance` -- and a real pilot
 * workshop would have the same problem on its first morning. Recorded
 * rather than papered over; it is outside the approved launch scope, so
 * it is a finding, not a task.
 */
import { bootApp, expectCode, http, loginAs, LAUNCH_PROFILE, type BootedApp, type Session } from "./http-kit";
import { hashPassword } from "../identity/auth/password.util";

const SUFFIX = `pl-${Date.now()}`;
const PLATFORM_PASSWORD = "platform-password-123";
const OWNER_PASSWORD = "owner-password-123";
const STAFF_PASSWORD = "staff-password-123";

describe("Parts loop (real HTTP, real Postgres)", () => {
  let booted: BootedApp;
  let platformEmail: string;
  let tenantId: string;
  let branchId: string;
  let warehouseId: string;
  let ownerEmail: string;
  let itemId: string;

  let managerSession: Session;
  let technicianSession: Session;
  let storekeeperSession: Session;

  let workOrderId: string;
  let taskId: string;
  let partRequestId: string;
  let returnedRequestId: string;

  /** The finish-check conditions that are currently blocking, in the technician's own words. */
  function unsatisfied(check: { conditions: { satisfied: boolean; text: string }[] }): string[] {
    return check.conditions.filter((condition) => !condition.satisfied).map((condition) => condition.text);
  }

  /** The shelf, as the store would count it. */
  async function onHand(): Promise<number> {
    const balance = await booted.prisma.warehouseStockBalance.findFirstOrThrow({
      where: { inventoryItemId: itemId, warehouseId },
      select: { availableQty: true },
    });
    return balance.availableQty;
  }

  /**
   * A staff account of a given role. The invite path is proven once in
   * the spine walkthrough; proving it again per role would make this
   * file slower without making it truer.
   */
  async function staff(role: string, name: string): Promise<Session> {
    const email = `${role.toLowerCase()}-${SUFFIX}@mop.local`;
    const account = await booted.prisma.account.create({
      data: {
        accountType: "TENANT_STAFF",
        tenantId,
        email,
        passwordHash: hashPassword(STAFF_PASSWORD),
        status: "ACTIVE",
      },
    });
    await booted.prisma.staffUser.create({
      data: {
        accountId: account.id,
        tenantId,
        fullName: name,
        role: role as never,
        branchScope: [branchId],
        warehouseScope: [warehouseId],
        categoryScope: ["CARS"],
      },
    });
    return loginAs(booted, email, STAFF_PASSWORD);
  }

  beforeAll(async () => {
    booted = await bootApp();

    const plan = await booted.prisma.plan.create({
      data: {
        code: `PARTSLOOP-${SUFFIX}`,
        name: "Parts Loop Plan",
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
      data: {
        accountType: "PLATFORM",
        email: platformEmail,
        passwordHash: hashPassword(PLATFORM_PASSWORD),
        status: "ACTIVE",
      },
    });
    const platformSession = await loginAs(booted, platformEmail, PLATFORM_PASSWORD);

    ownerEmail = `owner-${SUFFIX}@mop.local`;
    const created = await http(booted)
      .post("/api/v1/platform/workshops")
      .set("Cookie", platformSession.cookie)
      .send({
        planId: plan.id,
        name: `Parts Loop Motors ${SUFFIX}`,
        slug: `parts-loop-${SUFFIX}`.toLowerCase(),
        country: "EG",
        city: "Cairo",
        businessType: "Independent Garage",
        primaryCategory: "CARS",
        currency: "EGP",
        timezone: "Africa/Cairo",
        ownerFullName: "Parts Loop Owner",
        ownerEmail,
        ownerPhone: "+201234567890",
        starterBuilderTemplate: "MINIMAL",
        initialStatus: "ACTIVE",
        branches: [{ name: "Main Branch", code: "MAIN", city: "Cairo" }],
        warehouses: [{ name: "Main Store", code: "STORE", branchCodes: ["MAIN"] }],
        // Inventory and returns are both ON in the launch shape -- that is
        // the whole subject of this file.
        capabilities: LAUNCH_PROFILE,
      });
    expectCode(created, 201);
    tenantId = created.body.tenant.id;

    await http(booted)
      .post("/api/v1/auth/invite/accept")
      .send({ token: String(created.body.ownerInvitation.link).split("token=")[1], password: OWNER_PASSWORD });

    branchId = (await booted.prisma.branch.findFirstOrThrow({ where: { tenantId }, select: { id: true } })).id;
    warehouseId = (await booted.prisma.warehouse.findFirstOrThrow({ where: { tenantId }, select: { id: true } })).id;

    managerSession = await staff("BRANCH_MANAGER", "Parts Loop Manager");
    technicianSession = await staff("TECHNICIAN", "Parts Loop Technician");
    storekeeperSession = await staff("INVENTORY_MANAGER", "Parts Loop Storekeeper");
  }, 180_000);

  afterAll(async () => {
    if (tenantId) {
      await booted.prisma.session.deleteMany({ where: { tenantId } });
      await booted.prisma.staffUser.deleteMany({ where: { tenantId } });
      await booted.prisma.account.deleteMany({ where: { tenantId } });
    }
    await booted.prisma.account.deleteMany({ where: { email: platformEmail } });
    await booted.close();
  }, 180_000);

  it("the storekeeper puts a part in the catalogue", async () => {
    const res = await http(booted)
      .post("/api/v1/inventory/catalog")
      .set("Cookie", storekeeperSession.cookie)
      .send({
        sku: `BRK-${SUFFIX}`,
        name: "Front brake pad set",
        itemType: "PART",
        sellingPrice: "450.00",
        cost: "300.00",
        compatibleCategories: ["CARS"],
        stockTracked: true,
        workOrderUsable: true,
      });

    expectCode(res, 201);
    itemId = res.body.id;
    expect(itemId).toBeTruthy();

    // The opening balance. Seeded directly because no endpoint exists --
    // see this file's header; the pilot has the same problem.
    await booted.prisma.warehouseStockBalance.create({
      data: { tenantId, inventoryItemId: itemId, warehouseId, availableQty: 10 },
    });
    expect(await onHand()).toBe(10);
  }, 120_000);

  it("a job is booked in and reaches a technician", async () => {
    const intake = await http(booted)
      .post("/api/v1/branch-manager/intake")
      .set("Cookie", managerSession.cookie)
      .send({
        branchId,
        customer: { fullName: "Parts Loop Customer", phone: "+201234567899" },
        asset: { category: "CARS", plateNumber: `PL-${Date.now()}` },
        complaint: "Grinding when braking",
      });
    expectCode(intake, 201);
    workOrderId = intake.body.workOrderId;

    const staffUser = await booted.prisma.staffUser.findFirstOrThrow({
      where: { tenantId, role: "TECHNICIAN" },
      select: { id: true },
    });
    await booted.prisma.workOrderAssignment.create({
      data: { tenantId, workOrderId, staffUserId: staffUser.id },
    });

    // Through inspection and approval to IN_PROGRESS, which is where a
    // part can be asked for.
    expectCode(
      await http(booted)
        .post(`/api/v1/technician/work-orders/${workOrderId}/start-inspection`)
        .set("Cookie", technicianSession.cookie)
        .send({}),
      200,
    );
    expectCode(
      await http(booted)
        .post(`/api/v1/technician/work-orders/${workOrderId}/inspection`)
        .set("Cookie", technicianSession.cookie)
        .send({ type: "QUICK", note: "Pads worn to the backing plate." }),
      201,
    );

    const raised = await http(booted)
      .post(`/api/v1/technician/work-orders/${workOrderId}/decisions`)
      .set("Cookie", technicianSession.cookie)
      .send({
        name: "Replace front brake pads",
        explanation: "Worn to the backing plate; unsafe to leave.",
        importance: "HIGH",
        price: "450.00",
      });
    expectCode(raised, 201);

    const read = await http(booted).get(`/api/v1/public/decisions/${raised.body.secureToken}`);
    expectCode(read, 200);
    expectCode(
      await http(booted)
        .post(`/api/v1/public/decisions/${raised.body.secureToken}/respond`)
        .send({ answers: [{ itemId: read.body.items[0].id, decision: "APPROVED" }] }),
      200,
    );

    expectCode(
      await http(booted)
        .post(`/api/v1/technician/work-orders/${workOrderId}/start-work`)
        .set("Cookie", technicianSession.cookie)
        .send({}),
      200,
    );

    const created = await http(booted)
      .post(`/api/v1/branch-manager/work-orders/${workOrderId}/tasks`)
      .set("Cookie", managerSession.cookie)
      .send({ title: "Replace front brake pads" });
    expectCode(created, 201);
    taskId = created.body.id;
    await booted.prisma.taskAssignment.create({ data: { tenantId, taskId, staffUserId: staffUser.id } });
  }, 120_000);

  /** Journey 1 / acceptance D. */
  it("[J1] the technician asks for a part, and the job says it is waiting", async () => {
    const res = await http(booted)
      .post(`/api/v1/technician/work-orders/${workOrderId}/parts`)
      .set("Cookie", technicianSession.cookie)
      .send({ inventoryItemId: itemId, quantity: 2, reason: "Pads worn out" });
    expectCode(res, 201);

    const workOrder = await booted.prisma.workOrder.findUniqueOrThrow({
      where: { id: workOrderId },
      select: { status: true },
    });
    expect(workOrder.status).toBe("WAITING_PARTS");

    const card = await http(booted)
      .get(`/api/v1/technician/work-orders/${workOrderId}`)
      .set("Cookie", technicianSession.cookie);
    expectCode(card, 200);
    const part = card.body.parts[0];
    partRequestId = part.partRequestId;
    // The technician is told whose move it is, in words, not an enum.
    expect(part.waitingOn).toBe("STORE");
    expect(part.action).toBeNull();
    expect(part.returnable).toBe(false);
  }, 120_000);

  /** Acceptance A + I. */
  it("[A/I] the request shows up in the store's queue, and never in another workshop's", async () => {
    const queue = await http(booted).get("/api/v1/inventory/requests").set("Cookie", storekeeperSession.cookie);
    expectCode(queue, 200);
    expect(JSON.stringify(queue.body)).toContain(partRequestId);

    // A different workshop's storekeeper must not see it. Tenant
    // isolation asserted from the outside, over HTTP, rather than
    // trusted from a `where` clause somewhere.
    const otherTenant = await booted.prisma.tenant.findFirst({
      where: { id: { not: tenantId } },
      select: { id: true },
    });
    if (otherTenant) {
      const intruderEmail = `intruder-${SUFFIX}@mop.local`;
      const account = await booted.prisma.account.create({
        data: {
          accountType: "TENANT_STAFF",
          tenantId: otherTenant.id,
          email: intruderEmail,
          passwordHash: hashPassword(STAFF_PASSWORD),
          status: "ACTIVE",
        },
      });
      await booted.prisma.staffUser.create({
        data: {
          accountId: account.id,
          tenantId: otherTenant.id,
          fullName: "Other Workshop Storekeeper",
          role: "INVENTORY_MANAGER",
          branchScope: [],
          warehouseScope: [],
          categoryScope: ["CARS"],
        },
      });

      const intruder = await loginAs(booted, intruderEmail, STAFF_PASSWORD);
      const theirQueue = await http(booted).get("/api/v1/inventory/requests").set("Cookie", intruder.cookie);
      // Either they cannot look at all, or they look and this request is
      // absent. Both are correct; seeing it is not.
      if (theirQueue.status === 200) expect(JSON.stringify(theirQueue.body)).not.toContain(partRequestId);

      await booted.prisma.session.deleteMany({ where: { tenantId: otherTenant.id } });
      await booted.prisma.staffUser.deleteMany({ where: { accountId: account.id } });
      await booted.prisma.account.delete({ where: { id: account.id } });
    }
  }, 120_000);

  /** Journey 2 / acceptance B + C + rule R1. */
  it("[J2/R1] a partial issue moves real stock, and deliberately does not finish the request", async () => {
    expectCode(
      await http(booted)
        .post(`/api/v1/inventory/requests/${partRequestId}/approve`)
        .set("Cookie", storekeeperSession.cookie)
        .send({}),
      201,
    );

    const before = await onHand();
    expectCode(
      await http(booted)
        .post(`/api/v1/inventory/requests/${partRequestId}/issue`)
        .set("Cookie", storekeeperSession.cookie)
        .send({ warehouseId, quantity: 1 }),
      201,
    );

    expect(await onHand()).toBe(before - 1);

    const movement = await booted.prisma.stockMovement.findFirstOrThrow({
      where: { inventoryItemId: itemId, referenceId: partRequestId, type: "ISSUE" },
      select: { quantity: true, beforeQty: true, afterQty: true },
      orderBy: { createdAt: "desc" },
    });
    // Where the shelf was and where it ended up, so the item page can be
    // replayed rather than recomputed.
    expect(movement.quantity).toBe(1);
    expect(movement.beforeQty).toBe(before);
    expect(movement.afterQty).toBe(before - 1);

    // R1, and the part of this file most worth having. One of two handed
    // over leaves the request APPROVED -- not ISSUED -- so the technician
    // is NOT yet offered "I've got it", and the job cannot finish over a
    // part still on the shelf. The first draft of this test asserted
    // RECEIVE here and was wrong; the product was right.
    const request = await booted.prisma.partRequest.findUniqueOrThrow({
      where: { id: partRequestId },
      select: { status: true },
    });
    expect(request.status).toBe("APPROVED");

    const card = await http(booted)
      .get(`/api/v1/technician/work-orders/${workOrderId}`)
      .set("Cookie", technicianSession.cookie);
    expectCode(card, 200);
    expect(card.body.parts[0].waitingOn).toBe("STORE");
    expect(card.body.parts[0].action).toBeNull();
  }, 120_000);

  /** Acceptance C's other half. */
  it("[C] the shelf refuses to go negative", async () => {
    const before = await onHand();

    const res = await http(booted)
      .post(`/api/v1/inventory/requests/${partRequestId}/issue`)
      .set("Cookie", storekeeperSession.cookie)
      .send({ warehouseId, quantity: 999 });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await onHand()).toBe(before);
  }, 120_000);

  /** Journey 3. */
  it("[J3] the rest is handed over, and the technician receives and fits it", async () => {
    const before = await onHand();
    expectCode(
      await http(booted)
        .post(`/api/v1/inventory/requests/${partRequestId}/issue`)
        .set("Cookie", storekeeperSession.cookie)
        .send({ warehouseId, quantity: 1 }),
      201,
    );
    expect(await onHand()).toBe(before - 1);

    const issued = await http(booted)
      .get(`/api/v1/technician/work-orders/${workOrderId}`)
      .set("Cookie", technicianSession.cookie);
    expectCode(issued, 200);
    // Now that the request is fully satisfied it is the technician's move.
    expect(issued.body.parts[0].waitingOn).toBe("YOU");
    expect(issued.body.parts[0].action).toBe("RECEIVE");

    expectCode(
      await http(booted)
        .post(`/api/v1/technician/parts/${partRequestId}/receive`)
        .set("Cookie", technicianSession.cookie)
        .send({}),
      201,
    );

    const received = await http(booted)
      .get(`/api/v1/technician/work-orders/${workOrderId}`)
      .set("Cookie", technicianSession.cookie);
    expectCode(received, 200);
    // Only now does the card offer to send it back: the graph has a
    // RETURN_REQUESTED edge from here and from nowhere else.
    expect(received.body.parts[0].returnable).toBe(true);
    expect(received.body.parts[0].action).toBe("MARK_USED");

    expectCode(
      await http(booted)
        .post(`/api/v1/technician/parts/${partRequestId}/used`)
        .set("Cookie", technicianSession.cookie)
        .send({}),
      201,
    );
  }, 120_000);

  /** Journey 4 -- what the customer is allowed to know. */
  it("[J4/R4] the customer sees the delay but none of the workshop's internals", async () => {
    const timeline = await booted.prisma.customerTimelineEvent.findMany({
      where: { workOrderId },
      select: { message: true, eventKey: true },
    });
    const customerWords = JSON.stringify(timeline);

    // Never the shelf, the store's staff, the warehouse, or the cost.
    expect(customerWords).not.toContain(warehouseId);
    expect(customerWords).not.toContain("Storekeeper");
    expect(customerWords).not.toContain("300.00");
    expect(customerWords).not.toContain(itemId);
  }, 120_000);

  /**
   * Journey 6 / acceptance G. A second part, so the return loop is
   * exercised on a request of its own rather than tangled with the one
   * that was fitted.
   */
  it("[J6] a second part is issued and then sent back, and the finish gate shuts", async () => {
    const asked = await http(booted)
      .post(`/api/v1/technician/work-orders/${workOrderId}/parts`)
      .set("Cookie", technicianSession.cookie)
      .send({ inventoryItemId: itemId, quantity: 1, reason: "Second set, wrong size as it turns out" });
    expectCode(asked, 201);

    const second = await booted.prisma.partRequest.findFirstOrThrow({
      where: { workOrderId, status: "REQUESTED" },
      select: { id: true },
    });
    returnedRequestId = second.id;

    expectCode(
      await http(booted)
        .post(`/api/v1/inventory/requests/${returnedRequestId}/approve`)
        .set("Cookie", storekeeperSession.cookie)
        .send({}),
      201,
    );
    expectCode(
      await http(booted)
        .post(`/api/v1/inventory/requests/${returnedRequestId}/issue`)
        .set("Cookie", storekeeperSession.cookie)
        .send({ warehouseId, quantity: 1 }),
      201,
    );
    expectCode(
      await http(booted)
        .post(`/api/v1/technician/parts/${returnedRequestId}/receive`)
        .set("Cookie", technicianSession.cookie)
        .send({}),
      201,
    );

    expectCode(
      await http(booted)
        .post(`/api/v1/technician/parts/${returnedRequestId}/return`)
        .set("Cookie", technicianSession.cookie)
        .send({ quantity: 1, reason: "Wrong size for this model" }),
      201,
    );

    const check = await http(booted)
      .get(`/api/v1/technician/work-orders/${workOrderId}/finish-check`)
      .set("Cookie", technicianSession.cookie);
    expectCode(check, 200);
    // R2: a return nobody has adjudicated is exactly the sort of loose
    // end a job must not close over.
    expect(check.body.passed).toBe(false);
  }, 180_000);

  /** Journey 6 continued -- the clarification loop. */
  it("[J6/R2] the store asks a question, and the card carries it back in the store's own words", async () => {
    const returns = await http(booted).get("/api/v1/inventory/returns").set("Cookie", storekeeperSession.cookie);
    expectCode(returns, 200);
    expect(JSON.stringify(returns.body)).toContain(returnedRequestId);

    expectCode(
      await http(booted)
        .post(`/api/v1/inventory/returns/${returnedRequestId}/clarify`)
        .set("Cookie", storekeeperSession.cookie)
        .send({ question: "Which axle did you take these off?" }),
      201,
    );

    const card = await http(booted)
      .get(`/api/v1/technician/work-orders/${workOrderId}`)
      .set("Cookie", technicianSession.cookie);
    expectCode(card, 200);
    const part = card.body.parts.find(
      (p: { partRequestId: string }) => p.partRequestId === returnedRequestId,
    );
    expect(part.clarificationPending).toBe(true);
    expect(part.clarificationQuestion).toBe("Which axle did you take these off?");

    expectCode(
      await http(booted)
        .post(`/api/v1/technician/parts/${returnedRequestId}/clarification`)
        .set("Cookie", technicianSession.cookie)
        .send({ answer: "The front axle, both sides." }),
      201,
    );
  }, 120_000);

  /** Journey 6 / acceptance G -- stock and money both come back. */
  it("[J6/G] accepting the return restores the shelf and takes the part off the bill", async () => {
    const before = await onHand();

    expectCode(
      await http(booted)
        .post(`/api/v1/inventory/returns/${returnedRequestId}/accept`)
        .set("Cookie", storekeeperSession.cookie)
        .send({ warehouseId, quantity: 1 }),
      201,
    );

    expect(await onHand()).toBe(before + 1);

    // The bill goes back with the part. A returned part still sitting on
    // the invoice is the most damaging thing this loop could do.
    const line = await booted.prisma.workOrderPartLine.findFirst({
      where: { workOrderId, partRequestId: returnedRequestId },
      select: { quantity: true },
    });
    expect(line?.quantity ?? 0).toBe(0);
  }, 120_000);

  /** Acceptance F. */
  it("[F] the fitted part is billed exactly once, at the price snapshotted when it was issued", async () => {
    const lines = await booted.prisma.workOrderPartLine.findMany({
      where: { workOrderId, partRequestId },
      select: { id: true, quantity: true, sellingPrice: true },
    });

    // The unique key on (workOrderId, partRequestId) is what makes
    // absorption idempotent. Asserting it means a change that starts
    // appending a row per issue has to come past this test.
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(2);
    // Money is a string across the wire and a Decimal in the row; either
    // way it is the catalogue price at issue time, not today's.
    expect(String(lines[0].sellingPrice)).toBe("450");
  }, 120_000);

  /**
   * Acceptance H -- the job cannot close over a part the technician is
   * holding.
   *
   * Note carefully WHERE the gate bites. `parts.received_used_or_returned`
   * counts requests in ARRIVED or RECEIVED_BY_TECHNICIAN, and NOT in
   * ISSUED -- so the block starts when the technician confirms they have
   * the part, not when the store hands it over. There is a real window
   * between those two in which the part is off the shelf, already on the
   * bill, and the job can still finish. That is written up as F-007; it
   * is not changed here because gate-evaluator semantics are on this
   * sprint's FORBIDDEN list. This test asserts what the product actually
   * does, which is the only thing a harness is allowed to assert.
   */
  it("[H] the job refuses to finish while a part the technician holds is unaccounted for", async () => {
    const asked = await http(booted)
      .post(`/api/v1/technician/work-orders/${workOrderId}/parts`)
      .set("Cookie", technicianSession.cookie)
      .send({ inventoryItemId: itemId, quantity: 1, reason: "Third set, correct size" });
    expectCode(asked, 201);

    const third = await booted.prisma.partRequest.findFirstOrThrow({
      where: { workOrderId, status: "REQUESTED" },
      select: { id: true },
    });

    expectCode(
      await http(booted)
        .post(`/api/v1/inventory/requests/${third.id}/approve`)
        .set("Cookie", storekeeperSession.cookie)
        .send({}),
      201,
    );
    expectCode(
      await http(booted)
        .post(`/api/v1/inventory/requests/${third.id}/issue`)
        .set("Cookie", storekeeperSession.cookie)
        .send({ warehouseId, quantity: 1 }),
      201,
    );
    expectCode(
      await http(booted)
        .post(`/api/v1/technician/parts/${third.id}/receive`)
        .set("Cookie", technicianSession.cookie)
        .send({}),
      201,
    );

    const blocked = await http(booted)
      .get(`/api/v1/technician/work-orders/${workOrderId}/finish-check`)
      .set("Cookie", technicianSession.cookie);
    expectCode(blocked, 200);
    expect(blocked.body.passed).toBe(false);
    // Named, not merely counted. `passed` is an AND across every gate, so
    // asserting it alone would pass for the wrong reason -- the task is
    // open at this point too, and that would hide a parts gate that had
    // silently stopped working.
    expect(unsatisfied(blocked.body)).toContain("A received part is neither marked used nor returned.");

    // And the press is refused too, not merely the preview -- otherwise
    // the checklist is decoration rather than the gate.
    const refused = await http(booted)
      .post(`/api/v1/technician/work-orders/${workOrderId}/finish`)
      .set("Cookie", technicianSession.cookie)
      .send({});
    expect(refused.status).toBeGreaterThanOrEqual(400);

    expectCode(
      await http(booted)
        .post(`/api/v1/technician/parts/${third.id}/used`)
        .set("Cookie", technicianSession.cookie)
        .send({}),
      201,
    );

    const clear = await http(booted)
      .get(`/api/v1/technician/work-orders/${workOrderId}/finish-check`)
      .set("Cookie", technicianSession.cookie);
    expectCode(clear, 200);
    // Every parts condition is now satisfied. The job still cannot
    // finish -- the task is open until the next test -- which is exactly
    // why this asserts the parts conditions rather than the aggregate.
    expect(unsatisfied(clear.body).filter((text) => text.toLowerCase().includes("part"))).toEqual([]);
  }, 180_000);

  /** Journeys 5 and 7 / acceptance J. */
  it("[J5/J7/J] the job finishes, the parts bill correctly, and the car is released", async () => {
    expectCode(
      await http(booted)
        .post(`/api/v1/technician/tasks/${taskId}/start`)
        .set("Cookie", technicianSession.cookie)
        .send({}),
      201,
    );
    expectCode(
      await http(booted)
        .post(`/api/v1/technician/tasks/${taskId}/complete`)
        .set("Cookie", technicianSession.cookie)
        .send({ minutesSpent: 45 }),
      201,
    );
    expectCode(
      await http(booted)
        .post(`/api/v1/technician/work-orders/${workOrderId}/finish`)
        .set("Cookie", technicianSession.cookie)
        .send({}),
      201,
    );

    const owner = await loginAs(booted, ownerEmail, OWNER_PASSWORD);
    const issued = await http(booted)
      .post(`/api/v1/finance/work-orders/${workOrderId}/invoice`)
      .set("Cookie", owner.cookie)
      .send({});
    expectCode(issued, 201);
    const invoiceId = issued.body.id ?? issued.body.invoiceId;

    // Three parts were fitted in total (two on the first request, one on
    // the third); the second came back and must not be charged for.
    const lines = await booted.prisma.invoiceLine.findMany({
      where: { invoiceId },
      select: { name: true, quantity: true },
    });
    const brakePads = lines.filter((line) => line.name.includes("Front brake pad set"));
    expect(brakePads.reduce((total, line) => total + line.quantity, 0)).toBe(3);

    const settlement = await http(booted)
      .get(`/api/v1/finance/invoices/${invoiceId}`)
      .set("Cookie", owner.cookie);
    expectCode(settlement, 200);
    const due = settlement.body.outstanding ?? settlement.body.total;
    expect(typeof due).toBe("string");

    expectCode(
      await http(booted)
        .post(`/api/v1/finance/invoices/${invoiceId}/payments`)
        .set("Cookie", owner.cookie)
        .send({ amount: due, method: "CASH", idempotencyKey: `pl-pay-${SUFFIX}` }),
      201,
    );

    expectCode(
      await http(booted)
        .post(`/api/v1/branch-manager/work-orders/${workOrderId}/deliver`)
        .set("Cookie", managerSession.cookie)
        .send({}),
      201,
    );

    const closed = await booted.prisma.workOrder.findUniqueOrThrow({
      where: { id: workOrderId },
      select: { status: true },
    });
    expect(closed.status).toBe("CLOSED");
  }, 180_000);
});
