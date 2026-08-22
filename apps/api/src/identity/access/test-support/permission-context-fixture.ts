import type { PermissionContext } from "../permission-context.service";

/**
 * An empty PermissionContext with overrides, so a layer spec states only
 * the data that layer actually reads. Layers are pure over this snapshot,
 * so a test needs no Prisma stub and no async.
 */
export function createContext(overrides: Partial<PermissionContext> = {}): PermissionContext {
  return {
    platformLocks: new Map(),
    planAllowedModules: [],
    planAllowedExports: [],
    capabilities: {},
    roleTemplate: new Map(),
    userOverrides: new Map(),
    configurationDeniedKeys: new Set(),
    activeDelegations: new Set(),
    ...overrides,
  };
}
