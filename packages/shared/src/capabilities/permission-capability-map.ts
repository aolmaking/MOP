import { moduleForPermissionKey, type ModuleKey } from "../permissions/permission-manifest";
import type { CapabilityKey } from "./types";

/**
 * Which capability governs a given permission.
 *
 * This is what lets the resolver enforce the model's central rule:
 *
 *   A permission can never resurrect a disabled capability.
 *
 * Granting a technician `inventory.request.issue` in a workshop that has
 * no inventory must still deny -- the workshop's business model does not
 * include the function, so no amount of permission can create it.
 *
 * Most of the mapping is module-level, because MOP's modules and its
 * structural capabilities line up. A few keys are finer-grained: returns
 * are separately removable from inventory as a whole, so a workshop can
 * issue parts without accepting them back.
 *
 * `null` means the key is CORE -- governed by no capability and therefore
 * never deniable at this layer. Work orders, audit and organisation
 * management are core: a workshop with none of them is not a workshop.
 */

const CAPABILITY_BY_MODULE: Readonly<Record<ModuleKey, CapabilityKey | null>> = {
  PLATFORM: null,
  ORGANIZATION: null,
  OPERATIONS: null,
  AUDIT: null,
  REPORTS: null,
  INVENTORY: "INVENTORY",
  TEAM_MANAGEMENT: "TEAMS",
  FINANCE: "FINANCE_CORE",
  CUSTOMER_PORTAL: "CUSTOMER_PORTAL",
};

/**
 * Overrides for keys whose governing capability is narrower than their
 * module. Checked before the module mapping.
 */
const CAPABILITY_BY_PERMISSION_KEY: Readonly<Record<string, CapabilityKey>> = {
  // Returns are removable on their own: a workshop may issue parts from
  // stock and still refuse to take them back.
  "inventory.stock.return.accept": "PART_RETURNS",
  "inventory.stock.return.reject": "PART_RETURNS",
  // Supervision belongs to team review, which is removable independently
  // of teams existing at all.
  "team.supervision_note.create": "TEAM_REVIEW",
};

/**
 * Returns the capability governing `permissionKey`, or `null` when the key
 * is core or unregistered.
 *
 * Unregistered keys deliberately return `null` rather than a guess. A
 * wrong guess here would deny a legitimate action for a reason nobody
 * could trace; the permission manifest is where an unknown key should be
 * caught, not this map.
 */
export function capabilityForPermissionKey(permissionKey: string): CapabilityKey | null {
  const direct = CAPABILITY_BY_PERMISSION_KEY[permissionKey];
  if (direct) return direct;

  const module = moduleForPermissionKey(permissionKey);
  if (!module) return null;

  return CAPABILITY_BY_MODULE[module];
}

export { CAPABILITY_BY_MODULE, CAPABILITY_BY_PERMISSION_KEY };
