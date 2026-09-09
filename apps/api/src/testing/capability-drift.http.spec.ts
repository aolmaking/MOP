/**
 * Turning a capability off actually takes the access away.
 *
 * The engine's central rule is that capability sits ABOVE role in the
 * permission resolver, so a permission can never resurrect a disabled
 * capability. `ModuleEnabledLayer` is layer 4 and returns `locked: true`, which
 * short-circuits everything below it — including a role default and an explicit
 * user override.
 *
 * It could not enforce that, because it did not read the capabilities. It read
 * `session.enabledModules`, copied from `TenantConfiguration.enabledModules` — a
 * column written once at workshop creation and never updated by
 * `CapabilityChangeService.apply()`. From the first capability change onward the
 * two disagreed, in both directions: a workshop that switched INVENTORY off
 * kept every inventory permission, and one that switched it on could not use
 * them. The owner's branding page could blank the column entirely.
 *
 * This is the test that could not have passed before. It goes through the real
 * HTTP stack because the defect lived in the seam between three of them — the
 * capability service writes rows, the auth service builds a session, the
 * resolver reads it — and no one of those in isolation shows it.
 */
import { bootApp, expectCode, http, loginAs, LAUNCH_PROFILE, type BootedApp, type Session } from "./http-kit";
import { hashPassword } from "../identity/auth/password.util";
import { CapabilityChangeService } from "../control/capabilities/capability-change.service";

const SUFFIX = `drift-${Date.now()}`;
const PLATFORM_PASSWORD = "platform-password-123";
const OWNER_PASSWORD = "owner-password-123";
const STAFF_PASSWORD = "staff-password-123";

