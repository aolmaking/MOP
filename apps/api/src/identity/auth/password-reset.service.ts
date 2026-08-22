import { randomBytes } from "node:crypto";
import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../runtime/database/prisma.service";
import { hashPassword } from "./password.util";
import { sha256 } from "./token.util";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

@Injectable()
export class PasswordResetService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Starts password reset without account enumeration. The response is
   * identical whether a matching account exists. The raw token is not
   * returned from this public API; the future email/SMS delivery adapter
   * is the only place that should ever see it.
   */
  async request(identifier: string): Promise<{ ok: true }> {
    const trimmed = identifier.trim();
    if (trimmed.length < 3) return { ok: true };

    const accounts = await this.prisma.account.findMany({
      where: {
        OR: [{ email: trimmed }, { phone: trimmed }],
        passwordHash: { not: null },
        status: { in: ["ACTIVE", "LOCKED"] },
      },
      select: { id: true },
    });

    for (const account of accounts) {
      const rawToken = randomBytes(32).toString("hex");
      await this.prisma.account.update({
        where: { id: account.id },
        data: {
          passwordResetTokenHash: sha256(rawToken),
          passwordResetTokenExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
        },
      });
    }

    return { ok: true };
  }

  async describe(rawToken: string): Promise<{ ok: true }> {
    await this.findResettable(rawToken);
    return { ok: true };
  }

  async complete(rawToken: string, password: string): Promise<{ ok: true }> {
    if (password.length < 12) {
      throw new BadRequestException({
        code: "password_too_short",
        message: "Choose a password of at least 12 characters.",
      });
    }

    const account = await this.findResettable(rawToken);
    await this.prisma.account.update({
      where: { id: account.id },
      data: {
        passwordHash: hashPassword(password),
        status: "ACTIVE",
        passwordResetTokenHash: null,
        passwordResetTokenExpiresAt: null,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });

    return { ok: true };
  }

  private async findResettable(rawToken: string) {
    const token = rawToken?.trim();
    if (!token) throw this.invalid();

    const account = await this.prisma.account.findFirst({
      where: {
        passwordResetTokenHash: sha256(token),
        passwordResetTokenExpiresAt: { gt: new Date() },
        passwordHash: { not: null },
        status: { in: ["ACTIVE", "LOCKED"] },
      },
      select: { id: true },
    });

    if (!account) throw this.invalid();
    return account;
  }

  private invalid(): BadRequestException {
    return new BadRequestException({
      code: "password_reset_invalid",
      message: "This reset link is not valid any more. Request a new one.",
    });
  }
}
