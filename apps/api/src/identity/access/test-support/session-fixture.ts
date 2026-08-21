import type { SessionContext } from "@mop/shared";

/** Not a *.spec.ts file on purpose -- a shared fixture, not a test suite. */
export function createSession(overrides: Partial<SessionContext> = {}): SessionContext {
  return {
    accountId: "account-1",
    accountType: "TENANT_STAFF",
    displayName: "Test Branch Manager",
    tenantId: "tenant-1",
    role: "BRANCH_MANAGER",
    staffUserId: "staff-1",
    branchScope: [],
    warehouseScope: [],
    categoryScope: [],
    teamScope: [],
    managedTechnicianIds: [],
    permissions: [],
    enabledModules: [],
    enabledFeatures: [],
    tenantStatus: "ACTIVE",
    landingPage: "branch-home",
    ...overrides,
  };
}
