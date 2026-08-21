import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { SessionGuard } from "../../../identity/auth/session.guard";
import { PlatformGuard } from "../../../identity/auth/platform.guard";
import { OnboardingService, type OnboardingBlueprint, type DraftValidationResponse } from "./onboarding.service";
import { ValidateDraftDto } from "./validate-draft.dto";

/**
 * What the onboarding experience reads before it can ask a single
 * question, and what it asks the server to check before it publishes.
 *
 * Two endpoints, deliberately:
 *
 *   GET  blueprint  -- the catalogue: every capability, policy,
 *                      specialization pack, country and stage, with the
 *                      copy and the derived consequences already
 *                      resolved. The browser never hardcodes any of it.
 *   POST validate   -- the same verdict the publish will give, before
 *                      the publish. So "why can't I publish?" is
 *                      answered on the review screen rather than by a
 *                      failed request.
 *
 * Both sit behind PlatformGuard: a workshop is created by Platform Super
 * Admin and by nobody else, which is why there is no public signup.
 */
@Controller("platform/onboarding")
@UseGuards(SessionGuard, PlatformGuard)
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  /**
   * The whole catalogue in one request.
   *
   * One call rather than five, because every stage needs some of it and
   * a wizard that fetches per stage shows a spinner at every transition
   * -- the exact place this experience is supposed to feel continuous.
   * It is registry data with no per-tenant content, so it is small,
   * cacheable and identical for every super admin.
   */
  @Get("blueprint")
  blueprint(): Promise<OnboardingBlueprint> {
    return this.onboarding.blueprint();
  }

  /**
   * The publish verdict, without publishing.
   *
   * Runs `validateDraft` -- literally the same function the browser
   * previews with and the creation path refuses with -- plus the two
   * checks only the server can make: whether the name, slug and owner
   * email are still free, and the selected plan's real ceilings.
   */
  @Post("validate")
  validate(@Body() dto: ValidateDraftDto): Promise<DraftValidationResponse> {
    return this.onboarding.validate(dto);
  }
}
