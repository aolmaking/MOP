import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { CAPABILITY_REGISTRY, type CapabilityKey, type CapabilityStatus } from "@mop/shared";
import type { SessionContext } from "@mop/shared";
import { SessionGuard } from "../../auth/session.guard";
import { PlatformGuard } from "../../auth/platform.guard";
import { CurrentSession } from "../../auth/current-session.decorator";
import { CapabilityChangeService, type CapabilityImpactPreview } from "../../capabilities/capability-change.service";
import { CapabilityResolutionService } from "../../capabilities/capability-resolution.service";
import { CapabilityChangeDto, CapabilityApplyDto } from "./capability-change.dto";

export interface CapabilityRow {
  readonly key: CapabilityKey;
  readonly status: CapabilityStatus;
  readonly owningSystem: string;
  readonly dependencies: readonly string[];
  readonly reversible: boolean;
  /**
   * False for core capabilities, which carry no removal policy at all.
   * Surfaced rather than hidden: "this cannot be switched off" is a
   * different statement from "switching it off would be disruptive", and
   * a UI that showed a toggle for both would lie about one of them.
   */
  readonly removable: boolean;
  /** What removal does to the workflow, in the registry's own words. */
  readonly behaviorOnRemoval: string | null;
}

/**
 * Shaping a workshop.
 *
 * Same prefix convention as WorkshopsController: every route is suffixed,
 * never a bare /:id, so it can never swallow a literal sibling route.
 *
 * The endpoints are deliberately three, not one. Preview changes nothing
 * and can be called as often as the UI likes; apply re-validates from
 * scratch rather than trusting a preview the caller is holding, because
 * the two are separate requests and the workshop may have moved between
 * them.
 */
@Controller("platform/workshops")
@UseGuards(SessionGuard, PlatformGuard)
export class CapabilitiesController {
  constructor(
    private readonly changes: CapabilityChangeService,
    private readonly resolution: CapabilityResolutionService,
  ) {}

  @Get(":id/capabilities")
  async current(@Param("id") id: string): Promise<{ capabilities: readonly CapabilityRow[] }> {
    const profile = await this.resolution.resolveCurrent(id);

    // Driven off the registry, not off whatever rows happen to exist. A
    // capability with no stored row still has a real effective status,
    // and a UI built from stored rows alone would simply not show it.
    const capabilities = [...CAPABILITY_REGISTRY.values()].map((definition) => ({
      key: definition.key,
      status: profile[definition.key] ?? "ENABLED",
      owningSystem: definition.owningSystem,
      dependencies: definition.dependencies,
      reversible: definition.reversible,
      removable: definition.removal !== null,
      behaviorOnRemoval: definition.removal?.behavior ?? null,
    }));

    return { capabilities };
  }

  /** What would happen. Changes nothing; safe to call on every toggle. */
  @Post(":id/capabilities/preview")
  preview(@Param("id") id: string, @Body() dto: CapabilityChangeDto): Promise<CapabilityImpactPreview> {
    return this.changes.preview(id, dto.changes, { isPlatform: true });
  }

  @Post(":id/capabilities/apply")
  async apply(
    @Param("id") id: string,
    @Body() dto: CapabilityApplyDto,
    @CurrentSession() session: SessionContext,
  ): Promise<{ ok: true }> {
    await this.changes.apply(
      id,
      dto.changes,
      { accountId: session.accountId, displayName: session.displayName, isPlatform: true },
      dto.reason,
    );
    return { ok: true };
  }
}
