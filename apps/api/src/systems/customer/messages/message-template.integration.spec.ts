/**
 * Messages & Templates, against a real database.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { PrismaClient } from "@mop/database";
import { AuditService } from "../../../audit/audit.service";
import { MessageTemplateService } from "./message-template.service";
import type { PrismaService } from "../../../runtime/database/prisma.service";

const prisma = new PrismaClient();
const asService = prisma as unknown as PrismaService;
const audit = new AuditService(asService);
const templates = new MessageTemplateService(asService, audit);

const SUFFIX = `msg-${Date.now()}`;
let tenantId: string;
let planId: string;
const actor = { accountId: "owner-account-id", displayName: "Test Owner" };

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "Msg Test",
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
      name: `Msg WS ${SUFFIX}`,
      nameNormalized: `msg ws ${SUFFIX}`,
      slug: `msg-ws-${SUFFIX}`,
      customerRegistrationCode: `MSG-${SUFFIX}`,
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
}, 120_000);

afterAll(async () => {
  await prisma.messageTemplate.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 120_000);

describe("MessageTemplateService", () => {
  it("lists all 8 templates with a real platform-default body before anything is published", async () => {
    const list = await templates.list(tenantId);
    expect(list).toHaveLength(8);
    expect(list.every((t) => t.body.trim().length > 0)).toBe(true);
    expect(list.every((t) => !t.isPublished)).toBe(true);
  });

  it("refuses to publish a body missing a required variable", async () => {
    await expect(
      templates.publish(tenantId, "PAYMENT_PENDING", "Hi {{customer_name}}, please pay.", actor),
    ).rejects.toMatchObject({ status: 400, response: { code: "missing_required_variable" } });
  });

  it("publishes, and each edit creates a new immutable version rather than mutating the current one", async () => {
    const v1 = await templates.publish(
      tenantId,
      "REMINDER",
      "Hi {{customer_name}}, reminder about {{work_order_id}} at {{branch_name}}.",
      actor,
    );
    expect(v1.version).toBe(1);

    const v2 = await templates.publish(
      tenantId,
      "REMINDER",
      "Hello {{customer_name}}, don't forget {{work_order_id}} at {{branch_name}}!",
      actor,
    );
    expect(v2.version).toBe(2);

    // v1's exact body is still readable at its own version -- never rewritten.
    const historical = await prisma.messageTemplate.findUnique({
      where: { tenantId_templateKey_version: { tenantId, templateKey: "REMINDER", version: 1 } },
    });
    expect(historical?.body).toContain("Hi {{customer_name}}, reminder");

    const current = await templates.currentBody(tenantId, "REMINDER");
    expect(current.version).toBe(2);
    expect(current.body).toContain("Hello");
  });

  it("renders a published template against real data", async () => {
    await templates.publish(
      tenantId,
      "WAITING_PARTS",
      "Hi {{customer_name}}, {{work_order_id}} at {{branch_name}} is waiting on a part.",
      actor,
    );
    const current = await templates.currentBody(tenantId, "WAITING_PARTS");
    const rendered = templates.preview("WAITING_PARTS", current.body, {
      customer_name: "Omar",
      work_order_id: "WO-1",
      branch_name: "Main",
    });
    expect(rendered).toBe("Hi Omar, WO-1 at Main is waiting on a part.");
  });
});
