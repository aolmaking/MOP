import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../runtime/database/prisma.service";

export interface StakeholderSummary {
  readonly id: string;
  readonly accountId: string;
  readonly label: string;
  readonly permissions: readonly string[];
  readonly branchScope: readonly string[];
  readonly grantedAt: string;
  readonly revokedAt: string | null;
  readonly isActive: boolean;
}

/**
 * Phase 18.A -- a person with a legitimate, ongoing need to see part of
 * a tenant without being its employee: an investor, a franchisor, a
 * parent company.
 *
 * Deliberately independent of StaffUser and the closed StaffRole enum.
 * `permissions` is a small, explicit list of narrow view-only keys
 * chosen at grant time, not a role borrowed from the staff permission
 * system -- a stakeholder that needs more than a handful of narrow
 * permissions is a sign they should become a real StaffUser, not a
 * sign this list should grow to look like one.
 */
@Injectable()
export class TenantStakeholderService {
  constructor(private readonly prisma: PrismaService) {}

  async grant(
    tenantId: string,
    accountId: string,
    label: string,
    permissions: readonly string[],
    grantedById: string,
    branchScope: readonly string[] = [],
  ): Promise<StakeholderSummary> {
    const created = await this.prisma.tenantStakeholder.create({
      data: { tenantId, accountId, label, permissions: [...permissions], branchScope: [...branchScope], grantedById },
    });
    return this.toSummary(created);
  }

  async revoke(stakeholderId: string): Promise<StakeholderSummary> {
    const existing = await this.prisma.tenantStakeholder.findUnique({ where: { id: stakeholderId } });
    if (!existing) throw new NotFoundException({ code: "stakeholder_not_found", message: "No such stakeholder grant." });

    const updated = await this.prisma.tenantStakeholder.update({
      where: { id: stakeholderId },
      data: { revokedAt: new Date() },
    });
    return this.toSummary(updated);
  }

  async listFor(tenantId: string): Promise<readonly StakeholderSummary[]> {
    const rows = await this.prisma.tenantStakeholder.findMany({
      where: { tenantId },
      orderBy: { grantedAt: "desc" },
    });
    return rows.map((row) => this.toSummary(row));
  }

  /** What one account can see, across every tenant it holds a live grant in -- never a role, only a permission list. */
  async activeGrantsFor(accountId: string): Promise<readonly StakeholderSummary[]> {
    const rows = await this.prisma.tenantStakeholder.findMany({
      where: { accountId, revokedAt: null },
      orderBy: { grantedAt: "desc" },
    });
    return rows.map((row) => this.toSummary(row));
  }

  private toSummary(row: {
    id: string;
    accountId: string;
    label: string;
    permissions: string[];
    branchScope: string[];
    grantedAt: Date;
    revokedAt: Date | null;
  }): StakeholderSummary {
    return {
      id: row.id,
      accountId: row.accountId,
      label: row.label,
      permissions: row.permissions,
      branchScope: row.branchScope,
      grantedAt: row.grantedAt.toISOString(),
      revokedAt: row.revokedAt?.toISOString() ?? null,
      isActive: row.revokedAt === null,
    };
  }
}
