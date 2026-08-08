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
 * Resolved fresh on every request by AuthService.resolveContextForAccount
 * (SessionGuard calls it per-request; never trust a client-cached copy).
 *
 * `permissions` is deliberately left empty for now, not a TODO stub: this
 * was originally planned as "every permission key this session has,"
 * populated once EffectiveAccessService existed (Phase 1 step 6). Having
 * now built that service, eagerly running every registered permission key
 * through an up-to-8-query-each resolver on every session check would be
 * real, wasteful, wrong-shaped work, not a shortcut -- fine-grained action
 * permissions are checked on demand, server-side, via
 * EffectiveAccessService.can() at the specific endpoint that needs the
 * answer. The likely real use for this field is coarser: which page IDs
 * this role can see at all (RolePage-driven), for nav-gating -- deferred
 * until Phase 2+ defines a real page-ID taxonomy to populate it from.
 */
export interface SessionContext {
  accountId: string;
  accountType: AccountType;
  /** Human-readable "who is this" -- staff full name, customer full name, or the platform account's email. Used anywhere a person needs to be shown/recorded (audit actorName, UI headers), so it's resolved once here rather than re-queried per use site. */
  displayName: string;
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
