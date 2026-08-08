import { BadRequestException, Controller, Get, Query, UseGuards } from "@nestjs/common";
import { PERMISSION_KEYS } from "@mop/shared";
import type { SessionContext } from "@mop/shared";
import { SessionGuard } from "../auth/session.guard";
import { CurrentSession } from "../auth/current-session.decorator";
import { EffectiveAccessService } from "./effective-access.service";
import type { LayerResult } from "./types";

/**
 * Lets the current session ask "can I do X" for itself -- this is what
 * Phase 2+ pages call to decide what to show (nav items, buttons), and
 * what proves the SessionGuard -> EffectiveAccessService chain is really
 * wired end to end, not just correct in isolated unit tests. Answering
 * for your OWN session isn't sensitive: it's exactly what a UI needs to
 * render correctly, and the server still enforces the real check on the
 * actual action regardless of what this reports.
 */
@Controller("access")
@UseGuards(SessionGuard)
export class AccessController {
  constructor(private readonly effectiveAccess: EffectiveAccessService) {}

  @Get("check")
  // async on purpose, even though the body could be written without it:
  // a bare `throw` in a non-async method throws synchronously, which
  // Nest's HTTP pipeline handles fine but a direct unit-test call does
  // not -- callers of this method should always get a rejected promise,
  // never a mix of "sometimes throws, sometimes rejects".
  async check(@Query("key") key: string, @CurrentSession() session: SessionContext): Promise<LayerResult> {
    if (!key || !(PERMISSION_KEYS as readonly string[]).includes(key)) {
      throw new BadRequestException({ code: "unknown_permission_key", message: `"${key}" is not a registered permission key` });
    }

    return this.effectiveAccess.check(session, key);
  }
}
