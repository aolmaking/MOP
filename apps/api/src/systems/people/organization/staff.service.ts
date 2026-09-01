import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import type { StaffRole } from "@mop/shared";
import { PrismaService } from "../../../runtime/database/prisma.service";
import { AuditService } from "../../../audit/audit.service";
import { PlanLimitsService } from "../../../control/platform/plan-limits.service";
import { sha256 } from "../../../identity/auth/token.util";

export interface StaffActor {
  readonly accountId: string;
  readonly displayName: string;
}

export interface StaffListItem {
  readonly id: string;
  readonly fullName: string;
  readonly role: StaffRole;
  readonly branchScope: string[];
  readonly warehouseScope: string[];
  readonly categoryScope: string[];
  readonly isActive: boolean;
  readonly lockedAt: string | null;
  readonly email: string | null;
  readonly accountStatus: string;
}

export interface StaffPage {
  readonly items: StaffListItem[];
  readonly nextCursor: string | null;
}

export interface InviteStaffInput {
  readonly fullName: string;
  readonly email: string;
  readonly phone: string;
  readonly role: StaffRole;
  readonly branchScope?: string[];
  readonly warehouseScope?: string[];
  readonly categoryScope?: string[];
}

const ROLES_NEEDING_BRANCH: ReadonlySet<StaffRole> = new Set(["BRANCH_MANAGER"]);
const ROLES_NEEDING_WAREHOUSE: ReadonlySet<StaffRole> = new Set(["INVENTORY_MANAGER"]);

/**
 * Organization & Access -- Staff tab (docs/detailed-specs/tenant-owner.md).
 *
 * "This is the first page that has to work -- nothing else in the
 * product is usable for a given workshop until staff exist." Every model
 * this reads/writes (StaffUser, Account, Branch, Warehouse) already
 * existed in the schema; nothing in this product surfaced them to an
 * Owner.
 *
 * Deactivate/Lock write to *both* Account.status (what AuthService.login
 * actually enforces) and the StaffUser mirror fields (isActive/lockedAt,
 * what assignment pickers filter on) in one transaction -- the two were
 * already separate columns in the schema and neither read the other, so
 * this service is what keeps them in sync rather than the schema
 * silently assuming a single source of truth.
 */
