import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../runtime/database/prisma.service";

export interface TenantGroupSummary {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly memberCount: number;
}

export interface GroupWorkOrderSummary {
  readonly tenantId: string;
  readonly tenantName: string;
  readonly openWorkOrders: number;
}

/**
 * Phase 18.E -- a named, read-only aggregate view across several
 * tenants (a holding company's portfolio, a franchise's owned-vs-
 * licensed split). Deliberately summary-only: this service answers "how
 * is my portfolio doing," never "show me tenant X's row-level detail" --
 * that drill-down re-opens a separation-of-duties question named as a
 * Phase 19 concern in docs/phases/PHASE_18.md, not solved here.
 */
@Injectable()
export class TenantGroupService {
  constructor(private readonly prisma: PrismaService) {}

  async create(name: string, createdById: string, description?: string): Promise<TenantGroupSummary> {
    const created = await this.prisma.tenantGroup.create({ data: { name, description, createdById } });
    return { id: created.id, name: created.name, description: created.description, memberCount: 0 };
  }

  async addMember(tenantGroupId: string, tenantId: string): Promise<void> {
    const group = await this.prisma.tenantGroup.findUnique({ where: { id: tenantGroupId } });
    if (!group) throw new NotFoundException({ code: "group_not_found", message: "No such tenant group." });

    await this.prisma.tenantGroupMember.create({ data: { tenantGroupId, tenantId } });
  }

  /**
   * Open-work-order count per member tenant -- deliberately the one
   * number every workshop shape in this codebase already tracks
   * consistently (see OwnerHomeService's own `openWorkOrders`), rather
   * than inventing a new cross-tenant metric with no precedent.
   */
  async summary(tenantGroupId: string): Promise<readonly GroupWorkOrderSummary[]> {
    const members = await this.prisma.tenantGroupMember.findMany({
      where: { tenantGroupId },
      select: { tenant: { select: { id: true, name: true } } },
    });

    return Promise.all(
      members.map(async (member) => {
        const openWorkOrders = await this.prisma.workOrder.count({
          where: {
            tenantId: member.tenant.id,
            status: { notIn: ["CLOSED", "CANCELLED"] },
          },
        });
        return { tenantId: member.tenant.id, tenantName: member.tenant.name, openWorkOrders };
      }),
    );
  }
}
