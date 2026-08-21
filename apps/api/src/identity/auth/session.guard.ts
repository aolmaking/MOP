import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import type { SessionContext } from "@mop/shared";
import { AuthService } from "./auth.service";
import { ACCESS_COOKIE_NAME } from "./cookie.util";

export interface RequestWithSession extends Request {
  session: SessionContext;
}

/**
 * Resolves the access cookie into a real SessionContext against the
 * database on every request -- never trusts anything client-decoded.
 * Attaches the result to `request.session` for downstream guards/handlers.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithSession>();
    const cookieValue = request.cookies?.[ACCESS_COOKIE_NAME] as string | undefined;

    try {
      request.session = await this.authService.getSessionContext(cookieValue);
      return true;
    } catch {
      throw new UnauthorizedException("Not authenticated");
    }
  }
}
