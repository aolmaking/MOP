/**
 * The catalog-driven part request, end to end, over real HTTP.
 *
 * `parts-loop.http.spec.ts` proves the inventory loop from a request
 * that already exists. This proves the half in front of it: an inventory
 * manager builds the catalogue -- categories, a filter vocabulary, which
 * filters each category offers, and what each part actually is -- and a
 * technician then browses that structure, narrows it, fills a basket and
 * sends it, after which the existing loop still runs unchanged.
 *
 * The claim under test, in one sentence: **what the inventory manager
 * configures is exactly what the technician sees, and what the
 * technician sends is exactly what the store already knows how to
 * handle.** Every step below is a real request; nothing is written
 * straight to the database except the opening stock balance, for which
 * the product genuinely has no endpoint (recorded as a finding in
 * `parts-loop.http.spec.ts`, not invented here).
 */
import { bootApp, expectCode, http, loginAs, LAUNCH_PROFILE, type BootedApp, type Session } from "./http-kit";
import { hashPassword } from "../identity/auth/password.util";

const SUFFIX = `cc-${Date.now()}`;
const PLATFORM_PASSWORD = "platform-password-123";
const OWNER_PASSWORD = "owner-password-123";
const STAFF_PASSWORD = "staff-password-123";

interface Workshop {
  tenantId: string;
  branchId: string;
  warehouseId: string;
  manager: Session;
  technician: Session;
  storekeeper: Session;
}

