import { Controller, ForbiddenException, Get, Param, Query, UseGuards } from "@nestjs/common";
import type { SessionContext } from "@mop/shared";
import { SessionGuard } from "../../identity/auth/session.guard";
import { CurrentSession } from "../../identity/auth/current-session.decorator";
import { EffectiveAccessService } from "../../identity/access/effective-access.service";
import { WorkshopHistoryService } from "../../systems/operations/history/workshop-history.service";
import type { OwnerHistoryIndex, OwnerHistoryRecord } from "../../systems/operations/history/workshop-history.types";
import { OwnerHistoryQueryDto } from "./history.dto";

/**
 * The Owner's complete workshop history.
 *
 * Two routes, not twenty: an index of every customer+vehicle that has
 * been through the workshop, and the full record behind one row. The
 * split exists for a real reason rather than tidiness -- the index has
 * to stay a page-sized read over a table that grows for the life of the
 * workshop, and the deep history is only ever wanted for one
 * relationship at a time.
 *
 * Read-only, and deliberately so. This module is the workshop's memory;
 * nothing here may change what it remembers.
 *
 * Scope comes from the session's own tenant and never from a parameter,
 * and the ids in the path are checked against that tenant before
 * anything is read -- an id from another workshop answers "not found",
 * exactly as if it did not exist.
 */
@Controller("owner/history")
@UseGuards(SessionGuard)
export class OwnerHistoryController {
  constructor(
    private readonly history: WorkshopHistoryService,
    private readonly access: EffectiveAccessService,
  ) {}

  @Get()
  async index(@CurrentSession() session: SessionContext, @Query() query: OwnerHistoryQueryDto): Promise<OwnerHistoryIndex> {
    const tenantId = await this.require(session);
    return this.history.ownerIndex(tenantId, query);
  }

  /**
   * The whole record behind one row.
   *
   * Keyed by the PAIR of ids because that is what a history is about:
   * this person, this vehicle. A vehicle that changed owners has two
   * histories and they must not be merged, and a customer with three
   * vehicles has three.
   */
  @Get(":customerId/:assetId")
  async record(
    @CurrentSession() session: SessionContext,
    @Param("customerId") customerId: string,
    @Param("assetId") assetId: string,
  ): Promise<OwnerHistoryRecord> {
    const tenantId = await this.require(session);
    return this.history.ownerRecord(tenantId, customerId, assetId);
  }

  /**
   * One check, both routes. Returning the tenant id from the same call
   * that authorises is what stops a route from being written that checks
   * the permission and then reads a tenant from somewhere else.
   */
  private async require(session: SessionContext): Promise<string> {
    const allowed = await this.access.can(session, "history.workshop.view");
    if (!allowed || !session.tenantId) {
      throw new ForbiddenException({
        code: "forbidden",
        message: "You do not have access to this workshop's history.",
      });
    }
    return session.tenantId;
  }
}
