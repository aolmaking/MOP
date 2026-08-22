import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { WORK_ORDER_GRAPH } from "@mop/shared";
import type { WorkOrderStatus } from "@mop/database";
import { PrismaService } from "../../../runtime/database/prisma.service";
import { AuditService } from "../../../audit/audit.service";
import { TenantEntitlementsService } from "../../../control/entitlements/tenant-entitlements.service";

export interface OrgActor {
  readonly accountId: string;
  readonly displayName: string;
}

export interface BranchListItem {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly city: string | null;
  readonly warehouseCount: number;
  readonly staffCount: number;
  readonly isActive: boolean;
}

export interface WarehouseListItem {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly linkedBranches: readonly { id: string; name: string }[];
  readonly isActive: boolean;
}

export interface OrganizationInfrastructure {
  readonly branches: readonly BranchListItem[];
  readonly warehouses: readonly WarehouseListItem[];
  /** [branchId, warehouseId] pairs -- the matrix's checked cells. */
  readonly links: readonly { branchId: string; warehouseId: string }[];
}

const NON_TERMINAL_WORK_ORDER_STATUSES = WORK_ORDER_GRAPH.states.filter(
  (state) => !WORK_ORDER_GRAPH.terminal.includes(state),
) as WorkOrderStatus[];

/**
 * Organization & Access -- Branches, Warehouses, and the branch/warehouse
 * link matrix (docs/detailed-specs/tenant-owner.md). Warehouse
 * deactivation itself is not re-implemented here -- `WarehouseService`
 * (built for H7/P-32) already owns that decision (`BLOCK_UNTIL_ZERO`);
 * this service only adds the Owner-facing list/create/link surface
 * around the models that decision already governs.
 */
