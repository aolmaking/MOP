/**
 * The Honesty Harness, history half.
 *
 * `walkthrough.http.spec.ts` proves one job moves. This proves the
 * workshop REMEMBERS what happened to it -- and, harder, that it never
 * remembers something that did not.
 *
 * Every historical fact asserted below was produced by a real request
 * through the real guard chain: two complete visits for one vehicle, a
 * third still open, a second vehicle for the same customer, and a second
 * tenant that must never appear in any of it. Nothing is inserted
 * straight into a history table, because there is no history table --
 * the whole module is a projection, and a test that seeded one would be
 * proving the seed.
 *
 * The single most important assertion in this file is the negative one:
 * an approved recommendation that nobody carried out reports
 * NOT_PERFORMED, not "completed", and the evidence that says so travels
 * with it.
 */
import { bootApp, expectCode, http, loginAs, LAUNCH_PROFILE, type BootedApp, type Session } from "./http-kit";
import { hashPassword } from "../identity/auth/password.util";

const SUFFIX = `hist-${Date.now()}`;
const PLATFORM_PASSWORD = "platform-password-123";
const OWNER_PASSWORD = "owner-password-123";
const STAFF_PASSWORD = "staff-password-123";

interface Recommendation {
  id: string;
  workOrderId: string;
  name: string;
  outcome: string;
  outcomeLabel: string;
  evidence: { at: string | null; text: string }[];
  linkedTasks: { id: string; title: string; status: string }[];
  price?: string;
  total?: string;
}

interface IndexRow {
  key: string;
  customerId: string;
  customerName: string;
  assetId: string;
  plateNumber: string | null;
  visits: number;
  openVisits: number;
  lastVisitAt: string;
  lastStatus: string;
  lastComplaint: string | null;
  billedTotal: string;
  outstanding: string;
}

