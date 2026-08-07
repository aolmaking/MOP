import { Injectable, UnauthorizedException } from "@nestjs/common";
import type { EffectiveRole, SessionContext } from "@mop/shared";
import { PrismaService } from "../database/prisma.service";
import { dummyVerifyForTimingSafety, hashPassword, verifyPassword } from "./password.util";
import { issueToken, newSessionId, parseToken, secretMatchesHash } from "./token.util";

export const LOCKOUT_THRESHOLD = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
export const ACCESS_TOKEN_TTL_MS = 20 * 60 * 1000;
export const REFRESH_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000;

const LANDING_PAGES: Record<EffectiveRole, string> = {
  PLATFORM_SUPER_ADMIN: "platform-workshops",
  TENANT_OWNER: "owner-home",
  TENANT_ADMIN: "owner-home",
  BRANCH_MANAGER: "branch-home",
  TECHNICIAN: "technician-home",
  INVENTORY_MANAGER: "inventory-home",
  TEAM_LEADER: "team-leader-home",
  DATA_ANALYST: "analytics-home",
  CUSTOMER: "customer-portal-home",
};

/** Tenant statuses that block login outright -- see docs/PRODUCT_SPEC_CANONICAL.md. */
const LOGIN_BLOCKED_TENANT_STATUSES = new Set(["FROZEN", "SUSPENDED", "ARCHIVED", "PENDING_SETUP"]);

export class TenantUnavailableError extends Error {
  constructor() {
    super("tenant_unavailable");
  }
}

export class MultipleAccountsError extends Error {
  constructor() {
    super("multiple_accounts_found");
  }
}

export interface IssuedCookiePair {
  accessToken: { value: string; maxAgeMs: number };
  refreshToken: { value: string; maxAgeMs: number };
}

export interface LoginResult {
  context: SessionContext;
  cookies: IssuedCookiePair;
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async login(email: string, password: string): Promise<LoginResult> {
    const accounts = await this.prisma.account.findMany({ where: { email } });

    if (accounts.length === 0) {
      dummyVerifyForTimingSafety();
      throw new UnauthorizedException("Incorrect email or password");
    }

    const matches = accounts.filter((account) => account.passwordHash && verifyPassword(password, account.passwordHash));

    if (matches.length === 0) {
      // At least one real scrypt verify already ran above for every
      // candidate account, so no separate dummy verify is needed here --
      // timing is already comparable to the single-account case.
      await this.recordFailedAttempt(accounts);
      throw new UnauthorizedException("Incorrect email or password");
    }

    if (matches.length > 1) {
      // Same email under more than one tenant, and the password happens to
      // match more than one -- genuinely ambiguous. Never guess; the
      // frontend surfaces a "which workshop?" step (not a role picker).
      throw new MultipleAccountsError();
    }

    const account = matches[0];
    this.assertAccountUsable(account);

    if (account.status === "LOCKED" && account.lockedUntil && account.lockedUntil > new Date()) {
      throw new UnauthorizedException(
        `This account is temporarily locked. Try again in ${this.minutesRemaining(account.lockedUntil)} minutes.`,
      );
    }

    await this.prisma.account.update({
      where: { id: account.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });

    const context = await this.resolveContextForAccount(account.id);
    if (context.tenantStatus && LOGIN_BLOCKED_TENANT_STATUSES.has(context.tenantStatus)) {
      throw new TenantUnavailableError();
    }

    const cookies = await this.createSession(account.id, context.tenantId);
    return { context, cookies };
  }

  async refresh(refreshCookieValue: string | undefined): Promise<LoginResult> {
    const parsed = parseToken(refreshCookieValue);
    if (!parsed) throw new UnauthorizedException("No refresh session");

    const session = await this.prisma.session.findUnique({ where: { id: parsed.sessionId } });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt < new Date() ||
      !session.refreshTokenHash ||
      !secretMatchesHash(parsed.secret, session.refreshTokenHash)
    ) {
      throw new UnauthorizedException("Refresh session is no longer valid");
    }

    const context = await this.resolveContextForAccount(session.accountId);
    if (context.tenantStatus && LOGIN_BLOCKED_TENANT_STATUSES.has(context.tenantStatus)) {
      throw new TenantUnavailableError();
    }

    const cookies = await this.rotateSession(session.id);
    return { context, cookies };
  }

  async logout(accessCookieValue: string | undefined): Promise<void> {
    const parsed = parseToken(accessCookieValue);
    if (!parsed) return;
    await this.prisma.session
      .updateMany({
        where: { id: parsed.sessionId, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .catch(() => undefined);
  }

  async getSessionContext(accessCookieValue: string | undefined): Promise<SessionContext> {
    const parsed = parseToken(accessCookieValue);
    if (!parsed) throw new UnauthorizedException("Not authenticated");

    const session = await this.prisma.session.findUnique({ where: { id: parsed.sessionId } });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt < new Date() ||
      !secretMatchesHash(parsed.secret, session.accessSecretHash)
    ) {
      throw new UnauthorizedException("Not authenticated");
    }

    return this.resolveContextForAccount(session.accountId);
  }

  // ---------------------------------------------------------------------

  private assertAccountUsable(account: { status: string }): void {
    if (account.status === "SUSPENDED" || account.status === "INACTIVE") {
      throw new UnauthorizedException("This account has been deactivated. Contact your workshop owner.");
    }
    if (account.status === "INVITED") {
      throw new UnauthorizedException("This account hasn't been activated yet. Check your invite email.");
    }
  }

  private minutesRemaining(until: Date): number {
    return Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60000));
  }

