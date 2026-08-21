import { Injectable } from "@nestjs/common";
import type { Prisma } from "@mop/database";
import type { CapabilityKey, CapabilityProfile, CapabilityStatus } from "@mop/shared";
import { CAPABILITY_KEYS } from "@mop/shared";
import { PrismaService } from "../../runtime/database/prisma.service";

/**
 * Turns stored `TenantCapability` rows into the `CapabilityProfile` the
 * pure engine in @mop/shared understands.
 *
 * Two reads, deliberately distinct:
 *
 *   resolveCurrent(tenantId)         -- what the workshop is now
 *   resolveAsOf(tenantId, when)      -- what it was at a point in time
 *
 * The second is not a convenience. A work order created in 2026 while
 * Inventory was disabled has no part requests; read under today's
 * capabilities it looks corrupt -- missing stock movements, an incomplete
 * part lifecycle -- when in fact parts were handled externally and the
 * record is correct. Any screen showing historical work must resolve the
 * capabilities that applied when it happened.
 */
@Injectable()
export class CapabilityResolutionService {
  constructor(private readonly prisma: PrismaService) {}

  /** The tenant's shape right now. Capabilities with no row default to ENABLED. */
  async resolveCurrent(tenantId: string, tx?: Prisma.TransactionClient): Promise<CapabilityProfile> {
    const client = tx ?? this.prisma;
    const rows = await client.tenantCapability.findMany({
      where: { tenantId, effectiveTo: null },
      select: { capabilityKey: true, status: true },
    });

    return this.toProfile(rows);
  }

  /**
   * The tenant's shape at `when`. A row applies if it started at or before
   * that moment and had not yet been superseded.
   */
  async resolveAsOf(tenantId: string, when: Date): Promise<CapabilityProfile> {
    const rows = await this.prisma.tenantCapability.findMany({
      where: {
        tenantId,
        effectiveFrom: { lte: when },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: when } }],
      },
      select: { capabilityKey: true, status: true },
    });

    return this.toProfile(rows);
  }

  /**
   * Capabilities the platform has locked, which the Owner may not change.
   * Read separately from the profile because it answers a different
   * question -- "may this be edited" rather than "is this on".
   */
  async lockedCapabilities(tenantId: string): Promise<readonly CapabilityKey[]> {
    const rows = await this.prisma.tenantCapability.findMany({
      where: { tenantId, effectiveTo: null, lockedByPlatform: true },
      select: { capabilityKey: true },
    });

    return rows.map((row) => row.capabilityKey).filter(isCapabilityKey);
  }

  /**
   * Absent rows mean ENABLED: a profile records deviations from the full
   * product, matching the engine's own convention. A freshly-created
   * workshop with no capability rows is therefore a complete workshop,
   * which is the safe default -- the alternative, defaulting to disabled,
   * would silently strip a tenant whose provisioning half-failed.
   *
   * An unrecognised stored key is skipped rather than trusted. Keys are
   * strings in the database (the enum lives in code, where the behaviour
   * is), so a row can outlive the capability it names after a rename.
   */
  private toProfile(rows: Array<{ capabilityKey: string; status: CapabilityStatus }>): CapabilityProfile {
    const profile: Partial<Record<CapabilityKey, CapabilityStatus>> = {};

    for (const row of rows) {
      if (!isCapabilityKey(row.capabilityKey)) continue;
      profile[row.capabilityKey] = row.status;
    }

    return profile;
  }
}

const KNOWN_CAPABILITIES = new Set<string>(CAPABILITY_KEYS);

function isCapabilityKey(key: string): key is CapabilityKey {
  return KNOWN_CAPABILITIES.has(key);
}