@Injectable()
export class BranchWarehouseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly entitlements: TenantEntitlementsService,
  ) {}

  async page(tenantId: string): Promise<OrganizationInfrastructure> {
    const [branches, warehouses, links] = await Promise.all([
      this.prisma.branch.findMany({
        where: { tenantId },
        orderBy: { name: "asc" },
        include: {
          _count: { select: { warehouseAccess: true } },
        },
      }),
      this.prisma.warehouse.findMany({
        where: { tenantId },
        orderBy: { name: "asc" },
        include: { branchAccess: { include: { branch: { select: { id: true, name: true } } } } },
      }),
      this.prisma.branchWarehouseAccess.findMany({ where: { tenantId }, select: { branchId: true, warehouseId: true } }),
    ]);

    const staffCounts = await this.prisma.staffUser.findMany({
      where: { tenantId },
      select: { branchScope: true },
    });
    const staffCountByBranch = new Map<string, number>();
    for (const staff of staffCounts) {
      for (const branchId of staff.branchScope) {
        staffCountByBranch.set(branchId, (staffCountByBranch.get(branchId) ?? 0) + 1);
      }
    }

    return {
      branches: branches.map((b) => ({
        id: b.id,
        name: b.name,
        code: b.code,
        city: b.city,
        warehouseCount: b._count.warehouseAccess,
        staffCount: staffCountByBranch.get(b.id) ?? 0,
        isActive: b.isActive,
      })),
      warehouses: warehouses.map((w) => ({
        id: w.id,
        name: w.name,
        code: w.code,
        linkedBranches: w.branchAccess.map((a) => ({ id: a.branch.id, name: a.branch.name })),
        isActive: w.isActive,
      })),
      links: links.map((l) => ({ branchId: l.branchId, warehouseId: l.warehouseId })),
    };
  }

  async createBranch(
    tenantId: string,
    input: { name: string; code?: string; address?: string; city?: string },
    actor: OrgActor,
  ): Promise<{ id: string }> {
    const name = input.name.trim();
    if (!name) throw new BadRequestException({ code: "name_required", message: "A branch needs a name." });

    const code = (input.code?.trim() || this.suggestCode(name)).toUpperCase();

    const branch = await this.prisma.$transaction(async (tx) => {
      await this.entitlements.assertCanAddBranch(tenantId, tx);

      const clash = await tx.branch.findFirst({ where: { tenantId, code }, select: { id: true } });
      if (clash) {
        throw new ConflictException({ code: "branch_code_taken", message: "That branch code is already in use." });
      }

      const created = await tx.branch.create({
        data: { tenantId, name, code, address: input.address ?? null, city: input.city ?? null },
      });

      await this.audit.record(
        {
          tenantId,
          actorId: actor.accountId,
          actorType: "TENANT_STAFF",
          actorName: actor.displayName,
          targetType: "Branch",
          targetId: created.id,
          action: "branch.created",
          after: { name, code },
          riskLevel: "MEDIUM",
        },
        tx,
      );

      return created;
    });

    return { id: branch.id };
  }

  /**
   * "A branch cannot be deactivated while it has active WorkOrder rows
   * in a non-terminal status" -- same floor pattern as
   * WarehouseService.deactivate's stock check, reusing WORK_ORDER_GRAPH's
   * own terminal-state list rather than a second hardcoded copy of it.
   */
  async setBranchActive(tenantId: string, branchId: string, isActive: boolean, actor: OrgActor): Promise<void> {
    const branch = await this.prisma.branch.findFirst({ where: { id: branchId, tenantId } });
    if (!branch) throw new NotFoundException({ code: "branch_not_found", message: "That branch was not found." });
    if (branch.isActive === isActive) return;

    if (!isActive) {
      const openCount = await this.prisma.workOrder.count({
        where: { tenantId, branchId, status: { in: [...NON_TERMINAL_WORK_ORDER_STATUSES] } },
      });
      if (openCount > 0) {
        throw new ConflictException({
          code: "branch_has_open_work_orders",
          message: `This branch still has ${openCount} open work order(s). Close them before deactivating.`,
        });
      }
    }

    await this.prisma.$transaction(async (tx) => {
      if (isActive) {
        await this.entitlements.assertCanAddBranch(tenantId, tx);
      }

      await tx.branch.update({ where: { id: branchId }, data: { isActive } });

      await this.audit.record(
        {
          tenantId,
          actorId: actor.accountId,
          actorType: "TENANT_STAFF",
          actorName: actor.displayName,
          targetType: "Branch",
          targetId: branchId,
          action: isActive ? "branch.activated" : "branch.deactivated",
          before: { isActive: branch.isActive },
          after: { isActive },
          riskLevel: "HIGH",
        },
        tx,
      );
    });
  }

  async createWarehouse(tenantId: string, input: { name: string; code?: string }, actor: OrgActor): Promise<{ id: string }> {
    const name = input.name.trim();
    if (!name) throw new BadRequestException({ code: "name_required", message: "A warehouse needs a name." });

    const code = (input.code?.trim() || this.suggestCode(name)).toUpperCase();
    const warehouse = await this.prisma.$transaction(async (tx) => {
      await this.entitlements.assertCanAddWarehouse(tenantId, tx);

      const clash = await tx.warehouse.findFirst({ where: { tenantId, code }, select: { id: true } });
      if (clash) {
        throw new ConflictException({ code: "warehouse_code_taken", message: "That warehouse code is already in use." });
      }

      const created = await tx.warehouse.create({ data: { tenantId, name, code } });

      await this.audit.record(
        {
          tenantId,
          actorId: actor.accountId,
          actorType: "TENANT_STAFF",
          actorName: actor.displayName,
          targetType: "Warehouse",
          targetId: created.id,
          action: "warehouse.created",
          after: { name, code },
          riskLevel: "MEDIUM",
        },
        tx,
      );

      return created;
    });

    return { id: warehouse.id };
  }

  /** Populates BranchWarehouseAccess -- the matrix's checked/unchecked cells. */
  async setLink(tenantId: string, branchId: string, warehouseId: string, linked: boolean, actor: OrgActor): Promise<void> {
    const [branch, warehouse] = await Promise.all([
      this.prisma.branch.findFirst({ where: { id: branchId, tenantId }, select: { id: true } }),
      this.prisma.warehouse.findFirst({ where: { id: warehouseId, tenantId }, select: { id: true } }),
    ]);
    if (!branch) throw new NotFoundException({ code: "branch_not_found", message: "That branch was not found." });
    if (!warehouse) throw new NotFoundException({ code: "warehouse_not_found", message: "That warehouse was not found." });

    if (linked) {
      await this.prisma.branchWarehouseAccess.upsert({
        where: { branchId_warehouseId: { branchId, warehouseId } },
        create: { tenantId, branchId, warehouseId },
        update: {},
      });
    } else {
      await this.prisma.branchWarehouseAccess.deleteMany({ where: { tenantId, branchId, warehouseId } });
    }

    await this.audit.record({
      tenantId,
      actorId: actor.accountId,
      actorType: "TENANT_STAFF",
      actorName: actor.displayName,
      targetType: "BranchWarehouseAccess",
      targetId: `${branchId}:${warehouseId}`,
      action: linked ? "branch_warehouse.linked" : "branch_warehouse.unlinked",
      after: { branchId, warehouseId, linked },
      riskLevel: "LOW",
    });
  }

  private suggestCode(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 20);
  }
}
