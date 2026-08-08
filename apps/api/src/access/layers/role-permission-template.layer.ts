import { Injectable } from "@nestjs/common";
import type { EffectiveRole, SessionContext, StaffRole } from "@mop/shared";
import { PrismaService } from "../../database/prisma.service";
import type { LayerDecision, PermissionLayer } from "../types";

const TENANT_STAFF_ROLES: ReadonlySet<StaffRole> = new Set<StaffRole>([
  "TENANT_OWNER",
  "TENANT_ADMIN",
  "BRANCH_MANAGER",
  "TECHNICIAN",
  "INVENTORY_MANAGER",
  "TEAM_LEADER",
  "DATA_ANALYST",
]);

function isTenantStaffRole(role: EffectiveRole): role is StaffRole {
  return TENANT_STAFF_ROLES.has(role as StaffRole);
}

/**
 * Layer 7: the tenant's own effective permission set per role
 * (RolePermission), edited via Platform Super Admin's Permission Matrix
 * (Builder Control) rather than by the Owner directly, per the 2026-08-07
 * architecture amendment. Never locks: User Override (layer 8) must still
 * be able to grant or deny for one specific person on top of whatever the
 * role template says.
 */
@Injectable()
export class RolePermissionTemplateLayer implements PermissionLayer {
  readonly name = "RolePermissionTemplate";

  constructor(private readonly prisma: PrismaService) {}

  async evaluate(session: SessionContext, permissionKey: string): Promise<LayerDecision> {
    if (!session.tenantId || !isTenantStaffRole(session.role)) return null;

    const row = await this.prisma.rolePermission.findUnique({
      where: {
        tenantId_role_permissionKey: {
          tenantId: session.tenantId,
          role: session.role,
          permissionKey,
        },
      },
      select: { allowed: true },
    });
    if (!row) return null; // no tenant default set -- defer to User Override, then DEFAULT_DECISION

    return {
      allowed: row.allowed,
      locked: false,
      reason: row.allowed ? "Allowed by your role" : "Not allowed by your role",
    };
  }
}
