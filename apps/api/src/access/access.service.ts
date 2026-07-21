import { ForbiddenException, Injectable } from "@nestjs/common";
import { routeCatalog } from "@mop/shared";
import type { RequestSessionContext } from "../tenancy/session-context";

@Injectable()
export class AccessService {
  can(permission: string, session: RequestSessionContext) {
    if (!session.permissions.includes(permission)) return false;
    if (session.readOnly && !this.readPermission(permission)) return false;
    return true;
  }

  assert(permission: string, session: RequestSessionContext) {
    if (!this.can(permission, session)) {
      const source = session.effectivePermissionSources[permission];
      const reason = session.readOnly && session.permissions.includes(permission)
        ? "Workspace is read-only."
        : source === "platform_control"
          ? "Action is locked by MOP Platform Admin."
          : `Missing permission: ${permission}`;
      throw new ForbiddenException(reason);
    }
  }

  checkPlatformControls(permission: string, session: RequestSessionContext) {
    const source = session.effectivePermissionSources[permission];
    if (source === "platform_control") {
      throw new ForbiddenException("Action is locked by MOP Platform Admin.");
    }
  }

  assertRoute(routeId: string, session: RequestSessionContext) {
    const route = routeCatalog.find((item) => item.id === routeId);
    if (!route) throw new ForbiddenException("Unknown route.");
    if (!(route.accountTypes as readonly string[]).includes(session.accountType)) {
      throw new ForbiddenException(`${session.accountType} cannot access ${routeId}.`);
    }
    this.assert(route.permission, session);
  }

  workOrderWhere(session: RequestSessionContext) {
    if (session.accountType === "customer") {
      return { tenantId: session.tenantId, customerId: session.customerId, customerVisible: true };
    }
    if (session.roleId === "tenant_owner" || session.roleId === "tenant_admin" || session.roleId === "data_analyst") {
      return { tenantId: session.tenantId };
    }
    if (session.roleId === "team_leader") {
      if (!session.managedTechnicianIds.length) return { tenantId: session.tenantId, id: "__deny_all__" };
      return {
        tenantId: session.tenantId,
        OR: [
          { assignments: { some: { staffUserId: { in: session.managedTechnicianIds } } } },
          { tasks: { some: { assignments: { some: { staffUserId: { in: session.managedTechnicianIds } } } } } }
        ]
      };
    }
    if (session.roleId === "technician") {
      return {
        tenantId: session.tenantId,
        OR: [
          { assignments: { some: { staffUserId: session.userId } } },
          { tasks: { some: { assignments: { some: { staffUserId: session.userId } } } } }
        ]
      };
    }
    if (session.branchScope.length) {
      return { tenantId: session.tenantId, branchId: { in: session.branchScope } };
    }
    return { tenantId: session.tenantId, id: "__deny_all__" };
  }

  customerWhere(session: RequestSessionContext) {
    if (session.roleId === "tenant_owner" || session.roleId === "tenant_admin" || session.roleId === "data_analyst") return { tenantId: session.tenantId };
    if (session.branchScope.length) return { tenantId: session.tenantId, branchId: { in: session.branchScope } };
    return { tenantId: session.tenantId, id: "__deny_all__" };
  }

  inventoryWhere(session: RequestSessionContext) {
    if (session.roleId === "tenant_owner" || session.roleId === "tenant_admin") return { tenantId: session.tenantId };
    if (session.warehouseScope.length) return { tenantId: session.tenantId, warehouseId: { in: session.warehouseScope } };
    return { tenantId: session.tenantId, id: "__deny_all__" };
  }

  decisionRequestWhere(session: RequestSessionContext) {
    if (session.accountType === "customer") {
      return {
        tenantId: session.tenantId,
        customerId: session.customerId,
        status: { notIn: ["DRAFT", "CANCELLED"] as any }
      };
    }
    if (session.roleId === "tenant_owner" || session.roleId === "tenant_admin") return { tenantId: session.tenantId };
    if (session.roleId === "branch_manager" && session.branchScope.length) {
      return { tenantId: session.tenantId, workOrder: { branchId: { in: session.branchScope } } };
    }
    if (session.roleId === "technician") {
      return {
        tenantId: session.tenantId,
        OR: [
          { createdByStaffUserId: session.userId },
          { task: { assignments: { some: { staffUserId: session.userId } } } },
          { workOrder: { assignments: { some: { staffUserId: session.userId } } } }
        ]
      };
    }
    if (session.roleId === "team_leader" && session.branchScope.length) {
      if (!session.managedTechnicianIds.length) return { tenantId: session.tenantId, id: "__deny_all__" };
      return {
        tenantId: session.tenantId,
        OR: [
          { task: { assignments: { some: { staffUserId: { in: session.managedTechnicianIds } } } } },
          { workOrder: { assignments: { some: { staffUserId: { in: session.managedTechnicianIds } } } } }
        ]
      };
    }
    return { tenantId: session.tenantId, id: "__deny_all__" };
  }

  assertBranchScope(session: RequestSessionContext, branchId?: string | null) {
    if (!branchId) throw new ForbiddenException("A branch context is required.");
    if (["tenant_owner", "tenant_admin"].includes(session.roleId)) return;
    if (!session.branchScope.includes(branchId)) throw new ForbiddenException("Record is outside the assigned branch scope.");
  }

  assertWarehouseScope(session: RequestSessionContext, warehouseId?: string | null) {
    if (!warehouseId) throw new ForbiddenException("A warehouse context is required.");
    if (["tenant_owner", "tenant_admin"].includes(session.roleId)) return;
    if (!session.warehouseScope.includes(warehouseId)) throw new ForbiddenException("Record is outside the assigned warehouse scope.");
  }

  private readPermission(permission: string) {
    return permission.startsWith("reports.")
      || permission.includes(".view")
      || permission.includes(".read")
      || permission.includes(".search")
      || permission.includes(".history")
      || permission.includes(".status")
      || permission.includes(".snapshot");
  }
}
