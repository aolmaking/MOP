export type AccountType = "PLATFORM" | "TENANT_STAFF" | "CUSTOMER" | "SYSTEM_AUTOMATION";

export type StaffRole =
  | "TENANT_OWNER"
  | "TENANT_ADMIN"
  | "BRANCH_MANAGER"
  | "TECHNICIAN"
  | "INVENTORY_MANAGER"
  | "TEAM_LEADER"
  | "DATA_ANALYST";

export type EffectiveRole = StaffRole | "PLATFORM_SUPER_ADMIN" | "CUSTOMER";

/**
 * Resolved once at login (and on every /auth/me call) by
 * AuthService.buildSessionContext. `permissions` is populated by
 * EffectiveAccessService (Phase 1 step 6) -- this shape exists before that
 * service does so every later step builds against a stable contract rather
 * than widening it piecemeal.
 */
export interface SessionContext {
  accountId: string;
  accountType: AccountType;
  tenantId: string | null;
  role: EffectiveRole;
  staffUserId?: string;
  customerId?: string;
  branchScope: string[];
  warehouseScope: string[];
  categoryScope: string[];
  teamScope: string[];
  managedTechnicianIds: string[];
  permissions: string[];
  enabledModules: string[];
  enabledFeatures: string[];
  tenantStatus: string | null;
  landingPage: string;
}
