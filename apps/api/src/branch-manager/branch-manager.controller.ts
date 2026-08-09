import { BadRequestException, Body, Controller, ForbiddenException, Get, Post, Query, UseGuards } from "@nestjs/common";
import type { SessionContext } from "@mop/shared";
import { SessionGuard } from "../auth/session.guard";
import { CurrentSession } from "../auth/current-session.decorator";
import { EffectiveAccessService } from "../access/effective-access.service";
import { AttentionQueueService, type AttentionItem } from "./attention-queue.service";
import { IntakeLookupService, type IntakeLookupResult } from "./intake-lookup.service";
import { IntakeService, type IntakeResult } from "../operations/intake.service";
import { IntakeDto } from "./intake.dto";
import { PrismaService } from "../database/prisma.service";

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
    private readonly intakeLookup: IntakeLookupService,
    private readonly intake: IntakeService,
    private readonly prisma: PrismaService,
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

  /**
   * The single search behind intake's first field. One query covers phone,
   * name and plate because the advisor types what the customer just said
   * without first classifying it.
   */
  @Get("intake/search")
  async intakeSearch(
    @CurrentSession() session: SessionContext,
    @Query("q") query = "",
  ): Promise<IntakeLookupResult> {
    await this.requireIntake(session);
    return this.intakeLookup.search(session.tenantId as string, query);
  }

  /**
   * The branches this person may book work into. Returned rather than
   * assumed, because a manager scoped to one branch must not be shown a
   * choice they cannot make, and a tenant-wide manager must be given one.
   */
  @Get("intake/branches")
  async intakeBranches(@CurrentSession() session: SessionContext) {
    await this.requireIntake(session);
    const branches = await this.prisma.branch.findMany({
      where: {
        tenantId: session.tenantId as string,
        ...(session.branchScope.length > 0 ? { id: { in: session.branchScope } } : {}),
      },
      select: { id: true, name: true, code: true },
      orderBy: { code: "asc" },
    });
    return { branches };
  }

  /**
   * Book a vehicle in. The service is transactional and refuses a silent
   * ownership transfer; this endpoint adds only the access check and the
   * branch-scope check, so the two cannot drift apart.
   */
  @Post("intake")
  async createIntake(@CurrentSession() session: SessionContext, @Body() dto: IntakeDto): Promise<IntakeResult> {
    await this.requireIntake(session);

    // Branch scope is enforced here rather than trusted from the body: a
    // client-supplied branch id would otherwise let a scoped manager book
    // work into a branch they do not cover.
    if (session.branchScope.length > 0 && !session.branchScope.includes(dto.branchId)) {
      throw new ForbiddenException({
        code: "branch_out_of_scope",
        message: "You cannot book work into that branch.",
      });
    }

    if (!dto.customer.existingCustomerId && !dto.customer.fullName) {
      throw new BadRequestException({
        code: "customer_required",
        message: "Choose an existing customer or enter a new one.",
      });
    }

    return this.intake.intake(
      {
        tenantId: session.tenantId as string,
        branchId: dto.branchId,
        customer: dto.customer,
        asset: dto.asset,
        complaint: dto.complaint,
        inspectionDeclined: dto.inspectionDeclined ?? false,
        confirmOwnershipTransfer: dto.confirmOwnershipTransfer ?? false,
      },
      {
        accountId: session.accountId,
        displayName: session.displayName,
        actorType: "TENANT_STAFF",
      },
    );
  }

  /** One place for the check, so every intake route agrees about it. */
  private async requireIntake(session: SessionContext): Promise<void> {
    const allowed = await this.access.can(session, "customer.intake.create");
    if (!allowed || !session.tenantId) {
      throw new ForbiddenException({
        code: "forbidden",
        message: "You do not have access to book vehicles in.",
      });
    }
  }
}
