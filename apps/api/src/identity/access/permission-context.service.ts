import { Injectable } from "@nestjs/common";
import { Prisma } from "@mop/database";
import { DELEGATION_KEYS, type CapabilityProfile, type SessionContext } from "@mop/shared";
import { PrismaService } from "../../runtime/database/prisma.service";
import { CapabilityResolutionService } from "../../control/capabilities/capability-resolution.service";

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
  /** Empty means exports are not included in the plan. */
  readonly planAllowedExports: readonly string[];
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
  planAllowedExports: [],
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

    // Phase 20.B -- these five reads used to run as independent
    // `Promise.all` queries, each against whatever was committed at the
    // instant IT ran. A capability change or plan reassignment
    // committing between two of those reads meant this one context
    // could combine pre-change and post-change data into one
    // internally-inconsistent snapshot -- exactly the race
    // docs/phases/PHASE_20.md's 20.B names. `REPEATABLE READ` gives the
    // whole transaction one consistent snapshot as of its first query,
    // so every read below sees the same "before" or the same "after",
    // never a mix.
    return this.prisma.$transaction(
      (tx) => this.loadWithin(tx, session),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  private async loadWithin(tx: Prisma.TransactionClient, session: SessionContext): Promise<PermissionContext> {
    const tenantId = session.tenantId!;

    const [controlSettings, tenant, capabilities, roleRows, overrideRows, configuration] = await Promise.all([
      // Platform locks and owner delegations are both ControlSetting rows
      // for this tenant, so they load as ONE query and are partitioned by
      // type below. Two obvious queries would be a seventh round trip on
      // the hottest path in the system, and the point of this service is
      // that resolving twenty keys costs the same as resolving one.
      tx.controlSetting.findMany({
        where: {
          tenantId,
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
      tx.tenant.findUnique({
        where: { id: tenantId },
        select: { plan: { select: { allowedModules: true, allowedExports: true } } },
      }),
      this.capabilities.resolveCurrent(tenantId, tx),
      // Role rows are only meaningful for tenant staff; a customer session
      // has no StaffRole to key them by.
      session.staffUserId
        ? tx.rolePermission.findMany({
            where: { tenantId, role: session.role as never },
            select: { permissionKey: true, allowed: true },
          })
        : Promise.resolve([]),
      session.staffUserId
        ? tx.userPermissionOverride.findMany({
            where: { staffUserId: session.staffUserId },
            select: { permissionKey: true, allowed: true, reason: true },
          })
        : Promise.resolve([]),
      tx.tenantConfiguration.findUnique({
        where: { tenantId },
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
      planAllowedExports: tenant?.plan.allowedExports ?? [],
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
