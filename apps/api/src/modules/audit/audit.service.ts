import { Injectable } from "@nestjs/common";
import type { AuditLogDto } from "@mop/shared";
import { PrismaService } from "../../database/prisma.service";
import type { RequestSessionContext } from "../../tenancy/session-context";

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async list(session: RequestSessionContext): Promise<AuditLogDto[]> {
    const rows = await this.prisma.auditLog.findMany({
      where: session.accountType === "platform" ? {} : { tenantId: session.tenantId },
      orderBy: { createdAt: "desc" },
      take: 100
    });
    return rows.map((row) => ({
      id: row.id,
      actorName: row.actorName,
      actorType: row.actorType.toLowerCase() as any,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId || undefined,
      reason: row.reason || undefined,
      at: row.createdAt.toISOString()
    }));
  }
}
