import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { RequestWithSession } from "./session.guard";

/**
 * Gates platform-only endpoints (e.g. creating a workshop). Deliberately
 * does NOT go through EffectiveAccessService: that 8-layer resolver exists
 * to answer "which tenant-scoped permission does this role have", and
 * every layer in it defers (returns null) when there's no tenantId --
 * which is always true for a platform session. Platform Super Admin isn't
 * a tenant-scoped role with a nuanced permission set; per the product
 * spec it has unconditional control over every workshop, so its check is
 * intentionally this simple: are you a platform account, yes or no.
 *
 * Must run after SessionGuard (needs request.session already attached).
 */
@Injectable()
export class PlatformGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithSession>();

    if (request.session.accountType !== "PLATFORM") {
      throw new ForbiddenException({ code: "forbidden", message: "Platform access only" });
    }

    return true;
  }
}