describe("A capability change reaches the permission resolver (real HTTP, real Postgres)", () => {
  let booted: BootedApp;
  let platformEmail: string;
  let tenantId: string;
  let ownerEmail: string;
  let storekeeperEmail: string;

  /** Ask the server the same question the page asks before drawing a button. */
  async function mayViewStock(session: Session): Promise<boolean> {
    const res = await http(booted)
      .get("/api/v1/access/check")
      .query({ key: "inventory.stock.view" })
      .set("Cookie", session.cookie);
    expectCode(res, 200);
    return res.body.allowed === true;
  }

  beforeAll(async () => {
    booted = await bootApp();

    const plan = await booted.prisma.plan.create({
      data: {
        code: `DRIFT-${SUFFIX}`,
        name: "Drift Plan",
        maxBranches: 3,
        maxUsers: 20,
        maxWarehouses: 3,
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
        name: `Drift Motors ${SUFFIX}`,
        slug: `drift-motors-${SUFFIX}`.toLowerCase(),
        country: "EG",
        city: "Cairo",
        businessType: "Independent Garage",
        primaryCategory: "CARS",
        currency: "EGP",
        timezone: "Africa/Cairo",
        ownerFullName: "Drift Owner",
        ownerEmail,
        ownerPhone: "+201234500011",
        starterBuilderTemplate: "MINIMAL",
        initialStatus: "ACTIVE",
        branches: [{ name: "Main Branch", code: "MAIN", city: "Cairo" }],
        warehouses: [{ name: "Main Store", code: "STORE", branchCodes: ["MAIN"] }],
        // Inventory ON at creation. The whole point is what happens when it
        // is turned off afterwards.
        capabilities: LAUNCH_PROFILE,
      });
    expectCode(created, 201);
    tenantId = created.body.tenant.id;

    await http(booted)
      .post("/api/v1/auth/invite/accept")
      .send({ token: String(created.body.ownerInvitation.link).split("token=")[1], password: OWNER_PASSWORD });

    storekeeperEmail = `store-${SUFFIX}@mop.local`;
    const account = await booted.prisma.account.create({
      data: {
        accountType: "TENANT_STAFF",
        tenantId,
        email: storekeeperEmail,
        passwordHash: hashPassword(STAFF_PASSWORD),
        status: "ACTIVE",
      },
    });
    await booted.prisma.staffUser.create({
      data: {
        accountId: account.id,
        tenantId,
        fullName: "Drift Storekeeper",
        role: "INVENTORY_MANAGER",
        branchScope: [],
        warehouseScope: [],
        categoryScope: ["CARS"],
      },
    });
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

  it("a storekeeper may view stock while INVENTORY is on", async () => {
    const storekeeper = await loginAs(booted, storekeeperEmail, STAFF_PASSWORD);

    expect(await mayViewStock(storekeeper)).toBe(true);
  });

  it("turning INVENTORY off takes it away on the next sign-in", async () => {
    // Through the real service, the way Builder Control does it.
    const capabilities = booted.app.get(CapabilityChangeService);
    // PART_RETURNS declares INVENTORY as a dependency, so switching the parent
    // off alone is correctly refused by the validator. Builder Control sends the
    // whole coherent change; so does this.
    await capabilities.apply(
      tenantId,
      [
        { capabilityKey: "PART_RETURNS", status: "DISABLED" },
        { capabilityKey: "INVENTORY", status: "DISABLED" },
      ],
      { accountId: "platform-account", displayName: "Platform Admin", isPlatform: true },
      "Workshop stopped holding its own stock.",
    );

    const storekeeper = await loginAs(booted, storekeeperEmail, STAFF_PASSWORD);

    // Before this fix the answer stayed `true` forever: the session carried a
    // module list written at creation, and nothing ever rewrote it.
    expect(await mayViewStock(storekeeper)).toBe(false);
  });

  it("says the module is off, rather than that the role lacks the permission", async () => {
    // The reason matters. INVENTORY_MANAGER holds `inventory.stock.view` by
    // role, so "you do not have permission" would send an owner to the access
    // page to grant something that is already granted. The capability is what
    // is refusing.
    const storekeeper = await loginAs(booted, storekeeperEmail, STAFF_PASSWORD);
    const res = await http(booted)
      .get("/api/v1/access/check")
      .query({ key: "inventory.stock.view" })
      .set("Cookie", storekeeper.cookie);

    expectCode(res, 200);
    expect(res.body.allowed).toBe(false);
    expect(res.body.locked).toBe(true);
    // The workshop's own words, from TenantCapabilityLayer -- which sits above
    // ModuleEnabledLayer and answers first. Both now derive from the same rows;
    // this asserts the one a person actually reads.
    expect(String(res.body.reason)).toMatch(/not part of this workshop/i);
  });

  it("turning it back on restores the access", async () => {
    const capabilities = booted.app.get(CapabilityChangeService);
    await capabilities.apply(
      tenantId,
      [
        { capabilityKey: "INVENTORY", status: "ENABLED" },
        { capabilityKey: "PART_RETURNS", status: "ENABLED" },
      ],
      { accountId: "platform-account", displayName: "Platform Admin", isPlatform: true },
      "Workshop holds stock again.",
    );

    const storekeeper = await loginAs(booted, storekeeperEmail, STAFF_PASSWORD);

    // The other direction of the same drift, and the one nobody would have
    // noticed as a security problem: a workshop that enabled a module found
    // that its staff still could not use it.
    expect(await mayViewStock(storekeeper)).toBe(true);
  });

  it("the owner saving branding cannot blank the workshop's modules", async () => {
    // Branding upserts the configuration row, and its `create` branch used to
    // pass `enabledModules: []`. With that column authoritative, a workshop
    // that had never customised its branding lost every module the first time
    // its owner picked a colour.
    const owner = await loginAs(booted, ownerEmail, OWNER_PASSWORD);
    const saved = await http(booted)
      .patch("/api/v1/owner/branding")
      .set("Cookie", owner.cookie)
      .send({ palette: "ocean" });
    expect([200, 201]).toContain(saved.status);

    const storekeeper = await loginAs(booted, storekeeperEmail, STAFF_PASSWORD);
    expect(await mayViewStock(storekeeper)).toBe(true);
  });
});
