import { Controller, ForbiddenException, Get, UseGuards } from "@nestjs/common";
import type { SessionContext } from "@mop/shared";
import { SessionGuard } from "../auth/session.guard";
import { CurrentSession } from "../auth/current-session.decorator";
import { EffectiveAccessService } from "../access/effective-access.service";
import { AttentionQueueService, type AttentionItem } from "./attention-queue.service";

export interface AttentionCenterResponse {
  /** Ranked most urgent first. Empty is a valid and desirable state. */
  readonly items: readonly AttentionItem[];
  /** Counts by kind, for the watch-list band. Derived from the same items, so the two can never disagree. */
  readonly counts: Readonly<Record<string, number>>;
  readonly generatedAt: string;
}

@Controller("branch-manager")
@UseGuards(SessionGuard)
export class BranchManagerController {
  constructor(
    private readonly attentionQueue: AttentionQueueService,
    private readonly access: EffectiveAccessService,
  ) {}

  /**
   * Everything currently stuck in this manager's branches, ranked.
   *
   * Scope comes from the session, never from a query parameter: a
   * client-supplied branch id would let anyone widen their own view, and
   * "which branches am I responsible for" is a server-side fact.
   */
  @Get("attention")
  async attention(@CurrentSession() session: SessionContext): Promise<AttentionCenterResponse> {
    const allowed = await this.access.can(session, "workorders.branch.view");
    if (!allowed || !session.tenantId) {
      throw new ForbiddenException({
        code: "forbidden",
        message: "You do not have access to branch operations.",
      });
    }

    const items = await this.attentionQueue.build({
      tenantId: session.tenantId,
      branchScope: session.branchScope,
    });

    const counts: Record<string, number> = {};
    for (const item of items) counts[item.kind] = (counts[item.kind] ?? 0) + 1;

    return { items, counts, generatedAt: new Date().toISOString() };
  }
}
