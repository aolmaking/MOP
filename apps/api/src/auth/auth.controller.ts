import { Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import type { SessionContext } from "@mop/shared";
import { AuthService, MultipleAccountsError, TenantUnavailableError } from "./auth.service";
import { LoginDto } from "./dto";
import { ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME, clearSessionCookies, setSessionCookies } from "./cookie.util";
import { SessionGuard } from "./session.guard";
import { CurrentSession } from "./current-session.decorator";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
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
          message: "This email is used at more than one workshop. Contact support to sign in.",
        });
      }
      throw error;
    }
  }

  @Post("refresh")
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
}
