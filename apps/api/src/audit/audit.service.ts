import { Injectable } from "@nestjs/common";
import { PrismaService } from "../runtime/database/prisma.service";
import { AuditActorType, AuditRiskLevel, Prisma } from "@mop/database";

export interface RecordAuditEntryInput {
  tenantId?: string | null;
  actorId: string;
  actorType: AuditActorType;
  actorName: string;
  targetType: string;
  targetId: string;
  action: string;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
  reason?: string | null;
  riskLevel: AuditRiskLevel;
}

/**
 * The only place in the codebase allowed to write to AuditLog -- enforced
 * by the lint rule in tools/lint-audit-boundary.mjs, not just by convention.
 * Every write goes through the same shape, so "which fields did we actually
 * capture" is never a question that depends on which module happened to
 * write the row.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordAuditEntryInput, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.auditLog.create({
      data: {
        tenantId: input.tenantId ?? null,
        actorId: input.actorId,
        actorType: input.actorType,
        actorName: input.actorName,
        targetType: input.targetType,
        targetId: input.targetId,
        action: input.action,
        before: input.before ?? Prisma.JsonNull,
        after: input.after ?? Prisma.JsonNull,
        reason: input.reason ?? null,
        riskLevel: input.riskLevel,
      },
    });
  }
}
