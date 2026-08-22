import { Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, Post, Req, Res, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import type { SessionContext } from "@mop/shared";
import { readThrottleSettings } from "../../runtime/config/environment";
import { AuthService, MultipleAccountsError, TenantUnavailableError } from "./auth.service";
import { AcceptInviteDto, CompletePasswordResetDto, InviteTokenDto, LoginDto, PasswordResetRequestDto, PasswordResetTokenDto } from "./dto";
import { InviteService } from "./invite.service";
import { PasswordResetService } from "./password-reset.service";
import { ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME, clearSessionCookies, setSessionCookies } from "./cookie.util";
import { SessionGuard } from "./session.guard";
import { CurrentSession } from "./current-session.decorator";

/**
 * Read once at class-definition time because @Throttle is a decorator and
 * needs literal values. Limits come from the validated environment so
 * production can be strict while the integration suite -- which
 * legitimately logs in many times from one address -- can be relaxed.
 */
const throttle = readThrottleSettings();
const AUTH_THROTTLE = { default: { limit: throttle.authLimit, ttl: throttle.authTtlMs } };

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly inviteService: InviteService,
    private readonly passwordResetService: PasswordResetService,
  ) {}

  /**
   * Throttled hard. Password verification is scrypt at N=131072 -- around
   * 128MB and real CPU per attempt -- so without a limit here, a few dozen
   * concurrent requests exhaust the server. The per-account lockout in
   * AuthService handles targeted guessing; this handles the resource
   * exhaustion that lockout alone cannot, since an attacker can burn CPU
   * with addresses that do not exist.
   */
  @Post("login")
  @Throttle(AUTH_THROTTLE)
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response): Promise<SessionContext> {
    try {
      const { context, cookies } = await this.authService.login(dto.email, dto.password);
      setSessionCookies(res, cookies);
      return context;
    } catch (error) {
      // TenantUnavailableError/MultipleAccountsError are plain domain
      // errors, not HttpExceptions -- ApiExceptionFilter only special-cases
      // HttpException, so they must be translated here or they fall into
      // the filter's catch-all and come back as a generic 500. This is the
      // only place that HTTP-status mapping belongs; the service stays
      // transport-agnostic.
      if (error instanceof TenantUnavailableError) {
        throw new ForbiddenException({
          code: "tenant_unavailable",
          message: "This workshop is currently unavailable. Contact your workshop owner or platform support.",
        });
      }
      if (error instanceof MultipleAccountsError) {
        throw new ConflictException({
          code: "multiple_accounts_found",
          message: "This email or phone is used at more than one workshop. Contact support to sign in.",
        });
      }
      throw error;
    }
  }

  @Post("refresh")
  @Throttle(AUTH_THROTTLE)
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<SessionContext> {
    const refreshCookie = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    const { context, cookies } = await this.authService.refresh(refreshCookie);
    setSessionCookies(res, cookies);
    return context;
  }

  @Post("logout")
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<{ ok: true }> {
    const accessCookie = req.cookies?.[ACCESS_COOKIE_NAME] as string | undefined;
    await this.authService.logout(accessCookie);
    clearSessionCookies(res);
    return { ok: true };
  }

  @Get("me")
  @UseGuards(SessionGuard)
  me(@CurrentSession() session: SessionContext): SessionContext {
    return session;
  }

  /**
   * Who is this invitation for?
   *
   * Public by necessity -- the recipient has no account yet -- and
   * throttled for the same reason login is: a token is a secret, and an
   * unthrottled lookup is an offer to enumerate them.
   */
  @Post("invite/describe")
  @Throttle(AUTH_THROTTLE)
  @HttpCode(200)
  describeInvite(@Body() dto: InviteTokenDto) {
    return this.inviteService.describe(dto.token);
  }

  /**
   * Redeem it: set a password and activate the account.
   *
   * Deliberately does not sign the person in. Redeeming and signing in
   * are separate acts, and typing the new password once at the login
   * screen is the moment it becomes memorable.
   */
  @Post("invite/accept")
  @Throttle(AUTH_THROTTLE)
  @HttpCode(200)
  acceptInvite(@Body() dto: AcceptInviteDto) {
    return this.inviteService.accept(dto.token, dto.password);
  }

  @Post("password-reset/request")
  @Throttle(AUTH_THROTTLE)
  @HttpCode(200)
  requestPasswordReset(@Body() dto: PasswordResetRequestDto) {
    return this.passwordResetService.request(dto.identifier);
  }

  @Post("password-reset/describe")
  @Throttle(AUTH_THROTTLE)
  @HttpCode(200)
  describePasswordReset(@Body() dto: PasswordResetTokenDto) {
    return this.passwordResetService.describe(dto.token);
  }

  @Post("password-reset/complete")
  @Throttle(AUTH_THROTTLE)
  @HttpCode(200)
  completePasswordReset(@Body() dto: CompletePasswordResetDto) {
    return this.passwordResetService.complete(dto.token, dto.password);
  }
}
