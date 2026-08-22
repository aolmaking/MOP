import { BadRequestException, Injectable } from "@nestjs/common";
import type { SessionContext } from "@mop/shared";
import { PrismaService } from "../../runtime/database/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { EffectiveAccessService } from "../../identity/access/effective-access.service";
import {
  MONEY_HANDLER_PERMISSION_KEYS,
  MONEY_HANDLER_PERMISSION_LABELS,
  MONEY_HANDLER_ROLE_LABELS,
  MONEY_HANDLER_ROLES,
  type MoneyHandlerPermissionKey,
  type MoneyHandlerRole,
  isMoneyHandlerPermissionKey,
  isMoneyHandlerRole,
} from "./money-handling-permissions.constants";

export interface MoneyHandlingPermissionRoleView {
  readonly role: MoneyHandlerRole;
  readonly label: string;
  readonly allowed: boolean;
  readonly editable: boolean;
  readonly locked: boolean;
  readonly reason: string | null;
}

export interface MoneyHandlingPermissionView {
  readonly permissionKey: MoneyHandlerPermissionKey;
  readonly label: string;
  readonly roles: readonly MoneyHandlingPermissionRoleView[];
}

export interface MoneyHandlingPermissionsView {
  readonly permissions: readonly MoneyHandlingPermissionView[];
}

export interface MoneyHandlingPermissionActor {
  readonly accountId: string;
  readonly displayName: string;
}

@Injectable()
export class MoneyHandlingPermissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: EffectiveAccessService,
  ) {}

  async view(tenantId: string, session: SessionContext): Promise<MoneyHandlingPermissionsView> {
    const decisionsByRole = new Map<MoneyHandlerRole, Map<string, { allowed: boolean; locked: boolean; reason?: string }>>();

    await Promise.all(
      MONEY_HANDLER_ROLES.map(async (role) => {
        decisionsByRole.set(role, await this.access.checkMany(this.sessionForRole(session, tenantId, role), MONEY_HANDLER_PERMISSION_KEYS));
      }),
    );

    return {
      permissions: MONEY_HANDLER_PERMISSION_KEYS.map((permissionKey) => ({
        permissionKey,
        label: MONEY_HANDLER_PERMISSION_LABELS[permissionKey],
        roles: MONEY_HANDLER_ROLES.map((role) => {
          const decision = decisionsByRole.get(role)?.get(permissionKey);
          const locked = decision?.locked === true;
          return {
            role,
            label: MONEY_HANDLER_ROLE_LABELS[role],
            allowed: decision?.allowed === true,
            editable: !locked,
            locked,
            reason: locked ? decision?.reason ?? "Locked by a higher-level platform or plan rule" : null,
          };
        }),
      })),
    };
  }

  async set(
    tenantId: string,
    session: SessionContext,
    role: string,
    permissionKey: string,
    allowed: boolean,
    actor: MoneyHandlingPermissionActor,
  ): Promise<MoneyHandlingPermissionsView> {
    if (!isMoneyHandlerRole(role) || !isMoneyHandlerPermissionKey(permissionKey)) {
      throw new BadRequestException({
        code: "unsupported_money_permission",
        message: "That role or permission is not part of Owner money-handling delegation.",
      });
    }

    const decision = await this.access.check(this.sessionForRole(session, tenantId, role), permissionKey);
    if (decision.locked) {
      throw new BadRequestException({
        code: "permission_locked",
        message: decision.reason ?? "This permission is locked by a higher-level platform or plan rule.",
      });
    }

    await this.prisma.$transaction(async (tx) => {
      const before = await tx.rolePermission.findUnique({
        where: { tenantId_role_permissionKey: { tenantId, role, permissionKey } },
      });

      const updated = await tx.rolePermission.upsert({
        where: { tenantId_role_permissionKey: { tenantId, role, permissionKey } },
        create: {
          tenantId,
          role,
          permissionKey,
          allowed,
          source: "OWNER_OVERRIDE",
          updatedBy: actor.accountId,
        },
        update: {
          allowed,
          source: "OWNER_OVERRIDE",
          updatedBy: actor.accountId,
        },
      });

      await this.audit.record(
        {
          tenantId,
          actorId: actor.accountId,
          actorType: "TENANT_STAFF",
          actorName: actor.displayName,
          targetType: "RolePermission",
          targetId: updated.id,
          action: "finance.money_handling_permission.updated",
          before: before ? { role, permissionKey, allowed: before.allowed, source: before.source } : null,
          after: { role, permissionKey, allowed, source: "OWNER_OVERRIDE" },
          riskLevel: "HIGH",
        },
        tx,
      );
    });

    return this.view(tenantId, session);
  }

  private sessionForRole(session: SessionContext, tenantId: string, role: MoneyHandlerRole): SessionContext {
    return {
      ...session,
      accountId: `role-preview:${role}`,
      displayName: MONEY_HANDLER_ROLE_LABELS[role],
      tenantId,
      role,
      staffUserId: `role-preview:${role}`,
      branchScope: [],
      warehouseScope: [],
      categoryScope: [],
      teamScope: [],
      managedTechnicianIds: [],
      permissions: [],
      staffRestrictionStatus: undefined,
    };
  }
}
