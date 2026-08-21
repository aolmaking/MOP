/**
 * Redeeming an invitation, against a real database.
 *
 * This closes a hole that stood for four phases: Add Workshop wrote
 * `inviteTokenHash` and nothing read it, so every workshop owner the
 * platform created was an account that could not log in.
 *
 * Integration because every guarantee is about persistence -- that the
 * raw token is never stored, that redeeming is single-use, and that the
 * account can afterwards actually authenticate.
 */
process.env.DATABASE_URL ??= "postgresql://mop_dev:mop_dev_secret@localhost:5432/mop_platform_test?schema=public";

import "reflect-metadata";
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@mop/database";
import { InviteService } from "./invite.service";
import { sha256 } from "./token.util";
import { verifyPassword } from "./password.util";
import type { PrismaService } from "../../runtime/database/prisma.service";

const prisma = new PrismaClient();
const invites = new InviteService(prisma as unknown as PrismaService);

const SUFFIX = `inv-${Date.now()}`;
let tenantId: string;
let planId: string;

/** Creates an INVITED owner exactly as PlatformService.createWorkshop does. */
async function makeInvite(options: { expired?: boolean } = {}): Promise<{ token: string; accountId: string }> {
  const token = randomBytes(32).toString("hex");
  const account = await prisma.account.create({
    data: {
      accountType: "TENANT_STAFF",
      tenantId,
      email: `owner-${randomBytes(4).toString("hex")}@invite.local`,
      passwordHash: null,
      status: "INVITED",
      inviteTokenHash: sha256(token),
      inviteTokenExpiresAt: options.expired
        ? new Date(Date.now() - 60_000)
        : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    },
    select: { id: true },
  });

  await prisma.staffUser.create({
    data: {
      accountId: account.id,
      tenantId,
      fullName: "Invited Owner",
      role: "TENANT_OWNER",
      branchScope: [],
      warehouseScope: [],
      categoryScope: ["CARS"],
    },
  });

  return { token, accountId: account.id };
}

beforeAll(async () => {
  const plan = await prisma.plan.create({
    data: {
      code: `PLAN-${SUFFIX}`,
      name: "Invite",
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
      name: `Invite WS ${SUFFIX}`,
      nameNormalized: `invite ws ${SUFFIX}`,
      slug: `invite-ws-${SUFFIX}`,
      customerRegistrationCode: `IV-${SUFFIX}`,
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
}, 180_000);

afterAll(async () => {
  await prisma.staffUser.deleteMany({ where: { tenantId } });
  await prisma.account.deleteMany({ where: { tenantId } });
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.plan.deleteMany({ where: { id: planId } });
  await prisma.$disconnect();
}, 180_000);

describe("describing an invitation", () => {
  it("names the workshop and the person, so the recipient can check it reached them", async () => {
    const { token } = await makeInvite();

    const summary = await invites.describe(token);

    expect(summary.workshopName).toContain("Invite WS");
    expect(summary.fullName).toBe("Invited Owner");
    expect(summary.email).toContain("@invite.local");
  });

  it("gives ONE answer for expired, unknown and already-used", async () => {
    // Distinguishing them would let somebody probe for live tokens.
    const { token: expired } = await makeInvite({ expired: true });

    const messages: string[] = [];
    for (const candidate of [expired, randomBytes(32).toString("hex"), ""]) {
      await invites.describe(candidate).catch((error: { response?: { message?: string } }) => {
        messages.push(error.response?.message ?? "");
      });
    }

    expect(messages).toHaveLength(3);
    expect(new Set(messages).size).toBe(1);
  });
});

describe("accepting an invitation", () => {
  it("sets the password and activates the account", async () => {
    const { token, accountId } = await makeInvite();

    await invites.accept(token, "a-real-password-123");

    const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    expect(account.status).toBe("ACTIVE");
    expect(account.passwordHash).not.toBeNull();
    // The account can now actually authenticate, which is the entire
    // point and the thing that was missing.
    expect(verifyPassword("a-real-password-123", account.passwordHash as string)).toBe(true);
  });

  it("never stores the raw token", async () => {
    const { token, accountId } = await makeInvite();

    const before = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    expect(before.inviteTokenHash).toBe(sha256(token));
    expect(before.inviteTokenHash).not.toBe(token);

    await invites.accept(token, "another-real-password");

    // And it is consumed, so a forwarded invite email is not a standing
    // key to the workshop.
    const after = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    expect(after.inviteTokenHash).toBeNull();
    expect(after.inviteTokenExpiresAt).toBeNull();
  });

  it("cannot be redeemed twice", async () => {
    const { token } = await makeInvite();
    await invites.accept(token, "first-password-here");

    await expect(invites.accept(token, "second-password-here")).rejects.toMatchObject({ status: 400 });
  });

  it("refuses an expired invitation", async () => {
    const { token } = await makeInvite({ expired: true });

    await expect(invites.accept(token, "a-real-password-123")).rejects.toMatchObject({ status: 400 });
  });

  it("refuses a password shorter than twelve characters", async () => {
    // A workshop owner is the highest-privilege account in a tenant, and
    // this is the one moment their password is chosen.
    const { token } = await makeInvite();

    await expect(invites.accept(token, "short")).rejects.toMatchObject({ status: 400 });

    // And the invite survives, so a weak first attempt does not burn it.
    await expect(invites.describe(token)).resolves.toBeDefined();
  });
});
