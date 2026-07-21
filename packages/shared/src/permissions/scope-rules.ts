import type { SessionContextDto } from "../contracts";

export interface ScopedRecord {
  tenantId?: string;
  branchId?: string;
  warehouseId?: string;
  customerId?: string;
  category?: string;
}

export function inTenantScope(session: SessionContextDto, record: ScopedRecord) {
  return !record.tenantId || !session.tenantId || record.tenantId === session.tenantId;
}

export function inBranchScope(session: SessionContextDto, record: ScopedRecord) {
  return !record.branchId || !session.workspace.branchIds.length || session.workspace.branchIds.includes(record.branchId);
}

export function inWarehouseScope(session: SessionContextDto, record: ScopedRecord) {
  return !record.warehouseId || !session.workspace.warehouseIds.length || session.workspace.warehouseIds.includes(record.warehouseId);
}

export function inCustomerScope(session: SessionContextDto, record: ScopedRecord) {
  return !session.customerId || !record.customerId || session.customerId === record.customerId;
}

export function inCategoryScope(session: SessionContextDto, record: ScopedRecord) {
  return !record.category || !session.workspace.categoryScope.length || session.workspace.categoryScope.includes(record.category as any);
}

export function inRecordScope(session: SessionContextDto, record: ScopedRecord) {
  return inTenantScope(session, record) && inBranchScope(session, record) && inWarehouseScope(session, record) && inCustomerScope(session, record) && inCategoryScope(session, record);
}
