import type { SessionContextDto } from "../contracts";
import { inRecordScope } from "./scope-rules";

export interface PermissionCheckContext {
  permission: string;
  record?: {
    tenantId?: string;
    branchId?: string;
    warehouseId?: string;
    customerId?: string;
    category?: string;
  };
}

export function can(session: Pick<SessionContextDto, "permissions" | "workspace" | "tenantId" | "customerId">, context: PermissionCheckContext) {
  if (!session.permissions.includes(context.permission)) return false;
  const record = context.record;
  if (!record) return true;
  return inRecordScope(session as SessionContextDto, record);
}
