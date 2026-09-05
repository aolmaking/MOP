import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import type { SessionContext } from "@mop/shared";
import { SessionGuard } from "../../../identity/auth/session.guard";
import { CurrentSession } from "../../../identity/auth/current-session.decorator";
import { SpecializationService, type SpecializationKind } from "./specialization.service";

/**
 * Controller exposing workshop specialization definitions, forms, and
 * runtime assignments to organization staff.
 */
@Controller("organization/specializations")
@UseGuards(SessionGuard)
export class SpecializationController {
  constructor(private readonly specialization: SpecializationService) {}

  @Get("assigned")
  async getAssigned(@CurrentSession() session: SessionContext) {
    return this.specialization.assignedSpecializations(session.tenantId!);
  }

  @Get("context")
  async getContext(@CurrentSession() session: SessionContext) {
    return this.specialization.resolveSpecializationContext(session.tenantId!);
  }

  @Get("definitions")
  async listDefinitions(
    @CurrentSession() session: SessionContext,
    @Query("category") category?: string,
    @Query("kind") kind?: SpecializationKind,
  ) {
    return this.specialization.listDefinitions(session.tenantId!, category, kind);
  }

  @Get("cards")
  async listCards(
    @CurrentSession() session: SessionContext,
    @Query("category") category?: string,
  ) {
    return this.specialization.listDefinitions(session.tenantId!, category, "SERVICE_CARD");
  }

  @Get("forms")
  async listForms(
    @CurrentSession() session: SessionContext,
    @Query("category") category?: string,
  ) {
    return this.specialization.listDefinitions(session.tenantId!, category, "MEASUREMENT_FORM");
  }
}
