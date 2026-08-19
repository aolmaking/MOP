import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Param, Post, Query, UseGuards } from "@nestjs/common";
import type { SessionContext } from "@mop/shared";
import { SessionGuard } from "../auth/session.guard";
import { CurrentSession } from "../auth/current-session.decorator";
import { EffectiveAccessService } from "../access/effective-access.service";
import { AttentionQueueService, type AttentionItem } from "./attention-queue.service";
import { IntakeLookupService, type IntakeLookupResult } from "./intake-lookup.service";
import { IntakeService, type IntakeResult } from "../operations/intake.service";
import { IntakeDto } from "./intake.dto";
import { PrismaService } from "../database/prisma.service";
import { WorkOrderBoardService, type BoardResult } from "./work-order-board.service";
import { ApprovalsService, type ApprovalsResult } from "./approvals.service";
import { DeliveryService, type DeliveryBoard } from "./delivery.service";
import { CustomerDecisionService } from "../customer/decision.service";
import { RecordDecisionDto } from "./record-decision.dto";
import { WorkOrderDossierService } from "../operations/work-order-dossier.service";

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
    private readonly boardService: WorkOrderBoardService,
    private readonly approvalsService: ApprovalsService,
    private readonly deliveryService: DeliveryService,
    private readonly customerDecisions: CustomerDecisionService,
    private readonly dossierService: WorkOrderDossierService,
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
        confirmNewCustomerDespitePhoneMatch: dto.confirmNewCustomerDespitePhoneMatch ?? false,
      },
      {
        accountId: session.accountId,
        displayName: session.displayName,
        actorType: "TENANT_STAFF",
      },
    );
  }

  /**
   * The board. Grouped by who is holding each job rather than by status,
   * because "whose move is it" is the question a manager actually asks --
   * see WORK_ORDER_LANES for why.
   */
  @Get("work-orders")
  async board(
    @CurrentSession() session: SessionContext,
    @Query("q") query?: string,
    @Query("includeFinished") includeFinished?: string,
  ): Promise<BoardResult> {
    await this.requireBranchView(session);
    return this.boardService.board(
      { tenantId: session.tenantId as string, branchScope: session.branchScope },
      { query, includeFinished: includeFinished === "true" },
    );
  }

  /** Everything about one job, assembled server-side in one call. */
  @Get("work-orders/:id")
  async workOrder(@CurrentSession() session: SessionContext, @Param("id") id: string) {
    await this.requireBranchView(session);
    return this.boardService.detail(
      { tenantId: session.tenantId as string, branchScope: session.branchScope },
      id,
    );
  }

  /**
   * Everything that happened to one job, in one call.
   *
   * Same read permission as the work order itself -- a dossier is a
   * reading of records the caller can already reach individually, so it
   * must not become a way around the branch scope that guards them. Cost
   * is the one exception: it needs inventory.cost.view on top, and is
   * absent from the response rather than hidden client-side when the
   * reader does not hold it.
   */
  @Get("work-orders/:id/dossier")
  async dossier(@CurrentSession() session: SessionContext, @Param("id") id: string) {
    await this.requireBranchView(session);
    const canViewCost = await this.access.can(session, "inventory.cost.view");
    return this.dossierService.build(session.tenantId as string, id, {
      branchScope: session.branchScope,
      canViewCost,
    });
  }

  /** The chase list. Oldest first, because it is worked top to bottom. */
  @Get("approvals")
  async approvals(@CurrentSession() session: SessionContext): Promise<ApprovalsResult> {
    await this.requireBranchView(session);
    return this.approvalsService.list({
      tenantId: session.tenantId as string,
      branchScope: session.branchScope,
    });
  }

  /**
   * P-18 (docs/POLICY_DECISION_INVENTORY.md): record a decision the
   * customer gave verbally rather than through their portal or link.
   * `CustomerDecisionService.recordOnBehalf` -- not this controller --
   * decides whether the workshop's PORTAL_COUNTER_APPROVAL policy even
   * allows it, since that is a policy question, not an access one.
   */
  @Post("approvals/:requestId/record")
  @HttpCode(200)
  async recordApproval(
    @CurrentSession() session: SessionContext,
    @Param("requestId") requestId: string,
    @Body() dto: RecordDecisionDto,
  ): Promise<{ ok: true }> {
    const allowed = await this.access.can(session, "customer_decision.record_on_behalf");
    if (!allowed || !session.tenantId) {
      throw new ForbiddenException({
        code: "forbidden",
        message: "You do not have access to record a customer decision.",
      });
    }

    await this.customerDecisions.recordOnBehalf(
      session.tenantId,
      session.branchScope,
      requestId,
      dto.answers,
      { accountId: session.accountId, displayName: session.displayName },
      dto.evidenceReference,
    );
    return { ok: true };
  }

  /**
   * What is leaving today, and what is holding the rest. Gates are really
   * run here -- see DeliveryService for why nothing may re-implement them.
   */
  @Get("delivery")
  async delivery(@CurrentSession() session: SessionContext): Promise<DeliveryBoard> {
    await this.requireBranchView(session);
    return this.deliveryService.board({
      tenantId: session.tenantId as string,
      branchScope: session.branchScope,
    });
  }

  private async requireBranchView(session: SessionContext): Promise<void> {
    const allowed = await this.access.can(session, "workorders.branch.view");
    if (!allowed || !session.tenantId) {
      throw new ForbiddenException({
        code: "forbidden",
        message: "You do not have access to branch operations.",
      });
    }
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
