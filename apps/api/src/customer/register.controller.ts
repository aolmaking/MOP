import { Body, Controller, Get, HttpCode, Post, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { readThrottleSettings } from "../config/environment";
import { RegisterCustomerService } from "./register.service";
import { RegisterCustomerDto } from "./register.dto";

const throttle = readThrottleSettings();
/** A workshop-code probe or a registration flood is exactly the auth-limit shape, not the general API limit. */
const REGISTER_THROTTLE = { default: { limit: throttle.authLimit, ttl: throttle.authTtlMs } };

/**
 * Register as Customer, per docs/detailed-specs/shared-system-pages.md.
 *
 * **No `SessionGuard`, and that is deliberate**, same reasoning as
 * `CustomerDecisionController`: this is the one public self-registration
 * path in the whole product, mounted under `/public/` so the absence of
 * a guard is visible from the route itself.
 */
@Controller("public/register")
export class RegisterController {
  constructor(private readonly register: RegisterCustomerService) {}

  /** Resolves a workshop code before the rest of the form even enables -- a separate call, not folded into submit. */
  @Get("workshop")
  @Throttle(REGISTER_THROTTLE)
  async workshop(@Query("code") code: string) {
    return this.register.resolveWorkshop(code);
  }

  @Post()
  @Throttle(REGISTER_THROTTLE)
  @HttpCode(201)
  async create(@Body() dto: RegisterCustomerDto) {
    return this.register.register(dto);
  }
}