@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly planLimits: PlanLimitsService,
  ) {}

  async list(tenantId: string, cursor?: string, take = 25): Promise<StaffPage> {
    const rows = await this.prisma.staffUser.findMany({
      where: { tenantId },
      orderBy: { id: "asc" },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { account: { select: { email: true, status: true } } },
    });

    const page = rows.slice(0, take);
    return {
      items: page.map((row) => ({
        id: row.id,
        fullName: row.fullName,
        role: row.role as StaffRole,
        branchScope: row.branchScope,
        warehouseScope: row.warehouseScope,
        categoryScope: row.categoryScope,
        isActive: row.isActive,
        lockedAt: row.lockedAt ? row.lockedAt.toISOString() : null,
        email: row.account.email,
        accountStatus: row.account.status,
      })),
      nextCursor: rows.length > take ? page[page.length - 1]!.id : null,
    };
  }

  async invite(tenantId: string, input: InviteStaffInput, actor: StaffActor): Promise<{ staffId: string; invitePath: string }> {
    if (ROLES_NEEDING_BRANCH.has(input.role) && (!input.branchScope || input.branchScope.length === 0)) {
      throw new BadRequestException({
        code: "branch_scope_required",
        message: "Branch Manager requires at least one branch.",
      });
    }
    if (ROLES_NEEDING_WAREHOUSE.has(input.role) && (!input.warehouseScope || input.warehouseScope.length === 0)) {
      throw new BadRequestException({
        code: "warehouse_scope_required",
        message: "Inventory Manager requires at least one warehouse.",
      });
    }

    const existing = await this.prisma.account.findFirst({
      where: { tenantId, email: input.email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException({ code: "email_taken", message: "That email is already used at this workshop." });
    }

    await this.planLimits.assertUserCapacity(tenantId);

    const rawInviteToken = randomBytes(32).toString("hex");

    const staffId = await this.prisma.$transaction(async (tx) => {
      const account = await tx.account.create({
        data: {
          accountType: "TENANT_STAFF",
          tenantId,
          email: input.email,
          phone: input.phone,
          passwordHash: null,
          status: "INVITED",
          inviteTokenHash: sha256(rawInviteToken),
          inviteTokenExpiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        },
      });

      const staff = await tx.staffUser.create({
        data: {
          accountId: account.id,
          tenantId,
          fullName: input.fullName,
          role: input.role,
          branchScope: input.branchScope ?? [],
          warehouseScope: input.warehouseScope ?? [],
          categoryScope: (input.categoryScope ?? []) as never,
        },
      });

      await this.audit.record(
        {
          tenantId,
          actorId: actor.accountId,
          actorType: "TENANT_STAFF",
          actorName: actor.displayName,
          targetType: "StaffUser",
          targetId: staff.id,
          action: "staff.invited",
          after: { fullName: input.fullName, role: input.role },
          riskLevel: "MEDIUM",
        },
        tx,
      );

      return staff.id;
    });

    return { staffId, invitePath: `/invite/accept?token=${rawInviteToken}` };
  }

  async regenerateInviteLink(tenantId: string, staffId: string, actor: StaffActor): Promise<{ invitePath: string }> {
    const staff = await this.findOwned(tenantId, staffId);
    const account = await this.prisma.account.findUnique({ where: { id: staff.accountId }, select: { status: true } });
    if (!account || account.status !== "INVITED") {
      throw new BadRequestException({ code: "not_invited", message: "That staff member is not awaiting an invite." });
    }
    const rawInviteToken = randomBytes(32).toString("hex");
    await this.prisma.$transaction(async (tx) => {
      await tx.account.update({
        where: { id: staff.accountId },
        data: { inviteTokenHash: sha256(rawInviteToken), inviteTokenExpiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) },
      });
      await this.audit.record(
        {
          tenantId,
          actorId: actor.accountId,
          actorType: "TENANT_STAFF",
          actorName: actor.displayName,
          targetType: "StaffUser",
          targetId: staffId,
          action: "staff.invite_regenerated",
          riskLevel: "MEDIUM",
        },
        tx,
      );
    });
    return { invitePath: `/invite/accept?token=${rawInviteToken}` };
  }

  async updateScope(
    tenantId: string,
    staffId: string,
    scope: { branchScope?: string[]; warehouseScope?: string[]; categoryScope?: string[] },
    actor: StaffActor,
  ): Promise<void> {
    const staff = await this.findOwned(tenantId, staffId);

    await this.prisma.$transaction(async (tx) => {
      await tx.staffUser.update({
        where: { id: staffId },
        data: {
          ...(scope.branchScope ? { branchScope: scope.branchScope } : {}),
          ...(scope.warehouseScope ? { warehouseScope: scope.warehouseScope } : {}),
          ...(scope.categoryScope ? { categoryScope: scope.categoryScope as never } : {}),
        },
      });

      await this.audit.record(
        {
          tenantId,
          actorId: actor.accountId,
          actorType: "TENANT_STAFF",
          actorName: actor.displayName,
          targetType: "StaffUser",
          targetId: staffId,
          action: "staff.scope_updated",
          before: { branchScope: staff.branchScope, warehouseScope: staff.warehouseScope, categoryScope: staff.categoryScope },
          after: scope,
          riskLevel: "MEDIUM",
        },
        tx,
      );
    });
  }

  async setActive(tenantId: string, staffId: string, isActive: boolean, actor: StaffActor): Promise<void> {
    const staff = await this.findOwned(tenantId, staffId);
    if (staff.isActive === isActive) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.staffUser.update({ where: { id: staffId }, data: { isActive } });
      await tx.account.update({
        where: { id: staff.accountId },
        data: { status: isActive ? "ACTIVE" : "INACTIVE" },
      });

      await this.audit.record(
        {
          tenantId,
          actorId: actor.accountId,
          actorType: "TENANT_STAFF",
          actorName: actor.displayName,
          targetType: "StaffUser",
          targetId: staffId,
          action: isActive ? "staff.activated" : "staff.deactivated",
          before: { isActive: staff.isActive },
          after: { isActive },
          riskLevel: "MEDIUM",
        },
        tx,
      );
    });
  }

  async setLocked(tenantId: string, staffId: string, locked: boolean, actor: StaffActor): Promise<void> {
    const staff = await this.findOwned(tenantId, staffId);
    const alreadyLocked = staff.lockedAt !== null;
    if (alreadyLocked === locked) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.staffUser.update({ where: { id: staffId }, data: { lockedAt: locked ? new Date() : null } });
      await tx.account.update({
        where: { id: staff.accountId },
        data: { status: locked ? "LOCKED" : "ACTIVE", lockedUntil: null },
      });

      await this.audit.record(
        {
          tenantId,
          actorId: actor.accountId,
          actorType: "TENANT_STAFF",
          actorName: actor.displayName,
          targetType: "StaffUser",
          targetId: staffId,
          action: locked ? "staff.locked" : "staff.unlocked",
          before: { lockedAt: staff.lockedAt },
          after: { locked },
          // A suspected-compromised-account lock is a security event, not
          // routine staffing -- HIGH, unlike activate/deactivate.
          riskLevel: "HIGH",
        },
        tx,
      );
    });
  }

  private async findOwned(tenantId: string, staffId: string) {
    const staff = await this.prisma.staffUser.findFirst({ where: { id: staffId, tenantId } });
    if (!staff) {
      throw new NotFoundException({ code: "staff_not_found", message: "That staff member was not found." });
    }
    return staff;
  }
}
