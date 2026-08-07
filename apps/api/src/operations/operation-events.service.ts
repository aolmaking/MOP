import { Injectable } from "@nestjs/common";
import { AuditActorType, AuditRiskLevel, Prisma } from "@mop/database";
import { PrismaService } from "../database/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CustomerSafeProjectionService } from "./customer-safe-projection.service";

export interface CustomerProjectionInput {
  customerId: string;
  workOrderId?: string;
  suppliedText?: string;
}

export interface EmitOperationEventInput {
  tenantId: string;
  eventKey: string;
  payload: Record<string, unknown>;
  actorId: string;
  actorType: AuditActorType;
  actorName: string;
  targetType: string;
  targetId: string;
  riskLevel: AuditRiskLevel;
  reason?: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  /** Present only when this event should also produce a customer-facing timeline entry. */
  customer?: CustomerProjectionInput;
}

/**
 * The single fan-out point for every significant action: an OperationEvent
 * row (replay/debug), an AuditLog row (via AuditService -- never written
 * directly here), and, when `customer` is provided, a CustomerTimelineEvent
 * produced through CustomerSafeProjectionService rather than raw text.
 *
 * Runs inside the caller's own transaction when one is passed, so a state
 * change and its audit/event/customer-projection side effects can never
 * diverge (one succeeding, the other silently failing) -- if the caller is
 * already inside `prisma.$transaction`, pass that `tx` through here.
 */
@Injectable()
export class OperationEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly customerSafeProjection: CustomerSafeProjectionService,
  ) {}

  async emit(input: EmitOperationEventInput, tx?: Prisma.TransactionClient): Promise<void> {
    if (tx) {
      await this.run(input, tx);
      return;
    }
    await this.prisma.$transaction((scoped) => this.run(input, scoped));
  }

  private async run(input: EmitOperationEventInput, tx: Prisma.TransactionClient): Promise<void> {
    await tx.operationEvent.create({
      data: {
        tenantId: input.tenantId,
        eventKey: input.eventKey,
        payload: input.payload as Prisma.InputJsonValue,
        actorId: input.actorId,
        actorType: input.actorType,
      },
    });

    await this.audit.record(
      {
        tenantId: input.tenantId,
        actorId: input.actorId,
        actorType: input.actorType,
        actorName: input.actorName,
        targetType: input.targetType,
        targetId: input.targetId,
        action: input.eventKey,
        before: input.before,
        after: input.after,
        reason: input.reason,
        riskLevel: input.riskLevel,
      },
      tx,
    );

    if (input.customer) {
      const message = this.customerSafeProjection.project(input.eventKey, input.customer.suppliedText);
      await tx.customerTimelineEvent.create({
        data: {
          tenantId: input.tenantId,
          workOrderId: input.customer.workOrderId,
          customerId: input.customer.customerId,
          message,
          eventKey: input.eventKey,
        },
      });
    }
  }
}
