import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../runtime/database/prisma.service";
import { hashPassword } from "./password.util";
import { sha256 } from "./token.util";

export interface InviteSummary {
  /** Enough to show who is being invited, and nothing more. */
  readonly email: string | null;
  readonly fullName: string | null;
  readonly workshopName: string | null;
}

/**
 * Redeeming an invite.
 *
 * This existed as a hole for four phases: Add Workshop wrote
 * `inviteTokenHash` and nothing ever read it, so every workshop owner the
 * product created was an account that could not log in. The platform
 * could create workshops nobody could enter.
 *
 * Two rules shape it.
 *
 * **The raw token is never stored.** Only its SHA-256, matching the
 * pattern session secrets already use. A database dump must not hand
 * somebody an owner account.
 *
 * **The token is consumed exactly once.** Clearing the hash in the same
 * transaction that sets the password is what makes a leaked or forwarded
 * invite link useless the moment it has been used.
 */
@Injectable()
export class InviteService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Who is this invite for?
   *
   * Deliberately says nothing about *why* a token failed -- expired,
   * already used, and never existed are one answer. Distinguishing them
   * would let someone probe for live invite tokens.
   */
  async describe(rawToken: string): Promise<InviteSummary> {
    const account = await this.findRedeemable(rawToken);

    const staff = await this.prisma.staffUser.findUnique({
      where: { accountId: account.id },
      select: { fullName: true, tenant: { select: { name: true } } },
    });

    return {
      email: account.email,
      fullName: staff?.fullName ?? null,
      workshopName: staff?.tenant.name ?? null,
    };
  }

  /**
   * Sets the password and activates the account, once.
   *
   * Does NOT log the person in. Redeeming an invite and signing in are
   * separate acts: the person should arrive at a login screen and use the
   * password they just chose, which is the moment it becomes memorable.
   */
  async accept(rawToken: string, password: string): Promise<{ email: string | null }> {
    if (password.length < 12) {
      // Matched to the seeded accounts' own standard. A workshop owner is
      // the highest-privilege account in a tenant.
      throw new BadRequestException({
        code: "password_too_short",
        message: "Choose a password of at least 12 characters.",
      });
    }

    const account = await this.findRedeemable(rawToken);

    await this.prisma.account.update({
      where: { id: account.id },
      data: {
        passwordHash: hashPassword(password),
        status: "ACTIVE",
        // Consumed. The link is dead from here, which is what stops a
        // forwarded invite email being a standing key to the workshop.
        inviteTokenHash: null,
        inviteTokenExpiresAt: null,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });

    return { email: account.email };
  }

  /**
   * One lookup, one failure message.
   *
   * The hash is matched in the query rather than by loading candidates
   * and comparing in code, so a token that does not exist costs the same
   * as one that does.
   */
  private async findRedeemable(rawToken: string) {
    const token = rawToken?.trim();
    if (!token) throw this.invalid();

    const account = await this.prisma.account.findFirst({
      where: {
        inviteTokenHash: sha256(token),
        status: "INVITED",
        inviteTokenExpiresAt: { gt: new Date() },
      },
      select: { id: true, email: true },
    });

    if (!account) throw this.invalid();
    return account;
  }

  private invalid(): BadRequestException {
    return new BadRequestException({
      code: "invite_invalid",
      message: "This invitation link is not valid any more. Ask the platform team for a new one.",
    });
  }
}
