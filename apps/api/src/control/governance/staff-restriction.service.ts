import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../runtime/database/prisma.service";
import { AuditService } from "../../audit/audit.service";

export interface RestrictionSummary {
  readonly staffUserId: string;
  readonly restrictionStatus: "NONE" | "RESTRICTED_PENDING_INVESTIGATION";
  readonly restrictedAt: string | null;
  readonly restrictedReason: string | null;
}

/**
 * Phase 19.D -- the narrower lever Workshop 5 scenario 24 found missing:
 * curtailing one account under investigation without the platform-wide
 * tenant freeze, and without declaring guilt. `restrict()`/`lift()` only
 * set the status; `StaffRestrictionLayer` (apps/api/src/access/layers/)
 * is what actually enforces it on every request.
 *
 * Every call writes an independently-witnessed, HIGH-risk audit row --
 * this is exactly the kind of action the audit-boundary discipline
 * exists for, so it goes through AuditService rather than a direct
 * Prisma write.
 */
@Injectable()
export class StaffRestrictionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async restrict(
    tenantId: string,
    staffUserId: string,
    reason: string,
    actorId: string,
    actorName: string,
  ): Promise<RestrictionSummary> {
    const staff = await this.prisma.staffUser.findUnique({ where: { id: staffUserId } });
    if (!staff) throw new NotFoundException({ code: "staff_not_found", message: "No such staff member." });

    if (staff.restrictionStatus === "RESTRICTED_PENDING_INVESTIGATION") {
      throw new BadRequestException({ code: "already_restricted", message: "This account is already restricted." });
    }

    const now = new Date();
    const updated = await this.prisma.staffUser.update({
      where: { id: staffUserId },
      data: { restrictionStatus: "RESTRICTED_PENDING_INVESTIGATION", restrictedAt: now, restrictedReason: reason },
    });

    await this.audit.record({
      tenantId,
      actorId,
      actorType: "TENANT_STAFF",
      actorName,
      targetType: "StaffUser",
      targetId: staffUserId,
      action: "governance.staff.restricted",
      after: { restrictionStatus: "RESTRICTED_PENDING_INVESTIGATION", reason },
      reason,
      riskLevel: "HIGH",
    });

    return this.toSummary(updated);
  }

  async lift(tenantId: string, staffUserId: string, actorId: string, actorName: string): Promise<RestrictionSummary> {
    const staff = await this.prisma.staffUser.findUnique({ where: { id: staffUserId } });
    if (!staff) throw new NotFoundException({ code: "staff_not_found", message: "No such staff member." });

    if (staff.restrictionStatus !== "RESTRICTED_PENDING_INVESTIGATION") {
      throw new BadRequestException({ code: "not_restricted", message: "This account is not currently restricted." });
    }

    const updated = await this.prisma.staffUser.update({
      where: { id: staffUserId },
      data: { restrictionStatus: "NONE", restrictedAt: null, restrictedReason: null },
    });

    await this.audit.record({
      tenantId,
      actorId,
      actorType: "TENANT_STAFF",
      actorName,
      targetType: "StaffUser",
      targetId: staffUserId,
      action: "governance.staff.restriction_lifted",
      after: { restrictionStatus: "NONE" },
      riskLevel: "HIGH",
    });

    return this.toSummary(updated);
  }

  private toSummary(staff: {
    id: string;
    restrictionStatus: string;
    restrictedAt: Date | null;
    restrictedReason: string | null;
  }): RestrictionSummary {
    return {
      staffUserId: staff.id,
      restrictionStatus: staff.restrictionStatus as RestrictionSummary["restrictionStatus"],
      restrictedAt: staff.restrictedAt?.toISOString() ?? null,
      restrictedReason: staff.restrictedReason,
    };
  }
}
