import { Body, Controller, ForbiddenException, Get, HttpCode, Param, Post, Query, UseGuards } from "@nestjs/common";
import type { SessionContext } from "@mop/shared";
import { SessionGuard } from "../../identity/auth/session.guard";
import { CurrentSession } from "../../identity/auth/current-session.decorator";
import { EffectiveAccessService } from "../../identity/access/effective-access.service";
import { TechnicianWorkService } from "../../systems/operations/technician-work.service";
import { WorkflowJourneyService } from "../../systems/operations/workflow-journey.service";
import { TechnicianWorkViewService } from "./technician-work-view.service";
import { CustomerDecisionService } from "../../systems/customer/decision.service";
import { PartRequestService } from "../../systems/inventory/part-request.service";
import { CatalogService } from "../../systems/inventory/catalog.service";
import { ReportBlockerDto, CreateFaultDto, RequestPartDto, RecordInspectionDto, CompleteTaskDto, RequestReturnDto, ClarificationDto, ExternalPartDto } from "./technician.dto";
import { RaiseDecisionDto } from "../../systems/customer/decision.dto";

/**
 * The technician's three pages, plus the writes they make from them.
 *
 * Scope comes from the session's staffUserId and never from a parameter.
 * "Whose work is this" is a server-side fact, and a client-supplied id
 * would let any technician read the whole workshop's jobs.
 */
@Controller("technician")
@UseGuards(SessionGuard)
export class TechnicianController {
  constructor(
    private readonly view: TechnicianWorkViewService,
    private readonly work: TechnicianWorkService,
    private readonly access: EffectiveAccessService,
    private readonly decisions: CustomerDecisionService,
    private readonly partRequests: PartRequestService,
    private readonly catalog: CatalogService,
    private readonly journey: WorkflowJourneyService,
  ) {}

  /** Home: the car in front of them, if there is one. */
  @Get("active")
  async active(@CurrentSession() session: SessionContext) {
    const { staffUserId, tenantId } = await this.requireTechnician(session, "task.view_assigned");
    return { job: await this.view.activeJob(staffUserId, tenantId) };
  }

  @Get("my-work")
  async myWork(@CurrentSession() session: SessionContext) {
    const { staffUserId, tenantId } = await this.requireTechnician(session, "task.view_assigned");
    return { jobs: await this.view.myWork(staffUserId, tenantId) };
  }

  @Get("work-orders/:id")
  async workCard(@CurrentSession() session: SessionContext, @Param("id") id: string) {
    const { staffUserId, tenantId } = await this.requireTechnician(session, "task.view_assigned");
    return this.view.workCard(staffUserId, tenantId, id);
  }

  /**
   * The workflow strip for this job, in the technician's own vocabulary.
   *
   * Generated from the workshop's effective graph, so a workshop without
   * QC has no QC stage here -- and the headline says whose move it is,
   * which for a technician usually means "not yours, and here is why".
   */
  @Get("work-orders/:id/journey")
  async journeyFor(@CurrentSession() session: SessionContext, @Param("id") id: string) {
    const { staffUserId, tenantId } = await this.requireTechnician(session, "task.view_assigned");
    await this.view.workCard(staffUserId, tenantId, id);
    return this.journey.forWorkOrder(tenantId, id, "TECHNICIAN");
  }

  /** "Previous history detected" -- P-81, docs/POLICY_DECISION_INVENTORY.md §8.B. */
  @Get("work-orders/:id/vehicle-history")
  async vehicleHistory(@CurrentSession() session: SessionContext, @Param("id") id: string) {
    const { staffUserId, tenantId } = await this.requireTechnician(session, "task.view_assigned");
    return this.view.vehicleHistory(staffUserId, tenantId, id);
  }

  @Post("tasks/:id/start")
  async startTask(@CurrentSession() session: SessionContext, @Param("id") id: string) {
    await this.requireTechnician(session, "task.view_assigned");
    // Starting is a task-level state change, not a work-order transition,
    // so it does not go through the lifecycle service -- that owns
    // WorkOrder.status and nothing else may write it.
    return this.work.startTask(id, this.actor(session));
  }

  @Post("tasks/:id/complete")
  async completeTask(@CurrentSession() session: SessionContext, @Param("id") id: string, @Body() dto: CompleteTaskDto) {
    await this.requireTechnician(session, "task.complete");
    return this.work.completeTask(id, this.actor(session), dto.minutesSpent);
  }

  @Post("tasks/:id/blocker")
  async reportBlocker(
    @CurrentSession() session: SessionContext,
    @Param("id") id: string,
    @Body() dto: ReportBlockerDto,
  ) {
    await this.requireTechnician(session, "blocker.report");
    return this.work.reportBlocker({ taskId: id, reason: dto.reason, note: dto.note }, this.actor(session));
  }

