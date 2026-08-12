/**
 * Permissions that exist only because an owner handed them over.
 *
 * Most permissions answer "may this role do X". These answer something
 * else first: "has the owner chosen to let anyone but themselves do X at
 * all". Team management stayed with the owner in the 2026-08 
 * restructuring, and a branch manager may only touch it where the owner
 * has explicitly delegated -- which is not a capability (the platform
 * does not decide it) and not a role template (the owner decides it per
 * workshop, not per role).
 *
 * Derived from this registry, never from a hand-written list at each
 * check. A key absent here is not delegation-gated; a key present here
 * is denied outright until its switch is on, whatever the role template
 * or a user override says.
 *
 * The switch itself is a TENANT-scoped ControlSetting of type
 * "delegation", keyed by `delegationKey`.
 */
export interface DelegatedPermission {
  /** The permission a role may be granted once delegation is on. */
  readonly permissionKey: string;
  /** The owner's switch, stored as a ControlSetting key. */
  readonly delegationKey: string;
  /** Shown when the permission is denied for want of delegation. */
  readonly deniedReason: string;
}

export const DELEGATED_PERMISSIONS: readonly DelegatedPermission[] = [
  {
    permissionKey: "team_setup.branch.manage",
    delegationKey: "team_setup.delegate",
    deniedReason: "Team management has not been delegated by the workshop owner",
  },
];

const BY_PERMISSION = new Map(DELEGATED_PERMISSIONS.map((entry) => [entry.permissionKey, entry]));

export function delegationFor(permissionKey: string): DelegatedPermission | undefined {
  return BY_PERMISSION.get(permissionKey);
}

/** Every delegation switch an owner can throw. Off by default, all of them. */
export const DELEGATION_KEYS: readonly string[] = DELEGATED_PERMISSIONS.map((entry) => entry.delegationKey);
