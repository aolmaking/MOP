import { PasswordResetService } from "./password-reset.service";
import { verifyPassword } from "./password.util";
import { sha256 } from "./token.util";

describe("PasswordResetService", () => {
  it("returns the same response while storing a hashed reset token for matching active accounts", async () => {
    const prisma = {
      account: {
        findMany: jest.fn().mockResolvedValue([{ id: "acct1" }]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new PasswordResetService(prisma as never);

    await expect(service.request("owner@example.com")).resolves.toEqual({ ok: true });

    expect(prisma.account.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ email: "owner@example.com" }, { phone: "owner@example.com" }],
          passwordHash: { not: null },
          status: { in: ["ACTIVE", "LOCKED"] },
        }),
      }),
    );
    const data = prisma.account.update.mock.calls[0][0].data;
    expect(data.passwordResetTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(data.passwordResetTokenExpiresAt).toBeInstanceOf(Date);
  });

  it("does not reveal that no account matched", async () => {
    const prisma = {
      account: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
    };
    const service = new PasswordResetService(prisma as never);

    await expect(service.request("nobody@example.com")).resolves.toEqual({ ok: true });
    expect(prisma.account.update).not.toHaveBeenCalled();
  });

  it("sets the new password, clears the token and unlocks the account", async () => {
    const rawToken = "reset-token";
    const prisma = {
      account: {
        findFirst: jest.fn().mockResolvedValue({ id: "acct1" }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new PasswordResetService(prisma as never);

    await service.complete(rawToken, "new-password-123");

    expect(prisma.account.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ passwordResetTokenHash: sha256(rawToken), status: { in: ["ACTIVE", "LOCKED"] } }),
      }),
    );
    const data = prisma.account.update.mock.calls[0][0].data;
    expect(verifyPassword("new-password-123", data.passwordHash)).toBe(true);
    expect(data).toMatchObject({
      status: "ACTIVE",
      passwordResetTokenHash: null,
      passwordResetTokenExpiresAt: null,
      failedLoginCount: 0,
      lockedUntil: null,
    });
  });

  it("rejects invalid or expired reset tokens with one generic answer", async () => {
    const prisma = {
      account: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new PasswordResetService(prisma as never);

    await expect(service.describe("missing")).rejects.toMatchObject({
      response: { code: "password_reset_invalid" },
    });
  });
});