  /**
   * Record the inspection.
   *
   * `TechnicianWorkService.recordInspection` was fully built, wrote the
   * row AND emitted `inspection.saved` -- and no controller ever exposed
   * it, so the `inspection_completed` finish gate could only ever be
   * satisfied by a job whose customer had DECLINED an inspection. A
   * technician who actually did one had no way to say so, and their job
   * could not finish.
   *
   * `technicianId` comes from the session, never the body: whose
   * inspection this is is a server-side fact.
   */
  @Post("work-orders/:id/inspection")
  async recordInspection(
    @CurrentSession() session: SessionContext,
    @Param("id") id: string,
    @Body() dto: RecordInspectionDto,
  ) {
    const { staffUserId, tenantId } = await this.requireTechnician(
      session,
      dto.type === "FULL" ? "inspection.full.create" : "inspection.quick.create",
    );
    await this.view.workCard(staffUserId, tenantId, id);
    return this.work.recordInspection(
      {
        workOrderId: id,
        technicianId: staffUserId,
        type: dto.type,
        odometerOrHours: dto.odometerOrHours,
        // The category-specific form is Phase 15/16 work; a note is what
        // a technician can honestly give today, and an empty object is
        // truthful about that rather than inventing fields.
        fields: {},
        note: dto.note,
      },
      this.actor(session),
    );
  }

  @Post("work-orders/:id/faults")
  async createFault(
    @CurrentSession() session: SessionContext,
    @Param("id") id: string,
    @Body() dto: CreateFaultDto,
  ) {
    await this.requireTechnician(session, "inspection.full.create");
    return this.work.createFault(
      { workOrderId: id, description: dto.description, severity: dto.severity },
      this.actor(session),
    );
  }

  /**
   * "Ask the customer" -- create and send in one press. Requires both
   * `customer_decision.create` and `customer_decision.send`, which
   * `default-role-permissions.ts` has granted TECHNICIAN since before
   * this endpoint existed; nothing ever called them until now.
   */
  @Post("work-orders/:id/decisions")
  async raiseDecision(
    @CurrentSession() session: SessionContext,
    @Param("id") id: string,
    @Body() dto: RaiseDecisionDto,
  ) {
    const { staffUserId, tenantId } = await this.requireTechnician(session, "customer_decision.create");
    await this.requireTechnician(session, "customer_decision.send");
    // Ownership before anything else -- a technician may only ask a
    // customer about a job assigned to them, same rule as every other
    // write in this controller.
    await this.view.workCard(staffUserId, tenantId, id);
    return this.decisions.raiseAndSend(
      tenantId,
      id,
      { name: dto.name, explanation: dto.explanation, importance: dto.importance, price: dto.price, laborPrice: dto.laborPrice },
      { accountId: session.accountId, displayName: session.displayName },
    );
  }

  /**
   * The parts a technician may put on a job, POS-card style -- the same
   * catalog Catalog Control writes, filtered to what a work order can
   * use and never carrying cost (a technician has no reason to see
   * margin). No ownership check: this is workshop-wide reference data,
   * not this technician's own record.
   */
  @Get("parts-catalog")
  async partsCatalog(@CurrentSession() session: SessionContext, @Query("q") q?: string) {
    const { tenantId } = await this.requireTechnician(session, "inventory.request.create");
    return this.catalog.list(tenantId, { query: q, workOrderUsable: true, pageSize: 50 }, false);
  }

  /**
   * "I need this part" -- creates the real `PartRequest` the Inventory
   * Manager's queue already reads, and moves the work order onto
   * WAITING_PARTS where the graph allows it
   * (`PartRequestService.request()` asks the graph itself; a job already
   * blocked some other way simply keeps the request without forcing a
   * second, contradictory move).
   */
  @Post("work-orders/:id/parts")
  async requestPart(
    @CurrentSession() session: SessionContext,
    @Param("id") id: string,
    @Body() dto: RequestPartDto,
  ) {
    const { staffUserId, tenantId } = await this.requireTechnician(session, "inventory.request.create");
    // Ownership before anything else, same rule as every other write here.
    await this.view.workCard(staffUserId, tenantId, id);
    return this.partRequests.request(
      { tenantId, workOrderId: id, inventoryItemId: dto.inventoryItemId, quantity: dto.quantity, reason: dto.reason },
      this.actor(session),
    );
  }

  /**
   * "I've got it" and "it's fitted" -- the technician's own two moves on
   * a part, and the two the finish gate
   * (`parts.received_used_or_returned`) is actually watching for. Both
   * check the work order the request belongs to is this technician's,
   * so a request id from another bay is refused the same way a work
   * order id would be.
   */
  @Post("parts/:id/receive")
  async receivePart(@CurrentSession() session: SessionContext, @Param("id") id: string) {
    await this.requirePartOnMyJob(session, id);
    return this.partRequests.receive(id, this.actor(session));
  }

