import { Body, Controller, ForbiddenException, Get, Param, Post, UseGuards } from "@nestjs/common";
import type { SessionContext } from "@mop/shared";
import { SessionGuard } from "../auth/session.guard";
import { CurrentSession } from "../auth/current-session.decorator";
import { EffectiveAccessService } from "../access/effective-access.service";
import { TechnicianWorkService } from "../operations/technician-work.service";
import { TechnicianWorkViewService } from "./technician-work-view.service";
import { ReportBlockerDto, CreateFaultDto } from "./technician.dto";

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
  async completeTask(@CurrentSession() session: SessionContext, @Param("id") id: string) {
    await this.requireTechnician(session, "task.complete");
    return this.work.completeTask(id, this.actor(session));
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

  /** What the Finish Gate would say, asked before anything is pressed. */
  @Get("work-orders/:id/finish-check")
  async finishCheck(@CurrentSession() session: SessionContext, @Param("id") id: string) {
    const { staffUserId, tenantId } = await this.requireTechnician(session, "task.finish_attempt");
    // Runs the ownership check first, so this cannot be used to probe
    // gate state on somebody else's job.
    await this.view.workCard(staffUserId, tenantId, id);
    return this.view.finishCheck(id);
  }

  private actor(session: SessionContext) {
    return {
      accountId: session.accountId,
      displayName: session.displayName,
      actorType: "TENANT_STAFF" as const,
    };
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