  private async recordFailedAttempt(candidates: { id: string; failedLoginCount: number }[]): Promise<void> {
    // Only one candidate in the overwhelmingly common (single-tenant-email)
    // case; incrementing all candidates in the rare multi-account case is
    // deliberately conservative (never leaves an unlocked path).
    for (const account of candidates) {
      const failedLoginCount = account.failedLoginCount + 1;
      const lockedUntil = failedLoginCount >= LOCKOUT_THRESHOLD ? new Date(Date.now() + LOCKOUT_DURATION_MS) : null;
      await this.prisma.account.update({
        where: { id: account.id },
        data: {
          failedLoginCount,
          status: lockedUntil ? "LOCKED" : undefined,
          lockedUntil,
        },
      });
    }
  }

  private async createSession(accountId: string, tenantId: string | null): Promise<IssuedCookiePair> {
    const sessionId = newSessionId();
    const access = issueToken(sessionId);
    const refresh = issueToken(sessionId);

    await this.prisma.session.create({
      data: {
        id: sessionId,
        accountId,
        tenantId,
        accessSecretHash: access.secretHash,
        refreshTokenHash: refresh.secretHash,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });

    return {
      accessToken: { value: access.cookieValue, maxAgeMs: ACCESS_TOKEN_TTL_MS },
      refreshToken: { value: refresh.cookieValue, maxAgeMs: REFRESH_TOKEN_TTL_MS },
    };
  }

  /** Rotates both secrets and slides the session's absolute expiry forward. */
  private async rotateSession(sessionId: string): Promise<IssuedCookiePair> {
    const access = issueToken(sessionId);
    const refresh = issueToken(sessionId);

    await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        accessSecretHash: access.secretHash,
        refreshTokenHash: refresh.secretHash,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });

    return {
      accessToken: { value: access.cookieValue, maxAgeMs: ACCESS_TOKEN_TTL_MS },
      refreshToken: { value: refresh.cookieValue, maxAgeMs: REFRESH_TOKEN_TTL_MS },
    };
  }

  private async resolveContextForAccount(accountId: string): Promise<SessionContext> {
    const account = await this.prisma.account.findUniqueOrThrow({
      where: { id: accountId },
      include: { staff: true, customer: true },
    });

    if (account.accountType === "PLATFORM") {
      return {
        accountId: account.id,
        accountType: "PLATFORM",
        tenantId: null,
        role: "PLATFORM_SUPER_ADMIN",
        branchScope: [],
        warehouseScope: [],
        categoryScope: [],
        teamScope: [],
        managedTechnicianIds: [],
        permissions: [],
        enabledModules: [],
        enabledFeatures: [],
        tenantStatus: null,
        landingPage: LANDING_PAGES.PLATFORM_SUPER_ADMIN,
      };
    }

    if (account.accountType === "TENANT_STAFF" && account.staff) {
      const staff = account.staff;
      const tenant = await this.prisma.tenant.findUniqueOrThrow({
        where: { id: staff.tenantId },
        include: { configuration: true },
      });

      const managedTechnicianIds =
        staff.role === "TEAM_LEADER" ? await this.resolveManagedTechnicianIds(staff.id) : [];

      return {
        accountId: account.id,
        accountType: "TENANT_STAFF",
        tenantId: tenant.id,
        role: staff.role as EffectiveRole,
        staffUserId: staff.id,
        branchScope: staff.branchScope,
        warehouseScope: staff.warehouseScope,
        categoryScope: staff.categoryScope,
        teamScope: [],
        managedTechnicianIds,
        permissions: [],
        enabledModules: tenant.configuration?.enabledModules ?? [],
        enabledFeatures: tenant.configuration?.enabledFeatures ?? [],
        tenantStatus: tenant.status,
        landingPage: LANDING_PAGES[staff.role as EffectiveRole],
      };
    }

    if (account.accountType === "CUSTOMER" && account.customer) {
      const customer = account.customer;
      const tenant = await this.prisma.tenant.findUniqueOrThrow({
        where: { id: customer.tenantId },
        include: { configuration: true },
      });

      return {
        accountId: account.id,
        accountType: "CUSTOMER",
        tenantId: tenant.id,
        role: "CUSTOMER",
        customerId: customer.id,
        branchScope: [],
        warehouseScope: [],
        categoryScope: [],
        teamScope: [],
        managedTechnicianIds: [],
        permissions: [],
        enabledModules: tenant.configuration?.enabledModules ?? [],
        enabledFeatures: tenant.configuration?.enabledFeatures ?? [],
        tenantStatus: tenant.status,
        landingPage: LANDING_PAGES.CUSTOMER,
      };
    }

    throw new UnauthorizedException("Not authenticated");
  }

  private async resolveManagedTechnicianIds(teamLeaderStaffId: string): Promise<string[]> {
    const teams = await this.prisma.team.findMany({
      where: { teamLeaderId: teamLeaderStaffId, isActive: true },
      select: { id: true },
    });
    if (teams.length === 0) return [];

    const memberships = await this.prisma.teamMembership.findMany({
      where: { teamId: { in: teams.map((t) => t.id) }, endedAt: null },
      select: { technicianId: true },
    });
    return memberships.map((m) => m.technicianId);
  }

  hashPassword(password: string): string {
    return hashPassword(password);
  }
}
