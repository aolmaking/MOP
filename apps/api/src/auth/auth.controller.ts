import { Body, Controller, Get, Headers, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { RequestWithSession } from "../tenancy/session-context";
import { AcceptInvitationDto, CustomerRegisterDto, LoginDto } from "./dto";
import { SessionGuard } from "./session.guard";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("login")
  login(@Body() dto: LoginDto, @Req() req: RequestWithSession) {
    const request = req as any;
    return this.auth.login(dto, {
      userAgent: String(request.headers?.["user-agent"] || "").slice(0, 500),
      ipAddress: String(request.ip || request.headers?.["x-forwarded-for"] || "").split(",")[0].trim().slice(0, 80)
    });
  }

  @Post("register/customer")
  registerCustomer(@Body() dto: CustomerRegisterDto) {
    return this.auth.registerCustomer(dto);
  }

  @Get("invitations/:token")
  invitationInfo(@Param("token") token: string) {
    return this.auth.invitationInfo(token);
  }

  @Post("invitations/accept")
  acceptInvitation(@Body() dto: AcceptInvitationDto) {
    return this.auth.acceptInvitation(dto);
  }

  @Post("logout")
  logout(@Headers("authorization") authorization?: string) {
    return this.auth.logout(String(authorization || "").replace(/^Bearer\s+/i, ""));
  }

  @Get("me")
  @UseGuards(SessionGuard)
  me(@Req() req: RequestWithSession) {
    return req.session;
  }
}
