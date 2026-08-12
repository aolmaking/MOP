import { Injectable } from "@nestjs/common";
import { DELEGATION_KEYS, type CapabilityProfile, type SessionContext } from "@mop/shared";
import { PrismaService } from "../database/prisma.service";
import { CapabilityResolutionService } from "../capabilities/capability-resolution.service";

/**
 * Everything the permission layers need, loaded once.
 *
 * Six of the layers used to issue their own query per `can()` call,
 * so resolving ten permission keys for one page cost sixty round-trips on
 * the hottest path in the system. This loads the same data once and hands
 * every layer an in-memory snapshot.
 *
 * What deliberately did NOT change: layer ordering, the `locked`
 * short-circuit, and deny-by-default. Only the data source moved. An
 * optimisation that quietly weakened the model would be worse than the
 * cost it saved.
 *
 * The rejected alternative was an optional snapshot with each layer
 * falling back to its own query when absent. Two code paths producing one
 * answer is the kind of duplication that rots -- and the unused path is
 * the one that stops being exercised and then stops being correct.
 */
export interface PermissionContext {
  /** `${role}:${permissionKey}` -> allowed, from platform role-permission locks. */
  readonly platformLocks: ReadonlyMap<string, boolean>;
  /** Empty means the plan imposes no module restriction. */
  readonly planAllowedModules: readonly string[];
  readonly capabilities: CapabilityProfile;
  /** permissionKey -> allowed, for this session's role. */
  readonly roleTemplate: ReadonlyMap<string, boolean>;
  /** permissionKey -> { allowed, reason }, for this specific person. */
  readonly userOverrides: ReadonlyMap<string, { allowed: boolean; reason: string | null }>;
  /** Permission keys this workshop's configuration denies for the session's role. */
  readonly configurationDeniedKeys: ReadonlySet<string>;
  /**
   * Delegation switches this owner has turned ON. Absence means off:
   * a delegation nobody has granted is not a delegation.
   */
  readonly activeDelegations: ReadonlySet<string>;
}

const EMPTY_CONTEXT: PermissionContext = {
  platformLocks: new Map(),
  planAllowedModules: [],
  capabilities: {},
  roleTemplate: new Map(),
  userOverrides: new Map(),
  configurationDeniedKeys: new Set(),
  activeDelegations: new Set(),
};

@Injectable()
export class PermissionContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly capabilities: CapabilityResolutionService,
  ) {}

  async load(session: SessionContext): Promise<PermissionContext> {
    // Platform and system sessions have no tenant-scoped configuration;
    // every layer that reads this context defers for them anyway.
    if (!session.tenantId) return EMPTY_CONTEXT;

    const [controlSettings, tenant, capabilities, roleRows, overrideRows, configuration] = await Promise.all([
      // Platform locks and owner delegations are both ControlSetting rows
      // for this tenant, so they load as ONE query and are partitioned by
      // type below. Two obvious queries would be a seventh round trip on
      // the hottest path in the system, and the point of this service is
      // that resolving twenty keys costs the same as resolving one.
      this.prisma.controlSetting.findMany({
        where: {
          tenantId: session.tenantId,
          active: true,
          OR: [
            { scope: "PLATFORM", type: "role_permission_lock" },
            // Keyed from the registry, so a stale row for a delegation
            // that no longer exists cannot grant anything.
            { scope: "TENANT", type: "delegation", key: { in: [...DELEGATION_KEYS] } },
          ],
        },
        select: { key: true, value: true, type: true },
      }),
      this.prisma.tenant.findUnique({
        where: { id: session.tenantId },
        select: { plan: { select: { allowedModules: true } } },
      }),
      this.capabilities.resolveCurrent(session.tenantId),
      // Role rows are only meaningful for tenant staff; a customer session
      // has no StaffRole to key them by.
      session.staffUserId
        ? this.prisma.rolePermission.findMany({
            where: { tenantId: session.tenantId, role: session.role as never },
            select: { permissionKey: true, allowed: true },
          })
        : Promise.resolve([]),
      session.staffUserId
        ? this.prisma.userPermissionOverride.findMany({
            where: { staffUserId: session.staffUserId },
            select: { permissionKey: true, allowed: true, reason: true },
          })
        : Promise.resolve([]),
      this.prisma.tenantConfiguration.findUnique({
        where: { tenantId: session.tenantId },
        select: { roleExperience: true },
      }),
    ]);

    const locks = controlSettings.filter((row) => row.type === "role_permission_lock");
    const delegations = controlSettings.filter((row) => row.type === "delegation");

    return {
      platformLocks: new Map(
        locks
          .map((row) => [row.key, (row.value as { allowed?: boolean })?.allowed] as const)
          .filter((entry): entry is readonly [string, boolean] => typeof entry[1] === "boolean"),
      ),
      planAllowedModules: tenant?.plan.allowedModules ?? [],
      capabilities,
      roleTemplate: new Map(roleRows.map((row) => [row.permissionKey, row.allowed])),
      userOverrides: new Map(
        overrideRows.map((row) => [row.permissionKey, { allowed: row.allowed, reason: row.reason }]),
      ),
      configurationDeniedKeys: new Set(deniedKeysForRole(configuration?.roleExperience, session.role)),
      // Only `true` counts. A row whose value is anything else -- absent,
      // null, a string left by a half-written migration -- is not a
      // decision the owner made, and must not read as one.
      activeDelegations: new Set(
        delegations.filter((row) => (row.value as { enabled?: boolean })?.enabled === true).map((row) => row.key),
      ),
    };
  }
}

/** Expected shape: `{ "<StaffRole>": { "deniedPermissionKeys": string[] } }`. */
function deniedKeysForRole(roleExperience: unknown, role: string): string[] {
  if (typeof roleExperience !== "object" || roleExperience === null) return [];

  const roleEntry = (roleExperience as Record<string, unknown>)[role];
  if (typeof roleEntry !== "object" || roleEntry === null) return [];

  const denied = (roleEntry as Record<string, unknown>).deniedPermissionKeys;
  if (!Array.isArray(denied)) return [];

  return denied.filter((item): item is string => typeof item === "string");
}
