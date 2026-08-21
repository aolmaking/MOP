import { Controller, ForbiddenException, Get, Query, UseGuards } from "@nestjs/common";
import type { SessionContext } from "@mop/shared";
import { SessionGuard } from "../../identity/auth/session.guard";
import { CurrentSession } from "../../identity/auth/current-session.decorator";
import { EffectiveAccessService } from "../../identity/access/effective-access.service";
import { AuditQueryService, type AuditCategory, type AuditPage } from "./audit-query.service";

/**
 * Reading the audit log.
 *
 * The only route in this module, and deliberately read-only: the audit
 * boundary linter forbids writes outside `apps/api/src/audit/**`, and the
 * point of that rule is that entries are produced by the actions they
 * describe -- never by a controller somebody can call.
 */
@Controller("audit")
@UseGuards(SessionGuard)
export class AuditController {
  constructor(
    private readonly audit: AuditQueryService,
    private readonly access: EffectiveAccessService,
  ) {}

  @Get()
  async list(
    @CurrentSession() session: SessionContext,
    @Query("actorType") actorType?: string,
    @Query("category") category?: string,
    @Query("riskLevel") riskLevel?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("cursor") cursor?: string,
  ): Promise<AuditPage> {
    const allowed = await this.access.can(session, "audit.own_tenant.view");
    if (!allowed || !session.tenantId) {
      throw new ForbiddenException({
        code: "forbidden",
        message: "You do not have access to this workshop's history.",
      });
    }

    // Scoped to the session's own tenant, never to a parameter. "Whose
    // history is this" is a server-side fact.
    return this.audit.list(session.tenantId, {
      actorType,
      category: category as AuditCategory | undefined,
      riskLevel,
      from,
      to,
      cursor,
    });
  }
}
