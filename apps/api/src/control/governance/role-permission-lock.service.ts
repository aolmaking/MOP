import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../runtime/database/prisma.service";
import { AuditService } from "../../audit/audit.service";

export interface RoleLockSummary {
  readonly id: string;
  readonly tenantId: string;
  readonly role: string;
  readonly permissionKey: string;
  readonly allowed: boolean;
  readonly reason: string | null;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly active: boolean;
}

const LOCK_TYPE = "role_permission_lock";

/**
 * The missing writer for `role_permission_lock`.
 *
 * `PermissionContextService` and `PlatformControlLayer` (apps/api/src/identity/access/)
 * have read this ControlSetting shape since Phase 3 -- key
 * `${role}:${permissionKey}`, `value: { allowed: boolean }`, scope
 * `PLATFORM`, type `role_permission_lock`, filtered `active: true` -- but
 * nothing in the codebase ever wrote one. A lock silently had no way to
 * exist. This is that writer, and it writes exactly the shape the reader
 * already expects rather than inventing a second mechanism.
 *
 * One active row per (tenantId, role, permissionKey) is the invariant,
 * the same "close the old one, open a new one" discipline
 * `CapabilityChangeService.apply()` already uses for `TenantCapability`.
 * Rows are never deleted -- `tools/lint-no-hard-delete.mjs` enforces this
 * for `ControlSetting` specifically -- only deactivated, so the full lock
 * history stays a real, queryable audit trail on its own, in addition to
 * the AuditLog row every change also writes.
 */
@Injectable()
export class RolePermissionLockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async lock(
    tenantId: string,
    role: string,
    permissionKey: string,
    allowed: boolean,
    reason: string,
    actorId: string,
    actorName: string,
  ): Promise<RoleLockSummary> {
    const key = `${role}:${permissionKey}`;

    return this.prisma.$transaction(async (tx) => {
      const previous = await tx.controlSetting.findFirst({
        where: { tenantId, scope: "PLATFORM", type: LOCK_TYPE, key, active: true },
      });

      if (previous) {
        await tx.controlSetting.update({ where: { id: previous.id }, data: { active: false } });
      }

      const created = await tx.controlSetting.create({
        data: {
          scope: "PLATFORM",
          tenantId,
          key,
          type: LOCK_TYPE,
          value: { allowed },
          active: true,
          reason,
          createdBy: actorId,
        },
      });

      await this.audit.record(
        {
          tenantId,
          actorId,
          actorType: "PLATFORM",
          actorName,
          targetType: "ControlSetting",
          targetId: created.id,
          action: "governance.role_permission_lock.set",
          before: previous ? { allowed: (previous.value as { allowed?: boolean }).allowed } : null,
          after: { role, permissionKey, allowed },
          reason,
          riskLevel: "HIGH",
        },
        tx,
      );

      return this.toSummary(created, role, permissionKey);
    });
  }

  /**
   * Removes the platform's opinion entirely -- resolution falls through
   * to the tenant's own role template and user overrides, same as if no
   * lock had ever been set. Deactivates rather than deletes, same
   * discipline as `lock()`.
   */
  async unlock(
    tenantId: string,
    role: string,
    permissionKey: string,
    actorId: string,
    actorName: string,
    reason: string,
  ): Promise<void> {
    const key = `${role}:${permissionKey}`;

    await this.prisma.$transaction(async (tx) => {
      const previous = await tx.controlSetting.findFirst({
        where: { tenantId, scope: "PLATFORM", type: LOCK_TYPE, key, active: true },
      });
      if (!previous) {
        throw new NotFoundException({ code: "lock_not_found", message: "No active lock for that role and permission." });
      }

      await tx.controlSetting.update({ where: { id: previous.id }, data: { active: false } });

      await this.audit.record(
        {
          tenantId,
          actorId,
          actorType: "PLATFORM",
          actorName,
          targetType: "ControlSetting",
          targetId: previous.id,
          action: "governance.role_permission_lock.removed",
          before: { allowed: (previous.value as { allowed?: boolean }).allowed },
          after: null,
          reason,
          riskLevel: "HIGH",
        },
        tx,
      );
    });
  }

  async listActive(tenantId: string): Promise<readonly RoleLockSummary[]> {
    const rows = await this.prisma.controlSetting.findMany({
      where: { tenantId, scope: "PLATFORM", type: LOCK_TYPE, active: true },
      orderBy: { createdAt: "desc" },
    });

    return rows.map((row) => {
      const [role, ...rest] = row.key.split(":");
      return this.toSummary(row, role, rest.join(":"));
    });
  }

  /** Full history, active and superseded -- the append-only audit trail `lock()`/`unlock()` build. */
  async history(tenantId: string): Promise<readonly RoleLockSummary[]> {
    const rows = await this.prisma.controlSetting.findMany({
      where: { tenantId, scope: "PLATFORM", type: LOCK_TYPE },
      orderBy: { createdAt: "desc" },
    });

    return rows.map((row) => {
      const [role, ...rest] = row.key.split(":");
      return this.toSummary(row, role, rest.join(":"));
    });
  }

  private toSummary(
    row: { id: string; tenantId: string | null; value: unknown; reason: string | null; createdBy: string; createdAt: Date; active: boolean },
    role: string,
    permissionKey: string,
  ): RoleLockSummary {
    return {
      id: row.id,
      tenantId: row.tenantId as string,
      role,
      permissionKey,
      allowed: (row.value as { allowed?: boolean }).allowed === true,
      reason: row.reason,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
      active: row.active,
    };
  }
}