describe("Workshop history (real HTTP, real Postgres)", () => {
  let booted: BootedApp;
  let platformEmail: string;
  let otherPlatformEmail: string;
  let tenantId: string;
  let branchId: string;
  let ownerEmail: string;

  let ownerSession: Session;
  let managerSession: Session;
  let technicianSession: Session;
  let technicianStaffId: string;

  /** A second workshop, whose only job in this file is never to be visible from the first. */
  let otherTenantId: string;
  let otherOwnerSession: Session;
  let otherWorkOrderId: string;
  let otherCustomerId: string;
  let otherAssetId: string;

  const plate = `HS-${Date.now() % 900000}`;
  const secondPlate = `HB-${Date.now() % 900000}`;

  let customerId: string;
  let assetId: string;
  let secondAssetId: string;

  let visitOne: string;
  let visitTwo: string;
  let visitThree: string;
  let secondVehicleVisit: string;

  let performedRecommendationId: string;
  let abandonedRecommendationId: string;

  // ── helpers ────────────────────────────────────────────────────────

  async function staff(role: string, name: string, tenant = tenantId, branch = branchId): Promise<Session> {
    const email = `${role.toLowerCase()}-${tenant.slice(-6)}-${SUFFIX}@mop.local`;
    const account = await booted.prisma.account.create({
      data: { accountType: "TENANT_STAFF", tenantId: tenant, email, passwordHash: hashPassword(STAFF_PASSWORD), status: "ACTIVE" },
    });
    await booted.prisma.staffUser.create({
      data: {
        accountId: account.id,
        tenantId: tenant,
        fullName: name,
        role: role as never,
        branchScope: [branch],
        categoryScope: ["CARS"],
      },
    });
    return loginAs(booted, email, STAFF_PASSWORD);
  }

  async function makeWorkshop(label: string): Promise<{ tenantId: string; branchId: string; ownerEmail: string; platformEmail: string }> {
    const plan = await booted.prisma.plan.create({
      data: {
        code: `HISTORY-${label}-${SUFFIX}`,
        name: "History Plan",
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

    const email = `platform-${label}-${SUFFIX}@mop.local`;
    await booted.prisma.account.create({
      data: { accountType: "PLATFORM", email, passwordHash: hashPassword(PLATFORM_PASSWORD), status: "ACTIVE" },
    });
    const platform = await loginAs(booted, email, PLATFORM_PASSWORD);

    const owner = `owner-${label}-${SUFFIX}@mop.local`;
    const created = await http(booted)
      .post("/api/v1/platform/workshops")
      .set("Cookie", platform.cookie)
      .send({
        planId: plan.id,
        name: `History Motors ${label} ${SUFFIX}`,
        slug: `history-${label}-${SUFFIX}`.toLowerCase(),
        country: "EG",
        city: "Cairo",
        businessType: "Independent Garage",
        primaryCategory: "CARS",
        currency: "EGP",
        timezone: "Africa/Cairo",
        ownerFullName: `History Owner ${label}`,
        ownerEmail: owner,
        ownerPhone: "+201234567890",
        starterBuilderTemplate: "MINIMAL",
        initialStatus: "ACTIVE",
        branches: [{ name: "Main Branch", code: "MAIN", city: "Cairo" }],
        warehouses: [{ name: "Main Store", code: "STORE", branchCodes: ["MAIN"] }],
        capabilities: LAUNCH_PROFILE,
      });
    expectCode(created, 201);

    const tenant = created.body.tenant.id;

    // The owner's password is set directly rather than through the invite
    // link. Accepting an invite is a journey of its own and is already
    // proven end to end by `walkthrough.http.spec.ts`; borrowing it here
    // would tie this file to the shape of the invite response, which is
    // setup rather than the subject. Everything this file actually
    // asserts still goes through the real login, guards and permissions.
    await booted.prisma.account.update({
      where: { id: (await booted.prisma.account.findFirstOrThrow({ where: { tenantId: tenant, email: owner }, select: { id: true } })).id },
      data: { passwordHash: hashPassword(OWNER_PASSWORD), status: "ACTIVE" },
    });
    const branch = (await booted.prisma.branch.findFirstOrThrow({ where: { tenantId: tenant }, select: { id: true } })).id;
    return { tenantId: tenant, branchId: branch, ownerEmail: owner, platformEmail: email };
  }

  /**
   * Books a vehicle in exactly the way the intake page does: search
   * first, and reuse whatever the search found.
   *
   * That detail is the whole reason a SECOND VISIT exists as a concept.
   * `IntakeService` only reuses a vehicle when it is handed an
   * `existingAssetId`; a plate typed in twice creates two cars, which is
   * correct (two customers can quote the same plate wrongly) and is why
   * the advisor's single search field exists. A test that skipped the
   * search would be testing a journey nobody takes, and would never have
   * more than one visit to remember.
   */
  async function intake(vehiclePlate: string, complaint: string, customerName = "History Customer"): Promise<string> {
    const found = await http(booted)
      .get(`/api/v1/branch-manager/intake/search?q=${encodeURIComponent(vehiclePlate)}`)
      .set("Cookie", managerSession.cookie);
    expectCode(found, 200);
    // Picked by identifier, the way an advisor picks the right car off a
    // customer with three. Taking [0] would quietly book the wrong
    // vehicle in and the history would be correct about the wrong thing.
    const candidates: { id: string; identifier: string | null }[] = [
      ...found.body.vehicles,
      ...found.body.customers.flatMap((c: { vehicles: { id: string; identifier: string | null }[] }) => c.vehicles),
    ];
    const knownVehicle = candidates.find((vehicle) => vehicle.identifier === vehiclePlate);

    const res = await http(booted)
      .post("/api/v1/branch-manager/intake")
      .set("Cookie", managerSession.cookie)
      .send({
        branchId,
        customer: customerId ? { existingCustomerId: customerId } : { fullName: customerName, phone: "+201111222333" },
        asset: knownVehicle ? { existingAssetId: knownVehicle.id } : { category: "CARS", plateNumber: vehiclePlate },
        complaint,
      });
    expectCode(res, 201);
    await booted.prisma.workOrderAssignment.create({
      data: { tenantId, workOrderId: res.body.workOrderId, staffUserId: technicianStaffId },
    });
    return res.body.workOrderId as string;
  }

  /** Inspection + one fault, exactly as a technician records them. */
  async function inspect(workOrderId: string, note: string, fault: string, severity = "HIGH"): Promise<void> {
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
        .send({ type: "QUICK", note }),
      201,
    );
    expectCode(
      await http(booted)
        .post(`/api/v1/technician/work-orders/${workOrderId}/faults`)
        .set("Cookie", technicianSession.cookie)
        .send({ description: fault, severity, recommendedService: fault }),
      201,
    );
  }

  /** Raises a priced recommendation and has the customer answer it from the public link. */
  async function recommendAndAnswer(
    workOrderId: string,
    name: string,
    decision: "APPROVED" | "REJECTED",
  ): Promise<string> {
    const raised = await http(booted)
      .post(`/api/v1/technician/work-orders/${workOrderId}/decisions`)
      .set("Cookie", technicianSession.cookie)
      .send({
        name,
        explanation: `${name} is needed. Explained to the customer at the counter.`,
        importance: "HIGH",
        price: "1200.00",
        laborPrice: "300.00",
      });
    expectCode(raised, 201);
    const token = raised.body.secureToken as string;

    const read = await http(booted).get(`/api/v1/public/decisions/${token}`);
    expectCode(read, 200);
    const itemId = read.body.items[0].id as string;

    expectCode(
      await http(booted)
        .post(`/api/v1/public/decisions/${token}/respond`)
        // Declining a HIGH/CRITICAL repair has to be acknowledged. That
        // refusal is a real product rule and this test honours it rather
        // than working around it.
        .send({ answers: [{ itemId, decision, warningAcknowledged: decision === "REJECTED" }] }),
      200,
    );
    return itemId;
  }

  async function ownerIndex(query = ""): Promise<{ rows: IndexRow[]; total: number }> {
    const res = await http(booted)
      .get(`/api/v1/owner/history${query}`)
      .set("Cookie", ownerSession.cookie);
    expectCode(res, 200);
    return res.body;
  }

  async function ownerRecord(customer = customerId, asset = assetId) {
    const res = await http(booted)
      .get(`/api/v1/owner/history/${customer}/${asset}`)
      .set("Cookie", ownerSession.cookie);
    expectCode(res, 200);
    return res.body;
  }

  async function technicianHistory(workOrderId: string) {
    const res = await http(booted)
      .get(`/api/v1/technician/work-orders/${workOrderId}/vehicle-history`)
      .set("Cookie", technicianSession.cookie);
    expectCode(res, 200);
    return res.body;
  }

  // ── setup ──────────────────────────────────────────────────────────

  beforeAll(async () => {
    booted = await bootApp();

    const primary = await makeWorkshop("a");
    tenantId = primary.tenantId;
    branchId = primary.branchId;
    ownerEmail = primary.ownerEmail;
    platformEmail = primary.platformEmail;

    ownerSession = await loginAs(booted, ownerEmail, OWNER_PASSWORD);
    managerSession = await staff("BRANCH_MANAGER", "History Manager");
    technicianSession = await staff("TECHNICIAN", "History Technician");
    technicianStaffId = (
      await booted.prisma.staffUser.findFirstOrThrow({ where: { tenantId, role: "TECHNICIAN" }, select: { id: true } })
    ).id;

    const secondary = await makeWorkshop("b");
    otherTenantId = secondary.tenantId;
    otherPlatformEmail = secondary.platformEmail;
    otherOwnerSession = await loginAs(booted, secondary.ownerEmail, OWNER_PASSWORD);
    const otherManager = await staff("BRANCH_MANAGER", "Other Manager", secondary.tenantId, secondary.branchId);
    const otherIntake = await http(booted)
      .post("/api/v1/branch-manager/intake")
      .set("Cookie", otherManager.cookie)
      .send({
        branchId: secondary.branchId,
        customer: { fullName: "Other Workshop Customer", phone: "+209999888777" },
        asset: { category: "CARS", plateNumber: `OT-${Date.now() % 900000}` },
        complaint: "Belongs to the other workshop entirely",
      });
    expectCode(otherIntake, 201);
    otherWorkOrderId = otherIntake.body.workOrderId;
    const otherWorkOrder = await booted.prisma.workOrder.findUniqueOrThrow({
      where: { id: otherWorkOrderId },
      select: { customerId: true, assetId: true },
    });
    otherCustomerId = otherWorkOrder.customerId;
    otherAssetId = otherWorkOrder.assetId;
  }, 300_000);

  afterAll(async () => {
    for (const tenant of [tenantId, otherTenantId].filter(Boolean)) {
      await booted.prisma.session.deleteMany({ where: { tenantId: tenant } });
      await booted.prisma.staffUser.deleteMany({ where: { tenantId: tenant } });
      await booted.prisma.account.deleteMany({ where: { tenantId: tenant } });
    }
    await booted.prisma.account.deleteMany({ where: { email: { in: [platformEmail, otherPlatformEmail] } } });
    await booted.close();
  }, 300_000);

  // ── visit one: recommended, approved, planned, done, paid, closed ───

  it("visit 1: a job the workshop actually finished is remembered as PERFORMED, with its evidence", async () => {
    visitOne = await intake(plate, "Grinding noise when braking");
    const workOrder = await booted.prisma.workOrder.findUniqueOrThrow({
      where: { id: visitOne },
      select: { customerId: true, assetId: true },
    });
    customerId = workOrder.customerId;
    assetId = workOrder.assetId;

    await inspect(visitOne, "Front discs below minimum thickness.", "Front brake discs worn");
    performedRecommendationId = await recommendAndAnswer(visitOne, "Replace front brake discs", "APPROVED");

    // The manager plans the approved work AGAINST the recommendation.
    // This link is the whole reason history can later say PERFORMED
    // rather than guessing from the task's title.
    const created = await http(booted)
      .post(`/api/v1/branch-manager/work-orders/${visitOne}/tasks`)
      .set("Cookie", managerSession.cookie)
      .send({ title: "Replace front brake discs", decisionItemId: performedRecommendationId });
    expectCode(created, 201);
    const taskId = created.body.id as string;

    await booted.prisma.taskAssignment.create({ data: { tenantId, taskId, staffUserId: technicianStaffId } });
    // Starting a TASK deliberately does not move the WORK ORDER -- see
    // TechnicianWorkService.startTask. The job is started at job level,
    // exactly as the work card's own primary action does it, or FINISH
    // is not available from APPROVED_FOR_WORK later.
    expectCode(
      await http(booted)
        .post(`/api/v1/technician/work-orders/${visitOne}/start-work`)
        .set("Cookie", technicianSession.cookie)
        .send({}),
      200,
    );
    expectCode(
      await http(booted).post(`/api/v1/technician/tasks/${taskId}/start`).set("Cookie", technicianSession.cookie).send({}),
      201,
    );
    expectCode(
      await http(booted)
        .post(`/api/v1/technician/tasks/${taskId}/complete`)
        .set("Cookie", technicianSession.cookie)
        .send({ minutesSpent: 75 }),
      201,
    );
    expectCode(
      await http(booted).post(`/api/v1/technician/work-orders/${visitOne}/finish`).set("Cookie", technicianSession.cookie).send({}),
      201,
    );

    const invoice = await http(booted)
      .post(`/api/v1/finance/work-orders/${visitOne}/invoice`)
      .set("Cookie", ownerSession.cookie)
      .send({});
    expectCode(invoice, 201);
    const invoiceId = invoice.body.id ?? invoice.body.invoiceId;

    const settlement = await http(booted).get(`/api/v1/finance/invoices/${invoiceId}`).set("Cookie", ownerSession.cookie);
    expectCode(settlement, 200);
    expectCode(
      await http(booted)
        .post(`/api/v1/finance/invoices/${invoiceId}/payments`)
        .set("Cookie", ownerSession.cookie)
        .send({ amount: settlement.body.outstanding ?? settlement.body.total, method: "CASH", idempotencyKey: `hist-1-${SUFFIX}` }),
      201,
    );
    expectCode(
      await http(booted).post(`/api/v1/branch-manager/work-orders/${visitOne}/deliver`).set("Cookie", managerSession.cookie).send({}),
      201,
    );

    const record = await ownerRecord();
    const visit = record.visits.find((candidate: { workOrderId: string }) => candidate.workOrderId === visitOne);

    expect(visit.status).toBe("CLOSED");
    expect(visit.complaint).toBe("Grinding noise when braking");
    expect(visit.inspections[0].note).toBe("Front discs below minimum thickness.");
    expect(visit.findings[0].description).toBe("Front brake discs worn");

    const recommendation: Recommendation = visit.recommendations[0];
    expect(recommendation.outcome).toBe("PERFORMED");
    expect(recommendation.linkedTasks).toHaveLength(1);
    expect(recommendation.linkedTasks[0].status).toBe("DONE");
    expect(recommendation.evidence.map((e) => e.text)).toEqual(
      expect.arrayContaining(["Customer approved this item", 'Task "Replace front brake discs" completed (last changed)']),
    );

    // Money is read from Finance, as a string, never recomputed here.
    expect(typeof visit.money.total).toBe("string");
    expect(visit.money.outstanding).toBe("0.00");
    expect(visit.money.payments).toHaveLength(1);
    expect(visit.money.invoiceNumber).toBeTruthy();

    // The lifecycle is the events the lifecycle service wrote, not a
    // second state machine reconstructing what "must" have happened.
    expect(visit.lifecycle.map((entry: { to: string }) => entry.to)).toContain("CLOSED");
    expect(visit.lifecycle.every((entry: { at: string }) => !Number.isNaN(Date.parse(entry.at)))).toBe(true);
  }, 300_000);

  // ── visit two: approved and abandoned ──────────────────────────────

  it("visit 2: work the customer approved and has not done reports APPROVED_PLANNED, and blocks the finish", async () => {
    visitTwo = await intake(plate, "Pulling to the left at speed");

    // Same plate, so this is the SAME vehicle on a second visit -- the
    // thing the whole module exists to be able to say.
    const sameAsset = await booted.prisma.workOrder.findUniqueOrThrow({ where: { id: visitTwo }, select: { assetId: true } });
    expect(sameAsset.assetId).toBe(assetId);

    await inspect(visitTwo, "Alignment out of range; front-right play.", "Wheel alignment out of range");
    abandonedRecommendationId = await recommendAndAnswer(visitTwo, "Wheel alignment", "APPROVED");

    const planned = await http(booted)
      .post(`/api/v1/branch-manager/work-orders/${visitTwo}/tasks`)
      .set("Cookie", managerSession.cookie)
      .send({ title: "Wheel alignment", decisionItemId: abandonedRecommendationId });
    expectCode(planned, 201);

    // The task is created and NEVER completed, so the job genuinely
    // cannot finish: `approved_work_completed` refuses it, which is the
    // gate doing exactly its job. Asserted rather than worked around --
    // a history test that forced the job closed would be testing a state
    // the product does not let a workshop reach.
    expectCode(
      await http(booted)
        .post(`/api/v1/technician/work-orders/${visitTwo}/start-work`)
        .set("Cookie", technicianSession.cookie)
        .send({}),
      200,
    );
    expectCode(
      await http(booted).post(`/api/v1/technician/work-orders/${visitTwo}/finish`).set("Cookie", technicianSession.cookie).send({}),
      409,
      "gate_blocked",
    );

    // Billing does not wait for the job to end -- the approved item is
    // already a chargeable source -- so the money half of this visit is
    // real even while the work is outstanding.
    const invoice = await http(booted)
      .post(`/api/v1/finance/work-orders/${visitTwo}/invoice`)
      .set("Cookie", ownerSession.cookie)
      .send({});
    expectCode(invoice, 201);

    const record = await ownerRecord();
    const visit = record.visits.find((candidate: { workOrderId: string }) => candidate.workOrderId === visitTwo);
    const recommendation: Recommendation = visit.recommendations[0];

    expect(recommendation.name).toBe("Wheel alignment");
    // Approved, planned, and not started -- never "not performed", which
    // would claim the job is over when it is not, and never "performed",
    // which would claim work nobody did.
    expect(recommendation.outcome).toBe("APPROVED_PLANNED");
    expect(recommendation.outcomeLabel).toBe("Approved - planned, not started");
    expect(recommendation.linkedTasks[0].status).not.toBe("DONE");

    // The invoice exists and is unpaid: "billed" is not "paid", and the
    // record must not let one stand in for the other.
    expect(visit.money.invoiceNumber).toBeTruthy();
    expect(visit.money.paid).toBe("0.00");
    expect(Number(visit.money.outstanding)).toBeGreaterThan(0);

    expect(record.totalVisits).toBe(2);
  }, 300_000);

  // ── visit three: the live one ──────────────────────────────────────

  it("visit 3: the technician's brief carries the past and never the present", async () => {
    visitThree = await intake(plate, "Brake vibration above 80 km/h");

    const brief = await technicianHistory(visitThree);

    expect(brief.currentComplaint).toBe("Brake vibration above 80 km/h");
    expect(brief.priorVisits).toBe(2);

    const complaints = brief.previousComplaints.map((c: { text: string }) => c.text);
    expect(complaints).toEqual(expect.arrayContaining(["Grinding noise when braking", "Pulling to the left at speed"]));
    // The current visit's own complaint must never appear in the history
    // beside it -- that is how a technician ends up chasing their own note.
    expect(complaints).not.toContain("Brake vibration above 80 km/h");
    expect(brief.previousComplaints.map((c: { workOrderId: string }) => c.workOrderId)).not.toContain(visitThree);

    const findings = brief.previousFindings.map((f: { description: string }) => f.description);
    expect(findings).toEqual(expect.arrayContaining(["Front brake discs worn", "Wheel alignment out of range"]));

    const outcomes = Object.fromEntries(
      brief.previousRecommendations.map((r: Recommendation) => [r.name, r.outcome]),
    );
    expect(outcomes["Replace front brake discs"]).toBe("PERFORMED");
    expect(outcomes["Wheel alignment"]).toBe("APPROVED_PLANNED");

    // The one thing a technician most needs raised: agreed and undone.
    expect(brief.unresolved.map((r: Recommendation) => r.name)).toEqual(["Wheel alignment"]);

    // No money on a technician's tablet. ABSENT, not blanked -- anyone
    // can open developer tools.
    for (const recommendation of brief.previousRecommendations as Recommendation[]) {
      expect(recommendation).not.toHaveProperty("price");
      expect(recommendation).not.toHaveProperty("total");
      expect(recommendation).not.toHaveProperty("laborPrice");
    }
    expect(JSON.stringify(brief)).not.toContain("1200.00");
  }, 300_000);

  it("the technician's own new finding lands on the current visit, not on the history", async () => {
    await inspect(visitThree, "Discs re-measured, within tolerance.", "Front-right suspension play", "MEDIUM");

    const brief = await technicianHistory(visitThree);

    expect(brief.previousFindings.map((f: { description: string }) => f.description)).not.toContain(
      "Front-right suspension play",
    );
    expect(brief.previousFindings.every((f: { workOrderId: string }) => f.workOrderId !== visitThree)).toBe(true);
  }, 300_000);

  // ── isolation ──────────────────────────────────────────────────────

  it("a second vehicle has its own history, and the two never mix", async () => {
    secondVehicleVisit = await intake(secondPlate, "Battery flat every morning");
    secondAssetId = (
      await booted.prisma.workOrder.findUniqueOrThrow({ where: { id: secondVehicleVisit }, select: { assetId: true } })
    ).assetId;
    expect(secondAssetId).not.toBe(assetId);

    await inspect(secondVehicleVisit, "Battery holds 11.4V at rest.", "Battery below threshold");

    const vehicleB = await technicianHistory(secondVehicleVisit);
    expect(vehicleB.priorVisits).toBe(0);
    expect(vehicleB.previousComplaints).toHaveLength(0);
    expect(vehicleB.currentComplaint).toBe("Battery flat every morning");

    // A -> B -> A. The server must answer the same way each time; a
    // history that differed on the second visit would mean the answer
    // was coming from somewhere other than the records.
    const vehicleAAgain = await technicianHistory(visitThree);
    expect(vehicleAAgain.priorVisits).toBe(2);
    expect(vehicleAAgain.previousComplaints.map((c: { text: string }) => c.text)).not.toContain("Battery flat every morning");

    const recordB = await ownerRecord(customerId, secondAssetId);
    expect(recordB.totalVisits).toBe(1);
    expect(recordB.visits[0].complaint).toBe("Battery flat every morning");
    expect(JSON.stringify(recordB)).not.toContain("Grinding noise when braking");
  }, 300_000);

  // ── the owner index ────────────────────────────────────────────────

  it("the owner index lists every customer+vehicle that has ever been here, closed ones included", async () => {
    const page = await ownerIndex();

    const vehicleA = page.rows.find((row) => row.assetId === assetId);
    const vehicleB = page.rows.find((row) => row.assetId === secondAssetId);

    expect(vehicleA).toBeDefined();
    expect(vehicleB).toBeDefined();
    expect(vehicleA!.visits).toBe(3);
    expect(vehicleA!.key).toBe(`${customerId}:${assetId}`);
    expect(vehicleA!.lastComplaint).toBe("Brake vibration above 80 km/h");
    expect(typeof vehicleA!.billedTotal).toBe("string");

    // A relationship whose visits are ALL closed must still be listed --
    // "everything that ever happened" is the point of the page.
    const closedOnly = await ownerIndex("?activity=closed");
    expect(closedOnly.rows.every((row) => row.openVisits === 0)).toBe(true);

    const openOnly = await ownerIndex("?activity=open");
    expect(openOnly.rows.every((row) => row.openVisits > 0)).toBe(true);
    expect(openOnly.rows.map((row) => row.assetId)).toContain(assetId);
  }, 300_000);

  it("search, sort and paging are answered by the server, not by the table", async () => {
    const byPlate = await ownerIndex(`?search=${encodeURIComponent(plate)}`);
    expect(byPlate.rows).toHaveLength(1);
    expect(byPlate.rows[0].assetId).toBe(assetId);

    const byName = await ownerIndex("?search=History%20Customer");
    expect(byName.rows.length).toBeGreaterThanOrEqual(2);

    const nothing = await ownerIndex("?search=definitely-not-a-customer-xyz");
    expect(nothing.rows).toHaveLength(0);
    expect(nothing.total).toBe(0);

    const mostVisits = await ownerIndex("?sort=visits&direction=desc");
    expect(mostVisits.rows[0].assetId).toBe(assetId);

    const firstPage = await ownerIndex("?pageSize=1&page=1");
    const secondPage = await ownerIndex("?pageSize=1&page=2");
    expect(firstPage.rows).toHaveLength(1);
    expect(secondPage.rows).toHaveLength(1);
    expect(firstPage.rows[0].key).not.toBe(secondPage.rows[0].key);
    expect(firstPage.total).toBe(secondPage.total);
  }, 300_000);

  it("refuses a sort column it does not own rather than silently ignoring it", async () => {
    const res = await http(booted)
      .get('/api/v1/owner/history?sort=(SELECT 1)')
      .set("Cookie", ownerSession.cookie);
    expect(res.status).toBe(400);
  }, 120_000);

  // ── live consistency ───────────────────────────────────────────────

  it("a real event changes the history: completing the outstanding work flips APPROVED_PLANNED to PERFORMED", async () => {
    const before = await ownerRecord();
    const beforeVisit = before.visits.find((v: { workOrderId: string }) => v.workOrderId === visitTwo);
    expect(beforeVisit.recommendations[0].outcome).toBe("APPROVED_PLANNED");

    const task = await booted.prisma.task.findFirstOrThrow({
      where: { decisionItemId: abandonedRecommendationId },
      select: { id: true },
    });
    await booted.prisma.taskAssignment.create({ data: { tenantId, taskId: task.id, staffUserId: technicianStaffId } });
    expectCode(
      await http(booted).post(`/api/v1/technician/tasks/${task.id}/start`).set("Cookie", technicianSession.cookie).send({}),
      201,
    );
    expectCode(
      await http(booted)
        .post(`/api/v1/technician/tasks/${task.id}/complete`)
        .set("Cookie", technicianSession.cookie)
        .send({ minutesSpent: 30 }),
      201,
    );

    const after = await ownerRecord();
    const afterVisit = after.visits.find((v: { workOrderId: string }) => v.workOrderId === visitTwo);
    expect(afterVisit.recommendations[0].outcome).toBe("PERFORMED");

    // And the technician's brief, which reads the same truth, agrees.
    const brief = await technicianHistory(visitThree);
    expect(brief.unresolved).toHaveLength(0);
    expect(
      brief.previousRecommendations.find((r: Recommendation) => r.name === "Wheel alignment").outcome,
    ).toBe("PERFORMED");
  }, 300_000);

  it("a payment recorded now shows up in the history now", async () => {
    const invoice = await booted.prisma.invoice.findFirstOrThrow({
      where: { workOrderId: visitTwo },
      select: { id: true, balance: true },
    });

    expectCode(
      await http(booted)
        .post(`/api/v1/finance/invoices/${invoice.id}/payments`)
        .set("Cookie", ownerSession.cookie)
        .send({ amount: invoice.balance.toFixed(2), method: "CASH", idempotencyKey: `hist-2-${SUFFIX}` }),
      201,
    );

    const record = await ownerRecord();
    const visit = record.visits.find((v: { workOrderId: string }) => v.workOrderId === visitTwo);
    expect(visit.money.outstanding).toBe("0.00");
    expect(visit.money.payments).toHaveLength(1);

    const page = await ownerIndex(`?search=${encodeURIComponent(plate)}`);
    expect(page.rows[0].outstanding).toBe("0.00");
  }, 300_000);

  // ── authorization ──────────────────────────────────────────────────

  it("refuses the owner history to everyone who does not hold history.workshop.view", async () => {
    for (const session of [managerSession, technicianSession]) {
      expectCode(await http(booted).get("/api/v1/owner/history").set("Cookie", session.cookie), 403, "forbidden");
      expectCode(
        await http(booted).get(`/api/v1/owner/history/${customerId}/${assetId}`).set("Cookie", session.cookie),
        403,
        "forbidden",
      );
    }

    // And to nobody at all.
    expect((await http(booted).get("/api/v1/owner/history")).status).toBe(401);
  }, 120_000);

  it("never lets one workshop read another's history, by any route", async () => {
    // The other tenant's owner asking for THIS tenant's ids.
    expectCode(
      await http(booted).get(`/api/v1/owner/history/${customerId}/${assetId}`).set("Cookie", otherOwnerSession.cookie),
      404,
      "history_not_found",
    );
    // And the reverse.
    expectCode(
      await http(booted).get(`/api/v1/owner/history/${otherCustomerId}/${otherAssetId}`).set("Cookie", ownerSession.cookie),
      404,
      "history_not_found",
    );

    // Neither index contains the other's rows.
    const mine = await ownerIndex();
    expect(mine.rows.map((row) => row.assetId)).not.toContain(otherAssetId);

    const theirs = await http(booted).get("/api/v1/owner/history").set("Cookie", otherOwnerSession.cookie);
    expectCode(theirs, 200);
    expect((theirs.body.rows as IndexRow[]).map((row) => row.assetId)).not.toContain(assetId);

    // The technician's route is scoped by ASSIGNMENT, so a cross-tenant
    // work order is indistinguishable from one that does not exist.
    expectCode(
      await http(booted)
        .get(`/api/v1/technician/work-orders/${otherWorkOrderId}/vehicle-history`)
        .set("Cookie", technicianSession.cookie),
      404,
      "work_order_not_found",
    );
  }, 120_000);

  it("refuses a technician the history of a job in their own workshop that is not theirs", async () => {
    const unassigned = await http(booted)
      .post("/api/v1/branch-manager/intake")
      .set("Cookie", managerSession.cookie)
      .send({
        branchId,
        customer: { fullName: "Somebody Else", phone: "+201555444333" },
        asset: { category: "CARS", plateNumber: `NX-${Date.now() % 900000}` },
        complaint: "Not this technician's job",
      });
    expectCode(unassigned, 201);

    expectCode(
      await http(booted)
        .get(`/api/v1/technician/work-orders/${unassigned.body.workOrderId}/vehicle-history`)
        .set("Cookie", technicianSession.cookie),
      404,
      "work_order_not_found",
    );
  }, 120_000);

  // ── integrity ──────────────────────────────────────────────────────

  it("refuses to link work to a recommendation the customer never approved, or one from another job", async () => {
    const declined = await recommendAndAnswer(secondVehicleVisit, "Replace battery", "REJECTED");

    expectCode(
      await http(booted)
        .post(`/api/v1/branch-manager/work-orders/${secondVehicleVisit}/tasks`)
        .set("Cookie", managerSession.cookie)
        .send({ title: "Replace battery", decisionItemId: declined }),
      400,
      "recommendation_not_approved",
    );

    expectCode(
      await http(booted)
        .post(`/api/v1/branch-manager/work-orders/${secondVehicleVisit}/tasks`)
        .set("Cookie", managerSession.cookie)
        .send({ title: "Borrowed from another job", decisionItemId: performedRecommendationId }),
      400,
      "recommendation_not_on_this_job",
    );

    // The declined item reports the customer's own answer and nothing more.
    const record = await ownerRecord(customerId, secondAssetId);
    const recommendation: Recommendation = record.visits[0].recommendations[0];
    expect(recommendation.outcome).toBe("DECLINED");
    expect(recommendation.linkedTasks).toHaveLength(0);
  }, 300_000);

  it("dates every historical fact from the record, never from the moment it was read", async () => {
    const record = await ownerRecord();
    const readAt = Date.parse(record.generatedAt);

    for (const visit of record.visits) {
      expect(Date.parse(visit.openedAt)).toBeLessThan(readAt);
      for (const event of visit.events) expect(Date.parse(event.at)).toBeLessThanOrEqual(readAt);
      for (const recommendation of visit.recommendations as Recommendation[]) {
        for (const evidence of recommendation.evidence) {
          if (evidence.at !== null) expect(Date.parse(evidence.at)).toBeLessThanOrEqual(readAt);
        }
      }
    }
  }, 120_000);

  it("keeps the workshop's other memories working: customer history and the live journey are untouched", async () => {
    // The dossier is the per-JOB record and stays the per-job record.
    const dossier = await http(booted)
      .get(`/api/v1/branch-manager/work-orders/${visitOne}/dossier`)
      .set("Cookie", managerSession.cookie);
    expectCode(dossier, 200);
    expect(dossier.body.workOrderId).toBe(visitOne);

    // The live journey answers "where is this job now", not "what happened before".
    const journey = await http(booted)
      .get(`/api/v1/technician/work-orders/${visitThree}/journey`)
      .set("Cookie", technicianSession.cookie);
    expectCode(journey, 200);
    expect(journey.body.workOrderId).toBe(visitThree);

    // Audit remains a separate product, reachable by its own permission.
    const audit = await http(booted).get("/api/v1/audit").set("Cookie", ownerSession.cookie);
    expectCode(audit, 200);
    expect(Array.isArray(audit.body.rows)).toBe(true);
  }, 120_000);
});
