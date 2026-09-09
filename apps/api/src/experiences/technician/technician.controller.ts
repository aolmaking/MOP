import { BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import type { SessionContext } from "@mop/shared";
import { SessionGuard } from "../../identity/auth/session.guard";
import { CurrentSession } from "../../identity/auth/current-session.decorator";
import { EffectiveAccessService } from "../../identity/access/effective-access.service";
import { TechnicianWorkService } from "../../systems/operations/technician-work.service";
import { WorkflowJourneyService } from "../../systems/operations/workflow-journey.service";
import { TechnicianWorkViewService } from "./technician-work-view.service";
import { CustomerDecisionService } from "../../systems/customer/decision.service";
import { PartRequestService } from "../../systems/inventory/part-request.service";
import { CatalogBrowseService } from "../../systems/inventory/catalog-browse.service";
import { SmartSuggestionEngine } from "../../systems/inventory/master-catalog/smart-suggestion.engine";
import { CARS_INSPECTION_CHECKPOINTS } from "../../systems/inventory/master-catalog/cars-catalog.dataset";
import { MOTORCYCLES_INSPECTION_CHECKPOINTS } from "../../systems/inventory/master-catalog/motorcycles-catalog.dataset";
import { HEAVY_EQUIPMENT_INSPECTION_CHECKPOINTS } from "../../systems/inventory/master-catalog/heavy-equipment-catalog.dataset";
import { parseAttributeQuery } from "../../systems/inventory/inventory.controller";
import {
  ReportBlockerDto,
  CreateFaultDto,
  RequestPartDto,
  RecordInspectionDto,
  CompleteTaskDto,
  RequestReturnDto,
  ReturnPartDto,
  ClarificationDto,
  RespondToClarificationDto,
  ExternalPartDto,
  SubmitCartDto,
  SubmitSpecializationEntryDto,
  ToggleInspectionBoxDoneDto,
  SubmitInspectionReportDto,
  PatchInspectionTargetDto,
  RecordRecommendationDecisionDto,
  SubmitInspectionAggregateDto,
} from "./technician.dto";
import { SpecializationService } from "../../systems/people/specialization/specialization.service";
import { RaiseDecisionDto } from "../../systems/customer/decision.dto";
import { TechnicianInspectionService } from "./technician-inspection.service";
import { VehicleFitmentService } from "../../systems/inventory/fitment/vehicle-fitment.service";

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
    private readonly browse: CatalogBrowseService,
    private readonly journey: WorkflowJourneyService,
    private readonly specialization: SpecializationService,
    private readonly inspectionService: TechnicianInspectionService,
    private readonly fitmentService?: VehicleFitmentService,
    private readonly smartSuggestions?: SmartSuggestionEngine,
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
    // The viewer is a permission ORACLE, not a session: the journey
    // decides which moves the graph allows, this decides which of them
    // this person may make, and neither has to know the other's rules.
    return this.journey.forWorkOrder(tenantId, id, "TECHNICIAN", {
      can: (permission) => this.access.can(session, permission),
    });
  }

  /**
   * The vehicle's decision-support history -- P-81,
   * docs/POLICY_DECISION_INVENTORY.md §8.B.
   *
   * Deliberately NOT the owner's history record: same underlying truth,
   * arranged around "what do I need to know before I decide", and with
   * no money in it at all. Scope is the technician's own assignment,
   * resolved from the session, never from the URL.
   */
  @Get("work-orders/:id/vehicle-history")
  async vehicleHistory(@CurrentSession() session: SessionContext, @Param("id") id: string) {
    const { staffUserId, tenantId } = await this.requireTechnician(session, "task.view_assigned");
    return this.view.vehicleHistory(staffUserId, tenantId, id);
  }

  /** Specialization forms and service cards available for this workshop. */
  @Get("work-orders/:id/specialization-forms")
  async specializationForms(@CurrentSession() session: SessionContext, @Param("id") id: string) {
    const { staffUserId, tenantId } = await this.requireTechnician(session, "task.view_assigned");
    await this.view.workCard(staffUserId, tenantId, id);
    return this.specialization.listDefinitions(tenantId);
  }

  /** Specialization measurements/cards recorded against this work order. */
  @Get("work-orders/:id/specialization-entries")
  async specializationEntries(@CurrentSession() session: SessionContext, @Param("id") id: string) {
    const { staffUserId, tenantId } = await this.requireTechnician(session, "task.view_assigned");
    await this.view.workCard(staffUserId, tenantId, id);
    return this.specialization.entriesFor(tenantId, id);
  }

  /** Record a specialization measurement or service card entry for this job. */
  @Post("work-orders/:id/specialization-entries")
  async submitSpecializationEntry(
    @CurrentSession() session: SessionContext,
    @Param("id") id: string,
    @Body() dto: SubmitSpecializationEntryDto,
  ) {
    const { staffUserId, tenantId } = await this.requireTechnician(session, "task.complete");
    await this.view.workCard(staffUserId, tenantId, id);
    return this.specialization.fillEntry(
      tenantId,
      dto.definitionId,
      staffUserId,
      dto.values,
      { workOrderId: id, taskId: dto.taskId },
    );
  }

  @Post("tasks/:id/start")
  async startTask(@CurrentSession() session: SessionContext, @Param("id") id: string) {
    const { tenantId } = await this.requireTechnician(session, "task.view_assigned");
    // Starting is a task-level state change, not a work-order transition,
    // so it does not go through the lifecycle service -- that owns
    // WorkOrder.status and nothing else may write it.
    return this.work.startTask(id, tenantId, this.actor(session));
  }

  @Post("tasks/:id/complete")
  async completeTask(@CurrentSession() session: SessionContext, @Param("id") id: string, @Body() dto: CompleteTaskDto) {
    const { tenantId } = await this.requireTechnician(session, "task.complete");
    return this.work.completeTask(id, tenantId, this.actor(session), dto.minutesSpent);
  }

  @Post("tasks/:id/blocker")
  async reportBlocker(
    @CurrentSession() session: SessionContext,
    @Param("id") id: string,
    @Body() dto: ReportBlockerDto,
  ) {
    const { tenantId } = await this.requireTechnician(session, "blocker.report");
    return this.work.reportBlocker({ taskId: id, reason: dto.reason, note: dto.note }, tenantId, this.actor(session));
  }

  /**
   * "Start inspection" -- REGISTERED to UNDER_INSPECTION. The first half
   * of the spine that was entirely unwired: `WorkOrderLifecycleService`
   * has always known this move, and nothing ever pressed the button.
   */
  @Post("work-orders/:id/start-inspection")
  @HttpCode(200)
  async startInspection(@CurrentSession() session: SessionContext, @Param("id") id: string) {
    const { staffUserId, tenantId } = await this.requireTechnician(session, "task.start_inspection");
    await this.view.workCard(staffUserId, tenantId, id);
    const result = await this.work.startInspection(id, this.actor(session));
    return { workOrderId: result.workOrderId, status: result.to };
  }

  /**
   * "Start work" -- APPROVED_FOR_WORK to IN_PROGRESS. Same gap as
   * `startInspection`, one stage later in the job.
   */
  @Post("work-orders/:id/start-work")
  @HttpCode(200)
  async startWork(@CurrentSession() session: SessionContext, @Param("id") id: string) {
    const { staffUserId, tenantId } = await this.requireTechnician(session, "task.start_work");
    await this.view.workCard(staffUserId, tenantId, id);
    const result = await this.work.startWork(id, this.actor(session));
    return { workOrderId: result.workOrderId, status: result.to };
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
        actualMinutes: dto.actualMinutes,
      },
      this.actor(session),
    );
  }

  /**
   * Mark a simplified inspection box as Done (or update finding).
   */
  @Post("work-orders/:id/inspection-box-done")
  async toggleInspectionBoxDone(
    @CurrentSession() session: SessionContext,
    @Param("id") id: string,
    @Body() dto: ToggleInspectionBoxDoneDto,
  ) {
    const { staffUserId, tenantId } = await this.requireTechnician(session, "task.view_assigned");
    return this.view.toggleInspectionBox(staffUserId, tenantId, id, dto);
  }

  @Post("work-orders/:id/submit-inspection-report")
  async submitInspectionReport(
    @CurrentSession() session: SessionContext,
    @Param("id") id: string,
    @Body() dto: SubmitInspectionReportDto,
  ) {
    const { staffUserId, tenantId } = await this.requireTechnician(session, "task.view_assigned");
    return this.view.submitInspectionReport(staffUserId, tenantId, id, dto);
  }

  /**
   * Phase C: Fetch complete inspection aggregate state (targets, decisions, recommendations, OCC version, snapshot).
   */
  @Get("work-orders/:id/inspection")
  async getInspection(
    @CurrentSession() session: SessionContext,
    @Param("id") id: string,
  ) {
    const { tenantId } = await this.requireTechnician(session, "task.view_assigned");
    return this.inspectionService.getInspection(tenantId, id);
  }

  /**
   * Phase C: Real-time delta auto-save of individual target inspection result.
   * Runs OCC verification, evaluates recommendation rules, and updates aggregate.
   */
  @Patch("work-orders/:id/inspection/targets/:targetKey")
  async patchInspectionTarget(
    @CurrentSession() session: SessionContext,
    @Param("id") id: string,
    @Param("targetKey") targetKey: string,
    @Body() dto: PatchInspectionTargetDto,
  ) {
    const { staffUserId, tenantId } = await this.requireTechnician(session, "task.view_assigned");
    return this.inspectionService.saveTargetDelta(tenantId, id, staffUserId, targetKey, dto);
  }

  /**
   * Phase C: Record technician decision on generated recommendation (ACCEPTED, DISMISSED, MODIFIED_SCOPE).
   */
  @Post("work-orders/:id/inspection/decisions")
  async recordRecommendationDecision(
    @CurrentSession() session: SessionContext,
    @Param("id") id: string,
    @Body() dto: RecordRecommendationDecisionDto,
  ) {
    const { staffUserId, tenantId } = await this.requireTechnician(session, "task.view_assigned");
    return this.inspectionService.recordDecision(tenantId, id, staffUserId, dto);
  }

  /**
   * Phase C: Final inspection submission with deep frozen immutable snapshot and idempotent fault projection.
   */
  @Post("work-orders/:id/inspection/submit")
  async submitInspectionAggregate(
    @CurrentSession() session: SessionContext,
    @Param("id") id: string,
    @Body() dto: SubmitInspectionAggregateDto,
  ) {
    const { staffUserId, tenantId } = await this.requireTechnician(session, "task.view_assigned");
    return this.inspectionService.submitInspection(tenantId, id, staffUserId, dto);
  }

  /**
   * Phase D & E: Query compatible physical inventory SKUs for a canonical part/target with live branch stock and prices.
   */
  @Get("work-orders/:id/fitment-parts")
  async getFitmentParts(
    @CurrentSession() session: SessionContext,
    @Param("id") id: string,
    @Query("canonicalPartSlug") canonicalPartSlug: string,
    @Query("position") position?: string,
  ) {
    const { tenantId } = await this.requireTechnician(session, "task.view_assigned");
    if (!canonicalPartSlug) {
      throw new BadRequestException("Query parameter 'canonicalPartSlug' is required.");
    }
    return this.fitmentService?.resolveForWorkOrder(tenantId, id, canonicalPartSlug, position);
  }

  /**
   * Phase E: Select a compatible physical part and add it directly to the work order.
   */
  @Post("work-orders/:id/select-part")
  async selectPartForWorkOrder(
    @CurrentSession() session: SessionContext,
    @Param("id") id: string,
    @Body() dto: { sku: string; quantity?: number; taskId?: string },
  ) {
    const { staffUserId, tenantId } = await this.requireTechnician(session, "task.view_assigned");
    if (!dto.sku) {
      throw new BadRequestException("Property 'sku' is required.");
    }
    return this.fitmentService?.addPartLineToWorkOrder(tenantId, id, staffUserId, dto);
  }

  @Post("smart-suggestions")
  async getSmartSuggestions(
    @CurrentSession() session: SessionContext,
    @Body() dto: {
      workOrderId?: string;
      context?: {
        canonicalPartSlug?: string;
        position?: any;
        finding?: {
          key?: string;
          symptom?: string;
          severity?: "CRITICAL" | "MEDIUM" | "LOW" | "HIGH";
          description?: string;
        };
        vehicle?: {
          category?: "CARS" | "MOTORCYCLES" | "HEAVY_EQUIPMENT";
          make?: string;
          model?: string;
          year?: number;
        };
      };
      vehicleCategory?: "CARS" | "MOTORCYCLES" | "HEAVY_EQUIPMENT";
      partSkus?: string[];
      partNames?: string[];
      categorySlugs?: string[];
      findingKeys?: string[];
    },
  ) {
    await this.requireTechnician(session, "task.view_assigned");
    const query = dto.context ? { ...dto.context, workOrderId: dto.workOrderId } : dto;
    const grouped = this.smartSuggestions?.suggestForContext(query as any);
    return {
      recommended: grouped?.recommended ?? [],
      related: grouped?.related ?? [],
      diagnostic: grouped?.diagnostic ?? [],
      suggestions: grouped?.all ?? (this.smartSuggestions?.suggestFor(dto) ?? []),
    };
  }

  @Get("inspection-checkpoints")
  async getInspectionCheckpoints(
    @CurrentSession() session: SessionContext,
    @Query("category") category?: "CARS" | "MOTORCYCLES" | "HEAVY_EQUIPMENT",
  ) {
    await this.requireTechnician(session, "task.view_assigned");
    const cat = category ?? "CARS";
    if (cat === "MOTORCYCLES") {
      return { checkpoints: MOTORCYCLES_INSPECTION_CHECKPOINTS };
    }
    if (cat === "HEAVY_EQUIPMENT") {
      return { checkpoints: HEAVY_EQUIPMENT_INSPECTION_CHECKPOINTS };
    }
    return { checkpoints: CARS_INSPECTION_CHECKPOINTS };
  }

  @Post("work-orders/:id/faults")
  async createFault(
    @CurrentSession() session: SessionContext,
    @Param("id") id: string,
    @Body() dto: CreateFaultDto,
  ) {
    await this.requireTechnician(session, "inspection.full.create");
    return this.work.createFault(
      {
        workOrderId: id,
        description: dto.description,
        severity: dto.severity,
        code: dto.code,
        recommendedService: dto.recommendedService,
        inspectionId: dto.inspectionId,
      },
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
      {
        name: dto.name,
        explanation: dto.explanation,
        importance: dto.importance,
        price: dto.price,
        laborPrice: dto.laborPrice,
        // Inspection -> Fault -> Recommendation, carried as stored
        // evidence rather than reconstructed from matching strings later.
        faultId: dto.faultId,
        serviceKey: dto.serviceKey,
      },
      { accountId: session.accountId, displayName: session.displayName },
    );
  }

  /**
   * The parts catalogue, as something to shop rather than something to
   * search.
   *
   * Categories, filters and filter values all come from what the
   * inventory manager configured -- this endpoint has no taxonomy of its
   * own, and adding a hardcoded "Vehicle Type" here would put the
   * technician's page and the manager's page permanently out of step.
   * The same `CatalogBrowseService.browse` answers the manager's
   * preview, so what is previewed is literally what is served.
   *
   * No ownership check: this is workshop-wide reference data, not this
   * technician's own record. Cost is not merely unread here -- a
   * `BrowseCard` has no field for it.
   */
  @Get("parts-catalog")
  async partsCatalog(
    @CurrentSession() session: SessionContext,
    @Query("q") q?: string,
    @Query("categoryId") categoryId?: string,
    @Query("attributes") attributes?: string,
    @Query("inStockOnly") inStockOnly?: string,
    @Query("page") page?: string,
  ) {
    const { tenantId } = await this.requireTechnician(session, "inventory.request.create");
    return this.browse.browse(tenantId, {
      query: q,
      categoryId,
      attributes: parseAttributeQuery(attributes),
      inStockOnly: inStockOnly === "true",
      page: page ? Number(page) : 1,
    });
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
      {
        tenantId,
        workOrderId: id,
        inventoryItemId: dto.inventoryItemId,
        quantity: dto.quantity,
        reason: dto.reason,
        inspectionId: dto.inspectionId,
      },
      this.actor(session),
    );
  }

  /**
   * The cart, submitted.
   *
   * One request per line, in one transaction, under one `cartKey` --
   * see `PartRequestService.requestMany` for why this is not a
   * shopping-order entity and why the key is required rather than
   * optional. Same permission and the same ownership check as the
   * single-part path above: a cart is a faster way to ask for parts, not
   * a way to ask for more of them.
   */
  @Post("work-orders/:id/parts/cart")
  async submitCart(
    @CurrentSession() session: SessionContext,
    @Param("id") id: string,
    @Body() dto: SubmitCartDto,
  ) {
    const { staffUserId, tenantId } = await this.requireTechnician(session, "inventory.request.create");
    await this.view.workCard(staffUserId, tenantId, id);
    return this.partRequests.requestMany(
      {
        tenantId,
        workOrderId: id,
        lines: dto.lines,
        cartKey: dto.cartKey,
        reason: dto.reason,
        inspectionId: dto.inspectionId,
      },
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
    const { tenantId } = await this.requirePartOnMyJob(session, id);
    return this.partRequests.receive(id, tenantId, this.actor(session));
  }

  @Post("parts/:id/used")
  async usePart(@CurrentSession() session: SessionContext, @Param("id") id: string) {
    const { tenantId } = await this.requirePartOnMyJob(session, id);
    return this.partRequests.markUsed(id, tenantId, this.actor(session));
  }

  /**
   * "Send it back" -- the technician's own half of the returns loop
   * (`PartRequestService.requestReturn`).
   */
  @Post("parts/:id/return")
  async returnPart(
    @CurrentSession() session: SessionContext,
    @Param("id") id: string,
    @Body() dto: ReturnPartDto | RequestReturnDto,
  ) {
    const { tenantId } = await this.requirePartOnMyJob(session, id);
    return this.partRequests.requestReturn(id, tenantId, dto.quantity, this.actor(session), dto.reason);
  }

  @Post("parts/:id/clarification")
  async answerClarification(
    @CurrentSession() session: SessionContext,
    @Param("id") id: string,
    @Body() dto: ClarificationDto,
  ) {
    const { tenantId } = await this.requirePartOnMyJob(session, id);
    return this.partRequests.respondToClarification(id, tenantId, this.actor(session), dto.answer);
  }

  /**
   * The technician's answer to the store's clarifying question on a
   * return-in-progress -- the other end of `inventory.controller.ts`'s
   * `returns/:id/clarify`. Loops the return back to RETURN_REQUESTED so
   * the store's next move is the same decision as a first-time request.
   */
  @Post("parts/:id/return/respond")
  async respondToReturnClarification(
    @CurrentSession() session: SessionContext,
    @Param("id") id: string,
    @Body() dto: RespondToClarificationDto,
  ) {
    const { tenantId } = await this.requirePartOnMyJob(session, id);
    return this.partRequests.respondToClarification(id, tenantId, this.actor(session), dto.response);
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
  private async requirePartOnMyJob(session: SessionContext, partRequestId: string): Promise<{ tenantId: string }> {
    const { staffUserId, tenantId } = await this.requireTechnician(session, "task.view_assigned");
    // workOrderOf is tenant-scoped, so a request id from another workshop is
    // already refused here -- the tenantId is returned so the service call
    // below can scope its own load rather than trusting that this ran.
    const workOrderId = await this.partRequests.workOrderOf(partRequestId, tenantId);
    await this.view.workCard(staffUserId, tenantId, workOrderId);
    return { tenantId };
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
