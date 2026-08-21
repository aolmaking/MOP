import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { readThrottleSettings } from "../runtime/config/environment";
import { CustomerDecisionService } from "./decision.service";
import { RespondDto } from "./decision.dto";

const throttle = readThrottleSettings();

/**
 * Token throttling, kept separate from the auth limit.
 *
 * A customer legitimately opens the link, reads it, thinks, and answers
 * -- a handful of requests over minutes. Anything beyond that is somebody
 * walking the token space, and a token is the only credential guarding a
 * real customer's prices.
 */
const TOKEN_THROTTLE = { default: { limit: throttle.authLimit, ttl: throttle.authTtlMs } };

/**
 * The public decision link.
 *
 * **No `SessionGuard`, and that is deliberate**, not an omission. The
 * spec is explicit: the WhatsApp link must open directly, and requiring a
 * login first would break the flow the whole feature exists for. The
 * token grants access to exactly one request and nothing else.
 *
 * Mounted under `/public/` so the absence of a guard is visible in the
 * URL. A route that skips authentication should be obvious from the path
 * rather than discoverable only by reading the decorators.
 */
@Controller("public/decisions")
export class CustomerDecisionController {
  constructor(private readonly decisions: CustomerDecisionService) {}

  @Get(":token")
  @Throttle(TOKEN_THROTTLE)
  read(@Param("token") token: string) {
    return this.decisions.read(token);
  }

  /**
   * The client sends `{ answers: [{ itemId, decision, warningAcknowledged,
   * note }] }` and nothing else. Price, quantity and item identity are
   * re-read server-side from the stored row -- there is no field here
   * through which they could be influenced.
   */
  @Post(":token/respond")
  @Throttle(TOKEN_THROTTLE)
  @HttpCode(200)
  respond(@Param("token") token: string, @Body() dto: RespondDto) {
    return this.decisions.respond(token, dto.answers);
  }
}
