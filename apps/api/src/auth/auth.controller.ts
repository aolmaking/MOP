import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from "@nestjs/common";
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
      if (error instanceof TenantUnavailableError) {
        res.status(403);
        throw error;
      }
      if (error instanceof MultipleAccountsError) {
        res.status(409);
        throw error;
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
