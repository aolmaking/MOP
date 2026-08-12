/**
 * Reading the audit log.
 *
 * `AuditLog` has been written on every risky action since Phase 1 and
 * read by nothing -- the audit-boundary linter spent the whole project
 * guarding a system no human could see.
 *
 * The property that matters most here is tenant isolation: an owner's
 * history must contain their workshop's rows and nobody else's, and that
 * has to be true of the QUERY rather than of a filter applied afterwards.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { AuditQueryService, categoryFor } from "./audit-query.service";
import type { PrismaService } from "../database/prisma.service";

const prisma = new PrismaClient();
const audit = new AuditQueryService(prisma as unknown as PrismaService);

const SUFFIX = `aud-${Date.now()}`;
let planId: string;
let mine: string;
let theirs: string;

async function makeTenant(name: string): Promise<string> {
  const tenant = await prisma.tenant.create({
    data: {
      name: `${name} ${SUFFIX}`,
      nameNormalized: `${name.toLowerCase()} ${SUFFIX}`,
      slug: `${name.toLowerCase()}-${SUFFIX}`,
      customerRegistrationCode: `${name.toUpperCase()}-${SUFFIX}`,
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
  return tenant.id;
}

async function write(
  tenantId: string,
  overrides: Partial<{
    action: string;
    actorType: string;
    actorName: string;
    riskLevel: string;
    before: unknown;
    after: unknown;
    reason: string | null;
  }> = {},
) {
  return prisma.auditLog.create({
    data: {
      tenantId,
      actorId: "actor-1",
      actorType: (overrides.actorType ?? "TENANT_STAFF") as never,
      actorName: overrides.actorName ?? "Amira Hassan",
      targetType: "Tenant",
      targetId: tenantId,
      action: overrides.action ?? "work_order.created",
      riskLevel: (overrides.riskLevel ?? "LOW") as never,
      before: (overrides.before ?? null) as never,
      after: (overrides.after ?? null) as never,
      reason: overrides.reason === undefined ? "Because it needed doing" : overrides.reason,
    },
  });
}

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "Audit",
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

  mine = await makeTenant("Mine");
  theirs = await makeTenant("Theirs");
}, 180_000);

afterAll(async () => {
  for (const tenantId of [mine, theirs]) {
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  }
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 180_000);

describe("tenant isolation", () => {
  it("never returns another workshop's history", async () => {
    await write(mine, { action: "capability.changed" });
    await write(theirs, { action: "capability.changed", actorName: "Someone Else" });

    const page = await audit.list(mine);

    expect(page.rows.length).toBeGreaterThan(0);
    expect(page.rows.map((row) => row.actorName)).not.toContain("Someone Else");
  });
});

describe("the actor chip", () => {
  it("marks platform-authored rows, because those are the ones to ask about", async () => {
    await write(mine, { actorType: "PLATFORM", actorName: "platform-admin", action: "capability.changed" });

    const page = await audit.list(mine, { actorType: "PLATFORM" });

    expect(page.rows.length).toBeGreaterThan(0);
    expect(page.rows.every((row) => row.actorIsPlatform)).toBe(true);
  });

  it("does not mark a SYSTEM row as platform", async () => {
    // Both are "not somebody in this workshop", but only PLATFORM is a
    // person the owner might need to question.
    await write(mine, { actorType: "SYSTEM", actorName: "scheduler", action: "policy.expired" });

    const page = await audit.list(mine, { actorType: "SYSTEM" });

    expect(page.rows.every((row) => row.actorIsPlatform)).toBe(false);
  });
});

describe("categories are derived from the action", () => {
  it("maps the real action strings this codebase writes", () => {
    expect(categoryFor("capability.changed")).toBe("Builder");
    expect(categoryFor("work_order.created")).toBe("Workflow Policy");
    expect(categoryFor("finance.invoice.issued")).toBe("Pricing");
    // Landed in "Other" until the page was read against real data.
    expect(categoryFor("customer_decision.responded")).toBe("Workflow Policy");
  });

  it("falls back to Other rather than guessing", () => {
    expect(categoryFor("something.entirely.new")).toBe("Other");
  });

  it("filters by category using the prefixes that define it", async () => {
    await write(mine, { action: "finance.invoice.issued", riskLevel: "MEDIUM" });

    const page = await audit.list(mine, { category: "Pricing" });

    expect(page.rows.length).toBeGreaterThan(0);
    expect(page.rows.every((row) => row.category === "Pricing")).toBe(true);
  });

  it("offers only the categories this workshop actually has", async () => {
    // A filter whose options return nothing teaches people it is broken.
    const page = await audit.list(mine);

    expect(page.categories.length).toBeGreaterThan(0);
    for (const category of page.categories) {
      const filtered = await audit.list(mine, { category });
      expect(filtered.rows.length).toBeGreaterThan(0);
    }
  });
});

describe("the diff", () => {
  it("flags a row that actually changed something", async () => {
    const row = await write(mine, {
      action: "capability.changed",
      before: { INVENTORY: "ENABLED" },
      after: { INVENTORY: "DISABLED" },
    });

    const page = await audit.list(mine);
    const found = page.rows.find((candidate) => candidate.id === row.id);

    expect(found?.hasDiff).toBe(true);
    expect(found?.before).toEqual({ INVENTORY: "ENABLED" });
  });

  it("does not offer an expand control for a bare event", async () => {
    // A row with neither before nor after has nothing to show, and a
    // control that opens an empty panel is worse than no control.
    const row = await write(mine, { action: "work_order.created", before: null, after: null });

    const page = await audit.list(mine);
    const found = page.rows.find((candidate) => candidate.id === row.id);

    expect(found?.hasDiff).toBe(false);
  });

  it("counts a creation as a change, since an after with no before is real", async () => {
    const row = await write(mine, { action: "staff.created", before: null, after: { role: "TECHNICIAN" } });

    const page = await audit.list(mine);
    expect(page.rows.find((candidate) => candidate.id === row.id)?.hasDiff).toBe(true);
  });
});

describe("paging", () => {
  it("returns a cursor only while more remain", async () => {
    for (let index = 0; index < 5; index += 1) await write(mine, { action: `staff.created` });

    const first = await audit.list(mine, { limit: 2 });
    expect(first.rows).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();

    const rest = await audit.list(mine, { limit: 500 });
    expect(rest.nextCursor).toBeNull();
  });

  it("does not repeat a row across pages", async () => {
    const first = await audit.list(mine, { limit: 3 });
    const second = await audit.list(mine, { limit: 3, cursor: first.nextCursor ?? undefined });

    const overlap = first.rows.filter((row) => second.rows.some((other) => other.id === row.id));
    expect(overlap).toEqual([]);
  });

  it("returns newest first, because history is read backwards", async () => {
    const page = await audit.list(mine, { limit: 10 });
    const times = page.rows.map((row) => new Date(row.createdAt).getTime());

    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });
});

describe("a missing reason", () => {
  it("comes back as null rather than an empty string, so the page can say nobody gave one", async () => {
    const row = await write(mine, { reason: null });

    const page = await audit.list(mine);
    expect(page.rows.find((candidate) => candidate.id === row.id)?.reason).toBeNull();
  });
});