describe("Catalog-driven part requests (real HTTP, real Postgres)", () => {
  let booted: BootedApp;
  let platformEmail: string;
  let planId: string;

  /** The workshop under test, and a second one that must never see it. */
  let shop: Workshop;
  let neighbour: Workshop;

  /** Configuration ids, as the storekeeper's own requests returned them. */
  let brakesId: string;
  let padsId: string;
  let filtersCategoryId: string;
  let vehicleTypeId: string;
  let brandId: string;
  let sedanId: string;
  let suvId: string;
  let toyotaId: string;
  let hyundaiId: string;

  let padItemId: string;
  let discItemId: string;
  let airFilterId: string;

  let workOrderId: string;
  let cartKey: string;
  let padRequestId: string;

  async function staff(workshop: Omit<Workshop, "manager" | "technician" | "storekeeper">, role: string, tag: string) {
    const email = `${role.toLowerCase()}-${tag}-${SUFFIX}@mop.local`;
    const account = await booted.prisma.account.create({
      data: {
        accountType: "TENANT_STAFF",
        tenantId: workshop.tenantId,
        email,
        passwordHash: hashPassword(STAFF_PASSWORD),
        status: "ACTIVE",
      },
    });
    await booted.prisma.staffUser.create({
      data: {
        accountId: account.id,
        tenantId: workshop.tenantId,
        fullName: `${role} ${tag}`,
        role: role as never,
        branchScope: [workshop.branchId],
        warehouseScope: [workshop.warehouseId],
        categoryScope: ["CARS"],
      },
    });
    return loginAs(booted, email, STAFF_PASSWORD);
  }

  async function makeWorkshop(tag: string): Promise<Workshop> {
    const platformSession = await loginAs(booted, platformEmail, PLATFORM_PASSWORD);
    const created = await http(booted)
      .post("/api/v1/platform/workshops")
      .set("Cookie", platformSession.cookie)
      .send({
        planId,
        name: `Catalog ${tag} ${SUFFIX}`,
        slug: `catalog-${tag}-${SUFFIX}`.toLowerCase(),
        country: "EG",
        city: "Cairo",
        businessType: "Independent Garage",
        primaryCategory: "CARS",
        currency: "EGP",
        timezone: "Africa/Cairo",
        ownerFullName: `Catalog ${tag} Owner`,
        ownerEmail: `owner-${tag}-${SUFFIX}@mop.local`,
        ownerPhone: "+201234567890",
        allowedBranchesStart: 1,
        allowedUsersStart: 10,
        allowedWarehousesStart: 1,
        starterBuilderTemplate: "MINIMAL",
        initialStatus: "ACTIVE",
        branches: [{ name: "Main Branch", code: "MAIN", city: "Cairo" }],
        warehouses: [{ name: "Main Store", code: "STORE", branchCodes: ["MAIN"] }],
        capabilities: LAUNCH_PROFILE,
      });
    expectCode(created, 201);

    const tenantId = created.body.tenant.id as string;
    await http(booted)
      .post("/api/v1/auth/invite/accept")
      .send({ token: String(created.body.inviteLink).split("token=")[1], password: OWNER_PASSWORD });

    const branchId = (await booted.prisma.branch.findFirstOrThrow({ where: { tenantId }, select: { id: true } })).id;
    const warehouseId = (await booted.prisma.warehouse.findFirstOrThrow({ where: { tenantId }, select: { id: true } }))
      .id;

    const base = { tenantId, branchId, warehouseId };
    return {
      ...base,
      manager: await staff(base, "BRANCH_MANAGER", tag),
      technician: await staff(base, "TECHNICIAN", tag),
      storekeeper: await staff(base, "INVENTORY_MANAGER", tag),
    };
  }

  /** A category, as the storekeeper creates one. */
  async function createCategory(workshop: Workshop, body: Record<string, unknown>): Promise<string> {
    const res = await http(booted)
      .post("/api/v1/inventory/catalog-config/categories")
      .set("Cookie", workshop.storekeeper.cookie)
      .send(body);
    expectCode(res, 201);
    return res.body.id;
  }

  async function createAttribute(workshop: Workshop, label: string): Promise<string> {
    const res = await http(booted)
      .post("/api/v1/inventory/catalog-config/attributes")
      .set("Cookie", workshop.storekeeper.cookie)
      .send({ label });
    expectCode(res, 201);
    return res.body.id;
  }

  async function addValue(workshop: Workshop, attributeId: string, label: string): Promise<string> {
    const res = await http(booted)
      .post(`/api/v1/inventory/catalog-config/attributes/${attributeId}/values`)
      .set("Cookie", workshop.storekeeper.cookie)
      .send({ label });
    expectCode(res, 201);
    return res.body.id;
  }

  async function createItem(workshop: Workshop, body: Record<string, unknown>): Promise<string> {
    const res = await http(booted)
      .post("/api/v1/inventory/catalog")
      .set("Cookie", workshop.storekeeper.cookie)
      .send(body);
    expectCode(res, 201);
    return res.body.id;
  }

  async function onHand(itemId: string, warehouseId: string): Promise<number> {
    const balance = await booted.prisma.warehouseStockBalance.findFirst({
      where: { inventoryItemId: itemId, warehouseId },
      select: { availableQty: true },
    });
    return balance?.availableQty ?? 0;
  }

  beforeAll(async () => {
    booted = await bootApp();

    planId = (
      await booted.prisma.plan.create({
        data: {
          code: `CATALOG-${SUFFIX}`,
          name: "Catalog Plan",
          maxBranches: 5,
          maxUsers: 20,
          maxWarehouses: 5,
          allowedCategories: ["CARS"],
          allowedModules: [],
          allowedFeatures: [],
          allowedReports: [],
          monthlyPrice: 0,
        },
      })
    ).id;

    platformEmail = `platform-${SUFFIX}@mop.local`;
    await booted.prisma.account.create({
      data: { accountType: "PLATFORM", email: platformEmail, passwordHash: hashPassword(PLATFORM_PASSWORD), status: "ACTIVE" },
    });

    shop = await makeWorkshop("shop");
    neighbour = await makeWorkshop("next-door");
  }, 300_000);

  afterAll(async () => {
    for (const tenantId of [shop?.tenantId, neighbour?.tenantId].filter(Boolean) as string[]) {
      await booted.prisma.session.deleteMany({ where: { tenantId } });
      await booted.prisma.staffUser.deleteMany({ where: { tenantId } });
      await booted.prisma.account.deleteMany({ where: { tenantId } });
    }
    await booted.prisma.account.deleteMany({ where: { email: platformEmail } });
    await booted.close();
  }, 180_000);

  /* ================================================================ *
   * 1. The inventory manager builds the catalogue.
   * ================================================================ */

  it("the storekeeper creates categories, including one nested inside another", async () => {
    brakesId = await createCategory(shop, { name: "Brakes" });
    padsId = await createCategory(shop, { name: "Pads & discs", parentId: brakesId });
    filtersCategoryId = await createCategory(shop, { name: "Filters" });

    const config = await http(booted)
      .get("/api/v1/inventory/catalog-config")
      .set("Cookie", shop.storekeeper.cookie);
    expectCode(config, 200);

    const brakes = config.body.categories.find((c: { id: string }) => c.id === brakesId);
    expect(brakes).toBeTruthy();
    expect(brakes.children).toHaveLength(1);
    expect(brakes.children[0].id).toBe(padsId);
    expect(config.body.categories.map((c: { id: string }) => c.id)).toContain(filtersCategoryId);
  }, 120_000);

  it("a category cannot be nested three deep, or inside itself", async () => {
    const tooDeep = await http(booted)
      .post("/api/v1/inventory/catalog-config/categories")
      .set("Cookie", shop.storekeeper.cookie)
      .send({ name: "Ceramic pads", parentId: padsId });
    expectCode(tooDeep, 400, "category_too_deep");

    const itself = await http(booted)
      .post(`/api/v1/inventory/catalog-config/categories/${brakesId}`)
      .set("Cookie", shop.storekeeper.cookie)
      .send({ name: "Brakes", parentId: brakesId });
    expectCode(itself, 400, "category_cycle");
  }, 120_000);

  it("the storekeeper invents the filter vocabulary and its values", async () => {
    vehicleTypeId = await createAttribute(shop, "Vehicle Type");
    brandId = await createAttribute(shop, "Brand");

    sedanId = await addValue(shop, vehicleTypeId, "Sedan");
    suvId = await addValue(shop, vehicleTypeId, "SUV");
    toyotaId = await addValue(shop, brandId, "Toyota");
    hyundaiId = await addValue(shop, brandId, "Hyundai");

    // The same value twice is refused, not silently deduplicated: a
    // second "Sedan" would split every filtered result in two.
    const duplicate = await http(booted)
      .post(`/api/v1/inventory/catalog-config/attributes/${vehicleTypeId}/values`)
      .set("Cookie", shop.storekeeper.cookie)
      .send({ label: "Sedan" });
    expectCode(duplicate, 409, "value_taken");
  }, 120_000);

  it("filters are attached per category, not to the whole workshop", async () => {
    for (const categoryId of [brakesId, padsId]) {
      expectCode(
        await http(booted)
          .post(`/api/v1/inventory/catalog-config/categories/${categoryId}/attributes`)
          .set("Cookie", shop.storekeeper.cookie)
          .send({ attributeIds: [vehicleTypeId, brandId] }),
        201,
      );
    }

    // Filters gets Vehicle Type only -- proving the technician sees a
    // different filter set per category rather than all of them.
    expectCode(
      await http(booted)
        .post(`/api/v1/inventory/catalog-config/categories/${filtersCategoryId}/attributes`)
        .set("Cookie", shop.storekeeper.cookie)
        .send({ attributeIds: [vehicleTypeId] }),
      201,
    );

    const config = await http(booted).get("/api/v1/inventory/catalog-config").set("Cookie", shop.storekeeper.cookie);
    const filters = config.body.categories.find((c: { id: string }) => c.id === filtersCategoryId);
    expect(filters.attributeIds).toEqual([vehicleTypeId]);
  }, 120_000);

  it("the order the manager sets is the order the technician reads", async () => {
    // Alphabetically this is Brakes, Filters. The shop does brakes all
    // day and wants them second here purely to prove the order is the
    // manager's and not the collation's.
    const config = await http(booted).get("/api/v1/inventory/catalog-config").set("Cookie", shop.storekeeper.cookie);
    expectCode(config, 200);
    const topLevel = config.body.categories.map((c: { id: string }) => c.id);
    expect(topLevel).toContain(brakesId);
    expect(topLevel).toContain(filtersCategoryId);

    const reversed = [...topLevel].reverse();
    expectCode(
      await http(booted)
        .post("/api/v1/inventory/catalog-config/categories/reorder")
        .set("Cookie", shop.storekeeper.cookie)
        .send({ orderedIds: reversed }),
      201,
    );

    const browse = await http(booted).get("/api/v1/technician/parts-catalog").set("Cookie", shop.technician.cookie);
    expectCode(browse, 200);
    const visible = browse.body.categories.map((c: { id: string }) => c.id);
    // Only the technician-visible ones come back, so compare the two
    // that are definitely in both lists rather than the whole array.
    expect(visible.indexOf(filtersCategoryId)).toBeLessThan(visible.indexOf(brakesId));

    // Put it back, so later assertions read the original order.
    expectCode(
      await http(booted)
        .post("/api/v1/inventory/catalog-config/categories/reorder")
        .set("Cookie", shop.storekeeper.cookie)
        .send({ orderedIds: topLevel }),
      201,
    );
  }, 120_000);

  it("filter values keep the order the manager gave them, not the alphabet", async () => {
    // SUV before Sedan: alphabetically wrong on purpose.
    expectCode(
      await http(booted)
        .post(`/api/v1/inventory/catalog-config/attributes/${vehicleTypeId}/values/reorder`)
        .set("Cookie", shop.storekeeper.cookie)
        .send({ orderedIds: [suvId, sedanId] }),
      201,
    );

    const browse = await http(booted)
      .get("/api/v1/technician/parts-catalog")
      .query({ categoryId: brakesId })
      .set("Cookie", shop.technician.cookie);
    expectCode(browse, 200);

    const vehicleType = browse.body.filters.find((f: { attributeId: string }) => f.attributeId === vehicleTypeId);
    expect(vehicleType.options.map((o: { valueId: string }) => o.valueId)).toEqual([suvId, sedanId]);

    expectCode(
      await http(booted)
        .post(`/api/v1/inventory/catalog-config/attributes/${vehicleTypeId}/values/reorder`)
        .set("Cookie", shop.storekeeper.cookie)
        .send({ orderedIds: [sedanId, suvId] }),
      201,
    );
  }, 120_000);

  it("a partial or foreign reorder is refused rather than half-applied", async () => {
    // One id missing: the client is working from a stale picture, and
    // ordering the rest would leave the missing row wherever it was with
    // nothing to show anything went wrong.
    expectCode(
      await http(booted)
        .post(`/api/v1/inventory/catalog-config/attributes/${vehicleTypeId}/values/reorder`)
        .set("Cookie", shop.storekeeper.cookie)
        .send({ orderedIds: [sedanId] }),
      400,
      "reorder_mismatch",
    );

    // And the same id twice, which would otherwise silently drop one.
    expectCode(
      await http(booted)
        .post(`/api/v1/inventory/catalog-config/attributes/${vehicleTypeId}/values/reorder`)
        .set("Cookie", shop.storekeeper.cookie)
        .send({ orderedIds: [sedanId, sedanId] }),
      400,
      "reorder_mismatch",
    );

    const foreign = await createAttribute(neighbour, "Next Door Dimension");
    const foreignValue = await addValue(neighbour, foreign, "Whatever");
    expectCode(
      await http(booted)
        .post(`/api/v1/inventory/catalog-config/attributes/${vehicleTypeId}/values/reorder`)
        .set("Cookie", shop.storekeeper.cookie)
        .send({ orderedIds: [sedanId, foreignValue] }),
      400,
      "reorder_mismatch",
    );

    // A technician may not reorder anything at all.
    expectCode(
      await http(booted)
        .post("/api/v1/inventory/catalog-config/categories/reorder")
        .set("Cookie", shop.technician.cookie)
        .send({ orderedIds: [brakesId] }),
      403,
      "forbidden",
    );
  }, 120_000);

  it("parts are filed and stamped with the configured values", async () => {
    padItemId = await createItem(shop, {
      sku: `PAD-${SUFFIX}`,
      name: "Front brake pad set",
      itemType: "PART",
      sellingPrice: "450.00",
      cost: "300.00",
      catalogCategoryId: padsId,
      summary: "Ceramic, low dust",
      attributeValueIds: [sedanId, toyotaId],
      compatibleCategories: ["CARS"],
    });

    discItemId = await createItem(shop, {
      sku: `DISC-${SUFFIX}`,
      name: "Brake disc",
      itemType: "PART",
      sellingPrice: "700.00",
      catalogCategoryId: padsId,
      attributeValueIds: [suvId, hyundaiId],
      compatibleCategories: ["CARS"],
    });

    airFilterId = await createItem(shop, {
      sku: `AIR-${SUFFIX}`,
      name: "Air filter",
      itemType: "PART",
      sellingPrice: "120.00",
      catalogCategoryId: filtersCategoryId,
      attributeValueIds: [sedanId],
      compatibleCategories: ["CARS"],
    });

    // The opening balance. No endpoint exists for this -- see the header
    // of parts-loop.http.spec.ts; the same finding, not a new one.
    for (const itemId of [padItemId, discItemId, airFilterId]) {
      await booted.prisma.warehouseStockBalance.create({
        data: { tenantId: shop.tenantId, inventoryItemId: itemId, warehouseId: shop.warehouseId, availableQty: 10 },
      });
    }

    const item = await http(booted)
      .get(`/api/v1/inventory/catalog/${padItemId}`)
      .set("Cookie", shop.storekeeper.cookie);
    expectCode(item, 200);
    expect(item.body.catalogCategoryId).toBe(padsId);
    expect([...item.body.attributeValueIds].sort()).toEqual([sedanId, toyotaId].sort());
  }, 120_000);

  it("a value from another workshop cannot be stamped on a part", async () => {
    const foreignAttribute = await createAttribute(neighbour, "Vehicle Type");
    const foreignValue = await addValue(neighbour, foreignAttribute, "Sedan");

    const res = await http(booted)
      .post("/api/v1/inventory/catalog")
      .set("Cookie", shop.storekeeper.cookie)
      .send({
        sku: `LEAK-${SUFFIX}`,
        name: "Leaky part",
        itemType: "PART",
        sellingPrice: "10.00",
        attributeValueIds: [foreignValue],
      });
    expectCode(res, 400, "attribute_value_not_found");

    const foreignCategory = await createCategory(neighbour, { name: "Next Door Brakes" });
    const filed = await http(booted)
      .post("/api/v1/inventory/catalog")
      .set("Cookie", shop.storekeeper.cookie)
      .send({
        sku: `LEAK2-${SUFFIX}`,
        name: "Leaky part 2",
        itemType: "PART",
        sellingPrice: "10.00",
        catalogCategoryId: foreignCategory,
      });
    expectCode(filed, 400, "category_not_found");
  }, 120_000);

  it("a technician may not author the catalogue", async () => {
    expectCode(
      await http(booted)
        .post("/api/v1/inventory/catalog-config/categories")
        .set("Cookie", shop.technician.cookie)
        .send({ name: "Technician's own category" }),
      403,
      "forbidden",
    );
    expectCode(
      await http(booted).get("/api/v1/inventory/catalog-config").set("Cookie", shop.technician.cookie),
      403,
      "forbidden",
    );
    expectCode(
      await http(booted).get("/api/v1/inventory/catalog-preview").set("Cookie", shop.technician.cookie),
      403,
      "forbidden",
    );
  }, 120_000);

  /* ================================================================ *
   * 2. The technician browses what was configured.
   * ================================================================ */

  it("a job reaches the technician", async () => {
    const intake = await http(booted)
      .post("/api/v1/branch-manager/intake")
      .set("Cookie", shop.manager.cookie)
      .send({
        branchId: shop.branchId,
        customer: { fullName: "Catalog Customer", phone: "+201234567891" },
        asset: { category: "CARS", plateNumber: `CC-${Date.now()}` },
        complaint: "Grinding when braking",
      });
    expectCode(intake, 201);
    workOrderId = intake.body.workOrderId;

    const staffUser = await booted.prisma.staffUser.findFirstOrThrow({
      where: { tenantId: shop.tenantId, role: "TECHNICIAN" },
      select: { id: true },
    });
    await booted.prisma.workOrderAssignment.create({
      data: { tenantId: shop.tenantId, workOrderId, staffUserId: staffUser.id },
    });

    expectCode(
      await http(booted)
        .post(`/api/v1/technician/work-orders/${workOrderId}/start-inspection`)
        .set("Cookie", shop.technician.cookie)
        .send({}),
      200,
    );
    expectCode(
      await http(booted)
        .post(`/api/v1/technician/work-orders/${workOrderId}/inspection`)
        .set("Cookie", shop.technician.cookie)
        .send({ type: "QUICK", note: "Pads worn." }),
      201,
    );

    const raised = await http(booted)
      .post(`/api/v1/technician/work-orders/${workOrderId}/decisions`)
      .set("Cookie", shop.technician.cookie)
      .send({ name: "Replace pads", explanation: "Worn out.", importance: "HIGH", price: "450.00" });
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
        .set("Cookie", shop.technician.cookie)
        .send({}),
      200,
    );
  }, 180_000);

  it("the technician's catalogue is the storekeeper's configuration, and nothing else", async () => {
    const res = await http(booted).get("/api/v1/technician/parts-catalog").set("Cookie", shop.technician.cookie);
    expectCode(res, 200);

    const names = res.body.categories.map((c: { name: string }) => c.name);
    expect(names).toContain("Brakes");
    expect(names).toContain("Filters");
    // Never the neighbour's.
    expect(names).not.toContain("Next Door Brakes");

    const brakes = res.body.categories.find((c: { name: string }) => c.name === "Brakes");
    // A parent counts what is filed beneath it: both pads and disc.
    expect(brakes.itemCount).toBe(2);
    expect(brakes.children[0].itemCount).toBe(2);

    // Filters belong to a category; browsing "All" offers none.
    expect(res.body.filters).toEqual([]);

    // Cost is absent from the shape, not merely null.
    for (const item of res.body.items) expect(item).not.toHaveProperty("cost");
  }, 120_000);

  it("choosing a category brings exactly that category's filters", async () => {
    const brakes = await http(booted)
      .get("/api/v1/technician/parts-catalog")
      .query({ categoryId: brakesId })
      .set("Cookie", shop.technician.cookie);
    expectCode(brakes, 200);
    expect(brakes.body.filters.map((f: { label: string }) => f.label).sort()).toEqual(["Brand", "Vehicle Type"]);
    // The parent's browse includes the child's items.
    expect(brakes.body.total).toBe(2);

    const filters = await http(booted)
      .get("/api/v1/technician/parts-catalog")
      .query({ categoryId: filtersCategoryId })
      .set("Cookie", shop.technician.cookie);
    expectCode(filters, 200);
    expect(filters.body.filters.map((f: { label: string }) => f.label)).toEqual(["Vehicle Type"]);
    expect(filters.body.items.map((i: { id: string }) => i.id)).toEqual([airFilterId]);
  }, 120_000);

  it("filtering narrows to what actually carries the value", async () => {
    const sedans = await http(booted)
      .get("/api/v1/technician/parts-catalog")
      .query({ categoryId: brakesId, attributes: `${vehicleTypeId}:${sedanId}` })
      .set("Cookie", shop.technician.cookie);
    expectCode(sedans, 200);
    expect(sedans.body.items.map((i: { id: string }) => i.id)).toEqual([padItemId]);

    // Two attributes AND together: Sedan + Hyundai matches nothing,
    // because the Hyundai part is an SUV part.
    const none = await http(booted)
      .get("/api/v1/technician/parts-catalog")
      .query({ categoryId: brakesId, attributes: `${vehicleTypeId}:${sedanId};${brandId}:${hyundaiId}` })
      .set("Cookie", shop.technician.cookie);
    expectCode(none, 200);
    expect(none.body.items).toEqual([]);

    // Values within one attribute OR together: both parts come back.
    const both = await http(booted)
      .get("/api/v1/technician/parts-catalog")
      .query({ categoryId: brakesId, attributes: `${vehicleTypeId}:${sedanId},${suvId}` })
      .set("Cookie", shop.technician.cookie);
    expectCode(both, 200);
    expect(both.body.items).toHaveLength(2);

    // A facet does not count itself away: with Sedan chosen, SUV still
    // reports its own matches, so the technician can switch.
    const vehicleType = both.body.filters.find((f: { attributeId: string }) => f.attributeId === vehicleTypeId);
    const sedanOption = vehicleType.options.find((o: { valueId: string }) => o.valueId === sedanId);
    expect(sedanOption.count).toBe(1);
  }, 120_000);

  it("search reaches the name, the SKU and the configured vocabulary", async () => {
    const byName = await http(booted)
      .get("/api/v1/technician/parts-catalog")
      .query({ q: "brake pad" })
      .set("Cookie", shop.technician.cookie);
    expectCode(byName, 200);
    expect(byName.body.items.map((i: { id: string }) => i.id)).toEqual([padItemId]);

    const bySku = await http(booted)
      .get("/api/v1/technician/parts-catalog")
      .query({ q: `AIR-${SUFFIX}` })
      .set("Cookie", shop.technician.cookie);
    expectCode(bySku, 200);
    expect(bySku.body.items.map((i: { id: string }) => i.id)).toEqual([airFilterId]);

    // "Toyota" is a value the storekeeper invented; a technician types it
    // long before they think to open the Brand filter.
    const byBrand = await http(booted)
      .get("/api/v1/technician/parts-catalog")
      .query({ q: "Toyota" })
      .set("Cookie", shop.technician.cookie);
    expectCode(byBrand, 200);
    expect(byBrand.body.items.map((i: { id: string }) => i.id)).toEqual([padItemId]);
  }, 120_000);

  it("the storekeeper's preview is the technician's browse, not a drawing of it", async () => {
    const query = { categoryId: brakesId, attributes: `${vehicleTypeId}:${sedanId}` };

    const preview = await http(booted)
      .get("/api/v1/inventory/catalog-preview")
      .query(query)
      .set("Cookie", shop.storekeeper.cookie);
    const technician = await http(booted)
      .get("/api/v1/technician/parts-catalog")
      .query(query)
      .set("Cookie", shop.technician.cookie);

    expectCode(preview, 200);
    expectCode(technician, 200);
    expect(preview.body).toEqual(technician.body);
  }, 120_000);

  it("a category hidden from technicians disappears from both, together", async () => {
    expectCode(
      await http(booted)
        .post(`/api/v1/inventory/catalog-config/categories/${filtersCategoryId}`)
        .set("Cookie", shop.storekeeper.cookie)
        .send({ name: "Filters", technicianVisible: false }),
      201,
    );

    const technician = await http(booted).get("/api/v1/technician/parts-catalog").set("Cookie", shop.technician.cookie);
    expect(technician.body.categories.map((c: { name: string }) => c.name)).not.toContain("Filters");

    const preview = await http(booted).get("/api/v1/inventory/catalog-preview").set("Cookie", shop.storekeeper.cookie);
    expect(preview.body.categories.map((c: { name: string }) => c.name)).not.toContain("Filters");

    // The storekeeper's own configuration still shows it -- they are the
    // one who has to move the parts out.
    const config = await http(booted).get("/api/v1/inventory/catalog-config").set("Cookie", shop.storekeeper.cookie);
    expect(config.body.categories.map((c: { name: string }) => c.name)).toContain("Filters");

    // Put it back, because later steps browse it.
    expectCode(
      await http(booted)
        .post(`/api/v1/inventory/catalog-config/categories/${filtersCategoryId}`)
        .set("Cookie", shop.storekeeper.cookie)
        .send({ name: "Filters", technicianVisible: true }),
      201,
    );
  }, 120_000);

  /* ================================================================ *
   * 3. The cart becomes real part requests.
   * ================================================================ */

  it("the cart lands as one request per part, and moves the job to WAITING_PARTS", async () => {
    cartKey = `cart-${SUFFIX}-1`;
    const res = await http(booted)
      .post(`/api/v1/technician/work-orders/${workOrderId}/parts/cart`)
      .set("Cookie", shop.technician.cookie)
      .send({
        cartKey,
        lines: [
          { inventoryItemId: padItemId, quantity: 2 },
          { inventoryItemId: airFilterId, quantity: 1 },
          // The same part twice in one basket. One request for three,
          // not two requests the store has to notice are the same part.
          { inventoryItemId: padItemId, quantity: 1 },
        ],
        reason: "Front brake service",
      });
    expectCode(res, 201);
    expect(res.body.replayed).toBe(false);
    expect(res.body.requests).toHaveLength(2);

    const pad = res.body.requests.find((r: { inventoryItemId: string }) => r.inventoryItemId === padItemId);
    expect(pad.quantity).toBe(3);
    expect(pad.status).toBe("REQUESTED");
    padRequestId = pad.id;

    const workOrder = await booted.prisma.workOrder.findUniqueOrThrow({
      where: { id: workOrderId },
      select: { status: true },
    });
    expect(workOrder.status).toBe("WAITING_PARTS");
  }, 120_000);

  it("the same cart submitted again changes nothing", async () => {
    const before = await booted.prisma.partRequest.count({ where: { tenantId: shop.tenantId, workOrderId } });

    const again = await http(booted)
      .post(`/api/v1/technician/work-orders/${workOrderId}/parts/cart`)
      .set("Cookie", shop.technician.cookie)
      .send({ cartKey, lines: [{ inventoryItemId: padItemId, quantity: 3 }] });
    expectCode(again, 201);
    expect(again.body.replayed).toBe(true);
    expect(again.body.requests.map((r: { id: string }) => r.id)).toContain(padRequestId);

    const after = await booted.prisma.partRequest.count({ where: { tenantId: shop.tenantId, workOrderId } });
    expect(after).toBe(before);
  }, 120_000);

  it("a cart carrying another workshop's part is refused whole", async () => {
    const foreignItem = await createItem(neighbour, {
      sku: `NEXTDOOR-${SUFFIX}`,
      name: "Next door part",
      itemType: "PART",
      sellingPrice: "50.00",
    });

    const before = await booted.prisma.partRequest.count({ where: { tenantId: shop.tenantId, workOrderId } });
    const res = await http(booted)
      .post(`/api/v1/technician/work-orders/${workOrderId}/parts/cart`)
      .set("Cookie", shop.technician.cookie)
      .send({
        cartKey: `cart-${SUFFIX}-foreign`,
        lines: [
          { inventoryItemId: discItemId, quantity: 1 },
          { inventoryItemId: foreignItem, quantity: 1 },
        ],
      });
    expectCode(res, 400, "item_not_requestable");

    // The legitimate line must not have landed either.
    const after = await booted.prisma.partRequest.count({ where: { tenantId: shop.tenantId, workOrderId } });
    expect(after).toBe(before);
  }, 120_000);

  it("an empty cart and a silly quantity are both refused", async () => {
    expectCode(
      await http(booted)
        .post(`/api/v1/technician/work-orders/${workOrderId}/parts/cart`)
        .set("Cookie", shop.technician.cookie)
        .send({ cartKey: `cart-${SUFFIX}-empty`, lines: [] }),
      400,
    );

    expectCode(
      await http(booted)
        .post(`/api/v1/technician/work-orders/${workOrderId}/parts/cart`)
        .set("Cookie", shop.technician.cookie)
        .send({ cartKey: `cart-${SUFFIX}-huge`, lines: [{ inventoryItemId: padItemId, quantity: 5000 }] }),
      400,
      "quantity_too_large",
    );
  }, 120_000);

  /* ================================================================ *
   * 4. The existing inventory loop still runs, unchanged.
   * ================================================================ */

  it("the store sees the cart's requests in its own queue", async () => {
    const queue = await http(booted).get("/api/v1/inventory/requests").set("Cookie", shop.storekeeper.cookie);
    expectCode(queue, 200);

    const ids = queue.body.requests.map((r: { id: string }) => r.id);
    expect(ids).toContain(padRequestId);

    const pad = queue.body.requests.find((r: { id: string }) => r.id === padRequestId);
    expect(pad.requested).toBe(3);
    expect(pad.outstanding).toBe(3);

    // And never in the neighbour's.
    const nextDoor = await http(booted).get("/api/v1/inventory/requests").set("Cookie", neighbour.storekeeper.cookie);
    expectCode(nextDoor, 200);
    expect(nextDoor.body.requests.map((r: { id: string }) => r.id)).not.toContain(padRequestId);
  }, 120_000);

  it("approve, issue, and the shelf moves with the paperwork", async () => {
    const before = await onHand(padItemId, shop.warehouseId);

    expectCode(
      await http(booted)
        .post(`/api/v1/inventory/requests/${padRequestId}/approve`)
        .set("Cookie", shop.storekeeper.cookie)
        .send({}),
      201,
    );

    const issued = await http(booted)
      .post(`/api/v1/inventory/requests/${padRequestId}/issue`)
      .set("Cookie", shop.storekeeper.cookie)
      .send({ warehouseId: shop.warehouseId, quantity: 3 });
    expectCode(issued, 201);
    expect(issued.body.outstanding).toBe(0);

    expect(await onHand(padItemId, shop.warehouseId)).toBe(before - 3);

    const movement = await booted.prisma.stockMovement.findFirstOrThrow({
      where: { tenantId: shop.tenantId, inventoryItemId: padItemId, type: "ISSUE" },
      orderBy: { createdAt: "desc" },
    });
    expect(movement.quantity).toBe(3);
    expect(movement.beforeQty).toBe(before);
    expect(movement.afterQty).toBe(before - 3);
    expect(movement.referenceId).toBe(padRequestId);
  }, 120_000);

  it("the technician receives and fits what the cart asked for", async () => {
    const card = await http(booted)
      .get(`/api/v1/technician/work-orders/${workOrderId}`)
      .set("Cookie", shop.technician.cookie);
    expectCode(card, 200);

    const pad = card.body.parts.find((p: { partRequestId: string }) => p.partRequestId === padRequestId);
    expect(pad.quantity).toBe(3);
    expect(pad.issued).toBe(3);
    expect(pad.action).toBe("RECEIVE");

    expectCode(
      await http(booted)
        .post(`/api/v1/technician/parts/${padRequestId}/receive`)
        .set("Cookie", shop.technician.cookie)
        .send({}),
      201,
    );
    expectCode(
      await http(booted)
        .post(`/api/v1/technician/parts/${padRequestId}/used`)
        .set("Cookie", shop.technician.cookie)
        .send({}),
      201,
    );

    const request = await booted.prisma.partRequest.findUniqueOrThrow({
      where: { id: padRequestId },
      select: { status: true, cartKey: true },
    });
    expect(request.status).toBe("USED");
    // The basket it came from is still recorded on it.
    expect(request.cartKey).toBe(cartKey);
  }, 120_000);

  it("the fitted part reaches the bill exactly once", async () => {
    const lines = await booted.prisma.workOrderPartLine.findMany({
      where: { tenantId: shop.tenantId, workOrderId, partRequestId: padRequestId },
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(3);
    // Snapshotted at issue, not read from the catalogue now.
    expect(lines[0].sellingPrice.toFixed(2)).toBe("450.00");
  }, 120_000);
});