  @Post("parts/:id/used")
  async usePart(@CurrentSession() session: SessionContext, @Param("id") id: string) {
    await this.requirePartOnMyJob(session, id);
    return this.partRequests.markUsed(id, this.actor(session));
  }

  @Post("parts/:id/return")
  async requestReturn(
    @CurrentSession() session: SessionContext,
    @Param("id") id: string,
    @Body() dto: RequestReturnDto,
  ) {
    await this.requirePartOnMyJob(session, id);
    return this.partRequests.requestReturn(id, dto.quantity, this.actor(session), dto.reason);
  }

  @Post("parts/:id/clarification")
  async answerClarification(
    @CurrentSession() session: SessionContext,
    @Param("id") id: string,
    @Body() dto: ClarificationDto,
  ) {
    await this.requirePartOnMyJob(session, id);
    return this.partRequests.respondToClarification(id, this.actor(session), dto.answer);
  }

  @Post("work-orders/:id/external-parts")
  async addExternalPart(
    @CurrentSession() session: SessionContext,
    @Param("id") id: string,
    @Body() dto: ExternalPartDto,
  ) {
    const { staffUserId, tenantId } = await this.requireTechnician(session, "inventory.request.create");
    await this.view.workCard(staffUserId, tenantId, id);
    return this.work.addExternalPartLine(id, dto, this.actor(session));
  }

  /** What the Finish Gate would say, asked before anything is pressed. */
  @Get("work-orders/:id/finish-check")
  async finishCheck(@CurrentSession() session: SessionContext, @Param("id") id: string) {
    const { staffUserId, tenantId } = await this.requireTechnician(session, "task.finish_attempt");
    // Runs the ownership check first, so this cannot be used to probe
    // gate state on somebody else's job.
    await this.view.workCard(staffUserId, tenantId, id);
    return this.view.finishCheck(id);
  }

  /**
   * The actual press. Same permission and ownership check as the
   * preview above -- `finish-check` only ever told the technician what
   * this would say; this is what moves the job. `WorkOrderLifecycleService`
   * re-evaluates every gate itself, so a stale preview can never push a
   * job past a condition that closed in the meantime.
   */
  @Post("work-orders/:id/finish")
  async finish(@CurrentSession() session: SessionContext, @Param("id") id: string) {
    const { staffUserId, tenantId } = await this.requireTechnician(session, "task.finish_attempt");
    await this.view.workCard(staffUserId, tenantId, id);
    return this.work.finishWorkOrder(id, this.actor(session));
  }

  @Post("work-orders/:id/start-inspection")
  @HttpCode(200)
  async startInspection(@CurrentSession() session: SessionContext, @Param("id") id: string) {
    const { staffUserId, tenantId } = await this.requireTechnician(session, "task.view_assigned");
    await this.view.workCard(staffUserId, tenantId, id);
    const result = await this.work.startInspection(id, this.actor(session));
    return { workOrderId: result.workOrderId, status: result.to };
  }

  @Post("work-orders/:id/start-work")
  @HttpCode(200)
  async startWork(@CurrentSession() session: SessionContext, @Param("id") id: string) {
    const { staffUserId, tenantId } = await this.requireTechnician(session, "task.view_assigned");
    await this.view.workCard(staffUserId, tenantId, id);
    const result = await this.work.startWork(id, this.actor(session));
    return { workOrderId: result.workOrderId, status: result.to };
  }

  private actor(session: SessionContext) {
    return {
      accountId: session.accountId,
      displayName: session.displayName,
      actorType: "TENANT_STAFF" as const,
    };
  }

  /**
   * Resolves a part request to the work order it sits on, then runs the
   * same ownership check every other write here runs. Reached through
   * the view service rather than a second hand-written query, so there
   * is exactly one definition of "this job is mine".
   */
  private async requirePartOnMyJob(session: SessionContext, partRequestId: string): Promise<void> {
    const { staffUserId, tenantId } = await this.requireTechnician(session, "task.view_assigned");
    const workOrderId = await this.partRequests.workOrderOf(partRequestId, tenantId);
    await this.view.workCard(staffUserId, tenantId, workOrderId);
  }

  private async requireTechnician(
    session: SessionContext,
    permission: string,
  ): Promise<{ staffUserId: string; tenantId: string }> {
    const allowed = await this.access.can(session, permission);
    if (!allowed || !session.tenantId || !session.staffUserId) {
      throw new ForbiddenException({ code: "forbidden", message: "You do not have access to technician work." });
    }
    return { staffUserId: session.staffUserId, tenantId: session.tenantId };
  }
}
