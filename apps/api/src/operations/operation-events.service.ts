import { Injectable } from "@nestjs/common";
import { AuditActorType, Prisma, TimelineVisibility } from "@prisma/client";
import {
  operationEventAliases,
  type OperationEventCreateDto,
  type OperationEventDto,
  type OperationNotificationTarget,
  type OperationReportHookDto,
  type OperationStatusChangeDto
} from "@mop/shared";
import { PrismaService } from "../database/prisma.service";
import type { RequestSessionContext } from "../tenancy/session-context";
import { CrossRoleActionContractsService } from "./cross-role-action-contracts.service";
import { CustomerSafeProjectionService } from "./customer-safe-projection.service";
import { NotificationRoutingService } from "./notification-routing.service";
import { WorkflowStatusResolverService } from "./workflow-status-resolver.service";

@Injectable()
export class OperationEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowStatus: WorkflowStatusResolverService,
    private readonly notificationRouting: NotificationRoutingService,
    private readonly customerProjection: CustomerSafeProjectionService,
    private readonly actionContracts: CrossRoleActionContractsService
  ) {}

  async emitFromSession(session: RequestSessionContext, input: Omit<OperationEventCreateDto, "actor">) {
    const actorType = session.accountType === "platform" ? "platform" : "tenant_staff";
    return this.emit({
      ...input,
      permissionCheck: input.permissionCheck || this.actionContracts.permissionCheck(input.eventKey, actorType, session.permissions),
      actor: {
        actorType,
        actorId: session.userId || session.accountId,
        actorName: session.displayName,
        roleId: session.roleId
      }
    });
  }

  async emit(input: OperationEventCreateDto): Promise<OperationEventDto> {
    const canonicalEventKey = input.canonicalEventKey || operationEventAliases[input.eventKey] || input.eventKey;
    const resolution = this.workflowStatus.resolve(canonicalEventKey, {
      workOrderId: input.workOrderId,
      taskId: input.taskId,
      targetType: input.targetType,
      targetId: input.targetId,
      payload: input.payload
    }, input.statusChanges);
    const route = this.notificationRouting.route(canonicalEventKey, input.notificationTargets, input.pageUpdates, input.payload);
    const customerSafeOutput = this.customerProjection.project(canonicalEventKey, input.customerSafeOutput, {
      customerId: input.customerId,
      assetId: input.assetId,
      workOrderId: input.workOrderId,
      payload: input.payload
    });
    const event: OperationEventDto = {
      eventId: `ope_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      eventKey: input.eventKey,
      canonicalEventKey,
      tenantId: input.tenantId,
      branchId: input.branchId,
      warehouseId: input.warehouseId,
      workOrderId: input.workOrderId,
      taskId: input.taskId,
      customerId: input.customerId,
      assetId: input.assetId,
      actor: input.actor,
      statusChanges: this.statusChanges(resolution.statusChanges),
      notificationTargets: this.targets(route.targets),
      pageUpdates: route.pageUpdates,
      reportHooks: this.reportHooks(input.reportHooks),
      auditAction: input.auditAction,
      targetType: input.targetType,
      targetId: input.targetId,
      visibility: input.visibility || (customerSafeOutput ? "customer_safe" : "internal"),
      permissionCheck: input.permissionCheck || this.actionContracts.permissionCheck(canonicalEventKey, input.actor.actorType),
      canUndo: Boolean(input.canUndo),
      customerSafeOutput,
      payload: {
        ...(input.payload || {}),
        workflowResolution: {
          blocked: resolution.blocked,
          blockedReasons: resolution.blockedReasons
        },
        actionContract: this.actionContracts.forEvent(canonicalEventKey)?.action
      },
      occurredAt: new Date().toISOString()
    };

    await this.prisma.auditLog.create({
      data: {
        tenantId: event.tenantId,
        actorType: this.auditActor(event.actor.actorType),
        actorId: event.actor.actorId,
        actorName: event.actor.actorName,
        action: `operation.event.${event.eventKey}`,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason,
        after: event as unknown as Prisma.InputJsonValue
      }
    });

    const safeOutput = event.customerSafeOutput;
    const timelineCustomerId = safeOutput?.customerId || event.customerId;
    const timelineAssetId = safeOutput?.assetId || event.assetId;
    if (
      safeOutput
      && !event.payload?.customerTimelineAlreadyWritten
      && event.tenantId
      && timelineCustomerId
      && timelineAssetId
    ) {
      await this.prisma.customerTimelineEvent.create({
        data: {
          tenantId: event.tenantId,
          customerId: timelineCustomerId,
          assetId: timelineAssetId,
          workOrderId: safeOutput.workOrderId || event.workOrderId || null,
          visibility: TimelineVisibility.CUSTOMER_VISIBLE,
          title: safeOutput.title,
          message: safeOutput.message,
          source: safeOutput.source || event.eventKey
        }
      });
    }

    return event;
  }

  private statusChanges(changes?: OperationStatusChangeDto[]) {
    return (changes || []).filter((change) => change.entityId && change.entityType);
  }

  private targets(targets?: OperationNotificationTarget[]): OperationNotificationTarget[] {
    return [...new Set<OperationNotificationTarget>(targets || ["work_order_timeline"])];
  }

  private reportHooks(hooks?: OperationReportHookDto[]) {
    return (hooks || []).filter((hook) => hook.reportKey && hook.metric);
  }

  private auditActor(actorType: string) {
    if (actorType === "customer") return AuditActorType.CUSTOMER;
    if (actorType === "platform") return AuditActorType.PLATFORM;
    return AuditActorType.TENANT_STAFF;
  }
}
